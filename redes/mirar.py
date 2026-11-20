"""Set validado del estudio (plan 17/11): las respuestas sí/no que da una persona (o Claude) mirando cada video.
Con este set se mide al modelo de visión de los agentes (examen ≥ 85 %). Las claves salen de
server/src/services/virales-ficha.ts (PREGUNTAS_FICHA): una sola fuente.

    python -I mirar.py claves                    → las preguntas
    python -I mirar.py lote <rubro> [n=6]        → arma una imagen por video (gancho | video entero) en ESTUDIO/mirar/
                                                   e imprime id, grupo y lo que se dice, para mirarlos
    python -I mirar.py guardar <archivo.json>    → suma respuestas al set (oro.jsonl). Formato: lista de
                                                   {"id","tipo","gancho","respuestas":{clave: bool}} (todas las claves)
    python -I mirar.py estado                    → cuántos hay mirados por rubro y grupo
"""
import json
import os
import re
import subprocess
import sys
from pathlib import Path

AQUI = Path(__file__).parent
ESTUDIO = Path(os.environ.get("ESTUDIO", Path.home() / "Documents" / "estudio-video"))
TS = AQUI.parent / "server" / "src" / "services" / "virales-ficha.ts"
TIPOS = ["habla-a-camara", "recorrido", "producto", "testimonio", "tutorial", "antes-y-despues", "detras-de-escena",
         "tendencia", "promo", "evento", "otro"]


# Un video cuenta para un rubro solo si habla del rubro (18/11: el buscador trajo una influencer de cosmética a
# inmobiliaria por «Casaideas», y el perfil de un autor suma virales de otros temas). Límite de palabra a propósito.
# (fuertes: una alcanza; débiles: hacen falta dos distintas — «me tuve que ir a la casa» no es inmobiliaria)
RUBRO = {
    "inmobiliaria": (r"departament|\bdepto|propiedad|inmobiliari|alquiler|ambientes|terreno|preventa|\bm2\b|"
                     r"bienes ra[ií]ces|apartament|inmueble|hipotec",
                     r"\bcasas?\b|\bventa\b|broker|\blotes?\b|barrio|\bpozo\b|metros|dormitorio|cochera|vivienda|inversi[oó]n|proyecto|\bzona\b"),
    "construccion-materiales": (r"construcci|ladrillo|cemento|porcelanato|durlock|steel ?frame|alba[ñn]il|corral[oó]n|ferreter|"
                                r"remodela|drywall|hormig[oó]n|revestimiento|cer[aá]mic|tablaroca",
                                r"\bobras?\b|\btechos?\b|\bpisos?\b|material|construir|\bpared|\bba[ñn]o\b|cocina"),
    "automotor-autopartes": (r"repuesto|autoparte|refacci|mec[aá]nic|frenos?\b|neum[aá]tico|cubierta|llantas?\b|concesionari|"
                             r"veh[ií]culo|camioneta|lubricentro|gomer[ií]a",
                             r"\bautos?\b|\bmotor\b|aceite|bater[ií]a|taller|ruedas?\b|\bkm\b"),
    "turismo-hoteleria": (r"hotel|hospedaje|caba[ñn]a|glamping|escapada|resort|posada|hostal|turismo",
                          r"\bviaje|\bplaya\b|\bdestino|habitaci[oó]n|\bspa\b|vacacion|\bpileta|desayuno"),
    "industria-b2b": (r"f[aá]brica|industri|maquinaria|metal[uú]rgic|\bcnc\b|soldadura|log[ií]stica|matricer|mecanizado|manufactur",
                      r"proceso|producci[oó]n|\bplanta\b|operari|torno|\bacero|\bpiezas?\b"),
}


def _puntaje(texto: str, rubro: str) -> tuple[int, int]:
    fuertes, debiles = RUBRO[rubro]
    f = {m.group(0).lower() for m in re.finditer(fuertes, texto, re.I)}
    d = {m.group(0).lower() for m in re.finditer(debiles, texto, re.I)}
    return len(f), len(d)


# «general» = lo que funciona para CUALQUIER negocio: tiene que hablar de un negocio (18/11: entraban playbacks de
# canciones y videos motivacionales de autores que una vez publicaron algo de negocios).
NEGOCIO = (r"negocio|emprend|\bpyme|empresa|cliente|\bmarca\b|\blocal\b|servicio|producto|f[aá]bric|\btienda|vend[eií]|"
           r"comerci|\bobra\b|industri|proceso|asesor|precio")
# Escrituras que no son de un video en español de Latinoamérica (18/11: una cuenta mezclaba notas en coreano).
OTRO_IDIOMA = re.compile(r"[Ѐ-ӿ֐-ۿ฀-๿぀-ヿ㐀-鿿가-힯]")


def relevante(f: dict) -> bool:
    """¿El video habla del rubro de su búsqueda, y más que de otro rubro? En «general», ¿habla de un negocio?
    (18/11: la marca de pisos «Broker» entraba a inmobiliaria por «cochera» y «ambientes»; habla más de construcción.)"""
    texto = " ".join(str(f.get(k) or "") for k in ("texto", "transcripcion", "gancho_dicho"))
    if OTRO_IDIOMA.search(texto) or (f.get("idioma") not in (None, "es", "pt") and (f.get("forma") or {}).get("palabrasPorSegundo", 0) > 0.8):
        return False
    if f.get("rubro") not in RUBRO:
        return re.search(NEGOCIO, texto, re.I) is not None  # sin palabras débiles: las letras de canciones dicen «plata» y «trabajo»
    fu, de = _puntaje(texto, f["rubro"])
    if not fu and de < 2:
        return False
    propio = 2 * fu + de
    return all(propio >= 2 * a + b for r, (a, b) in ((r, _puntaje(texto, r)) for r in RUBRO if r != f["rubro"]))


def claves() -> list[str]:
    bloque = re.search(r"PREGUNTAS_FICHA[^{]*\{(.*?)\n\};", TS.read_text(encoding="utf-8"), re.S).group(1)
    return re.findall(r"^\s+([a-z0-9_]+):", bloque, re.M)


def leer(nombre: str) -> list[dict]:
    p = ESTUDIO / nombre
    return [json.loads(l) for l in p.read_text(encoding="utf-8").splitlines() if l.strip()] if p.exists() else []


def lote(rubro: str, n: int):
    hechos = {o["id"] for o in leer("oro.jsonl")}
    fichas = [f for f in leer("fichas.jsonl") if f.get("rubro") == rubro and "error" not in f and f["id"] not in hechos and relevante(f)]
    # mitad virales, mitad control, alternando redes
    elegidas = [f for g in ("viral", "control") for f in [x for x in fichas if x["grupo"] == g][: (n + 1) // 2]][:n]
    (ESTUDIO / "mirar").mkdir(exist_ok=True)
    for f in elegidas:
        img = ESTUDIO / "mirar" / f"{f['id']}.jpg"
        if not img.exists():
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", f["hoja_gancho"], "-i", f["hoja"], "-filter_complex",
                            "[0]scale=-2:960[a];[1]scale=-2:960[b];[a][b]hstack", "-q:v", "5", str(img)], check=True)
        forma = f.get("forma", {})
        print(f"== {f['id']} · {f['grupo']} · {f['red']} · @{f.get('autor')} · {f.get('veces')}× · {forma.get('duracion')} s, "
              f"{forma.get('cortes')} cortes, {forma.get('palabrasPorSegundo')} pal/s\n   imagen: {img}\n"
              f"   0-3 s: «{f.get('gancho_dicho', '')}»\n   dice: «{(f.get('transcripcion') or '')[:260]}»\n"
              f"   texto del post: «{(f.get('texto') or '')[:160]}»")


def guardar(archivo: str):
    ks = set(claves())
    filas = json.loads(Path(archivo).read_text(encoding="utf-8"))
    for o in filas:
        if "si" in o:  # formato corto: las claves que son «sí»; el resto, «no»
            assert set(o["si"]) <= ks, f"{o['id']}: claves desconocidas {set(o['si']) - ks}"
            si = set(o.pop("si"))
            o["respuestas"] = {k: k in si for k in sorted(ks)}
        assert set(o["respuestas"]) == ks, f"{o['id']}: faltan {ks - set(o['respuestas'])} / sobran {set(o['respuestas']) - ks}"
        assert all(isinstance(v, bool) for v in o["respuestas"].values()), o["id"]
        assert o["tipo"] in TIPOS, f"{o['id']}: tipo {o['tipo']}"
    hechos = {o["id"] for o in leer("oro.jsonl")}
    with (ESTUDIO / "oro.jsonl").open("a", encoding="utf-8", newline="\n") as fh:
        for o in filas:
            if o["id"] not in hechos:
                fh.write(json.dumps(o, ensure_ascii=False) + "\n")
    print(f"guardadas {sum(o['id'] not in hechos for o in filas)}")


def estado():
    oro = {o["id"] for o in leer("oro.jsonl")}
    fichas = [f for f in leer("fichas.jsonl") if "error" not in f]
    por = {}
    for f in fichas:
        k = (f["rubro"], f["grupo"])
        t, m = por.get(k, (0, 0))
        por[k] = (t + 1, m + (f["id"] in oro))
    for (r, g), (t, m) in sorted(por.items()):
        print(f"{r:24} {g:8} fichas {t:3} · mirados {m:3}")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    paso = sys.argv[1] if len(sys.argv) > 1 else "estado"
    if paso == "claves":
        print("\n".join(claves()))
    elif paso == "lote":
        lote(sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 6)
    elif paso == "guardar":
        guardar(sys.argv[2])
    elif paso == "pendientes":  # para etiquetar.ts: fichas relevantes que todavía no tienen etiqueta del modelo
        hechos = {o["id"] for o in leer("etiquetas.jsonl")}
        print("\n".join(f["id"] for f in leer("fichas.jsonl") if "error" not in f and f["id"] not in hechos and relevante(f)))
    else:
        estado()
