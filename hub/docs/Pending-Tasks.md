# Pending Tasks - Hyper AI

Daftar pekerjaan yang belum selesai, dikelompokkan menurut siapa yang bisa membuka blokirnya.
Sumber kebenaran status tetap `Hyper-AI-Backlog.csv`; berkas ini menambahkan item yang belum
punya baris backlog.
Rekomendasi untuk tiap keputusan owner: `Rekomendasi-Keputusan-Owner.md`. Rekomendasi bukan persetujuan gate.

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
| `N-10` | Connector registry tervalidasi sebelum membuka `run`/`tick` | SUDAH ADA `Hyper-Hub-Connector.ps1`; sisa: entri connector nyata yang disetujui reviewer |
| `N-11` | Audit anchor eksternal sebelum produksi | SUDAH ADA `Hyper-Hub-AuditAnchor.ps1`; sisa: lokasi anchor yang tidak dapat ditulis akun yang sama |
| `N-12` | Migrasi job prototipe lama ke JobSpec final | Validasi `state.json` kini menolak field tambahan serta aksi selain `local.status/self`; job lama perlu ditinjau, bukan dibuka otomatis |
| `N-13` | Jalankan `Hyper-Hub-SecurityCheck.ps1` di mesin yang punya Hyper AI terpasang | Suite ada dan lulus offline; uji end-to-end ke engine belum |
| `N-14` | Hubungkan hook/kanal ke runtime nyata (plugin V2, bridge Telegram) | Logika dan kontrak sudah diuji; integrasi butuh engine/token |
| `N-15` | Pasang Hyper AI di mesin uji untuk verifikasi end-to-end | Semua gate berjalan offline; executable belum ada di mesin ini |

## 4. Terbuka di backlog (16)

Status: 82 task, **66 done / 16 open** per 23 November 2026.

| Task | Blokir konkret | Yang harus disiapkan |
| --- | --- | --- |
| `B-08` | Definition of Done: "diuji orang selain penulis" | Reviewer manusia menjalankan `Hyper-Hub-RunbookCheck.ps1` + prosedur manual, lalu mencatat nama/tanggal |
| `E-06` | `E-05` sudah no-go; WAHA belum dipasang | Owner menyetujui risiko + menyediakan nomor WhatsApp khusus |
| `F-10` | Butuh 14 hari kalender nyata + sign-off | Jadwal pilot, data non-sensitif, owner menandatangani hasil |
| `H-02` | `HG-DESKTOP-GO` masih no-go; Windows-MCP belum terpasang | VM/akun terpisah, keputusan owner |
| `H-03` | Bergantung `H-02` | Sama |
| `H-04` | Bergantung `H-03` + 10 alur GUI | Sama + skenario UAT |
| `I-02` | Butuh akun Composio + DPA vendor | Kredensial uji, kontrak/DPA |
| `I-03` | Butuh deployment Activepieces self-host | Docker/WSL (tidak ada di mesin ini) |
| `J-02` | Butuh Neo4j/FalkorDB lokal | Docker/WSL atau instalasi native |
| `J-03` | Bergantung `J-01` (baseline ada) + `J-02` | Hasil spike J-02 |
| `K-02` | Butuh model STT + dataset audio berizin | Unduhan model, dataset, waktu pengukuran |
| `K-03` | Butuh LiveKit/Pipecat + realtime | Infrastruktur media + use case disetujui |
| `L-02` | `HG-REMOTE-GO` masih no-go | Keputusan owner + server |
| `L-03` | Bergantung `L-02` | Sama |
| `M-06` | Pilot 14 hari; bergantung `F-10` | Pilot nyata + sign-off |
| `M-08` | Setelah `M-06` | Hasil pilot |

Catatan kesiapan: seluruh lapisan Hub yang dapat diuji offline sudah diimplementasikan
dan hijau (27 gate PowerShell, 25 uji keamanan, 9 uji load, 9 suite overlay, SBOM
42 paket tanpa temuan). Yang belum terbukti adalah integrasi ke runtime nyata
(Hyper AI, Telegram, Playwright/Docling, Windows-MCP, SaaS, graph DB, STT, MeshCentral)
dan penerimaan manusia.

## 5. Kendala lingkungan

| Kendala | Dampak |
| --- | --- |
| WSL dan Docker tidak terpasang | image-based test belum bisa |
| Visual Studio Build Tools tidak ada | `better-sqlite3` 13.x tidak bisa dibangun; dipakai 12.11.1 |
| `npm.ps1` terblokir execution policy | pakai `npm.cmd` atau `bun` |
| Endpoint HTTP service 401 | version check memakai `--version`, bukan HTTP |
