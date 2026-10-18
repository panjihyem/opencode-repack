# Hyper AI — Roadmap Office & Investigasi Pajak (Plan v1)

Tanggal: 2026-10-18 · Status baseline: v2.0.32 + tier model + Docling + hindsight + wordmark (commit 832498d)
Referensi memori: hindsight bank `hyper-plan` (document_id `roadmap-v1`).

## Tujuan

Hyper AI siap dipakai penyidik pajak & pekerjaan kantor harian tanpa konfigurasi:
baca/buat dokumen & Excel, riset online, memori lintas sesi, dan folder pengetahuan
("master brain") — semuanya otomatis, sepenuhnya mampu berjalan offline.

## Daftar Tugas Inkremental

Setiap T punya kriteria selesai (definition of done) dan bisa dikirim satu commit.

### F1 — Office Pack + Skills

| Task | Isi | Selesai jika |
|---|---|---|
| T1 | Modul `office.ts`: venv Python kedua (`dataDir/office`) berisi `openpyxl>=3.1`, `pandas>=2.2`, `formulas>=0.6`, `python-docx>=1.1`, `python-pptx>=1.0`, `matplotlib>=3.9`, `reportlab>=4.2`, `pypdf>=5`; marker `installed-<hash-paket>` | `officeInstalled()` benar; wizard bisa memasang |
| T2 | Entri manifest `office` + komponen wizard id `office` ("Paket Office") | Opsi muncul otomatis di wizard |
| T3 | Modul `skills.ts`: penulis skill terkelola (marker HYPER_AI_MANAGED, tidak pernah menimpa skill milik user): `hyper-excel` (baca/analisa/buat formula, evaluasi rantai via lib `formulas`), `hyper-report` (DOCX/PPTX/PDF, isi form PDF via pypdf), `hyper-chart` (matplotlib + Mermaid), `hyper-tax-id` (templat BAP/SPNP/LHP, alur penyidikan) | Skill tertulis only-if-office-installed; skill lama user tetap utuh |
| T4 | `bundle.ts` memanggil `applyOfficeSkills` saat startup; verifikasi typecheck + apply ke source tree | Skill terlihat `ls ~/.config/opencode/skill/` |

### F2 — Knowledge Folder (Master Brain)

| Task | Isi | Selesai jika |
|---|---|---|
| T5 | Modul `knowledge.ts`: buat `~/Hyper-Knowledge/{general/{regulasi,putusan,template},projects}` + `ingest-manifest.json` (hash path→mtime/size) | Folder ada setelah wizard/first-run |
| T6 | Ingest pipeline: file baru/berubah (.pdf/.docx/.doc/.xlsx/.md/.txt) → Docling → teks → hindsight `retain` ke bank `general` (tags `knowledge:<subfolder>`); berjalan saat app start + CLI `hyper-ai knowledge sync` | Drop 1 PMK PDF → bisa di-recall lewat MCP `mem` |
| T7 | Bank per project: `project:<slug>` otomatis saat folder project dibuat; recall dilengkapi scope bank gener+project | Sesi baru langsung ingat konteks project |
| T8 | (Opsional fase lanjut) auto-fetch JDIH DJP/PMK terbaru via webfetch, tetap ringan & manual-trigger | `knowledge fetch --source djp` |

### F3 — Memori Otomatis

| Task | Isi | Selesai jika |
|---|---|---|
| T9 | Plugin hook `session.after`/end: ringkas sesi → `retain` ke bank project (atau `default`) — tanpa intervensi agen | Sesi ditutup ringkasannya masuk bank; `mem.recall` menemukannya |
| T10 | Recall injection saat sesi mulai (konteks relevan di-inject ke prompt) | Sesi baru mengetahui keputusan sesi lalu |
| T11 | Knowledge pages & mental models hindsight dimanfaatkan: halaman "Ringkasan Project" yang rebuild sendiri | Halaman update setelah konsolidasi |

### F4 — Search & Browser

| Task | Isi | Selesai jika |
|---|---|---|
| T12 | MCP server `hyper-search` lokal (DuckDuckGo HTML via webfetch, 0 API key) + wiring ke websearch provider `mcp` | `websearch` jalan tanpa konfigurasi remote |
| T13 | Komponen opsional "Browser" (upstream `plugin-browser`) untuk situs ber-JS/login | Wizard menawarkan opsi; situs JS bisa dibaca |

### F5 — Mode Unattended (tanpa dialog "allow")

| Task | Isi | Selesai jika |
|---|---|---|
| T14 | Config default Hyper AI: `permission` allow-all (edit/bash/webfetch/websearch/mcp) sehingga agen tidak pernah meminta konfirmasi — target user gaptek ("mode anattanded") | Sesi baru: semua tool jalan tanpa prompt |
| T15 | Toggle di wizard "Mode praktis (izin penuh, tanpa konfirmasi)" vs "Mode aman (tanya dulu)"; default praktis | Nilai tersimpan & dipatuhi |
| T16 | Aksi admin-level (pasang komponen, drag ke /Applications) berjalan lewat installer app sendiri tanpa terminal | User gaptek tak pernah menyentuh terminal |

## Urutan pengerjaan

T1→T4 (F1) → T14/T15 (F5, kecil & damage-limiting) → T5/T6/T7 (F2) → T9/T10/T11 (F3) → T12/T13 (F4) → T8/T16.

## Catatan risiko

- `formulas` lib evaluasi xlsx tidak 100% paritas dengan Excel (function coverage ~90%);
  LibreOffice headless = cadangan recalc, opsional & berat (~700 MB) — jangan dimasukkan default.
- Retain ke hindsight memakai LLM lokal (tier terunduh) untuk ekstraksi fakta; batch besar
  menahan CPU — ingest perlu jeda/antrean.
- DMCA/rapat: file resmi (UU/PMK) boleh dikumpulkan lokal; auto-scrape tingkat DJP tetap opsional.
