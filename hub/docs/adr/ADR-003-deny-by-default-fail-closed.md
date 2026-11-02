# ADR-003 — Deny-by-default dan fail-closed saat policy/audit tidak tersedia

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

Prototipe sudah menolak `run`, `add` hanya menyimpan dengan `executable: false`, dan `tick` berhenti bila audit tidak valid. Urutan ini harus jadi aturan permanen, bukan kondisi sementara. `ask` (permission mode) tidak boleh dipakai untuk job unattended tanpa approval broker hidup.

## Keputusan

1. **Default deny.** Aksi tanpa aturan eksplisit = `deny`. Zona atau operasi yang tidak terklasifikasi = `deny` dengan alasan tertulis.
2. **Fail-closed**, artinya job/aksi dihentikan (bukan "lanjut dengan asumsi aman"), bila salah satu terjadi:
   - policy engine tidak tersedia / error;
   - audit tidak dapat ditulis atau hash-chain gagal diverifikasi;
   - state hilang padahal audit ada, atau audit hilang padahal state ada;
   - approval broker tidak hidup tetapi aksi butuh approval;
   - connector belum tervalidasi (lihat ADR-007);
   - zona data tidak diketahui.
3. Setiap penolakan fail-closed **dicatat ke audit** beserta `reason`. Bila audit itu sendiri rusak, keluar dengan error dan tidak ada aksi.
4. `allow` untuk operasi baca-status (`local.status`) **tidak** memberi izin eksekusi. Setiap izin bersifat spesifik per `action` + `resource` + `zone`.
5. Approval yang timeout/expired = `deny`, bukan `allow`.

## Alternatif

| Alternatif | Alasan ditolak |
|---|---|
| Default allow + deny list | Gagal terbuka saat aturan baru muncul |
| Fail-open dengan peringatan | Job background berjalan tanpa audit; melanggar syarat pilot (M-06) |
| `ask` sebagai default | Job unattended akan menggantung atau auto-pilih |

## Konsekuensi

- Positif: kegagalan konfigurasi tidak berubah jadi insiden keamanan.
- Negatif: lebih banyak job gagal dan butuh operasi manual untuk pulih.
- Wajib: pesan error jelas dan runbook (B-08).
- Uji wajib: matriks zona tak dikenal, audit rusak, policy kosong — sudah dicakup `Hyper-Hub-ContractCheck.ps1`, harus diperluas di `D-10`.

## Rollback

Tidak ada rollback untuk prinsip ini. Yang bisa dikembalikan hanya penyempitan aturan (menambah `allow` spesifik), dan itu pun harus lewat spec gate + review manusia.

## Gate manusia

| human_gate_id | status | blocks_hats | keterangan |
|---------------|--------|-------------|------------|
| HG-AUDIT-R1 | pending | 30 | Review owner sebelum ADR dijadikan aturan permanen |
