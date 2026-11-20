"""vtool - kit de edicion de video LMTM. Todo corre local (FFmpeg, faster-whisper, OpenCV): cero tokens.

Uso:  vtool <comando> <archivo> [opciones]      (vtool <comando> -h para ver opciones)
Los resultados quedan al lado del original con "__" en el nombre. Nunca pisa el original.

Kit para usar con Claude Code en cada PC del equipo. Transcribe con faster-whisper y exporta timelines XML
para editores.
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

VERSION = "1.6-lmtm-os"  # desde el kit 1.5 con desde-kit.py (17/11)
VIDEO_EXT = {".mp4", ".mov", ".mkv", ".m4v", ".avi", ".webm"}
IMAGEN_EXT = {".jpg", ".jpeg", ".png", ".webp"}
FORMATOS = {"9:16": (1080, 1920), "1:1": (1080, 1080), "4:5": (1080, 1350), "16:9": (1920, 1080)}
ANCHO_SUBS = {"9:16": 16, "4:5": 22, "1:1": 22, "16:9": 36}  # caracteres por linea en el reel
H264 = ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
        "-movflags", "+faststart"]
# auto-editor vive en el venv del kit, que no siempre esta en el PATH. Solo se usa para exportar XML:
# para cortar video ignora la rotacion de celulares/camaras y con archivos de camara (PCM) entrega MP4 rotos.
AUTOEDITOR = shutil.which("auto-editor", path=str(Path(sys.executable).parent)) or shutil.which("auto-editor")
# En el contenedor de LMTM-OS `hyperframes` esta instalado global (Node 22); en otra maquina se baja con npx.
HYPERFRAMES = [shutil.which("hyperframes")] if shutil.which("hyperframes") else [shutil.which("npx") or "npx", "-y", "hyperframes"]
DESTINOS = {
    # -fpsmax: respeta 25/30/50/60 fps del original (pasar 50 a 30 hace saltos) y solo baja lo que pase de 60
    "reels":    ["-fpsmax", "60", "-crf", "20", "-preset", "medium", "-maxrate", "10M", "-bufsize", "20M"],
    "tiktok":   ["-fpsmax", "60", "-crf", "20", "-preset", "medium", "-maxrate", "10M", "-bufsize", "20M"],
    "youtube":  ["-crf", "18", "-preset", "slow"],
    "whatsapp": ["-vf", "scale='min(720,iw)':-2", "-crf", "28", "-preset", "medium", "-b:a", "96k"],
    "preview":  ["-vf", "scale=-2:'min(540,ih)'", "-crf", "30", "-preset", "veryfast", "-b:a", "96k"],
}
# Voz limpia: saca el rumble y el ruido de fondo parejo (aire, heladera, calle lejana) ANTES de nivelar, porque
# dynaudnorm sube el ruido en las pausas. No hace milagros con otra gente hablando atras.
LIMPIEZA = "highpass=f=80,afftdn=nr=14:nf=-38:tn=1"
# Zonas de texto en 1080x1920 (x 110-970): fuera de la interfaz de Reels y lejos de los botones de la derecha.
ZONAS = {"arriba": (380, 760), "abajo": (1040, 1480)}


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


def bloques_guion(texto):
    """guion.txt -> [{"nombre", "gancho", "lineas"}], un reel por bloque. Los bloques se separan con una linea ---.
    Opcionales al principio de cada bloque: "# nombre" y "gancho: Frase con *clave*"."""
    bloques = []
    for crudo in re.split(r"^\s*-{3,}\s*$", texto, flags=re.M):
        b = {"nombre": None, "gancho": None, "lineas": []}
        for x in (y.strip() for y in crudo.splitlines()):
            if x.startswith("#"):
                b["nombre"] = x.lstrip("# ").strip()
            elif x.lower().startswith("gancho:"):
                b["gancho"] = x.split(":", 1)[1].strip()
            elif x:
                b["lineas"].append(x)
        if b["lineas"]:
            bloques.append(b)
    return bloques


def frases_de(palabras, pausa=0.35):
    """Corta las palabras en frases: en cada pausa de mas de `pausa` s o despues de puntuacion."""
    frases, cur = [], []
    for w in palabras:
        if cur and (w[0] - cur[-1][1] > pausa or cur[-1][2][-1:] in ".?!,;:"):
            frases.append(cur)
            cur = []
        cur.append(w)
    if cur:
        frases.append(cur)
    return frases


def segmentar_angulos(palabras, cambios=5, minimo=2.5):
    """Metodo "una toma, seis angulos": escenas amarradas a frases, alternando el plano ORIGINAL con hasta
    `cambios` angulos nuevos. Devuelve [(ini, fin, texto, es_original)]."""
    escenas, cur = [], []
    for f in frases_de(palabras):
        cur += f
        if cur[-1][1] - cur[0][0] >= minimo:
            escenas.append(cur)
            cur = []
    if cur:
        if escenas:
            escenas[-1] += cur
        else:
            escenas.append(cur)
    res, nuevos = [], 0
    for i, e in enumerate(escenas):
        original = i % 2 == 0 or nuevos >= cambios
        nuevos += 0 if original else 1
        ini = 0.0 if i == 0 else round(e[0][0], 1)
        fin = round(escenas[i + 1][0][0], 1) if i + 1 < len(escenas) else round(e[-1][1], 1)
        res.append((ini, fin, " ".join(w[2] for w in e), original))
    return res


def elegir_sfx(cortes, separacion=2.0, inicio=0.3):
    """Donde va un efecto: en los cortes, pero nunca dos a menos de `separacion` s (sin "ametralladora")."""
    elegidos = []
    for c in sorted(cortes):
        if c >= inicio and (not elegidos or c - elegidos[-1] >= separacion):
            elegidos.append(c)
    return elegidos


def partes_historia(palabras, maximo=15.0):
    """Corta un reel en historias de hasta `maximo` s, siempre al final de una frase."""
    partes, ini, fin = [], 0.0, 0.0
    for f in frases_de(palabras, pausa=0.5):
        if f[-1][1] - ini > maximo and fin > ini:
            partes.append((ini, fin))
            ini = f[0][0]
        fin = f[-1][1]
    if fin > ini:
        partes.append((ini, fin))
    return partes


def aplicar_perfil(opciones, perfil, explicitas):
    """Completa las opciones con las del perfil del nicho; lo que la persona escribio a mano gana."""
    for k, v in perfil.get("reel", {}).items():
        if k in opciones and "--" + k.replace("_", "-") not in explicitas:
            opciones[k] = v
    return opciones


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


def armar_grupos(palabras, ancho=42, max_dur=3.5, pausa=0.7, max_palabras=None):
    """palabras: [(inicio, fin, texto)] -> grupos de palabras que entran en un subtitulo de <=2 lineas."""
    grupos, cur = [], []
    for w in palabras:
        if cur:
            texto = " ".join(x[2] for x in cur)
            if (len(texto) + 1 + len(w[2]) > ancho * 2 or w[0] - cur[-1][1] > pausa or w[1] - cur[0][0] > max_dur
                    or (max_palabras and len(cur) >= max_palabras)
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
    return round(min(w / 11, h / 15))


def escribir_ass(palabras, destino, w, h, ancho, estilo, color, fuente, posicion, gancho, dur):
    """Subtitulos palabra por palabra: la palabra que se esta diciendo se pinta del color de la marca.
    Formato de reels virales (31/10): grandes, de 1 a 3 palabras, blancos con borde negro, en el tercio de abajo
    (borde inferior al 23 %, encima del texto y los botones de Reels) y centrados lejos de la columna de botones.
    Sin cajas ni rotulos: el gancho tambien va con borde, no en un recuadro."""
    tam = tam_letra(w, h)
    caja = estilo == "caja"
    margen, alin = (round(h * 0.23), 2) if posicion == "abajo" else (round(h * 0.2), 8)
    lado = round(w * 0.13)
    estilo_sub = (f"Sub,{fuente},{tam},&H00FFFFFF,&H00FFFFFF,&H00000000,&H99000000,-1,0,0,0,100,100,0,0,"
                  f"{3 if caja else 1},{round(tam * (0.22 if caja else 0.12))},{0 if caja else 2},{alin},{lado},{lado},{margen},1")
    estilo_gancho = (f"Gancho,{fuente},{tam},&H00FFFFFF,&H00FFFFFF,&H00000000,&H99000000,-1,0,0,0,"
                     f"100,100,0,0,1,{round(tam * 0.12)},2,8,{lado},{lado},{round(h * 0.2)},1")
    activo, blanco = "{\\c" + ass_color(color) + "}", "{\\c&H00FFFFFF&}"
    eventos = []
    for g in armar_grupos(palabras, ancho, max_palabras=3):
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
        resaltado = re.sub(r"\*([^*]+)\*", lambda m: activo + m.group(1) + blanco, re.sub(r"[{}\\]", "", gancho))
        eventos.append((0.0, min(3.0, dur), "Gancho", "{\\fad(150,300)}" + resaltado))
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


def gpu_lista():
    """Solo intenta la placa si hay GPU de NVIDIA Y la libreria cuBLAS carga: probar CUDA sin cuBLAS a veces
    deja el proceso colgado en lugar de dar error."""
    if os.environ.get("VTOOL_CPU"):
        return False
    try:
        import ctranslate2
        import ctypes
        if ctranslate2.get_cuda_device_count() < 1:
            return False
        ctypes.CDLL("cublas64_12.dll" if os.name == "nt" else "libcublas.so.12")
        return True
    except (OSError, ImportError, RuntimeError):
        return False


def transcribir(video, idioma, modelo, palabras=None):
    """Palabras con sus tiempos. Con `palabras` (un .words.json) no transcribe: lee ese archivo.
    Si no, faster-whisper y queda en cache: `tomas` y `reel` usan la misma transcripcion (misma numeracion)."""
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
    try:
        from faster_whisper import WhisperModel  # import tardio: los demas comandos no lo necesitan
    except ImportError:  # contenedor de LMTM-OS: el Whisper de HyperFrames (whisper.cpp)
        return transcribir_hyperframes(video, idioma, modelo, cache)
    import numpy as np
    print(f"Transcribiendo {Path(video).name} con whisper {modelo} (la primera vez descarga el modelo)...")
    # el audio lo decodifica ffmpeg (no PyAV): las versiones nuevas de PyAV rompen faster-whisper
    pcm = subprocess.run(["ffmpeg", "-v", "error", "-i", str(video), "-f", "f32le", "-ac", "1", "-ar", "16000", "-"],
                         capture_output=True, check=True).stdout
    audio = np.frombuffer(pcm, np.float32)
    for device in ("cuda" if gpu_lista() else "cpu", "cpu"):  # GPU si anda; si falta CUDA/cuBLAS, cae a CPU
        try:
            try:  # primero el modelo ya bajado: si no, faster-whisper consulta internet cada vez y se cuelga si HF anda lento
                m = WhisperModel(modelo, device=device, compute_type="int8", local_files_only=True)
            except Exception:
                print(f"Bajando el modelo {modelo} (una sola vez)...")
                m = WhisperModel(modelo, device=device, compute_type="int8")
            segmentos, info = m.transcribe(audio, language=None if idioma == "auto" else idioma,
                                           word_timestamps=True, vad_filter=True)
            palabras = [(w.start, w.end, w.word.strip()) for s in segmentos for w in (s.words or []) if w.word.strip()]
            idioma = info.language
            break
        except RuntimeError as e:
            if device == "cpu":
                raise
            print(f"GPU no disponible ({str(e)[:60]}), sigo con CPU...")
    cache.parent.mkdir(exist_ok=True)
    cache.write_text(json.dumps({"palabras": palabras, "idioma": idioma}), encoding="utf-8")
    return palabras, idioma


def transcribir_hyperframes(video, idioma, modelo, cache):
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


def ajuste_de_luz(luz, neutros, fraccion_neutros):
    """Puro: (gamma, (r, g, b)). luz = brillo medio 0-1; neutros = media RGB 0-1 de los pixeles casi grises.
    Aclara si esta oscuro (nunca oscurece); el tinte se corrige solo si hay grises suficientes para medirlo."""
    import math
    gamma = round(min(1.6, math.log(luz) / math.log(0.45)), 2) if 0.05 < luz < 0.37 else 1.0
    ganancias = (1.0, 1.0, 1.0)
    if neutros and fraccion_neutros >= 0.05:
        m = sum(neutros) / 3
        if m and max(abs(c - m) for c in neutros) / m > 0.05:
            ganancias = tuple(round(min(1.15, max(0.87, m / c)), 3) for c in neutros)
    return gamma, ganancias


def medir_luz(video, n=12):
    """(brillo medio 0-1, media RGB de los pixeles casi grises o None, fraccion de grises) en n cuadros parejos."""
    import cv2
    import numpy as np
    d = duracion(video)
    lumas, neutros, grises, total = [], [], 0, 0
    with tempfile.TemporaryDirectory() as tmp:
        for i in range(n):
            png = Path(tmp, f"l{i}.png")
            ffmpeg("-ss", f"{d * (i + 0.5) / n:.2f}", "-i", Path(video).resolve(), "-frames:v", "1", "-vf", "scale=320:-2", png)
            img = cv2.imread(str(png))
            if img is None:
                continue
            rgb = img[:, :, ::-1].reshape(-1, 3).astype("float32") / 255
            lumas.append(float((rgb @ np.array([0.2126, 0.7152, 0.0722], dtype="float32")).mean()))
            mx, mn = rgb.max(1), rgb.min(1)
            gris = (mx > 0.25) & (mx < 0.95) & ((mx - mn) / np.maximum(mx, 1e-6) < 0.2)
            total, grises = total + len(rgb), grises + int(gris.sum())
            if gris.any():
                neutros.append(rgb[gris].mean(0))
    if not lumas:
        sys.exit("ERROR: no se pudo leer ningun cuadro del video")
    neu = tuple(float(x) for x in np.mean(neutros, 0)) if neutros else None
    return sum(lumas) / len(lumas), neu, grises / max(total, 1)


def c_luz(a):
    luz, neutros, frac = medir_luz(a.video)
    gamma, gan = ajuste_de_luz(luz, neutros, frac)
    tinte = f" · grises {frac:.0%}" + (f" (R {neutros[0]:.2f} G {neutros[1]:.2f} B {neutros[2]:.2f})" if neutros else "")
    if not a.blanco:
        gan = (1.0, 1.0, 1.0)
    print(f"brillo medio {luz:.2f}{tinte}")
    if gamma == 1.0 and gan == (1.0, 1.0, 1.0):
        print("sin cambios: la exposicion" + (" y el blanco estan bien" if a.blanco else " esta bien (el blanco se corrige con --blanco)"))
        return a.video
    filtros = ([f"eq=gamma={gamma}"] if gamma != 1.0 else []) + \
        ([f"colorchannelmixer=rr={gan[0]}:gg={gan[1]}:bb={gan[2]}"] if gan != (1.0, 1.0, 1.0) else [])
    out = salida(a.video, "luz")
    ffmpeg("-i", a.video, "-vf", ",".join(filtros), *H264, "-crf", "19", out)
    ok(out, " · ".join(filtros))
    return out


# ---------- render ----------

def cadena_formato(formato, modo, s=""):
    w, h = FORMATOS[formato]
    if modo == "recorte":
        return f"scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h},setsar=1"
    return (f"split[fx{s}][fy{s}];[fx{s}]scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h},"
            f"boxblur=25:2[bg{s}];[fy{s}]scale={w}:{h}:force_original_aspect_ratio=decrease[fg{s}];"
            f"[bg{s}][fg{s}]overlay=(W-w)/2:(H-h)/2,setsar=1")


def niveles_canales(video, segundos=60):
    """RMS en dB de cada canal de audio (los primeros `segundos`)."""
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-t", str(segundos), "-i", str(video), "-vn",
                        "-af", "astats=metadata=0:measure_overall=none:measure_perchannel=RMS_level", "-f", "null", "-"],
                       capture_output=True, text=True, encoding="utf-8", errors="replace")
    return [float("-inf" if x == "-inf" else x) for x in re.findall(r"RMS level dB: (-?[\d.]+|-inf)", r.stderr)]


def canal_de_voz(niveles):
    """Camaras con un solo microfono graban la voz en un canal y el otro casi mudo (crudo C9864 de RENO: -28 y -70 dB):
    sin esto el reel se escucha de un solo lado. Devuelve el indice del canal bueno, o None si estan parejos."""
    if len(niveles) != 2 or abs(niveles[0] - niveles[1]) < 20:
        return None
    return 0 if niveles[0] > niveles[1] else 1


def cadena_musica(m, d, vol, voz="anull", cola="", fin="a"):
    """[ac] = la voz, [m:a] = la pista: la musica queda por debajo y baja sola cuando se habla."""
    return (f"[ac]{voz},asplit[voz][guia];"
            f"[{m}:a]atrim=0:{d:.3f},asetpts=PTS-STARTPTS,aformat=sample_rates=48000:channel_layouts=stereo,"
            f"volume={vol}dB,afade=t=in:d=1,afade=t=out:st={max(0.0, d - 2):.3f}:d=2[mus];"
            f"[mus][guia]sidechaincompress=threshold=0.02:ratio=8:attack=15:release=350[musb];"
            f"[voz][musb]amix=inputs=2:duration=first:normalize=0{cola}[{fin}]")


def render(entradas, tramos, out, formato=None, modo="fondo", post_v="", voz="", final_a="", extra=(), cwd=None,
           musica=None, vol_musica=-18, zoom=0, sfx=None):
    """Una sola pasada de FFmpeg: corta los tramos [(k, ini, fin)] de entradas[k], los lleva al formato, los une,
    aplica post_v (subtitulos) y el audio (voz -> musica por debajo -> efectos -> final_a).
    zoom: un tramo si y uno no se acerca (ej. 1.12): disimula los saltos de un talking head y marca el ritmo.
    FFmpeg endereza solo los videos con marca de rotacion (celulares y camaras)."""
    args, g = [], ""
    for e in entradas:
        args += ["-i", Path(e).resolve()]
    fps = f",fps={fps_de(entradas[0])}" if len(entradas) > 1 else ""  # clips de distinto fps no se pueden unir
    canales = [canal_de_voz(niveles_canales(e)) for e in entradas]
    for i, (k, a, b) in enumerate(tramos):
        fv = "," + cadena_formato(formato, modo, i) if formato else ""
        if formato and zoom and i % 2:
            w, h = FORMATOS[formato]
            fv += f",scale={int(w * zoom) // 2 * 2}:{int(h * zoom) // 2 * 2},crop={w}:{h},setsar=1"  # SAR 1:1 o concat falla
        g += (f"[{k}:v]trim={a:.3f}:{b:.3f},setpts=PTS-STARTPTS{fps}{fv}[v{i}];"
              f"[{k}:a]atrim={a:.3f}:{b:.3f},asetpts=PTS-STARTPTS,"
              + (f"pan=stereo|c0=c{canales[k]}|c1=c{canales[k]}," if canales[k] is not None else "")
              + f"aformat=sample_rates=48000:channel_layouts=stereo[a{i}];")
    g += "".join(f"[v{i}][a{i}]" for i in range(len(tramos))) + f"concat=n={len(tramos)}:v=1:a=1[vc][ac];"
    g += f"[vc]{post_v or 'null'}[v];"
    cola = "," + final_a if final_a else ""
    if musica:
        m = len(entradas)
        args += ["-stream_loop", "-1", "-i", Path(musica).resolve()]
        d = sum(b - a for _, a, b in tramos)
        g += cadena_musica(m, d, vol_musica, voz or "anull", "" if sfx else cola, "mx" if sfx else "a")
    else:
        g += f"[ac]{voz or 'anull'}{'' if sfx else cola}[{'mx' if sfx else 'a'}]"
    if sfx:  # los efectos entran despues de la musica y antes del nivel final
        args += ["-i", Path(sfx).resolve()]
        g += f";[mx][{len(entradas) + (1 if musica else 0)}:a]amix=inputs=2:duration=first:normalize=0{cola}[a]"
    ffmpeg(*args, "-filter_complex", g, "-map", "[v]", "-map", "[a]", *H264, *extra, Path(out).resolve(), cwd=cwd)


SFX_SONIDOS = {  # efectos sintetizados con FFmpeg: sin descargas ni licencias
    "whoosh1": "anoisesrc=d=0.5:c=pink:a=0.5,highpass=f=400,lowpass=f=3500,afade=t=in:d=0.3,afade=t=out:st=0.3:d=0.2",
    "whoosh2": "anoisesrc=d=0.4:c=brown:a=0.7,highpass=f=250,lowpass=f=5000,afade=t=in:d=0.22,afade=t=out:st=0.22:d=0.18",
    "whoosh3": "anoisesrc=d=0.55:c=pink:a=0.45,bandpass=f=1200:width_type=o:w=2,afade=t=in:d=0.35,afade=t=out:st=0.35:d=0.2",
    "pop": "sine=f=880:d=0.08,volume=0.6,afade=t=out:st=0.01:d=0.07",
}


def pista_sfx(cortes, d, destino, vol, pop_inicio=False):
    """Una pista de efectos del largo del video: whoosh en los cortes elegidos (rotando 3 variantes) y un pop al
    aparecer el gancho. Devuelve cuantos efectos puso."""
    puntos = [(t, f"whoosh{i % 3 + 1}") for i, t in enumerate(elegir_sfx(cortes))]
    if pop_inicio:
        puntos.insert(0, (0.05, "pop"))
    if not puntos:
        return 0
    args, g = ["-f", "lavfi", "-t", f"{d:.3f}", "-i", "anullsrc=r=48000:cl=stereo"], ""
    for i, (t, nombre) in enumerate(puntos, 1):
        args += ["-f", "lavfi", "-i", SFX_SONIDOS[nombre]]
        centro = 0.25 if nombre != "pop" else 0  # el pico del whoosh cae justo en el corte
        g += f"[{i}:a]aformat=sample_rates=48000:channel_layouts=stereo,adelay={max(0, int((t - centro) * 1000))}:all=1[s{i}];"
    g += "[0:a]" + "".join(f"[s{i}]" for i in range(1, len(puntos) + 1))
    g += f"amix=inputs={len(puntos) + 1}:duration=first:normalize=0,volume={vol}dB[o]"
    ffmpeg(*args, "-filter_complex", g, "-map", "[o]", "-c:a", "pcm_s16le", destino)
    return len(puntos)


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
    tramos, palabras_out, cortes, offset, rehechas = [], [], [], 0.0, 0
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
            cortes.append(round(offset, 3))
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
        voz = ("" if a.sin_limpiar else LIMPIEZA + ",") + "dynaudnorm=f=250:g=15"
        sfx, n_sfx = None, 0
        if a.sfx:
            sfx = Path(tmp, "sfx.wav")
            n_sfx = pista_sfx(cortes[:-1], offset, sfx, a.vol_sfx, pop_inicio=bool(a.gancho))
            sfx = sfx if n_sfx else None
        render(entradas, tramos, final, a.formato, a.modo, post_v, voz,
               "loudnorm=I=-14:TP=-1.5:LRA=11", DESTINOS["reels"], cwd=tmp, musica=a.musica, vol_musica=a.vol_musica,
               zoom=a.zoom, sfx=sfx)
        nivelar(final, Path(tmp, "nivelado.mp4"))  # el loudnorm de arriba, en un reel corto, queda en -16/-17
        shutil.move(str(Path(tmp, "nivelado.mp4")), str(final))
    # Las palabras en el tiempo del video FINAL y sus cortes: de aca salen los titulos y las tarjetas sincronizadas.
    Path(final).with_suffix(".palabras.json").write_text(json.dumps({
        "words": [{"word": t, "start": round(x, 3), "end": round(y, 3)} for x, y, t in palabras_out],
        "cortes": cortes[:-1], "duracion": round(offset, 3)}, ensure_ascii=False), encoding="utf-8")
    extras = [x for x in (nota, f"{rehechas} frases reempezadas sacadas" if rehechas else "",
                          "con musica" if a.musica else "", f"{n_sfx} efectos" if n_sfx else "",
                          f"zoom {a.zoom}" if a.zoom else "", f"perfil {a.perfil}" if a.perfil else "") if x]
    largo = duracion(final)
    print(f"LISTO -> {final}  ({hms(sum(durs))} de crudo -> {hms(largo)}; " + "; ".join(extras) + ")")
    rango = getattr(a, "_duracion", None)
    if rango and not rango[0] <= largo <= rango[1]:
        print(f"AVISO: el perfil {a.perfil} pide entre {rango[0]} y {rango[1]} s; este dura {largo:.0f} s")


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
    if a.xml and not AUTOEDITOR:
        sys.exit("ERROR: --xml necesita auto-editor (esta en el kit de las PC, no en el servidor)")
    if a.xml:
        out = salida(a.video, f"sinsilencios-{a.xml}", {"premiere": ".xml"}.get(a.xml, ".fcpxml"))
        cmd = [AUTOEDITOR, str(a.video), "--margin", f"{a.margen}s", "--no-open", "--progress", "none",
               "--edit", f"audio:threshold={10 ** (a.umbral / 20):.4f}", "-o", str(out),
               "--export", {"fcp": "final-cut-pro"}.get(a.xml, a.xml)]
        r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
        if r.returncode or not out.exists():
            sys.exit("ERROR auto-editor: " + (r.stderr or r.stdout).strip()[-600:])
        aviso = "; VIDEO ROTADO: al importar, pasar la secuencia a vertical" if rotacion(stream_video(a.video)) in (90, 270) else ""
        ok(out, f"importar en {a.xml}; los cortes quedan editables en el timeline{aviso}")
        return out
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


def centro_de_caras(video, n=20):
    """Centro horizontal (0 a 1) de la cara mas grande en n cuadros parejos; None si casi no hay caras.
    shortcut: una posicion para todo el clip (camara fija); si la persona camina por el cuadro, hace falta seguirla."""
    import cv2
    d = duracion(video)
    det = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    xs = []
    with tempfile.TemporaryDirectory() as tmp:
        for i in range(n):
            png = Path(tmp, f"c{i}.png")
            ffmpeg("-ss", f"{d * (i + 0.5) / n:.2f}", "-i", Path(video).resolve(), "-frames:v", "1", "-vf", "scale=640:-2", png)
            img = cv2.imread(str(png), cv2.IMREAD_GRAYSCALE)
            caras = det.detectMultiScale(img, 1.1, 6, minSize=(40, 40)) if img is not None else []
            if len(caras):
                x, _, fw, _ = max(caras, key=lambda c: c[2] * c[3])
                xs.append((x + fw / 2) / img.shape[1])
    xs.sort()
    return xs[len(xs) // 2] if len(xs) >= max(3, n // 4) else None


def c_vertical(a):
    w, h = FORMATOS[a.formato]
    out = salida(a.video, a.formato.replace(":", "x"))
    if a.modo == "cara":
        cx = centro_de_caras(a.video)
        if cx is None:
            sys.exit("ERROR: casi no se ven caras en el video: usa --modo recorte o fondo")
        vw, vh = medidas(a.video)
        cw = min(vw, round(vh * w / h / 2) * 2)
        x = min(max(0, round(cx * vw - cw / 2)), vw - cw)
        ffmpeg("-i", a.video, "-vf", f"crop={cw}:{vh}:{x}:0,scale={w}:{h},setsar=1", *H264, "-crf", "19", out)
        ok(out, f"{w}x{h} centrado en la cara (x={cx:.2f} del ancho)")
        return out
    ffmpeg("-i", a.video, "-filter_complex", cadena_formato(a.formato, a.modo), *H264, "-crf", "19", out)
    ok(out, f"{w}x{h} {a.modo}")
    return out


def nivelar(video, destino, lufs=-14):
    """Volumen para redes en dos pasadas: mide y despues aplica una ganancia fija (el video se copia). Con una sola
    pasada (loudnorm dinamico) un reel de 13 s quedaba en -17 LUFS o con picos de -0,4 dBFS (30/10).
    Devuelve los LUFS que tenia."""
    objetivo = f"loudnorm=I={lufs}:TP=-1.5:LRA=11"
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(video), "-vn", "-af",
                        objetivo + ":print_format=json", "-f", "null", "-"],
                       capture_output=True, text=True, encoding="utf-8", errors="replace")
    bloque = re.search(r"\{[^{}]*\"input_i\"[^{}]*\}", r.stderr)
    if not bloque:
        sys.exit("ERROR: no se pudo medir el volumen. " + r.stderr.strip()[-300:])
    m = json.loads(bloque.group())
    medido = (f":measured_I={m['input_i']}:measured_TP={m['input_tp']}:measured_LRA={m['input_lra']}"
              f":measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true")
    ffmpeg("-i", Path(video).resolve(), "-af", objetivo + medido, "-map", "0:v?", "-map", "0:a", "-c:v", "copy",
           "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", Path(destino).resolve())
    return m["input_i"]


def c_normalizar(a):
    out = salida(a.video, "audio")
    antes = nivelar(a.video, out, a.lufs)
    ok(out, f"audio de {antes} a {a.lufs} LUFS")
    return out


def c_limpiar(a):
    out = salida(a.video, "limpio")
    ffmpeg("-i", Path(a.video).resolve(), "-af", LIMPIEZA, "-map", "0:v?", "-map", "0:a", "-c:v", "copy",
           "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", Path(out).resolve())
    ok(out, "voz limpia, sin nivelar: despues va vtool normalizar")
    return out


def c_musica(a):
    """Suma la pista a un video ya cortado sin recomprimir la imagen."""
    out = salida(a.video, "musica")
    d = duracion(a.video)
    with tempfile.TemporaryDirectory() as tmp:
        ffmpeg("-i", Path(a.video).resolve(), "-stream_loop", "-1", "-i", Path(a.musica).resolve(), "-filter_complex",
               "[0:a]aformat=sample_rates=48000:channel_layouts=stereo[ac];" + cadena_musica(1, d, a.vol_musica),
               "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-t", f"{d:.3f}",
               Path(tmp, "m.mp4"))
        nivelar(Path(tmp, "m.mp4"), Path(out).resolve())
    ok(out, f"musica a {a.vol_musica} dB, por debajo de la voz")
    return out


def medir_zonas(gris, caras, escala=1.0):
    """Cuanta luz hay en cada zona de texto y si hay una cara ahi. gris: cuadro 1080x1920 (a `escala`) en grises."""
    res = {}
    for z, (a, b) in ZONAS.items():
        recorte = gris[int(a * escala):int(b * escala), int(110 * escala):int(970 * escala)]
        res[z] = {"luz": round(float(recorte.mean()) / 255, 3), "dispersion": round(float(recorte.std()) / 255, 3),
                  "cara": any(y < b and y + alto > a for y, alto in caras)}
    return res


def c_zonas(a):
    """Por cada segundo: luz de las zonas de texto y caras. armar.mjs lo usa para poner los titulos donde no tapan
    a nadie y con la tinta que se lee."""
    import cv2
    out = Path(a.video).with_suffix(".zonas.json")
    det = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    filas = []
    with tempfile.TemporaryDirectory() as tmp:
        ffmpeg("-i", Path(a.video).resolve(), "-vf", "fps=1,scale=540:960", Path(tmp, "c%04d.png"))
        for i, png in enumerate(sorted(Path(tmp).glob("c*.png"))):
            gris = cv2.imread(str(png), cv2.IMREAD_GRAYSCALE)
            caras = [(int(y) * 2, int(h * 1.2) * 2) for (_, y, _, h) in det.detectMultiScale(gris, 1.1, 6, minSize=(40, 40))]
            filas.append({"t": i, **medir_zonas(gris, caras, 0.5)})
    out.write_text(json.dumps(filas), encoding="utf-8")
    ok(out, f"{len(filas)} s, cara en {sum(1 for f in filas if f['arriba']['cara'] or f['abajo']['cara'])}")
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
    elif canal_de_voz(niveles_canales(a.video, 600)) is not None:
        alertas.append("la voz esta en un solo canal: se escucha de un lado (rearmar con vtool reel o jornada)")
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
    usar_perfil(a)
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
    """Varios crudos de una jornada -> un video, o VARIOS si el guion tiene bloques separados con ---.
    Con --guion, una toma por linea del guion y en ese orden."""
    usar_perfil(a)
    videos = videos_de(a.carpeta)
    if not videos:
        sys.exit(f"ERROR: no hay videos en {a.carpeta}")
    todas = []
    for k, v in enumerate(videos):
        palabras, _ = palabras_de(v, a)
        todas += [(k, t) for t in armar_tomas(palabras)]
    guion = a.guion or (Path(a.carpeta, "guion.txt") if Path(a.carpeta, "guion.txt").is_file() else None)
    base = Path(a.carpeta).resolve().name
    if not guion:
        elegidas = [(k, t) for k, t in todas if not t["marcas"]]
        print(f"  {len(elegidas)} tomas OK de {len(todas)} en {len(videos)} videos")
        if not elegidas:
            sys.exit("ERROR: no hay tomas para usar.")
        producir(videos, elegidas, a, Path(a.carpeta, base + "__JORNADA.mp4"))
        return
    bloques = bloques_guion(Path(guion).read_text(encoding="utf-8"))
    if not bloques:
        sys.exit(f"ERROR: {guion} no tiene lineas")
    usadas, hechos = {}, 0
    for i, b in enumerate(bloques, 1):
        titulo = b["nombre"] or f"REEL{i}"
        if len(bloques) > 1:
            print(f"== {titulo}")
        elegidas = []
        for linea, par in zip(b["lineas"], elegir_por_guion(b["lineas"], todas)):
            if not par:
                print(f"  {linea[:50]:<50} <- FALTA (ninguna toma se parece)")
                continue
            clave = (par[0], par[1]["n"])
            repetida = f" (ALERTA: ya usada en {usadas[clave]})" if clave in usadas else ""
            usadas.setdefault(clave, titulo)
            elegidas.append(par)
            print(f"  {linea[:50]:<50} <- {videos[par[0]].name} toma {par[1]['n']}{repetida}")
        if not elegidas:
            print(f"  ALERTA {titulo}: ninguna linea tiene toma, no se armo")
            continue
        nombre = re.sub(r"[^\w-]+", "-", titulo)
        final = Path(a.carpeta, f"{base}__{nombre}.mp4" if len(bloques) > 1 else f"{base}__JORNADA.mp4")
        producir(videos, elegidas, argparse.Namespace(**{**vars(a), "gancho": b["gancho"] or a.gancho}), final)
        hechos += 1
    if not hechos:
        sys.exit("ERROR: no hay tomas para usar.")


# ---------- perfiles por nicho ----------

PERFILES_BASE = ("inmobiliario", "turismo-hoteleria", "gastronomico", "deportivo", "belleza-moda",
                 "producto-ecommerce", "corporativo-industrial")


def dirs_perfiles():
    """La carpeta compartida del equipo (variable VTOOL_PERFILES, ej. una carpeta de Drive) gana sobre la del kit."""
    ds = [Path(__file__).parent / "perfiles"]
    if os.environ.get("VTOOL_PERFILES"):
        ds.insert(0, Path(os.environ["VTOOL_PERFILES"]))
    return [d for d in ds if d.is_dir()]


def cargar_perfil(nombre):
    for d in dirs_perfiles():
        p = d / f"{nombre}.json"
        if p.is_file():
            return json.loads(p.read_text(encoding="utf-8-sig")), p  # -sig: Bloc de notas guarda con BOM
    hay = sorted({p.stem for d in dirs_perfiles() for p in d.glob("*.json")})
    sys.exit(f"ERROR: no existe el perfil {nombre}. Hay: {', '.join(hay) or 'ninguno'}")


def usar_perfil(a):
    if not a.perfil:
        return
    perfil, ruta = cargar_perfil(a.perfil)
    aplicar_perfil(vars(a), perfil, {x.split("=")[0] for x in sys.argv})
    if a.sin_sfx:
        a.sfx = False
    a._duracion = perfil.get("duracion")
    guia = ruta.with_suffix(".md")
    print(f"Perfil {a.perfil}: {perfil.get('descripcion', '')}" + (f"  (guia: {guia})" if guia.exists() else ""))


def c_perfiles(_):
    vistos = set()
    for d in dirs_perfiles():
        for p in sorted(d.glob("*.json")):
            if p.stem in vistos:
                continue
            vistos.add(p.stem)
            try:
                datos = json.loads(p.read_text(encoding="utf-8-sig"))
            except ValueError as e:
                print(f"{p.stem:<22} ERROR: el archivo no es un JSON valido ({e})  [{d}]")
                continue
            print(f"{p.stem:<22} {datos.get('descripcion', '')[:90]}  [{d}]")
    if not vistos:
        print("No hay perfiles.")


def medir_referencia(video, idioma, modelo):
    d = duracion(video)
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(video), "-vf", "select='gt(scene,0.3)',showinfo",
                        "-af", "ebur128", "-f", "null", "-"], capture_output=True, text=True, encoding="utf-8", errors="replace")
    cortes = [float(t) for t in re.findall(r"pts_time:([\d.]+)", r.stderr)]
    lufs = re.findall(r"I:\s+(-?[\d.]+) LUFS", r.stderr)
    r2 = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(video), "-an", "-vf",
                         "fps=2,signalstats,metadata=print", "-f", "null", "-"],
                        capture_output=True, text=True, encoding="utf-8", errors="replace")
    brillo = [float(x) for x in re.findall(r"signalstats\.YAVG=([\d.]+)", r2.stderr)]
    satur = [float(x) for x in re.findall(r"signalstats\.SATAVG=([\d.]+)", r2.stderr)]
    palabras, _ = transcribir(video, idioma, modelo)
    import statistics as st
    return {"archivo": Path(video).name, "duracion": round(d, 1), "cortes": len(cortes),
            "plano_medio": round(d / (len(cortes) + 1), 2), "primer_corte": round(cortes[0], 1) if cortes else None,
            "palabras_por_seg": round(len(palabras) / d, 2) if d else 0,
            "lufs": float(lufs[-1]) if lufs else None,
            "brillo": round(st.mean(brillo)) if brillo else None, "saturacion": round(st.mean(satur)) if satur else None}


def c_referencia(a):
    """Mide videos de referencia de un nicho (ritmo, voz, volumen, look) y, con --guardar, arma el borrador del perfil."""
    import statistics as st
    videos = []
    for x in a.videos:
        videos += videos_de(x) if Path(x).is_dir() else [Path(x)]
    if not videos:
        sys.exit("ERROR: no hay videos para medir")
    medidas = []
    for v in videos:
        m = medir_referencia(v, a.idioma, a.modelo)
        medidas.append(m)
        print(f"{m['archivo'][:28]:<28} {hms(m['duracion'])} | {m['cortes']:>3} cortes, plano medio {m['plano_medio']} s, "
              f"primer corte {m['primer_corte']} s | {m['palabras_por_seg']} pal/s | {m['lufs']} LUFS | "
              f"brillo {m['brillo']} sat {m['saturacion']}")
        c_hoja(argparse.Namespace(video=v, columnas=4, filas=4))
    med = {k: round(st.median([m[k] for m in medidas if m[k] is not None]), 2)
           for k in ("duracion", "plano_medio", "palabras_por_seg", "lufs", "brillo", "saturacion")
           if any(m[k] is not None for m in medidas)}
    print("MEDIANA: " + " | ".join(f"{k} {v}" for k, v in med.items()))
    if not a.guardar:
        return
    destino = dirs_perfiles()[0] if dirs_perfiles() else Path(__file__).parent / "perfiles"
    destino.mkdir(exist_ok=True)
    js = destino / f"{a.guardar}.json"
    if js.exists():
        sys.exit(f"ERROR: ya existe {js}. Elegi otro nombre o borralo a mano.")
    wps, plano = med.get("palabras_por_seg", 0), med.get("plano_medio", 5)
    durs = [m["duracion"] for m in medidas]
    perfil = {
        "nombre": a.guardar,
        "descripcion": f"BORRADOR medido de {len(medidas)} referencias: completar la guia .md antes de usarlo",
        "reel": {"pausa": 0.5 if wps >= 2.8 else 0.65 if wps >= 2.2 else 0.85,
                 "zoom": 1.12 if plano < 2.5 and wps > 1 else 0, "sfx": plano < 3.0},
        "duracion": [max(5, round(min(durs) * 0.9)), round(max(durs) * 1.1)],
        "medidas": {**med, "referencias": [m["archivo"] for m in medidas]},
    }
    js.write_text(json.dumps(perfil, ensure_ascii=False, indent=2), encoding="utf-8")
    js.with_suffix(".md").write_text(
        f"# Perfil {a.guardar} (BORRADOR)\n\nMedido de: {', '.join(perfil['medidas']['referencias'])}\n"
        f"Mediana: {json.dumps(med, ensure_ascii=False)}\n\n"
        "Completar mirando las hojas de contacto (`__hoja.jpg`) de cada referencia:\n\n"
        "## Gancho (0-2 s)\n- \n\n## Estructura\n- \n\n## Planos que no pueden faltar\n- \n\n"
        "## Subtitulos y textos\n- \n\n## Color y look\n- \n\n## Musica y efectos\n- \n\n"
        "## Llamado a la accion\n- \n\n## Que NO hacer\n- \n", encoding="utf-8")
    ok(js, "borrador: completar la guia .md y probarlo con un crudo real antes de usarlo con clientes")


ANGULOS = ["top-down overhead shot, the whole scene visible, slight slow push-in",
           "POV from INSIDE [objeto que nombra], face and hand in sharp focus",
           "extreme macro of [prop que nombra], razor-sharp focus, creamy bokeh",
           "same framing, EXACTLY the same movements, now in [otro lugar], [otra ropa]",
           "low-angle shot from the floor, slow push-in"]


def c_angulos(a):
    """Metodo "una toma, seis angulos" (Seedance 2.5): escenas amarradas a frases y segundos + el prompt armado."""
    palabras, _ = transcribir(a.video, a.idioma, a.modelo)
    if not palabras:
        sys.exit("ERROR: no se detecto voz.")
    d = duracion(a.video)
    if d > 30.5:
        print(f"AVISO: dura {d:.0f} s y Seedance acepta hasta 30 s. Corta antes con vtool cortar.")
    escenas = segmentar_angulos(palabras, a.cambios)
    escenas[-1] = (escenas[-1][0], round(min(d, 30.0), 1), escenas[-1][2], escenas[-1][3])
    lineas, n = [], 0
    for i, (ini, fin, texto, original) in enumerate(escenas, 1):
        ps = texto.split()
        cita = " ".join(ps[:8]) + ("..." if len(ps) > 8 else "")
        if original:
            plano = "ORIGINAL frontal shot." if i == 1 else "back to the ORIGINAL frontal shot."
        else:
            plano = f"[ANGULO: {ANGULOS[n % len(ANGULOS)]}]"
            n += 1
        lineas.append(f"SHOT {i} ({ini}-{fin} s) '{cita}' -> {plano}")
    prompt = ("Recreate the reference video second by second. One frontal take of [SUJETO: edad, ropa, lugar, objetos a la "
              "vista], talking to camera in Spanish. Keep the performance 100% identical: same body, head, mouth, hand "
              "gestures and timing at every second. Keep the face and eyes exactly as in the reference, do not alter them. "
              "Only these shots, cut exactly on these words and seconds:\n\n" + "\n".join(lineas) +
              "\n\nRULES cuts only at these seconds, never late. No other angles, no studio lights, no text.\n"
              "LOOK [camara, ej. Sony A7IV], natural film color, real skin texture, photorealistic.\n")
    out = salida(a.video, "angulos", ".txt")
    out.write_text(prompt, encoding="utf-8")
    print(prompt)
    ok(out, f"{len(escenas)} escenas, {n} angulos nuevos: completar [SUJETO], [ANGULO] y [camara]; generar en Seedance "
            "2.5 con ESTE video como unica referencia; despues vtool audio-original")


def c_audio_original(a):
    """Le pone al video generado por IA el audio original de la toma (paso final del metodo de los angulos)."""
    out = salida(a.generado, "audio-original", ".mp4")
    ffmpeg("-i", Path(a.generado).resolve(), "-i", Path(a.original).resolve(), "-map", "0:v:0", "-map", "1:a:0",
           "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", out)
    dg, do = duracion(a.generado), duracion(a.original)
    ok(out, f"generado {dg:.1f} s, original {do:.1f} s" +
       ("; AVISO: los largos no coinciden, revisar que la boca vaya con la voz" if abs(dg - do) > 0.3 else ""))


def c_historias(a):
    """Corta un reel terminado en historias de hasta 15 s, siempre al final de una frase."""
    palabras, _ = transcribir(a.video, a.idioma, a.modelo)
    if not palabras:
        sys.exit("ERROR: no se detecto voz.")
    d = duracion(a.video)
    partes = partes_historia(palabras, a.maximo)
    for n, (i, f) in enumerate(partes, 1):
        out = salida(a.video, f"historia{n}", ".mp4")
        render([a.video], [(0, max(0.0, i - 0.15), min(d, f + 0.3))], out, extra=["-crf", "18", "-fpsmax", "60"])
        ok(out, f"{hms(i)}-{hms(f)}")


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
    guiones = bloques_guion("# Placares\ngancho: Tu *placar*\nHola\nChau\n---\n\n# Vestidores\nOtra\n--- \n\n")
    assert [(b["nombre"], b["gancho"], b["lineas"]) for b in guiones] == [
        ("Placares", "Tu *placar*", ["Hola", "Chau"]), ("Vestidores", None, ["Otra"])], guiones
    assert [b["lineas"] for b in bloques_guion("una\ndos\n")] == [["una", "dos"]]
    assert canal_de_voz([-28.4, -70.0]) == 0 and canal_de_voz([-70.0, -28.4]) == 1
    assert canal_de_voz([-20, -22]) is None and canal_de_voz([-20]) is None
    import numpy
    z = medir_zonas(numpy.full((1920, 1080), 255, dtype=numpy.uint8), [(500, 200)])
    assert z["arriba"] == {"luz": 1.0, "dispersion": 0.0, "cara": True} and not z["abajo"]["cara"], z
    # 1.4: angulos, efectos, historias y perfiles
    voz = [(0.0, 0.4, "Esta"), (0.4, 0.8, "es"), (0.8, 1.2, "la"), (1.2, 3.0, "toma."), (3.1, 3.5, "Mirá"),
           (3.5, 6.2, "arriba,"), (6.3, 7.0, "y"), (7.0, 9.8, "abajo."), (9.9, 13.0, "Fin.")]
    esc = segmentar_angulos(voz, cambios=1)
    assert esc[0][0] == 0.0 and esc[0][3] and not esc[1][3] and all(e[3] for e in esc[2:]), esc  # 1 angulo nuevo
    assert all(esc[i][1] == esc[i + 1][0] for i in range(len(esc) - 1))  # sin huecos entre escenas
    assert elegir_sfx([0.1, 1.0, 2.0, 2.5, 5.0, 6.0]) == [1.0, 5.0]
    assert partes_historia([(0, 5, "uno."), (6, 12, "dos."), (13, 20, "tres.")], 15) == [(0, 12), (13, 20)]
    op = aplicar_perfil({"pausa": 0.75, "zoom": 0, "color": "#FFD400"}, {"reel": {"pausa": 0.5, "zoom": 1.12}}, {"--zoom"})
    assert op == {"pausa": 0.5, "zoom": 0, "color": "#FFD400"}, op  # lo escrito a mano gana sobre el perfil
    for nombre in PERFILES_BASE:  # solo los del kit: un perfil del equipo a medio hacer no frena la instalacion
        p = Path(__file__).parent / "perfiles" / f"{nombre}.json"
        datos = json.loads(p.read_text(encoding="utf-8-sig"))
        assert {"descripcion", "reel", "duracion"} <= datos.keys(), f"perfil incompleto: {p.name}"
        assert p.with_suffix(".md").exists(), f"falta la guia de {p.name}"
    for prog in ("ffmpeg", "ffprobe"):
        assert shutil.which(prog), f"falta {prog} en el PATH"
    with tempfile.TemporaryDirectory() as tmp:  # render real: 2 clips de 1 s unidos con formato, zoom y efectos
        for n, fuente in (("a", "testsrc2"), ("b", "smptebars")):
            ffmpeg("-f", "lavfi", "-i", f"{fuente}=size=640x360:rate=30:d=1", "-f", "lavfi", "-i", "sine=f=300:d=1",
                   "-shortest", *H264, Path(tmp, f"{n}.mp4"))
        pista_sfx([1.0], 2.0, Path(tmp, "s.wav"), -20, pop_inicio=True)
        render([Path(tmp, "a.mp4"), Path(tmp, "b.mp4")], [(0, 0, 1), (1, 0, 1)], Path(tmp, "o.mp4"), "9:16",
               "fondo", zoom=1.12, sfx=Path(tmp, "s.wav"), final_a="loudnorm=I=-14", extra=["-preset", "ultrafast"])
        assert medidas(Path(tmp, "o.mp4")) == (1080, 1920) and duracion(Path(tmp, "o.mp4")) > 1.9
    try:
        import faster_whisper  # noqa: F401
        assert AUTOEDITOR, "falta auto-editor (pip install -r requirements.txt)"
    except ImportError:  # contenedor: transcribe con hyperframes + whisper-cli, sin auto-editor
        assert HYPERFRAMES[0] and shutil.which(HYPERFRAMES[0]), "falta hyperframes (o npx) en el PATH"
        # en Linux hyperframes compilaria whisper.cpp la primera vez (cmake + compilador): tiene que estar ya
        assert os.name == "nt" or shutil.which("whisper-cli"), "falta whisper-cli en el PATH"
    filtros = subprocess.run(["ffmpeg", "-hide_banner", "-filters"], capture_output=True, text=True).stdout
    assert " afftdn " in filtros, "este ffmpeg no trae afftdn (limpieza de voz)"
    import cv2
    assert Path(cv2.data.haarcascades, "haarcascade_frontalface_default.xml").exists(), "OpenCV sin detector de caras"
    assert ajuste_de_luz(0.5, (0.5, 0.5, 0.5), 0.3) == (1.0, (1.0, 1.0, 1.0))  # bien expuesto y neutro: no toca
    assert 1.4 < ajuste_de_luz(0.25, None, 0)[0] <= 1.6  # oscuro: aclara
    assert ajuste_de_luz(0.8, None, 0)[0] == 1.0  # claro: nunca oscurece
    _, k = ajuste_de_luz(0.5, (0.6, 0.5, 0.45), 0.2)
    assert k[0] < 1 < k[2], k  # calido: baja el rojo y sube el azul
    assert ajuste_de_luz(0.5, (0.6, 0.5, 0.45), 0.01)[1] == (1.0, 1.0, 1.0)  # pocos grises: no adivina
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
        s.add_argument("--fuente", default="Arial", help="tipografia instalada en Windows (ej. Montserrat)")
        s.add_argument("--posicion", choices=["auto", "abajo", "arriba"], default="auto",
                       help="auto: mira el video y evita tapar caras")
        s.add_argument("--gancho", help="texto grande arriba los primeros 3 s")
        s.add_argument("--musica", help="pista de musica: queda por debajo de la voz y baja sola cuando se habla")
        s.add_argument("--vol-musica", type=float, default=-18, help="volumen de la musica en dB (-18)")
        s.add_argument("--pausa", type=float, default=0.75,
                       help="corta pausas mas largas que esto, en s (0.75). Menos = mas cortes, pero chicos se ven como saltos")
        s.add_argument("--sin-subtitulos", action="store_true")
        s.add_argument("--sin-limpiar", action="store_true", help="no limpiar el ruido de la voz (audio ya limpio)")
        s.add_argument("--con-silencios", action="store_true", help="no cortar pausas dentro de cada toma")
        s.add_argument("--con-repeticiones", action="store_true", help="no sacar frases reempezadas")
        s.add_argument("--perfil", help="estilo de edicion por nicho (vtool perfiles los lista): inmobiliario, deportivo...")
        s.add_argument("--zoom", type=float, default=0, help="acercar un tramo si y uno no, ej. 1.12 (0 = no)")
        s.add_argument("--sfx", action="store_true", help="whoosh en los cortes y pop en el gancho, sin ametralladora")
        s.add_argument("--sin-sfx", action="store_true", help="apaga los efectos aunque el perfil los pida")
        s.add_argument("--vol-sfx", type=float, default=-20, help="volumen de los efectos en dB (-20)")

    cmd("info", c_info, "Resumen de una linea: duracion, resolucion, rotacion, fps, audio, peso.")

    s = cmd("silencios", c_silencios, "Quita tiempos muertos por volumen (no mira el contenido: para crudos con "
            "varias tomas usar reel).")
    s.add_argument("--margen", type=float, default=0.15, help="segundos de aire antes/despues de cada frase (0.15)")
    s.add_argument("--umbral", type=float, default=-35, help="dB que cuentan como silencio; -30 corta mas (-35)")
    s.add_argument("--pausa", type=float, default=0.5, help="solo corta silencios mas largos que esto, en s (0.5)")
    s.add_argument("--xml", choices=["premiere", "resolve", "fcp"], help="en vez de video, timeline editable")

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

    s = cmd("jornada", c_jornada, "Una carpeta de crudos -> un video, o varios si el guion tiene bloques separados "
            "con ---. Con --guion elige la mejor toma de cada linea.",
            video=False)
    s.add_argument("carpeta")
    s.add_argument("--guion", help="archivo .txt con una frase por linea, en el orden del video "
                   "(si no se indica, usa guion.txt de la carpeta si existe). Una linea --- separa un reel del "
                   "siguiente; opcional al principio de cada uno: \"# nombre\" y \"gancho: Frase\"")
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
    s.add_argument("--modo", choices=["fondo", "recorte", "cara"], default="fondo",
                   help="fondo = video entero con fondo desenfocado; recorte = recorta al centro; cara = recorta centrado en la cara")
    s = cmd("luz", c_luz, "Corrige la exposicion de un crudo oscuro (solo aclara) y, con --blanco, el tinte medido en los grises.")
    s.add_argument("--blanco", action="store_true", help="tambien corrige el tinte de color (si hay grises suficientes para medirlo)")

    s = cmd("normalizar", c_normalizar, "Nivela el volumen para redes (-14 LUFS).")
    s.add_argument("--lufs", type=float, default=-14)

    cmd("limpiar", c_limpiar, "Saca rumble y ruido de fondo de la voz, sin tocar la imagen.")

    s = cmd("musica", c_musica, "Suma una pista a un video ya cortado: queda por debajo de la voz y baja sola cuando "
            "se habla. No recomprime la imagen.")
    s.add_argument("musica")
    s.add_argument("--vol-musica", type=float, default=-18, help="volumen de la musica en dB (-18)")

    cmd("zonas", c_zonas, "Luz y caras en las zonas de texto, por segundo (lo usa armar.mjs).")

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

    cmd("perfiles", c_perfiles, "Lista los perfiles de edicion por nicho (del kit y de la carpeta VTOOL_PERFILES).",
        video=False)

    s = cmd("referencia", c_referencia, "Mide videos de referencia de un nicho (ritmo de cortes, voz, volumen, look). "
            "Con --guardar NOMBRE arma el borrador de un perfil nuevo.", video=False)
    s.add_argument("videos", nargs="+", help="videos o carpetas")
    s.add_argument("--guardar", help="nombre del perfil nuevo (ej. gastronomia)")
    s.add_argument("--idioma", default="es")
    s.add_argument("--modelo", default="small")

    s = cmd("angulos", c_angulos, "Una toma, seis angulos (Seedance 2.5): escenas por frase + prompt con la estructura.")
    s.add_argument("--cambios", type=int, default=5, help="cuantos angulos nuevos como maximo (5)")
    s.add_argument("--idioma", default="es")
    s.add_argument("--modelo", default="small")

    s = cmd("audio-original", c_audio_original, "Pone el audio original de la toma en el video generado por IA.",
            video=False)
    s.add_argument("generado")
    s.add_argument("original")

    s = cmd("historias", c_historias, "Corta un reel terminado en historias de hasta 15 s, al final de una frase.")
    s.add_argument("--maximo", type=float, default=15)
    s.add_argument("--idioma", default="es")
    s.add_argument("--modelo", default="small")

    s = cmd("lote", c_lote, "Aplica un comando a todos los videos de una carpeta. Ej: vtool lote D:\\crudos reel",
            video=False)
    s.add_argument("carpeta")
    s.add_argument("comando")
    s.add_argument("resto", nargs=argparse.REMAINDER)

    cmd("autotest", c_autotest, "Verifica que el kit funciona.", video=False)

    a = p.parse_args()
    if getattr(a, "video", None) and not Path(a.video).is_file():
        sys.exit(f"ERROR: no existe {a.video}")
    for campo in ("musica", "guion", "media", "srt", "palabras", "generado", "original"):
        if getattr(a, campo, None) and not Path(getattr(a, campo)).is_file():
            sys.exit(f"ERROR: no existe {getattr(a, campo)}")
    if getattr(a, "carpeta", None) and not Path(a.carpeta).is_dir():
        sys.exit(f"ERROR: no existe la carpeta {a.carpeta}")
    a.fn(a)


if __name__ == "__main__":
    main()
