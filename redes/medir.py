"""Ficha medida de UN video para el estudio de virales (plan 17/11, fase 1.5). Usa el vtool del kit tal cual:
corre con el Python del kit (C:\\LMTM\\video-kit\\venv), que tiene faster-whisper y OpenCV.

    python -I medir.py <video> <carpeta_hojas>   → imprime un JSON en una línea

Deja dos hojas de contacto: la general (16 cuadros) y la del gancho (los primeros 3 s, 3 cuadros por segundo).
"""
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, os.environ.get("VTOOL_DIR", r"C:\LMTM\video-kit"))
import vtool  # noqa: E402


def main(video: Path, hojas: Path) -> dict:
    hojas.mkdir(parents=True, exist_ok=True)
    forma = vtool.medir_referencia(video, "es", "small")
    palabras, idioma = vtool.transcribir(video, "es", "small")
    general = hojas / f"{video.stem}__hoja.jpg"
    cada = max(vtool.duracion(video), 0.1) / 16
    vtool.ffmpeg("-i", video, "-vf", f"fps=1/{cada:.3f},scale=200:-2,tile=4x4", "-frames:v", "1", "-q:v", "5", general)
    gancho = hojas / f"{video.stem}__gancho.jpg"
    vtool.ffmpeg("-t", "3", "-i", video, "-vf", "fps=3,scale=240:-2,tile=3x3", "-frames:v", "1", "-q:v", "5", gancho)
    w, h = vtool.medidas(video)
    return {
        "forma": {"duracion": forma["duracion"], "cortes": forma["cortes"], "planoMedio": forma["plano_medio"],
                  "primerCorte": forma["primer_corte"], "palabrasPorSegundo": forma["palabras_por_seg"],
                  "lufs": forma["lufs"], "brillo": forma["brillo"], "saturacion": forma["saturacion"]},
        "ancho": w, "alto": h, "idioma": idioma,
        "transcripcion": " ".join(p for _, _, p in palabras)[:3000],
        "gancho_dicho": " ".join(p for i, _, p in palabras if i < 3.0),
        "hoja": str(general), "hoja_gancho": str(gancho),
    }


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    print(json.dumps(main(Path(sys.argv[1]), Path(sys.argv[2])), ensure_ascii=False))
