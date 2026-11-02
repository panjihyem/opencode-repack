# ADR-005 — Audit hash-chain lokal tanpa anchor eksternal, dan batasnya

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

Prototipe menulis `audit.jsonl` dengan `previousHash` + SHA-256 kanonik, memverifikasi rantai saat `tick`, dan mendeteksi baris tambahan/rusak. Ini **tamper-evident**, bukan **tamper-proof**: penyerang yang menguasai mesin dan file dapat menghapus/rewrite seluruh rantai lalu menyesuaikan head di `state.json`.

## Keputusan

1. Fase 0–1 memakai **hash-chain lokal saja**: `previousHash` + SHA-256 atas record kanonik berurutan, head disimpan di `state.json` dan dibandingkan antarverifikasi.
2. Audit **tidak menyimpan prompt, lampiran, atau token mentah** — hanya hash, panjang, jumlah redaction, dan metadata keputusan.
3. Klaim yang **tidak boleh** dibuat: audit ini bukan bukti legal terhadap insider yang memiliki akses tulis penuh ke mesin.
4. **Rencana anchor** (lihat kriteria aktivasi):
   - Anchor harian: hash head + timestamp ditulis ke file terpisah di lokasi berbeda (atau dikirim ke Hindsight lokal sebagai blob append-only).
   - Fase lanjut: WORM/immutable storage, sinkronisasi ke kotak terpisah, atau notarisasi pihak ketiga.
   - Aktivasi anchor wajib sebelum **Fase 2** atau sebelum ada data case dalam scope, mana yang lebih dulu.

## Alternatif

| Alternatif | Alasan ditolak |
|---|---|
| Sigstore/Rekor publik | Data kasus tidak boleh keluar; hanya hash saja pun butuh review |
| Append ke Windows Event Log | Mudah dihapus admin; kapasitas terbatas; format tidak kanonik |
| Remote syslog | Egress keluar melanggar zona case |
| Tanpa audit sama sekali | Melanggar syarat pilot |

## Konsekuensi

- Positif: sederhana, nol dependensi, cepat, bekerja offline.
- Negatif: gap integritas terhadap insider; tidak tahan manipulasi seluruh volume; rentan bila audit dan state dihapus bersamaan (ContractCheck sudah memblokir kasus ini saat `init`).
- Wajib: `M-04` drill backup/restore audit + hash head, dan verifikasi rantai saat start.

## Rollback

Anchor bersifat tambahan dan tidak mengubah rantai. Bila anchor bermasalah, hentikan penulisan anchor; rantai utama tetap utuh dan diverifikasi seperti sebelumnya.

## Gate manusia

| human_gate_id | status | blocks_hats | keterangan |
|---------------|--------|-------------|------------|
| HG-AUDIT-R1 | pending | 30 | Review owner sebelum ADR dijadikan aturan permanen |
