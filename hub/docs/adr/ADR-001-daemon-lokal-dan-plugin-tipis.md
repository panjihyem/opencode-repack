# ADR-001 — Daemon lokal Hyper Hub + plugin tipis, tanpa memfork engine

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

Hyper AI 2.1.10 adalah repack OpenCode. Engine menangani session, model, tool, dan permission. Kebutuhan Hyper Hub (job terjadwal, policy, approval, audit, kanal eksternal) tidak dimiliki engine dan tidak stabil tersedia sebagai API native (`experimental.schedules` baru di 2.2.5).

Memfork engine akan memutakhirkan diri hilang setiap rilis Hyper AI dan menambah permukaan bug pada komponen yang tidak kita kendalikan.

## Keputusan

1. Hyper Hub berjalan sebagai **proses daemon lokal terpisah**, bind `127.0.0.1` saja.
2. Integrasi dengan engine lewat **plugin tipis** `hyper-hub-bridge` yang hanya: mendaftarkan tool `hub_*`, memasang hook `prompt` / `tool.execute.before` / `shell.create.before`, dan meneruskan permission. Tanpa business logic di plugin.
3. Semua keputusan (policy, lease, approval, audit) diambil di daemon.
4. Tidak ada fork/patch biner engine. Tidak ada modifikasi database engine.

## Alternatif

| Alternatif | Alasan ditolak |
|---|---|
| Semua di dalam plugin engine | Plugin mati bila engine crash; eksekusi job terjadwal bergantung sesi UI; tidak bisa jalan saat app tertutup |
| Fork engine | Maintenance tinggi, tiap rilis Hyper AI harus di-rebase |
| Daemon tanpa plugin | Tidak ada intersepsi prompt/tool; tidak ada audit real-time |
| Sidecar MCP penuh | Bisa, tapi menambah hop; MCP tidak cocok untuk approval/lease jangka panjang |

## Konsekuensi

- Positif: engine tetap engine; Hub bisa update/hidup-matikan sendiri; rollback mudah (hapus plugin, engine kembali ke kondisi semula).
- Negatif: dua proses, dua versi skema plugin (V1/V2), perlu service discovery dan health check.
- Wajib: health check daemon, single-instance lock, dan fail-closed bila plugin absen (lihat ADR-003).
- Batas: plugin tidak bisa mencegat semua request model. Klaim "secure case end-to-end" tidak boleh dibuat dari ADR ini.

## Rollback

Hapus/disable `hyper-hub-bridge` dari konfigurasi engine (backup konfigurasi lama sudah disimpan). Matikan daemon. Tidak ada state engine yang berubah, sehingga rollback = satu perubahan konfigurasi + stop proses.

## Gate manusia

| human_gate_id | status | blocks_hats | keterangan |
|---------------|--------|-------------|------------|
| HG-AUDIT-R1 | pending | 30 | Review owner sebelum ADR dijadikan aturan permanen |
