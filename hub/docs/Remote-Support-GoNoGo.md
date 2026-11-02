# Spec: go/no-go remote support dan model admin

| Zona data | case |
|-----------|------|
| Status | draft — **rekomendasi: no-go untuk mesin berisi data kasus** |
| Task | L-01 |
| Dependensi | A-03 |

## Tujuan

Menetapkan apakah mesin Hyper AI boleh diakses dari jarak jauh oleh pihak lain (dukungan teknis, admin), siapa yang boleh, dengan persetujuan seperti apa, dan berapa lama akses berlaku. Tanpa dokumen ini, remote support tidak dipasang.

## Lingkup

- Model admin yang dievaluasi:

| Model | Risiko | Rekomendasi |
|---|---|---|
| MeshCentral self-host, 2FA, device group | admin punya kontrol penuh; seluruh data kasus terpapar | **no-go** untuk mesin kasus |
| Remote support berjangka (time-bound) dengan izin sesi | butuh konsen eksplisit + recording | tunda sampai `D-05` dan `D-07` ada |
| Akses tanpa persetujuan pemakai | tidak dapat diterima | **no-go** |

- Syarat wajib bila go (tidak satu pun terpenuhi sekarang):
  - Konsen eksplisit pengguna per sesi, dengan masa berlaku dan pembatalan sepihak.
  - Akses terikat ke satu perangkat, satu sesi, dengan waktu mulai dan berakhir yang tercatat.
  - Setiap sesi dicatat di audit hash chain (`D-05`) dan menyertakan identitas admin.
  - Tidak ada akses ke folder data kasus, walau admin memintanya.
  - Ada jalur pencabutan akses seketika tanpa bergantung pada admin itu sendiri.
  - Rekaman sesi (bila ada) disimpan lokal dan punya aturan retensi.
- Rollback: lepas agent, cabut sertifikat perangkat, hapus akun admin. Tidak ada sisa kredensial.
- Rekomendasi saat ini: **no-go**, karena `D-05` (audit) dan `D-07` (approval) belum ada; remote support tanpa keduanya tidak dapat diaudit maupun dibatasi.

## Di luar lingkup

- Deployment MeshCentral (`L-02`), konsen recording (`L-03`).
- Remote support untuk mesin peserta lain di jaringan kantor.
- Pengawasan (monitoring) tanpa persetujuan.

## Jalur kegagalan

- Admin mencoba masuk saat tidak ada izin aktif → ditolak dan dicatat.
- Izin kedaluwarsa di tengah sesi → sesi diputus, bukan diperpanjang diam-diam.
- Konsen dicabut → sesi berhenti seketika.
- Audit tidak dapat ditulis → sesi ditolak (`fail-closed`), karena akses tanpa audit tidak boleh terjadi.
- Permintaan akses ke data kasus → ditolak tanpa memandang role admin.

## Kriteria penerimaan

- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub-SpecCheck.ps1 -Spec .\docs\Remote-Support-GoNoGo.md` → `issues` hanya gate `HG-AUDIT-R1`, exit 2 sampai disetujui.
- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub.ps1 audit` → galat bila chain rusak; remote support tidak boleh berjalan saat ini gagal.
- Tidak ada agent remote support terpasang: `Get-Service MeshAgent -ErrorAction SilentlyContinue` → kosong.
- Rekomendasi no-go ditandatangani owner sebelum status berubah.
- Syarat `D-05` dan `D-07` tercentang sebelum go dievaluasi ulang.

## Batas egress

Zona `case` — remote support adalah egress dua arah (admin mengendalikan, layar terkirim):

- Dilarang: meneruskan layar, berkas, atau clipboard mesin kasus ke pihak mana pun, termasuk admin.
- Dilarang: kanal eksternal (Telegram, WAHA, Composio), model cloud, dan relay pihak ketiga.
- Diizinkan: tidak ada pada versi ini.
- Tingkat redaksi: bila kelak diizinkan, hanya sesi `regular` dengan akun bukan-pemilik-data; zona `case` tetap tidak pernah dibagikan.
- Model yang diizinkan di zona `case`: tidak ada model cloud.

## Gate manusia

| human_gate_id | status | blocks_hats | keterangan |
|---------------|--------|-------------|------------|
| HG-AUDIT-R1 | pending | 30 | Review manusia sebelum implementasi |
| HG-REMOTE-GO | pending | 30 | Owner memutuskan go/no-go remote support |
