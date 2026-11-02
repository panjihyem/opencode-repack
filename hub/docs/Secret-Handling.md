# Secret Handling — aturan penyimpanan kredensial Hyper Hub

| Zona data | regular |
|-----------|---------|
| Status | draft, belum disetujui owner |
| Tanggal | 1 November 2026 |
| Backlog | B-03 (secret store), M-01 (bukti) |
| Terkait | ADR-007 (`secret_ref` di connector registry), `docs/Service-Contract.md` (§4, §8), `docs/Hyper-Hub-Threat-Model.md` |

## Tujuan

Menetapkan aturan penyimpanan, rotasi, dan redaksi kredensial Hyper Hub tanpa pernah menuliskan secret.

## Lingkup

- Aturan dasar, opsi penyimpanan (DPAPI, file ACL, env sesi), `secret_ref`, rotasi, redaksi saat error.

## Di luar lingkup

- Implementasi secret store (belum ada) dan kredensial nyata.

## Jalur kegagalan

- Secret tidak tersedia atau gagal didekripsi -> eksekusi diblokir, bukan memakai fallback plaintext.

## Kriteria penerimaan

- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub-ContractCheck.ps1`

Dokumen ini **tidak memuat secret asli** dan tidak boleh ditambahi contoh secret yang valid. Contoh di bawah memakai placeholder.

## 1. Aturan dasar (tidak bisa dinegosiasikan)

| # | Aturan | Alasan |
|---|---|---|
| 1 | Secret **tidak** di repo / workspace / `docs/` | Workspace disinkronkan OneDrive; bukan repo git, jadi tidak ada `.gitignore` sebagai jaring |
| 2 | Secret **tidak** di log (`audit.jsonl`, stdout/stderr, log runner) | Audit adalah berkas yang dibagikan saat investigasi |
| 3 | Secret **tidak** di CSV / ekspor / laporan | Mudah tersebar lewat lampiran |
| 4 | Secret **tidak** di prompt model (lokal maupun cloud) | Prompt = egress; melanggar pemisahan zona (ADR-004) |
| 5 | Secret **tidak** di `state.json` / spec job / connector registry | State bisa ditulis ulang admin lokal dan ikut backup |
| 6 | Secret **tidak** di `CommandLine` proses anak | `Win32_Process.CommandLine` bisa dibaca proses lain sesama user |
| 7 | Yang disimpan di konfigurasi hanya **referensi** (`secret_ref`), bukan nilai | ADR-007 |
| 8 | Secret tidak pernah dicetak utuh ke output non-interaktif | Cegah eksfiltrasi lewat console capture |

Konsekuensi: `Hyper-Hub.ps1` saat ini **tidak** menyimpan atau membaca secret apa pun, dan itu tidak boleh berubah tanpa dokumen ini disetujui serta ada uji terpisah.

## 2. Opsi penyimpanan

### A. DPAPI per user (`System.Security.Cryptography.ProtectedData`)

- Mekanisme: `[Security.Cryptography.ProtectedData]::Protect($bytes, $null, 'CurrentUser')` → blob biner; buka dengan `Unprotect`.
- Cakupan: hanya bisa dibuka oleh user Windows yang sama, di profil yang sama.
- Kekuatan nyata: mengikat ciphertext ke identitas user. Siapa pun yang berjalan sebagai user itu (termasuk proses lain sesama user, malware user-mode) **bisa** membuka blob.
- Lokasi blob: `%LOCALAPPDATA%\HyperHub\secrets\<ref>.bin` (bukan OneDrive, bukan repo), dengan ACL ketat.
- Kelebihan: tanpa secret di kode/state; ciphertext aman dibaca tanpa user (tidak berguna); stdlib .NET Framework (tersedia di PS 5.1).
- Kekurangan: tidak portabel antar mesin/user; tidak ada audit akses; rotasi manual; tidak melindungi dari proses sesama user.
- Status di mesin ini: **BELUM diuji** bahwa `ProtectedData` bisa dipanggil dari PowerShell 5.1 (kemungkinan butuh `Add-Type -AssemblyName System.Security`). Bukti wajib sebelum dipakai.

### B. File ACL ketat (tanpa enkripsi)

- Mekanisme: file di `%LOCALAPPDATA%` (bukan OneDrive), ACL hanya user saat ini (`icacls` / `Set-Acl`), mewarisi dimatikan.
- Kelebihan: paling sederhana, mudah diaudit manual, mudah dicadangkan.
- Kekurangan: plaintext di disk; admin lokal/backup/antivirus/EDR bisa membaca; tidak ada perlindungan nyata bila disk dicuri tanpa BitLocker.
- Layak hanya untuk token berisiko rendah dan berumur pendek.

### C. Env var sesi (in-memory per proses)

- Mekanisme: variabel lingkungan yang hanya diset pada proses runner (bukan user/system scope), diteruskan eksplisit ke proses anak yang perlu.
- Kelebihan: tidak ada secret di disk; hilang saat proses berhenti.
- Kekurangan: `Win32_Process` tidak mengekspos env, tapi proses anak **mewarisi** env (dan siapa pun yang bisa membaca memory proses bisa mengambilnya); sumber pengisian env tetap butuh di mana disimpan → biasanya A atau B; tidak aman untuk tugas terjadwal yang menjalankan proses baru tanpa sumber.
- Peran yang tepat: **transport**, bukan penyimpanan.

### Perbandingan

| Kriteria | A. DPAPI | B. File ACL | C. Env sesi |
|---|---|---|---|
| At-rest terenkripsi | Ya (terikat user) | Tidak | N/A (tidak at-rest) |
| Bisa bocor lewat OneDrive | Tidak (di `%LOCALAPPDATA%`) | Tidak (bila lokasi benar) | Tidak |
| Terbaca proses sesama user | Ya | Ya | Ya |
| Terbaca admin lokal | Bisa | Ya | Bisa |
| Portabel antar mesin | Tidak | Ya (plaintext) | Tidak |
| Kompleksitas implementasi | Sedang | Rendah | Rendah |
| Kecocokan PS 5.1 | Perlu verifikasi | Ya | Ya |
| Audit akses | Tidak ada | Tidak ada | Tidak ada |
| Cocok untuk | Default MVP | Token risiko rendah | Transport ke proses anak |
| Status | **BELUM diuji** | Belum ada di Hub | Belum ada di Hub |

**Rekomendasi (belum disetujui):** A sebagai penyimpanan default, C hanya sebagai transport proses, B hanya bila secret memang berisiko rendah dan berumur pendek. Pindah ke Windows Credential Manager dipertimbangkan bila butuh integrasi UI/rotasi; evaluasi terpisah.

## 3. Aturan implementasi penyimpanan

1. Lokasi wajib di `%LOCALAPPDATA%\HyperHub\secrets\`, **bukan** `OneDrive`, bukan workspace, bukan `%APPDATA%` roaming.
2. Nama file = `secret_ref` divalidasi `^[a-z0-9][a-z0-9._-]{0,63}$`; tidak boleh path traversal.
3. Direktori dibuat dengan ACL: hanya user saat ini (Full) + `SYSTEM` (bila runner sebagai service), inheritance dimatikan.
4. Nilai secret dibaca **tepat sebelum dipakai**, lalu dibuang (`$null` di variabel setelah pemakaian) — mengurangi jendela eksposur.
5. Tidak ada cache panjang; tidak ada penulisan ulang ke file lain (mis. temp), karena `Write-Atomic` di `Hyper-Hub.ps1` menulis plaintext ke temp sebelum rename.
6. Secret tidak pernah masuk state, audit, atau spec. Audit hanya mencatat `secret_ref` dan hasil (`present`/`missing`).
7. Bila `secret_ref` tidak ditemukan → fail-closed (`secret_unavailable`), bukan fallback kosong/default.

## 4. Rotasi

1. Rotasi = tulis nilai baru ke lokasi yang sama dengan nama **baru** (`secret_ref.2`), ubah konfigurasi connector ke ref baru, baru hapus ref lama setelah satu siklus sukses.
2. Rotasi dipicu oleh: kebocoran yang dicurigai, pergantian user Windows, ekspor backup yang tidak terlindungi, perubahan connector `validated` → revisi.
3. Setiap rotasi dicatat di audit sebagai event `secret.rotated` dengan `secret_ref` saja (tanpa nilai), `previousRef`, `reason`.
4. Tidak ada rotasi otomatis berdasarkan waktu di MVP; rotasi terjadwal masuk backlog terpisah.
5. Bila rotasi melibatkan dua sistem (mis. service + connector), urutan: siapkan ref baru → verifikasi → putus ref lama → cabut token lama di sumber.

## 5. Redaksi saat error

Aturan redaksi wajib diterapkan **sebelum** string apa pun ditulis ke log, audit, console, atau dikirim ke model.

1. Pola yang wajib dihapus: nilai header `authorization`, `cookie`, `set-cookie`, `x-api-key`; query param `token`, `password`, `key`, `secret`, `apikey`; isi `OPENCODE_PASSWORD`.
2. Bentuk redaksi: `[REDACTED:<nama-field>:<len>]` — menyimpan panjang bila berguna untuk diagnosis, **bukan** awalan nilai.
3. Panjang pendek (< 9 karakter) tidak boleh dilewati walau hanya sebagian; selalu redaksi penuh.
4. Body respons dan pesan exception harus lewat filter yang sama; tidak ada jalur "raw body untuk debugging" yang permanen.
5. Error API yang menyertakan header permintaan di echo (hal umum) tetap diredaksi.
6. Bila sistem tidak yakin suatu string memuat secret → redaksi. Salah redaksi lebih murah daripada kebocoran.

## 6. Yang dilarang dalam bukti/pelaporan

- Menyalin isi `%LOCALAPPDATA%\HyperHub\secrets\` ke repo, CSV, atau laporan.
- Menyimpan respons API yang belum diredaksi.
- Mencetak `OPENCODE_PASSWORD` untuk memverifikasi bahwa ia terbaca (uji dengan boolean `present`, bukan nilai).
- Menyertakan token di URL (query string) karena akan muncul di log proxy dan history.

## 7. Gap yang masih terbuka

1. `ProtectedData` belum diuji dapat dipanggil dari PowerShell 5.1 di mesin ini.
2. Integrasi `secret_ref` ke connector registry dan kode `Hyper-Hub.ps1` belum ada (ADR-007 masih `proposed`).
3. Filter redaksi belum diimplementasi; belum ada uji string dengan pola sensitif.
4. Belum ada keputusan apakah runner berjalan sebagai user interaktif atau layanan (mempengaruhi ACL `SYSTEM`).
5. Belum ada prosedur backup untuk blob DPAPI (bagaimana restore setelah reinstall OS).

## Gate manusia

| human_gate_id | status | blocks_hats | keterangan |
|---------------|--------|-------------|------------|
| HG-AUDIT-R1 | pending | 30 | Review owner sebelum dipakai sebagai dasar implementasi |
