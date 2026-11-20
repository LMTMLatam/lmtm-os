"""Carga del estudio base al sistema (plan 17/11, despliegue paso 4.1): fichas → lotes para lmtmGuardarViral
(fuente "estudio", con la medición de lmtm-redes, la forma de vtool y, si hay, las respuestas sí/no).

    python -I cargar.py   → ESTUDIO/carga/lote-NN.json (de a 200), uno por llamada a lmtmGuardarViral
                            {"fuente": "estudio", "virales": [...]}
"""
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from mirar import relevante  # noqa: E402

ESTUDIO = Path(os.environ.get("ESTUDIO", Path.home() / "Documents" / "estudio-video"))
LOTE = 200


def leer(nombre: str) -> list[dict]:
    p = ESTUDIO / nombre
    return [json.loads(l) for l in p.read_text(encoding="utf-8").splitlines() if l.strip()] if p.exists() else []


def fila(f: dict, e: dict | None, autor: str) -> dict:
    return {
        "autor": autor,  # estudio:persona = la vara del examen en el servidor (AUTOR_PERSONA)
        "url": f["url"], "cuenta": f["autor"], "nicho": "todos" if f["rubro"] == "general" else f["rubro"],
        "tipo": (e or {}).get("tipo") or "otro", "control": f["grupo"] == "control",
        **({"gancho": e["gancho"]} if e and e.get("gancho") else {}),
        **({"respuestas": e["respuestas"]} if e else {}),
        "forma": f["forma"],
        "medicion": {"red": f["red"], "pais": f.get("pais"), "vistas": f.get("vistas"), "me_gusta": f.get("me_gusta"),
                     "comentarios": f.get("comentarios"), "compartidos": f.get("compartidos"), "guardados": f.get("guardados"),
                     "mediana_autor": f.get("mediana_autor"), "veces": f.get("veces"), "publicado": f.get("fecha"),
                     "texto": (f.get("texto") or "")[:2000], "control": f["grupo"] == "control"},
    }


def main():
    etiquetas = {o["id"]: o for o in leer("etiquetas.jsonl")}
    oro = {o["id"]: o for o in leer("oro.jsonl")}
    etiquetas.update(oro)
    fichas = [f for f in leer("fichas.jsonl") if "error" not in f and f.get("forma") and f.get("autor") and relevante(f)]  # fuera de rubro no entra
    filas = [fila(f, etiquetas.get(f["id"]), "estudio:persona" if f["id"] in oro else "estudio:modelo" if f["id"] in etiquetas else "estudio:medido")
             for f in fichas]
    d = ESTUDIO / "carga"
    d.mkdir(exist_ok=True)
    for i in range(0, len(filas), LOTE):
        (d / f"lote-{i // LOTE + 1:02d}.json").write_text(json.dumps({"fuente": "estudio", "virales": filas[i:i + LOTE]}, ensure_ascii=False),
                                                         encoding="utf-8", newline="\n")
    print(f"{len(filas)} filas en {(len(filas) + LOTE - 1) // LOTE} lotes en {d} ({sum(1 for f in fichas if f['id'] in etiquetas)} con respuestas)")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
