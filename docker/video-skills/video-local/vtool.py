"""vtool - kit de edicion de video LMTM. Todo corre local (FFmpeg, Whisper de HyperFrames, OpenCV): cero tokens.

Uso:  vtool <comando> <archivo> [opciones]      (vtool <comando> -h para ver opciones)
Los resultados quedan al lado del original con "__" en el nombre. Nunca pisa el original.

Esta es la copia del contenedor de LMTM-OS (Productor de contenido). Difiere del kit de las PC (1.3) en que
transcribe con `hyperframes transcribe` (o lee la transcripcion de video_transcribir con --palabras) en vez de
faster-whisper, y no trae `silencios --xml` (auto-editor es para editores de escritorio).
"""
import argparse
import difflib
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unicodedata
from pathlib import Path

VERSION = "1.4-lmtm-os"
VIDEO_EXT = {".mp4", ".mov", ".mkv", ".m4v", ".avi", ".webm"}
IMAGEN_EXT = {".jpg", ".jpeg", ".png", ".webp"}
FORMATOS = {"9:16": (1080, 1920), "1:1": (1080, 1080), "4:5": (1080, 1350), "16:9": (1920, 1080)}
ANCHO_SUBS = {"9:16": 18, "4:5": 24, "1:1": 24, "16:9": 36}  # caracteres por linea en el reel
H264 = ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
        "-movflags", "+faststart"]
# En el contenedor `hyperframes` esta instalado global (Node 22); en otra maquina se baja con npx.
HYPERFRAMES = [shutil.which("hyperframes")] if shutil.which("hyperframes") else [shutil.which("npx") or "npx", "-y", "hyperframes"]
DESTINOS = {
    # -fpsmax: respeta 25/30/50/60 fps del original (pasar 50 a 30 hace saltos) y solo baja lo que pase de 60
    "reels":    ["-fpsmax", "60", "-crf", "20", "-preset", "medium", "-maxrate", "10M", "-bufsize", "20M"],
    "tiktok":   ["-fpsmax", "60", "-crf", "20", "-preset", "medium", "-maxrate", "10M", "-bufsize", "20M"],
    "youtube":  ["-crf", "18", "-preset", "slow"],
    "whatsapp": ["-vf", "scale='min(720,iw)':-2", "-crf", "28", "-preset", "medium", "-b:a", "96k"],
    "preview":  ["-vf", "scale=-2:'min(540,ih)'", "-crf", "30", "-preset", "veryfast", "-b:a", "96k"],
}


# ---------- utilidades ----------

def salida(entrada, sufijo, ext=None):
    p = Path(entrada)
    return p.with_name(f"{p.stem}__{sufijo}{ext or p.suffix}")


def ffmpeg(*args, cwd=None):
    r = subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *map(str, args)],
                       cwd=cwd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if r.returncode:
        sys.exit("ERROR ffmpeg: " + r.stderr.strip()[-600:])
    return r


def sondear(video):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_format", "-show_streams", "-of", "json", str(video)],
                       capture_output=True, text=True, encoding="utf-8", errors="replace")
    if r.returncode:
        sys.exit(f"ERROR: no se puede leer {video}")
    return json.loads(r.stdout)


def duracion(video):
    return float(sondear(video)["format"]["duration"])


def stream_video(video):
    return next((s for s in sondear(video)["streams"] if s["codec_type"] == "video"), {})


def rotacion(stream):
    for sd in stream.get("side_data_list", []):
        if "rotation" in sd:
            return int(sd["rotation"]) % 360
    return int(stream.get("tags", {}).get("rotate", 0)) % 360


def medidas(video):
    """Ancho y alto como se VE el video (con la rotacion aplicada)."""
    v = stream_video(video)
    w, h = v.get("width", 0), v.get("height", 0)
    return (h, w) if rotacion(v) in (90, 270) else (w, h)


def fps_de(video):
    n, d = stream_video(video).get("avg_frame_rate", "30/1").split("/")
    return min(60, round(int(n) / max(int(d), 1))) or 30


def seg(t):
    """'1:05' / '00:01:05.5' / '65' -> segundos."""
    s = 0.0
    for parte in t.strip().split(":"):
        s = s * 60 + float(parte.replace(",", "."))
    return s


def hms(s):
    s = max(0.0, s)
    return f"{int(s // 60)}:{s % 60:04.1f}"


def ok(archivo, extra=""):
    print(f"OK -> {Path(archivo).name}" + (f"  ({extra})" if extra else ""))


def videos_de(carpeta):
    return sorted(p for p in Path(carpeta).iterdir() if p.suffix.lower() in VIDEO_EXT and "__" not in p.stem)


# ---------- cortes y tomas (logica pura, testeada en autotest) ----------

def unir_tramos(tramos):
    """Ordena y fusiona tramos [(ini, fin)] que se pisan."""
    res = []
    for a, b in sorted(tramos):
        if res and a <= res[-1][1]:
            res[-1] = (res[-1][0], max(res[-1][1], b))
        else:
            res.append((a, b))
    return res


def restar_tramos(tramos, quitar):
    """Saca de los tramos los intervalos de `quitar` (por ejemplo, una frase que se repitio)."""
    res = list(tramos)
    for qa, qb in quitar:
        nuevo = []
        for a, b in res:
            if qb <= a or qa >= b:
                nuevo.append((a, b))
                continue
            if a < qa:
                nuevo.append((a, qa))
            if qb < b:
                nuevo.append((qb, b))
        res = nuevo
    return [(a, b) for a, b in res if b - a > 0.05]


def tramos_sin_silencios(silencios, dur, margen):
    """Silencios [(ini, fin)] -> tramos con sonido, con `margen` de aire a cada lado."""
    tramos, t = [], 0.0
    for a, b in silencios:
        if a > t:
            tramos.append((max(0.0, t - margen), min(dur, a + margen)))
        t = max(t, b)
    if dur - t > 0.05:
        tramos.append((max(0.0, t - margen), dur))
    return unir_tramos(tramos)


ANTES, DESPUES = 0.12, 0.25  # aire antes y despues de cada frase (Whisper marca las palabras un poco justas)


def tramos_de_palabras(palabras, pausa, dur):
    """Agrupa palabras separadas por menos de `pausa` s; las pausas mas largas se cortan."""
    grupos = []
    for w in palabras:
        if grupos and w[0] - grupos[-1][-1][1] <= pausa:
            grupos[-1].append(w)
        else:
            grupos.append([w])
    return unir_tramos([(max(0.0, g[0][0] - ANTES), min(dur, g[-1][1] + DESPUES)) for g in grupos])


def sin_tildes(texto):
    t = unicodedata.normalize("NFD", texto.lower())
    return re.sub(r"[^\w\s]", "", "".join(c for c in t if unicodedata.category(c) != "Mn"))


INSULTOS = re.compile(r"\b(boludo|boluda|pelotudo|pelotuda|concha|puta|puto|mierda|carajo|forro|verga|joder|hdp)\b")
RODAJE = re.compile(r"\b(de vuelta|otra vez|otra toma|desde el principio|corta|corten|cortala|grabando|"
                    r"me equivoque|perdon|vamos de nuevo|abrime|dejame|"
                    # indicaciones de direccion (crudo C9864 de RENO: "mas pausa", "entramos aca... vas a caminar")
                    r"pausa|entramos|caminar|camina|caminas|lo muevo|a camara)\b")
# lo que se dice entre toma y toma; al principio o al final de una toma no es parte del texto
MULETILLAS = {"ok", "okey", "okay", "pausa", "accion", "corte", "dale", "listo", "grabando"}


def sin_muletillas(bloque):
    """"ok, pausa. Deberian pensar..." -> "Deberian pensar...": saca las muletillas de rodaje de las puntas."""
    i, j = 0, len(bloque)
    while i < j and sin_tildes(bloque[i][2]).strip() in MULETILLAS:
        i += 1
    while j > i and sin_tildes(bloque[j - 1][2]).strip() in MULETILLAS:
        j -= 1
    return bloque[i:j]


def _tokens(palabras):
    return sin_tildes(" ".join(w[2] for w in palabras)).split()


def _parecido(a, b):
    return difflib.SequenceMatcher(None, a, b).ratio()


def armar_tomas(palabras, pausa=1.2):
    """Separa el crudo en tomas (bloques de habla con pausas largas entre si) y marca las de rodaje:
    insultos, indicaciones al equipo ("de vuelta", "abrime"), tomas que se rehacen enseguida
    (empiezan igual que una de las 3 siguientes, completas o cortadas a la mitad) y palabras sueltas."""
    crudos = []
    for w in palabras:
        if crudos and w[0] - crudos[-1][-1][1] <= pausa:
            crudos[-1].append(w)
        else:
            crudos.append([w])
    bloques = [sin_muletillas(b) or b for b in crudos]  # si es todo muletilla, queda entera y sale como rodaje
    toks = [_tokens(b) for b in bloques]
    tomas = []
    for i, b in enumerate(bloques):
        texto = " ".join(w[2] for w in b)
        norm = " ".join(toks[i])
        marcas = [m for m, rx in (("insulto", INSULTOS), ("rodaje", RODAJE)) if rx.search(norm)]
        if not sin_muletillas(b) and "rodaje" not in marcas:
            marcas.append("rodaje")
        elif len(toks[i]) < 2:
            marcas.append("suelta")
        a = toks[i]
        for c in toks[i + 1:i + 4]:
            if len(a) >= 3 and _parecido(a[:4], c[:4]) >= 0.7 and (
                    _parecido(a, c) >= 0.5 or (len(a) < len(c) and _parecido(a, c[:len(a) + 2]) >= 0.7)):
                marcas.append("repetida")
                break
        tomas.append({"n": i + 1, "palabras": b, "texto": texto, "marcas": marcas})
    return tomas


def limpiar_repeticiones(palabras):
    """Frases reempezadas dentro de una toma ("esta casa... esta casa tiene tres", "vos abrime, vos abrime"):
    deja la ultima version. Devuelve (palabras que quedan, intervalos de tiempo a sacar)."""
    t = [sin_tildes(w[2]).strip() for w in palabras]
    fuera, i = set(), 0
    while i < len(t):
        salto = None
        for n, alcance in ((3, 12), (2, 0)):  # 3 palabras dentro de 12; 2 palabras solo si se repiten pegadas
            frase = t[i:i + n]
            if len(frase) < n or min(map(len, frase)) < (3 if n == 2 else 1):
                continue
            salto = next((j for j in range(min(len(t) - n, i + n + alcance), i + n - 1, -1) if t[j:j + n] == frase),
                         None)
            if salto:
                break
        if salto:
            fuera.update(range(i, salto))
            i = salto
        else:
            i += 1
    quitar, run = [], []
    for k in sorted(fuera):
        if run and k == run[-1] + 1:
            run.append(k)
        else:
            if run:
                quitar.append((palabras[run[0]][0], palabras[run[-1]][1]))
            run = [k]
    if run:
        quitar.append((palabras[run[0]][0], palabras[run[-1]][1]))
    return [w for k, w in enumerate(palabras) if k not in fuera], quitar


def elegir_por_guion(lineas, tomas):
    """Para cada linea del guion, la toma que mas se le parece (sin insultos ni rodaje).
    Entre las que estan casi empatadas gana la ultima grabada: suele ser la buena."""
    res = []
    for linea in lineas:
        objetivo = sin_tildes(linea).split()
        puntos = [(_parecido(objetivo, sin_tildes(t["texto"]).split()), i) for i, (_, t) in enumerate(tomas)
                  if "insulto" not in t["marcas"] and "rodaje" not in t["marcas"]]
        buenos = [p for p in puntos if p[0] >= 0.5]
        if not buenos:
            res.append(None)
            continue
        mejor = max(p[0] for p in buenos)
        res.append(tomas[max(i for r, i in buenos if r >= mejor - 0.1)])
    return res


# ---------- subtitulos (logica pura, testeada en autotest) ----------

def srt_tiempo(s):
    ms = round(s * 1000)
    h, ms = divmod(ms, 3_600_000)
    m, ms = divmod(ms, 60_000)
    sec, ms = divmod(ms, 1000)
    return f"{h:02}:{m:02}:{sec:02},{ms:03}"


def partir_lineas(texto, ancho=42):
    if len(texto) <= ancho:
        return texto
    palabras = texto.split()
    mejor = min(range(1, len(palabras)),
                key=lambda i: abs(len(" ".join(palabras[:i])) - len(" ".join(palabras[i:]))))
    return " ".join(palabras[:mejor]) + "\n" + " ".join(palabras[mejor:])


def armar_grupos(palabras, ancho=42, max_dur=3.5, pausa=0.7):
    """palabras: [(inicio, fin, texto)] -> grupos de palabras que entran en un subtitulo de <=2 lineas."""
    grupos, cur = [], []
    for w in palabras:
        if cur:
            texto = " ".join(x[2] for x in cur)
            if (len(texto) + 1 + len(w[2]) > ancho * 2 or w[0] - cur[-1][1] > pausa or w[1] - cur[0][0] > max_dur
                    or (texto[-1] in ".?!" and len(texto) >= 20) or (texto[-1] == "," and len(texto) >= 30)):
                grupos.append(cur)
                cur = []
        cur.append(w)
    if cur:
        grupos.append(cur)
    return grupos


def armar_cues(palabras, ancho=42, max_dur=3.5, pausa=0.7):
    """palabras: [(inicio, fin, texto)] -> [(inicio, fin, texto en <=2 lineas)]"""
    return [(g[0][0], g[-1][1], partir_lineas(" ".join(w[2] for w in g), ancho))
            for g in armar_grupos(palabras, ancho, max_dur, pausa)]


def escribir_srt(cues, destino):
    bloques = [f"{i}\n{srt_tiempo(a)} --> {srt_tiempo(b)}\n{t}\n" for i, (a, b, t) in enumerate(cues, 1)]
    Path(destino).write_text("\n".join(bloques), encoding="utf-8")


def ass_color(hexa):
    h = hexa.lstrip("#")
    if not re.fullmatch(r"[0-9a-fA-F]{6}", h):
        sys.exit(f"ERROR: color {hexa} invalido, usar #RRGGBB")
    return f"&H00{h[4:6]}{h[2:4]}{h[0:2]}&".upper()


def ass_tiempo(s):
    cs = round(max(0.0, s) * 100)
    h, cs = divmod(cs, 360000)
    m, cs = divmod(cs, 6000)
    sec, cs = divmod(cs, 100)
    return f"{h}:{m:02}:{sec:02}.{cs:02}"


def tam_letra(w, h):
    return round(min(w / 15, h / 20))


def escribir_ass(palabras, destino, w, h, ancho, estilo, color, fuente, posicion, gancho, dur):
    """Subtitulos palabra por palabra: la palabra que se esta diciendo se pinta del color de la marca.
    Abajo quedan arriba del 35% inferior (lo tapan la descripcion y los botones de Reels/TikTok)."""
    tam = tam_letra(w, h)
    caja = estilo == "caja"
    margen, alin = (round(h * 0.35), 2) if posicion == "abajo" else (round(h * 0.24), 8)
    estilo_sub = (f"Sub,{fuente},{tam},&H00FFFFFF,&H00FFFFFF,&H00000000,&H99000000,-1,0,0,0,100,100,0,0,"
                  f"{3 if caja else 1},{round(tam * (0.22 if caja else 0.09))},0,{alin},60,60,{margen},1")
    estilo_gancho = (f"Gancho,{fuente},{round(tam * 1.3)},&H00FFFFFF,&H00FFFFFF,&H00000000,&H99000000,-1,0,0,0,"
                     f"100,100,0,0,3,{round(tam * 0.25)},0,8,60,60,{round(h * 0.14)},1")
    activo, blanco = "{\\c" + ass_color(color) + "}", "{\\c&H00FFFFFF&}"
    eventos = []
    for g in armar_grupos(palabras, ancho):
        limpio = [re.sub(r"[{}\\]", "", x[2]) for x in g]
        n1 = len(partir_lineas(" ".join(limpio), ancho).split("\n")[0].split())

        def linea(k):
            ps = [activo + p + blanco if i == k else p for i, p in enumerate(limpio)]
            return " ".join(ps[:n1]) + ("\\N" + " ".join(ps[n1:]) if n1 < len(ps) else "")
        if estilo == "simple":
            eventos.append((g[0][0], g[-1][1], "Sub", linea(-1)))
        else:
            for k in range(len(g)):
                eventos.append((g[k][0] if k else g[0][0], g[k + 1][0] if k + 1 < len(g) else g[-1][1], "Sub", linea(k)))
    if gancho:
        eventos.append((0.0, min(3.0, dur), "Gancho", "{\\fad(150,300)}" + re.sub(r"[{}\\]", "", gancho)))
    Path(destino).write_text(
        "[Script Info]\nScriptType: v4.00+\nPlayResX: %d\nPlayResY: %d\nWrapStyle: 2\nScaledBorderAndShadow: yes\n\n"
        "[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, "
        "Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, "
        "MarginL, MarginR, MarginV, Encoding\nStyle: %s\nStyle: %s\n\n[Events]\n"
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n" % (w, h, estilo_sub, estilo_gancho)
        + "".join(f"Dialogue: 0,{ass_tiempo(a)},{ass_tiempo(b)},{s},,0,0,0,,{t}\n" for a, b, s, t in eventos),
        encoding="utf-8")


def silencios_de(video, umbral, minimo):
    """Silencios [(ini, fin)] del audio. Los que estan separados por menos de 0,1 s son uno solo (un golpe no es voz)."""
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(video), "-vn", "-af",
                        f"silencedetect=n={umbral}dB:d={minimo}", "-f", "null", "-"],
                       capture_output=True, text=True, encoding="utf-8", errors="replace")
    ini = [float(x) for x in re.findall(r"silence_start: (-?[\d.]+)", r.stderr)]
    fin = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", r.stderr)] + [duracion(video)]  # el ultimo puede no cerrar
    res = []
    for a, b in zip(ini, fin):
        if res and a - res[-1][1] < 0.1:
            res[-1] = (res[-1][0], b)
        else:
            res.append((max(0.0, a), b))
    return res


def ajustar_a_silencios(palabras, silencios):
    """whisper.cpp (el de hyperframes) estira cada palabra sobre la pausa que sigue: sin huecos entre palabras no se
    ven las tomas ni las pausas (crudo C9864 de RENO, 30/10). Cada palabra queda en su primer tramo con voz; si cae
    entera en un silencio, va al final de ese silencio, donde vuelve la voz."""
    res = []
    for a, b, t in palabras:
        dentro = next((y for x, y in silencios if x <= a and b <= y), None)
        if dentro is not None:
            a = b = dentro
        else:
            con_voz = restar_tramos([(a, b)], silencios)
            if con_voz:
                a, b = con_voz[0]
        res.append((a, b, t))
    return res


def palabras_de(video, a):
    """Transcripcion (o la de --palabras) con los bordes de cada palabra en los silencios reales del audio."""
    palabras, idioma = transcribir(video, a.idioma, a.modelo, getattr(a, "palabras", None))
    return ajustar_a_silencios(palabras, silencios_de(video, a.umbral, 0.3)), idioma


def leer_palabras(archivo):
    """[(inicio, fin, texto)] de una transcripcion ya hecha: la de video_transcribir (<archivo>.words.json, formato
    OpenAI {"words": [{"word", "start", "end"}]}) o la de hyperframes transcribe ([{"text", "start", "end"}])."""
    d = json.loads(Path(archivo).read_text(encoding="utf-8"))
    lista = (d.get("words") or []) if isinstance(d, dict) else d
    res = []
    for w in lista:
        texto = str(w.get("word") or w.get("text") or "").strip()
        if texto:
            res.append((float(w["start"]), float(w["end"]), texto))
    return res


def transcribir(video, idioma, modelo, palabras=None):
    """Palabras con sus tiempos. Con `palabras` (un .words.json) no transcribe: lee ese archivo.
    Si no, Whisper de HyperFrames y queda en cache: `tomas` y `reel` usan la misma transcripcion (misma numeracion)."""
    if palabras:
        return leer_palabras(palabras), idioma
    if modelo.endswith(".en") and idioma != "en":
        sys.exit("ERROR: los modelos .en traducen al ingles. Usa small, medium o large-v3.")
    st = Path(video).stat()
    clave = hashlib.sha1(f"{Path(video).resolve()}|{st.st_size}|{st.st_mtime}|{idioma}|{modelo}".encode()).hexdigest()
    cache = Path(tempfile.gettempdir(), "vtool-cache", clave + ".json")
    if cache.exists():
        d = json.loads(cache.read_text(encoding="utf-8"))
        return [tuple(w) for w in d["palabras"]], d["idioma"]
    print(f"Transcribiendo {Path(video).name} con whisper {modelo} (la primera vez baja el modelo)...")
    with tempfile.TemporaryDirectory() as tmp:
        # solo el audio: hyperframes con un crudo 4K de 1 GB lo decodificaria entero
        ffmpeg("-i", Path(video).resolve(), "-vn", "-ac", "1", "-ar", "16000", Path(tmp, "audio.wav"))
        r = subprocess.run([*HYPERFRAMES, "transcribe", str(Path(tmp, "audio.wav")), "--model", modelo, "--dir", tmp,
                            *([] if idioma == "auto" else ["--language", idioma])],
                           capture_output=True, text=True, encoding="utf-8", errors="replace",
                           env={**os.environ, "HYPERFRAMES_NO_TELEMETRY": "1"})
        destino = Path(tmp, "transcript.json")
        if r.returncode or not destino.exists():
            sys.exit("ERROR hyperframes transcribe: " + (r.stderr or r.stdout).strip()[-600:])
        palabras = leer_palabras(destino)
    cache.parent.mkdir(exist_ok=True)
    cache.write_text(json.dumps({"palabras": palabras, "idioma": idioma}), encoding="utf-8")
    return palabras, idioma


# ---------- render ----------

def cadena_formato(formato, modo, s=""):
    w, h = FORMATOS[formato]
    if modo == "recorte":
        return f"scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h},setsar=1"
    return (f"split[fx{s}][fy{s}];[fx{s}]scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h},"
            f"boxblur=25:2[bg{s}];[fy{s}]scale={w}:{h}:force_original_aspect_ratio=decrease[fg{s}];"
            f"[bg{s}][fg{s}]overlay=(W-w)/2:(H-h)/2,setsar=1")


def render(entradas, tramos, out, formato=None, modo="fondo", post_v="", voz="", final_a="", extra=(), cwd=None,
           musica=None, vol_musica=-18):
    """Una sola pasada de FFmpeg: corta los tramos [(k, ini, fin)] de entradas[k], los lleva al formato, los une,
    aplica post_v (subtitulos) y el audio (voz -> musica por debajo -> final_a).
    FFmpeg endereza solo los videos con marca de rotacion (celulares y camaras)."""
    args, g = [], ""
    for e in entradas:
        args += ["-i", Path(e).resolve()]
    fps = f",fps={fps_de(entradas[0])}" if len(entradas) > 1 else ""  # clips de distinto fps no se pueden unir
    for i, (k, a, b) in enumerate(tramos):
        fv = "," + cadena_formato(formato, modo, i) if formato else ""
        g += (f"[{k}:v]trim={a:.3f}:{b:.3f},setpts=PTS-STARTPTS{fps}{fv}[v{i}];"
              f"[{k}:a]atrim={a:.3f}:{b:.3f},asetpts=PTS-STARTPTS,aformat=sample_rates=48000:channel_layouts=stereo[a{i}];")
    g += "".join(f"[v{i}][a{i}]" for i in range(len(tramos))) + f"concat=n={len(tramos)}:v=1:a=1[vc][ac];"
    g += f"[vc]{post_v or 'null'}[v];"
    cola = "," + final_a if final_a else ""
    if musica:
        m = len(entradas)
        args += ["-stream_loop", "-1", "-i", Path(musica).resolve()]
        d = sum(b - a for _, a, b in tramos)
        g += (f"[ac]{voz or 'anull'},asplit[voz][guia];"
              f"[{m}:a]atrim=0:{d:.3f},asetpts=PTS-STARTPTS,aformat=sample_rates=48000:channel_layouts=stereo,"
              f"volume={vol_musica}dB,afade=t=in:d=1,afade=t=out:st={max(0.0, d - 2):.3f}:d=2[mus];"
              f"[mus][guia]sidechaincompress=threshold=0.02:ratio=8:attack=15:release=350[musb];"
              f"[voz][musb]amix=inputs=2:duration=first:normalize=0{cola}[a]")
    else:
        g += f"[ac]{voz or 'anull'}{cola}[a]"
    ffmpeg(*args, "-filter_complex", g, "-map", "[v]", "-map", "[a]", *H264, *extra, Path(out).resolve(), cwd=cwd)


def posicion_sin_caras(muestras, formato, modo, tmp):
    """Mira cuadros del video ya en formato y decide si los subtitulos van abajo o arriba para no tapar una cara."""
    import cv2
    w, h = FORMATOS[formato]
    tam = tam_letra(w, h)
    zonas = {"abajo": (h * 0.65 - 3.0 * tam, h * 0.65), "arriba": (h * 0.24, h * 0.24 + 3.0 * tam)}
    choques = {"abajo": 0, "arriba": 0}
    det = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    for i, (entrada, t) in enumerate(muestras):
        png = Path(tmp, f"cara{i}.png")
        ffmpeg("-ss", f"{t:.2f}", "-i", Path(entrada).resolve(), "-filter_complex", cadena_formato(formato, modo),
               "-frames:v", "1", png)
        img = cv2.imread(str(png), cv2.IMREAD_GRAYSCALE)
        for (_, y, _, fh) in det.detectMultiScale(img, 1.1, 6, minSize=(int(w * 0.07), int(w * 0.07))):
            for z, (za, zb) in zonas.items():
                if y < zb and y + fh * 1.2 > za:  # 1.2: el menton queda debajo del recuadro de la cara
                    choques[z] += 1
    return ("arriba", "habia una cara en la zona de abajo") if choques["abajo"] > choques["arriba"] else \
        ("abajo", "sin caras en la zona" if not choques["abajo"] else "las caras chocaban igual arriba")


def producir(entradas, elegidas, a, final):
    """Arma el video final con las tomas elegidas [(k, toma)], en ese orden."""
    durs = [duracion(e) for e in entradas]
    tramos, palabras_out, offset, rehechas = [], [], 0.0, 0
    for k, t in elegidas:
        quedan, quitar = (t["palabras"], []) if a.con_repeticiones else limpiar_repeticiones(t["palabras"])
        rehechas += len(quitar)
        if not quedan:
            continue
        base = ([(max(0.0, quedan[0][0] - ANTES), min(durs[k], quedan[-1][1] + DESPUES))] if a.con_silencios
                else tramos_de_palabras(quedan, a.pausa, durs[k]))
        for ini, fin in restar_tramos(base, quitar):
            tramos.append((k, ini, fin))
            palabras_out += [(w[0] - ini + offset, w[1] - ini + offset, w[2]) for w in quedan if ini <= w[0] and w[1] <= fin]
            offset += fin - ini
    if not tramos:
        sys.exit("ERROR: no quedo nada para usar.")
    w, h = FORMATOS[a.formato]
    with tempfile.TemporaryDirectory() as tmp:
        post_v, nota = "", ""
        if not a.sin_subtitulos or a.gancho:
            posicion = a.posicion
            if posicion == "auto" and not a.sin_subtitulos:
                paso = max(1, len(tramos) // 6)
                posicion, nota = posicion_sin_caras([(entradas[k], (i + f) / 2) for k, i, f in tramos[::paso][:6]],
                                                    a.formato, a.modo, tmp)
            escribir_ass([] if a.sin_subtitulos else palabras_out, Path(tmp, "s.ass"), w, h, ANCHO_SUBS[a.formato],
                         a.estilo, a.color, a.fuente, "abajo" if posicion == "auto" else posicion, a.gancho, offset)
            post_v = "ass=s.ass"
            if not a.sin_subtitulos:
                escribir_srt(armar_cues(palabras_out, ANCHO_SUBS[a.formato]), Path(final).with_suffix(".srt"))
                nota = f"subtitulos {posicion}" + (f" ({nota})" if nota else "")
        render(entradas, tramos, final, a.formato, a.modo, post_v, "dynaudnorm=f=250:g=15",
               "loudnorm=I=-14:TP=-1.5:LRA=11", DESTINOS["reels"], cwd=tmp, musica=a.musica, vol_musica=a.vol_musica)
    extras = [x for x in (nota, f"{rehechas} frases reempezadas sacadas" if rehechas else "",
                          "con musica" if a.musica else "") if x]
    print(f"LISTO -> {final}  ({hms(sum(durs))} de crudo -> {hms(duracion(final))}; " + "; ".join(extras) + ")")


# ---------- comandos ----------

def c_info(a):
    d = sondear(a.video)
    v = next((s for s in d["streams"] if s["codec_type"] == "video"), {})
    au = next((s for s in d["streams"] if s["codec_type"] == "audio"), None)
    fps = v.get("avg_frame_rate", "0/1").split("/")
    fps = round(int(fps[0]) / max(int(fps[1]), 1), 2)
    mb = int(d["format"]["size"]) / 1e6
    w, h, rot = v.get("width"), v.get("height"), rotacion(v)
    vista = f" (rotado {rot}: se ve {h}x{w})" if rot in (90, 270) else ""
    print(f"{Path(a.video).name}: {hms(float(d['format']['duration']))} | {w}x{h}{vista} "
          f"{v.get('codec_name')} {fps}fps | audio: {au['codec_name'] if au else 'NO'} | {mb:.1f} MB")


def c_silencios(a):
    dur = duracion(a.video)
    tramos = tramos_sin_silencios(silencios_de(a.video, a.umbral, a.pausa), dur, a.margen)
    if not tramos:
        sys.exit("ERROR: todo el audio parece silencio. Proba con --umbral -45")
    out = salida(a.video, "sinsilencios", ".mp4")
    render([a.video], [(0, x, y) for x, y in tramos], out, extra=["-crf", "18", "-preset", "medium", "-fpsmax", "60"])
    ok(out, f"{hms(dur)} -> {hms(duracion(out))}, {len(tramos)} tramos")
    return out


def c_tomas(a):
    palabras, _ = palabras_de(a.video, a)
    if not palabras:
        sys.exit("ERROR: no se detecto voz en el audio.")
    for t in armar_tomas(palabras):
        p = t["palabras"]
        print(f"{t['n']:>2}  {hms(p[0][0])}-{hms(p[-1][1])}  {','.join(t['marcas']) or 'OK':<16} {t['texto'][:200]}")
    print(f"Para elegir otras: vtool reel \"{a.video}\" --tomas N,M   (sin --tomas usa las marcadas OK)")


def c_subtitulos(a):
    palabras, idioma = palabras_de(a.video, a)
    if not palabras:
        sys.exit("ERROR: no se detecto voz en el audio.")
    out = salida(a.video, "subs", ".srt")
    cues = armar_cues(palabras, ancho=a.ancho)
    escribir_srt(cues, out)
    ok(out, f"{len(cues)} subtitulos, idioma {idioma}")
    return out


ESTILOS = {
    # para quemar un .srt suelto. Tamaños en unidades de libass (alto de referencia 288).
    "reel":    "Fontname=Arial,Bold=1,Fontsize=14,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,"
               "BorderStyle=1,Outline=2.5,Shadow=0,Alignment=2,MarginV=100",
    "clasico": "Fontname=Arial,Fontsize=11,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,"
               "BorderStyle=1,Outline=1.5,Shadow=0,Alignment=2,MarginV=18",
    "caja":    "Fontname=Arial,Bold=1,Fontsize=13,PrimaryColour=&H00FFFFFF,BackColour=&H99000000,"
               "BorderStyle=3,Outline=6,Shadow=0,Alignment=2,MarginV=100",
}


def c_quemar(a):
    out = salida(a.video, "subtitulado")
    with tempfile.TemporaryDirectory() as tmp:  # copia con nombre simple: evita el escapeo de rutas de Windows
        shutil.copy(a.srt, Path(tmp, "s.srt"))
        ffmpeg("-i", Path(a.video).resolve(), "-vf", f"subtitles=s.srt:force_style='{ESTILOS[a.estilo]}'",
               *H264, "-crf", "19", Path(out).resolve(), cwd=tmp)
    ok(out)
    return out


def c_vertical(a):
    w, h = FORMATOS[a.formato]
    out = salida(a.video, a.formato.replace(":", "x"))
    ffmpeg("-i", a.video, "-filter_complex", cadena_formato(a.formato, a.modo), *H264, "-crf", "19", out)
    ok(out, f"{w}x{h} {a.modo}")
    return out


def c_normalizar(a):
    out = salida(a.video, "audio")
    ffmpeg("-i", a.video, "-af", f"loudnorm=I={a.lufs}:TP=-1.5:LRA=11", "-c:v", "copy",
           "-c:a", "aac", "-b:a", "192k", "-ar", "48000", out)
    ok(out, f"audio a {a.lufs} LUFS")
    return out


def c_cortar(a):
    rangos = [tuple(map(seg, r.split("-"))) for r in a.rangos]
    out = salida(a.video, "corte", ".mp4")
    render([a.video], [(0, x, y) for x, y in rangos], out, extra=["-crf", "18", "-fpsmax", "60"])
    ok(out, f"{len(rangos)} tramos, {hms(duracion(out))}")


def c_unir(a):
    out = Path(a.salida or salida(a.clips[0], "unido"))
    with tempfile.TemporaryDirectory() as tmp:
        lista = Path(tmp, "lista.txt")
        lista.write_text("".join(f"file '{Path(c).resolve().as_posix()}'\n" for c in a.clips), encoding="utf-8")
        ffmpeg("-f", "concat", "-safe", "0", "-i", lista, *H264, "-crf", "19", out.resolve())
    ok(out, f"{len(a.clips)} clips, {hms(duracion(out))}")


def c_insertar(a):
    """Pone una imagen o un clip encima del video en un rango ("lo que se dice, se ve")."""
    ini, fin = map(seg, a.rango.split("-"))
    w, h = medidas(a.video)
    media = Path(a.media).resolve()
    entrada = ["-loop", "1", "-t", f"{fin - ini:.3f}", "-i", media] if media.suffix.lower() in IMAGEN_EXT else ["-i", media]
    if a.modo == "completa":
        esc, pos = f"scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h}", "0:0"
    else:
        # franja de arriba (debajo de la zona que tapa la interfaz de Reels): no le tapa la cara al que habla
        esc = f"scale={int(w * 0.8) // 2 * 2}:{int(h * 0.3) // 2 * 2}:force_original_aspect_ratio=decrease"
        pos = f"(W-w)/2:{int(h * 0.14)}"
    g = (f"[1:v]{esc},setsar=1,setpts=PTS-STARTPTS+{ini:.3f}/TB[ins];"
         f"[0:v][ins]overlay={pos}:enable='between(t,{ini:.3f},{fin:.3f})':eof_action=pass[v]")
    out = salida(a.video, "insertado", ".mp4")
    ffmpeg("-i", Path(a.video).resolve(), *entrada, "-filter_complex", g, "-map", "[v]", "-map", "0:a?",
           *H264, "-crf", "18", "-fpsmax", "60", out)
    ok(out, f"{media.name} de {hms(ini)} a {hms(fin)} ({a.modo})")


def c_escenas(a):
    r = subprocess.run(["ffmpeg", "-hide_banner", "-i", str(a.video), "-vf",
                        f"select='gt(scene,{a.sensibilidad})',showinfo", "-an", "-f", "null", "-"],
                       capture_output=True, text=True, encoding="utf-8", errors="replace")
    cortes = [float(t) for t in re.findall(r"pts_time:([\d.]+)", r.stderr)]
    print(f"{len(cortes)} cambios de escena: " + ", ".join(hms(t) for t in cortes))
    if a.partir and cortes:
        tiempos = ",".join(f"{t:.3f}" for t in cortes)
        patron = salida(a.video, "escena%03d")
        ffmpeg("-i", a.video, *H264, "-crf", "19", "-force_key_frames", tiempos,
               "-f", "segment", "-segment_times", tiempos, "-reset_timestamps", "1", patron)
        ok(patron, f"{len(cortes) + 1} clips")


def c_hoja(a):
    d = duracion(a.video)
    cada = d / (a.columnas * a.filas)
    out = salida(a.video, "hoja", ".jpg")
    ffmpeg("-i", a.video, "-vf", f"fps=1/{cada:.3f},scale=480:-2,tile={a.columnas}x{a.filas}",
           "-frames:v", "1", "-q:v", "4", out)
    ok(out, f"cuadro n = segundo {cada:.1f}*n (izq a der, arriba a abajo)")


def c_revisar(a):
    """Control de calidad antes de entregar: formato, audio, cuadros negros o congelados y silencios."""
    d = sondear(a.video)
    v = next((s for s in d["streams"] if s["codec_type"] == "video"), {})
    au = next((s for s in d["streams"] if s["codec_type"] == "audio"), None)
    w, h = medidas(a.video)
    dur, fps = float(d["format"]["duration"]), fps_de(a.video)
    alertas = []
    if (w, h) != (1080, 1920):
        alertas.append(f"mide {w}x{h}: Reels y TikTok esperan 1080x1920")
    if v.get("codec_name") != "h264" or v.get("pix_fmt") != "yuv420p":
        alertas.append(f"video {v.get('codec_name')}/{v.get('pix_fmt')}: para redes conviene h264/yuv420p (vtool exportar)")
    if dur > 90:
        alertas.append(f"dura {hms(dur)}: en Reels conviene 90 s o menos")
    if not au:
        alertas.append("no tiene audio")
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(a.video),
                        "-vf", "blackdetect=d=0.2:pix_th=0.10,freezedetect=n=-60dB:d=2",
                        *(["-af", "ebur128=peak=true,silencedetect=n=-40dB:d=1"] if au else []), "-f", "null", "-"],
                       capture_output=True, text=True, encoding="utf-8", errors="replace")
    log = r.stderr
    negros = re.findall(r"black_start:([\d.]+)", log)
    if negros:
        alertas.append("cuadros negros en " + ", ".join(hms(float(x)) for x in negros[:5]))
    congelados = re.findall(r"freeze_start: ([\d.]+)", log)
    if congelados:
        alertas.append("imagen congelada (2 s o mas) en " + ", ".join(hms(float(x)) for x in congelados[:5]))
    if au:
        lufs = re.findall(r"I:\s+(-?[\d.]+) LUFS", log)
        pico = re.findall(r"Peak:\s+(-?[\d.]+|-inf) dBFS", log)
        if lufs and not -16 <= float(lufs[-1]) <= -12:
            alertas.append(f"volumen {lufs[-1]} LUFS: para redes, entre -16 y -12 (vtool normalizar)")
        if pico and pico[-1] != "-inf" and float(pico[-1]) > -1:
            alertas.append(f"picos de {pico[-1]} dBFS: puede saturar (vtool normalizar)")
        silencios = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", log)]
        if silencios:
            alertas.append("silencios de 1 s o mas en " + ", ".join(hms(x) for x in silencios[:5]))
    print(f"REVISION {Path(a.video).name}: {w}x{h} {fps}fps {hms(dur)}")
    for x in alertas:
        print(f"  ALERTA {x}")
    if not alertas:
        print("  sin alertas")
    c_hoja(argparse.Namespace(video=a.video, columnas=4, filas=4))
    print("  Revisar la hoja: textos tapando caras o producto, cortes raros, encuadre.")


def c_exportar(a):
    out = salida(a.video, a.destino, ".mp4")
    ffmpeg("-i", a.video, *H264, *DESTINOS[a.destino], out)
    ok(out, f"{os.path.getsize(out) / 1e6:.1f} MB")
    return out


def elegir_tomas(tomas, numeros):
    if not numeros:
        return [t for t in tomas if not t["marcas"]]
    try:
        return [tomas[int(n) - 1] for n in numeros.split(",")]
    except (ValueError, IndexError):
        sys.exit(f"ERROR: --tomas va de 1 a {len(tomas)} (ver vtool tomas)")


def c_reel(a):
    """Crudo -> transcribe -> descarta tomas de rodaje y frases reempezadas -> corta pausas por palabras ->
    endereza + formato + subtitulos palabra por palabra + musica + audio, en UNA sola pasada de FFmpeg."""
    original = Path(a.video).resolve()
    palabras, _ = palabras_de(original, a)
    if not palabras:
        sys.exit("ERROR: no se detecto voz en el audio.")
    tomas = armar_tomas(palabras)
    elegidas = elegir_tomas(tomas, a.tomas)
    for t in tomas:
        print(f"  {'USA ' if t in elegidas else 'SACA'} toma {t['n']} {','.join(t['marcas'])}: {t['texto'][:90]}")
    if not elegidas:
        sys.exit("ERROR: todas las tomas parecen de rodaje. Elegi a mano: vtool tomas, despues --tomas N")
    producir([original], [(0, t) for t in elegidas], a, salida(original, "REEL", ".mp4"))


def c_jornada(a):
    """Varios crudos de una jornada -> un solo video. Con --guion, una toma por linea del guion y en ese orden."""
    videos = videos_de(a.carpeta)
    if not videos:
        sys.exit(f"ERROR: no hay videos en {a.carpeta}")
    todas = []
    for k, v in enumerate(videos):
        palabras, _ = palabras_de(v, a)
        todas += [(k, t) for t in armar_tomas(palabras)]
    guion = a.guion or (Path(a.carpeta, "guion.txt") if Path(a.carpeta, "guion.txt").is_file() else None)
    if guion:
        lineas = [x.strip() for x in Path(guion).read_text(encoding="utf-8").splitlines() if x.strip()]
        elegidas = []
        for linea, par in zip(lineas, elegir_por_guion(lineas, todas)):
            if par:
                elegidas.append(par)
                print(f"  {linea[:50]:<50} <- {videos[par[0]].name} toma {par[1]['n']}")
            else:
                print(f"  {linea[:50]:<50} <- FALTA (ninguna toma se parece)")
    else:
        elegidas = [(k, t) for k, t in todas if not t["marcas"]]
        print(f"  {len(elegidas)} tomas OK de {len(todas)} en {len(videos)} videos")
    if not elegidas:
        sys.exit("ERROR: no hay tomas para usar.")
    producir(videos, elegidas, a, Path(a.carpeta, Path(a.carpeta).resolve().name + "__JORNADA.mp4"))


def c_lote(a):
    carpeta = Path(a.carpeta)
    videos = videos_de(carpeta)
    print(f"{len(videos)} videos en {carpeta}")
    fallas = []
    for v in videos:
        print(f"\n== {v.name}")
        r = subprocess.run([sys.executable, __file__, a.comando, str(v), *a.resto])
        if r.returncode:
            fallas.append(v.name)
    print(f"\nTerminado: {len(videos) - len(fallas)} ok, {len(fallas)} con error " + (str(fallas) if fallas else ""))


def c_autotest(_):
    assert seg("1:05") == 65 and seg("00:01:05.5") == 65.5 and seg("90") == 90
    assert srt_tiempo(3725.5) == "01:02:05,500" and ass_tiempo(3725.5) == "1:02:05.50"
    assert ass_color("#FFD400") == "&H0000D4FF&"
    assert partir_lineas("corto") == "corto"
    lineas = partir_lineas("esta es una frase bastante larga que hay que partir en dos").split("\n")
    assert len(lineas) == 2 and all(len(l) <= 42 for l in lineas)
    w = [(0, .4, "Hola"), (.5, .9, "mundo."), (1.0, 1.4, "Esto"), (3.0, 3.4, "sigue")]
    cues = armar_cues(w)
    assert [c[2] for c in cues] == ["Hola mundo. Esto", "sigue"], cues  # corta por pausa > 0.7 s
    largas = [(i * .3, i * .3 + .25, "palabra") for i in range(30)]
    assert all(len(l) <= 42 for c in armar_cues(largas) for l in c[2].split("\n"))
    assert unir_tramos([(5, 7), (1, 2), (1.5, 3)]) == [(1, 3), (5, 7)]
    assert restar_tramos([(0, 10)], [(2, 3), (9.98, 12)]) == [(0, 2), (3, 9.98)]
    assert tramos_sin_silencios([(0, 2), (4, 5)], 8, 0.1) == [(1.9, 4.1), (4.9, 8)]
    assert tramos_de_palabras([(1, 1.5, "a"), (1.6, 2, "b"), (5, 5.5, "c")], 0.45, 9) == [(0.88, 2.25), (4.88, 5.75)]
    # caso real (C2456): toma buena + insulto + "vamos de vuelta" + indicaciones al camarografo
    crudo = [(1.6, 2.2, "Bueno,"), (2.7, 3.6, "esta propiedad"), (3.6, 8.8, "genera eso, porque es una oportunidad."),
             (14.2, 16.2, "¿Cara, boludo, concha tu madre!"), (17.8, 19.6, "Ahí está, vamos de vuelta."),
             (21.9, 26.3, "Vos abrime, déjame así.")]
    assert [t["marcas"] for t in armar_tomas(crudo)] == [[], ["insulto"], ["rodaje"], ["rodaje"]]
    retoma = [(0, 1, "Esta casa tiene"), (1, 2, "tres"), (1.1, 1.5, "eh"), (5, 6, "esta casa tiene"), (6, 7, "cuatro")]
    assert [t["marcas"] for t in armar_tomas(retoma)] == [["repetida"], []]
    cortada = [(0, 1, "Esta propiedad genera"), (4, 5, "Esta propiedad genera eso porque es una oportunidad única")]
    assert [t["marcas"] for t in armar_tomas(cortada)] == [["repetida"], []]
    distintas = [(0, 1, "Esta propiedad tiene pileta climatizada y jardín"), (4, 5, "Esta propiedad tiene quincho con parrilla")]
    assert [t["marcas"] for t in armar_tomas(distintas)] == [[], []]
    ps = [(i, i + .5, x) for i, x in enumerate("la casa tiene tres la casa tiene tres ambientes".split())]
    quedan, quitar = limpiar_repeticiones(ps)
    assert [x[2] for x in quedan] == "la casa tiene tres ambientes".split() and quitar == [(0, 3.5)]
    ps = [(i, i + .5, x) for i, x in enumerate("vos abrime vos abrime dejame".split())]
    assert [x[2] for x in limpiar_repeticiones(ps)[0]] == ["vos", "abrime", "dejame"]
    ps = [(i, i + .5, x) for i, x in enumerate("tiene tres dormitorios y tiene tres baños".split())]
    assert limpiar_repeticiones(ps)[1] == []  # repetir "tiene tres" con otra cosa en el medio no es reempezar
    tomas = [(0, {"n": 1, "texto": "esta casa tiene tres", "marcas": ["repetida"]}),
             (0, {"n": 2, "texto": "esta casa tiene cuatro ambientes", "marcas": []}),
             (1, {"n": 1, "texto": "llamanos al whatsapp", "marcas": []})]
    assert [p and p[1]["n"] for p in elegir_por_guion(["Esta casa tiene cuatro ambientes", "Llamanos", "Precio"], tomas)] \
        == [2, 1, None]
    # caso real (C9864 de RENO): whisper.cpp estira las palabras sobre las pausas y no quedan huecos entre tomas
    estiradas = [(9.44, 10.0, "queres."), (10.0, 11.88, "Ahora"), (11.88, 13.76, "en"), (13.76, 16.1, "general,")]
    ajustadas = ajustar_a_silencios(estiradas, [(9.94, 13.18), (14.2, 15.48)])
    assert ajustadas == [(9.44, 9.94, "queres."), (13.18, 13.18, "Ahora"), (13.18, 13.76, "en"),
                         (13.76, 14.2, "general,")], ajustadas
    assert len(armar_tomas(estiradas)) == 1 and len(armar_tomas(ajustadas)) == 2
    # y entre toma y toma, la direccion: "mas pausa", "ok, pausa.", "entramos aca", una palabra suelta
    c9864 = [(0.77, 1.0, "Más"), (1.0, 1.26, "pausa,"), (2.6, 3.0, "ok,"), (3.0, 3.2, "pausa."), (4.1, 4.6, "Deberían"),
             (4.6, 5.0, "pensar"), (13.2, 13.6, "Ahora"), (13.6, 14.2, "general,"), (37.2, 37.5, "Ok."),
             (37.5, 38.0, "Bueno,"), (38.0, 38.7, "entramos"), (38.7, 39.0, "acá"), (51.9, 52.0, "también.")]
    tomas = armar_tomas(c9864)
    assert [t["marcas"] for t in tomas] == [["suelta"], [], [], ["rodaje"], ["suelta"]], tomas
    assert tomas[1]["texto"] == "Deberían pensar" and tomas[1]["palabras"][0][0] == 4.1
    # --palabras: el .words.json de video_transcribir (OpenAI) y el transcript.json de hyperframes
    with tempfile.TemporaryDirectory() as tmp:
        openai = Path(tmp, "voz.wav.words.json")
        openai.write_text(json.dumps({"text": "Hola mundo", "words": [
            {"word": "Hola", "start": 0.1, "end": 0.4}, {"word": " ", "start": 0.4, "end": 0.4},
            {"word": "mundo.", "start": 0.5, "end": 0.9}]}), encoding="utf-8")
        assert leer_palabras(openai) == [(0.1, 0.4, "Hola"), (0.5, 0.9, "mundo.")]
        hf = Path(tmp, "transcript.json")
        hf.write_text(json.dumps([{"text": "Esta", "start": 1, "end": 1.2, "id": "w0"},
                                  {"text": "casa", "start": 1.2, "end": 1.6, "id": "w1"}]), encoding="utf-8")
        assert leer_palabras(hf) == [(1.0, 1.2, "Esta"), (1.2, 1.6, "casa")]
        Path(tmp, "musica.json").write_text('{"text": ""}', encoding="utf-8")  # musica sin voz: OpenAI no manda words
        assert leer_palabras(Path(tmp, "musica.json")) == []
        # con --palabras no transcribe: la numeracion de tomas sale de ese archivo, igual en `tomas` y en `reel`
        crudo_json = Path(tmp, "crudo.words.json")
        crudo_json.write_text(json.dumps({"words": [{"word": x[2], "start": x[0], "end": x[1]} for x in crudo]}),
                              encoding="utf-8")
        p1, _ = transcribir(Path(tmp, "no-existe.mp4"), "es", "small", crudo_json)
        assert [t["marcas"] for t in armar_tomas(p1)] == [[], ["insulto"], ["rodaje"], ["rodaje"]]
    for prog in ("ffmpeg", "ffprobe"):
        assert shutil.which(prog), f"falta {prog} en el PATH"
    assert HYPERFRAMES[0] and shutil.which(HYPERFRAMES[0]), "falta hyperframes (o npx) en el PATH"
    # en Linux hyperframes compilaria whisper.cpp la primera vez (cmake + compilador): tiene que estar ya
    assert os.name == "nt" or shutil.which("whisper-cli"), "falta whisper-cli en el PATH"
    import cv2
    assert Path(cv2.data.haarcascades, "haarcascade_frontalface_default.xml").exists(), "OpenCV sin detector de caras"
    print(f"autotest OK (kit {VERSION})")


# ---------- CLI ----------

def main():
    sys.stdout.reconfigure(line_buffering=True, errors="replace")  # orden correcto en lote; nombres con tildes
    p = argparse.ArgumentParser(prog="vtool", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sp = p.add_subparsers(dest="cmd", required=True)

    def cmd(nombre, fn, ayuda, video=True):
        s = sp.add_parser(nombre, help=ayuda, description=ayuda)
        if video:
            s.add_argument("video")
        s.set_defaults(fn=fn)
        return s

    def palabras(s):
        s.add_argument("--palabras", help="transcripcion ya hecha (el .words.json de video_transcribir): no corre Whisper. "
                       "Usar el mismo archivo en tomas y en reel")

    def umbral(s):
        s.add_argument("--umbral", type=float, default=-35,
                       help="dB que cuentan como silencio al separar tomas y pausas (-35). Ruido de fondo alto: -30. "
                            "Usar el mismo en tomas y en reel")

    def produccion(s):
        umbral(s)
        s.add_argument("--idioma", default="es")
        s.add_argument("--modelo", default="small", help="small (rapido) o medium / large-v3 (mejor texto, mas lento)")
        s.add_argument("--formato", choices=list(FORMATOS), default="9:16")
        s.add_argument("--modo", choices=["fondo", "recorte"], default="fondo",
                       help="solo importa si el original no tiene la misma forma que el formato")
        s.add_argument("--estilo", choices=["reel", "caja", "simple"], default="reel",
                       help="reel/caja: resalta la palabra que se dice; simple: sin resaltar")
        s.add_argument("--color", default="#FFD400", help="color de la marca para la palabra activa (#RRGGBB)")
        s.add_argument("--fuente", default="Arial", help="tipografia instalada (fc-list); Arial sale como Liberation Sans")
        s.add_argument("--posicion", choices=["auto", "abajo", "arriba"], default="auto",
                       help="auto: mira el video y evita tapar caras")
        s.add_argument("--gancho", help="texto grande arriba los primeros 3 s")
        s.add_argument("--musica", help="pista de musica: queda por debajo de la voz y baja sola cuando se habla")
        s.add_argument("--vol-musica", type=float, default=-18, help="volumen de la musica en dB (-18)")
        s.add_argument("--pausa", type=float, default=0.75,
                       help="corta pausas mas largas que esto, en s (0.75). Menos = mas cortes, pero chicos se ven como saltos")
        s.add_argument("--sin-subtitulos", action="store_true")
        s.add_argument("--con-silencios", action="store_true", help="no cortar pausas dentro de cada toma")
        s.add_argument("--con-repeticiones", action="store_true", help="no sacar frases reempezadas")

    cmd("info", c_info, "Resumen de una linea: duracion, resolucion, rotacion, fps, audio, peso.")

    s = cmd("silencios", c_silencios, "Quita tiempos muertos por volumen (no mira el contenido: para crudos con "
            "varias tomas usar reel).")
    s.add_argument("--margen", type=float, default=0.15, help="segundos de aire antes/despues de cada frase (0.15)")
    s.add_argument("--umbral", type=float, default=-35, help="dB que cuentan como silencio; -30 corta mas (-35)")
    s.add_argument("--pausa", type=float, default=0.5, help="solo corta silencios mas largos que esto, en s (0.5)")

    s = cmd("tomas", c_tomas, "Lista las tomas del crudo con su texto y marca las de rodaje (insultos, "
            "indicaciones, tomas repetidas).")
    s.add_argument("--idioma", default="es")
    s.add_argument("--modelo", default="small")
    palabras(s)
    umbral(s)

    s = cmd("reel", c_reel, "TODO junto: elige tomas + saca repeticiones y pausas + endereza + formato + "
            "subtitulos palabra por palabra + musica + audio.")
    s.add_argument("--tomas", help="numeros de toma a usar, ej 1,3 (ver vtool tomas). Sin esto usa las marcadas OK")
    palabras(s)
    produccion(s)

    s = cmd("jornada", c_jornada, "Una carpeta de crudos -> UN video. Con --guion elige la mejor toma de cada linea.",
            video=False)
    s.add_argument("carpeta")
    s.add_argument("--guion", help="archivo .txt con una frase por linea, en el orden del video "
                   "(si no se indica, usa guion.txt de la carpeta si existe)")
    produccion(s)

    s = cmd("subtitulos", c_subtitulos, "Genera .srt con Whisper (42 caracteres x 2 lineas).")
    s.add_argument("--idioma", default="es", help="es, en, pt... o auto (es)")
    s.add_argument("--modelo", default="small", help="small, medium o large-v3 (small)")
    s.add_argument("--ancho", type=int, default=42, help="caracteres por linea: 42 horizontal, 22 para reels")
    palabras(s)
    umbral(s)

    s = cmd("quemar", c_quemar, "Pega los subtitulos .srt dentro del video.")
    s.add_argument("srt")
    s.add_argument("--estilo", choices=list(ESTILOS), default="reel")

    s = cmd("insertar", c_insertar, "Pone una imagen o clip encima del video en un rango. Ej: foto.jpg 0:03-0:06")
    s.add_argument("media")
    s.add_argument("rango")
    s.add_argument("--modo", choices=["ventana", "completa"], default="ventana",
                   help="ventana: arriba, sin tapar al que habla; completa: ocupa toda la pantalla")

    s = cmd("vertical", c_vertical, "Cambia el formato (9:16, 1:1, 4:5, 16:9).")
    s.add_argument("--formato", choices=list(FORMATOS), default="9:16")
    s.add_argument("--modo", choices=["fondo", "recorte"], default="fondo",
                   help="fondo = video entero con fondo desenfocado; recorte = recorta al centro")

    s = cmd("normalizar", c_normalizar, "Nivela el volumen para redes (-14 LUFS).")
    s.add_argument("--lufs", type=float, default=-14)

    s = cmd("cortar", c_cortar, "Se queda con los tramos indicados y los une. Ej: 0:05-0:12 1:00-1:20")
    s.add_argument("rangos", nargs="+")

    s = cmd("unir", c_unir, "Une varios clips en orden (mismo formato).", video=False)
    s.add_argument("clips", nargs="+")
    s.add_argument("-o", "--salida")

    s = cmd("escenas", c_escenas, "Detecta cambios de plano. --partir los separa en clips.")
    s.add_argument("--sensibilidad", type=float, default=0.3, help="0.1 muy sensible - 0.5 poco (0.3)")
    s.add_argument("--partir", action="store_true")

    s = cmd("hoja", c_hoja, "Hoja de contacto JPG (para revisar un video de un vistazo).")
    s.add_argument("--columnas", type=int, default=4)
    s.add_argument("--filas", type=int, default=4)

    cmd("revisar", c_revisar, "Control de calidad antes de entregar: formato, volumen, picos, cuadros negros o "
        "congelados, silencios + hoja de contacto.")

    s = cmd("exportar", c_exportar, "Exporta con preset de destino.")
    s.add_argument("--destino", choices=list(DESTINOS), default="reels")

    s = cmd("lote", c_lote, "Aplica un comando a todos los videos de una carpeta. Ej: vtool lote D:\\crudos reel",
            video=False)
    s.add_argument("carpeta")
    s.add_argument("comando")
    s.add_argument("resto", nargs=argparse.REMAINDER)

    cmd("autotest", c_autotest, "Verifica que el kit funciona.", video=False)

    a = p.parse_args()
    if getattr(a, "video", None) and not Path(a.video).is_file():
        sys.exit(f"ERROR: no existe {a.video}")
    for campo in ("musica", "guion", "media", "srt", "palabras"):
        if getattr(a, campo, None) and not Path(getattr(a, campo)).is_file():
            sys.exit(f"ERROR: no existe {getattr(a, campo)}")
    if getattr(a, "carpeta", None) and not Path(a.carpeta).is_dir():
        sys.exit(f"ERROR: no existe la carpeta {a.carpeta}")
    a.fn(a)


if __name__ == "__main__":
    main()
