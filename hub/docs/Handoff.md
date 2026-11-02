# Handoff - Hyper AI

Memindahkan pengembangan Hyper AI dari satu PC ke PC lain.

## 1. Status per sekarang

| Langkah | Status |
| --- | --- |
| Clone repo `panjihyem/opencode-repack` | selesai (branch `dev`, commit `23cb60e`) |
| Branch `hub-control-plane` + commit `64d803c` (119 file) | **lokal saja, belum ter-push** |
| Push ke GitHub | **gagal**: token di `Desktop\cred.txt` ditolak (`401 Bad credentials`) |
| PR ke `dev` | belum dibuat |
| Paket manual | `Desktop\hyper-ai-handoff.zip` (324 MB), sudah diuji clone dan 5 gate exit 0 |

## 2. Yang harus dibawa

| Komponen | Lokasi di PC ini | Ikut paket? |
| --- | --- | --- |
| Hub + docs + backlog | `hub/` di dalam repo | ya |
| Hasil uji model | `hub/flm-results/` | ya |
| Config provider lokal | `~\.config\opencode\opencode.json` | hanya contoh tersanitasi |
| Plugin OpenCode | `~\.config\opencode\plugins\` | tidak |
| Bridge Copilot | `~\.config\opencode\copilot-bridge\` | tidak (`bridge.key`, `.venv`, `session/`) |
| Bridge Telegram | `%LOCALAPPDATA%\HyperHub\remote-telegram` | tidak (`.env` berisi token) |
| Bridge WhatsApp | `%LOCALAPPDATA%\HyperHub\remote-whatsapp` | tidak (repo pihak ketiga + sesi QR) |
| Runtime FLM | `~\flm\` | tidak, besar |
| State Hub | `%LOCALAPPDATA%\HyperHub\state` | tidak, terikat mesin |
| Kredensial | `Desktop\cred.txt` | **jangan pernah** |

## 3. Langkah handoff

### Lewat GitHub (bila token sudah benar)

```powershell
cd <folder repo>
$tok = Get-Content 'C:\Temp\gh-token.txt' -Raw
git push "https://x-access-token:$($tok.Trim())@github.com/panjihyem/opencode-repack.git" HEAD:refs/heads/hub-control-plane
```

Lalu buat PR ke `dev`.

### Lewat paket manual

1. Unggah `hyper-ai-handoff.zip` ke penyimpanan Anda.
2. Di PC baru: unduh, ekstrak, lalu

```powershell
git clone hub-control-plane.bundle opencode-repack
cd opencode-repack
git checkout hub-control-plane
```

`git checkout` wajib: clone dari bundle tidak memilih branch otomatis.

### Di PC baru

Ikuti `hub/SETUP.md`. Prasyarat: PowerShell 5.1, Hyper AI 2.1.10, Node 22, Bun 1.4.x, Git.

Yang **tidak** ikut dan harus dibuat ulang:

| Hal | Cara membuat ulang |
| --- | --- |
| Token bot Telegram | @BotFather, lalu `remote -Sub setup` di jendela interaktif |
| Pairing WhatsApp | `remote -Sub pair` (scan QR dengan nomor khusus) |
| Config provider lokal | salin `hub/config/opencode.hub.example.json`, sesuaikan `baseURL` |
| `bridge.key` Copilot | dibuat ulang oleh `account.ps1`/`start.ps1` di mesin itu |
| State Hub | `init -Root` |

## 4. Aturan yang tidak boleh dilanggar saat pindah

- Jangan menyalin `.env`, `bridge.key`, `session/`, atau `cred.txt` lewat USB, chat, atau cloud.
  Buat ulang di PC baru.
- Allowlist wajib diisi sebelum bridge dijalankan; tanpa itu semua pesan ditolak (fail-closed).
- Jangan menyalin `%LOCALAPPDATA%\HyperHub\state`; audit chain terikat ke mesin asal.
- Jangan menyentuh `config/` (bundle OTA) saat memindahkan Hub.

## 5. Definisi handoff selesai

- `git ls-remote --heads origin` menampilkan `refs/heads/hub-control-plane`, **atau** PC baru
  berhasil `git clone` dari bundle dan kelima gate exit 0.
- PR terbuka bila memakai jalur GitHub.
