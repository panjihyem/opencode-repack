# Runbook — Hyper Hub (prototipe)

| Zona data | regular |
|-----------|---------|
| Status task | backlog `B-08`. |
| Berlaku untuk | `Hyper-Hub.ps1`, `Hyper-Hub-SelfCheck.ps1`, `Hyper-Hub-ContractCheck.ps1`, `Hyper-Hub-SpecCheck.ps1` di root proyek. |
| Lingkungan | Windows, PowerShell 5.1. |

## Tujuan

Menyediakan prosedur operasi nyata untuk prototipe Hyper Hub: status, backup, restore, verifikasi audit, dan rollback.

## Lingkup

- Perintah yang benar-benar ada, lokasi state, backup/restore, penanganan audit rusak, rollback konfigurasi.

## Di luar lingkup

- Eksekusi job, scheduler, daemon start/stop: belum aktif.

## Jalur kegagalan

- Audit rusak atau state tidak konsisten -> STOP, jangan `init` ulang, eskalasi ke owner.

## Kriteria penerimaan

- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub.ps1 audit` dan `.\Hyper-Hub-SelfCheck.ps1`

---

## 0. PERINGATAN STATUS — baca sebelum apa pun

**Eksekusi job belum aktif.** Kondisi nyata per 2026-11-01 (dibaca dari `Hyper-Hub.ps1`):

| Perintah | Perilaku sebenarnya |
|---|---|
| `init` | Membuat `.hyper-hub`, `state.json`, `audit.jsonl` kosong. Idempoten. |
| `status` | Membaca state + memverifikasi hash chain audit. Tidak mengubah apa pun. |
| `discover` | Membaca listener TCP loopback + proses `opencode-cli.exe`/`Hyper AI.exe` yang berjalan dengan `serve --service`. **Tidak** membuat state, **tidak** membuka jaringan keluar. |
| `policy-check` | Mengembalikan keputusan statis. **`executable` selalu `false`** - ini penilai policy, bukan penegak. Operasi `browser.navigate` wajib menyertakan `-Origin <url>`; nilai dari berkas `browser-origin-policy.json` di root Hub. |
| `health` | Ringkasan baca-saja: status init, validitas rantai audit, apakah lock bebas, hitungan job (total/aktif/dijeda/jatuh tempo/jadwal tak valid), dan `nextRunUtc` terdekat. Antrean dan approval selalu `0` selama runner dimatikan. |
| `remote -Sub channels` | Daftar kanal jarak jauh dan statusnya. `telegram` = `implemented`; `whatsapp` = `planned` (belum ada kode, backlog E-05/E-06). |`n| `remote -Sub status -Channel telegram` | Status kanal: terpasang, terkonfigurasi, User ID yang diizinkan, versi server, model. **Token tidak pernah dicetak.** |
| `remote -Sub setup -Channel telegram -OwnerId <id> -ModelProvider <p> -ModelId <m>` | Tulis `.env` kanal. Token dan password dibaca lewat prompt tersembunyi, **bukan** parameter. |
| `remote -Sub clear -Channel telegram` | Kosongkan token dan password di `.env`, tanpa menghapus pengaturan lain. |
| `tick` | Mengambil `runner.lock`, memverifikasi audit, lalu mencetak `Runner disabled: connector registry and reviewed job schema not implemented.` **Tidak ada job yang dijalankan.** |
| `tick -DryRun` | Sama sampai verifikasi audit, lalu melaporkan job yang jatuh tempo: `{"mode":"dry-run","due":[...],"launched":0,"executable":false}`. **Tidak ada job yang dijalankan** dan state tidak diubah. |
| `audit` | Memverifikasi hash chain, mencetak isi `audit.jsonl`, lalu `Audit chain valid.` |
| `jobs` | Mendaftar job tersimpan (id, nama, zona, cron, enabled, `nextRunUtc`). Baca-saja. |
| `schedule` | Mendaftar jadwal semua job (`timeZoneId: Asia/Jakarta`). `schedule -Id <id>` menghitung ulang `nextRunUtc` job itu dan mencatat `job.scheduled` ke audit. |
| `add` | Memvalidasi dan **menyimpan** job (id, nama, zona, cron, action, resource). Mencatat `job.added`; `executable` tetap `false`. **Tidak menjalankan apa pun.** |
| `pause`/`resume` | Mengubah flag `enabled` job; `resume` menghitung ulang `nextRunUtc`. Dicatat ke audit. |
| `remove` | Menghapus job dari state; dicatat `job.removed`. |
| `run` | **Selalu gagal** — `Manual run disabled`. |
| `self-check` | Uji di direktori temp: hash chain valid, tamper terdeteksi, dan perhitungan jadwal cocok dengan cron. |
| `discover`/`policy-check` | Berjalan tanpa perlu `init`. |

Contoh menyimpan job (tidak dieksekusi):

```
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub.ps1 add -Id jdih-sync -Name "Sinkron JDIH" -Zone regular -Cron "30 9 * * *" -Action external.fetch -Resource jdih.go.id
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub.ps1 add -Id rekap -Name "Rekap" -Zone regular -EveryMinutes 15 -Action local.render -Resource out\rekap.md
```

Zona wajib `case` atau `regular`; bila `-Zone` dihilangkan, **default `case`** (paling ketat). Cron 5 field (`menit jam hari bulan minggu`), waktu Jakarta, `-EveryMinutes <n>` jalan pintas interval. Batas field, aturan `*/n`, Minggu `0`/`7`, dan syarat pembagian `-EveryMinutes` ada di `docs/JobSpec.md` § "Semantik cron dan `-EveryMinutes`". Ringkasnya: `7` ditolak, `90` jadi `0 */2 * * *`, `1440` jadi `0 0 * * *`, dan `0 8 * * 7` sama dengan `0 8 * * 0`.

Artinya: perintah **start/stop** di dokumen ini adalah start/stop *pemeriksaan* Hyper Hub, bukan start/stop eksekusi job. Tidak ada daemon, service, atau scheduler yang perlu dinyalakan atau dimatikan.

Kontrak fail-closed yang berlaku (jangan dilanggar):

- State hilang padahal `audit.jsonl` ada → **tolak** jalankan (`State missing while audit exists`).
- Format state tidak valid / job ID duplikat → **tolak**.
- Audit rusak → **tolak** semua perintah yang menyentuh state (`status`, `init`, `tick`, `audit`, append audit).
- `audit.jsonl` hilang padahal `state.json` ada → `init` **tidak** membuat ulang audit; tetap menolak.

---

## 1. Lokasi state

Root default: `$PWD\.hyper-hub` pada saat skrip dipanggil. Ganti dengan `-Root <path>` bila perlu.

| Berkas | Isi | Sensitivitas |
|---|---|---|
| `.hyper-hub\state.json` | `{ version: 1, jobs: [], runs: [], lastAuditHash }` | Sedang — jangan diedit tangan |
| `.hyper-hub\audit.jsonl` | Satu record JSON per baris, chained `previousHash` → `hash` (SHA-256) | Sedang — bukti integritas |
| `.hyper-hub\runner.lock` | Berkas lock kosong; dibuka dengan `FileShare.None` saat `init`/`tick` | Tidak |

Field record audit (urutan bersifat kontrak, diverifikasi `Test-Audit`):

```
timestamp, event, jobId, decision, result, previousHash, hash
```

`hash = SHA256(canonical JSON dari 6 field pertama, kompres)`. Hash pertama berantai dari `'0' * 64`.

### Standar pengecekan

```powershell
cd "C:\Users\<user>\OneDrive\Documents\Default Project"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub.ps1 status
```

Keluaran sukses (JSON):

```json
{"root":"...", "jobs":0, "enabled":0, "successfulRuns":0, "failedRuns":0, "lastAuditHash":"0000...0000"}
```

Keluaran validasi audit panjang:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub.ps1 audit
```

---

## 2. START

Tidak ada proses yang perlu dinyalakan. "Start" = menyiapkan root state dan memastikan rantai audit bersih.

Urutan, jalankan satu per satu:

1. Pastikan tidak ada runner aktif. Cek tidak ada proses `powershell.exe` yang menjalankan `Hyper-Hub.ps1 tick`:

   ```powershell
   Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" |
     Where-Object { $_.CommandLine -match 'Hyper-Hub\.ps1\s+tick' } |
     Select-Object ProcessId, CommandLine
   ```

   Hasil kosong = tidak ada runner.

2. Inisialisasi (idempoten):

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub.ps1 init
   ```

   Pada root baru: mencetak status dengan `lastAuditHash` = 64 nol.
   Pada root yang sudah ada: tidak menimpa state maupun audit; hanya memverifikasi.

3. Verifikasi:

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub.ps1 status
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub.ps1 audit
   ```

   `status` harus keluar kode 0 dan `audit` harus diakhiri `Audit chain valid.`

4. Inventaris lingkungan (opsional, read-only):

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub.ps1 discover
   ```

   Jika pengguna memakai data perkara, sekaligus cek policy:

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub.ps1 policy-check -Zone case -Operation local.status
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub.ps1 policy-check -Zone case -Operation external.send
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub.ps1 policy-check -Zone case -Operation browser.navigate -Origin https://jdih.go.id
   ```

   Harapan: yang pertama `"decision":"allow"`, yang kedua dan ketiga `"decision":"deny"` kecuali origin ada di allowlist zona itu. Semua `"executable":false`.

   Ringkasan kesehatan satu layar:

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub.ps1 health
   ```

   `auditChain` harus `valid`; `invalidSchedule` harus `0`. `queue.pending` dan `approvals.pending` selalu `0` karena runner dan approval broker belum ada.

   Bot Telegram — konfigurasi lewat Hub, token tidak pernah lewat argumen perintah:

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub.ps1 remote -Sub channels
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub.ps1 remote -Sub status -Channel telegram`npowershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub.ps1 remote -Sub setup -Channel telegram -OwnerId <ID> -ModelProvider <provider> -ModelId <model>
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub.ps1 remote -Sub clear -Channel telegram
   ```

   **Allowlist wajib.** `-OwnerId` harus diisi dan berupa angka (5-20 digit); tanpa itu `setup` gagal sebelum menulis `.env`. Nilai ditulis ke `TELEGRAM_ALLOWED_USER_ID` (bridge grinev) **dan** `TELEGRAM_ALLOWED_USERS` (opencode-chat-bridge). Allowlist kosong = tolak semua, bukan izinkan semua.`n`n`setup` menanyakan token bot dan password service lewat prompt tersembunyi. **Jangan** menaruh token sebagai argumen: argumen perintah tersimpan di riwayat shell dan log sesi. `.env` ditulis dengan ACL hanya pemilik, di `%LOCALAPPDATA%\HyperHub\remote-<kanal>\.env` (bukan OneDrive), saat ini `remote-telegram`.

   Untuk `browser.navigate`, buat berkas `browser-origin-policy.json` di root Hub lebih dulu (format dan aturan di `docs/Browser-Origin-Policy.md`). Berkas tidak ada atau rusak ⇒ semua origin `deny` dengan alasan `policy tidak terbaca`.

---

## 3. STOP

Tidak ada proses persisten. "Stop" = memastikan tidak ada runner memegang lock.

1. Cek runner seperti langkah START-1.
2. Jika ada dan memang harus dihentikan, hentikan hanya proses itu:

   ```powershell
   Stop-Process -Id <ProcessId> -WhatIf   # tinjau dulu
   Stop-Process -Id <ProcessId>           # baru jalankan
   ```

   Ini menghentikan pemeriksaan, bukan job — karena tidak ada job yang diluncurkan.
3. `runner.lock` boleh tertinggal sebagai berkas kosong. Lock hanya dicek saat dibuka; berkas yang ada **tidak** menghalangi `init`/`tick` berikutnya. Jangan menghapus `runner.lock` sebagai "perbaikan" — itu tidak menyelesaikan apa pun.

Stop darurat bila `tick` menggantung: hentikan proses PowerShell-nya. Aman — `tick` tidak menulis state dan tidak menambah audit.

---

## 4. STATUS (ringkas)

| Yang diperiksa | Perintah | Hasil wajar |
|---|---|---|
| Rantai audit + jumlah job/run | `.\Hyper-Hub.ps1 status` | exit 0, JSON status |
| Isi audit per baris | `.\Hyper-Hub.ps1 audit` | exit 0, diakhiri `Audit chain valid.` |
| Self-test skrip (temp) | `.\Hyper-Hub-SelfCheck.ps1` | `Hyper Hub self-check passed.` |
| Kontrak fail-closed | `.\Hyper-Hub-ContractCheck.ps1` | `Hyper Hub contract checks passed.` |
| Gate spec | `.\Hyper-Hub-SpecCheck.ps1 -SelfCheck` | `Spec gate self-check passed.` |
| Gate spec untuk berkas | `.\Hyper-Hub-SpecCheck.ps1 -Spec <file.md>` | exit 0 = `allow`; exit 2 = `block` |

`Hyper-Hub-ContractCheck.ps1` memakan waktu lebih lama (menyalakan beberapa proses `powershell.exe` secara berurutan) dan memakai direktori temp miliknya sendiri — **tidak** menyentuh `.hyper-hub` nyata.

Semua pemeriksaan di atas boleh dijalankan kapan saja; tidak satu pun menulis ke root nyata kecuali `init` (yang idempoten) dan `tick` (yang tidak menulis apa pun).

---

## 5. BACKUP

Prasyarat: **tidak ada runner** memegang lock, dan tidak ada perintah `init`/`tick` berjalan. Langkah START-1 wajib menghasilkan daftar kosong.

Menyalin `state.json` dan `audit.jsonl` secara terpisah saat `tick` berjalan dapat menghasilkan pasangan yang tidak konsisten (audit bertambah setelah state disalin, atau sebaliknya). Karena itu backup dilakukan saat diam.

1. Verifikasi prasyarat:

   ```powershell
   Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" |
     Where-Object { $_.CommandLine -match 'Hyper-Hub\.ps1\s+(tick|init)' } |
     Select-Object ProcessId, CommandLine
   ```

   Harus kosong. Jika tidak kosong: tunggu atau hentikan sesuai bagian STOP.

2. Verifikasi integritas sebelum menyalin:

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub.ps1 audit | Select-Object -Last 1
   ```

   Harus `Audit chain valid.` Jangan backup rantai yang sudah rusak tanpa mencatat bahwa itu rusak.

3. Buat backup dengan perintah Hub (satu tangkapan + manifest + verifikasi rantai):

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub.ps1 backup -Root "$env:LOCALAPPDATA\HyperHub\state" -BackupPath ".\backups\hyper-hub-$((Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ'))"
   ```

   Perintah menolak backup bila rantai audit rusak, menulis `SHA256SUMS.json`, dan menolak
   folder tujuan di dalam root state. Salin manual di bawah hanya bila `backup` tidak tersedia:

   ```powershell
   $stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
   $dst = ".\backups\hyper-hub-$stamp"
   New-Item -ItemType Directory -Path $dst -Force | Out-Null
   Copy-Item -LiteralPath .\.hyper-hub\state.json   -Destination $dst -Force
   Copy-Item -LiteralPath .\.hyper-hub\audit.jsonl  -Destination $dst -Force
   ```

   `runner.lock` tidak perlu disalin — berkas kosong, tidak membawa informasi.

4. Catat sidik jari agar restore bisa diverifikasi:

   ```powershell
   Get-FileHash -Algorithm SHA256 -LiteralPath .\.hyper-hub\state.json, .\.hyper-hub\audit.jsonl |
     ForEach-Object { "$($_.Hash)  $([System.IO.Path]::GetFileName($_.Path))" } |
     Set-Content -LiteralPath (Join-Path $dst 'SHA256SUMS.txt') -Encoding ASCII
   ```

   Simpan `SHA256SUMS.txt` bersama backup. Tanpa itu, restore tidak bisa dibedakan dari pemulihan berkas yang sudah rusak.

5. Jangan menaruh backup di dalam `.hyper-hub` — folder itu dikelola skrip.

---

## 6. RESTORE

Prasyarat: tidak ada runner (sama seperti backup). Restore menimpa state dan audit sekaligus - **jangan** memulihkan hanya salah satunya.

Jalur utama memakai perintah Hub, yang memverifikasi checksum sebelum menimpa dan
mengembalikan state lama bila verifikasi pasca-restore gagal:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub.ps1 restore -Root "$env:LOCALAPPDATA\HyperHub\state" -BackupPath ".\backups\hyper-hub-<stamp>"
```

Prosedur manual di bawah hanya untuk keadaan darurat saat perintah tidak bisa dipakai.

1. Hentikan runner (bagian STOP) dan pastikan kosong.
2. Pindahkan root saat ini ke tempat aman (jangan hapus, agar bisa diperiksa):

   ```powershell
   $stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
   Move-Item -LiteralPath .\.hyper-hub -Destination ".\backups\hyper-hub-before-restore-$stamp"
   ```

3. Siapkan root baru:

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub.ps1 init
   ```

   `init` di root kosong membuat `state.json` + `audit.jsonl` kosong.

4. Timpa **kedua** berkas dengan isi backup:

   ```powershell
   $src = ".\backups\hyper-hub-<stamp>"
   Copy-Item -LiteralPath (Join-Path $src 'state.json')  -Destination .\.hyper-hub\state.json  -Force
   Copy-Item -LiteralPath (Join-Path $src 'audit.jsonl') -Destination .\.hyper-hub\audit.jsonl -Force
   ```

5. Verifikasi sidik jari berkas terhadap `SHA256SUMS.txt`:

   ```powershell
   Get-FileHash -Algorithm SHA256 -LiteralPath .\.hyper-hub\state.json, .\.hyper-hub\audit.jsonl |
     ForEach-Object { "$($_.Hash)  $([System.IO.Path]::GetFileName($_.Path))" }
   Get-Content -LiteralPath (Join-Path $src 'SHA256SUMS.txt')
   ```

   Harus identik. Jika berbeda, restore gagal — ulangi dari langkah 3.

6. Verifikasi rantai audit:

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub.ps1 audit
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub.ps1 status
   ```

   Syarat lulus:
   - `audit` keluar 0 dan diakhiri `Audit chain valid.`
   - `status` keluar 0.
   - `lastAuditHash` pada `status` **sama persis** dengan `hash` pada baris terakhir `audit.jsonl`. `Test-Audit` membandingkan keduanya, jadi ketidakcocokan = rantai rusak walaupun tiap baris benar.

7. Uji regresi cepat (memakai temp, tidak menyentuh root):

   ```powershell
   .\Hyper-Hub-SelfCheck.ps1
   ```

Bila backup berisi `audit.jsonl` kosong dan `lastAuditHash` 64 nol: itu kondisi awal sah — `audit` akan mencetak `Audit chain valid.` tanpa baris record. Normal.

---

## 7. Bila audit rusak — STOP, jangan `init` ulang

Gejala: pesan `AUDIT INVALID: ...` dari `status`, `tick`, `audit`, `init`, atau `Add-Audit`.

### Aturan

1. **STOP.** Jangan jalankan `init`, jangan edit `audit.jsonl`, jangan edit `state.json`, jangan hapus `.hyper-hub`.
2. **Jangan membuat ulang root.** Root baru akan kehilangan bukti, dan `init` pada root yang auditnya rusak memang sengaja menolak — memaksa lewat dengan menghapus folder = menghancurkan bukti.
3. **Eskalasi** ke pemilik sistem/auditor dengan bukti sebelum tindakan lain.
4. Perlakuan audit rusak = **insiden integritas**, bukan gangguan biasa. Perlakukan seperti bukti yang mungkin telah dimanipulasi.

### Yang boleh dilakukan (read-only, hanya untuk melapor)

```powershell
# jangan mengembalikan berkas ke root aslinya; baca dari salinan
$stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$diag = ".\backups\incident-$stamp"
New-Item -ItemType Directory -Path $diag -Force | Out-Null
Copy-Item -LiteralPath .\.hyper-hub\state.json  -Destination $diag -Force -ErrorAction SilentlyContinue
Copy-Item -LiteralPath .\.hyper-hub\audit.jsonl -Destination $diag -Force -ErrorAction SilentlyContinue
```

Lalu kumpulkan: baris keberapa gagal, apakah galat menyebut `hash chain broken` atau `state head mismatch`, jumlah baris `audit.jsonl`, dan `lastAuditHash` di `state.json`. Sertakan sidik jari SHA-256 kedua berkas. Jangan menafsirkan penyebab di luar bukti.

### Yang DILARANG

- `Remove-Item .\.hyper-hub` lalu `init`.
- Menghapus baris terakhir `audit.jsonl` "supaya lolos".
- Menyalin `lastAuditHash` dari audit ke `state.json` (atau sebaliknya) sebagai jalan pintas.
- Menimpa state dengan state dari root lain.

Satu-satunya jalan pulih yang sah: **restore dari backup terverifikasi** (bagian 6), dan itu pun harus dicatat sebagai insiden lengkap dengan alasan dan otorisasi tertulis.

---

## 8. UPGRADE

Prasyarat: tidak ada runner. Backup wajib dibuat lebih dulu (bagian 5).

Upgrade saat ini berarti mengganti berkas `Hyper-Hub*.ps1` dengan versi baru. Skema state adalah **`version = 1`**; skrip lama menolak state yang `version`-nya bukan 1. Upgrade yang mengubah `version` **wajib** disertai migrasi — tidak ada otomatis.

1. Backup (bagian 5) + catat `lastAuditHash`.
2. Rekam versi skrip yang sekarang dipakai (tidak ada nomor versi formal di berkas, jadi pakai sidik jari):

   ```powershell
   Get-FileHash -Algorithm SHA256 .\Hyper-Hub.ps1, .\Hyper-Hub-SelfCheck.ps1, .\Hyper-Hub-ContractCheck.ps1, .\Hyper-Hub-SpecCheck.ps1 |
     ForEach-Object { "$($_.Hash)  $([System.IO.Path]::GetFileName($_.Path))" } |
     Set-Content -LiteralPath .\backups\hyper-hub-scripts-before-upgrade.txt -Encoding ASCII
   ```

3. Ganti berkas skrip sesuai prosedur proyek (di luar dokumen ini).
4. Jalankan gate:

   ```powershell
   .\Hyper-Hub-SelfCheck.ps1
   .\Hyper-Hub-ContractCheck.ps1
   .\Hyper-Hub-SpecCheck.ps1 -SelfCheck
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub.ps1 status
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub.ps1 audit
   ```

   Semua harus lulus **sebelum** `init`/`tick` dijalankan terhadap root nyata.
5. Bandingkan `lastAuditHash` pada `status` dengan nilai yang dicatat di langkah 1. Harus sama — upgrade skrip tidak boleh menyentuh rantai.

---

## 9. ROLLBACK

Bila upgrade gagal gate, atau perilaku berubah:

1. Pastikan tidak ada runner.
2. Kembalikan berkas skrip ke versi sebelum upgrade. Gunakan salinan yang disimpan saat upgrade; jangan menyalin dari mesin lain. Verifikasi terhadap `hyper-hub-scripts-before-upgrade.txt`:

   ```powershell
   Get-FileHash -Algorithm SHA256 .\Hyper-Hub.ps1, .\Hyper-Hub-SelfCheck.ps1, .\Hyper-Hub-ContractCheck.ps1, .\Hyper-Hub-SpecCheck.ps1 |
     ForEach-Object { "$($_.Hash)  $([System.IO.Path]::GetFileName($_.Path))" }
   ```

3. Jalankan ulang gate langkah 8-4.
4. **State tidak perlu di-rollback** jika gate lulus dan `lastAuditHash` tidak berubah. Audit hanya bertambah ketika ada event ditulis, dan selama ini hanya `self-check` (di temp) yang menulis audit — root nyata tidak bertambah.
5. Jika upgrade ternyata menulis ke root nyata: restore state dari backup bagian 5 sesuai bagian 6, dan catat sebagai insiden.

### Rollback perubahan konfigurasi (bukan skrip)

"Konfigurasi" Hyper Hub = argumen pemanggilan dan letak root, bukan berkas konfigurasi global.

| Perubahan | Cara kembali |
|---|---|
| `-Root` diarahkan ke folder lain | Panggil ulang tanpa `-Root` (default `$PWD\.hyper-hub`). State lama tetap utuh di root lamanya. |
| `-Policy` diubah dari `deny` | Default kembali `deny` dengan menghapus argumen. `-Policy` **tidak** dipakai `Test-HubPolicy` saat ini — nilainya tidak berpengaruh pada keputusan. |
| Zona/operasi salah di `policy-check` | Tanpa efek — perintah ini tidak menulis state. Jalankan ulang dengan nilai benar. |
| Folder proyek dipindah | `-Root` default bergantung pada `$PWD`; jalankan dari root proyek, atau teruskan `-Root` absolut. |

Bila perubahan konfigurasi tidak disengaja dan menghasilkan root baru: hapus **hanya** root baru yang tidak berisi apa pun (hasil `init` baru tanpa job). Jangan menghapus root yang memiliki `audit.jsonl` berisi baris.

---

## 10. Checklist singkat

```
□ Tidak ada runner        : cek proses 'Hyper-Hub.ps1 tick' kosong
□ Chain bersih            : .\Hyper-Hub.ps1 audit  -> "Audit chain valid."
□ Status ok               : .\Hyper-Hub.ps1 status -> exit 0
□ Gate skrip              : .\Hyper-Hub-SelfCheck.ps1 + ContractCheck + SpecCheck -SelfCheck
□ Backup (state+audit+SUMS) saat tidak ada runner
□ Eksekusi job            : TIDAK AKTIF (run selalu gagal, tick mencetak "Runner disabled"; add hanya menyimpan)
□ Audit rusak             : STOP, eskalasi, jangan init ulang
```

## Gate manusia

| human_gate_id | status | blocks_hats | keterangan |
|---------------|--------|-------------|------------|
| HG-AUDIT-R1 | pending | 30 | Review owner sebelum dipakai sebagai dasar implementasi |
