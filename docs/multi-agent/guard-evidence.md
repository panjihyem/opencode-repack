# Guard: bukti probe awal (belum layak rilis)

`bun test test/session-model-request-hooks.test.ts` dari `packages/core`: 4 pass, 0 fail (25 Oktober 2026). Dengan hook `model.request` yang gagal, `SessionModelRequest` untuk `primary`, `compaction`, `title`, dan `generate` berhenti sebelum HTTP middleware; request WebSocket berhenti sebelum `bind`. Input memakai sentinel sintetis.

**Batas bukti:** probe awal memakai effect hook langsung; belum menguji endpoint asli, tool/attachment, model switch di child session, retry, atau router upstream. Kegagalan hook saat ini adalah defect, bukan denial bertipe/UX yang aman. Jangan mengaktifkan mode master atau menjanjikan isolasi kasus dari hasil tes ini. T-12 harus memvalidasi implementasi terpasang pada build dan semua jalur keluar sebelum T-04 dibuka.

Probe tambahan memakai `PluginPromise.fromPromise` dan hook `model.request` yang melempar. Persiapan request `primary` gagal sebelum transport; suite menjadi 5 pass. Ini memeriksa adapter Promise, **bukan** plugin terpasang pada installer. Penolakan masih defect dan belum menjamin semua hasil tool, konteks memori, maupun opsi model pindah aman. Belum cukup untuk membuka T-12.

**Bypass terbukti di checkout:** dua hook `http.request` berjalan berurutan; hook pertama memeriksa host `approved.example.test`, hook kedua mengganti URL ke `unapproved.example.test`. Fake HTTP handler menerima URL pengganti (suite: 6 pass). Jadi plugin guard yang hanya memasang hook lebih awal **bukan** security boundary: plugin lain dapat menimpa request kemudian. Enforcement final harus berada setelah seluruh transform/hook dan sebelum handler transport; untuk WebSocket juga sebelum send aktual. Audit instalasi upstream harus membuktikan posisi gate tersebut. Ini alasan T-12 tetap blocked sampai perubahan core/overlay dan tes negatif selesai.

## Syarat pembukaan T-12

| Jalur | Titik pemeriksaan wajib | Tes negatif |
|---|---|---|
| HTTP model (primary, compaction, title, generate) | Setelah semua hook `http.request`, persis sebelum `handler(sent)` di `packages/core/src/session/model-request.ts` | Hook belakangan mengganti host/model/payload; fake handler menerima **nol** byte |
| WebSocket model | Setelah `experimental.ws.handshake` dan `experimental.ws.send`, sebelum `open(...)` dan `sendText(message)` di `packages/core/src/session/model-transport.ts` | URL/frame terlarang tidak terkoneksi/terkirim, termasuk saat reuse/fallback HTTP |
| Tool langsung dan Code Mode | Sebelum eksekutor tool di `packages/core/src/tool.ts`, termasuk tool nested | `shell`, MCP, `read`, `edit`, dan permintaan `execute` di luar izin tidak berjalan |
| Context | Sebelum setiap model call, ikat session/child, klasifikasi, model efektif dan berkas yang benar-benar dibaca ke persetujuan | Model switch, child prompt, lampiran, compaction, memory, hasil tool atau retry tanpa scope ditolak |

Satu hook biasa tidak cukup: urutan hook dan kode tool yang dieksekusi dengan hak OS membuat allowlist prompt atau izin agent semata tidak menjadi isolasi. Guard harus bersumber dari policy proyek yang tervalidasi, aktif hanya bila project memilih mode ini, dan gagal tertutup saat policy/consent hilang. Policy tidak boleh berasal dari teks prompt maupun metadata yang dapat ditulis model. Audit hanya boleh mencatat identitas job, ID model, status keputusan, dan hash input; **jangan** mencatat prompt, PII, atau token map. Tanpa bukti semua baris, master tetap tidak dipasang sebagai default atau ditawarkan untuk kasus sensitif.

## Progres T-12 belum memenuhi gerbang

Checkout lokal sekarang memiliki kandidat hook `session.outbound.guard` sesudah hook HTTP dan sebelum handler, serta pemeriksaan endpoint/frame WebSocket sebelum koneksi dan pengiriman. Tes fake HTTP/WS lulus; `agent-guard.ts` masih helper, belum diregistrasikan ke sesi/task nyata atau dikirim via overlay installer. `tool.execute.guard` juga belum didaftarkan dengan scope kasus nyata. **Jangan gunakan hasil tes ini sebagai bukti data kasus terlindungi.** Sebelum lulus: ikat scope ke sesi yang tidak bisa ditulis model, uji request lengkap berisi attachment/hasil tool, pastikan provider upstream dan fallback sesuai izin, uji instalasi overlay, lalu jalankan tes negatif pada semua jalur keluar.
