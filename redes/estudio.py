"""Estudio base de virales de Latinoamérica (plan 17/11, fase 1). Usa lmtm-redes (la misma API que van a usar los
agentes) y el vtool del kit para medir. Retomable: lo hecho queda en archivos y no se repite.

    python -I estudio.py buscar   [rubro]   → búsquedas de terminos.json (TikTok + Instagram) a busquedas.jsonl
    python -I estudio.py elegir   [rubro]   → virales (≥3× su autor) + videos normales del mismo autor → elegidos.jsonl
    python -I estudio.py medir    [rubro]   → baja, mide con vtool (medir.py) y BORRA el video → fichas.jsonl + hojas/
    python -I estudio.py todo               → las tres, rubro por rubro (inmobiliaria primero)
    python -I estudio.py buscar & estudio.py seguir   → en paralelo: uno busca, el otro elige y mide lo ya buscado
    python -I estudio.py resumen            → cuántos hay de cada cosa

Carpeta: ESTUDIO (por defecto Documentos/estudio-video). Los videos de terceros se borran después de medirlos:
quedan las medidas, las hojas de contacto y el link (uso interno, nunca se reutilizan tomas ni audio).
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from datetime import date, timedelta
from pathlib import Path

AQUI = Path(__file__).parent
sys.path.insert(0, str(AQUI))  # con -I el directorio del script no está en el path
import redes  # noqa: E402
from mirar import relevante  # noqa: E402
ESTUDIO = Path(os.environ.get("ESTUDIO", Path.home() / "Documents" / "estudio-video"))
KIT_PY = os.environ.get("KIT_PY", r"C:\LMTM\video-kit\venv\Scripts\python.exe")
TERMINOS = json.loads((AQUI / "terminos.json").read_text(encoding="utf-8"))
ORDEN = ["inmobiliaria", "general", "construccion-materiales", "automotor-autopartes", "turismo-hoteleria", "industria-b2b"]
PAISES_ROTA = ["AR", "MX", "CO", "CL", "PE"]
REDES = ("tiktok", "instagram")

# Lo que cuenta como viral y como control (plan §1.3). Ajustables al ver los datos.
VIRAL_DESDE = 3.0
CONTROL = (0.3, 1.2)
VENTANA_DIAS = 365
MAX_DURACION = 90
META_VIRALES = 60          # por rubro (mitad TikTok, mitad Instagram)
MAX_POR_AUTOR = 2
POR_BUSQUEDA = 8


def leer(nombre: str) -> list[dict]:
    p = ESTUDIO / nombre
    return [json.loads(l) for l in p.read_text(encoding="utf-8").splitlines() if l.strip()] if p.exists() else []


def anotar(nombre: str, fila: dict):
    with (ESTUDIO / nombre).open("a", encoding="utf-8") as f:
        f.write(json.dumps(fila, ensure_ascii=False) + "\n")


def busquedas_de(rubro: str) -> list[tuple[str, str, str]]:
    """(red, query, país): los términos comunes rotan de país; los de un país, solo en ese."""
    r = TERMINOS["rubros"][rubro]
    out = []
    for i, t in enumerate(r["terminos"]):
        for j, red in enumerate(REDES):
            out.append((red, t, PAISES_ROTA[(i + j) % len(PAISES_ROTA)]))
    for pais, ts in r.get("por_pais", {}).items():
        for t in ts:
            # Instagram solo con los comunes: sus virales salen sobre todo de los perfiles de los autores (17/11)
            out.append(("tiktok", t, pais))
    return out


def buscar(rubro: str):
    """Hasta terminar las búsquedas del rubro. Si una red frena, sigue con la otra; espera solo si frenan las dos."""
    while True:
        hechas = {(b["rubro"], b["red"], b["query"], b["pais"]) for b in leer("busquedas.jsonl")}
        pendientes = [b for b in busquedas_de(rubro) if (rubro, *b) not in hechas]
        if not pendientes:
            return
        print(f"[{rubro}] {len(pendientes)} búsquedas pendientes", flush=True)
        frenada: dict[str, float] = {}  # red (o "*" si frenaron los buscadores) → hasta
        avanzo = False
        for red, q, pais in pendientes:
            if max(frenada.get(red, 0), frenada.get("*", 0)) > time.time():
                continue
            try:
                r = redes.buscar(red, q, pais, POR_BUSQUEDA, True)
            except redes.Bloqueado as e:
                frenada[e.red if e.red in REDES else "*"] = e.hasta
                print(f"  freno de {e.red} ({e.motivo[:80]}): sigo con lo demás", flush=True)
                continue
            anotar("busquedas.jsonl", {"rubro": rubro, "red": red, "query": q, "pais": pais, "fecha": date.today().isoformat(),
                                       "videos": r["videos"], "errores": r["errores"]})
            avanzo = True
            virales = sum(1 for v in r["videos"] if (v.get("veces") or 0) >= VIRAL_DESDE)
            print(f"  {red:9} {pais} «{q}»: {len(r['videos'])} videos, {virales} virales", flush=True)
        if not avanzo:
            espera = max(60, min(frenada.values()) - time.time())
            print(f"  todo frenado: espero {espera / 60:.0f} min", flush=True)
            time.sleep(min(espera, 3 * 3600))


def elegir(rubro: str):
    ya = {e["id"] for e in leer("elegidos.jsonl")}
    desde = (date.today() - timedelta(days=VENTANA_DIAS)).isoformat()
    candidatos, vistos = [], set()
    for b in (b for b in leer("busquedas.jsonl") if b["rubro"] == rubro):
        for v in b["videos"]:
            if v["id"] in vistos or v["id"] in ya:
                continue
            vistos.add(v["id"])
            if (v.get("veces") or 0) >= VIRAL_DESDE and (v.get("fecha") or "9999") >= desde \
                    and (v.get("duracion") or 0) <= MAX_DURACION and v.get("autor"):
                candidatos.append({**v, "query": b["query"], "pais": b["pais"]})
    # Los perfiles de los autores encontrados ya están medidos (caché de la búsqueda): sus virales RECIENTES también
    # cuentan. En Instagram es la fuente principal: el buscador trae reels viejos que no están entre los últimos 12.
    autores = {(v["red"], v["autor"]) for b in leer("busquedas.jsonl") if b["rubro"] == rubro for v in b["videos"] if v.get("autor")}
    for red, autor in sorted(autores):
        try:
            p = redes.tiktok_perfil(handle=autor) if red == "tiktok" else redes.instagram_reels(handle=autor)
        except (redes.Invalido, redes.Bloqueado):
            continue
        for x in p.get("videos") or p.get("reels") or []:
            if x["id"] in vistos or x["id"] in ya or x.get("fijado") or (x.get("veces") or 0) < VIRAL_DESDE:
                continue
            if (x.get("fecha") or "9999") < desde or (x.get("duracion") or 0) > MAX_DURACION:
                continue
            vistos.add(x["id"])
            candidatos.append({**x, "autor": autor, "red": red, "mediana_autor": p["mediana_vistas"], "query": "(perfil del autor)", "pais": None})
    candidatos.sort(key=lambda v: -(v.get("veces") or 0))
    por_red = {red: [] for red in REDES}
    por_autor: dict[str, int] = {}
    # Para la meta cuentan solo los que hablan del rubro (18/11): los demás siguen sirviendo para el general.
    previos = [e for e in leer("elegidos.jsonl") if e["rubro"] == rubro and e["grupo"] == "viral" and relevante(e)]
    for e in previos:
        por_red[e["red"]].append(e)
        por_autor[e["autor"]] = por_autor.get(e["autor"], 0) + 1
    nuevos = 0
    for v in candidatos:
        if len(por_red[v["red"]]) >= META_VIRALES // 2 or por_autor.get(v["autor"], 0) >= MAX_POR_AUTOR:
            continue
        if v.get("texto") and not relevante({**v, "rubro": rubro}):  # sin texto (reels del perfil) se decide al medir
            continue
        control = control_de(v)
        fila = {**v, "rubro": rubro, "grupo": "viral"}
        anotar("elegidos.jsonl", fila)
        por_red[v["red"]].append(fila)
        por_autor[v["autor"]] = por_autor.get(v["autor"], 0) + 1
        nuevos += 1
        if control and control["id"] not in ya:
            anotar("elegidos.jsonl", {**control, "rubro": rubro, "grupo": "control", "de": v["id"]})
            ya.add(control["id"])
    print(f"[{rubro}] virales: tiktok {len(por_red['tiktok'])}, instagram {len(por_red['instagram'])} (+{nuevos} nuevos)", flush=True)


def control_de(v: dict) -> dict | None:
    """Un video NORMAL del mismo autor (0,3–1,2 veces su mediana): lo que cambia contra el viral es la edición."""
    try:
        p = redes.tiktok_perfil(handle=v["autor"]) if v["red"] == "tiktok" else redes.instagram_reels(handle=v["autor"])
    except (redes.Invalido, redes.Bloqueado):
        return None
    lista = [x for x in (p.get("videos") or p.get("reels") or []) if not x.get("fijado") and x["id"] != v["id"]
             and x.get("veces") is not None and CONTROL[0] <= x["veces"] <= CONTROL[1]]
    if v["red"] == "tiktok":
        lista = [x for x in lista if (x.get("duracion") or 0) <= MAX_DURACION]
    if not lista:
        return None
    x = min(lista, key=lambda x: abs(x["veces"] - 0.8))
    return {**x, "autor": v["autor"], "red": v["red"], "mediana_autor": p["mediana_vistas"]}


def medir(rubro: str):
    hechas = {f["id"] for f in leer("fichas.jsonl")}
    pendientes = [e for e in leer("elegidos.jsonl") if e["rubro"] == rubro and e["id"] not in hechas]
    print(f"[{rubro}] {len(pendientes)} videos por medir", flush=True)
    for e in pendientes:
        try:
            archivo = redes.descargar(e["url"])
        except redes.Bloqueado as b:
            print(f"  freno de {b.red}: espero", flush=True)
            time.sleep(min(max(60, b.hasta - time.time()), 3 * 3600))
            continue
        except redes.Invalido as x:
            anotar("fichas.jsonl", {"id": e["id"], "rubro": rubro, "error": str(x)[:300]})
            continue
        try:
            for intento in (1, 2):  # el Whisper del kit a veces se cae con segfault (17/11): un reintento
                r = subprocess.run([KIT_PY, "-I", str(AQUI / "medir.py"), str(archivo), str(ESTUDIO / "hojas" / rubro)],
                                   capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=900)
                if r.returncode == 0:
                    break
            if r.returncode != 0:
                anotar("fichas.jsonl", {"id": e["id"], "rubro": rubro, "error": f"medir: {r.returncode} {r.stderr[-300:]}"})
                continue
            m = json.loads(r.stdout.strip().splitlines()[-1])
            anotar("fichas.jsonl", {**e, **m})
            print(f"  {e['grupo']:7} {e['red']:9} {e['autor']}: {m['forma']['duracion']} s, {m['forma']['cortes']} cortes", flush=True)
        finally:
            import shutil
            shutil.rmtree(archivo.parent, ignore_errors=True)  # el video de terceros no se guarda


def resumen():
    b, e, f = leer("busquedas.jsonl"), leer("elegidos.jsonl"), leer("fichas.jsonl")
    for rubro in ORDEN:
        bb = [x for x in b if x["rubro"] == rubro]
        ee = [x for x in e if x["rubro"] == rubro]
        ff = [x for x in f if x["rubro"] == rubro and "error" not in x]
        print(f"{rubro:24} búsquedas {len(bb):3}/{len(busquedas_de(rubro)):3} · virales {sum(x['grupo'] == 'viral' for x in ee):3}"
              f" · control {sum(x['grupo'] == 'control' for x in ee):3} · fichas {len(ff):3}")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    ESTUDIO.mkdir(parents=True, exist_ok=True)
    paso = sys.argv[1] if len(sys.argv) > 1 else "resumen"
    rubros = [sys.argv[2]] if len(sys.argv) > 2 else ORDEN
    if paso == "resumen":
        resumen()
    elif paso == "seguir":
        # En paralelo con «buscar»: elige y mide cada rubro apenas terminan sus búsquedas.
        for rubro in rubros:
            while True:
                hechas = {(b["rubro"], b["red"], b["query"], b["pais"]) for b in leer("busquedas.jsonl")}
                if all((rubro, *b) in hechas for b in busquedas_de(rubro)):
                    break
                time.sleep(300)
            elegir(rubro)
            for _ in range(2):
                medir(rubro)
            resumen()
    elif paso == "todo":
        for rubro in rubros:
            buscar(rubro)
            elegir(rubro)
            for _ in range(2):
                medir(rubro)
            resumen()
    else:
        for rubro in rubros:
            {"buscar": buscar, "elegir": elegir, "medir": medir}[paso](rubro)
