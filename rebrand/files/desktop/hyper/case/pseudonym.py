"""Redaksi lokal untuk data kasus.

Prinsip:
  - Nilai sensitif yang sudah diketahui (dari parameter sheet) diganti token
    deterministik, jadi pemetaan bisa dibalik saat dokumen dirender.
  - Teks bebas diperiksa dengan pola identitas Indonesia; pola yang cocok
    dianggap terlarang (fail-closed), bukan "mungkin aman".
  - Berkas token ditulis 0600 dan tidak boleh ikut terkirim ke mana pun.

Modul ini tidak memanggil jaringan dan tidak memakai model.
"""

from __future__ import annotations

import json
import os
import re
from pathlib import Path

TOKEN = re.compile(r"\[\[([A-Z]+)-(\d+)\]\]")
# Token apa pun yang masih tersisa setelah pemulihan berarti peta tidak cocok.
RESIDUAL = re.compile(r"\[\[[^\]\n]{1,40}\]\]")

# Urutan penting: pola paling spesifik lebih dulu.
PATTERNS: list[tuple[str, str]] = [
    ("npwp", r"\b\d{2}\.\d{3}\.\d{3}\.\d-\d{3}\.\d{3}\b"),
    ("nik", r"\b\d{16}\b"),
    ("email", r"\b[\w.+-]+@[\w-]+\.[\w.-]+\b"),
    ("telepon", r"\b(?:\+62|62|0)8\d{7,11}\b"),
    ("rekening", r"\b\d{10,20}\b"),
]

# Field yang nilainya tidak boleh keluar apa adanya.
SENSITIVE_FIELDS: list[tuple[str, str]] = [
    ("wp.nama", "NAMA"),
    ("wp.npwp", "NPWP"),
    ("wp.alamat", "ALAMAT"),
    ("wp.nama_usaha", "USAHA"),
    ("penyidik.nama", "PENYIDIK"),
    ("penyidik.nip", "NIP"),
    ("terperiksa.nama", "TERPERIKSA"),
    ("terperiksa.nip", "NIP"),
    ("rekening[].nomor", "REK"),
    ("rekening[].pemilik", "PEMILIK"),
    ("rekening[].bank", "BANK"),
    ("dasar.nomor", "DASAR"),
]


class RedactionError(Exception):
    """Input tidak bisa diredaksi dengan aman."""


def _get(data, path: str):
    current = data
    for part in path.split("."):
        if part.endswith("[]"):
            part = part[:-2]
            if not isinstance(current, dict):
                return []
            rows = current.get(part) or []
            return [row.get(path.split(".")[-1]) for row in rows if isinstance(row, dict)]
        if not isinstance(current, dict) or part not in current:
            return None
        current = current[part]
    return current


def _sensitive_values(sheet: dict) -> list[tuple[str, str]]:
    found: list[tuple[str, str]] = []
    for field, category in SENSITIVE_FIELDS:
        values = _get(sheet, field)
        for value in values if isinstance(values, list) else [values]:
            if isinstance(value, str) and value.strip():
                found.append((category, value.strip()))
    return found


def build_map(sheet: dict) -> dict:
    """Peta nilai -> token. Diurutkan dari nilai terpanjang agar tidak tumpang tindih."""
    mapping: dict[str, str] = {}
    counters: dict[str, int] = {}
    values = sorted(_sensitive_values(sheet), key=lambda item: -len(item[1]))
    for category, value in values:
        if len(value) < 3:
            # Nilai sependek ini tidak bisa diganti dengan aman di teks bebas.
            raise RedactionError(
                f"nilai {category} terlalu pendek untuk diredaksi aman ({len(value)} karakter); "
                "lengkapi isinya di parameter sheet"
            )
        if value in mapping:
            continue
        counters[category] = counters.get(category, 0) + 1
        mapping[value] = f"[[{category}-{counters[category]}]]"
    return mapping


def redact_text(text: str, mapping: dict) -> str:
    """Ganti nilai sensitif sebagai kata utuh, bukan potongan kata.

    Penggantian substring biasa merusak teks: nilai pendek seperti "PT" akan
    menghapus setiap "PT" di dokumen. Karena itu dipakai batas kata dan huruf
    besar/kecil diabaikan (lebih banyak yang tertangkap, bukan lebih sedikit).
    """
    result = text
    for value, token in sorted(mapping.items(), key=lambda item: -len(item[0])):
        pattern = re.compile(rf"(?<![0-9A-Za-z]){re.escape(value)}(?![0-9A-Za-z])", re.IGNORECASE)
        result = pattern.sub(token, result)
    return result


def redact_sheet(sheet: dict, mapping: dict) -> dict:
    """Salinan sheet dengan setiap nilai sensitif diganti token."""
    if isinstance(sheet, dict):
        return {key: redact_sheet(value, mapping) for key, value in sheet.items()}
    if isinstance(sheet, list):
        return [redact_sheet(item, mapping) for item in sheet]
    if isinstance(sheet, str):
        return redact_text(sheet, mapping)
    return sheet


def restore_text(text: str, mapping: dict) -> str:
    """Kembalikan token menjadi nilai asli. Token tak dikenal = gagal."""
    reverse = {token: value for value, token in mapping.items()}
    result = text
    for token, value in sorted(reverse.items(), key=lambda item: -len(item[0])):
        result = result.replace(token, value)
    leftover = sorted(set(RESIDUAL.findall(result)))
    if leftover:
        raise RedactionError(f"token tidak dikenal (peta salah?): {', '.join(leftover)}")
    return result


def screen(text: str, mapping: dict | None = None) -> dict:
    """Periksa teks yang akan keluar. Mengembalikan temuan tanpa menyalin nilainya."""
    findings: list[dict] = []
    for value in (mapping or {}):
        if value and value in text:
            findings.append({"kind": "nilai-kasus", "detail": "nilai sensitif dari parameter sheet muncul apa adanya"})
            break
    for kind, pattern in PATTERNS:
        for match in re.finditer(pattern, text):
            findings.append({"kind": kind, "span": [match.start(), match.end()]})
    return {"blocked": bool(findings), "findings": findings}


def write_tokens(path: Path, mapping: dict, sheet: dict) -> None:
    payload = json.dumps(
        {"tokens": {token: value for value, token in mapping.items()}, "field_count": len(mapping)},
        ensure_ascii=False,
        indent=2,
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
        handle.write(payload + "\n")


def read_tokens(path: Path) -> dict:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as error:
        raise RedactionError(f"berkas token tidak ditemukan: {path}") from error
    except json.JSONDecodeError as error:
        raise RedactionError(f"berkas token tidak valid: {error}") from error
    return {value: token for token, value in payload.get("tokens", {}).items()}
