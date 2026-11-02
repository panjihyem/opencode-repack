# ADR-004 — Zona data `case` vs `regular` dan larangan egress untuk case

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

Case mode di Hyper AI mematikan beberapa tool, tetapi **bukan sandbox**: shell masih punya akses jaringan, model cloud tetap menerima prompt dan lampiran, dan `screen` hanya menangkap pola yang dikenal. Karena itu zona data harus ditegakkan oleh Hub, bukan oleh mode engine.

## Keputusan

1. Dua zona hanya: `case` dan `regular`. Tidak ada zona ketiga di MVP. Zona tidak dikenal = `deny` (ADR-003).
2. Zona melekat pada **spec, job, run, session, dan artifact**, bukan pada proses. Jika satu langkah memakai data case, seluruh run menjadi case.
3. Zona `case`:
   - Hanya operasi lokal: `local.status`, dokumen lokal, Docling/OCR lokal, model lokal, Hindsight lokal.
   - **Dilarang keluar**: Telegram, WhatsApp/WAHA, Composio, browser/Playwright, `webfetch`/`websearch`, Context7, Graphify dengan backend cloud, remote support.
   - **Dilarang model cloud.** Hanya model lokal yang lolos review A-04.
   - Redaksi wajib sebelum prompt/lampiran, dan audit hanya menyimpan hash + jumlah redaction.
4. Zona `regular`: boleh memakai connector yang lolos registry + allowlist egress + approval; tetap tanpa secret di prompt.
5. Peningkatan zona (`regular` → `case`) boleh otomatis; penurunan zona (`case` → `regular`) **tidak boleh otomatis** dan wajib review manusia.
6. Subagent **mewarisi** zona induk dan tidak boleh mendapat zona lebih longgar (D-12/D-13).

## Alternatif

| Alternatif | Alasan ditolak |
|---|---|
| Zona per tool | Data case bisa lolos lewat tool lokal biasa |
| Zona per file saja | Prompt turunan/ringkasan tidak terlacak |
| Tiga zona (`local-only`, `general`, `admin`) | Konsep `admin` adalah lisensi/approval, bukan kerahasiaan; memetakan ke approval lebih murah |
| Mengandalkan case mode engine | Bukan sandbox, tidak mencegat semua request model |

## Konsekuensi

- Positif: satu penanda yang bisa diuji (`policy-check -Zone case`), cocok dengan kontrak prototipe yang sudah ada.
- Negatif: banyak fitur tidak tersedia untuk data kasus; menambah friksi manual.
- Wajib: label zona di setiap spec (`Zona data`), penanda zona di audit, dan 20 uji DLP (`D-09`).
- Belum menjamin: plugin memori global (`hyper-memory.ts`) tidak membawa penanda zona; isolasi memori case/regular belum dijamin oleh ADR ini.

## Rollback

Matikan job/connector zona case; bulk `case` → `regular` hanya lewat review manusia per artifact. Tidak ada downgrade massal otomatis.

## Gate manusia

| human_gate_id | status | blocks_hats | keterangan |
|---------------|--------|-------------|------------|
| HG-AUDIT-R1 | pending | 30 | Review owner sebelum ADR dijadikan aturan permanen |
