# Service Contract — OpenCode local service (gate sebelum connector/plugin)

| Zona data | regular |
|-----------|---------|
| Status | draft, belum disetujui owner |
| Tanggal | 1 November 2026 |
| Backlog | B-02 (kontrak service/penemuan port), B-03 (auth), B-04 (matriks versi), M-01 (bukti), C-09 (error/timeout) |
| Terkait | ADR-007 (gate connector registry), ADR-002 (batas PowerShell 5.1), `Hyper-Hub.ps1` (`Get-Discovery`), `Hyper-Hub-VersionCheck.ps1` |

## Tujuan

Menetapkan bukti yang wajib ada sebelum Hub boleh membuat connector atau plugin bridge ke service OpenCode lokal.

## Lingkup

- Penemuan port dari PID listener, verifikasi versi server, bukti autentikasi, allowlist endpoint read-only, matriks versi, format error/timeout.

## Di luar lingkup

- Memakai kredensial atau membuktikan auth berhasil; mutasi endpoint; pemasangan plugin.

## Jalur kegagalan

- Bukti kurang -> `run` tetap gagal dan `external.send` tetap `deny`. `add` tetap **menyimpan** job dengan `executable: false`; menyimpan bukan izin eksekusi.

## Kriteria penerimaan

- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub-VersionCheck.ps1 -SelfCheck`

## 1. Ringkasan

Dokumen ini menetapkan bukti apa yang **wajib dimiliki** sebelum Hyper Hub boleh membuat connector, plugin bridge, scheduler yang memanggil engine, atau kanal eksternal. Selama salah satu bukti di 8 belum ada, `run` tetap gagal dan `external.send` tetap `deny`; `add` hanya **menyimpan** job dengan `executable: false` (perilaku `Hyper-Hub.ps1 policy-check` tidak berubah).

Prinsip dokumen:
- **Port tidak diasumsikan** (bukan default `4096`, bukan `28894`). Port diambil dari listener milik PID proses service.
- **Versi bukan dari metadata biner** dan bukan dari nama folder. Versi server hanya dari server itu sendiri.
- **Tidak ada secret** dalam dokumen ini, log, CSV, prompt, atau audit. Lihat `docs/Secret-Handling.md`.
- **Autentikasi belum diuji.** Dokumen ini tidak mengklaim auth berhasil.

## 2. Penemuan port (service discovery)

### Prosedur wajib

1. Enumerasi proses lewat CIM: `Get-CimInstance Win32_Process` untuk `opencode-cli.exe` dan `Hyper AI.exe`.
2. Filter: `CommandLine` harus cocok `\bserve\s+--service(?:\s|$)` (lihat `Hyper-Hub.ps1` `Get-Discovery`).
3. Enumerasi listener: `Get-NetTCPConnection -State Listen`, hanya `127.0.0.1` dan `::1`.
4. Pertahankan listener yang `OwningProcess -eq <PID proses service>`.
5. Nol listener cocok → tidak ada service (fail-closed, bukan fallback ke port default).
6. Beberapa listener untuk satu PID → semua dilaporkan; pemilihan port untuk API ditunda sampai auth contract lulus.

### Yang tidak boleh

- Menebak port dari dokumentasi, contoh, atau hasil run sebelumnya.
- Memakai port dari proses PID lain yang juga mendengar loopback.
- Menjalankan `netstat`/parser teks sebagai sumber utama (CIM + `Get-NetTCPConnection` adalah data terstruktur).
- Membuka koneksi TCP untuk "memastikan port hidup" sebelum auth contract lulus.

### Status bukti

| Item | Status | Bukti |
|---|---|---|
| Gambaran PID↔port | **SUDAH** | `Hyper-Hub-VersionCheck.ps1` (mode normal) dan `Hyper-Hub.ps1 -Command discover`; 1 loopback `127.0.0.1:28894` milik PID `18912` |
| Tidak ada request HTTP dari discovery | **SUDAH** | Field `httpRequests: 0`; skrip tidak memakai `Invoke-WebRequest` |
| Port tidak di-hardcode | **SUDAH (kode)** | Tidak ada literal port di skrip; dosa di masa depan dicegah oleh review |
| Port stabil antar restart | **BELUM** | Belum diuji restart service. Jangan dijadikan asumsi |

## 3. Verifikasi versi server (server-side only)

Versi server **wajib** berasal dari respons server, bukan dari:
- nama folder `cli/<versi>-<arch>` (itu versi biner terpasang);
- `resources/opencode-cli.version` (itu metadata paket Hyper AI);
- `--version` biner lokal (itu versi biner yang dipanggil, bukan yang melayani port).

### Urutan bukti yang disyaratkan

1. Temukan PID + port (§2).
2. Selesaikan auth resmi (§4).
3. Panggil endpoint read-only yang membuktikan identitas server (lihat §5) melalui mekanisme resmi.
4. Simpan respons dan hubungkan ke PID/port/`ExecutablePath` yang sama, dengan `checkedAtUtc`.
5. Hanya setelah itu `serverVersion` boleh diisi. Bila langkah mana pun gagal → `serverVersion = null`, `serverVersionProof = 'none'`.

### Status bukti

| Item | Status |
|---|---|
| Versi terpasang biner yang menyediakan service | **SUDAH**, `2.1.10`, dari nama folder `...\ai.hyperai.desktop\cli\2.1.10-x64\` |
| Versi metadata Hyper AI | **SUDAH**, `2.1.10`, dari `D:\Hyper AI\Engine\resources\opencode-cli.version` |
| Versi server dari server | **BELUM** — di semua artefak harus tetap `null` |
| Korelasi PID/port/versi server | **BELUM** |

Konsekuensi: `Hyper-Hub.ps1 discover` dan `Hyper-Hub-VersionCheck.ps1` **wajib** melaporkan `serverVersion: null`. Mengisinya tanpa bukti API = pelanggaran kontrak.

## 4. Autentikasi

### Fakta

- Service loopback `127.0.0.1:28894` mengembalikan **401** untuk `/openapi.json`; path lain mengembalikan halaman HTML. Ini berarti ada lapisan auth, bukan bukti mekanismenya bekerja.
- CLI `opencode-cli.exe` 2.2.5 (`opencode api --help`) menyediakan `opencode api [flags] <operation | method path...>` dengan flag `--server`, `--header`, `--param`, `--data`.
- `opencode api --help` **tidak** mendokumentasikan flag password, variabel `OPENCODE_PASSWORD`, atau cara token diambil. Mekanisme internal service = **belum terdokumentasi**.

### Aturan (yang disetujui untuk dipakai)

1. Gunakan **hanya** mekanisme resmi CLI `opencode api` dan/atau variabel sesi `OPENCODE_PASSWORD` **bila** perilakunya terbukti pada versi yang menangani port tersebut.
2. Secret **tidak** ditulis di dokumen, skrip, log, CSV, argumen command line yang terlihat di `Win32_Process.CommandLine`, atau prompt model.
3. Pemanggilan CLI wajib mengarah eksplisit ke port hasil penemuan (`--server http://127.0.0.1:<port>`), tidak boleh mengandalkan "background service default".
4. Header auth (bila dipakai `--header`) **tidak** boleh muncul di output yang disimpan; redaksi di §7.
5. Bila auth gagal atau mekanisme tidak jelas → berhenti. Jangan coba menebak, brute force, atau membaca file credential milik aplikasi lain.

### Status bukti

| Item | Status | Catatan |
|---|---|---|
| Ada lapisan auth pada service | **SUDAH** | `/openapi.json` → 401 |
| Mekanisme resmi CLI untuk auth | **BELUM** | Help tidak menyebut password/env; perlu baca dokumentasi resmi versi 2.1.10 |
| `OPENCODE_PASSWORD` dibaca service | **BELUM** | Belum diuji; jangan klaim |
| Auth berhasil ke endpoint apa pun | **BELUM** | **Belum diuji sama sekali** |
| Perilaku 401 (body/header) | **BELUM** | Hanya status kode yang teramati |

## 5. Endpoint read-only yang diizinkan untuk kontrak

Allowlist untuk pembuktian kontrak, **setelah** auth lulus:

| Endpoint | Tujuan | Metode | Status ketersediaan |
|---|---|---|---|
| `/openapi.json` | Skema API; membuktikan identitas & bentuk respons | GET | Ada (401 tanpa auth). Isi belum terbaca |
| `/api/info` | Identitas/versi server — kandidat sumber `serverVersion` | GET | **BELUM** diverifikasi |
| `/api/config` | Konfigurasi efektif (redaksi wajib) | GET | **BELUM** diverifikasi |
| `/api/agent` | Daftar agent; relevan vs D-11/D-12 | GET | **BELUM** diverifikasi |

Aturan endpoint:
- Hanya `GET`. Tidak ada `POST`/`PUT`/`PATCH`/`DELETE` untuk pembuktian kontrak.
- Bila endpoint tidak ada (404) → catat `unavailable`, jangan retry dengan variasi path.
- Bila respons memuat field sekret (`apiKey`, `token`, `password`, `authorization`) → **redaksi sebelum disimpan**.
- Dari `/api/config` dan `/api/agent` hanya boleh disimpan field yang dibutuhkan kontrak; simpan sebagai bukti tereduksi, bukan dump mentah.
- Endpoint lain (chat/session/tool execution) **dilarang** sampai connector registry `validated` (ADR-007).

## 6. Matriks versi 2.1.10 vs 2.2.5

| Aspek | 2.1.10 | 2.2.5 | Status |
|---|---|---|---|
| Lokasi terpasang | `C:\Users\<user>\AppData\Roaming\ai.hyperai.desktop\cli\2.1.10-x64\opencode-cli.exe` | `C:\Users\<user>\AppData\Roaming\ai.opencode.desktop\cli\2.2.5-x64\opencode-cli.exe` | **SUDAH** diobservasi |
| Sumber versi | Nama folder + `D:\Hyper AI\Engine\resources\opencode-cli.version` = `2.1.10` | Nama folder = `2.2.5` (tidak ada `resources/opencode-cli.version` di paket OpenCode desktop) | **SUDAH** |
| Menangani service loopback saat ini | Ya — PID `18912`, `serve --service`, port `28894` | Tidak teramati sebagai service | **SUDAH** (observasi 1 Nov 2026) |
| `api --help` (flag `--server`, `--header`, `--param`) | **BELUM** diverifikasi | **SUDAH** (hanya bantuan CLI) | Help 2.2.5 dibaca; help 2.1.10 belum |
| Mekanisme auth | **BELUM** | **BELUM** | Tidak diklaim |
| Skema `/openapi.json` | **BELUM** (401) | **BELUM** | Tidak diklaim |
| Ketersediaan `/api/info`, `/api/config`, `/api/agent` | **BELUM** | **BELUM** | Tidak diklaim |
| Format error/timeout | **BELUM** | **BELUM** | Lihat §7 |

**Keputusan kontrak:** versi yang melayani port adalah **2.1.10** berdasarkan bukti folder + proses, **bukan** versi server yang terbukti. Semua pemanggilan kontrak harus memakai biner yang sama dengan `ExecutablePath` proses yang ditemukan, agar perilaku yang diuji sama dengan yang melayani port.

## 7. Format error dan timeout

Belum ada satu pun respons sukses dari API, sehingga format error server **tidak boleh diklaim**. Yang ditetapkan sekarang adalah kontrak sisi Hub:

1. **Timeout** wajib eksplisit pada setiap pemanggilan (nilai ditetapkan saat implementasi, bukan default infinit). Melewati batas → status `timeout`, bukan menggantung.
2. **401/403** → `auth_failed`. Tidak retry otomatis. Tidak mencoba kredensial lain.
3. **404** → `endpoint_unavailable`. Tidak retry dengan path alternatif.
4. **5xx** → `server_error`, simpan status + potongan body tereduksi.
5. **Koneksi ditolak / port hilang** (service mati) → `service_unavailable`, job gagal dengan pesan jelas (sesuai exit criteria Fase 0), bukan menggantung.
6. **Respons bukan JSON** (mis. halaman HTML) → `invalid_response`; ini sinyal path bukan endpoint API.
7. **Error selalu terstruktur:** `{ code, status, endpoint, processId, port, timeoutMs, messageRedacted, checkedAtUtc }`. Tanpa header auth, tanpa body mentah.
8. Retry: maksimum 1 retry dengan backoff untuk `service_unavailable` dan 5xx; `auth_failed`, `endpoint_unavailable`, `invalid_response` **tidak** di-retry.
9. Exit code skrip kontrak: `0` sukses, `2` data tidak valid/klaim tak terdukung, `1` salah penggunaan — sama dengan `Hyper-Hub-VersionCheck.ps1`.

**Status:** kontrak ini **SUDAH** ditetapkan sebagai aturan Hub, tetapi **BELUM** diuji terhadap server nyata.

## 8. Daftar bukti yang harus disimpan

Setiap kali kontrak diuji, simpan satu berkas bukti (JSON) di luar repo bila memuat data sensitif:

| Field | Isi | Sensitif? |
|---|---|---|
| `checkedAtUtc` | Waktu UTC | Tidak |
| `processId`, `process`, `executable` | Proses service | Tidak |
| `address`, `port` | Loopback listener | Tidak |
| `installedVersion`, `installedVersionSource` | Versi biner terpasang + asal (`folder-name`/`version-file`) | Tidak |
| `serverVersion`, `serverVersionProof` | Hanya terisi bila berasal dari respons server | Tidak |
| `authMechanism` | Nama mekanisme (`opencode api`, `OPENCODE_PASSWORD`) | Tidak |
| `authResult` | `untested` / `success` / `auth_failed` | Tidak |
| `endpoints[]` | `{ endpoint, status, contentType, schemaHash, redactedFields }` | Terdeduksi |
| `errorSamples[]` | Satu contoh per kelas error (§7), tereduksi | Terdeduksi |
| `cliVersionUsed` | Versi biner yang dipakai untuk memanggil | Tidak |
| `operator`, `gitLikeHashOfScripts` | Siapa & versi skrip (workspace bukan repo git → hash SHA-256 file) | Tidak |

Larangan bukti: header `Authorization`/cookie, body mentah yang memuat secret, isi credential store, path ke file secret.

## 9. Ringkasan gap yang masih terbuka

1. Mekanisme auth resmi 2.1.10 (flag/env) belum diketahui dan belum diuji.
2. Isi `/openapi.json` (skema) belum terlihat.
3. Keberadaan `/api/info`, `/api/config`, `/api/agent` belum diverifikasi.
4. Format error/timeout server belum diamati.
5. Stabilitas port setelah restart service belum diuji.
6. `api --help` 2.1.10 belum dibandingkan dengan 2.2.5.
7. Belum ada keputusan owner bahwa gate auth/versi lulus.

Sampai poin 1–4 dan 7 selesai, kontrak ini **belum** membuka pembuatan connector, plugin bridge, atau job execution.

## Gate manusia

| human_gate_id | status | blocks_hats | keterangan |
|---------------|--------|-------------|------------|
| HG-AUDIT-R1 | pending | 30 | Review owner sebelum dipakai sebagai dasar implementasi |
