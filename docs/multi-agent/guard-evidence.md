# Guard: bukti probe awal (belum layak rilis)

`bun test test/session-model-request-hooks.test.ts` dari `packages/core`: 4 pass, 0 fail (25 Oktober 2026). Dengan hook `model.request` yang gagal, `SessionModelRequest` untuk `primary`, `compaction`, `title`, dan `generate` berhenti sebelum HTTP middleware; request WebSocket berhenti sebelum `bind`. Input memakai sentinel sintetis.

**Batas bukti:** tes ini memakai effect hook langsung, bukan plugin yang akan dibundel ke installer; tidak menguji endpoint asli, adapter Promise, tool/attachment, model switch di child session, retry, atau router upstream. Kegagalan hook saat ini adalah defect, bukan denial bertipe/UX yang aman. Jangan mengaktifkan mode master atau menjanjikan isolasi kasus dari hasil tes ini. T-12 harus memvalidasi implementasi terpasang pada build dan semua jalur keluar sebelum T-04 dibuka.
