"""Modul kasus berulang untuk Hyper AI.

Satu jenis kasus = satu folder berisi:
  parameter.schema.json  -> deklarasi field (JSON Schema) + peta ke placeholder docx
  playbook.md            -> urutan langkah, kriteria, checklist
  template/*.docx        -> dokumen keluaran

Fungsi modul ini: membuat parameter sheet, memeriksa kelengkapan field, merender
dokumen, dan menandai checklist yang sudah terpenuhi. Semua berjalan lokal.
"""

from __future__ import annotations

import json
import os
import re
from pathlib import Path

DOCX_PLACEHOLDER = re.compile(r"\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}")

DEFAULT_ROOTS = [
    Path(os.path.expanduser("~/Hyper-Knowledge/cases")),
    Path(os.path.expanduser("~/.config/opencode/hyper/cases")),
]


class CaseError(Exception):
    """Kesalahan yang bisa dipahami user (salah jenis kasus, data tidak valid)."""


def roots() -> list[Path]:
    """Folder tempat jenis kasus disimpan (yang pertama ada dipakai)."""
    for root in DEFAULT_ROOTS:
        if root.is_dir():
            return [root]
    return [DEFAULT_ROOTS[0]]


def cases_root() -> Path:
    root = roots()[0]
    root.mkdir(parents=True, exist_ok=True)
    return root


def list_cases() -> list[dict]:
    """Daftar jenis kasus yang tersedia."""
    found = []
    for root in roots():
        if not root.is_dir():
            continue
        for entry in sorted(root.iterdir()):
            if not entry.is_dir() or not (entry / "parameter.schema.json").is_file():
                continue
            schema = read_json(entry / "parameter.schema.json")
            templates = sorted(p.name for p in (entry / "template").glob("*.docx")) if (entry / "template").is_dir() else []
            found.append(
                {
                    "id": entry.name,
                    "title": schema.get("title", entry.name),
                    "description": schema.get("description", ""),
                    "path": str(entry),
                    "templates": templates,
                    "required": schema.get("required", []),
                }
            )
    return found


def case_dir(kind: str) -> Path:
    if not re.fullmatch(r"[a-zA-Z0-9_-]+", kind):
        raise CaseError("jenis kasus hanya boleh berisi huruf, angka, '-' dan '_'")
    for root in roots():
        candidate = root / kind
        if candidate.is_dir():
            return candidate
    raise CaseError(f"jenis kasus '{kind}' tidak ditemukan di {', '.join(str(r) for r in roots())}")


def read_json(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as error:
        raise CaseError(f"berkas tidak ditemukan: {path}") from error
    except json.JSONDecodeError as error:
        raise CaseError(f"JSON tidak valid di {path}: {error}") from error


def load_schema(kind: str) -> dict:
    return read_json(case_dir(kind) / "parameter.schema.json")


def load_playbook(kind: str) -> str:
    path = case_dir(kind) / "playbook.md"
    try:
        return path.read_text(encoding="utf-8")
    except FileNotFoundError as error:
        raise CaseError(f"playbook tidak ditemukan: {path}") from error


def _get(data: dict, path: str, default=None):
    """Ambil nilai dari path bertanda titik, mis. 'wp.npwp'."""
    current = data
    for part in path.split("."):
        if not isinstance(current, dict) or part not in current:
            return default
        current = current[part]
    return current


def _is_blank(value) -> bool:
    if value is None:
        return True
    if isinstance(value, str):
        return not value.strip()
    if isinstance(value, (list, dict)):
        return len(value) == 0
    return False


def _leaf_paths(prefix: str, spec: dict) -> list[str]:
    """Rincikan sebuah objek menjadi jalur field daunnya.

    Field wajib bertipe objek (mis. `wp`) tidak bisa diperiksa hanya dari
    keberadaannya: objek dengan seluruh isi kosong tetap harus dihitung belum
    terisi. Jadi objek dipecah menjadi daunnya.
    """
    properties = spec.get("properties")
    if spec.get("type") != "object" or not properties:
        return [prefix]
    leaves: list[str] = []
    for name, child in properties.items():
        leaves.extend(_leaf_paths(f"{prefix}.{name}" if prefix else name, child))
    return leaves


def validate(kind: str, data: dict) -> dict:
    """Periksa kelengkapan parameter sheet terhadap skema.

    Mengembalikan ringkasan: field wajib yang kosong, field opsional yang
    kosong, dan field bertipe salah.
    """
    schema = load_schema(kind)
    if not isinstance(data, dict):
        raise CaseError("parameter sheet harus objek JSON")
    required = schema.get("required", [])
    properties = schema.get("properties", {})

    required_leaves: list[str] = []
    for field in required:
        spec = properties.get(field)
        required_leaves.extend(_leaf_paths(field, spec) if spec else [field])

    missing, optional_missing, wrong_type = [], [], []

    for field in required_leaves:
        value = _get(data, field)
        if _is_blank(value):
            missing.append(field)
            continue
        spec = properties.get(field.split(".")[0], {})
        for part in field.split(".")[1:]:
            spec = spec.get("properties", {}).get(part, {})
        expected = spec.get("type")
        if expected and not _matches_type(value, expected):
            wrong_type.append((field, expected))

    for field, spec in properties.items():
        if field in required:
            continue
        value = _get(data, field)
        if _is_blank(value):
            optional_missing.append(field)
            continue
        expected = spec.get("type")
        if expected and not _matches_type(value, expected):
            wrong_type.append((field, expected))

    return {
        "jenis": kind,
        "valid": not missing and not wrong_type,
        "field_wajib_kosong": missing,
        "field_opsional_kosong": optional_missing,
        "tipe_salah": wrong_type,
    }


def _matches_type(value, expected: str) -> bool:
    return {
        "string": lambda: isinstance(value, str),
        "integer": lambda: isinstance(value, int) and not isinstance(value, bool),
        "number": lambda: isinstance(value, (int, float)) and not isinstance(value, bool),
        "array": lambda: isinstance(value, list),
        "object": lambda: isinstance(value, dict),
    }.get(expected, lambda: True)()


def _docx_context(kind: str, data: dict) -> dict:
    """Bangun konteks render dari peta skema -> placeholder docx."""
    schema = load_schema(kind)
    mapping = schema.get("x-docx", {})
    context = {}
    for placeholder, source in mapping.items():
        value = _get(data, source)
        context[placeholder] = (["[ISI]"] * 3 if placeholder in ("materi", "materi_keterangan") else "[ISI]") if _is_blank(value) else value
    statistik = data.get("statistik") or {}
    context["statistik"] = {key: statistik.get(key) if statistik.get(key) is not None else "[ISI]" for key in (
        "transaksi_jumlah", "tanggal_mulai", "tanggal_selesai", "nominal_total", "rekening_jumlah", "siklus_jumlah"
    )}
    return context


def render(kind: str, data: dict, outdir: Path, only: list[str] | None = None) -> list[Path]:
    """Render semua templat .docx menjadi dokumen akhir."""
    from docxtpl import DocxTemplate

    directory = case_dir(kind)
    template_dir = directory / "template"
    if not template_dir.is_dir():
        raise CaseError(f"folder template tidak ditemukan: {template_dir}")

    report = validate(kind, data)
    if not report["valid"]:
        raise CaseError(f"parameter sheet belum valid: {report['field_wajib_kosong']}, {report['tipe_salah']}")
    case_id = data["kasus_id"]
    if not re.fullmatch(r"[a-zA-Z0-9_-]+", case_id):
        raise CaseError("kasus_id hanya boleh berisi huruf, angka, '-' dan '_'")
    context = _docx_context(kind, data)
    templates = [p for p in sorted(template_dir.glob("*.docx")) if not only or p.stem in only]
    if not templates:
        raise CaseError(f"tidak ada template yang dirender untuk '{kind}'")
    outdir.mkdir(parents=True, exist_ok=True)
    targets = [outdir / f"{p.stem}-{case_id}.docx" for p in templates]
    if existing := [p for p in targets if p.exists()]:
        raise CaseError(f"dokumen sudah ada; tidak ditimpa: {', '.join(map(str, existing))}")
    written = []
    for template_path, target in zip(templates, targets):
        template = DocxTemplate(str(template_path))
        template.render(context)
        template.save(str(target))
        written.append(target)
    return written


def unresolved_placeholders(path: Path) -> list[str]:
    """Placeholder yang masih tertinggal di dokumen hasil render."""
    from docx import Document

    document = Document(str(path))
    found = set()
    for paragraph in document.paragraphs:
        found |= set(DOCX_PLACEHOLDER.findall(paragraph.text))
    for table in document.tables:
        for row in table.rows:
            for cell in row.cells:
                found |= set(DOCX_PLACEHOLDER.findall(cell.text))
    return sorted(found)


def scaffold(kind: str, data: dict | None = None) -> dict:
    """Buat parameter sheet kosong dari skema (isi nilai default bila ada)."""
    schema = load_schema(kind)
    if data:
        return data
    template = schema.get("x-template-data")
    if isinstance(template, dict):
        return json.loads(json.dumps(template))
    result: dict = {}
    for field, spec in schema.get("properties", {}).items():
        kind_of = spec.get("type")
        result[field] = {
            "string": "",
            "number": 0,
            "integer": 0,
            "array": [],
            "object": {},
        }.get(kind_of, "")
    return result


CHECKBOX = re.compile(r"^\s*[-*]\s*\[( |x|X)\]\s*(.+)$")
FIELD_NAME = re.compile(r"[a-zA-Z0-9_.]+")


def _fields_in(text: str) -> list[str]:
    """Ambil nama field yang disebut di dalam kurung siku.

    Kurung bisa berisi satu field (`(hasil)`) atau beberapa
    (`(dasar.nomor, dasar.tanggal)`), jadi isinya dipecah per koma.
    """
    names: list[str] = []
    for group in re.findall(r"\(([^)]*)\)", text):
        for part in group.split(","):
            candidate = part.strip()
            if FIELD_NAME.fullmatch(candidate):
                names.append(candidate)
    return names


def checklist(kind: str, data: dict) -> list[dict]:
    """Baca checklist dari playbook dan tandai mana yang sudah terpenuhi.

    Item dianggap terpenuhi bila seluruh field yang disebut pada kurung siku
    terisi, mis. `- [ ] BAP terisi (materi_pemeriksaan)`.
    """
    items = []
    for line in load_playbook(kind).splitlines():
        match = CHECKBOX.match(line)
        if not match:
            continue
        done = match.group(1).lower() == "x"
        text = match.group(2).strip()
        fields = _fields_in(text)
        status = "terpenuhi" if done else "belum"
        if fields and not done:
            terisi = [f for f in fields if not _is_blank(_get(data, f))]
            status = "terpenuhi" if len(terisi) == len(fields) else ("sebagian" if terisi else "belum")
        items.append({"item": text, "status": status, "field": fields})
    return items
