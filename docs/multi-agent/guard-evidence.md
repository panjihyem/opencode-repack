# Guard: bukti probe awal (belum layak rilis)

`bun test test/session-model-request-hooks.test.ts` dari `packages/core`: 4 pass, 0 fail (25 Oktober 2026). Dengan hook `model.request` yang gagal, `SessionModelRequest` untuk `primary`, `compaction`, `title`, dan `generate` berhenti sebelum HTTP middleware; request WebSocket berhenti sebelum `bind`. Input memakai sentinel sintetis.

**Batas bukti:** probe awal memakai effect hook langsung; belum menguji endpoint asli, tool/attachment, model switch di child session, retry, atau router upstream. Kegagalan hook saat ini adalah defect, bukan denial bertipe/UX yang aman. Jangan mengaktifkan mode master atau menjanjikan isolasi kasus dari hasil tes ini. T-12 harus memvalidasi implementasi terpasang pada build dan semua jalur keluar sebelum T-04 dibuka.

Probe tambahan memakai `PluginPromise.fromPromise` dan hook `model.request` yang melempar. Persiapan request `primary` gagal sebelum transport; suite menjadi 5 pass. Ini memeriksa adapter Promise, **bukan** plugin terpasang pada installer. Penolakan masih defect dan belum menjamin semua hasil tool, konteks memori, maupun opsi model pindah aman. Belum cukup untuk membuka T-12.
