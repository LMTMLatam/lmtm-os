"""Control del español (28/10/2026) para title.py.

    python check_es.py
"""
import title as t

# las tildes no parten la palabra
assert t.words("¿Cuándo pautar el aviso?") == ["cuándo", "pautar", "el", "aviso"], t.words("¿Cuándo pautar el aviso?")
# los artículos no cuentan como repetición entre título y miniatura
r = t.check("Tu aviso no dice qué vendés", thumb="LA REGLA")
assert not [k for k, _ in r["issues"] if k == "duplicate"], r["issues"]
# una palabra con contenido repetida sí
r = t.check("La regla que rompió el aviso", thumb="LA REGLA")
assert [k for k, _ in r["issues"] if k == "duplicate"], r["issues"]
# lo vago en español se marca
assert [k for k, _ in t.check("El secreto increíble de los avisos")["issues"] if k == "vague"]
print("ok")
