# Verifikasi runtime lokal - 23 November 2026

Catatan ini mencatat hasil pemeriksaan runtime **nyata** di mesin ini, sebagai pengganti
asumsi handoff lama. Tidak ada kredensial yang ditampilkan.

## Yang tersedia

| Komponen | Status | Bukti |
| --- | --- | --- |
| Bun | 1.4.5 | `bun --version` |
| Node.js | tidak di PATH | `node --version` gagal; tidak dipakai oleh gate Hub |
| Git credential manager | terpasang (`credential.helper=manager`) | `git ls-remote` ke GitHub berhasil tanpa prompt |
| Hyper AI (`opencode-cli.exe`) | **tidak terpasang** | `Get-Command` kosong untuk semua nama kandidat |
| LM Studio | **aktif** | loopback `127.0.0.1:1234`, `/v1/models` merespons 200 |
| Provider FLM (`flm`) | **sudah tidak ada** di config | N-02 tidak lagi relevan |
| Copilot bridge (port 57842) | **tidak ada** | N-03/N-04 tidak lagi relevan |
| Docker/WSL | tidak ada | spike image-based tetap terkunci |

## Dampak ke N-01..N-15

| ID | Status | Bukti |
| --- | --- | --- |
| `N-01` | selesai | `remote -Sub model` membaca 8 provider nyata dari config; apiKey tidak ditampilkan |
| `N-02` | usang | provider `flm` tidak ada lagi; supervisi FLM tidak diperlukan |
| `N-03` | usang | tidak ada bridge Copilot di port 57842 |
| `N-04` | usang | tidak ada provider `copilot-bridge`, jadi klaim `tools:true`-nya tidak berlaku |
| `N-05` | selesai (alat) | `Hyper-Hub-Permission.ps1` menurunkan wildcard allow + rollback; config pengguna tidak diubah tanpa izin |
| `N-06` | selesai | `Hyper-Hub-Index.ps1` menghasilkan `hub/flm-results/INDEX.md` untuk 77 artefak |
| `N-07` | tidak dapat dijalankan | butuh server model yang menyala dan waktu pengukuran; tidak ada run campur 0/3 vs 3/3 yang bisa direproduksi aman sekarang |
| `N-08`, `N-09` | terbuka | butuh bridge kanal nyata (token Telegram / nomor WhatsApp); E-05 no-go |
| `N-10`, `N-11` | alat selesai | `Hyper-Hub-Connector.ps1`, `Hyper-Hub-AuditAnchor.ps1`; sisa entri connector tervalidasi dan lokasi anchor eksternal |
| `N-12` | dokumentasi | validasi state menolak field tambahan; migrasi job lama tetap manual |
| `N-13`, `N-15` | terblokir | Hyper AI tidak terpasang di mesin ini |
| `N-14` | terblokir | butuh engine + token kanal |

## Bukti terukur

- Provider: 8 total, 1 loopback (LM Studio, hidup), 7 remote (tidak diprobe karena non-loopback
  dan berbiaya).
- Akar masalah N-01 lama ("config punya 7 provider") sudah tidak akurat: sekarang 8 provider,
  tanpa `flm`/`copilot-bridge`.
