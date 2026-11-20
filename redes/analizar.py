"""Análisis del estudio de virales (plan 17/11, fase 1.6): virales contra videos NORMALES de los mismos autores.

    python -I analizar.py [salida.md]   → informe en Markdown + resumen.json (para armar las plantillas)

Forma (vtool referencia, todos los videos medidos): medianas de virales vs control por rubro y red.
Respuestas sí/no: del set validado (oro.jsonl) y, si existe, de las fichas del modelo (etiquetas.jsonl).
Una respuesta es REGLA si aparece ≥ 1,5 veces más en los virales (con ≥ 20 virales respondidos) y NO HACER si ≤ 0,67,
las dos solo si la diferencia no es casualidad (p < 0,10); si no, queda como SEÑAL para seguir midiendo.
"""
import json
import math
import os
import statistics as st
import sys
from pathlib import Path

AQUI = Path(__file__).parent
ESTUDIO = Path(os.environ.get("ESTUDIO", Path.home() / "Documents" / "estudio-video"))
sys.path.insert(0, str(AQUI))
from mirar import claves, relevante  # noqa: E402

METRICAS = [("duracion", "duración (s)"), ("cortes_min", "cortes por minuto"), ("planoMedio", "plano medio (s)"),
            ("primerCorte", "primer corte (s)"), ("palabrasPorSegundo", "palabras por segundo"), ("lufs", "volumen (LUFS)"),
            ("brillo", "brillo"), ("saturacion", "saturación")]
MIN_N = 20
REGLA, NO_HACER = 1.5, 0.67
MAX_P = 0.10  # 18/11: sin esto, 2/105 contra 2/69 salía «no hacer»


def leer(nombre: str) -> list[dict]:
    p = ESTUDIO / nombre
    return [json.loads(l) for l in p.read_text(encoding="utf-8").splitlines() if l.strip()] if p.exists() else []


def forma_de(f: dict) -> dict:
    x = dict(f.get("forma") or {})
    if x.get("duracion") and x.get("cortes") is not None:
        x["cortes_min"] = round(x["cortes"] / x["duracion"] * 60, 1)
    return x


def mediana(xs):
    xs = [x for x in xs if isinstance(x, (int, float))]
    return round(st.median(xs), 2) if xs else None


def lift(si_v, n_v, si_c, n_c):
    """Cuántas veces más frecuente en virales que en control, suavizado (Laplace) para muestras chicas."""
    if not n_v or not n_c:
        return None
    return round(((si_v + 1) / (n_v + 2)) / ((si_c + 1) / (n_c + 2)), 2)


def p_valor(si_v, n_v, si_c, n_c) -> float:
    """Dos proporciones (z, dos colas): probabilidad de ver esa diferencia por casualidad."""
    p = (si_v + si_c) / (n_v + n_c)
    se = math.sqrt(p * (1 - p) * (1 / n_v + 1 / n_c))
    return 1.0 if not se else round(math.erfc(abs(si_v / n_v - si_c / n_c) / se / math.sqrt(2)), 3)


def comparar(fichas: list[dict], etiquetas: dict[str, dict]) -> dict:
    v = [f for f in fichas if f["grupo"] == "viral"]
    c = [f for f in fichas if f["grupo"] == "control"]
    forma = {}
    for k, _ in METRICAS:
        mv, mc = mediana(forma_de(f).get(k) for f in v), mediana(forma_de(f).get(k) for f in c)
        forma[k] = {"viral": mv, "control": mc}
    preguntas = {}
    for k in claves():
        rv = [etiquetas[f["id"]]["respuestas"][k] for f in v if f["id"] in etiquetas]
        rc = [etiquetas[f["id"]]["respuestas"][k] for f in c if f["id"] in etiquetas]
        l = lift(sum(rv), len(rv), sum(rc), len(rc))
        veredicto, p = None, None
        if l is not None and len(rv) >= MIN_N:
            p = p_valor(sum(rv), len(rv), sum(rc), len(rc))
            cruza = "regla" if l >= REGLA else "no hacer" if l <= NO_HACER else None
            veredicto = cruza if cruza and p < MAX_P else "señal" if cruza else None
        preguntas[k] = {"viral": f"{sum(rv)}/{len(rv)}", "control": f"{sum(rc)}/{len(rc)}", "lift": l, "p": p, "veredicto": veredicto,
                        "pct_viral": round(100 * sum(rv) / len(rv)) if rv else None}
    tipos = {}
    for f in v:
        t = etiquetas.get(f["id"], {}).get("tipo")
        if t:
            tipos.setdefault(t, []).append(f)
    return {"n_viral": len(v), "n_control": len(c), "forma": forma, "preguntas": preguntas,
            "tipos": {t: {"n": len(fs), "duracion": mediana(forma_de(f).get("duracion") for f in fs),
                          "planoMedio": mediana(forma_de(f).get("planoMedio") for f in fs),
                          "ganchos": [etiquetas[f["id"]].get("gancho") for f in fs if etiquetas[f["id"]].get("gancho")][:5],
                          "ejemplos": [f.get("url") for f in sorted(fs, key=lambda x: -(x.get("veces") or 0))[:3] if f.get("url")]}
                      for t, fs in sorted(tipos.items(), key=lambda kv: -len(kv[1]))}}


def tabla_forma(r: dict) -> list[str]:
    out = ["| Medida | Virales | Normales |", "|---|---|---|"]
    for k, nombre in METRICAS:
        x = r["forma"][k]
        out.append(f"| {nombre} | {x['viral'] if x['viral'] is not None else '—'} | {x['control'] if x['control'] is not None else '—'} |")
    return out


def tabla_preguntas(r: dict) -> list[str]:
    filas = sorted(r["preguntas"].items(), key=lambda kv: -(kv[1]["lift"] or 0))
    out = ["| Pregunta | Virales | Normales | Veces más | p | |", "|---|---|---|---|---|---|"]
    for k, x in filas:
        marca = {"regla": "**REGLA**", "no hacer": "**NO HACER**", "señal": "señal"}.get(x["veredicto"], "")
        out.append(f"| {k} | {x['viral']} | {x['control']} | {x['lift'] if x['lift'] is not None else '—'} | "
                   f"{x['p'] if x['p'] is not None else '—'} | {marca} |")
    return out


def de_negocio(f: dict) -> bool:
    """Para el total: habla de su rubro o, al menos, de un negocio (sin playbacks ni videos en otro idioma)."""
    return relevante(f) or relevante({**f, "rubro": "general"})


def examen(modelo: dict[str, dict], oro: list[dict]) -> str:
    """Cuánto coincide el modelo con lo mirado por una persona (misma cuenta que coincidencia() en virales-ficha.ts)."""
    pares = [(modelo[o["id"]], o) for o in oro if o["id"] in modelo]
    if not pares:
        return "Sin examen del modelo todavía."
    pct = [100 * sum(m["respuestas"].get(k) == o["respuestas"][k] for k in o["respuestas"]) / len(o["respuestas"]) for m, o in pares]
    tipo = sum(m["tipo"] == o["tipo"] for m, o in pares)
    return (f"Examen del modelo contra lo mirado por una persona ({len(pares)} videos): {st.mean(pct):.1f} % en las preguntas "
            f"(aprueba con 85), {round(100 * tipo / len(pares))} % en el tipo — el tipo es orientativo: un video suele encajar en dos.")


def main(salida: Path):
    fichas = [f for f in leer("fichas.jsonl") if "error" not in f and f.get("forma") and de_negocio(f)]
    modelo = {o["id"]: o for o in leer("etiquetas.jsonl")}
    oro = leer("oro.jsonl")
    etiquetas = {**modelo, **{o["id"]: o for o in oro}}  # lo mirado por una persona gana
    rubros = sorted({f["rubro"] for f in fichas})
    resumen = {"total": comparar(fichas, etiquetas)}  # «general» es un rubro: no usar esa clave
    for red in ("tiktok", "instagram"):
        resumen[f"total:{red}"] = comparar([f for f in fichas if f["red"] == red], etiquetas)
    fuera = {}
    for r in rubros:
        del_rubro = [f for f in fichas if f["rubro"] == r]
        resumen[r] = comparar([f for f in del_rubro if relevante(f)], etiquetas)  # el total usa todos los de negocio
        fuera[r] = sum(not relevante(f) for f in del_rubro)
    (ESTUDIO / "resumen.json").write_text(json.dumps(resumen, ensure_ascii=False, indent=1), encoding="utf-8", newline="\n")

    md = ["# Estudio de virales de Latinoamérica (TikTok + Instagram)", "",
          f"{len(fichas)} videos medidos ({sum(f['grupo'] == 'viral' for f in fichas)} virales ≥3× su autor, "
          f"{sum(f['grupo'] == 'control' for f in fichas)} normales de los mismos autores). "
          f"{len(etiquetas)} con respuestas sí/no ({len(oro)} mirados por una persona). Fuera: playbacks, videos en otro "
          "idioma y los que no hablan de ningún negocio.", "", examen(modelo, oro), "",
          f"Regla = aparece ≥ {REGLA}× más en virales con ≥ {MIN_N} virales respondidos; no hacer = ≤ {NO_HACER}×; las dos con "
          f"p < {MAX_P} (que no sea casualidad). Señal = cruza el umbral pero todavía puede ser casualidad.", ""]
    for clave in ["total", "total:tiktok", "total:instagram", *rubros]:
        r = resumen[clave]
        if not r["n_viral"]:
            continue
        nota = f" · {fuera[clave]} fuera por no hablar del rubro (cuentan en el general)" if fuera.get(clave) else ""
        md += [f"## {clave}", "", f"{r['n_viral']} virales · {r['n_control']} normales{nota}", "", *tabla_forma(r), ""]
        if any(x["lift"] is not None for x in r["preguntas"].values()):
            md += [*tabla_preguntas(r), ""]
        if r["tipos"]:
            md += ["**Por tipo de video:**", ""]
            for t, x in r["tipos"].items():
                md.append(f"- {t}: {x['n']} virales · duración {x['duracion']} s · plano medio {x['planoMedio']} s · "
                          f"ganchos: {' / '.join(f'«{g}»' for g in x['ganchos'][:3])} · ej.: {' '.join(x['ejemplos'])}")
            md.append("")
    salida.write_text("\n".join(md) + "\n", encoding="utf-8", newline="\n")
    print(f"informe: {salida} · resumen: {ESTUDIO / 'resumen.json'}")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main(Path(sys.argv[1]) if len(sys.argv) > 1 else ESTUDIO / "informe.md")
