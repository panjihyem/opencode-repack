# Hyper AI — Roadmap Office & Investigasi Pajak (Plan v1)

Tanggal: 2026-10-18 · Status baseline: v2.0.32 + tier model + Docling + hindsight + wordmark (commit 832498d)
Referensi memori: hindsight bank `hyper-plan` (document_id `roadmap-v1`).

## Tujuan

Hyper AI siap dipakai penyidik pajak & pekerjaan kantor harian tanpa konfigurasi:
baca/buat dokumen & Excel, riset online, memori lintas sesi, dan folder pengetahuan
("master brain") — semuanya otomatis, sepenuhnya mampu berjalan offline.

## Daftar Tugas Inkremental

Setiap T punya kriteria selesai (definition of done) dan bisa dikirim satu commit.

### F0 — Installer Tunggal (zero-click)

| Task | Isi | Selesai jika |
|---|---|---|
| T0 | Wizard auto-pilot: peluncuran pertama memasang SEMUA komponen tanpa satu klik pun (checkbox "Mode praktis" ikut on default), jendela menutup sendiri saat selesai; `--hyper-setup` tetap tersedia sebagai jalur pulih manual | 1 DMG/EXE → app terbuka → semua terpasang → AI siap pakai |

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

## Progres (2026-10-19)

| Fase | Status | Bukti/komit |
|---|---|---|
| F0 T0 | ✅ | `aaa48be` — wizard auto-pilot; app prod ter-install & diverifikasi |
| F1 T1–T4 | ✅ | `bcc0367` — office.ts, skills.ts (4 skill), komponen wizard office |
| F5 T14/T15 | ✅ | `394448e` — applyUnattended on/off idempotent + toggle wizard |
| F2 T5–T7 | ✅ | `39c667a` — knowledge.ts: `~/Hyper-Knowledge`, sync tiap app-start, ingest langsung via hindsight `files/retain` (Docling tak dibutuhkan utk ingest), bank `general` + `project:<slug>`, idempoten via manifest; uji live: PMK & file project masuk bank, recall keluar fakta + tag `knowledge:regulasi` / `project:audit-2025` |
| F3 T9/T10 | ✅ | `b629655` — plugin `hyper-memory` (managed): prompt user → bank `sessions` async; recall injection ke system prompt (max 8 fakta, cache per prompt); compaction menyimpan ekor transkrip. Uji live: plugin hot-reload oleh server berjalan, retain terekstraksi |
| F3 T11 | ✅ | `syncKnowledge` rebuild `projects/<slug>/Ringkasan-Project.md` dari daftar berkas berhasil-ingest + recall bank `project:<slug>`; hasil recall ditandai draf/perlu verifikasi. Berkas tanpa marker `HYPER_AI_MANAGED` tidak ditimpa; summary tidak di-ingest kembali. Self-check assert lulus |
| F4 T12 | ✅ | `3c81805` — MCP `hyper-search` (search/mcp.mjs): rantai DDG → Bing (redirect dibalik + filter anti-bot: 1 domain/ tanpa irisan kata query) → Wikipedia; tak butuh API key; terdaftar sebagai MCP lokal via Electron-as-node |
| F4 T13 | ✅(≈) | Browser = plugin internal upstream (`plugin-browser`, selalu aktif — sesi Hyper AI otomatis punya 45 tool browser); verifikasi penuh menunggu app final |
| T8 | ✅* | `hyper fetch --source kemenkeu|djp [--limit N]` membaca JSON Feed resmi `https://jdih.kemenkeu.go.id/feed.json`, filter metadata regulasi pajak, tulis katalog bertaut sumber ke `~/Hyper-Knowledge/general/regulasi/`; uji live 5 entri lulus. Katalog bukan naskah resmi; pengguna buka sumber untuk verifikasi/unduh lalu `hyper sync`. `djp` alias: belum ditemukan feed terpisah resmi DJP |
| T16 | ✅(≈) | Copy wizard dilokalkan/dirapikan; instalasi komponen melalui app, tanpa terminal. Aturan izin user tetap tak disentuh; teks kini menyebutnya eksplisit. Operasi tetap user-level (tak meminta privilese admin) |

Catatan jaringan mesin dev: DDG diblokir TLS oleh jaringan lokal & Bing kadang
menyetuh mode anti-bot (hasil canned) — filter memindahkan ke Wikipedia; di
jaringan normal seluruh sumber berfungsi.

## Progres lokal (19-10-2026, lapisan pekerjaan diaktifkan)

| Task | Status | Bukti |
|---|---|---|
| CI release v2.0.32 (3c81805 = F2+F3+F4) | ✅ | run `39161430831` success, 30 aset semua platform |
| T17a install komponen lokal (uv → office venv) | ✅ | marker `installed-9a942aef` di `hyper-bundle/office`; 4 skill `hyper-excel/report/chart/tax-id` tampil di sesi live |
| T17b office e2e smoke | ✅ | XLSX (formula+native chart+table+CF), evaluasi `formulas` E2=440 jt, DOCX (heading+tabel), PPTX chart native, PDF reportlab→pypdf, Pandas baca ulang — SEMUA OK di venv nyata |
| T17c CLI `hyper` | ✅ | `9026617` — `hyper sync/banks/recall`; symlink `~/.local/bin/hyper` via `ensureHyperCli` |
| T18 renderer `--hyper-viz` | ✅ | `hyper viz <job.json>` — ECharts 6.1.0 (manifest `viz` + prepare-bundle) → SVG+PNG via Electron offscreen. Render **di luar kunci single-instance** (patch `index.ts`): jalan walau app terbuka. Uji nyata: Sankey 1600×900 SVG + PNG Hi-DPI 3200×1800, exit 0 |
| T19 `forensic.py` + skill `hyper-fundflow` | ✅ | `forensic.ts` = konstanta `FORENSIC_SOURCE` (11,4 KB; regex nominal `[^\\d.\\-]` di TS → `[^\d.\-]` di Python) ditulis `writeForensicModule` → `office/lib/forensic.py`; manifest office 13 paket (duckdb, networkx, docxtpl, plotly, kaleido). **Sankey = DAG-only** (`_dag_only` memotong ujung penutup siklus + subtext eksplisit; siklus tetap di cycles.json/sheet Siklus) — ECharts menolak siklus. E2E: CSV 12 trx → 4 siklus → 9 aliran (3 ujung dibuang) → `hyper viz` exit 0 (SVG) → workbook 4 sheet; angka konsisten 974.000.000 = 727.000.000 + 247.000.000. Skill `hyper-fundflow` tertulis (5/5 written, placeholder `__FORENSIC_PY__` 0 sisa) |
| T20 templat `docxtpl` + exhibit | ✅ | `forensic.py docgen --kind bap|lhp` buat draf DOCX berisi statistik DB, isian `--set`/JSON `--context`; BAP tabel 3 kolom × 4 baris; `exhibit` daftar 4 artefak + item tambahan. E2E DOCX dibuka `python-docx`; angka LHP = workbook (12 transaksi, 10 rekening distinct, 4 siklus, Rp974.000.000). `[ISI]` tetap perlu verifikasi penyidik |
| T21 visual QA + demo end-to-end | ✅ | Demo `/tmp/fe2e`: CSV → DuckDB → workbook (4 sheet) + BAP/LHP/exhibit DOCX + cycles.json + Sankey. Sankey 9 edge DAG; 3 ujung siklus/total Rp247.000.000 dicatat subtext, sisa Rp727.000.000 (total DB Rp974.000.000); assert DAG + workbook totals lulus. `hyper viz` exit 0; `aliran-dana.svg` valid 1600×900 dan dibuka di preview. Renderer ini hasilkan SVG saja (PNG tidak ada) |

## Catatan risiko

- `formulas` lib evaluasi xlsx tidak 100% paritas dengan Excel (function coverage ~90%);
  LibreOffice headless = cadangan recalc, opsional & berat (~700 MB) — jangan dimasukkan default.
- Retain ke hindsight memakai LLM lokal (tier terunduh) untuk ekstraksi fakta; batch besar
  menahan CPU — ingest perlu jeda/antrean.
- DMCA/rapat: file resmi (UU/PMK) boleh dikumpulkan lokal; auto-scrape tingkat DJP tetap opsional.
