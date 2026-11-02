# SBOM & Pinning Plan

| Zona data | regular |
|-----------|---------|
| Status task | backlog `M-05`. |
| Acuan | `docs/License-Inventory.md` (inventaris lisensi), `docs/Runbook.md` (operasi Hyper Hub). |
| Tanggal | 2026-11-01. |

## Tujuan

Menetapkan rencana SBOM dan pinning dependency beserta gate CI yang harus gagal pada lisensi atau vuln berisiko.

## Lingkup

- Sumber yang dipindai, format CycloneDX/SPDX, daftar pin, dan aturan gate.

## Di luar lingkup

- Pembuatan CI: workspace bukan repo git dan runtime pemindai belum ada.

## Jalur kegagalan

- Pemindai tidak tersedia -> gate gagal-tertutup, build dianggap belum lolos SBOM.

## Kriteria penerimaan

- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub-ContractCheck.ps1`

---

## 0. Kondisi awal — kenapa CI belum ada

| Fakta | Bukti |
|---|---|
| Bukan repo git | Tidak ada `.git` di `C:\Users\<user>\OneDrive\Documents\Default Project`; tidak ada pipeline yang bisa memicu gate |
| Tidak ada runtime utama | Tidak ada Node, Python, .NET, atau provider SQLite di mesin proyek — pemindai SBOM npm/PyPI tidak bisa dijalankan di sini |
| Kode yang dikirim mayoritas ada di `app.asar` | `D:\Hyper AI\Engine\resources\app.asar` = 235.338.243 byte; daftar dependensinya belum dibedah |
| Bundle yang bisa diaudit sudah dipin | `hyper-bundle\context7\package-lock.json` (47.950 byte) dan `viz\package-lock.json` (1.156 byte) sudah mengunci versi |

Konsekuensi: **rencana ini belum dapat dieksekusi sebagai gate otomatis.** Yang bisa dilakukan sekarang adalah pemindaian manual sekali jalan dan penetapan pin. Gate CI dijadwalkan untuk diaktifkan setelah prasyarat terpenuhi (bagian 6).

---

## 1. Cakupan pemindaian

Pindai menurut prioritas. Jangan mulai dari yang paling sulit.

| Prioritas | Target | Path | Metode | Status |
|---|---|---|---|---|
| P1 | Bundle npm terpasang | `D:\Hyper AI\Engine\resources\hyper-bundle\context7` | `npm` SBOM dari `package-lock.json` (lock v3, 99 paket unik) | siap — lock file ada |
| P1 | Bundle npm terpasang | `D:\Hyper AI\Engine\resources\hyper-bundle\viz` | sama | siap |
| P2 | Aplikasi Electron | `D:\Hyper AI\Engine\resources\app.asar` | bedah asar → hasilkan `package-lock.json` → SBOM. Tanpa ini inventaris tidak lengkap | **belum** — wajib alat pembongkar asar |
| P2 | Binary Electron/Chromium | `LICENSES.chromium.html` | pernyataan lisensi bawaan Electron; ekstrak nama paket + lisensi | siap (berkas ada) |
| P3 | Python Office | manifest `bin\knowledge.mjs` → `office.packages` (13 paket, batas `>=`) | `pip`/`uv` freeze di lingkungan Python pengguna (`*.dist-info`) | **belum** — butuh Python 3.12 |
| P3 | Docling, hindsight-api | manifest `knowledge.mjs` | sama | **belum** |
| P3 | `uv` 0.9.0 | manifest `knowledge.mjs` | SBOM biner dari rilis upstream | **belum** |
| P4 | Bobot model | `Spark-X2.5-4B-Q4_K_M.gguf` (2.600.224.352 byte) | bukan paket perangkat lunak; catat sebagai komponen dengan lisensi terpisah | `perlu verifikasi` |
| P4 | Kandidat terpisah | SpecWave, Graphify, Graphiti, WAHA, Composio, Playwright, Windows-MCP, LiveKit, Pipecat, MeshCentral | SBOM hanya bila diadopsi | sesudah adopsi |

Di luar cakupan: `opencode-cli.exe` (biner tunggal, 246.754.304 byte) — tidak ada metadata paket; hanya bisa dicatat sebagai satu komponen dengan versi `2.1.10` dari `opencode-cli.version`.

---

## 2. Format

**Utama: CycloneDX JSON** (spesifikasi 1.6).

Alasan: didukung tooling npm/pip/uv secara langsung, dipahami SBOM konsumen, dan memuat field `licenses` per komponen serta `vulnerabilities` bila dipakai bersama hasil pemindaian kerentanan. SPDX juga memadai, tetapi pemetaan `licenseExpression` ke ID SPDX lebih ketat dan lebih sering gagal pada paket yang metadatanya tidak rapi — dan inventaris ini sudah punya contoh metadata tidak rapi (Composio, PyPI `graphifyy` dengan field `license` kosong).

**Pendamping: SPDX 2.3** hanya jika ada peminta eksternal (audit, klien, pengadaan). Jangan memelihara dua format penuh; turunkan SPDX dari CycloneDX bila diminta.

Field wajib per komponen:

```
bom-ref, type, name, version, purl, licenses[].expression, supplier, hashes[SHA-256]
```

Aturan pengisian:
- `version` wajib eksak. Batas `>=` dari `knowledge.mjs` **tidak** valid sebagai versi SBOM — ganti dengan versi yang benar-benar terpasang.
- `licenses` yang belum diketahui wajib ditulis `NOASSERTION` beserta `properties[].name = "hyper:inventory-status"`, `value = "needs-verification"`. Jangan dikosongkan dan jangan dikira-kira.
- Komponen tanpa `purl` (mis. `elevate.exe`, model GGUF) memakai `bom-ref` lokal dan `externalReferences`.

---

## 3. Gate CI

Gate aktif setelah ada repo git + runner dengan Node/Python (bagian 6). Sampai itu, semua gate di bawah berjalan sebagai **pemeriksaan manual** yang hasilnya dilampirkan, bukan sebagai penghalang otomatis.

| Gate | Aturan | Kode keluar gagal |
|---|---|---|
| G1 — Lisensi terlarang | Gagal bila SBOM memuat lisensi `AGPL-3.0-only`, `AGPL-3.0-or-later`, atau `AGPL-*` **kecuali** `bom-ref` tercantum di daftar persetujuan `docs/sbom/agpl-allowlist.json` dengan alasan + penanggung jawab + tanggal | 10 |
| G2 — Lisensi tak diketahui | Gagal bila ada komponen `NOASSERTION` yang **tidak** bertanda `needs-verification`; dan gagal (peringatan keras) bila jumlah `needs-verification` bertambah dibanding baseline | 11 |
| G3 — Kerentanan kritis | Gagal bila ada kerentanan `CRITICAL` pada komponen yang benar-benar dikirim ke pengguna (bukan dev-dependency). `HIGH` = peringatan, tidak memblokir | 12 |
| G4 — Drift pin | Gagal bila ada paket terpasang yang tidak ada di `package-lock.json` / `uv.lock` / `requirements.txt` terpin, atau hash-nya beda | 13 |
| G5 — Notice | Gagal bila `wizard\LICENSES.md` tidak mencakup setiap komponen dengan lisensi yang mewajibkan notice (MIT/Apache-2.0/BSD/LGPL/EUPL) | 14 |
| G6 — SBOM usang | Gagal bila SBOM lebih tua dari commit terakhir yang mengubah lock file | 15 |

AGPL di sini bukan larangan absolut — hanya larangan **tanpa persetujuan tertulis**. RustDesk dan Skyvern (keduanya terverifikasi AGPL-3.0) tetap berstatus "jangan di-bundle" di inventaris.

Alat yang dipakai (stabil, tidak mengunci diri ke satu vendor):

```
npm   -> cyclonedx-npm  (menghasilkan CycloneDX dari package-lock.json)
pip   -> cyclonedx-python-lib / cyclonedx-py
uv    -> cyclonedx-py environment  (atau konversi dari uv.lock)
vuln  -> osv-scanner (memakan SBOM CycloneDX; sumber OSV, tanpa lisensi berbayar)
```

Versi alat-alat di atas **`perlu verifikasi`** — belum dicek dari registry. Pin ketiganya saat gate diaktifkan.

---

## 4. Pin wajib

Aturan: tidak ada rentang (`^`, `~`, `>=`) pada apa pun yang dikirim ke pengguna. Rentang hanya boleh ada di dev-dependency.

### 4.1 npm — sudah terpin sebagian

| Berkas | Status | Isi |
|---|---|---|
| `hyper-bundle\context7\package-lock.json` | **ada**, 47.950 byte | mengunci `@upstash/context7-mcp@4.4.2` + 99 paket transitif |
| `hyper-bundle\viz\package-lock.json` | **ada**, 1.156 byte | mengunci `echarts@6.1.0`, `zrender@6.1.0` |
| `hyper-bundle\context7\package.json` | **belum pin** | masih `"^4.4.2"` — ubah ke `"4.4.2"` saat lock dipakai ulang |
| `hyper-bundle\viz\package.json` | **belum pin** | masih `"^6.1.0"` — ubah ke `"6.1.0"` |
| Instalasi wajib flag | — | `npm ci` (bukan `npm install`) supaya lock dihormati |

Yang belum punya lock sama sekali: `search\mcp.mjs` (tanpa dependensi terdaftar — `perlu verifikasi`), `app.asar` (P2, belum dibongkar).

### 4.2 Python — belum ada lock

`knowledge.mjs` mendefinisikan 13 paket Office dengan batas `>=` dan **tanpa** `requirements.txt` atau `uv.lock`. Ini pin paling mendesak karena:

1. Tidak ada versi eksak → SBOM tidak bisa dibangun.
2. Instalasi ulang di mesin lain bisa menarik versi berbeda → lisensi bisa berubah (mis. `formulas`, `docxtpl` yang kemungkinan copyleft lemah).

Target pin (versi eksak diisi dari `dist-info` lingkungan terpasang, bukan ditebak):

```
openpyxl, pandas, formulas, python-docx, python-pptx, matplotlib,
reportlab, pypdf, duckdb, networkx, docxtpl, plotly, kaleido
```

Syarat tambahan: `requirements.txt` harus menyertakan hash (`pip install --require-hashes`) atau `uv.lock` untuk Python 3.12.

### 4.3 uv

| Item | Terpasang | Upstream terbaru (2026-11-01) | Tindakan |
|---|---|---|---|
| `uv` | **0.9.0** | **0.13.6** | `uv` dipakai sebagai installer, bukan runtime. Pin versi installer di skrip setup (bukan mengikuti `latest`), dan putuskan apakah mengikuti 0.13.6 atau tetap 0.9.0. **Jangan** pakai `pip install uv` tanpa versi. |

### 4.4 Runtime yang menentukan pin

| Kandidat | Syarat runtime | Status mesin proyek |
|---|---|---|
| SpecWave `spec-wave@3.5.0` | Node `^22.19.0 \|\| >=24.0.0` (dari npm `engines`) | **tidak ada** |
| Graphify `graphifyy@0.9.99` | Python `>=3.10` | **tidak ada** |
| Graphiti `graphiti-core@0.31.2` | Python + Neo4j/FalkorDB | **tidak ada** |

Pin versi runtime yang dipilih (contoh Node 24.x LTS, Python 3.12) di `engines`/`.python-version` saat adopsi. Tanpa pin runtime, semua pin paket di atas tidak reproducible.

---

## 5. Baseline & penyimpanan SBOM

- SBOM disimpan di `docs/sbom/` dengan nama berisi tanggal: `hyper-bundle-YYYY-MMDD.cdx.json`.
- Setiap SBOM wajib menyertakan hash SHA-256 berkasnya di `docs/sbom/SHA256SUMS.txt`.
- `docs/sbom/agpl-allowlist.json` dibuat hanya bila ada persetujuan tertulis. Jika berkas tidak ada, gate G1 menolak seluruh AGPL.
- SBOM tidak boleh memuat: isi berkas perkara, path berisi nama pengguna, token/API key, atau isi `service.json`.

---

## 6. Prasyarat sebelum gate CI bisa diaktifkan

1. `git init` pada root proyek dan tetapkan branch perlindungan untuk perubahan `package-lock.json`/`requirements.txt`.
2. Pasang Node **dan** Python di runner (image terpisah lebih baik — satu untuk npm, satu untuk pip/uv).
3. Bongkar `app.asar` → hasilkan lock file → masukkan ke cakupan P2. Tanpa ini, G5 akan lolos padahal notice belum lengkap.
4. Sediakan `docs/sbom/baseline.cdx.json` sebagai pembanding G2.
5. Putuskan kebijakan G3: apakah `HIGH` juga memblokir untuk zona `case`.

Sampai lima butir ini selesai, **gate CI tidak dibuat**. Yang berlaku sekarang: pemindaian manual P1 (dua lock file npm yang sudah ada) dan penetapan pin bagian 4.1 + 4.2.

## Gate manusia

| human_gate_id | status | blocks_hats | keterangan |
|---------------|--------|-------------|------------|
| HG-AUDIT-R1 | pending | 30 | Review owner sebelum dipakai sebagai dasar implementasi |
