# Setup Hyper AI Hub

Panduan pemasangan dari nol di Windows 10/11.

## Prasyarat

| Komponen | Versi | Wajib |
| --- | --- | --- |
| PowerShell | 5.1 (bawaan Windows) | ya |
| Hyper AI (`hyper-ai` / `opencode-cli.exe`) | 2.1.10 | ya, untuk ACP |
| Node.js | 22 LTS | ya, untuk bridge Telegram |
| Bun | 1.4.x | ya, untuk bridge WhatsApp |
| Git | terbaru | ya |

Node dan Bun di luar `PATH` pada sistem ini. Path yang dipakai:

```text
C:\Program Files\nodejs\node.exe
%USERPROFILE%\.bun\bin\bun.exe
```

## 1. Inisialisasi state

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub.ps1 init -Root "$env:LOCALAPPDATA\HyperHub\state"
```

State, audit, dan lock disimpan di `-Root`, di luar OneDrive. `init` menolak berjalan bila
audit ada tetapi state hilang.

## 2. Periksa kesehatan

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub.ps1 health -Root "$env:LOCALAPPDATA\HyperHub\state"
```

Yang diperiksa: `auditChain`, `lockFree`, jumlah job, `nextRunUtc`, antrean approval.

## 3. Verifikasi versi tanpa HTTP

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub-VersionCheck.ps1 -SelfCheck
```

Endpoint HTTP service tidak dipakai: `/openapi.json` membalas 401 dan `authChecked: false`.

## 4. Kanal remote

### Telegram

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub.ps1 remote -Sub allow -Channel telegram -OwnerId <ID>
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub.ps1 remote -Sub setup -Channel telegram -OwnerId <ID> -ModelProvider <p> -ModelId <m>
```

`setup` meminta token bot lewat prompt tersembunyi; jalankan di jendela PowerShell
interaktif. Detail: `docs/Remote-Pairing.md`.

### WhatsApp

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub.ps1 remote -Sub allow -Channel whatsapp -OwnerId 081234567890
```

Bridge memakai `ominiverdi/opencode-chat-bridge` (MIT) dengan Baileys. Path bridge:
`%LOCALAPPDATA%\HyperHub\remote-whatsapp`.

```powershell
cd "$env:LOCALAPPDATA\HyperHub\remote-whatsapp"
& "$env:USERPROFILE\.bun\bin\bun.exe" install
$env:OPENCODE_PATH = "$env:APPDATA\ai.hyperai.desktop\cli\2.1.10-x64\opencode-cli.exe"
$env:WHATSAPP_ALLOWED_USERS = "6281234567890"
$env:WHATSAPP_RESPOND_TO_OTHERS = "false"
$env:BRIDGE_AGENT = "plan"
& "$env:USERPROFILE\.bun\bin\bun.exe" run connectors/whatsapp.ts
```

QR tampil di terminal, atau ditulis ke `qr.txt` bila `BRIDGE_QR_FILE` diatur.

## 5. Model lokal (opsional)

Lihat `config/opencode.hub.example.json` dan `docs/Local-Model-Testing.md`. Server FLM harus
berjalan sebelum model `flm/*` dipakai; tanpa server, permintaan gagal `ECONNREFUSED`.

## 6. Gate

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub.ps1 self-check
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub-SelfCheck.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub-ContractCheck.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub-SpecCheck.ps1 -SelfCheck
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub-VersionCheck.ps1 -SelfCheck
```

Semua harus exit 0 sebelum commit.

## Troubleshooting

| Gejala | Sebab | Tindakan |
| --- | --- | --- |
| `Hub not initialized; run init first.` | `-Root` belum dibuat | jalankan `init` |
| `Another runner holds lock` | proses lain memegang lock | tunggu atau hentikan proses itu |
| `Runner disabled` | ADR-007 | bukan error: eksekusi memang diblokir |
| `ECONNREFUSED 127.0.0.1:52624` | server FLM mati | jalankan `flm.exe serve <model>` |
| `Cannot validate argument on parameter 'Command'` | perintah tidak ada | lihat daftar di pesan galat |
| ACL `.env` gagal | `icacls` ditolak | pastikan `.env` ada di folder yang Anda miliki |
