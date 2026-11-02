# ADR-007 — Eksekusi job diblokir sampai connector registry tervalidasi

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

`add` kini **memvalidasi dan menyimpan** job (mencatat `job.added`), lalu mencetak `executable: false`; tidak ada proses yang dijalankan. `run` selalu gagal, dan `tick` berhenti dengan pesan "Runner disabled: connector registry and reviewed job schema not implemented"; `tick -DryRun` hanya melaporkan job jatuh tempo dengan `launched: 0`. Ini konsisten dengan fail-closed: penyimpanan job tidak sama dengan izin eksekusi. Risikonya: gate ini dilemahkan secara ad-hoc saat butuh demo — karena itu eksekusi tetap diblokir di satu titik (`tick`/`run`), bukan di `add`.

## Keputusan

1. **Gate keras:** daemon menolak setiap eksekusi langkah yang memerlukan connector bila registry tidak memuat entri berstatus `validated`. Kondisi `draft`/`spike`/`unknown` = eksekusi ditolak.
2. Entri registry minimal wajib punya:
   - `id`, `type`, `zona_diizinkan` (`regular` saja untuk MVP), `enabled`;
   - `version` terverifikasi server/base, bukan dari metadata biner;
   - `egress` — host/port/protokol allowlist, tanpa redirect;
   - `secret_ref` — referensi ke DPAPI/Credential Manager, **bukan nilai secret** (B-03);
   - `timeout`, `retry`, `circuit breaker`, `rate limit`;
   - `audit_hook` terpasang;
   - `review` — reviewer + tanggal + hasil test.
3. `external.send` untuk zona regular tetap ditolak sampai connector-nya `validated` (perilaku prototipe dipertahankan: "needs reviewed connector and approval").
4. Semua connector keluar (Telegram/WAHA/Composio/Playwright/Hindsight/Windows-MCP/MeshCentral) lewat registry yang sama — tidak ada jalur langsung.
5. Perubahan entri registry diaudit; dicabut (`revoked`) berarti job yang memakainya berhenti pada langkah berikutnya.

## Alternatif

| Alternatif | Alasan ditolak |
|---|---|
| Allowlist di kode per connector | Tidak terpusat; sulit diaudit |
| Konfigurasi bebas di spec job | Spec bisa menyelundupkan tujuan keluar |
| Membuka gate setelah "satu job demo jalan" | Demo menjadi preseden; gate jadiformalitas |

## Konsekuensi

- Positif: satu titik kontrol untuk semua egress; mudah diuji (`D-10`).
- Negatif: onboarding connector lebih lambat; butuh reviewer manusia.
- Ketergantungan: `D-04` (egress allowlist), `D-05` (audit), `B-03` (secret store), `A-04` (lisensi dependency).
- Terkait: gate ini adalah bagian dari kriteria exit Fase 0 dan syarat `M-00`.

## Rollback

Cabut (`revoked`) entri connector yang bermasalah; gate tetap tertutup untuk entri itu. Tidak ada rollback ke mode "tanpa registry".

## Gate manusia

| human_gate_id | status | blocks_hats | keterangan |
|---------------|--------|-------------|------------|
| HG-AUDIT-R1 | pending | 30 | Review owner sebelum ADR dijadikan aturan permanen |
