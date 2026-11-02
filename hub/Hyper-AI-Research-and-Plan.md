# Hyper AI — Riset Mendalam, Arsitektur, dan Rencana Pengembangan

**Tanggal:** 31 Oktober 2026  
**Status:** Draf untuk keputusan; Increment 1 Fase 0 sudah lolos self-check  
**Lingkup:** riset, arsitektur, roadmap, backlog, keamanan, dan rencana validasi. Belum ada implementasi kode.  
**Bahasa:** Indonesia

---

## 0. Ringkasan Eksekutif

Hyper AI saat ini adalah aplikasi desktop berbasis OpenCode yang sudah kuat untuk kerja pengetahuan lokal: Docling/OCR, Office, chart, memori Hindsight, bank pengetahuan, CLI `hyper`, dan delapan skill. Yang belum ada adalah lapisan **operasi berkelanjutan**: penjadwalan, antrean job, kanal komunikasi, persetujuan, audit, dan otomasi yang aman untuk berjalan tanpa pengawasan.

Rekomendasi utamanya:

1. **Jangan memfork engine.** Bangun daemon lokal **Hyper Hub** + plugin OpenCode tipis. Engine tetap milik Hyper AI/OpenCode; Hyper Hub menjadi orchestrator, policy enforcement point, dan audit layer.
2. **Hyper AI 2.1.10 adalah rilis terbaru Hyper AI saat ini.** Upgrade ke OpenCode 2.2.5 belum tersedia lewat jalur resmi Hyper AI. Karena itu, **scheduler lokal Hyper Hub adalah jalur utama**, bukan scheduler native OpenCode.
3. **Scheduler native tetap disiapkan sebagai adapter**, bukan ketergantungan. Jika kelak Hyper AI memakai engine `>= 2.2.5` dan `experimental.schedules` diaktifkan, job yang sama dapat dipindahkan tanpa menulis ulang domain logic.
4. **Telegram lebih dulu, WhatsApp kemudian dan bersyarat.** Telegram Bot API + `grammY` dengan long polling adalah kanal yang paling terkendali. WhatsApp hanya lewat WAHA, nomor cadangan, allowlist, dan tanpa data kasus.
5. **Tiga use case pertama:** sinkronisasi JDIH harian, watch-folder ingest, dan rekap/reminder mingguan. Ketiganya cukup untuk membuktikan nilai, keandalan, dan disiplin keamanan sebelum masuk ke otomasi desktop, remote PC, atau voice.
6. **Case mode saja tidak cukup.** Dokumentasi Hyper AI sendiri menyatakan case mode tidak mengisolasi `shell` dan tidak mencegat semua request model. Hyper Hub harus menegakkan egress policy, redaction, approval, dan audit di lapisan proses, bukan hanya mengandalkan mode aplikasi.

**Estimasi kasar:** MVP (Fase 0–2) sekitar **14–20 minggu** dengan 1 developer senior + QA/security paruh waktu; advanced track (Fase 3–4) menambah **4–6 bulan**. Total backlog inti sekitar **150–220 person-days**.

---

## 1. Metode dan Batas Riset

Riset dilakukan dengan:

- Membaca dokumentasi OpenCode V2, OpenAPI resmi, dan release notes.
- Memeriksa binary/API Hyper AI 2.1.10 dan service OpenCode 2.2.5 yang berjalan di mesin ini.
- Membaca source/README/LICENSE kandidat library dari repositori publik.
- Memeriksa konfigurasi, plugin, CLI, dan struktur knowledge base Hyper AI di mesin ini.
- Uji baca terbatas: endpoint `/api/info`, `/openapi.json`, `/api/experimental/schedule`, feed JDIH, dan daftar isi `~/Hyper-Knowledge`.

Batas:

- Belum ada load test, penetration test, atau uji produksi.
- Beberapa kandidat (WAHA, Windows-MCP, LiveKit, Graphiti) belum dijalankan di mesin ini.
- Lisensi diverifikasi dari file LICENSE per 31 Oktober 2026; tetap perlu legal review sebelum distribusi.
- Dokumen ini bukan nasihat hukum, pajak, atau kepatuhan.

---

## 2. Temuan Kunci yang Terverifikasi

### 2.1 Versi dan kemampuan engine

| Item | Hasil verifikasi | Implikasi |
|---|---|---|
| Hyper AI terpasang | `2.1.10` (`opencode-cli.exe --version` → `hyper-ai v2.1.10`) | Engine yang dipakai aplikasi saat ini adalah 2.1.10 |
| Rilis Hyper AI terbaru | `hyper-v2.1.10` (redirect GitHub `panjihyem/opencode-repack/releases/latest`) | Tidak ada rilis Hyper AI yang lebih baru untuk saat ini |
| OpenCode upstream | `2.2.5` (service lokal dan OpenAPI) | Fitur 2.2.x belum tentu tersedia di Hyper AI |
| OpenAPI Hyper AI 2.1.10 | 124 path | Tidak ada path schedule |
| OpenAPI OpenCode 2.2.5 | 169 path | Ada path schedule, voice, integration, dll. |
| Schedule di 2.1.10 | `GET /api/experimental/schedule` → **404** | Scheduler native tidak tersedia |
| Schedule di 2.2.5 | Endpoint ada di OpenAPI, tetapi service yang berjalan → **404** | Fitur opt-in; belum diaktifkan di konfigurasi |
| Auth service | Basic `opencode:<password>` dari `~/.config/opencode/service.json` | Hyper Hub bisa memakai HTTP API dengan aman di loopback |
| Discovery | `opencode-cli.exe api get /api/info` mengembalikan URL service yang berjalan | Tidak perlu menebak port dinamis |

**Kesimpulan:** jangan menunggu upgrade. Bangun scheduler sendiri sekarang; siapkan adapter native untuk masa depan.

### 2.2 Scheduler native OpenCode

Release notes yang relevan:

- **2.2.1**: menambahkan scheduled prompts lewat `/schedule`, agent tools, dan `experimental.schedules`.
- **2.2.4**: schedule dijalankan di bawah `opencode serve`; beberapa proses server dikoordinasikan agar schedule hanya menembak sekali. Tetap opt-in lewat `experimental.schedules`.

Payload `Schedule.CreatePayload` di 2.2.5:

```json
{
  "sessionID": "ses_...",
  "name": "jdih-daily",
  "when": { "type": "cron", "expr": "0 6 * * *", "tz": "Asia/Jakarta" },
  "prompt": "Jalankan job jdih-daily...",
  "if": { "type": "shell", "command": "..." },
  "until": { "type": "shell", "command": "..." },
  "ends": { "type": "after", "at": "..." }
}
```

Catatan penting:

- Action native hanya berupa **prompt ke session**, bukan job runner dengan retry/audit.
- `if`/`until` dapat berupa shell atau Code Mode JavaScript. Ini memperluas attack surface; jangan pernah menerima kondisi dari input tidak tepercaya.
- Schedule native tidak menggantikan idempotency, lease, dead-letter, dan audit Hyper Hub.
- Endpoint schedule 2.2.5 mengembalikan 404 jika `experimental.schedules` belum aktif.

**Keputusan:** scheduler Hyper Hub menjadi driver default. Native driver dibuat sebagai adapter opsional dengan feature flag.

### 2.3 Plugin, permission, event, dan audit

Hyper AI 2.1.10 sudah memakai plugin API V2. Plugin `hyper-memory.ts` yang terpasang memakai:

- `ctx.session.hook("context", ...)`
- `ctx.session.hook("compaction", ...)`
- `ctx.location.project.canonical`

Plugin V2 menyediakan:

- `ctx.permission.assert`, `ctx.permission.list/get/reply` untuk approval.
- `ctx.event.subscribe` untuk event stream.
- `ctx.tool.hook("execute.before"/"execute.after")` untuk audit tool.
- `ctx.shell.hook("create.before")` untuk audit/kontrol shell.
- `ctx.session.hook("prompt")` untuk redaction sebelum prompt masuk.
- `ctx.session.hook("context")` untuk menyuntik konteks/aturan.
- `ctx.tool.transform` untuk mendaftarkan tool Hyper Hub.
- `ctx.storage` untuk state plugin.

API HTTP yang relevan:

- `GET /api/permission/request` — daftar approval pending.
- `GET /api/session/{sessionID}/permission` — daftar approval per session.
- `POST /api/session/{sessionID}/permission/{requestID}/reply` — jawab `once`, `always`, atau `reject`.
- `GET /api/event` — SSE event stream.

**Peringatan:** dokumentasi OpenAPI menyebut event stream bersifat **volatile**; consumer lambat bisa overflow dan event saat disconnect hilang. Audit kritis tidak boleh hanya mengandalkan event stream. Gunakan hook plugin untuk aksi penting + rekonsiliasi periodik.

### 2.4 Memori dan knowledge base

Yang sudah ada:

- Hindsight lokal di `127.0.0.1:8888`, bank `general`, `project:<slug>`, dan `sessions`.
- CLI `hyper sync` memindai `~/Hyper-Knowledge/general` dan `~/Hyper-Knowledge/projects`, lalu ingest ke Hindsight.
- `hyper recall` mencari fakta lintas bank.
- `hyper fetch --source kemenkeu|djp` mengambil JSON Feed JDIH dan menulis katalog Markdown.
- `hyper viz` merender chart lewat Chromium Hyper AI.
- `~/Hyper-Knowledge/ingest` sudah dibuat, **tetapi tidak dipindai oleh `syncKnowledge`**. Ini gap penting untuk watch-folder.

Temuan operasional:

- `hyper fetch` hanya menulis **katalog metadata + tautan**, bukan naskah resmi. Untuk analisis penuh, perlu downloader/OCR terpisah.
- File katalog ditulis per hari dengan nama `jdih-kemenkeu-YYYY-MM-DD.md`. Jika job berjalan dua kali di hari yang sama, file ditimpa dengan timestamp baru; ukuran/mtime berubah dan `hyper sync` bisa meng-ingest ulang. Perlu content hash dan skip-if-unchanged.
- Feed JDIH yang diuji merespons HTTP 200, format JSON Feed 1.x, 100 item. Ini memvalidasi use case katalog harian.
- `hyper sync` memakai manifest `ingest-manifest.json` berbasis size+mtime, bukan hash. Perlu hash untuk idempotency yang lebih kuat.

### 2.5 Kondisi konfigurasi dan keamanan saat ini

Temuan yang perlu ditindaklanjuti sebelum job unattended:

- `~/.config/opencode/opencode.json` masih memakai `"permission": { "*": "allow" }` (V1). Untuk job background, ini terlalu terbuka.
- Konfigurasi yang sama menyimpan **API key provider dalam plaintext**. Nilainya tidak ditampilkan di dokumen ini. Migrasikan ke credential store/DPAPI dan rotasi key.
- Ada duplikasi `provider` (V1) dan `providers` (V2) di konfigurasi; perlu dibersihkan agar tidak membingungkan engine.
- Service OpenCode yang berjalan adalah 2.2.5, sedangkan binary Hyper AI 2.1.10. `opencode api` dari binary 2.1.10 bisa terhubung ke service 2.2.5. Ini nyaman untuk discovery, tetapi perlu test matrix dan fail-closed jika versi tidak kompatibel.
- `hyper-memory.ts` masih memakai `fetch` langsung ke Hindsight dan belum punya audit/redaction sendiri. Untuk job sensitif, plugin ini harus dimatikan atau dibungkus policy.

### 2.6 Case mode: batas yang harus dihormati

Dokumen `SECURITY-QUICKSTART.md` menyatakan:

- Case mode mematikan plugin memori otomatis dan menolak Context7, web search, `webfetch`, `websearch`.
- Provider cloud dan tool analisa lokal tetap tersedia.
- Case mode **tidak mengisolasi `shell`** dan **tidak mencegat semua request model**.
- `screen` hanya memeriksa pola/nilai yang dikenal; nama, alamat, foto, screenshot, lampiran PDF, dan narasi bisa lolos.
- `tokens.json` tidak boleh keluar dari mesin.

Implikasi: Hyper Hub tidak boleh menganggap “case mode ON” sebagai jaminan. Harus ada:

- Egress policy yang memblokir kanal eksternal untuk data kasus.
- Redaction sebelum prompt/attachment.
- Local-only model option untuk data yang benar-benar sensitif.
- Approval manusia untuk tindakan berisiko.
- Audit tanpa menyimpan isi sensitif.

---

## 3. Riset Kandidat Teknologi

### 3.1 Tabel keputusan

| Kandidat | Lisensi | Peran yang dipertimbangkan | Keputusan | Alasan / risiko |
|---|---|---|---|---|
| **croner** | MIT | Scheduler lokal | **Adopt** | Ringan, timezone, overrun protection, tanpa dependensi |
| **DBOS Transact TS** | MIT | Durable workflow/queue | **Hold** | Butuh Postgres; overkill untuk single-user desktop |
| **grammY** | MIT | Telegram Bot API | **Adopt** | Long polling, middleware, error handling, ekosistem matang |
| **WAHA** | Apache-2.0 (Core), Plus komersial | WhatsApp HTTP API | **Conditional / Phase 2+** | Unofficial WhatsApp Web; risiko ban; butuh Docker, nomor cadangan, allowlist |
| **Baileys** | MIT | WhatsApp library | **Reject untuk produksi** | Unofficial, ToS risk, session rapuh; hanya untuk riset |
| **Composio** | MIT (SDK), hosted | Integrasi SaaS | **Limited** | Kredensial di custody pihak ketiga; hanya non-sensitif |
| **Nango** | Elastic License | Self-host integrasi | **Reject / legal review** | Bukan lisensi OSI; risiko legal |
| **Activepieces** | MIT (Community) | Automation self-host | **Hold** | Berguna untuk non-sensitif, tetapi menambah attack surface |
| **Playwright MCP** | Apache-2.0 | Browser deterministik | **Adopt Phase 2** | Accessibility tree, origin allowlist; bukan security boundary |
| **browser-use** | MIT | LLM browser agent | **Defer** | Nondeterministik, prompt injection; hanya di VM |
| **Stagehand** | MIT | Browser automation | **Hold** | Overlap dengan Playwright MCP; belum perlu |
| **Skyvern** | AGPL-3.0 | Browser workflow | **Reject** | AGPL, berat, tidak boleh di-link ke produk |
| **E2B** | Apache-2.0 | Sandbox code execution | **Hold** | Cloud/self-host, kompleks; sandbox lokal lebih dulu |
| **Windows-MCP** | MIT | Desktop automation | **Conditional Phase 3** | Akses OS penuh, telemetri default, Python 3.14+; wajib VM/user terpisah |
| **UI-TARS / OmniParser** | perlu verifikasi | GUI agent | **Defer** | Model berat, belum jelas kebutuhan |
| **nut.js** | perlu verifikasi | Desktop automation | **Reject** | Tidak memberi isolasi; Windows-MCP lebih terkontrol |
| **RustDesk** | AGPL-3.0 | Remote desktop | **Separate process only** | Copyleft; jangan di-link; admin-only |
| **MeshCentral** | Apache-2.0 | Remote management | **Prefer Phase 3** | Self-host, 2FA, device group, audit |
| **LiveKit Agents** | Apache-2.0 | WebRTC voice/video | **Hold Phase 4** | Infrastruktur berat; hanya jika realtime dibutuhkan |
| **Pipecat** | BSD-2-Clause | Voice pipeline | **Hold Phase 4** | Python, latensi rendah; butuh transport WebRTC |
| **whisper.cpp** | MIT | STT lokal | **Adopt later** | Offline, CPU/GPU; ukuran model |
| **sherpa-onnx** | Apache-2.0 | STT/TTS/VAD lokal | **Adopt later** | Multibahasa, offline; manajemen model |
| **Graphiti** | Apache-2.0 | Temporal knowledge graph | **Hold Phase 3** | Butuh Neo4j/FalkorDB; jadikan indeks turunan |
| **Cognee** | Apache-2.0 | Memory graph/ETL | **Hold** | Overlap Hindsight; kompleksitas |
| **Mem0** | Apache-2.0 | Memory layer | **Reject** | Duplikasi Hindsight; hindari dual source of truth |
| **Hindsight** | MIT | Memory yang sudah ada | **Keep** | Sudah terintegrasi; jangan diganti dulu |
| **Docling** | MIT | OCR/ekstraksi | **Keep** | Sudah ada di Hyper AI |
| **LM Studio + Spark 2.5 4B** | proprietary model | Model lokal/offline | **Keep untuk kasus terbatas** | 4B cukup untuk klasifikasi/redaksi, bukan penalaran hukum |

### 3.2 Catatan riset per kandidat

**Scheduler.** `croner` cocok untuk desktop karena tidak butuh database/server. `DBOS` baru relevan jika Hyper Hub menjadi multi-user atau butuh durable workflow lintas mesin. Untuk sekarang, SQLite + croner + job runner sendiri lebih sederhana dan cukup.

**Telegram.** `grammY` mendukung long polling dan webhook. Long polling dipilih karena tidak membuka port publik, tidak butuh HTTPS certificate, dan lebih mudah di-debug di laptop. Konsekuensinya: bot harus selalu hidup; update Telegram disimpan maksimal 24 jam; perlu dedupe `update_id` dan queue.

**WhatsApp.** WAHA membungkus beberapa engine: WEBJS/WPP memakai browser, GOWS/NOWEB memakai WebSocket. Untuk server, GOWS/NOWEB lebih ringan. WAHA Core Apache-2.0, tetapi fitur Plus komersial. Dokumentasi WAHA menekankan API key (`X-Api-Key`), hash SHA-512, HMAC webhook, HTTPS, dan larangan mengekspos API ke publik. Risiko utama bukan teknis, melainkan **kebijakan WhatsApp dan risiko ban**. Karena itu ditunda dan hanya untuk nomor cadangan.

**Composio.** SDK MIT, platform hosted, SOC 2, kredensial disimpan/di-eksekusi di sisi Composio. Cocok untuk SaaS non-sensitif (calendar, task, email ringan), tidak cocok untuk data kasus. Self-host/BYOC perlu verifikasi kontrak. Alternatif self-host: Activepieces (MIT community), tetapi menambah service dan attack surface.

**Browser.** Playwright MCP memberi snapshot accessibility tree, bukan screenshot-only, sehingga lebih deterministik dan hemat token. Flag penting: `--isolated`, `--allowed-origins`, `--blocked-origins`, storage state. Dokumentasi Playwright MCP sendiri menyatakan ini bukan security boundary; permission OpenCode dan egress policy tetap wajib. browser-use/Stagehand berguna untuk eksplorasi, tetapi nondeterministik untuk job terjadwal.

**Desktop.** Windows-MCP v0.8.8 (MIT, Python 3.14+) memberi akses langsung ke OS, tanpa sandbox. Telemetri aktif secara default; matikan dengan `ANONYMIZED_TELEMETRY=false`. Gunakan transport stdio, auth key jika HTTP, bind loopback, tool allowlist, dan idealnya VM/Windows user terpisah. Jangan pernah memberi akses ke data kasus asli tanpa redaction.

**Remote PC.** MeshCentral (Apache-2.0) lebih cocok untuk self-host karena punya device group, 2FA, dan audit. RustDesk (AGPL-3.0) hanya boleh berjalan sebagai proses terpisah, tidak di-link/di-bundle ke Hyper AI. Remote support harus admin-only, consent banner, session recording, dan time-bound access.

**Voice.** LiveKit Agents (Apache-2.0) + Pipecat (BSD-2) adalah kombinasi realistis untuk realtime voice, tetapi menambah server WebRTC, TURN, dan model STT/TTS. whisper.cpp/sherpa-onnx bisa menjadi STT/TTS lokal. Ini R&D Phase 4, bukan fondasi.

**Graph memory.** Graphiti (Apache-2.0) menambahkan temporal knowledge graph dengan validitas waktu, cocok untuk relasi regulasi–pasal–kasus. Namun butuh Neo4j/FalkorDB dan entity extraction yang mahal. Jadikan **indeks turunan** dari Hindsight, bukan sumber kebenaran. Cognee juga layak, tetapi overlap; pilih salah satu setelah use case relationship query terbukti.

---

## 4. Arsitektur yang Diusulkan

### 4.1 Prinsip

1. **Engine tetap engine.** Hyper AI/OpenCode menangani session, model, tool, dan permission. Hyper Hub menangani job, policy, audit, dan kanal.
2. **Local-first.** Semua state di mesin pengguna; tidak ada cloud wajib.
3. **Deny-by-default.** Job background tidak mendapat `shell`, `edit`, `web`, atau kanal eksternal kecuali diizinkan eksplisit.
4. **Idempotent by design.** Setiap job punya idempotency key, lease, dan dedupe.
5. **Observable.** Setiap run punya run ID, log, audit, dan artifact manifest.
6. **Fail closed.** Jika policy/approval/audit tidak tersedia, job berhenti; tidak lanjut dengan asumsi aman.
7. **Bisa di-rollback.** Tidak ada perubahan destruktif pada database OpenCode; konfigurasi lama dibackup.

### 4.2 Diagram komponen

```
┌──────────────────────────────────────────────────────────────────┐
│                        Hyper AI Desktop                          │
│  UI  ────────────────►  OpenCode engine (2.1.10 saat ini)        │
│                              │                                   │
│                              │ plugin hyper-hub-bridge            │
│                              │ (tools, hooks, permission)         │
└──────────────────────────────┼───────────────────────────────────┘
                               │ localhost HTTP/SSE + Basic auth
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│                        Hyper Hub Daemon                          │
│                                                                  │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌───────────┐  │
│  │ Scheduler  │  │ Job Runner │  │ Approval   │  │ Policy    │  │
│  │ (croner)   │  │ (SQLite)   │  │ Broker     │  │ Engine    │  │
│  └────────────┘  └────────────┘  └────────────┘  └───────────┘  │
│                                                                  │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌───────────┐  │
│  │ Audit Log  │  │ Artifacts  │  │ Connectors │  │ Health    │  │
│  │ hash chain │  │ manifest   │  │ registry   │  │ /metrics  │  │
│  └────────────┘  └────────────┘  └────────────┘  └───────────┘  │
└───────┬───────────────┬───────────────┬───────────────┬──────────┘
        │               │               │               │
        ▼               ▼               ▼               ▼
   Telegram        Hindsight       Hyper CLI       Playwright MCP
   (grammY)        127.0.0.1:8888  fetch/sync/viz  (isolated, allowlist)
        │
        ▼
   WAHA (opsional, Phase 2+)

   Windows-MCP (Phase 3, VM/user terpisah)   MeshCentral (Phase 3, admin)
   Graphiti/Neo4j (Phase 3, indeks turunan)  LiveKit/Pipecat (Phase 4)
```

### 4.3 Komponen inti

**Hyper Hub Daemon**

- Proses lokal, bind `127.0.0.1`, port tetap/konfigurabel.
- Auth: bearer token acak per instalasi, disimpan DPAPI; hanya plugin dan CLI yang tahu.
- API: REST/JSON + SSE. Endpoint: `/health`, `/jobs`, `/runs`, `/approvals`, `/schedules`, `/watchers`, `/audit`, `/metrics`.
- Tidak mengekspos port ke LAN.
- Single-instance lock (named mutex/file lock).

**Plugin `hyper-hub-bridge`**

- Tipis: mendaftarkan tool `hub_job_*`, `hub_notify`, `hub_approval_*`, `hub_audit`.
- Hook `prompt` untuk redaction dan penolakan input terlarang.
- Hook `tool.execute.before/after` dan `shell.create.before` untuk audit.
- `ctx.permission.assert` untuk tool Hyper Hub yang berisiko.
- Tidak menyimpan business logic; semua keputusan di daemon.
- Kompatibel dengan V2 plugin API 2.1.10; sediakan fallback V1 hanya jika diperlukan.

**Scheduler**

- `LocalSchedulerDriver` (default): croner + SQLite.
- `NativeSchedulerDriver` (opsional): OpenCode `>= 2.2.5` + `experimental.schedules`.
- `SchedulerDriver` interface: `create`, `pause`, `resume`, `remove`, `list`, `onFire`.
- Job spec disimpan sebagai JSON/YAML; driver hanya menjalankan.
- Migrasi lokal → native harus eksplisit, dengan dry-run dan dual-run yang dimatikan.

**Job Runner**

- Lease SQLite (`BEGIN IMMEDIATE`), `lease_until`, `attempt`, `idempotency_key`.
- Langkah: `run` (shell/CLI/HTTP), `prompt` (session), `notify`, `approve`, `wait`.
- Timeout per langkah; retry exponential backoff + jitter; dead-letter.
- Catch-up policy: hanya satu run untuk slot yang terlewat, dalam grace window (default 6 jam).
- Concurrency limit global (2–4) dan resource lock per connector.
- Kill process tree saat cancel; cleanup temp.

**Approval Broker**

- Sumber: permission request OpenCode, tool Hyper Hub, dan job step berisiko.
- Kanal: Telegram inline keyboard; dashboard untuk high-risk.
- Keputusan: `once`, `always`, `reject`; default **deny** saat timeout.
- Single-use nonce; verifikasi chat ID/user ID; audit.
- High-risk (remote control, delete, external upload, case data) butuh dua approval atau dashboard.

**Policy Engine**

- Zona: `local-only`, `general`, `admin`.
- Aturan: action/resource/effect, egress allowlist, model allowlist, time window, approval requirement.
- Enforcement: sebelum job, sebelum tool, sebelum HTTP keluar, sebelum notifikasi.
- Case mode: `local-only`; blokir Telegram/WhatsApp/Composio/web; hanya model lokal yang diizinkan; redaction wajib.

**Audit Log**

- JSONL append-only + hash chain (`prev_hash` + canonical JSON).
- Index SQLite untuk query.
- Field: event_id, ts, actor, job_id, run_id, session_id, action, resource, decision, result, model, tokens, cost, duration, error, policy, redaction_level, prev_hash, hash.
- Jangan simpan prompt/attachment mentah; simpan hash, panjang, jumlah redaction.
- Retensi default 90 hari; kasus sesuai kebijakan.
- Keterbatasan: local admin bisa menulis ulang; hash chain membuat tamper-evident, bukan tamper-proof. Untuk bukti kuat, anchor harian ke file terpisah/WORM.

**Connectors**

- `telegram`, `hindsight`, `hyper-cli`, `jdih`, `playwright`, `windows-mcp`, `waha`, `graphiti`, `meshcentral`.
- Setiap connector punya allowlist, timeout, retry, circuit breaker, dan audit.
- Secret via DPAPI/Windows Credential Manager, bukan JSON.

### 4.4 Alur kerja utama

**A. Job terjadwal**

```
croner trigger
  → buat run (idempotency key)
  → policy check
  → acquire lease/resource lock
  → step 1: hyper fetch (timeout 60s)
  → step 2: hyper sync (timeout 15m)
  → step 3: notify Telegram (jika ada item baru)
  → audit + artifact manifest
  → release lock
```

**B. Approval**

```
OpenCode permission request
  → plugin/daemon melihat pending
  → policy menilai risiko
  → Telegram inline keyboard (redacted)
  → user klik once/always/reject
  → daemon reply ke OpenCode
  → audit
  → job lanjut/berhenti
```

**C. Case data**

```
file masuk (case zone)
  → klasifikasi + redaction
  → policy: local-only
  → model lokal / Docling / Hindsight
  → output lokal
  → tidak ada Telegram/WhatsApp/Composio
  → render dokumen lokal
```

### 4.5 Scheduler abstraction

```ts
interface SchedulerDriver {
  create(spec: JobSpec): Promise<ScheduleHandle>
  pause(id: string): Promise<void>
  resume(id: string): Promise<void>
  remove(id: string): Promise<void>
  list(): Promise<ScheduleInfo[]>
  onFire(handler: (jobId: string, slot: string) => void): Unsubscribe
}
```

`JobSpec` minimal:

```yaml
id: jdih-daily
name: Katalog JDIH harian
schedule: "0 6 * * *"
timezone: Asia/Jakarta
enabled: true
policy: general
catch_up: true
timeout: 20m
retries: 3
steps:
  - type: run
    command: hyper fetch --source kemenkeu --limit 50
    timeout: 2m
  - type: run
    command: hyper sync
    timeout: 15m
  - type: notify
    channel: telegram
    template: jdih-summary
```

### 4.6 Data model (SQLite)

Tabel utama:

- `jobs` (id, name, spec_json, enabled, created_at, updated_at)
- `schedules` (id, job_id, driver, expression, timezone, next_due_at, status)
- `runs` (id, job_id, slot, idempotency_key, status, started_at, finished_at, attempt, error)
- `run_steps` (id, run_id, step_no, type, status, output_ref, error, started_at, finished_at)
- `approvals` (id, run_id, session_id, action, resources_json, risk, status, requested_at, expires_at, decided_at, decided_by)
- `notifications` (id, run_id, channel, message_id, status, sent_at)
- `watchers` (id, path, recursive, rules_json, enabled)
- `artifacts` (id, run_id, path, sha256, bytes, created_at)
- `audit_events` (id, ts, actor, action, resource, decision, result, prev_hash, hash, payload_json)
- `connectors` (id, type, config_json, secret_ref, enabled)
- `locks` (name, owner, expires_at)

Gunakan WAL, foreign keys, migrasi berversi, dan backup harian.

### 4.7 Runtime dan packaging

Constraint nyata:

- Tidak ada `node`/`bun` di PATH mesin ini.
- Hyper AI membawa Electron; MCP server dijalankan lewat `Hyper AI.exe` + `ELECTRON_RUN_AS_NODE=1`.
- `hyper.mjs` adalah ES module yang butuh Node-compatible runtime.

Opsi:

1. **MVP:** jalankan Hyper Hub sebagai Node script lewat `Hyper AI.exe` dengan `ELECTRON_RUN_AS_NODE=1`. Cepat, tanpa runtime tambahan, tetapi terikat path Hyper AI.
2. **Produksi:** bundle Node 22 LTS portable (~30 MB) atau Bun compile menjadi `hyper-hub.exe`. Lebih mandiri, tetapi menambah ukuran dan proses update.
3. **Windows Service:** WinSW/NSSM untuk core daemon; desktop worker tetap di user session.

Rekomendasi: MVP opsi 1, produksi opsi 2. Jangan menaruh daemon di dalam proses Electron UI.

---

## 5. Rencana Pengembangan Bertahap

### Fase 0 — Fondasi dan guardrails (minggu 1–3)

**Status prototipe (31 Oktober 2026):** `Hyper-Hub.ps1` dan `Hyper-Hub-SelfCheck.ps1` sudah dibuat di workspace. Increment 1 menyediakan state atomik lokal, validasi state dasar, exclusive runner lock, audit JSONL hash-chain dengan skema record tetap, dan tamper self-check. `tick` hanya memeriksa integritas audit lalu berhenti; `add` dan `run` ditolak. Tidak ada proses eksternal yang bisa dijalankan dari file state. Belum ada Hyper AI/Telegram connector atau job execution. Runtime PowerShell 5.1 dipilih karena Node/Python/.NET/SQLite provider tidak tersedia di mesin ini. State JSON adalah batas MVP satu mesin/satu runner; pindah ke SQLite saat perlu concurrent workers atau query audit berskala.

**Verifikasi:** `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub-SelfCheck.ps1` lulus; tampering pada audit terdeteksi. `init`, `tick`, dan `audit` smoke test lulus; `tick` tidak mengeksekusi job.

**Increment 2 — service discovery read-only:** `Hyper-Hub.ps1 discover` mencocokkan proses service OpenCode dengan listener loopback milik PID yang sama; port tidak diasumsikan tetap. Hasil memuat executable, PID, dan `version: null` bila versi daemon belum terverifikasi. `Hyper-Hub-ContractCheck.ps1` menguji kontrak status/discovery, penolakan `add`/`run`, audit rusak, dan `tick` fail-closed. Belum ada request API: service memerlukan password. Auth/version contract dan persetujuan policy tetap gate sebelum connector, scheduler, plugin, atau kanal eksternal.

**Increment 3 — kontrak fail-closed:** test menyuntik job ke state dan memastikan `tick` tidak membuat run atau mengeksekusi proses. Audit yang hilang dari state lama sekarang memblokir `init`, tanpa membuat ulang bukti audit. Masih belum ada otorisasi untuk eksekusi job atau pembacaan kredensial service.

**Penutupan prototipe read-only (1 November 2026):** `discover` tidak membuat state; `init` memakai exclusive lock; operasi state menolak audit hilang/rusak. Self-check dan contract check lulus. Discovery hanya membuktikan listener loopback milik PID proses; `version: null` dan `authChecked: false` berarti **belum tervalidasi**. Metadata binary terpasang (`2.1.10`) dan CLI lain di mesin (`2.2.5`) bukan bukti versi server yang sedang melayani API. Hash-chain lokal tanpa anchor eksternal tidak membuktikan integritas terhadap penyerang yang dapat mengubah state dan audit sekaligus.

**Regresi lanjutan:** `init` membaca state di dalam exclusive lock, bukan sebelum lock. Regex discovery menerima `serve --service` di ujung command line. Self-check dan contract check tetap lulus.

**Kontrak zona case/regular (1 November 2026):** `Hyper-Hub.ps1 policy-check -Zone case|regular -Operation ...` hanya mengizinkan `local.status`; semua aksi lain ditolak sampai connector dan approval direview. Zona case ditolak eksplisit untuk aksi keluar. Zona regular tidak mendapat pembatasan global baru; kebijakan ini hanya berlaku untuk Hub, dan keputusan `allow` untuk status **tidak** memberi izin eksekusi. Contract check mencakup matriks case, regular, dan zona tak dikenal. Instalasi Hyper AI serta konfigurasi global tidak diubah. Plugin memori global `hyper-memory.ts` masih mengirim prompt dan ekor transkrip ke Hindsight lokal tanpa penanda case/regular; isolasi memori dan pembatasan model cloud pada case mode belum dijamin oleh kontrak Hub. Perlu desain dan review terpisah sebelum mengklaim secure case end-to-end.

**Spec gate lokal (1 November 2026, pola SpecWave):** `Hyper-Hub-SpecCheck.ps1` mewajibkan bagian Tujuan/Lingkup/Non-lingkup/Jalur kegagalan/Kriteria penerimaan/Gate manusia, kriteria penerimaan berisi perintah, baris `HG-AUDIT-R1` 4 kolom berstatus `approved`, dan zona `case` wajib punya `## Batas egress`. Exit 2 = implementasi diblokir; exit 0 = boleh lanjut. Templat: `Hyper-Hub-Spec-Template.md`. Self-check lulus. Belum dipasang sebagai CI karena workspace bukan repo git.

### Evaluasi alat pihak ketiga (1 November 2026)

**SpecWave** (`spec-wave`, npm, MIT, TypeScript; npm `latest` = 3.5.0 saat dicek, README masih mem-pin 3.4.0). Multi-host coding CLI dengan P0 gate fail-closed (exit 2), objek `spec.md`/`task.md`, tabel human-gate `HG-AUDIT-R1` yang wajib `approved` sebelum perubahan kode, dan jejak tasks/reviews/invokes. Kecocokan: tinggi—semantik gate-nya sama dengan desain Hyper Hub. **Koreksi penting:** gate ini bukan sandbox dan bukan pencegat edit; ia menolak lewat exit 2 dan bergantung pada agent/CI yang mematuhi hasilnya. Injeksi standar kode (`apply_coding_standards`) **tidak otomatis**—hanya terjadi setelah tool itu dipanggil, dan itu permukaan plugin DSH, bukan CLI. Landing `opencode` hanya menulis `AGENTS.md` + `.agents/skills/`, jadi tidak menambah penegakan runtime. Kendala: butuh Node ^22.19 atau >=24 (tidak ada di mesin ini), npm, repo git, dan paket pihak ketiga yang mengeksekusi kode saat `npx`. **Keputusan: adopsi pola + implementasi lokal (`A-06`), bukan memasang paket.** Evaluasi paket hanya setelah runtime Node dan repo git tersedia dan setelah review supply chain.

**Graphify** (repo resmi `Graphify-Labs/graphify`, Apache-2.0, Python; PyPI `graphifyy`, CLI `graphify`; ±140 ribu bintang, YC S26). Mengubah kode/dokumen/PDF/gambar/video menjadi knowledge graph yang bisa di-query (`graph.json`, `graph.html`, `--wiki`, `--mcp` stdio). **Koreksi penting:** klaim "100% lokal tanpa LLM" hanya benar untuk **kode** (tree-sitter AST). Dokumen, PDF, gambar, dan video memakai semantic pass ke backend pilihan—model sesi asisten, API key cloud, atau Ollama. Kontrol yang relevan untuk zona case: `--code-only`, `GRAPHIFY_BACKEND=none`, atau `GRAPHIFY_BACKEND=ollama`. Catatan privasi lain: setiap `query`/`path`/`explain` dicatat ke `~/.cache/graphify-queries.log` (bisa dimatikan), dan `graphify add <url>` mengambil konten dari internet. Integrasi Hyper AI lewat `graphify install --platform opencode` hanya menulis instruksi `AGENTS.md`/skill, bukan hook. Kendala: Python 3.10+ dan uv/pipx (tidak ada di mesin ini). **Keputusan: spike non-sensitif saja (`J-04`) dengan backend lokal dan `--code-only` untuk data sensitif; hasilnya menjadi masukan `J-03`.** Data kasus dilarang masuk korpus.

**Urutan yang direkomendasikan:** isolasi recall per project → spec gate (`A-06`) → kontrak auth/versi server → satu job non-sensitif → baru spike Graphify. Graph bukan prioritas sebelum recall project terpisah dan secure case dibatasi. SpecWave dan Graphify saling melengkapi: Graphify menjawab "di mana/apa hubungannya", SpecWave menegakkan "boleh diubah atau tidak". Keduanya opsional; Hyper Hub tetap harus punya gate sendiri agar tidak bergantung pada dua paket pihak ketiga.

### Agent: kondisi Hyper AI saat ini (1 November 2026)

`opencode.json` tidak mendefinisikan `agents`, dan tidak ada `~/.config/opencode/agents` maupun `.opencode/agents`, sehingga yang aktif hanya agent bawaan: `build`, `plan` (primary), `general`, `explore` (subagent), plus `compaction`/`title`/`summary` yang tersembunyi. Pemilihan agent lewat GUI tersedia; menetapkan agent cukup dengan memilihnya, sedangkan izin tetap berasal dari konfigurasi. Subagent berjalan paralel sebagai sesi anak dengan konteks segar, foreground atau background. Spawning berantai tidak terjadi: `general` dan `explore` tidak dapat meluncurkan subagent, dan agent induk dibatasi izin `subagent` serta `steps`. `hidden` hanya menyembunyikan agent, bukan mengamankan. Karena itu ditambahkan `D-11` (verifikasi GUI/mode per versi), `D-12` (batas subagent per induk, larangan spawning berantai), dan `D-13` (batas steps/konkurensi serta zona data subagent); semuanya menjadi dependensi review keamanan `D-10`.




**Gate sebelum tahap eksekusi (belum disetujui):** owner memilih use case non-sensitif serta menyetujui kebijakan data kasus, runtime/connector registry, autentikasi dan versi server, strategi crash recovery audit+state, dan acceptance test terisolasi. Tidak ada persetujuan implisit dari prototipe ini. Sampai gate lulus, `add`/`run` ditolak; tidak ada daemon loop, plugin bridge, atau Telegram.

**Tujuan:** Hyper Hub bisa hidup, discover engine, menolak eksekusi yang tidak aman, menulis audit, dan siap menjalankan satu job setelah connector direview.

Deliverable:

- Repo + struktur + CI + lint/test (belum dibuat).
- ADR-001…007.
- Service discovery + auth + version check.
- State store atomik JSON untuk spike; SQLite schema + migrasi masih terbuka.
- Pemeriksaan `tick` minimal PowerShell; scheduler loop dan croner belum dibuat.
- Audit hash chain + query.
- Policy engine minimal (allow/deny, case zone).
- Plugin bridge minimal (health, audit hook, tool `hub_status`) — belum dimulai.
- Backup/restore config dan database.
- Threat model + security checklist.

Exit criteria:

- **Belum lulus:** satu job terjadwal belum dapat dijalankan; eksekusi dinonaktifkan sampai connector registry aman.
- Service mati → job gagal dengan error jelas, bukan menggantung.
- Audit bisa diverifikasi hash chain-nya.
- Tidak ada secret di log.

### Fase 1 — Tiga use case pertama (minggu 4–9)

**Tujuan:** membuktikan nilai pada pekerjaan nyata tanpa data kasus.

Deliverable:

- JDIH connector: fetch + sync + dedupe + notifikasi.
- Watch-folder: `ingest` router + stability check + virus scan + sync.
- Weekly recap: query Hindsight + ringkasan + reminder.
- Telegram minimal: `/status`, `/jobs`, `/run`, notifikasi.
- Approval broker minimal: satu jenis approval (notifikasi eksternal).
- Dashboard CLI (`hyper-hub status`, `runs`, `audit`).

Exit criteria:

- Tiga job berjalan 14 hari berturut-turut pada data non-sensitif.
- Tidak ada duplikasi efek samping.
- Kegagalan terdeteksi < 5 menit.
- Laporan mingguan berisi sumber yang bisa dilacak.

### Fase 2 — Kanal, browser, dan integrasi (minggu 10–16)

**Tujuan:** produksi terbatas dengan approval dan browser deterministik.

Deliverable:

- Telegram lengkap: approval inline, rate limit, dedupe, file handling.
- WhatsApp conditional (WAHA) — hanya jika go/no-go disetujui.
- Playwright MCP sidecar + JDIH full-text download/OCR.
- Integrasi native/Composio non-sensitif.
- Policy engine lengkap: egress allowlist, model allowlist, DLP.
- Audit UI/query + export.
- Backup, restore, upgrade, rollback.

Exit criteria:

- Approval round-trip < 60 detik.
- 0 data kasus keluar di test DLP.
- JDIH full-text > 90% berhasil untuk 50 dokumen uji.
- Rollback < 15 menit.

### Fase 3 — Desktop, graph, dan remote support (minggu 17–26)

**Tujuan:** otomasi lanjutan dengan isolasi ketat.

Deliverable:

- Windows-MCP sidecar di VM/user terpisah, strict allowlist.
- Graphiti/Neo4j sebagai indeks turunan (opsional).
- MeshCentral self-host untuk remote support admin.
- Audit remote session + consent + recording.
- UAT dengan skenario legacy app.

Exit criteria:

- 10 script desktop berhasil > 80%, 0 insiden destruktif.
- Graph query precision > 80% pada 50 pertanyaan uji.
- Remote session 100% consent + recorded + time-bound.

### Fase 4 — Realtime voice/video (minggu 27–34, R&D)

**Tujuan:** eksperimen, bukan komitmen produk.

Deliverable:

- LiveKit + Pipecat spike.
- whisper.cpp/sherpa-onnx STT lokal.
- Voice note → transcript → job.
- Latency/quality benchmark.

Exit criteria:

- Latensi < 1 detik untuk voice note pendek.
- Tidak ada data keluar secara default.
- Keputusan go/no-go berdasarkan hasil.

---

## 6. Backlog dan Estimasi

Backlog terperinci ada di file **`Hyper-AI-Backlog.csv`**. Ringkasan per epic:

| Epic | Fokus | Estimasi (person-days) | Prioritas |
|---|---|---:|---|
| A | Program, ADR, governance | 8 | P0 |
| B | Hyper Hub core runtime | 18 | P0 |
| C | Scheduler & job engine | 20 | P0 |
| D | Policy, approval, audit | 22 | P0 |
| E | Channels (Telegram/WhatsApp) | 18 | P1 |
| F | Knowledge pipeline (JDIH/watch/recap) | 24 | P0 |
| G | Browser automation | 12 | P1 |
| H | Desktop automation | 15 | P2 |
| I | Integrations | 10 | P2 |
| J | Graph memory | 12 | P2 |
| K | Realtime voice/video | 20 | P3 |
| L | Remote support | 12 | P3 |
| M | Operability, QA, rollout | 18 | P0/P1 |
| **Total** | | **209** | |

Asumsi: 1 developer senior, 6 jam efektif/hari, QA/security paruh waktu, tanpa redesign UI besar. Estimasi belum termasuk waktu tunggu akses/legal.

---

## 7. Validasi Tiga Use Case Pertama

### 7.1 JDIH harian

**Hipotesis:** katalog regulasi baru bisa diambil, di-ingest, dan diringkas setiap pagi tanpa intervensi, dengan sumber yang bisa diverifikasi.

**Langkah uji:**

1. Jalankan `hyper fetch --source kemenkeu --limit 50` secara manual; verifikasi file katalog.
2. Jalankan `hyper sync`; verifikasi jumlah item dan bank.
3. Jadwalkan job 06:00 Asia/Jakarta selama 14 hari.
4. Bandingkan item baru vs hari sebelumnya; kirim ringkasan Telegram.
5. Matikan jaringan satu hari; verifikasi alert dan catch-up.

**Metrik lulus:**

- 14/14 run sukses atau alert jelas.
- 0 duplikasi item di katalog.
- 100% item punya URL `jdih.kemenkeu.go.id`.
- Waktu fetch < 60 detik; sync < 15 menit.
- Tidak ada data non-publik yang dikirim ke Telegram.

**Gap yang harus ditutup:**

- `hyper fetch` hanya katalog, bukan naskah. Untuk full-text, tambah downloader + Docling di Fase 2.
- Same-day overwrite bisa memicu re-ingest; tambah content hash dan skip-if-unchanged.
- Belum ada scheduler; ini inti Fase 0–1.

### 7.2 Watch-folder ingest

**Hipotesis:** file yang dijatuhkan ke folder inbox masuk ke pengetahuan dalam < 60 detik, tanpa duplikasi, dan file berbahaya dikarantina.

**Langkah uji:**

1. Siapkan 10 file: PDF, DOCX, XLSX, CSV, MD, TXT, RTF, HTML, PNG, dan satu file tidak didukung.
2. Jatuhkan ke `~/Hyper-Knowledge/ingest`.
3. Verifikasi routing, hash, manifest, dan bank.
4. Ulangi file yang sama; verifikasi skip.
5. Uji file > 250 MB dan file corrupt.

**Metrik lulus:**

- 9 file valid ter-ingest; 1 file tidak didukung masuk kuarantina.
- 0 duplikasi setelah pengulangan.
- Waktu proses < 60 detik untuk 10 file kecil.
- Tidak ada file user yang ditimpa.
- Virus scan dijalankan sebelum ingest.

**Gap yang harus ditutup:**

- `syncKnowledge` tidak memindai `ingest`; perlu router.
- Belum ada `fs.watch`, debounce, stability check, hash, dan kuarantina.
- Perlu keputusan routing: default `general/umum` atau klasifikasi agent.

### 7.3 Rekap/reminder mingguan

**Hipotesis:** setiap Senin pagi pengguna menerima ringkasan pekerjaan minggu lalu, daftar tindak lanjut, dan pengingat, dengan sumber yang bisa dibuka.

**Langkah uji:**

1. Isi bank `sessions` dan satu bank project dengan catatan uji.
2. Jalankan job rekap Senin 08:00.
3. Verifikasi ringkasan: jumlah sesi, keputusan, file baru, approval tertunda, deadline.
4. Klik tautan sumber; verifikasi file/session yang dirujuk ada.
5. Uji jika laptop mati saat jadwal; verifikasi catch-up atau alert.

**Metrik lulus:**

- Ringkasan dikirim < 60 detik setelah job mulai.
- 100% klaim punya sumber (session/file).
- 0 data kasus/token di pesan.
- Ada tombol `Snooze`/`Done` untuk reminder.
- Run yang terlewat tercatat dan diberitahukan.

**Gap yang harus ditutup:**

- Bank memori masih kosong di mesin ini; perlu data uji.
- Belum ada scheduler, template rekap, dan kanal.
- Perlu kebijakan retensi dan redaction untuk ringkasan.

---

## 8. Keamanan, Privasi, dan Kepatuhan

### 8.1 Threat model ringkas

| Ancaman | Dampak | Kontrol |
|---|---|---|
| Prompt injection dari dokumen/web/Telegram | Agent menjalankan aksi berbahaya | Treat content as data; tool allowlist; approval; no auto-exec |
| Data kasus keluar ke cloud/kanal | Kebocoran rahasia | Egress policy; case zone; redaction; local model |
| Credential theft dari config/log | Akses tidak sah | DPAPI; rotasi; redaction log; ACL |
| SSRF/path traversal | Baca file/internal network | Allowlist host; path canonicalization; no redirects |
| Approval replay/forgery | Aksi tanpa izin | Nonce; chat/user allowlist; single-use; expiry |
| Destructive desktop action | Kehilangan data | VM/user terpisah; strict tools; confirmation; snapshot |
| Remote support abuse | Kendali penuh | 2FA; consent; recording; time-bound; admin-only |
| Supply chain/license | Legal/security | Pin versions; SBOM; license scan; no AGPL linking |
| Duplicate job | Efek ganda (kirim 2x, ingest 2x) | Idempotency key; lease; dedupe |
| Missed job/laptop sleep | Pekerjaan tidak jalan | Catch-up policy; missed-run alert; wake timer opsional |

### 8.2 Kontrol wajib sebelum produksi

- Migrasi `permission` V1 → `permissions` V2 dengan deny-by-default.
- Hapus API key plaintext dari `opencode.json`; gunakan credential store/DPAPI; rotasi.
- Agent khusus `hyper-ops` dengan shell allowlist sempit; tanpa `edit` kecuali workspace job.
- `ask` tidak boleh dipakai untuk job unattended tanpa approval broker hidup.
- Semua connector keluar lewat egress allowlist.
- Semua approval punya expiry dan default deny.
- Audit hash chain + backup harian.
- Secret tidak pernah masuk prompt, log, atau CSV.
- Case zone memblokir Telegram/WhatsApp/Composio/web.
- `tokens.json` tidak pernah dibaca agent; hanya tool restore lokal.
- Dependency pinning + `npm audit`/`pip-audit` + SBOM.
- Code signing untuk binary/installer; checksum update.

### 8.3 Kepatuhan lisensi

- **AGPL-3.0** (RustDesk, Skyvern): jangan di-link/di-bundle ke Hyper AI. Jalankan sebagai proses terpisah dengan boundary jelas, atau hindari.
- **Elastic License** (Nango): bukan OSI; perlu legal review sebelum dipakai.
- **Commercial/Plus** (WAHA Plus, Composio hosted): pastikan kontrak, data processing agreement, dan biaya.
- **Apache-2.0/MIT/BSD**: aman untuk digunakan, tetap sertakan notices.
- **Model lokal** (Spark 2.5 4B): cek lisensi model; jangan redistribute tanpa izin.

### 8.4 Batas case mode yang harus dijelaskan ke pengguna

Case mode bukan sandbox. Ia mematikan beberapa tool dan plugin, tetapi:

- Shell tetap bisa mengakses jaringan.
- Model cloud tetap menerima prompt/attachment yang dikirim.
- OCR/PDF bisa membawa teks sensitif.
- `screen` tidak menjamin semua PII terdeteksi.

Karena itu, untuk data kasus:

- Gunakan model lokal atau prompt yang sudah diredaksi.
- Jangan lampirkan dokumen asli ke chat model cloud.
- Jalankan job di zona `local-only`.
- Review manual sebelum render/kirim.

---

## 9. Risiko dan Mitigasi

| Risiko | Prob. | Dampak | Mitigasi |
|---|---|---|---|
| Hyper AI repack tertinggal dari OpenCode | Tinggi | Fitur native tidak tersedia | Scheduler sendiri; adapter; test matrix |
| API experimental berubah | Sedang | Integrasi rusak | Pin versi; contract test; feature flag |
| Laptop sleep/off | Tinggi | Job terlewat | Catch-up; alert; wake timer; dashboard |
| Telegram duplikat/rate limit | Sedang | Spam/gagal kirim | Dedupe update_id; queue; backoff; rate limit |
| Prompt injection | Tinggi | Aksi tidak diinginkan | Tool allowlist; approval; no auto-exec |
| Kebocoran data kasus | Rendah–sedang | Sangat tinggi | Egress policy; redaction; local model; DLP test |
| WhatsApp ban | Tinggi | Kanal mati | Nomor cadangan; opt-in; delay; WAHA |
| Desktop automation merusak data | Sedang | Tinggi | VM; strict; confirmation; snapshot |
| Remote support disalahgunakan | Rendah | Sangat tinggi | 2FA; consent; recording; time-bound |
| Graph memory salah fakta | Sedang | Sedang | Indeks turunan; provenance; rebuild; review |
| Biaya model membengkak | Sedang | Sedang | Budget per job; model tier; local model |
| Kompleksitas berlebih | Tinggi | Proyek lambat | Fase ketat; 3 use case; no UI besar |

---

## 10. Acceptance Criteria Program

**Fondasi**

- Hyper Hub start < 5 detik; health check < 1 detik.
- Service discovery berhasil untuk Hyper AI 2.1.10 dan OpenCode 2.2.5.
- Job berjalan tepat waktu (p95 < 60 detik dari jadwal).
- Tidak ada job ganda untuk slot yang sama.
- Crash/restart: job recovery < 5 menit; tidak ada kehilangan audit.
- Audit query 10.000 event < 1 detik.

**Keamanan**

- 0 secret di log/CSV/audit.
- 0 data kasus keluar di 20 test DLP.
- 100% approval high-risk punya jejak audit.
- Approval expired → deny, bukan allow.
- Path traversal/SSRF test ditolak.

**Use case**

- JDIH: 14 hari, 0 duplikasi, alert < 5 menit.
- Watch folder: 10 file, 9 ingest, 1 quarantine, < 60 detik.
- Weekly recap: 100% klaim bersumber, terkirim < 60 detik.

**Operasional**

- Backup/restore berhasil dalam 15 menit.
- Rollback < 15 menit.
- Dokumentasi runbook untuk 5 kegagalan umum.
- Pengguna bisa pause/resume semua job dengan satu perintah.

---

## 11. Dependensi dan Keputusan yang Dibutuhkan

### Dependensi teknis

- Hyper AI 2.1.10 terpasang di `D:\Hyper AI` (path dapat dikonfigurasi).
- Service OpenCode berjalan; password di `~/.config/opencode/service.json`.
- Hindsight aktif di `127.0.0.1:8888` saat job memori berjalan.
- Telegram bot token + chat ID.
- Windows Task Scheduler / WinSW untuk autostart.
- Docker (opsional, WAHA).
- Neo4j/FalkorDB (opsional, graph).
- Python 3.14+ (opsional, Windows-MCP).
- Code signing certificate (untuk distribusi).

### Keputusan yang perlu diambil

1. **Runtime:** MVP pakai Electron-as-Node atau langsung bundle Node portable?
2. **Telegram:** siapa pemilik bot/token, dan chat ID mana yang di-allowlist?
3. **Case data:** apakah model cloud boleh menerima data yang sudah diredaksi, atau harus 100% lokal?
4. **WhatsApp:** go/no-go? Jika go, nomor cadangan dan kebijakan ban?
5. **Remote support:** go/no-go? Siapa admin yang berwenang?
6. **Graph memory:** apakah relationship query benar-benar dibutuhkan?
7. **Realtime voice:** apakah ada use case bisnis yang jelas?
8. **Upgrade Hyper AI:** ikut rilis repack atau pin 2.1.10 sampai stabil?

---

## 12. Rencana 14 Hari Pertama

**Minggu 1**

- Hari 1–2: finalisasi scope, ADR, threat model, backup config.
- Hari 3–4: spike service discovery + auth + `/api/info` + version check.
- Hari 5: spike SQLite schema + job runner + croner.
- Hari 6–7: spike audit hash chain + plugin bridge health.

**Minggu 2**

- Hari 8–9: JDIH fetch/sync dry-run + dedupe hash.
- Hari 10: watch-folder router + stability check.
- Hari 11: Telegram bot echo + allowlist + dedupe.
- Hari 12: approval broker spike (satu request).
- Hari 13: security review + DLP test awal.
- Hari 14: demo internal + go/no-go Fase 1.

**Definition of done spike:** demo 5 menit, log/audit bisa ditelusuri, tidak ada secret, dan ada catatan gap.

---

## 13. Lampiran

### 13.1 Referensi utama

- OpenCode V2 docs: <https://opencode.ai/v2/docs/>
- OpenCode V2 API/OpenAPI: <https://opencode.ai/v2/openapi.json>
- OpenCode 2.2.1 release: <https://github.com/anomalyco/opencode/releases/tag/v2.2.1>
- OpenCode 2.2.4 release: <https://github.com/anomalyco/opencode/releases/tag/v2.2.4>
- Telegram Bot API: <https://core.telegram.org/bots/api>
- grammY: <https://grammy.dev/>
- WAHA: <https://waha.devlike.pro/>
- Playwright MCP: <https://github.com/microsoft/playwright-mcp>
- Windows-MCP: <https://github.com/CursorTouch/Windows-MCP>
- Composio: <https://github.com/ComposioHQ/composio>
- LiveKit Agents: <https://github.com/livekit/agents>
- Pipecat: <https://github.com/pipecat-ai/pipecat>
- Graphiti: <https://github.com/getzep/graphiti>
- Cognee: <https://github.com/topoteretes/cognee>
- MeshCentral: <https://github.com/Ylianst/MeshCentral>
- RustDesk: <https://github.com/rustdesk/rustdesk>
- whisper.cpp: <https://github.com/ggml-org/whisper.cpp>
- sherpa-onnx: <https://github.com/k2-fsa/sherpa-onnx>
- DBOS Transact: <https://github.com/dbos-inc/dbos-transact-ts>
- croner: <https://github.com/Hexagon/croner>
- Activepieces: <https://github.com/activepieces/activepieces>
- Nango: <https://github.com/NangoHQ/nango>
- Hindsight: <https://github.com/vectorize-io/hindsight>
- Mem0: <https://github.com/mem0ai/mem0>

### 13.2 Glosarium

- **Hyper Hub:** daemon lokal orchestrator.
- **Bridge plugin:** plugin tipis di OpenCode untuk menghubungkan Hyper Hub.
- **Job:** satu unit pekerjaan terjadwal.
- **Run:** satu eksekusi job.
- **Approval broker:** layanan yang meminta/menyimpan persetujuan.
- **Policy engine:** penegak aturan akses/egress.
- **Case zone:** zona data sensitif yang tidak boleh keluar.
- **Egress:** lalu lintas data keluar dari mesin.
- **Idempotency key:** kunci agar job tidak menghasilkan efek ganda.
- **Lease:** hak eksklusif sementara untuk menjalankan job.
- **Dead-letter:** antrean job yang gagal permanen.

### 13.3 Catatan verifikasi lokal

- `D:\Hyper AI\Engine\resources\opencode-cli.exe --version` → `hyper-ai v2.1.10`.
- `GET /api/info` (Hyper AI 2.1.10) → `version: 2.1.10`.
- `GET /api/experimental/schedule` (2.1.10) → 404.
- `GET /api/info` (service 2.2.5) → `version: 2.2.5`.
- `GET /api/experimental/schedule` (service 2.2.5) → 404 (fitur belum diaktifkan).
- OpenAPI 2.1.10: 124 path; OpenAPI 2.2.5: 169 path.
- `GET https://jdih.kemenkeu.go.id/feed.json` → HTTP 200, JSON Feed 1.x, 100 item.
- `~/Hyper-Knowledge` berisi `general`, `ingest`, `projects`; semuanya kosong saat diperiksa.
- `hyper-memory.ts` memakai `ctx.session.hook("context")` dan `ctx.session.hook("compaction")`.
- `opencode.json` memakai `"permission": { "*": "allow" }` dan menyimpan API key plaintext (tidak ditampilkan).

---

**Akhir dokumen.**

