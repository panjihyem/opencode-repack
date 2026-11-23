# Hyper AI Hub

Kontrol lokal Hyper AI: job store, scheduler, audit chain, kebijakan, dan kanal remote.
Lapisan ini **tidak** mengubah aplikasi Hyper AI. Rilis aplikasi tetap dari `rebrand/`
dan workflow `repack-build`.

Status: prototipe. Eksekusi job diblokir (ADR-007).

## Isi

| Berkas | Isi |
| --- | --- |
| `Hyper-Hub.ps1` | Hub utama: `init`, `status`, `discover`, `policy-check`, `add`, `run`, `tick`, `audit`, `self-check`, `jobs`, `schedule`, `remove`, `pause`, `resume`, `health`, `backup`, `restore`, `secret`, `api`, `connector`, `policy`, `runner`, `approval`, `remote` |
| `Hyper-Hub-SelfCheck.ps1` | Self-check audit chain, cron, origin policy, lock, health |
| `Hyper-Hub-ContractCheck.ps1` | Regresi fail-closed dan fungsional |
| `Hyper-Hub-SpecCheck.ps1` | Gate struktur dokumen per berkas |
| `Hyper-Hub-VersionCheck.ps1` | Cek versi executable tanpa HTTP |
| `Hyper-Hub-Redaction.ps1` | Redaksi pola PII/secret sebelum teks keluar zona case (D-09) |
| `Hyper-Hub-Attachment.ps1` | Gate lampiran: whitelist ekstensi, batas ukuran, magic bytes, virus scan wajib, karantina (F-05, F-06, D-09) |
| `Hyper-Hub-Connector.ps1` | Registry connector ADR-007: gate `validated`, egress allowlist, secret_ref, review (N-10) |
| `Hyper-Hub-Policy.ps1` | Policy engine deterministik aksi x resource x zona; baseline `config/policy.default.json` (D-03) |
| `Hyper-Hub-Migrate.ps1` | Migrasi permission V1 -> policies V2 dengan backup dan rollback terverifikasi (D-01) |
| `Hyper-Hub-AgentCheck.ps1` | Gate izin minimal agent `hyper-ops` (D-02) |
| `Hyper-Hub-AuditAnchor.ps1` | Anchor harian audit di luar root state; deteksi truncation/rewrite (D-05) |
| `Hyper-Hub-Approval.ps1` | Approval broker: nonce sekali pakai, expiry deny, audit sendiri (D-07) |
| `Hyper-Hub-SecurityCheck.ps1` | Suite keamanan internal 25 uji: SSRF, traversal, replay, secret, case-egress (D-10) |
| `Hyper-Hub-Sbom.ps1` | SBOM + skrining lisensi workspace, tanpa jaringan; review AGPL/SSPL (M-05) |
| `Hyper-Hub-Jdih.ps1` | Fetch+sync JDIH idempotent, gate connector, anti-injeksi (F-02) |
| `Hyper-Hub-LoadCheck.ps1` | Uji paralel/restart/failure-injection runner (M-02) |
| `Hyper-Hub-ContractVersion.ps1` | Kontrak versi engine tanpa HTTP; tolak versi lama/rusak (M-01, C-09) |
| `Hyper-Hub-Recap.ps1` | Rekap mingguan ber-provenance dan reminder snooze/done lokal (F-08, F-09) |
| `Hyper-Hub-RunbookCheck.ps1` | Drill runbook otomatis: start/stop/backup/restore/rollback (B-08) |
| `Hyper-Hub-Release.ps1` | Manifest rilis + tanda tangan RSA-SHA256, verifikasi, rollback artifact (M-07) |
| `Hyper-Hub-Channel.ps1` | Logika kanal: dedupe update_id, rate limit, perintah, callback approval (E-02..E-04) |
| `Hyper-Hub-Hook.ps1` | Hook audit plugin/bridge: nama tool + hash, tanpa payload mentah (D-06) |
| `Hyper-Hub-NativeAdapter.ps1` | Kontrak adapter scheduler native 2.2.x dengan capability + opt-in (C-08) |
| `Hyper-Hub-Browser.ps1` | Validasi sidecar browser: versi pin, profil isolasi, telemetry mati (G-01) |
| `Hyper-Hub-Download.ps1` | Unduhan JDIH terkontrol: allowlist, MIME, ukuran, nama hash (G-03) |
| `Hyper-Hub-Provenance.ps1` | Provenance naskah resmi: URL, hash ganda, versi alat (G-04) |
| `Hyper-Hub-GraphBaseline.ps1` | Baseline 50 pertanyaan relasi hindsight vs graph (J-01) |
| `Hyper-Hub-Acceptance.ps1` | Harness simulasi 14 hari: JDIH, karantina, rerun idempoten, rekap (F-10) |
| `Hyper-Hub-Desktop.ps1` | Gate aksi desktop: write/delete wajib approval, screenshot tanpa isi (H-03) |
| `Hyper-Hub-GraphContract.ps1` | Kontrak graph: provenance source, tanggal valid, tanpa zona kasus (J-02) |
| `Hyper-Hub-Index.ps1` | Indeks artefak benchmark lokal dari `flm-results` (N-06) |
| `Hyper-Hub-Permission.ps1` | Turunkan `permission.*=allow` ke deny-by-default + rollback (N-05) |
| `Hyper-Hub-ProviderHealth.ps1` | Cek provider lokal/remote dan klaim tool calling tanpa bocor apiKey (N-02..N-04) |
| `Hyper-Hub-Rerun.ps1` | Klasifikasi komparabilitas 19 CSV benchmark; daftar ulang (N-07) |
| `agents/hyper-ops.md` | Agent operasi lokal baca-saja tanpa shell/edit/jaringan/subagent |
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
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub-Connector.ps1 -SelfCheck
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub-Policy.ps1 -SelfCheck
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub-Migrate.ps1 -SelfCheck
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub-AgentCheck.ps1 -SelfCheck
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub-AuditAnchor.ps1 -SelfCheck
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub-Approval.ps1 -Action self-check
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub-SecurityCheck.ps1 -SelfCheck
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub-Sbom.ps1 -SelfCheck
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub-Jdih.ps1 -SelfCheck
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub-LoadCheck.ps1 -SelfCheck
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub-ContractVersion.ps1 -SelfCheck
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub-Recap.ps1 -Sub self-check
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub-RunbookCheck.ps1 -SelfCheck
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub-Release.ps1 -SelfCheck
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub-Channel.ps1 -SelfCheck
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub-Hook.ps1 -SelfCheck
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub-NativeAdapter.ps1 -SelfCheck
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub-Browser.ps1 -SelfCheck
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub-Download.ps1 -SelfCheck
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub-Provenance.ps1 -SelfCheck
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub-GraphBaseline.ps1 -SelfCheck
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub-Desktop.ps1 -SelfCheck
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub-GraphContract.ps1 -SelfCheck
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub-Index.ps1 -SelfCheck
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub-Permission.ps1 -SelfCheck
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub-ProviderHealth.ps1 -SelfCheck
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub-Rerun.ps1 -SelfCheck
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub-Acceptance.ps1 -SelfCheck
```

## Batasan

- Windows + PowerShell 5.1. Runtime lain belum didukung (ADR-002, `docs/Runtime-Decision.md`).
- Satu mesin, satu runner.
- `tick` dan `run` menolak eksekusi tanpa opt-in: `runner enable -Actor <nama>` menulis `runner.enabled`; tanpa itu `Runner disabled`. Runner hanya menjalankan `local.status`; `connector.call`/`external.send` tetap ditolak policy.
- Runner memakai `runner.lock` eksklusif, timeout 30 detik (kill process tree), retry 3x backoff eksponensial, lalu dead-letter di `state.json.runs`.
- Job yang terlambat lebih dari grace 120 menit tidak dijalankan menumpuk: dicatat `job.missed`, `nextRunUtc` dimajukan.
- API loopback menyediakan `/health`, `/status`, `/approvals`, `/approvals/get?id=` dengan bearer DPAPI; payload tidak memuat nilai sensitif.
- Kanal `whatsapp` masih `planned`; pairing dijalankan dari folder bridge.
- State prototipe yang berisi field job tambahan atau aksi selain `local.status`/`self` kini ditolak saat dibaca. Tinjau dan migrasikan manual setelah backup; jangan menghapus audit/state untuk melewati validasi.
- Gate CI Windows ada di `.github/workflows/hyper-hub-check.yml`; CI menguji kontrak, bukan memberi persetujuan owner atau membuka gate eksekusi.
