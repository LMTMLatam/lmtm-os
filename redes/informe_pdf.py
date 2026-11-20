"""PDF del informe del estudio para el equipo (plan 17/11, fase 1.7): informe.md (de analizar.py) → PDF.
Solo lo que usa analizar.py: títulos (#, ##), párrafos, listas (- ) y tablas Markdown, con **negrita**.

    python -I informe_pdf.py [informe.md] [salida.pdf]   (con un Python que tenga reportlab)
"""
import os
import re
import sys
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import ListFlowable, ListItem, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

ESTUDIO = Path(os.environ.get("ESTUDIO", Path.home() / "Documents" / "estudio-video"))
MARCA = colors.HexColor("#1F3A5F")


def inline(t: str) -> str:
    t = t.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    t = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", t)
    return re.sub(r"(https?://\S+)", r'<link href="\1" color="#1F3A5F">\1</link>', t)


def construir(md: str, salida: Path):
    s = getSampleStyleSheet()
    estilos = {
        "h1": ParagraphStyle("h1", parent=s["Title"], textColor=MARCA, fontSize=20, spaceAfter=8),
        "h2": ParagraphStyle("h2", parent=s["Heading2"], textColor=MARCA, spaceBefore=12),
        "p": ParagraphStyle("p", parent=s["BodyText"], fontSize=9.5, leading=13),
        "celda": ParagraphStyle("celda", parent=s["BodyText"], fontSize=8, leading=10),
    }
    hist, lineas, i = [], md.splitlines(), 0
    while i < len(lineas):
        l = lineas[i]
        if l.startswith("# "):
            hist.append(Paragraph(inline(l[2:]), estilos["h1"]))
        elif l.startswith("## "):
            hist.append(Paragraph(inline(l[3:]), estilos["h2"]))
        elif l.startswith("|"):
            filas = []
            while i < len(lineas) and lineas[i].startswith("|"):
                if not re.match(r"^\|[\s|:-]+\|$", lineas[i]):
                    filas.append([Paragraph(inline(c.strip()), estilos["celda"]) for c in lineas[i].strip("|").split("|")])
                i += 1
            t = Table(filas, repeatRows=1, hAlign="LEFT")
            t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#E8EEF5")),
                                   ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#C9D3DF")),
                                   ("VALIGN", (0, 0), (-1, -1), "TOP")]))
            hist += [t, Spacer(1, 6)]
            continue
        elif l.startswith("- "):
            items = []
            while i < len(lineas) and lineas[i].startswith("- "):
                items.append(ListItem(Paragraph(inline(lineas[i][2:]), estilos["p"]), leftIndent=10))
                i += 1
            hist.append(ListFlowable(items, bulletType="bullet", start="•", leftIndent=10))
            continue
        elif l.strip():
            hist.append(Paragraph(inline(l), estilos["p"]))
        else:
            hist.append(Spacer(1, 4))
        i += 1
    SimpleDocTemplate(str(salida), pagesize=A4, leftMargin=16 * mm, rightMargin=16 * mm, topMargin=16 * mm, bottomMargin=16 * mm,
                      title="Estudio de virales LatAm — LMTM").build(hist)


if __name__ == "__main__":
    entrada = Path(sys.argv[1]) if len(sys.argv) > 1 else ESTUDIO / "informe.md"
    salida = Path(sys.argv[2]) if len(sys.argv) > 2 else entrada.with_suffix(".pdf")
    construir(entrada.read_text(encoding="utf-8"), salida)
    print(f"PDF: {salida}")
