// HYPER_AI_MANAGED — embedded copy of forensic.py so it ships inside the app bundle
// (a loose .py beside the asar would never be found at runtime). Single source of truth
// for the fund-flow CLI; edit here. Schema table transaksi: hia_txn
//   tanggal, dari, ke, nominal, keterangan, ref (CLI: load/summary/cycles/sankey/workbook).
export const FORENSIC_SOURCE = `# HYPER_AI_MANAGED — forensic toolkit for tax-investigation work (F6).
#
# Everything runs offline in the office venv (duckdb, networkx, openpyxl). Data never
# leaves the machine. Schema of the transaction table (hia_txn):
#   tanggal DATE, dari VARCHAR, ke VARCHAR, nominal DOUBLE, keterangan VARCHAR, ref VARCHAR
#
# CLI:
#   forensic.py load     --csv txn.csv --db case.duckdb [--sep ,]
#   forensic.py summary  --db case.duckdb [--top 20]
#   forensic.py cycles   --db case.duckdb [--out cycles.json] [--max-cycles 50]
#   forensic.py sankey   --db case.duckdb [--min 1000000] [--out sankey.json]
#   forensic.py workbook --db case.duckdb --out case.xlsx
#
# load accepts flexible Indonesian/English column names and normalises them to the schema.

import argparse
import json
import sys
from datetime import datetime

COLUMNS = ["tanggal", "dari", "ke", "nominal", "keterangan", "ref"]

ALIASES = {
    "tanggal": ["tanggal", "date", "tgl", "tanggal_transaksi"],
    "dari": ["dari", "asal", "sumber", "rekening_asal", "pengirim", "from", "debit"],
    "ke": ["ke", "tujuan", "penerima", "rekening_tujuan", "to", "kredit"],
    "nominal": ["nominal", "nilai", "jumlah", "amount", "value", "rupiah"],
    "keterangan": ["keterangan", "deskripsi", "uraian", "memo", "description"],
    "ref": ["ref", "referensi", "no_ref", "referensi_id", "id"],
}


def _connect(db):
    import duckdb

    return duckdb.connect(db)


def cmd_load(args):
    con = _connect(args.db)
    raw = con.execute(
        "SELECT * FROM read_csv(?, header=true, all_varchar=true, delim=?)", [args.csv, args.sep]
    ).fetchdf()
    rename = {}
    lowered = {c.lower().strip(): c for c in raw.columns}
    for canon, options in ALIASES.items():
        for option in options:
            if option in lowered:
                rename[lowered[option]] = canon
                break
    missing = [c for c in ("tanggal", "dari", "ke", "nominal") if c not in rename.values()]
    if missing:
        sys.exit(f"kolom wajib tidak ditemukan: {missing} — kolom sumber: {list(raw.columns)}")
    raw = raw.rename(columns=rename)
    for canon in COLUMNS:
        if canon not in raw:
            raw[canon] = ""
    raw = raw[COLUMNS]
    raw["tanggal"] = raw["tanggal"].astype(str).str.slice(0, 10)
    raw["nominal"] = (
        raw["nominal"].astype(str).str.replace(r"[^\\d.\\-]", "", regex=True).astype(float)
    )
    con.register("frame", raw)
    con.execute("CREATE OR REPLACE TABLE hia_txn AS SELECT * FROM frame")
    total = con.execute("SELECT COUNT(*), COALESCE(SUM(nominal),0) FROM hia_txn").fetchone()
    print(f"ter-ingest {total[0]} transaksi, total nominal {total[1]:,.0f} → {args.db} (tabel hia_txn)")


def cmd_summary(args):
    con = _connect(args.db)
    rows = con.execute(
        """
        SELECT dari, ke, COUNT(*) AS jumlah, SUM(nominal) AS total
        FROM hia_txn GROUP BY 1, 2 ORDER BY total DESC LIMIT ?
        """,
        [args.top],
    ).fetchall()
    overall = con.execute(
        "SELECT COUNT(*), COUNT(DISTINCT dari), COUNT(DISTINCT ke), COALESCE(SUM(nominal),0) FROM hia_txn"
    ).fetchone()
    print(f"total {overall[0]} transaksi | {overall[1]} rekening asal | {overall[2]} tujuan | nominal {overall[3]:,.0f}")
    print(f"{'dari':<24}{'ke':<24}{'jumlah':>8}{'total':>18}")
    for row in rows:
        print(f"{row[0][:23]:<24}{row[1][:23]:<24}{row[2]:>8}{row[3]:>18,.0f}")


def _graph(con):
    import networkx as nx

    edges = con.execute(
        "SELECT dari, ke, SUM(nominal) AS total, COUNT(*) AS jumlah FROM hia_txn GROUP BY 1, 2"
    ).fetchall()
    graph = nx.DiGraph()
    for source, target, total, count in edges:
        if graph.has_edge(source, target):
            graph[source][target]["total"] += total
            graph[source][target]["jumlah"] += count
        else:
            graph.add_edge(source, target, total=total, jumlah=count)
    return graph


def cmd_cycles(args):
    con = _connect(args.db)
    import networkx as nx

    graph = _graph(con)
    found = []
    for cycle in nx.simple_cycles(graph):
        if len(found) >= args.max_cycles:
            break
        total = sum(graph[cycle[i]][cycle[(i + 1) % len(cycle)]]["total"] for i in range(len(cycle)))
        found.append({"urutan": cycle, "panjang": len(cycle), "total_nominal": total})
    found.sort(key=lambda item: -item["total_nominal"])
    if args.out:
        with open(args.out, "w", encoding="utf-8") as handle:
            json.dump({"siklus": found}, handle, ensure_ascii=False, indent=2)
        print(f"{len(found)} siklus ditulis ke {args.out}")
    else:
        if not found:
            print("tidak ada siklus aliran dana")
        for item in found:
            print(f"  {' → '.join(item['urutan'])} → {item['urutan'][0]}  (total {item['total_nominal']:,.0f})")


def _dag_only(rows):
    """ECharts Sankey wajib DAG — tolak aliran yang menyudutkan siklus (self-loop
    atau panah kembali). Tetap pertahankan aliran terbesar; rincian siklus tetap
    ada di perintah cycles & lembar Siklus workbook."""
    keep, tails = [], {}

    def reachable(source, target):
        stack, seen = [source], set()
        while stack:
            node = stack.pop()
            if node == target:
                return True
            if node in seen:
                continue
            seen.add(node)
            stack.extend(tails.get(node, ()))
        return False

    for row in rows:
        source, target = row[0], row[1]
        if source == target or reachable(target, source):
            continue
        keep.append(row)
        tails.setdefault(source, []).append(target)
    return keep


def cmd_sankey(args):
    con = _connect(args.db)
    rows = con.execute(
        "SELECT dari, ke, SUM(nominal) FROM hia_txn GROUP BY 1, 2 HAVING SUM(nominal) >= ? ORDER BY 3 DESC",
        [args.min],
    ).fetchall()
    kept = _dag_only(rows)
    hidden = len(rows) - len(kept)
    subtext = ""
    if hidden:
        discarded = [row for row in rows if row not in kept]
        subtext = (
            f"{hidden} aliran penutup siklus tidak digambar "
            f"(total {sum(row[2] for row in discarded):,.0f}) — rincian di cycles.json / sheet Siklus"
        )
    names = sorted({row[0] for row in kept} | {row[1] for row in kept})
    spec = {
        "charts": [
            {
                "id": "aliran-dana",
                "format": "svg",
                "width": 1600,
                "height": 900,
                "spec": {
                    "backgroundColor": "#ffffff",
                    "title": {"text": "Aliran Dana", "subtext": subtext, "left": "center"},
                    "series": [
                        {
                            "type": "sankey",
                            "layout": "none",
                            "data": [{"name": name} for name in names],
                            "links": [
                                {"source": row[0], "target": row[1], "value": row[2]}
                                for row in kept
                            ],
                        }
                    ],
                },
            }
        ]
    }
    payload = json.dumps(spec, ensure_ascii=False)
    if args.out:
        with open(args.out, "w", encoding="utf-8") as handle:
            handle.write(payload)
        note = f" ({hidden} ujung siklus dibuang agar DAG)" if hidden else ""
        print(f"spesifikasi Sankey ({len(kept)} aliran{note}) ditulis ke {args.out} — render: hyper viz {args.out}")
    else:
        print(payload)


def cmd_workbook(args):
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill
    from openpyxl.utils import get_column_letter

    con = _connect(args.db)
    workbook = Workbook()
    header_font = Font(bold=True, color="FFFFFF")
    header_fill = PatternFill("solid", fgColor="1F4E78")

    def sheet(title, rows, headers):
        page = workbook.create_sheet(title)
        page.append(headers)
        for cell in page[1]:
            cell.font = header_font
            cell.fill = header_fill
        for row in rows:
            page.append(row)
        for index, header in enumerate(headers, start=1):
            width = max(len(str(header)), *(len(str(row[index - 1])) for row in rows)) if rows else len(str(header))
            page.column_dimensions[get_column_letter(index)].width = min(max(width + 2, 10), 48)
        page.freeze_panes = "A2"
        return page

    workbook.remove(workbook.active)
    totals = con.execute(
        """
        SELECT dari, ke, COUNT(*) AS jumlah, SUM(nominal) AS total
        FROM hia_txn GROUP BY 1, 2 ORDER BY total DESC
        """
    ).fetchall()
    overall = con.execute(
        "SELECT COUNT(*), MIN(tanggal), MAX(tanggal), COALESCE(SUM(nominal),0) FROM hia_txn"
    ).fetchone()
    sheet("Ringkasan", [[overall[0], overall[1], overall[2], overall[3]]], ["Transaksi", "Dari tanggal", "Sampai", "Total nominal"])
    sheet("Rekap Aliran", [list(row) for row in totals], ["Dari", "Ke", "Jumlah", "Total nominal"])
    txns = con.execute(
        "SELECT tanggal, dari, ke, nominal, keterangan, ref FROM hia_txn ORDER BY tanggal, nominal DESC"
    ).fetchall()
    sheet("Transaksi", [list(row) for row in txns], ["Tanggal", "Dari", "Ke", "Nominal", "Keterangan", "Ref"])
    import networkx as nx

    graph = _graph(con)
    cycles = []
    for index, cycle in enumerate(nx.simple_cycles(graph), start=1):
        if index > 50:
            break
        total = sum(graph[cycle[i]][cycle[(i + 1) % len(cycle)]]["total"] for i in range(len(cycle)))
        cycles.append([" → ".join(cycle) + f" → {cycle[0]}", len(cycle), total])
    cycles.sort(key=lambda row: -row[2])
    sheet("Siklus", cycles, ["Rute", "Panjang", "Total nominal"])
    workbook.save(args.out)
    print(f"workbook {args.out}: Ringkasan, Rekap Aliran ({len(totals)}), Transaksi ({len(txns)}), Siklus ({len(cycles)})")


def _case_stats(con):
    """Angka kasus dari hia_txn untuk disuntikkan ke dokumen (sumber tunggal)."""
    import networkx as nx

    overall = con.execute(
        "SELECT COUNT(*), MIN(tanggal), MAX(tanggal), COALESCE(SUM(nominal),0) FROM hia_txn"
    ).fetchone()
    rekening = con.execute(
        "SELECT COUNT(*) FROM (SELECT dari AS rekening FROM hia_txn UNION SELECT ke FROM hia_txn)"
    ).fetchone()[0]
    graph = _graph(con)
    siklus = sum(1 for _ in nx.simple_cycles(graph))
    return {
        "transaksi_jumlah": overall[0],
        "tanggal_mulai": overall[1] or "-",
        "tanggal_selesai": overall[2] or "-",
        "nominal_total": f"{overall[3]:,.0f}",
        "rekening_jumlah": rekening,
        "siklus_jumlah": siklus,
    }


def _starter_template(kind, stats):
    """Bangun templat dokumen (python-docx) ber-tag jinja untuk docxtpl."""
    from docx import Document
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.shared import Pt

    doc = Document()
    normal = doc.styles["Normal"]
    normal.font.name = "Times New Roman"
    normal.font.size = Pt(12)

    def line(text="", bold=False, align=None, size=12):
        para = doc.add_paragraph()
        run = para.add_run(text)
        run.bold = bold
        run.font.size = Pt(size)
        if align is not None:
            para.alignment = align
        return para

    center = WD_ALIGN_PARAGRAPH.CENTER
    if kind == "bap":
        line("BERITA ACARA PEMERIKSAAN", bold=True, align=center, size=14)
        line("Nomor: {{ nomor }}", align=center)
        line()
        line("Pada hari ini, {{ tanggal }}, bertempat di {{ tempat }}, telah dilakukan pemeriksaan terhadap:")
        for label, key in (("Nama/NIK", "wp_nama"), ("NPWP", "wp_npwp"), ("Alamat", "wp_alamat")):
            line(f"{label}: {{{{{key}}}}}")
        line()
        line("Berdasarkan Surat Perintah Penyidikan {{ dasar }}, pemeriksaan menyangkut hal berikut:")
        table = doc.add_table(rows=1, cols=3)
        table.style = "Table Grid"
        for cell, header in zip(table.rows[0].cells, ("No.", "Materi pemeriksaan", "Keterangan")):
            cell.text = header
        # Baris statis agar struktur tabel tetap valid setelah render docxtpl.
        for index in range(3):
            cells = table.add_row().cells
            cells[0].text = str(index + 1)
            cells[1].text = "{{ materi[" + str(index) + "] }}"
            cells[2].text = "{{ materi_keterangan[" + str(index) + "] }}"
        line()
        line("Hasil pemeriksaan sebagaimana tercantum dalam lampiran yang merupakan bagian tidak terpisahkan.")
        line()
        line("Berita acara ini dibuat dengan sebenarnya untuk dapat dipergunakan sebagaimana mestinya.")
        for role, key in (("Penyidik", "penyidik"), ("Terdakwa/Pihak Diperiksa", "terperiksa")):
            line()
            line(f"{role}: {{{{ {key} }}}}", align=center)
    else:
        line("LAPORAN HASIL PENELITIAN", bold=True, align=center, size=14)
        line("Nomor: {{ nomor }}", align=center)
        line()
        line(f"1. Dasar: {{{{ dasar }}}}")
        line(f"2. Maksud: {{{{ maksud }}}}")
        line("3. Hasil penelitian:")
        line(f"   - Jumlah transaksi yang diteliti: {stats['transaksi_jumlah']} transaksi")
        line(f"   - Periode: {stats['tanggal_mulai']} s.d. {stats['tanggal_selesai']}")
        line(f"   - Total nominal: Rp {stats['nominal_total']}")
        line(f"   - Jumlah rekening terlibat: {stats['rekening_jumlah']}")
        line(f"   - Ditemukan pola siklus aliran dana: {stats['siklus_jumlah']} siklus")
        line("   {{ hasil }}")
        line("4. Simpulan: {{ simpulan }}")
        line("5. Usul/Rekomendasi: {{ usul }}")
        line()
        line("Daftar lampiran (exhibit) melekat pada laporan ini.")
        line()
        line("Dibuat oleh:", align=center)
        line("{{ penyidik }}", align=center)
    return doc


def cmd_docgen(args):
    from docxtpl import DocxTemplate

    ctx = {"nomor": "-", "tanggal": "-", "dasar": "[ISI surat perintah]", "penyidik": "[ISI nama+NIP]"}
    if args.context:
        with open(args.context, encoding="utf-8") as handle:
            ctx.update(json.load(handle))
    for item in args.set or []:
        key, sep, value = item.partition("=")
        if sep:
            ctx[key] = value

    con = _connect(args.db)
    stats = _case_stats(con)
    ctx.setdefault("materi", ["Pemeriksaan rekening", "Analisa aliran dana", "Penelitian bukti transaksi"])
    ctx.setdefault("materi_keterangan", ["[ISI]", "[ISI]", "[ISI]"])
    ctx.setdefault("maksud", "Meneliti kebenaran data transaksi dan aliran dana")
    ctx.setdefault("hasil", "")
    ctx.setdefault("simpulan", "")
    ctx.setdefault("usul", "")
    ctx["statistik"] = stats

    if args.template:
        source = args.template
    else:
        from tempfile import NamedTemporaryFile

        starter = _starter_template(args.kind, stats)
        with NamedTemporaryFile(suffix=".docx", delete=False) as handle:
            temp = handle.name
        starter.save(temp)
        source = temp

    template = DocxTemplate(source)
    template.render(ctx)
    template.save(args.out)
    print(f"dokumen {args.kind} → {args.out} (nilai kasus dari {args.db}: {stats['transaksi_jumlah']} transaksi, {stats['siklus_jumlah']} siklus)")


def cmd_exhibit(args):
    from docx import Document
    from docx.shared import Pt

    con = _connect(args.db)
    stats = _case_stats(con)
    con.execute("SELECT COUNT(*) FROM hia_txn").fetchone()

    doc = Document()
    doc.styles["Normal"].font.name = "Times New Roman"
    doc.styles["Normal"].font.size = Pt(12)
    doc.add_paragraph().add_run("DAFTAR LAMPIRAN (EXHIBIT)").bold = True
    doc.add_paragraph(f"Kasus: {args.kasus or '[ISI nama kasus]'}")
    table = doc.add_table(rows=1, cols=4)
    table.style = "Table Grid"
    for cell, header in zip(table.rows[0].cells, ("No.", "Kode", "Uraian", "Keterangan")):
        cell.text = header
    items = [
        ("A.1", "Data transaksi mentah", f"{stats['transaksi_jumlah']} baris, total Rp {stats['nominal_total']}"),
        ("A.2", "Workbook rekap aliran dana (xlsx)", "Ringkasan / Rekap Aliran / Transaksi / Siklus"),
        ("A.3", "Rekap pola siklus (json)", f"{stats['siklus_jumlah']} siklus terdeteksi"),
        ("A.4", "Grafis Sankey aliran dana (svg/png)", "Render: hyper viz sankey.json"),
    ]
    items.extend(
        (item.get("kode", "-"), item.get("uraian", "-"), item.get("keterangan", ""))
        for item in (json.loads(entry) for entry in args.item or [])
    )
    for index, (kode, uraian, keterangan) in enumerate(items, start=1):
        cells = table.add_row().cells
        cells[0].text = str(index)
        cells[1].text = kode
        cells[2].text = uraian
        cells[3].text = keterangan
    doc.save(args.out)
    print(f"daftar exhibit ({len(items)} lampiran) → {args.out}")


def main():
    parser = argparse.ArgumentParser(description="Forensic toolkit Hyper AI (offline)")
    parser.add_argument("--db", required=True, help="file DuckDB (dibuat bila belum ada)")
    sub = parser.add_subparsers(dest="command", required=True)

    load = sub.add_parser("load", help="muat CSV transaksi ke tabel hia_txn")
    load.add_argument("--csv", required=True)
    load.add_argument("--sep", default=",")
    load.set_defaults(func=cmd_load)

    summary = sub.add_parser("summary", help="ringkasan aliran")
    summary.add_argument("--top", type=int, default=20)
    summary.set_defaults(func=cmd_summary)

    cycles = sub.add_parser("cycles", help="deteksi siklus aliran dana (NetworkX)")
    cycles.add_argument("--out")
    cycles.add_argument("--max-cycles", type=int, default=50)
    cycles.set_defaults(func=cmd_cycles)

    sankey = sub.add_parser("sankey", help="spesifikasi Sankey untuk hyper viz")
    sankey.add_argument("--min", type=float, default=0)
    sankey.add_argument("--out")
    sankey.set_defaults(func=cmd_sankey)

    workbook = sub.add_parser("workbook", help="workbook multi-sheet (openpyxl)")
    workbook.add_argument("--out", required=True)
    workbook.set_defaults(func=cmd_workbook)

    docgen = sub.add_parser("docgen", help="draf BAP/LHP (docxtpl) berisi angka kasus")
    docgen.add_argument("--kind", choices=["bap", "lhp"], required=True)
    docgen.add_argument("--out", required=True)
    docgen.add_argument("--template", help="templat docx milik user (opsional)")
    docgen.add_argument("--context", help="JSON isian tambahan")
    docgen.add_argument("--set", action="append", help="isian key=value (bisa berulang)")
    docgen.set_defaults(func=cmd_docgen)

    exhibit = sub.add_parser("exhibit", help="daftar lampiran/ exhibit (docx)")
    exhibit.add_argument("--out", required=True)
    exhibit.add_argument("--kasus", help="nama kasus untuk kepala daftar")
    exhibit.add_argument("--item", action="append", help="JSON {kode,uraian,keterangan} (bisa berulang)")
    exhibit.set_defaults(func=cmd_exhibit)

    args = parser.parse_args()
    if args.command == "load":
        # --db is required for every command but load creates it.
        pass
    args.func(args)


if __name__ == "__main__":
    main()
`
