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

    args = parser.parse_args()
    if args.command == "load":
        # --db is required for every command but load creates it.
        pass
    args.func(args)


if __name__ == "__main__":
    main()
`
