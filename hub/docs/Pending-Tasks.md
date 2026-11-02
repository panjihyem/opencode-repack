# Pending Tasks - Hyper AI

Daftar pekerjaan yang belum selesai, dikelompokkan menurut siapa yang bisa membuka blokirnya.
Sumber kebenaran status tetap `Hyper-AI-Backlog.csv`; berkas ini menambahkan item yang belum
punya baris backlog.

## 1. Butuh keputusan owner

| Item | Isi | Catatan |
| --- | --- | --- |
| `HG-AUDIT-R1` | Persetujuan 31 dokumen | Spec gate memblokir semua dokumen selama `pending` |
| ADR-001..007 | Persetujuan arsitektur | Semua masih `pending owner approval` |
| T1-T20 | Ambang teknis | Belum disahkan |
| Retensi dan pemusnahan | Kebijakan | Belum ditetapkan |
| Path penyimpanan data kasus | Penentuan lokasi | Belum ditetapkan |
| Reviewer penurunan zona | Penunjukan orang | Belum ada |
| `HG-DESKTOP-GO` | Windows-MCP | `docs/Desktop-Automation-GoNoGo.md`: no-go |
| `HG-REMOTE-GO` | Remote support | `docs/Remote-Support-GoNoGo.md`: no-go |
| `HG-SAAS-LIST` | Daftar SaaS | `docs/SaaS-Integration-Classification.md` |
| `HG-VOICE-SCOPE` | Ruang lingkup voice | `docs/Voice-Privacy-Boundary.md` |

## 2. Butuh tindakan pengguna

| Item | Yang diperlukan | Alasan |
| --- | --- | --- |
| Token bot Telegram | Token dari @BotFather, ID dari @userinfobot | `remote -Sub setup` menunggu prompt interaktif |
| Nomor WhatsApp kedua | Nomor khusus, bukan nomor utama | risiko blokir permanen |
| Keputusan kanal `whatsapp` | Ubah `planned` -> `implemented` | perlu bukti pairing nyata |
| Rotasi kredensial | Revoke token GitHub yang pernah disimpan di `Desktop/cred.txt` | token berhak tulis |

## 3. Teknis, belum punya baris backlog

| ID usul | Task | Bukti kebutuhan |
| --- | --- | --- |
| `N-01` | `remote -Sub model` untuk daftar/pilih provider dan model | config punya 7 provider |
| `N-02` | Supervisi server FLM (start/stop/health) di `health` | server mati -> `ECONNREFUSED` |
| `N-03` | Supervisi Copilot bridge + verifikasi kunci loopback | port 57842 |
| `N-04` | Turunkan atau buktikan klaim `tools:true` milik `copilot-bridge/copilot` | uji tool calling gagal |
| `N-05` | Turunkan `permission: {"*":"allow"}` ke deny-by-default | ADR-003 |
| `N-06` | Indeks `flm-results/` (model x decode x kualitas) | 60+ artefak tanpa indeks |
| `N-07` | Ulangi perbandingan model lokal dengan timeout seragam | run campur 0/3 lalu 3/3 |
| `N-08` | Auto-start bridge setelah pairing | proses mati saat PC restart |
| `N-09` | `remote -Sub run` untuk menjalankan bridge sebagai layanan | belum ada perintah |

## 4. Terbuka di backlog (63)

Prioritas P0: `A-01`, `B-01`, `B-03`, `B-04`, `B-05`, `C-01`, `C-02`, `C-03`, `C-04`,
`C-05`, `C-06`, `C-09`, `D-01` sampai `D-07`, `D-09`, `D-10`, `F-01`, `F-02`, `F-04`,
`F-05`, `F-06`, `F-07`, `F-10`, `M-00`, `M-01`, `M-02`, `M-04`, `M-05`, `M-06`, `M-08`.

Prioritas P1: `B-08`, `C-07`, `D-08`, `E-02`, `E-03`, `E-04`, `F-03`, `F-08`, `F-09`,
`G-01`, `G-03`, `G-04`, `M-07`.

Prioritas P2/P3: `C-08`, `E-05`, `E-06`, `H-02`, `H-03`, `H-04`, `I-02`, `I-03`,
`J-01` sampai `J-03`, `K-02`, `K-03`, `L-02`, `L-03`.

## 5. Kendala lingkungan

| Kendala | Dampak |
| --- | --- |
| WSL dan Docker tidak terpasang | image-based test belum bisa |
| Visual Studio Build Tools tidak ada | `better-sqlite3` 13.x tidak bisa dibangun; dipakai 12.11.1 |
| `npm.ps1` terblokir execution policy | pakai `npm.cmd` atau `bun` |
| Endpoint HTTP service 401 | version check memakai `--version`, bukan HTTP |
