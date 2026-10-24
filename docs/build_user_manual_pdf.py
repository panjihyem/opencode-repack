"""Render Panduan-Pengguna-Hyper-AI.md as printable PDF. No duplicate manual content."""

import re
from html import escape
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    HRFlowable, Paragraph, Preformatted,
    SimpleDocTemplate, Spacer, Table, TableStyle,
)

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "Panduan-Pengguna-Hyper-AI.md"
OUT = ROOT / "Panduan-Pengguna-Hyper-AI.pdf"
pdfmetrics.registerFont(TTFont("Arial", r"C:\Windows\Fonts\arial.ttf"))
pdfmetrics.registerFont(TTFont("Arial-Bold", r"C:\Windows\Fonts\arialbd.ttf"))
pdfmetrics.registerFont(TTFont("Consolas", r"C:\Windows\Fonts\consola.ttf"))
pdfmetrics.registerFontFamily("Arial", normal="Arial", bold="Arial-Bold", italic="Arial")

NAVY = colors.HexColor("#142640")
PALE = colors.HexColor("#EEF4FA")
INK = colors.HexColor("#243247")
WIDTH = A4[0] - 36 * mm
STYLE = {
    "title": ParagraphStyle("title", fontName="Arial-Bold", fontSize=22, leading=28, textColor=NAVY, spaceAfter=12),
    "h2": ParagraphStyle("h2", fontName="Arial-Bold", fontSize=15, leading=20, textColor=NAVY, spaceBefore=13, spaceAfter=7, keepWithNext=True),
    "h3": ParagraphStyle("h3", fontName="Arial-Bold", fontSize=11, leading=15, textColor=colors.HexColor("#2463A6"), spaceBefore=10, spaceAfter=5, keepWithNext=True),
    "h4": ParagraphStyle("h4", fontName="Arial-Bold", fontSize=9.5, leading=13, textColor=NAVY, spaceBefore=7, spaceAfter=4, keepWithNext=True),
    "body": ParagraphStyle("body", fontName="Arial", fontSize=9, leading=13.5, textColor=INK, spaceAfter=6, splitLongWords=1),
    "list": ParagraphStyle("list", fontName="Arial", fontSize=9, leading=13.5, textColor=INK, leftIndent=16, firstLineIndent=-11, spaceAfter=4, splitLongWords=1),
    "table": ParagraphStyle("table", fontName="Arial", fontSize=7.5, leading=11, textColor=INK, splitLongWords=1),
    "head": ParagraphStyle("head", fontName="Arial-Bold", fontSize=7.5, leading=11, textColor=colors.white),
    "code": ParagraphStyle("code", fontName="Consolas", fontSize=7.1, leading=10.5, textColor=INK, leftIndent=8, rightIndent=8, spaceBefore=5, spaceAfter=8, backColor=PALE),
    "note": ParagraphStyle("note", fontName="Arial", fontSize=8.5, leading=12.5, textColor=NAVY, backColor=PALE, borderPadding=7, spaceAfter=7),
}


def inline(text):
    """Escape untrusted Markdown before emitting ReportLab's supported inline tags."""
    text = escape(text.strip())
    text = re.sub(r"\[([^\]]+)\]\((https?://[^)]+)\)", r'<link href="\2" color="#2463A6">\1</link>', text)
    text = re.sub(r"`([^`]+)`", r'<font name="Consolas">\1</font>', text)
    text = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", text)
    return text


def cells(line):
    return [part.strip() for part in line.strip().strip("|").split("|")]


def render(text):
    lines = text.splitlines()
    story = []
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        if not line:
            i += 1
            continue
        if line.startswith("```"):
            i += 1
            block = []
            while i < len(lines) and not lines[i].strip().startswith("```"):
                block.append(lines[i].expandtabs(2))
                i += 1
            # Preformatted keeps PowerShell, JSON, and prompt copy/paste layout intact.
            for start in range(0, len(block), 36):
                story.append(Preformatted("\n".join(block[start:start + 36]), STYLE["code"], maxLineLength=95, splitChars=" "))
            i += 1
            continue
        if line.startswith("|") and i + 1 < len(lines) and re.fullmatch(r"[|:\-\s]+", lines[i + 1]):
            rows = [cells(line)]
            i += 2
            while i < len(lines) and lines[i].strip().startswith("|"):
                rows.append(cells(lines[i]))
                i += 1
            columns = len(rows[0])
            # Equal widths avoid hidden overflow; Paragraph wraps long cells.
            data = [[Paragraph(inline(row[j]) if j < len(row) else "", STYLE["head" if index == 0 else "table"])
                     for j in range(columns)] for index, row in enumerate(rows)]
            table = Table(data, colWidths=[WIDTH / columns] * columns, repeatRows=1, hAlign="LEFT")
            table.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), NAVY),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, PALE]),
                ("GRID", (0, 0), (-1, -1), .3, colors.HexColor("#CDD8E4")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]))
            story += [table, Spacer(1, 6)]
            continue
        if line == "---":
            story.append(HRFlowable(width="100%", thickness=.7, color=colors.HexColor("#CDD8E4"), spaceBefore=6, spaceAfter=8))
        elif line.startswith("#") and re.match(r"^#{1,4} ", line):
            depth = len(line) - len(line.lstrip("#"))
            story.append(Paragraph(inline(line[depth:]), STYLE[{1: "title", 2: "h2", 3: "h3", 4: "h4"}[depth]]))
        elif line.startswith("> "):
            story.append(Paragraph(inline(line[2:]), STYLE["note"]))
        elif re.match(r"^(?:[-*] |\d+\. )", line):
            marker = re.match(r"^([-*]|\d+\.)\s+(.*)", line)
            story.append(Paragraph(f"{'-' if marker[1] in ('-', '*') else marker[1]}  {inline(marker[2])}", STYLE["list"]))
        else:
            parts = [line]
            while i + 1 < len(lines) and lines[i + 1].strip() and not re.match(r"^(?:#{1,4} |>|```|\||[-*] |\d+\. |---$)", lines[i + 1].strip()):
                i += 1
                parts.append(lines[i].strip())
            story.append(Paragraph(inline(" ".join(parts)), STYLE["body"]))
        i += 1
    return story


def footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("Arial", 7.5)
    canvas.setFillColor(colors.HexColor("#58677A"))
    canvas.drawString(18 * mm, 12 * mm, "Hyper AI | Panduan Pengguna")
    canvas.drawRightString(A4[0] - 18 * mm, 12 * mm, str(doc.page))
    canvas.restoreState()


def build():
    text = SOURCE.read_text(encoding="utf-8")
    assert text.startswith("# Panduan Pengguna Hyper AI")
    assert "### 13.4 Playbook multi-agent end-to-end" in text
    assert "## 12. Hyper Case Secure" in text
    doc = SimpleDocTemplate(str(OUT), pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm,
                            topMargin=19 * mm, bottomMargin=19 * mm,
                            title="Panduan Pengguna Hyper AI", author="Hyper AI")
    doc.build(render(text), onFirstPage=footer, onLaterPages=footer)
    return OUT


if __name__ == "__main__":
    print(build())
