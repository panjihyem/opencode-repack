# Spec: go/no-go Windows-MCP dan isolasi sesi desktop

| Zona data | case |
|-----------|------|
| Status | draft — **rekomendasi: no-go sampai isolasi tersedia** |
| Task | H-01 |
| Dependensi | A-03 |

## Tujuan

Menetapkan keputusan tertulis apakah Hyper Hub boleh mengendalikan desktop Windows (mouse, keyboard, screenshot, jendela) lewat Windows-MCP, beserta syarat isolasi yang wajib ada sebelum izin diberikan. Dokumen ini rekomendasi teknis; persetujuan risiko tetap milik owner.

## Lingkup

- Model ancaman: proses yang mengendalikan desktop setara **sesi pengguna penuh** — dapat membaca semua jendela, clipboard, dan berkas yang sedang dibuka.
- Dua pilihan isolasi yang dievaluasi:
  1. **Sesi Windows terpisah** (RDP/session 0 terpisah) dengan akun tanpa hak admin dan tanpa akses profil pengguna utama.
  2. **VM (Hyper-V) dengan GPU diskrit/passthrough**, desktop diisolasi penuh dari host.
- Syarat minimum bila go:
  - Proses Windows-MCP berjalan di bawah akun khusus, bukan akun harian.
  - Tidak ada akses ke clipboard bersama, drive yang dipetakan, atau profil pengguna utama.
  - Setiap aksi memerlukan approval manusia (mengacu `D-07`), dan setiap aksi dicatat ke audit hash chain (`D-05`).
  - Screenshot tidak pernah meninggalkan mesin; tidak ada kanal eksternal di zona `case`.
  - Ada tombol/jalur berhenti darurat yang tidak bergantung pada MCP itu sendiri.
- Rollback: hentikan sidecar + cabut akun + hapus sesi. Tidak ada perubahan permanen ke sistem.
- Data uji wajib non-sensitif; **tidak ada data kasus** di sesi uji.

## Di luar lingkup

- Pemasangan Windows-MCP (H-02), approval screenshot (H-03), UAT 10 alur (H-04).
- Akses lintas mesin / remote support (L-01).
- Telemetri apa pun: wajib mati.

## Jalur kegagalan

- Sidecar berjalan tanpa approval aktif → aksi ditolak, bukan dieksekusi.
- Sidecar kehilangan koneksi ke Hub → berhenti, tidak melanjutkan aksi terakhir.
- Admin tidak memberikan isolasi (sesi/VM) → **no-go**, dan `executable` tetap `false`.
- Bila aksi tidak terklasifikasi pilihan → tolak.
- Rekomendasi saat ini: **no-go**. Alasan: tidak ada sesi terisolasi di mesin ini, dan Windows-MCP belum punya model izin per-aksi yang terverifikasi.

## Kriteria penerimaan

- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub-SpecCheck.ps1 -Spec .\docs\Desktop-Automation-GoNoGo.md` → `issues` hanya gate `HG-AUDIT-R1`, exit 2 sampai disetujui.
- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub.ps1 policy-check -Zone regular -Operation external.send` → `deny`, `executable: false`.
- Rekomendasi no-go tercatat dan ditandatangani owner sebelum status berubah menjadi go.
- Tidak ada berkas Windows-MCP terpasang: `Get-Command windows-mcp -ErrorAction SilentlyContinue` → kosong.

## Batas egress

Zona `case` — kontrol desktop secara definisi membuka jalan ke seluruh data mesin:

- Dilarang: semua kanal eksternal (Telegram, WAHA, Composio, SMTP), model cloud, dan setiap unggahan screenshot.
- Dilarang: sinkronisasi clipboard ke layanan apa pun, termasuk OneDrive.
- Tingkat redaksi: screenshot disimpan lokal, tidak pernah dilampirkan ke pesan keluar; bila kelak perlu, wajib redaksi penuh lebih dulu.
- Model yang diizinkan di zona `case`: tidak ada model cloud. Pemrosesan lokal saja.

## Gate manusia

| human_gate_id | status | blocks_hats | keterangan |
|---------------|--------|-------------|------------|
| HG-AUDIT-R1 | pending | 30 | Review manusia sebelum implementasi |
| HG-DESKTOP-GO | pending | 30 | Owner memutuskan go/no-go Windows-MCP |
