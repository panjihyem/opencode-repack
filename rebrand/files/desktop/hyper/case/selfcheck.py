"""Run: python3 selfcheck.py (no case files or third-party packages required)."""

import json
from pathlib import Path
from tempfile import TemporaryDirectory

import case
from case import CaseError, _fields_in, validate


SCHEMA = {
    "required": ["kasus_id", "wp", "temuan"],
    "properties": {
        "kasus_id": {"type": "string"},
        "wp": {"type": "object", "properties": {"nama": {"type": "string"}}},
        "temuan": {"type": "array"},
    },
}


with TemporaryDirectory() as directory:
    root = Path(directory)
    (root / "uji").mkdir()
    (root / "uji" / "parameter.schema.json").write_text(json.dumps(SCHEMA), encoding="utf-8")
    case.DEFAULT_ROOTS = [root]
    report = validate("uji", {"kasus_id": "K-1", "wp": {"nama": ""}, "temuan": ["a"]})
    assert report["field_wajib_kosong"] == ["wp.nama"], report
    report = validate("uji", {"kasus_id": "K-1", "wp": {"nama": 7}, "temuan": ["a"]})
    assert report["tipe_salah"] == [("wp.nama", "string")], report
    report = validate("uji", {"kasus_id": "K-1", "wp": {"nama": "Anonim"}, "temuan": ["a"]})
    assert report["valid"], report
    try:
        validate("uji", [])
    except CaseError:
        pass
    else:
        raise AssertionError("non-object JSON must be rejected")

assert _fields_in("Dasar (dasar.nomor, dasar.tanggal)") == ["dasar.nomor", "dasar.tanggal"]

# --- redaksi lokal -----------------------------------------------------------
import pseudonym

SHEET = {
    "kasus_id": "SYNTH-01",
    "wp": {"nama": "PT CONTOH SINTETIS", "npwp": "00.000.000.0-000.000", "alamat": "Jl. Uji No. 1", "nama_usaha": "Uji"},
    "penyidik": {"nama": "Petugas Uji", "nip": "000"},
    "terperiksa": {"nama": "Petugas Uji Dua", "nip": "000"},
    "rekening": [{"nomor": "1234567890123", "pemilik": "PT CONTOH SINTETIS", "bank": "Bank Uji"}],
    "hasil": "Transfer ke PT CONTOH SINTETIS pada 00.000.000.0-000.000 sebesar Rp 1.000",
    "temuan": [],
}

mapping = pseudonym.build_map(SHEET)
assert all(value not in mapping.values() for value in SHEET["wp"].values() if value)
redacted = pseudonym.redact_sheet(SHEET, mapping)
assert redacted["wp"]["nama"] == "[[NAMA-1]]", redacted["wp"]
assert redacted["penyidik"]["nama"] == "[[PENYIDIK-1]]", "peran berbeda memakai token berbeda"

# Nilai yang muncul di teks bebas juga harus ikut diganti.
assert "PT CONTOH SINTETIS" not in json.dumps(redacted, ensure_ascii=False)
assert "00.000.000.0-000.000" not in redacted["hasil"], redacted["hasil"]

assert not pseudonym.screen(json.dumps(redacted, ensure_ascii=False), mapping)["blocked"]

raw = json.dumps(SHEET, ensure_ascii=False)
blocked = pseudonym.screen(raw, mapping)
assert blocked["blocked"], "sheet mentah harus diblokir"
assert any(item["kind"] == "npwp" for item in blocked["findings"]), blocked

# Teks bebas tanpa nilai kasus tetap diperiksa polanya.
assert pseudonym.screen("hubungi 081234567890")["blocked"]
assert pseudonym.screen("tidak ada identitas di sini")["blocked"] is False

text = "Nama: [[NAMA-1]], NPWP: [[NPWP-1]]"
assert pseudonym.restore_text(text, mapping) == "Nama: PT CONTOH SINTETIS, NPWP: 00.000.000.0-000.000"

# Penggantian harus menghormati batas kata: "PT" tidak boleh memotong kata lain.
short = {"PT": "[[NAMA-1]]"}
assert pseudonym.redact_text("PT CONTOH dan OPTIMAL", short) == "[[NAMA-1]] CONTOH dan OPTIMAL"
# Huruf besar/kecil tidak membedakan.
assert pseudonym.redact_text("pt contoh", short) == "[[NAMA-1]] contoh"
# Nilai terlalu pendek ditolak, bukan diredaksi setengah hati.
try:
    pseudonym.build_map({"wp": {"nama": "AB"}})
except pseudonym.RedactionError:
    pass
else:
    raise AssertionError("nilai 2 karakter harus ditolak")
try:
    pseudonym.restore_text("[[TIDAK-ADA-9]]", mapping)
except pseudonym.RedactionError:
    pass
else:
    raise AssertionError("token asing harus ditolak")

print("case selfcheck: OK")
