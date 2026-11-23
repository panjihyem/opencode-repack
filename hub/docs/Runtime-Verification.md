# Verifikasi runtime lokal - 23 November 2026

Catatan ini mencatat hasil pemeriksaan runtime **nyata** di mesin ini, menggantikan asumsi
handoff lama. Tidak ada kredensial yang ditampilkan. Semua angka dapat direproduksi dengan
`Hyper-Hub-BlockerAudit.ps1`.

## Koreksi penting

Pemeriksaan sesi sebelumnya menyimpulkan "Hyper AI tidak terpasang". Itu **salah**: yang
diperiksa hanya `PATH`. Binary memang ada di folder aplikasi, dan menjalankannya berhasil.

```text
C:\Users\SER\AppData\Roaming\ai.hyperai.desktop\cli\2.1.10-x64\opencode-cli.exe --version
-> hyper-ai v2.1.10
```

## Yang tersedia

| Komponen | Status | Bukti |
| --- | --- | --- |
| Hyper AI CLI | **ada, 2.1.10** | `opencode-cli.exe --version` di folder appdata |
| Hyper AI desktop data | ada | `%APPDATA%\ai.hyperai.desktop` |
| Bun | 1.4.5 | `bun --version` |
| Git credential manager | terpasang | `git ls-remote`+`git push` ke GitHub tanpa prompt |
| LM Studio | aktif | loopback `127.0.0.1:1234`, `/v1/models` 200 |
| WSL | **binary ada, distro tidak** | `wsl --list --quiet` -> "not installed" |
| Docker | tidak ada | `docker` tidak di PATH |
| Windows-MCP | tidak ada | tidak ada proses, tidak ada `mcp.json` |
| MeshCentral agent | tidak ada | service `MeshAgent` kosong |
| Playwright cache | tidak ada | `%USERPROFILE%\.cache\ms-playwright` tidak ada |
| Neo4j/FalkorDB | tidak berjalan | port 7474/7687 tertutup |
| Whisper | tidak ada | `whisper-cli`/`whisper` tidak di PATH |
| Kanal Telegram/WhatsApp | belum dipasang | `%LOCALAPPDATA%\HyperHub` tidak ada |
| State Hub lama | tidak ada | tidak ada migrasi job yang tertunda |

## Dampak ke N-01..N-15

| ID | Status |
| --- | --- |
| `N-01` | selesai: 8 provider nyata, apiKey tidak ditampilkan |
| `N-02` | usang: provider `flm` tidak ada lagi |
| `N-03` | usang: tidak ada bridge Copilot di 57842 |
| `N-04` | usang: provider `copilot-bridge` sudah dihapus |
| `N-05` | selesai (alat): hardening wildcard + rollback; config pengguna tidak diubah |
| `N-06` | selesai: `hub/flm-results/INDEX.md`, 77 artefak |
| `N-07` | terblokir: klasifikasi komparabilitas selesai; pengukuran ulang butuh FLM (tidak ada) |
| `N-08` | selesai (alat): autostart per-user, diuji dengan stub |
| `N-09` | selesai (alat): `remote -Sub run`/`stop`, diuji 8/8 |
| `N-10` | alat selesai; butuh entri connector yang disetujui reviewer |
| `N-11` | alat selesai; butuh lokasi anchor eksternal |
| `N-12` | tidak ada state lama untuk dimigrasikan (diverifikasi) |
| `N-13` | **bisa dilanjutkan**: engine ada; uji end-to-end ke engine belum dijalankan |
| `N-14` | terblokir: butuh token Telegram dari owner |
| `N-15` | usang: engine sudah terpasang (2.1.10) |

## Catatan

`N-13` bukan lagi terblokir total. Yang belum dilakukan adalah uji end-to-end terhadap
service yang berjalan; itu memerlukan service Hyper AI aktif dan keputusan untuk menyentuh
konfigurasi aplikasi pengguna.

## Uji engine hidup (N-13)

Dijalankan dengan `Hyper-Hub-LiveEngine.ps1` terhadap service yang sedang berjalan.
Read-only: dua request GET, tanpa prompt, tanpa mengubah config.

| Fakta | Nilai |
| --- | --- |
| Respons `/api/info` | ya |
| Versi | `2.1.10` |
| Endpoint | `http://127.0.0.1:28894` |
| PID service | 7004 |
| Capability | `persistentPty: true` |
| Path OpenAPI | **124** |
| Path `/api/experimental/schedule` | **tidak ada** |

Kesimpulan yang didukung bukti:

1. Engine 2.1.10 benar-benar berjalan, jadi uji end-to-end ke API mungkin dilakukan.
2. Scheduler native tidak tersedia di 2.1.10, sesuai riset awal. Keputusan "scheduler lokal
   Hyper Hub sebagai jalur utama" tetap valid.
3. `hasSchedulePath=false` adalah alasan konkret `C-09` memakai fallback lokal, bukan asumsi.

Yang belum diuji: sesi, prompt, plugin hook, dan permission API. Semuanya membuat state pada
aplikasi pengguna sehingga menunggu keputusan eksplisit.
