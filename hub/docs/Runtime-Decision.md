# Spec: evaluasi runtime MVP — Electron-as-Bun vs Node portable

| Zona data | regular |
|-----------|---------|
| Status | draft — **rekomendasi: tetap PowerShell 5.1 untuk MVP; tidak memasang Node/Bun** |
| Task | B-07 |
| Dependensi | B-01 |

## Tujuan

Menetapkan runtime untuk Hyper Hub MVP. Tiga kandidat: runtime bawaan OpenCode, Node portable, atau tetap di PowerShell 5.1.

## Lingkup

- Hasil pengukuran di mesin ini (1 November 2026, Ryzen AI 7 350, RAM 16 GB):

| Kandidat | Ketersediaan | Bukti |
|---|---|---|
| Node portable | **tidak ada** | `Get-Command node` dan `npm` kosong |
| Bun terpisah | **tidak ada** | `%USERPROFILE%\.bun` hanya berisi cache installer, tanpa `bun.exe` |
| Runtime bawaan `opencode-cli.exe` | ada, tapi **tidak dapat dipakai umum** | binary tunggal; `ProductVersion` Bun 1.4.4, `--version` = `hyper-ai v2.1.10`; menjalankan `.js` ditolak (`Unexpected positional argument`) |
| PowerShell 5.1 | ada, sudah terbukti | seluruh `Hyper-Hub.ps1` berjalan; self-check, contract check, spec check exit 0 |

- Kriteria keputusan: tidak menambah runtime baru bila yang ada sudah memenuhi kontrak; tidak bergantung pada binary pihak ketiga untuk hal di luar perannya.
- `opencode-cli.exe` hanya dipakai sebagai **service yang di-discover** (`discover`, B-02), bukan sebagai runtime JS.

## Di luar lingkup

- Memasang Node/Bun (perlu keputusan owner soal supply chain, pin versi, dan SBOM — `M-05`).
- SQLite (`B-05`) — tidak ada provider, ditunda.
- Lint/format berbasis npm (`B-01`) — diganti gate PowerShell yang sudah ada.

## Jalur kegagalan

- Bila `node`/`npm` tidak ada → jangan menulis skrip yang membutuhkannya; fail-closed saat dipanggil.
- Bila `opencode-cli.exe` diganti versi baru, `discover` tetap baca-saja dan tidak mengasumsikan endpoint.
- Bila ada task yang ternyata hanya bisa dikerjakan dengan Node → dicatat sebagai blocker owner, bukan dipaksakan.
- Runtime tak dikenal → tidak dipakai sama sekali.

## Kriteria penerimaan

- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub-SpecCheck.ps1 -Spec .\docs\Runtime-Decision.md` → `issues` hanya gate `HG-AUDIT-R1`, exit 2 sampai disetujui.
- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub.ps1 discover` → menemukan service loopback, `externalRequests: false`.
- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub-SelfCheck.ps1` → exit 0 tanpa Node.
- `Get-Command node -ErrorAction SilentlyContinue` kosong, dan tidak ada skrip Hub yang memanggil `node`/`npm` (`Select-String -Path .\Hyper-Hub*.ps1 -Pattern 'node|npm'`).

## Gate manusia

| human_gate_id | status | blocks_hats | keterangan |
|---------------|--------|-------------|------------|
| HG-AUDIT-R1 | pending | 30 | Review manusia sebelum implementasi |
