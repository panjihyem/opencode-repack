# ADR-006 — Scheduler lokal sebagai default, native scheduler sebagai adapter opsional

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

Scheduler native (`experimental.schedules`) baru tersedia di OpenCode 2.2.5, sedangkan Hyper AI terpasang 2.1.10. Versi repack tertinggal dari upstream; mengandalkan fitur experimental berarti job hilang pada rilis apa pun. Sebaliknya, membangun semuanya sendiri berarti melewatkan fitur engine yang mungkin lebih baik di masa depan.

## Keputusan

1. **`LocalSchedulerDriver` = default dan satu-satunya yang aktif.** croner (MIT) + penyimpanan lokal, timezone `Asia/Jakarta`, catch-up grace window default 6 jam.
2. Antarmuka `SchedulerDriver`: `create`, `pause`, `resume`, `remove`, `list`, `onFire` — sama untuk semua driver.
3. **`NativeSchedulerDriver` = adapter opsional** (C-08). Aktif hanya bila dua syarat terpenuhi bersamaan:
   - capability terdeteksi (versi server ≥ 2.2.5 **terverifikasi**, bukan metadata biner);
   - opt-in eksplisit owner di konfigurasi.
4. Migrasi lokal → native wajib: dry-run, dual-run yang dimatikan, dan rollback satu perintah. Tidak ada migrasi otomatis.
5. Job spec disimpan sebagai data milik Hub; driver hanya mengeksekusi, tidak menyimpan kebenaran.

## Alternatif

| Alternatif | Alasan ditolak |
|---|---|
| Native sebagai default | Tidak tersedia di 2.1.10; experimental bisa berubah |
| Kronjob Windows Task Scheduler sebagai default | Tidak portable, approval/audit sulit, tidak tahu zona |
| Hanya lokal, tanpa adapter | Menutup jalan saat native stabil |

## Konsekuensi

- Positif: perilaku sama di kedua versi; bisa diuji (C-09); bila engine update, tidak ada perubahan.
- Negatif: dua implementasi untuk diuji; bug sinkronisasi saat dual-run.
- Wajib: contract test 2.1.10 dan 2.2.5; mencegah job ganda (idempotency key + lease).

## Rollback

Nonaktifkan `native` di konfigurasi dan jalankan `resume` pada driver lokal. Jadwal lokal tidak pernah dihapus saat migrasi, sehingga rollback = satu flag.

## Gate manusia

| human_gate_id | status | blocks_hats | keterangan |
|---------------|--------|-------------|------------|
| HG-AUDIT-R1 | pending | 30 | Review owner sebelum ADR dijadikan aturan permanen |
