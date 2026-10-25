# Multi-agent orchestration with data-safe routing

## Problem

Hyper AI memiliki subagent bawaan `explore`/`general`, skill domain, child session foreground/background, dan inbox pesan `steer`/`queue`. Belum ada master default yang merutekan pekerjaan ke agen dokumen, data, kasus, dan reviewer berdasarkan izin data, model, dan tool. Skill saja tidak membatasi tool atau provider. Mode kasus sekarang memblokir sebagian integrasi luar, tetapi model agen tetap remote dan `shell` masih dapat mengakses jaringan (`rebrand/files/desktop/hyper/case/casemode.py`). Fallback Hindsight tidak sama dengan fallback agent. Tanpa aturan eksplisit, paralelisme justru mereplikasi data rahasia dan fallback berisiko memindahkannya ke provider yang tidak disetujui.

## Scope

In: master opt-in untuk pekerjaan multi-langkah; klasifikasi data dan izin per project/kasus; agen explorer, extractor, analyst, investigator, writer, reviewer dengan model/tool/akses berbeda; handoff dan batas paralel; fallback fail-closed; queue pesan tanpa interupsi; audit metadata; uji end-to-end dengan data sintetis; panduan dan packaging overlay Hyper AI.

Out: menjadikan master default untuk seluruh pengguna sebelum pilot; menjamin PII terdeteksi sempurna; menjamin semua model lokal; sandbox OS penuh; rute penyidikan otomatis yang menghasilkan dokumen final tanpa reviewer manusia; penggantian sistem inbox atau subagent V2; penambahan provider/credential baru tanpa persetujuan.

## Acceptance Criteria

- [ ] AC-01: Saat fitur belum diaktifkan, pesan, pilihan agent dan mode kasus bekerja seperti sebelum perubahan; pengguna dapat mengaktifkan master untuk satu project tanpa mengubah project lain. Artefak overlay benar-benar terkirim dalam paket desktop, bukan hanya di `packages/`.
- [ ] AC-02: Master merutekan tugas kecil langsung dan tugas besar ke agen yang sesuai; explorer dan reviewer baca-saja, extractor/data/writer hanya memakai input dan output yang diberi izin. Satu file punya satu writer; job independen bisa berjalan serentak dalam batas yang dikonfigurasi, job bergantung menunggu hasil, kegagalan tidak memicu duplikasi.
- [ ] AC-03: Sebelum isi dokumen diteruskan ke model, rute menetapkan kelas data, provider/model tujuan, tool, batas file dan jejak persetujuan. Kasus beridentitas asli hanya boleh dikirim ke provider/model yang disetujui untuk project itu setelah persetujuan eksplisit untuk scope tersebut; token map, credential, dan data di luar scope tidak terkirim. Bila klasifikasi atau persetujuan tidak ada: berhenti sebelum membaca/mengirim isi.
- [ ] AC-04: Fallback hanya ke model/provider yang di-allowlist untuk kelas data dan kemampuan task tersebut; bila tidak tersedia, tampilkan gagal tertutup. Uji penolakan fallback ke provider lain pada kasus asli termasuk kegagalan saat proses sudah berjalan; audit tidak menyimpan isi prompt/PII/token.
- [ ] AC-05: Pesan yang dipilih sebagai `queue` menunggu idle boundary tanpa mengubah pekerjaan aktif, sementara `steer` tetap tersedia secara eksplisit. Status queued/active/finished/failed untuk master dan child job terbaca di UI; pesan baru tidak disalahartikan sebagai izin mengubah scope tugas sensitif.
- [ ] AC-06: Alur contoh publik, workbook internal, serta kasus sintetis melintasi routing, ekstraksi/analisis, draf, review dan sign-off; output memiliki path/versi, sumber/rumus dan status verifikasi. Gate manusia wajib untuk restore identitas dan distribusi dokumen final.
- [ ] AC-07: Dokumentasi menjelaskan pemilihan model, perbedaan queue/steer/job paralel, pembatasan tool, cloud/fallback, persetujuan kasus, dan batas perlindungan. Pemeriksaan overlay, test pengguna dan PDF panduan lulus sebelum increment ditutup.

## Approach

1. **Baseline dan model ancaman:** inventaris versi paket terpasang dan overlay, perilaku `SessionInbox` (`packages/core/src/session/inbox.ts`), eksekusi subagent (`packages/core/src/tool/plugin/subagent.ts`), konfigurasi model aktual, `case-ui.ts`, `casemode.py`, dan pengelola router. Catat provider/model IDs tanpa menyalin credential atau mengekspor dokumen asli. Uji `queue` vs `steer` pada UI/HTTP; tentukan batas dukungan dari build Hyper AI yang dirilis, bukan semata checkout source. Tentukan policy untuk input melalui pesan, lampiran, `read`, shell, MCP, dan hasil child agent. JANGAN klaim prompt agent sebagai security boundary.
2. **Kontrak rute:** buat schema minimal per-project untuk klasifikasi (publik/internal/rahasia/kasus asli), provider/model/tool allowlist, scope path, masa berlaku persetujuan dan batas fan-out. Reject konfigurasi tidak valid dan perubahan yang memperlebar scope tanpa izin baru. Simpan bukti persetujuan non-rahasia; daftar model spesifik berasal dari katalog aktual dan pilot, bukan asumsi bahwa berbayar lebih aman. Jika satu provider/router merutekan beberapa model upstream, perlakukan router sebagai penerima data dan audit tujuan upstream hanya jika dapat diverifikasi.
3. **Enforcement:** master melakukan preflight sebelum konten dibaca oleh agen/model; dispatcher memasok input minimum ke child baru (fresh context). Gunakan izin V2 per agen dan policy provider/tool, plus gerbang runtime untuk jalur shell, file, MCP, attachment, model switch dan failover. Policy per-agent bukan sandbox shell dan provider-use berskala provider, bukan allowlist per model; saat mekanisme tidak bisa menjamin pembatasan, hentikan task sensitif daripada bergantung pada prompt. Bila perlu buat scope runtime terisolasi untuk task sensitif, ukur biaya/kerumitannya dalam T-01 sebelum implementasi.
4. **Agen:** definisi master primary opt-in dan spesialis subagent di overlay, skill domain tetap sebagai instruksi kerja. Explorer/reviewer tak dapat edit; extractor menjalankan pipeline lokal dan menyerahkan teks terpilih; analyst memakai salinan workbook; investigator memakai playbook dan Case Secure; writer hanya fakta tervalidasi. Master menggabungkan hasil; reviewer berbeda dari writer. Semua task berkontrak input/output, versi, owner, bukti, kondisi stop.
5. **Scheduler:** gunakan child session foreground/background yang sudah ada; tambahkan hanya coordinator untuk DAG, batas jumlah serentak, status, deadline/cancel dan penyatuan hasil. Serialisasi operasi mode kasus, file yang sama dan proses yang bergantung. Jangan ubah arti `queue`/`steer` dalam core; UI menawarkan queue sebagai tindakan non-interupsi ketika aktif dan steer sebagai koreksi sadar.
6. **Fallback:** rule per kelas data dan kemampuan; kegagalan provider/timeout/rate limit dipetakan ke rute yang masih disetujui, dengan batas percobaan. Untuk status delivery ambigu, jangan kirim ulang payload sensitif diam-diam; stop dan lapor. Hindsight punya fallback terpisah: audit dan batasi/disable per kasus agar tidak mem-bypass aturan agen.
7. **Release:** jalankan uji negatif dan positif dari UI/HTTP dengan data sintetis, uji overlay pada paket desktop, cek audit tidak mengandung isi sensitif; perbarui README/manual Markdown lalu render PDF dari sumber, verifikasi judul/teks. Rilis pilot opt-in dulu; perlu keputusan baru dan data uji sebelum default-on.

**Gate implementasi wajib (temuan T-04):** `agent-policy.ts`, `agent-gate.ts`, dan `agent-fallback.ts` masih helper yang tidak dipanggil oleh runtime. Sebelum agen dapat diaktifkan, T-12 wajib memasang enforcement pada semua jalur model (`primary`, `compaction`, `title`, `generate`, HTTP/WebSocket), tool execution (termasuk shell/MCP/Code Mode), attachment dan child model switch, lalu membuktikan penolakan sebelum byte sensitif terkirim. Hook session model tanpa typed rejection dapat mematikan request sebagai defect, tetapi itu belum bukti tidak ada bypass; uji request nyata diperlukan. Bila hook/plugin V2 tidak mampu menutup jalur tersebut, batasi fitur ke data publik sampai ada perubahan core yang eksplisit; jangan mengklaim kasus asli aman. T-04, T-07, dan T-09 bergantung pada bukti T-12, bukan pada instruksi prompt.

## Decisions

### Asked
- D-01 Bolehkah cloud membaca isi kasus asli? → Boleh hanya ke provider/model terpilih yang disetujui per project, dengan persetujuan eksplisit (user). Bukan izin blanket untuk semua provider, child, memory atau fallback.
- D-02 Routing awal model → Data sensitif memakai GPT cloud yang disetujui; tugas aman memakai MiniMax atau MiMo. Model dipilih dari katalog yang benar-benar tersedia dan diuji; fallback hanya di dalam kelas izin yang sama (user).

### Defaulted (change any before sw-do)
- D-03 Rollout → opt-in pilot per project; default-on hanya sesudah bukti keamanan/biaya/kualitas dan keputusan pengguna berikutnya.
- D-04 Queue → pertahankan `steer` default yang sudah ada di core; sediakan aksi `queue` yang menonjol untuk pesan susulan saat sibuk, jangan mengubah default global tanpa uji UX.
- D-05 Model → pilot memakai hanya ID yang tersedia/teruji, bukan hard-code rekomendasi kualitas dari nama; tidak ada klaim model berbayar otomatis lebih aman.
- D-06 Eksekusi → manfaatkan child sessions dan inbox yang ada; tidak membangun ulang sistem queue atau engine AI.

### Open
- none. Jalur sensitif tetap fail-closed sampai daftar GPT/provider yang disetujui, kontrak/retensi, dan consent per project tersedia. Batas biaya/fan-out pilot konservatif dipilih setelah pengukuran T-01; nilai belum diketahui bukan izin untuk membuka rute sensitif.

## Tasks

### T-01 Baseline, threat model, dan probe perilaku build
- AC: AC-01, AC-03, AC-05 | Files: docs/multi-agent/baseline.md, rebrand/test/e2e/multi-agent-baseline.test.ts | Test: bun test test/e2e/multi-agent-baseline.test.ts (cwd: rebrand)

### T-02 Schema rute, klasifikasi dan persetujuan per project
- AC: AC-03 | Files: rebrand/files/desktop/hyper/agent-policy.ts, rebrand/test/agent-policy.test.ts | Test: bun test test/agent-policy.test.ts (cwd: rebrand)

### T-03 Gerbang preflight untuk konten, tool dan model
- AC: AC-02, AC-03 | Files: rebrand/files/desktop/hyper/agent-gate.ts, rebrand/test/e2e/agent-gate.test.ts | Test: bun test test/e2e/agent-gate.test.ts (cwd: rebrand)

### T-04 Definisi agen spesialis dan bundle overlay
- AC: AC-01, AC-02 | Files: rebrand/files/desktop/hyper/agents.ts, rebrand/files/desktop/hyper/bundle.ts, rebrand/test/e2e/agent-bundle.test.ts | Test: bun test test/e2e/agent-bundle.test.ts (cwd: rebrand)
- Dependencies: T-12 (model/tool/attachment enforcement proven against live requests).

### T-05 Fallback terikat policy dan penanganan delivery ambigu
- AC: AC-04 | Files: rebrand/files/desktop/hyper/agent-fallback.ts, rebrand/test/e2e/agent-fallback.test.ts | Test: bun test test/e2e/agent-fallback.test.ts (cwd: rebrand)

### T-06 Master dispatcher, scheduler DAG dan kontrak handoff
- AC: AC-02, AC-06 | Files: rebrand/files/desktop/hyper/agent-orchestrator.ts, rebrand/test/e2e/agent-orchestrator.test.ts | Test: bun test test/e2e/agent-orchestrator.test.ts (cwd: rebrand)

### T-07 Integrasi Case Secure, memory dan audit metadata
- AC: AC-03, AC-04, AC-06 | Files: rebrand/files/desktop/hyper/case-ui.ts, rebrand/files/desktop/hyper/case/casemode.py, rebrand/files/desktop/hyper/agent-audit.ts, rebrand/test/e2e/agent-case.test.ts | Test: bun test test/e2e/agent-case.test.ts (cwd: rebrand)
- Dependencies: T-04, T-12.

### T-08 Queue UX dan status job tanpa interupsi
- AC: AC-05 | Files: rebrand/files/desktop/hyper/agent-queue.ts, rebrand/test/e2e/agent-queue.test.ts | Test: bun test test/e2e/agent-queue.test.ts (cwd: rebrand)
- Dependencies: T-04, T-12. Revise Files to include actual UI/inbox integration before claim; helper-only test is insufficient.

### T-09 Alur pilot end-to-end dan pengukuran biaya/keamanan
- AC: AC-01, AC-02, AC-03, AC-04, AC-05, AC-06 | Files: rebrand/test/e2e/multi-agent-pilot.test.ts, docs/multi-agent/pilot-results.md | Test: bun test test/e2e/multi-agent-pilot.test.ts (cwd: rebrand)
- Dependencies: T-04, T-07, T-08, T-12. Send synthetic payload to controlled fake provider; assert exact model, denial, and absence of forbidden bytes.

### T-10 Panduan pengguna, batas fitur dan PDF
- AC: AC-07 | Files: README.md, docs/Panduan-Pengguna-Hyper-AI.md, docs/Panduan-Pengguna-Hyper-AI.pdf, docs/multi-agent/panduan.md | Test: python docs/build_user_manual_pdf.py
- Dependencies: T-09. Document only verified pilot behavior.

### T-11 Verify and close 0001
- AC: AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-07 | Files: docs/multi-agent/release-checklist.md | Test: specweave verify 0001-multi-agent-orchestration-with-data-safe-routing
- Dependencies: T-04, T-07, T-08, T-09, T-10, T-12; fresh-context review required.

### T-12 Enforce routing on actual model and tool transport
- AC: AC-03, AC-04 | Files: rebrand/files/desktop/hyper/agent-guard.ts, rebrand/test/e2e/agent-guard.test.ts, docs/multi-agent/guard-evidence.md | Test: bun test test/e2e/agent-guard.test.ts (cwd: rebrand)

### T-13 Probe real request hooks before selecting enforcement boundary
- AC: AC-03 | Files: packages/core/test/session-model-request-hooks.test.ts, docs/multi-agent/guard-evidence.md | Test: bun test test/session-model-request-hooks.test.ts (cwd: packages/core)
- Dependencies: none. This task proves whether hook rejection stops fake HTTP/WS transport for primary and auxiliary requests; it does not itself enable or finish T-12.

### T-14 Probe packaged-style Promise plugin denial of model and tool calls
- AC: AC-03 | Files: packages/core/test/session-model-request-hooks.test.ts, packages/core/test/session-runner.test.ts, docs/multi-agent/guard-evidence.md | Test: bun test test/session-model-request-hooks.test.ts (cwd: packages/core)
- Dependencies: T-13. Probe actual Promise adapter and fake transport; do not call guard safe until attachment, retry and installer paths are covered.
