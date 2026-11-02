"""Control del español (28/10/2026): ganchos buenos de PyME tienen que puntuar por encima de los
malos a propósito, y caer en la fórmula esperada.

    python check_es.py
"""
import hookscore as h

ESPERADA = {  # gancho → fórmula
    # La escena con la hora de la noche (local cerrado) no es ninguna de las 21 fórmulas, pero es la
    # que más alcance tuvo en las pruebas: vale igual.
    "Domingo, ocho de la noche. Tu local está cerrado. El pedido, no.": "Unclassified",
    "Once y cuarenta y ocho de la noche. Alguien quiere un turno. Vos ya cerraste.": "Unclassified",
    "¿Tu aviso habla de vos o de tu cliente?": "The Question",
    "Le pidieron lo que no hay. ¿Qué contestó?": "The Question",
    "Tres errores que hacen que nadie termine tu reel.": "The List",
}
REALES = list(ESPERADA)
MALOS = [
    "Hola a todos, bienvenidos a un nuevo video del canal.",
    "Hoy les traigo algo increíble que va a cambiar todo.",
    "En este video vamos a hablar de marketing y redes para empresas.",
]

def nota(t): return h.score(t)[1]

peor_real = min(nota(t) for t in REALES)
mejor_malo = max(nota(t) for t in MALOS)
assert peor_real > mejor_malo, (peor_real, mejor_malo)
mal = {t: h.classify(t)[0] for t in REALES if h.classify(t)[0] != ESPERADA[t]}
assert not mal, mal
print(f"ok: peor real {peor_real} > mejor malo {mejor_malo}; fórmulas como se esperaba")
