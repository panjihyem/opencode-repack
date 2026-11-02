# Policy Matrix: action x resource x zone

| Zona data | regular |
|-----------|---------|
| Status | draft |
| Backlog | D-03 |
| Bergantung pada | A-03, B-01 |
| Diperiksa terhadap | `Hyper-Hub.ps1` fungsi `Test-HubPolicy` (`policy-check`) |

## Tujuan

Menetapkan perilaku evaluasi policy 3 sumbu (action, resource, zone) yang
deterministik: masukan identik selalu menghasilkan keputusan identik
`allow` / `ask` / `deny`, dengan **default deny**. Dokumen ini adalah spesifikasi
behavioral; implementasi mesin setiap connector di luar lingkup. Sumber
kebenaran hari ini tetap `Test-HubPolicy` di `Hyper-Hub.ps1`, dan pekerjaan ini
tidak mengubahnya.

## Lingkup

- Daftar tertutup action, resource, dan zone yang dikenal.
- Efek per kombinasi dan urutan evaluasi.
- Perilaku saat masukan tidak dikenal, policy tidak tersedia, atau audit rusak.
- Tabel uji minimal 24 baris yang bisa dijalankan manual atau otomatis.

## Di luar lingkup

- Eksekusi egress dan allowlist domain (D-04).
- Approval broker, nonce, expiry (D-07).
- Redaksi prompt/attachment (D-09).
- Perubahan `Hyper-Hub.ps1` atau `Hyper-Hub-ContractCheck.ps1`.

## Prinsip

1. **Default deny.** Kombinasi yang tidak tercantum di tabel eksplisit ⇒ `deny`.
2. **Deterministik.** Tidak ada urutan hash-map, waktu, sumber acak, atau
   "kebijakan terakhir yang dibaca" yang memengaruhi hasil. Evaluasi baris
   berurutan dari atas ke bawah; **aturan terakhir yang cocok menang**, dan baris
   pertama yang cocok adalah yang dilaporkan bila tidak ada kecocokan sesudahnya.
3. **Fail-closed.** Policy tidak dapat dievaluasi ⇒ `deny`. Audit tidak valid ⇒
   `deny`. Bukan `ask`, bukan `allow`.
4. **`ask` bukan `allow`.** `ask` berarti eksekusi tertahan sampai ada keputusan
   approver yang sah dan belum kedaluwarsa. Selama approval broker (D-07) belum
   ada, `ask` **berperilaku sebagai `deny`**; jadi `policy-check` versi sekarang
   melaporkan `deny` untuk `regular` + `external.send` dengan alasan
   `regular external operation needs reviewed connector and approval`.

## Dimensi

### Zone (tertutup)

| zone | arti | batas egress |
|------|------|--------------|
| `regular` | data non-sensitif | egress ke connector yang direview, hanya dengan `ask` |
| `case` | data kasus/sensitif | tanpa egress sama sekali; aksi lokal saja |

Nilai lain (`Regular`, `CASE`, `public`, `unknown`, kosong) = zone tidak dikenal
⇒ `deny`.

### Action (tertutup)

| action | sifat | keterangan |
|--------|-------|------------|
| `local.status` | lokal, baca | status proses/state; tanpa jaringan |
| `external.send` | keluar | kirim ke kanal eksternal atau connector |
| `model.cloud` | keluar | inferensi model non-lokal |
| `job.run` | lokal, eksekusi | menjalankan job terjadwal |
| `browser.navigate` | keluar | membuka origin di sisi browser; wajib `-Origin`, dinilai oleh `docs/Browser-Origin-Policy.md` |

Action tidak dikenal (`local.send`, `file.read`, `delete`, string kosong) ⇒
`deny` dengan alasan `zone or operation not classified`.

### Resource (tertutup)

| resource | arti |
|----------|------|
| `self` | proses Hyper Hub sendiri (satu-satunya nilai di MVP) |

Resource tidak dikenal atau kosong ⇒ `deny`. Pada `Test-HubPolicy` versi sekarang
resource tidak diparameterkan dan diperlakukan tetap `self`; dokumen ini
mensyaratkan penambahan parameter dilakukan di D-03/D-04, bukan di sini.

## Urutan evaluasi

```
1. Zone dikenal?            tidak -> deny  ("zone or operation not classified")
2. Action dikenal?          tidak -> deny  ("zone or operation not classified")
3. Resource = `self`?       tidak -> deny  ("resource not classified")
4. Policy table termuat?    tidak -> deny  ("policy unavailable")
5. Audit chain valid?       tidak -> deny  ("AUDIT INVALID")
6. Cocokkan baris tabel; aturan terakhir yang cocok menang
7. Tidak ada baris cocok?           -> deny  ("default deny")
```

Langkah 4–5 adalah gerbang ketersediaan: bila salah satu gagal, langkah 6 tidak
pernah dievaluasi. Karena itu urutannya "cek ketersediaan dulu, putuskan
belakangan".

## Tabel keputusan (terakhir cocok menang)

| # | zone | action | resource | efek | alasan |
|---|------|--------|----------|------|--------|
| 1 | `case` | `local.status` | `self` | `allow` | `case local status only` |
| 2 | `regular` | `local.status` | `self` | `allow` | `regular local status` |
| 3 | `regular` | `external.send` | `self` | `ask`* | `regular external operation needs reviewed connector and approval` |
| 4 | `regular` | `job.run` | `self` | `ask`* | `job execution needs reviewed connector and approval` |
| 5 | `regular` | `model.cloud` | `self` | `deny` | `cloud model blocked: policy data case and model cloud not approved` |
| 99 | (apa pun) | (apa pun) | (apa pun) | `deny` | `default deny` |

\* `ask` hanya aktif setelah D-07 (approval broker) ada. Tanpa broker, `ask`
dilaporkan `deny`. Baris 1 kalah dari baris 99 hanya jika policy/audit tidak
tersedia — bukan karena suatu baris lain cocok.

Baris `case` untuk `external.send`, `model.cloud`, `job.run` **tidak ada** dan
sengaja tidak dibuat: itulah cara `case` diblokir. Menambah baris eksplisit
`case + X = deny` boleh, tetapi baris 99 sudah menutupinya.

## Jalur kegagalan

- Zone/action/resource tidak dikenal ⇒ `deny`, alasan generik (tidak membocorkan
  isi tabel).
- Tabel policy gagal termuat ⇒ `deny` (`policy unavailable`), tidak memakai tabel
  bawaan diam-diam.
- Audit rusak/tidak ada ⇒ `deny` (`AUDIT INVALID`), konsisten `Test-Audit`.
- Kombinasi `case` + aksi keluar ⇒ `deny` walaupun approver sudah `approved`.
- Evaluasi tidak boleh menulis state, membuat direktori, atau menghubungi
  jaringan — kontrak `policy-check` yang sudah diuji `Hyper-Hub-ContractCheck.ps1`
  (`discover`/`policy-check` wajib tidak membuat `$root`).

## Kriteria penerimaan

- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub-ContractCheck.ps1` lulus.
- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub-SpecCheck.ps1 -Spec .\docs\Policy-Matrix.md` melaporkan `issues` hanya gate `HG-AUDIT-R1 belum approved` (exit 2); exit 0 setelah gate disetujui manusia.
- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub.ps1 policy-check -Zone case -Operation external.send` mengembalikan `"decision":"deny"` dan `"executable":false`.
- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub.ps1 policy-check -Zone regular -Operation local.status` mengembalikan `"decision":"allow"`.

## Tabel uji

Kolom `harapan` = hasil yang **wajib** keluar dari `policy-check` versi sekarang
(`Hyper-Hub.ps1`, `Test-HubPolicy`). Kolom `efek target` = efek setelah D-07
tersedia. Baris ditandai `‑` untuk `efek target` berarti sama dengan harapan.

| # | zone | action | resource | harapan | efek target | alasan |
|---|------|--------|----------|---------|-------------|--------|
| P01 | `case` | `local.status` | `self` | `allow` | ‑ | `case local status only` |
| P02 | `case` | `external.send` | `self` | `deny` | ‑ | `case zone blocks all other operations` |
| P03 | `case` | `model.cloud` | `self` | `deny` | ‑ | `case zone blocks all other operations` |
| P04 | `case` | `job.run` | `self` | `deny` | ‑ | `case zone blocks all other operations` |
| P05 | `regular` | `local.status` | `self` | `allow` | ‑ | `regular local status` |
| P06 | `regular` | `external.send` | `self` | `deny` | `ask` | `regular external operation needs reviewed connector and approval` |
| P07 | `regular` | `model.cloud` | `self` | `deny` | ‑ | `zone or operation not classified` |
| P08 | `regular` | `job.run` | `self` | `deny` | `ask` | `zone or operation not classified` |
| P09 | `unknown` | `local.status` | `self` | `deny` | ‑ | `zone or operation not classified` |
| P10 | `unknown` | `external.send` | `self` | `deny` | ‑ | `zone or operation not classified` |
| P11 | `Regular` | `local.status` | `self` | `deny` | ‑ | `zone or operation not classified` |
| P12 | `CASE` | `local.status` | `self` | `deny` | ‑ | `zone or operation not classified` |
| P13 | (kosong) | `local.status` | `self` | `deny` | ‑ | `zone or operation not classified` |
| P14 | `regular` | `local.send` | `self` | `deny` | ‑ | `zone or operation not classified` |
| P15 | `regular` | `file.read` | `self` | `deny` | ‑ | `zone or operation not classified` |
| P16 | `regular` | `delete` | `self` | `deny` | ‑ | `zone or operation not classified` |
| P17 | `regular` | (kosong) | `self` | `deny` | ‑ | `zone or operation not classified` |
| P18 | `case` | `local.status` | `shared` | `deny` | ‑ | `resource not classified` |
| P19 | `regular` | `external.send` | `shared` | `deny` | ‑ | `resource not classified` |
| P20 | `case` | `external.send` | `shared` | `deny` | ‑ | `case zone blocks all other operations` |
| P21 | `regular` | `local.status` | `self` (policy tidak termuat) | `deny` | ‑ | `policy unavailable` |
| P22 | `regular` | `local.status` | `self` (rantai audit rusak) | `deny` | ‑ | `AUDIT INVALID` |
| P23 | `case` | `job.run` | `self` (approver `approved`) | `deny` | ‑ | `case zone blocks all other operations` |
| P24 | `case` | `external.send` | `self` (approver `approved`) | `deny` | ‑ | `case zone blocks all other operations` |
| P25 | `regular` | `external.send` | `self` (connector tak terdaftar) | `deny` | `deny` | `connector not registered` |
| P26 | `regular` | `browser.navigate` | `self`, `-Origin https://jdih.go.id`, policy ada | `allow` | ‑ | `allowlist regular : https://jdih.go.id` |
| P27 | `regular` | `browser.navigate` | `self`, tanpa `-Origin` | `deny` | ‑ | `origin tidak dapat dinormalisasi` |
| P28 | `regular` | `browser.navigate` | `self`, `-Origin http://localhost:8080` | `deny` | ‑ | `origin tidak dapat dinormalisasi` |
| P29 | `regular` | `browser.navigate` | `self`, `-Origin https://jdih.go.id`, policy tidak ada | `deny` | ‑ | `policy tidak terbaca` |
| P30 | `case` | `browser.navigate` | `self`, `-Origin https://evil.example.com`, masuk blocklist | `deny` | ‑ | `origin ada di blocklist: https://evil.example.com` |
| P31 | `regular` | `browser.navigate` | `self`, `-Origin https://jdih.go.id:8443` | `deny` | ‑ | `origin tidak ada di allowlist regular` |

Wildcard `*.contoh.go.id` pada allowlist cocok pada **tepat satu label** di depan:
`https://jdih.go.id` cocok, `https://jdih.kemenkum.go.id` dan `https://go.id`
tidak. Pencocokan tanpa wildcard bersifat persis (`scheme` + `host` + port efektif),
termasuk `https`/`443` dan `http`/`80`. Kasus P26–P31 diuji
`Hyper-Hub-SelfCheck.ps1`.

Baris P07/P08 sengaja berbeda dari tabel keputusan: `Test-HubPolicy` sekarang
memberi alasan generik karena `model.cloud` dan `job.run` belum ada cabangnya.
Setelah D-04/D-07, alasan harus disamakan dan tabel ini diperbarui; keputusan
`deny` tetap.

Baris P13 dan P17 memakai nilai kosong. PowerShell membuang argumen string
kosong, jadi baris itu diuji lewat
`powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "& .\Hyper-Hub.ps1 policy-check -Zone ([string]::Empty) -Operation 'local.status'"`
(hasil: `decision deny`). Menjalankan `-Zone ''` biasa akan gagal di parameter
binding, bukan menghasilkan keputusan.

## Pemetaan ke kode

| Baris | Sumber di `Hyper-Hub.ps1` |
|-------|---------------------------|
| P01 | `$DataZone -ceq 'case' -and $RequestedOperation -ceq 'local.status'` |
| P02–P04, P20, P23, P24 | cabang `elseif ($DataZone -ceq 'case')` |
| P05 | `elseif ($DataZone -ceq 'regular' -and $RequestedOperation -ceq 'local.status')` |
| P06 | `elseif ($DataZone -ceq 'regular' -and $RequestedOperation -ceq 'external.send')` |
| P09–P19, P25 | inisialisasi `$decision = 'deny'; $reason = 'zone or operation not classified'` |
| P21, P22 | gerbang ketersediaan di luar `Test-HubPolicy` (target D-03/D-05) |
| semua | `executable = $false` wajib untuk setiap baris |

## Batas egress

Tidak berlaku: dokumen zona `regular`. Ditegaskan untuk rujukan: `case` tidak
punya jalur egress; `regular` hanya boleh `ask` ke connector yang direview, dan
itu pun belum aktif sebelum D-04 + D-07.

## Gate manusia

| human_gate_id | status | blocks_hats | keterangan |
|---------------|--------|-------------|------------|
| HG-AUDIT-R1 | pending | 30 | Review manusia sebelum implementasi policy engine |
