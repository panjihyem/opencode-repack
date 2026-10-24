"""CLI kasus berulang Hyper AI.

    hyper-case list                       daftar jenis kasus
    hyper-case new <jenis> [--data f]     buat parameter sheet
    hyper-case validate <jenis> [--data f] periksa kelengkapan field
    hyper-case render <jenis> --data f --out DIR   hasilkan dokumen
    hyper-case checklist <jenis> [--data f]        status langkah kerja
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import casemode  # noqa: E402
from case import (  # noqa: E402
    CaseError,
    case_dir,
    checklist,
    list_cases,
    load_playbook,
    render,
    scaffold,
    unresolved_placeholders,
    validate,
)
from pseudonym import (  # noqa: E402
    RedactionError,
    build_map,
    read_tokens,
    redact_sheet,
    redact_text,
    restore_text,
    screen,
    write_tokens,
)


def _load(path: str | None) -> dict:
    if not path:
        return {}
    file = Path(path).expanduser()
    if not file.is_file():
        raise CaseError(f"berkas data tidak ditemukan: {file}")
    try:
        return json.loads(file.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise CaseError(f"JSON tidak valid di {file}: {error}") from error


def _cmd_list(_args) -> int:
    cases = list_cases()
    if getattr(_args, "json", False):
        print(json.dumps({"cases": cases}, ensure_ascii=False))
        return 0
    if not cases:
        print("Belum ada jenis kasus. Buat folder di ~/Hyper-Knowledge/cases/<jenis>/")
        return 0
    print(f"{len(cases)} jenis kasus tersedia:\n")
    for item in cases:
        print(f"  {item['id']}")
        if item["description"]:
            print(f"      {item['description']}")
        if item["templates"]:
            print(f"      template: {', '.join(item['templates'])}")
    return 0


def _cmd_new(args) -> int:
    data = _load(args.data) or scaffold(args.jenis)
    target = Path(args.out).expanduser() if args.out else Path.cwd() / "parameter.json"
    try:
        target.parent.mkdir(parents=True, exist_ok=True)
        with target.open("x", encoding="utf-8") as output:
            output.write(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
    except FileExistsError as error:
        raise CaseError(f"parameter sheet sudah ada; tidak ditimpa: {target}") from error
    print(f"parameter sheet dibuat: {target}")
    report = validate(args.jenis, data)
    if report["field_wajib_kosong"]:
        print("  field wajib yang belum terisi:")
        for field in report["field_wajib_kosong"]:
            print(f"    - {field}")
    return 0


def _cmd_validate(args) -> int:
    data = _load(args.data)
    report = validate(args.jenis, data)
    if getattr(args, "json", False):
        print(json.dumps(report, ensure_ascii=False))
        return 0
    print(f"Jenis kasus : {report['jenis']}")
    print(f"Status      : {'VALID' if report['valid'] else 'BELUM LENGKAP'}")
    if report["field_wajib_kosong"]:
        print("\nField wajib yang belum terisi:")
        for field in report["field_wajib_kosong"]:
            print(f"  - {field}")
    if report["tipe_salah"]:
        print("\nField dengan tipe salah:")
        for field, expected in report["tipe_salah"]:
            print(f"  - {field} (harus {expected})")
    if report["field_opsional_kosong"]:
        print("\nField opsional yang masih kosong:")
        print("  " + ", ".join(report["field_opsional_kosong"]))
    return 0 if report["valid"] else 1


def _cmd_render(args) -> int:
    data = _load(args.data)
    report = validate(args.jenis, data)
    if not report["valid"]:
        print("Render dibatalkan - parameter sheet belum valid:", flush=True)
        for field in report["field_wajib_kosong"]:
            print(f"  - kosong: {field}")
        for field, expected in report["tipe_salah"]:
            print(f"  - tipe salah: {field} (harus {expected})")
        return 1
    outdir = Path(args.out).expanduser() if args.out else Path.cwd() / "dokumen"
    written = render(args.jenis, data, outdir, only=args.hanya or None)
    for path in written:
        sisa = unresolved_placeholders(path)
        print(f"dokumen: {path}")
        if sisa:
            print(f"  perlu diisi & diverifikasi: {', '.join(sisa)}")
    return 0


def _cmd_checklist(args) -> int:
    data = _load(args.data)
    items = checklist(args.jenis, data)
    if not items:
        print("Playbook tidak memuat checklist.")
        return 0
    labels = {"terpenuhi": "[x]", "sebagian": "[~]", "belum": "[ ]"}
    print(f"Checklist - {args.jenis}\n")
    for item in items:
        print(f"  {labels.get(item['status'], '[?]')} {item['item']}")
    belum = [i for i in items if i["status"] != "terpenuhi"]
    print(f"\n{len(items) - len(belum)}/{len(items)} langkah terpenuhi")
    return 0


def _cmd_playbook(args) -> int:
    print(load_playbook(args.jenis))
    return 0


def _cmd_redact(args) -> int:
    """Buat salinan parameter sheet + teks tanpa identitas, beserta peta token."""
    data = _load(args.data)
    report = validate(args.jenis, data)
    if not report["valid"]:
        raise CaseError(f"parameter sheet belum valid: {report['field_wajib_kosong']} {report['tipe_salah']}")
    mapping = build_map(data)
    if not mapping:
        raise CaseError("tidak ada nilai sensitif yang bisa diredaksi; periksa isi parameter sheet")

    outdir = Path(args.out).expanduser() if args.out else Path(args.data).expanduser().parent
    redacted = outdir / "parameter.redacted.json"
    tokens = outdir / "tokens.json"
    if redacted.exists() or tokens.exists():
        raise CaseError(f"hasil redaksi sudah ada; tidak ditimpa: {redacted}, {tokens}")
    outdir.mkdir(parents=True, exist_ok=True)

    redacted.write_text(json.dumps(redact_sheet(data, mapping), indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    leaks = screen(redacted.read_text(encoding="utf-8"), mapping)
    if getattr(args, "json", False):
        if leaks["blocked"]:
            redacted.unlink(missing_ok=True)
            print(json.dumps({"ok": False, "findings": leaks["findings"]}, ensure_ascii=False))
            return 1
        write_tokens(tokens, mapping, data)
        print(json.dumps({"ok": not leaks["blocked"], "redacted": str(redacted), "tokens": str(tokens), "count": len(mapping), "findings": leaks["findings"]}, ensure_ascii=False))
        return 0
    write_tokens(tokens, mapping, data)
    print(f"sheet redaksi : {redacted}")
    print(f"peta token    : {tokens} (0600, jangan dikirim ke mana pun)")
    print(f"nilai diganti : {len(mapping)}")
    if not casemode.status()["case_mode"]:
        print("PERINGATAN: mode kasus belum aktif; jalankan 'mode on' supaya memori otomatis berhenti")
    if leaks["blocked"]:
        print(f"PERINGATAN: pola identitas masih terdeteksi: {leaks['findings']}")
        return 1
    print("pemeriksaan  : tidak ada pola identitas tersisa")
    return 0


def _cmd_screen(args) -> int:
    """Periksa teks yang akan keluar; keluar dengan kode 1 bila ada temuan."""
    text = Path(args.data).expanduser().read_text(encoding="utf-8")
    mapping = read_tokens(Path(args.tokens).expanduser()) if args.tokens else None
    result = screen(text, mapping)
    if not result["blocked"]:
        print("tidak ada pola identitas yang terdeteksi")
        print("catatan: lolos pola BUKAN jaminan aman; nilai dan narasi tetap bisa sensitif")
        return 0
    print(f"DIBLOKIR: {len(result['findings'])} temuan")
    for finding in result["findings"]:
        print(f"  - {finding['kind']}" + (f" pada {finding['span']}" if "span" in finding else ""))
    return 1


def _cmd_restore(args) -> int:
    """Kembalikan token pada teks menjadi nilai asli, untuk dirender lokal."""
    text = Path(args.data).expanduser().read_text(encoding="utf-8")
    mapping = read_tokens(Path(args.tokens).expanduser())
    target = Path(args.out).expanduser() if args.out else None
    restored = restore_text(text, mapping)
    if target:
        if target.exists():
            raise CaseError(f"tujuan sudah ada; tidak ditimpa: {target}")
        target.write_text(restored, encoding="utf-8")
        print(f"dipulihkan: {target}")
    else:
        print(restored)
    return 0


def _cmd_mode(args) -> int:
    if args.aksi == "status":
        state = casemode.status()
        if getattr(args, "json", False):
            print(json.dumps(state, ensure_ascii=False))
            return 0
        print(f"mode kasus : {'AKTIF' if state['case_mode'] else 'nonaktif'}")
        if state["case_mode"]:
            print(f"sejak      : {state['enabled_at']}")
            print(f"ditolak    : {', '.join(state['managed_policies']) or '-'}")
            print("catatan    : model agent tetap remote dan shell tetap bisa keluar;")
            print("             pakai hyper-case redact sebelum mengirim data kasus")
        return 0
    result = casemode.enable() if args.aksi == "on" else casemode.disable()
    if getattr(args, "json", False):
        print(json.dumps(result, ensure_ascii=False))
        return 0
    print(f"mode kasus : {'AKTIF' if result['case_mode'] else 'nonaktif'}")
    if result["changed"]:
        print(f"perubahan  : {', '.join(result['changed'])}")
    if result.get("plugin"):
        print(f"plugin memori: {result['plugin']}")
    print("berlaku setelah konfigurasi dimuat ulang (buka sesi baru).")
    return 0


def _cmd_path(args) -> int:
    print(case_dir(args.jenis))
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="hyper-case", description="Kasus berulang Hyper AI")
    sub = parser.add_subparsers(dest="perintah", required=True)

    p_list = sub.add_parser("list", help="daftar jenis kasus")
    p_list.add_argument("--json", action="store_true")
    p_list.set_defaults(func=_cmd_list)

    p_new = sub.add_parser("new", help="buat parameter sheet")
    p_new.add_argument("jenis")
    p_new.add_argument("--data", help="berkas data sumber (opsional)")
    p_new.add_argument("--out", help="tujuan parameter sheet")
    p_new.set_defaults(func=_cmd_new)

    p_val = sub.add_parser("validate", help="periksa kelengkapan")
    p_val.add_argument("jenis")
    p_val.add_argument("--data")
    p_val.add_argument("--json", action="store_true")
    p_val.set_defaults(func=_cmd_validate)

    p_ren = sub.add_parser("render", help="hasilkan dokumen")
    p_ren.add_argument("jenis")
    p_ren.add_argument("--data", required=True)
    p_ren.add_argument("--out", help="folder keluaran")
    p_ren.add_argument("--hanya", nargs="*", help="hanya render template tertentu")
    p_ren.set_defaults(func=_cmd_render)

    p_chk = sub.add_parser("checklist", help="status langkah kerja")
    p_chk.add_argument("jenis")
    p_chk.add_argument("--data")
    p_chk.set_defaults(func=_cmd_checklist)

    p_pb = sub.add_parser("playbook", help="tampilkan playbook")
    p_pb.add_argument("jenis")
    p_pb.set_defaults(func=_cmd_playbook)

    p_red = sub.add_parser("redact", help="buat sheet + teks tanpa identitas")
    p_red.add_argument("jenis")
    p_red.add_argument("--data", required=True)
    p_red.add_argument("--out", help="folder hasil (default: folder parameter sheet)")
    p_red.add_argument("--json", action="store_true")
    p_red.set_defaults(func=_cmd_redact)

    p_scr = sub.add_parser("screen", help="periksa teks sebelum dikirim")
    p_scr.add_argument("--data", required=True, help="berkas teks yang akan diperiksa")
    p_scr.add_argument("--tokens", help="peta token kasus (opsional, menambah pemeriksaan nilai)")
    p_scr.set_defaults(func=_cmd_screen)

    p_res = sub.add_parser("restore", help="kembalikan token ke nilai asli")
    p_res.add_argument("--data", required=True)
    p_res.add_argument("--tokens", required=True)
    p_res.add_argument("--out", help="tulis ke berkas (default: stdout)")
    p_res.set_defaults(func=_cmd_restore)

    p_mode = sub.add_parser("mode", help="saklar mode kasus")
    p_mode.add_argument("aksi", choices=["on", "off", "status"])
    p_mode.add_argument("--json", action="store_true")
    p_mode.set_defaults(func=_cmd_mode)

    p_pa = sub.add_parser("path", help="lokasi folder jenis kasus")
    p_pa.add_argument("jenis")
    p_pa.set_defaults(func=_cmd_path)

    args = parser.parse_args(argv)
    try:
        return args.func(args)
    except (CaseError, RedactionError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
