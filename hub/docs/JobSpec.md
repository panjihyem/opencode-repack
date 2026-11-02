# JobSpec: definisi job Hyper Hub (MVP)

| Zona data | regular |
|-----------|---------|
| Status | draft |
| Backlog | C-01 |
| Bergantung pada | B-01, D-03 |

## Tujuan

Menetapkan satu bentuk dokumen job (`JobSpec`) yang wajib dipakai saat job akan
disimpan, sehingga setiap field, tipe, dan nilai yang tidak sah ditolak sebelum
masuk `state.json`. Sejak 1 November 2026 `add` sudah **memvalidasi dan
menyimpan** job (mencatat `job.added`), tetapi **eksekusi tetap tidak ada**:
`tick` mencetak
`Runner disabled: connector registry and reviewed job schema not implemented.`
dan `run` selalu gagal. `tick -DryRun` hanya melaporkan job jatuh tempo dengan
`launched: 0`.

### Permukaan perintah yang mengikuti skema ini

| Perintah | Efek pada state | Efek pada eksekusi |
|---|---|---|
| `add -Id -Name -Zone -Cron\|-EveryMinutes -Action -Resource [-Policy]` | simpan job + `nextRunUtc` | tidak ada |
| `jobs` | tidak ada | tidak ada |
| `schedule` / `schedule -Id <id>` | `-Id` menghitung ulang `nextRunUtc` | tidak ada |
| `pause` / `resume` / `remove` | ubah/hapus job | tidak ada |
| `tick -DryRun` | tidak ada | `launched: 0` |

Setiap perintah di atas mencetak `executable: false` (kecuali `tick` yang
mencetak `Runner disabled`). `-Zone` yang dihilangkan berarti `case`.

### Semantik cron dan `-EveryMinutes`

Cron lima field: `menit jam hari bulan minggu`, dievaluasi di zona `Asia/Jakarta`
lalu disimpan sebagai `nextRunUtc` (UTC, format `yyyy-MM-ddTHH:mm:ssZ`).

| Bentuk | Arti |
|---|---|
| `*` | semua nilai field itu |
| `<n>` | satu nilai |
| `<a>-<b>` | rentang inklusif, `a <= b` |
| `*/<n>` | kelipatan `n` **dihitung dari nilai minimum field**, bukan dari nol jam |

Batas tiap field diperiksa sendiri-sendiri, bukan batas menit untuk semua:

| Field | Min | Max |
|---|---|---|
| menit | 0 | 59 |
| jam | 0 | 23 |
| hari | 1 | 31 |
| bulan | 1 | 12 |
| minggu | 0 | 7 |

Minggu menerima `0` dan `7` sebagai hari yang sama; `7` dinormalisasi menjadi `0`
(sama dengan cron standar). Jadi `0 8 * * 7` dan `0 8 * * 0` identik.

`*/<n>` wajib `1 <= n <= Max` field itu; `*/0` dan `*/<n>` yang melebihi Max
ditolak (mis. `*/99 * * * *` → `Langkah menit tidak sah: */99 (1-59)`).
Konsekuensinya `*/<n>` pada field jam berarti `jam % n == 0`, bukan "tiap `n`
jam sejak job dibuat".

`-EveryMinutes <n>` adalah jalan pintas; `n` sah dalam 1–1440 dengan aturan:

| Rentang `n` | Syarat | Hasil |
|---|---|---|
| `1`–`59` | `60 % n == 0` | `*/<n> * * * *` |
| `60`–`1439` | `1440 % n == 0` | `0 */<n/60> * * *` (kelipatan jam) |
| `1440` | — | `0 0 * * *` (harian) |

Nilai yang tidak memenuhi syarat ditolak dengan
`EveryMinutes <n> tidak membagi habis 60; pakai -Cron.` (atau
`... tidak membagi habis 1440; ...` untuk `n > 59`). Tidak ada pembulatan
diam-diam: `7` ditolak, sedangkan `90` sah dan menjadi `0 */2 * * *`.

`-Cron` dan `-EveryMinutes` saling eksklusif; mengirim keduanya ditolak.

## Lingkup

- Daftar field wajib dan opsional beserta tipe dan aturan validasinya.
- Contoh job no-op non-sensitif yang sah (zona `regular`).
- Contoh job zona `case` yang harus ditolak mesin validasi.
- Aturan fail-closed: semua job ditolak bila policy atau audit tidak tersedia.
- Tabel validasi yang dapat diuji per baris (input, hasil, alasan).

## Di luar lingkup

- Eksekusi job, scheduler, queue, lease, resource lock (C-02, C-04, C-08).
- Registry connector dan panggilan jaringan apa pun.
- Approval broker nyata dan nonce single-use (D-07).
- Perubahan `Hyper-Hub.ps1`, CSV backlog, atau rencana penelitian.
- Skema untuk payload sensitif zona `case` (dilarang di MVP, lihat di bawah).

## Model data

### Field wajib

| Field | Tipe | Validasi | Contoh sah |
|-------|------|----------|------------|
| `id` | string | `^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$` (sama dengan aturan `Read-State`) | `noop-status-regular` |
| `name` | string | 1–80 char, tanpa baris baru, tanpa karakter kontrol | `Cek status lokal` |
| `zone` | string | tepat salah satu dari `regular`, `case` (peka huruf besar/kecil) | `regular` |
| `schedule` | objek | `{ kind, everyMinutes }`, `kind` = `interval`, `everyMinutes` bilangan bulat 5–10080 | lihat contoh |
| `action` | string | harus ada di matriks policy (`local.status`, `external.send`, `model.cloud`, `job.run`) | `local.status` |
| `resource` | string | harus ada di matriks policy; saat ini hanya `self` | `self` |
| `connector` | string | harus ada di registry; MVP registry kosong ⇒ selalu ditolak | `none` (ditolak sampai registry ada) |
| `executable` | string | harus ada di allowlist executable; di luar allowlist = tolak | `powershell.exe` |
| `arguments` | array string | tiap elemen tanpa `;`, `|`, `&`, `$`, backtick, baris baru; elemen pertama bukan `-Command`/`-EncodedCommand` | `["-NoProfile","-File",".\\Hyper-Hub.ps1","status"]` |
| `timeoutSeconds` | integer | 1–900 | `30` |
| `steps` | objek | `{ maxAttempts, retryDelaySeconds }`; `maxAttempts` 1–5, `retryDelaySeconds` 0–600 | lihat contoh |
| `idempotencyKey` | string | `^[a-z0-9][a-z0-9-]{7,127}$`; wajib deterministik dari `id` + `schedule`, bukan acak per-run | `noop-status-regular-v1` |
| `approver` | string | `^HG-[A-Z0-9-]{2,32}$`; wajib merujuk baris `human_gate_id` yang sudah `approved` | `HG-AUDIT-R1` |

### Field opsional

| Field | Tipe | Validasi | Default |
|-------|------|----------|---------|
| `enabled` | boolean | `true`/`false` saja | `false` (opt-in eksplisit) |
| `description` | string | ≤ 400 char | `""` |
| `requiresApproval` | boolean | `true` wajib bila `action` berefek `ask` | `true` untuk `ask` |

Field di luar daftar ini ditolak (`deny`), bukan diabaikan. Skema tidak
"longgar": extra key = job invalid.

## Contoh job sah (no-op, non-sensitif)

```json
{
  "id": "noop-status-regular",
  "name": "Cek status lokal",
  "description": "Job no-op: hanya memeriksa status lokal, tanpa egress.",
  "zone": "regular",
  "schedule": { "kind": "interval", "everyMinutes": 30 },
  "action": "local.status",
  "resource": "self",
  "connector": "none",
  "executable": "powershell.exe",
  "arguments": ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ".\\Hyper-Hub.ps1", "status"],
  "timeoutSeconds": 30,
  "steps": { "maxAttempts": 1, "retryDelaySeconds": 0 },
  "idempotencyKey": "noop-status-regular-v1",
  "approver": "HG-AUDIT-R1",
  "enabled": false
}
```

Catatan: contoh di atas **lolos validasi skema**, bukan berarti dijalankan.
Dengan `connector: none` dan registry connector masih kosong (lihat
`Invoke-Tick`), eksekusi tetap ditolak pada lapisan berikutnya.

## Contoh job zona case yang DITOLAK

```json
{
  "id": "case-extract-to-cloud",
  "name": "Ringkas dokumen kasus",
  "zone": "case",
  "schedule": { "kind": "interval", "everyMinutes": 60 },
  "action": "model.cloud",
  "resource": "self",
  "connector": "openai",
  "executable": "powershell.exe",
  "arguments": ["-NoProfile", "-File", ".\\Hyper-Hub.ps1", "status"],
  "timeoutSeconds": 120,
  "steps": { "maxAttempts": 2, "retryDelaySeconds": 5 },
  "idempotencyKey": "case-extract-to-cloud-v1",
  "approver": "HG-AUDIT-R1"
}
```

Ditolak dengan **dua** alasan independen (keduanya harus dilaporkan):

1. `zone=case` + `action=model.cloud` ⇒ policy `deny`, alasan
   `case zone blocks all other operations` (lihat `Test-HubPolicy`).
2. Job zona `case` hanya boleh memakai aksi lokal (`local.status`). Aksi lain
   apa pun, termasuk `external.send` dan `job.run`, otomatis ditolak.

Contoh kedua yang juga ditolak walaupun aksinya lokal, karena melanggar aturan
bukti perintah:

```json
{ "zone": "case", "action": "local.status", "executable": "cmd.exe",
  "arguments": ["/c", "dir"] }
```

⇒ tolak: `executable` di luar allowlist, dan zona `case` hanya menerima
`powershell.exe` dengan `-NoProfile -ExecutionPolicy Bypass -File`.

## Aturan fail-closed

1. **Policy tidak tersedia ⇒ tolak.** Bila mesin policy tidak dapat dievaluasi
   (`policy-check` error, matriks tidak termuat, `action`/`resource` tidak
   terklasifikasi), hasilnya `deny`. Bukan `ask`, bukan `allow`, bukan default
   diam-diam.
2. **Audit tidak tersedia ⇒ tolak.** Bila `audit.jsonl` tidak ada padahal
   `state.json` ada, atau rantai hash rusak (`Test-Audit` gagal), semua operasi
   ditolak: `AUDIT INVALID: refusing ...`. Job tidak boleh disimpan maupun
   dijalankan dalam kondisi ini. Audit tidak boleh dibuat ulang secara otomatis.
3. **Registry connector kosong ⇒ tolak.** Selama C-04/C-08 belum ada, setiap
   job yang membutuhkan connector non-`none` ditolak.
4. **Approvasi tidak sah ⇒ tolak.** `approver` kosong, tidak ada di daftar
   `human_gate_id`, atau statusnya bukan `approved` ⇒ job ditolak.
5. Urutan pemeriksaan: skema bentuk → allowlist executable/argument →
   policy (action, resource, zone) → approver → audit tersedia. Pemeriksaan
   pertama yang gagal menentukan alasan yang dilaporkan; sisanya tidak
   dijalankan.

## Jalur kegagalan

- Field hilang/tipe salah ⇒ `deny`, tidak ada penulisan `state.json`.
- Field tambahan tak dikenal ⇒ `deny` (`unknown field`), tidak diabaikan.
- `id` duplikat ⇒ `deny` (`Duplicate job IDs`), sesuai `Read-State`.
- `arguments` memuat meta-karakter shell ⇒ `deny` (`argument not allowlisted`).
- `action` atau `zone` tidak dikenal ⇒ `deny` (`zone or operation not
  classified`), sama seperti default `Test-HubPolicy`.
- Policy/audit tidak dapat dibaca ⇒ `deny` dan berhenti; tidak ada fallback.
- Kegagalan saat menyimpan ⇒ tulis atomik gagal total (`Write-Atomic`), berkas
  lama utuh.

## Kriteria penerimaan

- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub-SpecCheck.ps1 -Spec .\docs\JobSpec.md`
  melaporkan `zone: regular` dan `issues` hanya berisi gate `HG-AUDIT-R1 belum approved`
  (exit 2) — artinya struktur spec lengkap dan satu-satunya penghalang adalah gate
  manusia. Exit 0 hanya setelah HG-AUDIT-R1 disetujui manusia.
- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub.ps1 policy-check -Zone case -Operation external.send` mengembalikan `"decision":"deny"`.
- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub.ps1 policy-check -Zone regular -Operation local.status` mengembalikan `"decision":"allow"`.
- Setiap baris tabel validasi di bawah punya hasil yang sama dengan kolom
  `hasil`; baris `V17`–`V20` dijalankan terhadap `policy-check` nyata.

## Tabel validasi

`A` = lolos skema, `D` = ditolak. Kolom `alasan` = string yang harus muncul.

| # | Input (ringkas) | Hasil | Alasan |
|---|-----------------|-------|--------|
| V01 | Job contoh sah, `zone=regular`, `action=local.status` | A | — |
| V02 | `id` = `-abc` | D | `id` |
| V03 | `id` = 65 karakter | D | `id` |
| V04 | `zone` = `Regular` | D | `zone` |
| V05 | `zone` = `public` | D | `zone or operation not classified` |
| V06 | `zone` = `case`, `action` = `external.send` | D | `case zone blocks all other operations` |
| V07 | `zone` = `case`, `action` = `model.cloud` | D | `case zone blocks all other operations` |
| V08 | `zone` = `case`, `action` = `job.run` | D | `case zone blocks all other operations` |
| V09 | `zone` = `case`, `action` = `local.status`, `executable` = `cmd.exe` | D | `executable not allowlisted` |
| V10 | `zone` = `case`, `action` = `local.status`, `executable` = `powershell.exe`, argumen `-File` | A | — |
| V11 | `action` = `local.send` (tidak dikenal) | D | `zone or operation not classified` |
| V12 | `arguments` = `["-NoProfile","-Command","Remove-Item *"]` | D | `argument not allowlisted` |
| V13 | `arguments` elemen memuat `;` atau `&` | D | `argument not allowlisted` |
| V14 | `timeoutSeconds` = 0 | D | `timeoutSeconds` |
| V15 | `steps.maxAttempts` = 6 | D | `maxAttempts` |
| V16 | `schedule.everyMinutes` = 120000 | D | `everyMinutes` |
| V17 | `idempotencyKey` 5 karakter | D | `idempotencyKey` |
| V18 | `approver` = `HG-NOPE` | D | `approver` |
| V19 | `connector` = `openai` (registry kosong) | D | `connector not registered` |
| V20 | `enabled` = `"yes"` (string) | D | `enabled` |
| V21 | Field tambahan `"shell"` | D | `unknown field` |
| V22 | Audit hilang, `state.json` ada | D | `AUDIT INVALID` |
| V23 | Rantai hash audit rusak | D | `AUDIT INVALID` |
| V24 | Policy tidak tersedia / error saat evaluasi | D | `policy unavailable` |

Batas zona `case` di atas harus konsisten dengan matriks di
[`Policy-Matrix.md`](./Policy-Matrix.md); bila keduanya berbeda, matriks policy
menang dan dokumen ini harus diperbaiki.

## Batas egress

Tidak berlaku: dokumen ini zona `regular`. Tetap dicatat sebagai rujukan:
job zona `regular` dengan `action=external.send` wajib `ask` (butuh connector
yang direview + approval), dan job zona `case` tidak boleh punya tujuan keluar
apa pun — tidak ada pengecualian model cloud.

## Gate manusia

| human_gate_id | status | blocks_hats | keterangan |
|---------------|--------|-------------|------------|
| HG-AUDIT-R1 | pending | 30 | Review manusia sebelum implementasi skema job |
