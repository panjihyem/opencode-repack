# License Inventory — Hyper AI / Hyper Hub

| Zona data | regular |
|-----------|---------|
| Status task | backlog `A-04` |
| Tanggal verifikasi | 2026-11-01 |
| Lingkungan | Windows 10/11, PowerShell 5.1, tanpa Node/Python/.NET/SQLite provider di mesin proyek |

## Tujuan

Mendata lisensi komponen yang sudah ada dan kandidat, memisahkan fakta terverifikasi dari yang masih `perlu verifikasi`.

## Lingkup

- Komponen `hyper-bundle`, Electron, model, dan kandidat pihak ketiga beserta risiko lisensi dan aksi.

## Di luar lingkup

- Persetujuan legal, pembongkaran `app.asar`, dan bundling paket baru.

## Jalur kegagalan

- Lisensi tidak terverifikasi -> status `perlu verifikasi`, tidak dipakai sebagai dasar bundling.

## Kriteria penerimaan

- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub-ContractCheck.ps1`

## Cara membaca dokumen ini

- **Terverifikasi lokal** = dibaca dari berkas di mesin ini (`package.json`, `knowledge.mjs`, `LICENSES.md`, `LICENSES.chromium.html`). Bukan tebakan.
- **Terverifikasi daring** = dibaca dari registry resmi (npm/PyPI) atau GitHub license API pada tanggal di atas.
- **`perlu verifikasi`** = belum dikonfirmasi dari sumber primer. Jangan dipakai sebagai dasar keputusan bundling.
- Kolom **Cara pakai**: `bundle` (disalin ke instalasi), `proses terpisah` (dijalankan mandiri), `link` (dependensi saat build), `tidak dipakai` (kandidat ditolak).

Metode verifikasi lokal yang dipakai:

```powershell
# lisensi semua paket npm yang benar-benar terpasang di bundle
Get-ChildItem "D:\Hyper AI\Engine\resources\hyper-bundle" -Recurse -Filter package.json |
  ForEach-Object { try { $j = Get-Content $_.FullName -Raw | ConvertFrom-Json } catch {}; if ($j.name) { "$($j.name)|$($j.version)|$($j.license)" } } |
  Sort-Object -Unique
```

---

## Bagian 1 — Komponen yang SUDAH ADA di mesin ini

### 1.1 Hyper AI desktop (`D:\Hyper AI\Engine`)

| Nama | Versi | Lisensi | Sumber | Cara pakai | Risiko lisensi | Aksi |
|---|---|---|---|---|---|---|
| Hyper AI desktop (Electron app) | tidak dicatat di manifest lokal | **`perlu verifikasi`** (lisensi repack sendiri) | `Engine\resources` | bundle | Aplikasi ini adalah repack OpenCode (lihat `wizard\LICENSES.md` baris "Hyper AI adalah repack dari OpenCode"). Status lisensi keseluruhan aplikasi = ? | perlu legal review |
| Electron | `perlu verifikasi` (versi tidak dicatat) | MIT (Electron), BSD-3-Clause (Chromium) | `Engine\resources\LICENSES.chromium.html` ada | bundle | MIT + BSD-3: wajib sertakan notice. `LICENSES.chromium.html` sudah disertakan = patuh | OK |
| Chromium (di dalam Electron) | `perlu verifikasi` | BSD-3-Clause | `LICENSES.chromium.html` | bundle | Sama seperti Electron. Berkas notice sudah ada | OK (pertahankan berkas notice saat distribusi ulang) |
| OpenCode CLI | **2.1.10** | MIT | `Engine\resources\opencode-cli.version` = `2.1.10`; teks MIT di `hyper-bundle\wizard\LICENSES.md` | bundle (`opencode-cli.exe`) | MIT: wajib simpan copyright notice saat redistribusi | OK |
| Node.js (runtime internal Electron) | `perlu verifikasi` | MIT | disebut di `wizard\LICENSES.md` | bundle | MIT | OK |
| Code signing / elevate helper | `perlu verifikasi` | `perlu verifikasi` | `Engine\resources\elevate.exe` (107520 byte) | bundle | Binary pihak ketiga tanpa notice yang ditemukan | perlu legal review |

Catatan: `app.asar` (235 MB) dan `opencode-cli.exe` (246 MB) adalah bundel gabungan. Daftar dependensi di dalam `app.asar` **belum** dibedah — `perlu verifikasi`. Ini celah terbesar dalam inventaris: mayoritas kode yang dikirim ke pengguna ada di dalam asar, bukan di `hyper-bundle`.

### 1.2 `hyper-bundle` — manifest (dibaca dari `bin\knowledge.mjs`)

| Nama | Versi | Lisensi | Sumber fakta | Cara pakai | Risiko lisensi | Aksi |
|---|---|---|---|---|---|---|
| `@upstash/context7-mcp` | **4.4.2** | MIT | `knowledge.mjs` + `node_modules\@upstash\context7-mcp\package.json` | bundle (MCP server lokal) | MIT. Panggilan keluar ke API Context7 saat dipakai = risiko data, bukan lisensi | OK (kebijakan egress terpisah) |
| Apache ECharts | **6.1.0** | Apache-2.0 | `knowledge.mjs` + `viz\node_modules\echarts\package.json`; `LICENSE` + `NOTICE` ada di folder paket | bundle | Apache-2.0: wajib bawa `LICENSE` dan `NOTICE` serta atribusi perubahan. `NOTICE` sudah ada = patuh | OK (jangan hapus `NOTICE`) |
| `zrender` (dependensi ECharts) | **6.1.0** | BSD-3-Clause | terpasang di `viz\node_modules` | bundle | BSD-3: wajib notice | OK |
| `hindsight-api` | **1.0.0** | **`perlu verifikasi`** | `knowledge.mjs` (python 3.12, port 8888). Teks lisensi tidak ditemukan di `hyper-bundle` | proses terpisah (diunduh dari PyPI saat setup) | `wizard\LICENSES.md` menulis "lisensi paket" tanpa menyebut nama — belum memenuhi kewajiban notice | perlu legal review |
| Docling | **2.140.0** | MIT | `knowledge.mjs`; juga disebut MIT di `wizard\LICENSES.md` | proses terpisah (python 3.12) | MIT | OK |
| `uv` | **0.9.0** | **`perlu verifikasi`** (biasanya MIT/Apache-2.0 — belum dicek untuk versi ini) | `knowledge.mjs` (`uv.version`) | proses terpisah (installer Python) | MIT/Apache-2.0 tidak menular; risiko rendah | perlu verifikasi |
| LM Studio | **0.4.25-1** | **`perlu verifikasi`** (lisensi penerbit, proprietary; tidak dimodifikasi) | `knowledge.mjs` (`lmstudio.version`) | proses terpisah (runtime inferensi lokal) | Proprietary. Tidak boleh di-bundle tanpa izin penerbit | jangan di-bundle (unduh terpisah oleh pengguna) |
| Model `spark-x2.5-4b` | `Spark-X2.5-4B-Q4_K_M.gguf`, 2.600.224.352 byte | **`perlu verifikasi`** | `knowledge.mjs` → `models[0]` (publisher `XHToken`, repo `Spark-X2.5-4B-GGUF`) | proses terpisah (diunduh ke LM Studio) | Lisensi bobot GGUF tidak tercatat di manifest. Publisher `XHToken` = nama yang tidak umum; **wajib** baca kartu model sebelum distribusi | perlu verifikasi — jangan di-bundle |
| Teks lisensi MIT OpenCode | — | MIT | `wizard\LICENSES.md` | bundle | Mencakup OpenCode, Electron, Node, Context7 | OK |
| `wizard\APACHE-2.0.txt` | — | Apache-2.0 | 11558 byte | bundle | Untuk ECharts dan paket Apache-2.0 lain | OK |
| `wizard\BSD-3-CLAUSE.txt` | — | BSD-3-Clause | 1580 byte | bundle | Untuk Chromium/zrender/qs | OK |
| Paket MCP `search` (`search\mcp.mjs`) | — | **`perlu verifikasi`** (kode milik repack, 10316 byte, tanpa header lisensi) | `hyper-bundle\search` | bundle | Kode internal tanpa notice eksplisit | perlu legal review (tambahkan header) |

Catatan penting: `LICENSES.md` versi 2026-10-24 menyebut paket Office "lisensi paket masing-masing" dan tidak mendaftar `hindsight-api` maupun `uv`. Dokumen notice **belum lengkap** untuk distribusi ulang.

### 1.3 Paket Python Office (manifest `knowledge.mjs`, `python: 3.12`)

Manifest mencantumkan batas versi minimum (`>=`), bukan pin. Lisensi per paket adalah pengetahuan umum yang **belum diverifikasi untuk versi yang benar-benar terpasang** — semua baris di bawah bertanda `perlu verifikasi` sampai dibaca dari `*.dist-info\LICENSE*` di lingkungan Python pengguna.

| Paket | Batas versi di manifest | Lisensi | Cara pakai | Risiko | Aksi |
|---|---|---|---|---|---|
| `openpyxl` | `>=3.1` | `perlu verifikasi` (umumnya MIT) | proses terpisah | rendah | perlu verifikasi |
| `pandas` | `>=2.2` | `perlu verifikasi` (umumnya BSD-3) | proses terpisah | rendah | perlu verifikasi |
| `formulas` | `>=0.6` | `perlu verifikasi` (umumnya EUPL-1.1 — copyleft lemah) | proses terpisah | **EUPL adalah copyleft**; jika benar, distribusi biner wajib menyertakan source | perlu legal review sebelum pin |
| `python-docx` | `>=1.1` | `perlu verifikasi` (umumnya MIT) | proses terpisah | rendah | perlu verifikasi |
| `python-pptx` | `>=1.0` | `perlu verifikasi` (umumnya MIT) | proses terpisah | rendah | perlu verifikasi |
| `matplotlib` | `>=3.9` | `perlu verifikasi` (umumnya PSF-based, tidak menular) | proses terpisah | rendah | perlu verifikasi |
| `reportlab` | `>=4.2` | `perlu verifikasi` (umumnya BSD) | proses terpisah | rendah | perlu verifikasi |
| `pypdf` | `>=5` | `perlu verifikasi` (umumnya BSD-3) | proses terpisah | rendah | perlu verifikasi |
| `duckdb` | `>=1.1` | `perlu verifikasi` (umumnya MIT) | proses terpisah | rendah | perlu verifikasi |
| `networkx` | `>=3.4` | `perlu verifikasi` (umumnya BSD-3) | proses terpisah | rendah | perlu verifikasi |
| `docxtpl` | `>=0.19` | `perlu verifikasi` (umumnya LGPL-2.1 — copyleft lemah) | proses terpisah | **LGPL**: OK jika tetap pustaka terpisah, bermasalah jika dimodifikasi tanpa rilis source | perlu legal review |
| `plotly` | `>=5.24` | `perlu verifikasi` (umumnya MIT) | proses terpisah | rendah | perlu verifikasi |
| `kaleido` | `>=0.2` | `perlu verifikasi` (umumnya MIT) | proses terpisah | rendah | perlu verifikasi |

Dua item di atas (`formulas`, `docxtpl`) ditandai karena lisensi umumnya copyleft lemah — **bukan** karena sudah dipastikan. Cek dengan:

```powershell
# jalankan di lingkungan Python Hyper AI, bukan di repo proyek
Get-ChildItem -Path <site-packages> -Directory -Filter "*.dist-info" |
  ForEach-Object { "$($_.Name)"; Get-ChildItem $_.FullName -Filter "LICENSE*" | Select-Object -ExpandProperty Name }
```

### 1.4 Dependensi npm terpasang yang dapat diaudit (dari `hyper-bundle`)

Semua paket yang tercantum di bawah terbaca langsung dari `package.json` terpasang (99 paket unik). Semuanya permissive — tidak ada copyleft di pohon ini.

| Lisensi | Jumlah paket | Paket menonjol (nama@versi) |
|---|---|---|
| MIT | mayoritas | `@upstash/context7-mcp@4.4.2`, `express@5.3.0`, `hono@4.13.13`, `commander@13.1.0`, `undici@7.30.1`, `zod@4.6.7`, `jose@6.2.13`, `debug@4.4.3`, `mime-types@3.0.2`, `@modelcontextprotocol/server@2.2.0`, `@modelcontextprotocol/core@2.2.0`, `@hono/node-server@1.19.17` |
| Apache-2.0 | 12 | `echarts@6.1.0`, `@opentelemetry/*`, `import-in-the-middle@3.5.2` |
| BSD-3-Clause | 2 | `zrender@6.1.0`, `qs@6.16.1` |
| ISC | 4 | `inherits@2.0.4`, `once@1.4.0`, `setprototypeof@1.2.0`, `wrappy@1.0.2` |
| 0BSD | 1 | `tslib@2.3.0` |

Temuan: `@types/*` (7 paket: `@types/node@26.6.5`, `@types/express@5.0.6`, dst.) ikut terpasang di bundle produksi. Semua MIT, jadi bukan risiko lisensi — tapi ini indikasi dependensi dev ikut terkirim. Cukup catat, tidak perlu blok.

Atribusi yang diwajibkan dan **sudah** tersedia di disk: `APACHE-2.0.txt`, `BSD-3-CLAUSE.txt`, teks MIT. Untuk ECharts, `NOTICE` ada di `viz\node_modules\echarts\NOTICE` dan harus ikut saat distribusi ulang.

---

## Bagian 2 — Kandidat (belum ada di mesin ini)

| Nama | Versi | Lisensi | Status verifikasi | Cara pakai | Risiko lisensi | Aksi |
|---|---|---|---|---|---|---|
| **SpecWave** | npm `spec-wave` **3.5.0** | MIT | Terverifikasi daring (npm registry: `license=MIT`, `engines: {node: "^22.19.0 || >=24.0.0"}`, repo `github.com/Cyning12/SpecWave`) | link (dev tool) / proses terpisah | MIT, rendah. Yang mengikat adalah `engines`: butuh Node **^22.19.0 atau >=24.0.0** — mesin proyek belum punya Node | OK dari sisi lisensi; **blocker runtime**, bukan lisensi |
| **Graphify** | PyPI `graphifyy` **0.9.99** | Apache-2.0 | Terverifikasi daring (PyPI `license_expression=Apache-2.0`, `requires_python=>=3.10`; repo `Graphify-Labs/graphify` GitHub API `spdx_id=Apache-2.0`) | proses terpisah (CLI/aplikasi) | Apache-2.0: wajib `NOTICE`. Catatan: field `license` PyPI kosong, hanya `license_expression` — tetap katakan Apache-2.0, tapi simpan bukti dari repo | OK dengan kewajiban `NOTICE`; jangan di-bundle sebelum runtime Python tersedia |
| **Graphiti** | PyPI `graphiti-core` **0.31.2** | Apache-2.0 | Terverifikasi daring (PyPI `license_expression=Apache-2.0`; repo `getzep/graphiti` `spdx_id=Apache-2.0`) | proses terpisah | Apache-2.0. Risiko operasional: butuh Neo4j atau FalkorDB sebagai layanan terpisah | perlu legal review untuk dependensi grafik (Neo4j: **GPLv3 Community / komersial**) — lihat temuan #4 |
| **WAHA** | PyPI `waha` 1.0.5 (tidak jelas ini paket yang dimaksud); image Docker `devlikeapro/waha` | **Apache-2.0** (repo, branch `core`); model Plus komersial **berubah** | Terverifikasi daring (GitHub license API `spdx_id=Apache-2.0`; README repo: "Looking for **WAHA Plus**? It's now part of the main `devlikeapro/waha` image — all Plus features are included") | proses terpisah (Docker) | **Kontradiksi**: kode berlisensi Apache-2.0 tetapi fitur Plus kini dibundel ke image yang sama. Syarat komersial Plus tidak terbaca dari repo. Risiko: memakai fitur "Plus" tanpa lisensi komersial | **perlu legal review** — kontrak WAHA harus dibaca langsung dari penerbit. Jangan klaim "Apache-2.0, aman" |
| **Composio** | PyPI `composio` 0.30.0; npm `@composio/core` 0.27.0 | Tidak konsisten: PyPI memberi classifier Apache, npm `ISC`, repo `MIT` | Terverifikasi daring, **hasil bertentangan** | proses terpisah (SaaS hosted) | Tiga sumber menyebut tiga lisensi berbeda. Yang berjalan adalah layanan hosted → yang mengikat adalah ToS, bukan lisensi kode | **`perlu verifikasi`** — jangan pakai sebagai dasar distribusi. Model hosted menambah risiko data |
| **Playwright** | npm `playwright` **1.64.1** | Apache-2.0 | Terverifikasi daring (npm + GitHub `spdx_id=Apache-2.0`) | link (dev tool) / proses terpisah | Apache-2.0. Browser yang diunduh (Chromium/Firefox/WebKit) punya lisensi sendiri: **`perlu verifikasi`** | OK untuk test internal; jangan di-bundle ke instalasi pengguna |
| **Windows-MCP** | tidak dicatat | MIT | Terverifikasi daring (repo `CursorTouch/Windows-MCP` `spdx_id=MIT`) | proses terpisah | MIT. Versi rilis belum dicatat → `perlu verifikasi` untuk `pin` | OK; wajib pin versi sebelum dipakai |
| **LiveKit** | PyPI `livekit` 1.2.0, `livekit-agents` 1.8.10 | Apache-2.0 | Terverifikasi daring (PyPI `license_expression=Apache-2.0`) | proses terpisah (server media) | Apache-2.0. LiveKit Cloud = layanan berbayar, bukan lisensi | OK |
| **Pipecat** | PyPI `pipecat-ai` **1.15.0** | BSD-2-Clause | Terverifikasi daring (PyPI `license_expression=BSD-2-Clause`) | proses terpisah | BSD-2: notice minimal. Catatan: task menyebut grup LiveKit/Pipecat — lisensinya **berbeda**, jangan disamakan | OK |
| **MeshCentral** | npm `meshcentral` **1.3.1** | Apache-2.0 | Terverifikasi daring (npm; GitHub `spdx_id=Apache-2.0`) | proses terpisah (server remote management) | Apache-2.0. Risiko bukan lisensi tapi operasional: alat kontrol jarak jauh = permukaan serangan | OK dari lisensi; **wajib** review keamanan sebelum dipakai |
| **RustDesk** | tidak dicatat | **AGPL-3.0** | Terverifikasi daring (repo `rustdesk/rustdesk` `spdx_id=AGPL-3.0`) | proses terpisah saja | AGPL: memicu kewajiban source bila pengguna berinteraksi lewat jaringan dengan versi modifikasi | **jangan di-bundle** |
| **Skyvern** | PyPI `skyvern` 1.0.56 | **AGPL-3.0** | Terverifikasi daring (repo `Skyvern-AI/skyvern` `spdx_id=AGPL-3.0`) | proses terpisah saja | AGPL — sama seperti RustDesk | **jangan di-bundle** |
| **Baileys** (WhatsApp Web lib) | npm `@whiskeysockets/baileys` **7.0.0-rc14** | MIT | Terverifikasi daring (npm) | link | MIT, tapi **versi masih `rc`** = tidak stabil | perlu verifikasi stabilitas; bukan risiko lisensi |
| **uv** (jika dipin sebagai tool) | terpasang **0.9.0**, upstream terbaru **0.13.6** | `perlu verifikasi` | — | proses terpisah | Lihat 1.2 | perlu verifikasi |
| **Neo4j Community** (dependensi Graphiti) | tidak dicatat | **`perlu verifikasi`** (GPLv3 Community / komersial — belum dicek) | — | proses terpisah | GPLv3 pada layanan terpisah biasanya aman (proses terpisah, bukan link), tapi harus dikonfirmasi | perlu legal review |

---

## Bagian 3 — Ringkasan keputusan

**Jangan di-bundle:** RustDesk (AGPL-3.0), Skyvern (AGPL-3.0), LM Studio (proprietary), model `spark-x2.5-4b` (lisensi bobot belum diketahui).

**Perlu legal review:** `hindsight-api` (lisensi tidak tercatat di notice), `elevate.exe`, `search\mcp.mjs`, `formulas` (kemungkinan EUPL), `docxtpl` (kemungkinan LGPL), WAHA (kontradiksi Apache vs Plus komersial), Neo4j.

**`perlu verifikasi`:** versi Electron/Chromium/Node, isi `app.asar`, lisensi `uv`, lisensi bobot `spark-x2.5-4b`, semua 13 paket Python Office, lisensi browser Playwright, versi Windows-MCP, lisensi Neo4j Community, Composio (tiga lisensi bertentangan).

**Blocker yang bukan lisensi:** SpecWave mensyaratkan Node `^22.19.0 || >=24.0.0`; Graphify dan Graphiti mensyaratkan Python `>=3.10`. Mesin proyek belum memiliki keduanya, jadi kandidat ini belum bisa divalidasi lokal — hanya status lisensinya yang dapat dikonfirmasi.

Lihat `docs/SBOM-Plan.md` untuk mekanisme pemindaian otomatis yang menggantikan verifikasi manual ini.

## Gate manusia

| human_gate_id | status | blocks_hats | keterangan |
|---------------|--------|-------------|------------|
| HG-AUDIT-R1 | pending | 30 | Review owner sebelum dipakai sebagai dasar implementasi |
