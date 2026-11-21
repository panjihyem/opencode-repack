"""Generate rebrand/files/desktop/hyper/slides.ts dari skill hyper-slides lokal.

Sumber tunggal = C:\\Users\\SER\\.config\\opencode\\skill\\hyper-slides.
Skrip ini menyematkan setiap berkas sebagai string TS agar build Hyper AI
mengirim skill + pustaka ke bundle tanpa menyimpan salinan kedua di repo.

Jalankan ulang setelah skill diubah:
    python tools/gen-slides-module.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

SRC = Path(r"C:\Users\SER\.config\opencode\skill\hyper-slides")
OUT = Path(__file__).resolve().parent.parent / "rebrand" / "files" / "desktop" / "hyper" / "slides.ts"

FILES = [
    "SKILL.md",
    "scripts/theme.json",
    "scripts/slides_lib.py",
    "scripts/icon_pack.py",
    "scripts/stock_images.py",
    "scripts/selftest.py",
    "scripts/qa_render.ps1",
]

HEADER = '''// HYPER_AI_MANAGED — hyper-slides skill (dibangkitkan oleh tools/gen-slides-module.py).
//
// Deck PPTX modern: infografis native, chart tertanam, animasi/transisi, ikon
// lucide, foto stok, dan QA render lewat PowerPoint. Berkas di bawah ditulis ke
// bundle saat provisioning; jangan mengedit manual — ubah skill di
// ~/.config/opencode/skill/hyper-slides lalu jalankan generator.

export type SlidesFile = { path: string; content: string }

export const SLIDES_ROOT = "hyper-slides"

export const SLIDES_FILES: SlidesFile[] = [
'''

FOOTER = ''']

/** Daftar path relatif yang dikirim; dipakai untuk verifikasi pasca-tulis. */
export const SLIDES_PATHS = SLIDES_FILES.map((file) => file.path)
'''


def main() -> int:
    if not SRC.is_dir():
        print(f"error: sumber skill tidak ada: {SRC}")
        return 1
    chunks = [HEADER]
    for rel in FILES:
        path = SRC / rel
        if not path.is_file():
            print(f"error: berkas wajib hilang: {path}")
            return 1
        text = path.read_text(encoding="utf-8")
        # JSON.stringify aman untuk semua karakter (termasuk backtick & ${})
        chunks.append(f"  {{ path: {json.dumps(rel)}, content: {json.dumps(text)} }},\n")
    chunks.append(FOOTER)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    body = "".join(chunks)
    OUT.write_text(body, encoding="utf-8")
    print(f"OK: {OUT} ({len(body):,} B) · {len(FILES)} berkas disematkan")
    for rel in FILES:
        print(f"  {rel}: {(SRC / rel).stat().st_size:,} B")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
