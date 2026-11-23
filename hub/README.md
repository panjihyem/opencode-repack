# Hyper AI Hub

Kontrol lokal Hyper AI: job store, scheduler, audit chain, kebijakan, dan kanal remote.
Lapisan ini **tidak** mengubah aplikasi Hyper AI. Rilis aplikasi tetap dari `rebrand/`
dan workflow `repack-build`.

Status: prototipe. Eksekusi job diblokir (ADR-007).

## Isi

| Berkas | Isi |
| --- | --- |
| `Hyper-Hub.ps1` | Hub utama: `init`, `status`, `discover`, `policy-check`, `add`, `run`, `tick`, `audit`, `self-check`, `jobs`, `schedule`, `remove`, `pause`, `resume`, `health`, `backup`, `restore`, `remote` |
| `Hyper-Hub-SelfCheck.ps1` | Self-check audit chain, cron, origin policy, lock, health |
| `Hyper-Hub-ContractCheck.ps1` | Regresi fail-closed dan fungsional |
| `Hyper-Hub-SpecCheck.ps1` | Gate struktur dokumen per berkas |
| `Hyper-Hub-VersionCheck.ps1` | Cek versi executable tanpa HTTP |
| `Hyper-Hub-Redaction.ps1` | Redaksi pola PII/secret sebelum teks keluar zona case (D-09) |
| `Hyper-Hub-Attachment.ps1` | Gate lampiran: whitelist ekstensi, batas ukuran, magic bytes, virus scan wajib, karantina (F-05, F-06, D-09) |
| `Hyper-Hub-Spec-Template.md` | Templat dokumen yang lolos gate spec |
| `Hyper-AI-Backlog.csv` | Backlog 82 task (13 epic) + kolom `Status` dan `Bukti` |
| `Hyper-AI-Research-and-Plan.md` | Riset dan rencana awal |
| `docs/` | Kebijakan, ADR, runbook, hasil go/no-go |
| `flm-results/` | Hasil benchmark dan probe kualitas model lokal |
| `config/opencode.hub.example.json` | Bentuk config provider lokal (sanitasi, tanpa rahasia) |

## Mulai

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub.ps1 init -Root "$env:LOCALAPPDATA\HyperHub\state"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub.ps1 health -Root "$env:LOCALAPPDATA\HyperHub\state"
```

Panduan lengkap: `SETUP.md`. Alur kanal remote: `docs/Remote-Pairing.md`.

## Gate

Sebelum commit, semua harus exit 0:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub.ps1 self-check
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub-SelfCheck.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub-ContractCheck.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub-SpecCheck.ps1 -SelfCheck
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub-VersionCheck.ps1 -SelfCheck
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub-Redaction.ps1 -SelfCheck
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub-Attachment.ps1 -SelfCheck
```

## Batasan

- Windows + PowerShell 5.1. Runtime lain belum didukung (ADR-002, `docs/Runtime-Decision.md`).
- Satu mesin, satu runner.
- `tick` dan `run` menolak eksekusi: `Runner disabled` (ADR-007).
- Kanal `whatsapp` masih `planned`; pairing dijalankan dari folder bridge.
- State prototipe yang berisi field job tambahan atau aksi selain `local.status`/`self` kini ditolak saat dibaca. Tinjau dan migrasikan manual setelah backup; jangan menghapus audit/state untuk melewati validasi.
- Gate CI Windows ada di `.github/workflows/hyper-hub-check.yml`; CI menguji kontrak, bukan memberi persetujuan owner atau membuka gate eksekusi.
