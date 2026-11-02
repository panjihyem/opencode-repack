# ADR-002 — Prototipe PowerShell 5.1 + JSON atomik sebagai batas sementara

| Zona data | regular |
|-----------|---------|
| Status | proposed (pending owner approval) |
| Tanggal | 1 November 2026 |
| Keputusan ditandai | REKOMENDASI — belum disetujui owner |

## Tujuan

ADR ini menetapkan keputusan di `## Keputusan` sebagai aturan yang mengikat Hyper Hub, bukan kondisi sementara.

## Lingkup

- Lihat `## Keputusan` di bawah: aturan yang mengikat Hyper Hub.

## Di luar lingkup

- Keputusan alternatif yang ditolak; lihat `## Alternatif`.

## Jalur kegagalan

- Konfigurasi/policy/audit gagal -> aksi diblokir (fail-closed), alasan dicatat ke audit. Konsekuensi lengkap lihat `## Konsekuensi`.

## Kriteria penerimaan

- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub-ContractCheck.ps1`
- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub-SpecCheck.ps1 -Spec <berkas ini>`

## Konteks

Mesin ini tidak memiliki Node, Python, Bun, .NET SDK, maupun SQLite provider. Hyper AI membawa Electron, tetapi menjalankan daemon di dalamnya melanggar ADR-001. Yang tersedia hanya PowerShell 5.1 (Windows bawaan).

Prototipe `Hyper-Hub.ps1` saat ini memakai `state.json` dengan tulis atomik dan `audit.jsonl` hash-chain, plus exclusive lock untuk runner.

## Keputusan

1. **Fase 0–1** bertahan pada PowerShell 5.1 + `state.json` (write-to-temp + rename) + `audit.jsonl` append-only.
2. State JSON adalah **batas satu mesin, satu runner, satu writer**. Tidak ada concurrent worker.
3. Audit dibaca linear; cukup untuk < 10.000 event.
4. **Kriteria pindah ke SQLite** — pindahkan bila salah satu terpenuhi:
   - perlu > 1 concurrent worker atau > 1 writer;
   - query audit 10.000 event melewati 1 detik;
   - perlu transaksi multi-tabel (lease + run_steps + approvals) yang harus konsisten;
   - perlu restore/backup teruji dengan WAL;
   - muncul kebutuhan migrasi skema berversi di lapangan.
5. Runtime setelah pindah: Node portable 22 LTS atau `bun build --compile` menjadi `hyper-hub.exe` (B-05/B-07), bukan Node dari instalasi global.

## Alternatif

| Alternatif | Alasan ditolak sekarang |
|---|---|
| Langsung SQLite | Tidak ada provider/driver di mesin; menambah dependensi biner tidak terverifikasi |
| LiteDB / in-memory | Bukan stdlib, lisensi/driver belum direview |
| XML/CSV state | Tidak atomik secara semantik, sulit skema |
| JSON per file (satu file per job) | Banyak file, lock antar-file rapuh |

## Konsekuensi

- Positif: nol dependensi, bisa diaudit, jalan di mesin apa pun ber-Windows.
- Negatif: PowerShell lambat untuk eksekusi jangka panjang; tanpa transaksi; tanpa foreign key; cross-platform nol.
- Risiko: state JSON dan audit bisa ditulis ulang oleh admin lokal (lihat ADR-005).
- Skrip PowerShell prototipe **bukan produk akhir**; kontrak CLI-nya yang dipertahankan saat migrasi.

## Rollback

State JSON tetap sumber kebenaran sampai migrasi selesai. Migrasi = skrip konversi sekali jalan dengan backup `state.json` + `audit.jsonl`; bila gagal, hapus DB baru dan kembalikan dua file tersebut. Tidak ada data dihapus sebelum verifikasi.

## Gate manusia

| human_gate_id | status | blocks_hats | keterangan |
|---------------|--------|-------------|------------|
| HG-AUDIT-R1 | pending | 30 | Review owner sebelum ADR dijadikan aturan permanen |
