"""Arma el vtool del contenedor desde el del kit de las PC (plan 17/11, fase 2). Reproducible: cada reemplazo tiene un
ancla que se verifica; si el kit cambió y un ancla no está, frena en vez de dejar un vtool roto.

    python -I desde-kit.py C:\\LMTM\\video-kit      → escribe vtool.py y perfiles/ al lado de este script

Qué cambia contra el kit:
  · transcribe con el Whisper de HyperFrames (whisper.cpp) si faster-whisper no está instalado (el contenedor no lo trae);
  · auto-editor es opcional (solo sirve para exportar XML en una PC);
  · VERSION propia, para saber en el log cuál corre.
El kit y el agente son productos separados (Naza 09/11): esto copia código, no decisiones; una mejora se decide aparte.
"""
import shutil
import sys
from pathlib import Path

AQUI = Path(__file__).parent
kit = Path(sys.argv[1] if len(sys.argv) > 1 else r"C:\LMTM\video-kit")
t = (kit / "vtool.py").read_text(encoding="utf-8")


def cambiar(viejo: str, nuevo: str):
    global t
    assert t.count(viejo) == 1, f"ancla no encontrada (o repetida) en el kit: {viejo[:80]!r}"
    t = t.replace(viejo, nuevo)


cambiar('VERSION = "1.5"', 'VERSION = "1.6-lmtm-os"  # desde el kit 1.5 con desde-kit.py (17/11)')

cambiar('AUTOEDITOR = shutil.which("auto-editor", path=str(Path(sys.executable).parent)) or shutil.which("auto-editor")\n',
        'AUTOEDITOR = shutil.which("auto-editor", path=str(Path(sys.executable).parent)) or shutil.which("auto-editor")\n'
        '# En el contenedor de LMTM-OS `hyperframes` esta instalado global (Node 22); en otra maquina se baja con npx.\n'
        'HYPERFRAMES = [shutil.which("hyperframes")] if shutil.which("hyperframes") else [shutil.which("npx") or "npx", "-y", "hyperframes"]\n')

cambiar('    from faster_whisper import WhisperModel  # import tardio: los demas comandos no lo necesitan\n',
        '    try:\n'
        '        from faster_whisper import WhisperModel  # import tardio: los demas comandos no lo necesitan\n'
        '    except ImportError:  # contenedor de LMTM-OS: el Whisper de HyperFrames (whisper.cpp)\n'
        '        return transcribir_hyperframes(video, idioma, modelo, cache)\n')

cambiar('# ---------- render ----------\n',
        'def transcribir_hyperframes(video, idioma, modelo, cache):\n'
        '    print(f"Transcribiendo {Path(video).name} con whisper {modelo} (la primera vez baja el modelo)...")\n'
        '    with tempfile.TemporaryDirectory() as tmp:\n'
        '        # solo el audio: hyperframes con un crudo 4K de 1 GB lo decodificaria entero\n'
        '        ffmpeg("-i", Path(video).resolve(), "-vn", "-ac", "1", "-ar", "16000", Path(tmp, "audio.wav"))\n'
        '        r = subprocess.run([*HYPERFRAMES, "transcribe", str(Path(tmp, "audio.wav")), "--model", modelo, "--dir", tmp,\n'
        '                            *([] if idioma == "auto" else ["--language", idioma])],\n'
        '                           capture_output=True, text=True, encoding="utf-8", errors="replace",\n'
        '                           env={**os.environ, "HYPERFRAMES_NO_TELEMETRY": "1"})\n'
        '        destino = Path(tmp, "transcript.json")\n'
        '        if r.returncode or not destino.exists():\n'
        '            sys.exit("ERROR hyperframes transcribe: " + (r.stderr or r.stdout).strip()[-600:])\n'
        '        palabras = leer_palabras(destino)\n'
        '    cache.parent.mkdir(exist_ok=True)\n'
        '    cache.write_text(json.dumps({"palabras": palabras, "idioma": idioma}), encoding="utf-8")\n'
        '    return palabras, idioma\n\n\n'
        '# ---------- render ----------\n')

cambiar('    if a.xml:\n        out = salida(a.video, f"sinsilencios-{a.xml}"',
        '    if a.xml and not AUTOEDITOR:\n'
        '        sys.exit("ERROR: --xml necesita auto-editor (esta en el kit de las PC, no en el servidor)")\n'
        '    if a.xml:\n        out = salida(a.video, f"sinsilencios-{a.xml}"')

cambiar('    assert AUTOEDITOR, "falta auto-editor (pip install -r requirements.txt)"\n    import faster_whisper  # noqa: F401\n',
        '    try:\n'
        '        import faster_whisper  # noqa: F401\n'
        '        assert AUTOEDITOR, "falta auto-editor (pip install -r requirements.txt)"\n'
        '    except ImportError:  # contenedor: transcribe con hyperframes + whisper-cli, sin auto-editor\n'
        '        assert HYPERFRAMES[0] and shutil.which(HYPERFRAMES[0]), "falta hyperframes (o npx) en el PATH"\n'
        '        # en Linux hyperframes compilaria whisper.cpp la primera vez (cmake + compilador): tiene que estar ya\n'
        '        assert os.name == "nt" or shutil.which("whisper-cli"), "falta whisper-cli en el PATH"\n')

# Reencuadre siguiendo la cara (plan 17/11, fase 2): un plano horizontal de alguien hablando → 9:16 centrado en su cara.
cambiar('def c_vertical(a):\n    w, h = FORMATOS[a.formato]\n    out = salida(a.video, a.formato.replace(":", "x"))\n',
        'def centro_de_caras(video, n=20):\n'
        '    """Centro horizontal (0 a 1) de la cara mas grande en n cuadros parejos; None si casi no hay caras.\n'
        '    shortcut: una posicion para todo el clip (camara fija); si la persona camina por el cuadro, hace falta seguirla."""\n'
        '    import cv2\n'
        '    d = duracion(video)\n'
        '    det = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")\n'
        '    xs = []\n'
        '    with tempfile.TemporaryDirectory() as tmp:\n'
        '        for i in range(n):\n'
        '            png = Path(tmp, f"c{i}.png")\n'
        '            ffmpeg("-ss", f"{d * (i + 0.5) / n:.2f}", "-i", Path(video).resolve(), "-frames:v", "1", "-vf", "scale=640:-2", png)\n'
        '            img = cv2.imread(str(png), cv2.IMREAD_GRAYSCALE)\n'
        '            caras = det.detectMultiScale(img, 1.1, 6, minSize=(40, 40)) if img is not None else []\n'
        '            if len(caras):\n'
        '                x, _, fw, _ = max(caras, key=lambda c: c[2] * c[3])\n'
        '                xs.append((x + fw / 2) / img.shape[1])\n'
        '    xs.sort()\n'
        '    return xs[len(xs) // 2] if len(xs) >= max(3, n // 4) else None\n\n\n'
        'def c_vertical(a):\n    w, h = FORMATOS[a.formato]\n    out = salida(a.video, a.formato.replace(":", "x"))\n'
        '    if a.modo == "cara":\n'
        '        cx = centro_de_caras(a.video)\n'
        '        if cx is None:\n'
        '            sys.exit("ERROR: casi no se ven caras en el video: usa --modo recorte o fondo")\n'
        '        vw, vh = medidas(a.video)\n'
        '        cw = min(vw, round(vh * w / h / 2) * 2)\n'
        '        x = min(max(0, round(cx * vw - cw / 2)), vw - cw)\n'
        '        ffmpeg("-i", a.video, "-vf", f"crop={cw}:{vh}:{x}:0,scale={w}:{h},setsar=1", *H264, "-crf", "19", out)\n'
        '        ok(out, f"{w}x{h} centrado en la cara (x={cx:.2f} del ancho)")\n'
        '        return out\n')
cambiar('''    s = cmd("vertical", c_vertical, "Cambia el formato (9:16, 1:1, 4:5, 16:9).")
    s.add_argument("--formato", choices=list(FORMATOS), default="9:16")
    s.add_argument("--modo", choices=["fondo", "recorte"], default="fondo",
                   help="fondo = video entero con fondo desenfocado; recorte = recorta al centro")''',
        '''    s = cmd("vertical", c_vertical, "Cambia el formato (9:16, 1:1, 4:5, 16:9).")
    s.add_argument("--formato", choices=list(FORMATOS), default="9:16")
    s.add_argument("--modo", choices=["fondo", "recorte", "cara"], default="fondo",
                   help="fondo = video entero con fondo desenfocado; recorte = recorta al centro; cara = recorta centrado en la cara")''')

# Exposición y blanco (plan 17/11, fase 2.1). Solo ACLARA (regla del Editor: no oscurecer el material). El blanco se
# corrige solo con --blanco y midiendo los píxeles casi grises: las paredes beige de una propiedad no son un tinte.
cambiar('# ---------- render ----------\n',
        'def ajuste_de_luz(luz, neutros, fraccion_neutros):\n'
        '    """Puro: (gamma, (r, g, b)). luz = brillo medio 0-1; neutros = media RGB 0-1 de los pixeles casi grises.\n'
        '    Aclara si esta oscuro (nunca oscurece); el tinte se corrige solo si hay grises suficientes para medirlo."""\n'
        '    import math\n'
        '    gamma = round(min(1.6, math.log(luz) / math.log(0.45)), 2) if 0.05 < luz < 0.37 else 1.0\n'
        '    ganancias = (1.0, 1.0, 1.0)\n'
        '    if neutros and fraccion_neutros >= 0.05:\n'
        '        m = sum(neutros) / 3\n'
        '        if m and max(abs(c - m) for c in neutros) / m > 0.05:\n'
        '            ganancias = tuple(round(min(1.15, max(0.87, m / c)), 3) for c in neutros)\n'
        '    return gamma, ganancias\n\n\n'
        'def medir_luz(video, n=12):\n'
        '    """(brillo medio 0-1, media RGB de los pixeles casi grises o None, fraccion de grises) en n cuadros parejos."""\n'
        '    import cv2\n'
        '    import numpy as np\n'
        '    d = duracion(video)\n'
        '    lumas, neutros, grises, total = [], [], 0, 0\n'
        '    with tempfile.TemporaryDirectory() as tmp:\n'
        '        for i in range(n):\n'
        '            png = Path(tmp, f"l{i}.png")\n'
        '            ffmpeg("-ss", f"{d * (i + 0.5) / n:.2f}", "-i", Path(video).resolve(), "-frames:v", "1", "-vf", "scale=320:-2", png)\n'
        '            img = cv2.imread(str(png))\n'
        '            if img is None:\n'
        '                continue\n'
        '            rgb = img[:, :, ::-1].reshape(-1, 3).astype("float32") / 255\n'
        '            lumas.append(float((rgb @ np.array([0.2126, 0.7152, 0.0722], dtype="float32")).mean()))\n'
        '            mx, mn = rgb.max(1), rgb.min(1)\n'
        '            gris = (mx > 0.25) & (mx < 0.95) & ((mx - mn) / np.maximum(mx, 1e-6) < 0.2)\n'
        '            total, grises = total + len(rgb), grises + int(gris.sum())\n'
        '            if gris.any():\n'
        '                neutros.append(rgb[gris].mean(0))\n'
        '    if not lumas:\n'
        '        sys.exit("ERROR: no se pudo leer ningun cuadro del video")\n'
        '    neu = tuple(float(x) for x in np.mean(neutros, 0)) if neutros else None\n'
        '    return sum(lumas) / len(lumas), neu, grises / max(total, 1)\n\n\n'
        'def c_luz(a):\n'
        '    luz, neutros, frac = medir_luz(a.video)\n'
        '    gamma, gan = ajuste_de_luz(luz, neutros, frac)\n'
        '    tinte = f" · grises {frac:.0%}" + (f" (R {neutros[0]:.2f} G {neutros[1]:.2f} B {neutros[2]:.2f})" if neutros else "")\n'
        '    if not a.blanco:\n'
        '        gan = (1.0, 1.0, 1.0)\n'
        '    print(f"brillo medio {luz:.2f}{tinte}")\n'
        '    if gamma == 1.0 and gan == (1.0, 1.0, 1.0):\n'
        '        print("sin cambios: la exposicion" + (" y el blanco estan bien" if a.blanco else " esta bien (el blanco se corrige con --blanco)"))\n'
        '        return a.video\n'
        '    filtros = ([f"eq=gamma={gamma}"] if gamma != 1.0 else []) + \\\n'
        '        ([f"colorchannelmixer=rr={gan[0]}:gg={gan[1]}:bb={gan[2]}"] if gan != (1.0, 1.0, 1.0) else [])\n'
        '    out = salida(a.video, "luz")\n'
        '    ffmpeg("-i", a.video, "-vf", ",".join(filtros), *H264, "-crf", "19", out)\n'
        '    ok(out, " · ".join(filtros))\n'
        '    return out\n\n\n'
        '# ---------- render ----------\n')
cambiar('''                   help="fondo = video entero con fondo desenfocado; recorte = recorta al centro; cara = recorta centrado en la cara")''',
        '''                   help="fondo = video entero con fondo desenfocado; recorte = recorta al centro; cara = recorta centrado en la cara")
    s = cmd("luz", c_luz, "Corrige la exposicion de un crudo oscuro (solo aclara) y, con --blanco, el tinte medido en los grises.")
    s.add_argument("--blanco", action="store_true", help="tambien corrige el tinte de color (si hay grises suficientes para medirlo)")''')
cambiar('    print(f"autotest OK (kit {VERSION})")\n',
        '    assert ajuste_de_luz(0.5, (0.5, 0.5, 0.5), 0.3) == (1.0, (1.0, 1.0, 1.0))  # bien expuesto y neutro: no toca\n'
        '    assert 1.4 < ajuste_de_luz(0.25, None, 0)[0] <= 1.6  # oscuro: aclara\n'
        '    assert ajuste_de_luz(0.8, None, 0)[0] == 1.0  # claro: nunca oscurece\n'
        '    _, k = ajuste_de_luz(0.5, (0.6, 0.5, 0.45), 0.2)\n'
        '    assert k[0] < 1 < k[2], k  # calido: baja el rojo y sube el azul\n'
        '    assert ajuste_de_luz(0.5, (0.6, 0.5, 0.45), 0.01)[1] == (1.0, 1.0, 1.0)  # pocos grises: no adivina\n'
        '    print(f"autotest OK (kit {VERSION})")\n')

for x in ("import tempfile", "import json", "import subprocess", "import os"):
    assert f"\n{x}\n" in t or t.startswith(x) or f"\n{x}" in t, f"el kit ya no importa {x}"

(AQUI / "vtool.py").write_bytes(t.encode("utf-8"))  # LF: con CRLF el contenedor falla (17/11)
destino = AQUI / "perfiles"
shutil.rmtree(destino, ignore_errors=True)
shutil.copytree(kit / "perfiles", destino, dirs_exist_ok=True)  # en Windows la carpeta a veces queda tomada
for p in destino.iterdir():  # perfiles guardados con Bloc de notas pueden traer CRLF/BOM: el autotest lee utf-8-sig
    p.write_bytes(p.read_bytes().replace(b"\r\n", b"\n"))
print(f"vtool {AQUI / 'vtool.py'} listo ({len(t.splitlines())} líneas) + {len(list(destino.iterdir()))} archivos de perfiles")
