# Multi-agent orchestration with data-safe routing

## Problem

Hyper AI memiliki subagent bawaan `explore`/`general`, skill domain, child session foreground/background, dan inbox pesan `steer`/`queue`. Belum ada master default yang merutekan pekerjaan ke agen dokumen, data, kasus, dan reviewer berdasarkan izin data, model, dan tool. Skill saja tidak membatasi tool atau provider. Mode kasus sekarang memblokir sebagian integrasi luar, tetapi model agen tetap remote dan `shell` masih dapat mengakses jaringan (`rebrand/files/desktop/hyper/case/casemode.py`). Fallback Hindsight tidak sama dengan fallback agent. Tanpa aturan eksplisit, paralelisme justru mereplikasi data rahasia dan fallback berisiko memindahkannya ke provider yang tidak disetujui.

## Scope

In: master opt-in untuk pekerjaan multi-langkah **hanya pada data publik**; rute model/tool publik; agen explorer, extractor, analyst, writer, reviewer dengan akses berbeda; handoff dan batas paralel; fallback fail-closed dalam kelas publik; queue pesan tanpa interupsi; audit metadata; fake-provider test; panduan dan packaging overlay Hyper AI. Sintetis dipakai sebagai fixture test, bukan kelas runtime.

Out: mengirim data internal/rahasia/kasus asli melalui multi-agent; klaim isolasi atau consent enforcement untuk data sensitif; menjadikan master default sebelum pilot; menjamin PII terdeteksi sempurna; menjamin semua model lokal; sandbox OS penuh; rute penyidikan otomatis yang menghasilkan dokumen final tanpa reviewer manusia; penggantian sistem inbox atau subagent V2; penambahan provider/credential baru tanpa persetujuan.

## Acceptance Criteria

- [ ] AC-01: Saat fitur belum diaktifkan, perilaku pesan/agent/mode kasus lama tidak berubah; opt-in hanya berlaku pada satu project. Artefak overlay masuk installer, bukan hanya checkout.
- [ ] AC-02: Master merutekan tugas kecil langsung dan tugas besar ke agen sesuai untuk **data publik saja**; synthetic fixtures hanya untuk tes. Explorer/reviewer baca-saja; extractor/data/writer hanya memakai input/output yang diizinkan. Satu file punya satu writer; job independen berjalan dalam batas fan-out; dependensi menunggu hasil; kegagalan tidak memicu duplikasi.
- [ ] AC-03: Sebelum dispatch, rute menerima hanya public dan menolak internal/rahasia/kasus asli/tidak terklasifikasi. Fixture synthetic hanya untuk tests. Multi-agent tidak membaca/mengirim data non-public dan tidak mengklaim mengamankan sesi umum di luar entrypoint fitur.
- [ ] AC-04: Fallback hanya ke model/provider yang di-allowlist untuk input public/synthetic dan kemampuan task; bila tidak tersedia atau delivery ambigu, gagal tertutup tanpa retry lintas rute. Audit hanya metadata dan hash, tanpa prompt/PII/token.
- [ ] AC-05: `queue` menunggu idle boundary tanpa mengubah pekerjaan aktif; `steer` tetap eksplisit. UI inbox mempertahankan kontrak itu. Status job master/child belum termasuk scope hingga dispatcher terintegrasi, tidak diklaim tersedia.
- [ ] AC-06: Fixture sintetis melewati routing, ekstraksi/analisis, draf, review/sign-off; output punya path/versi, sumber/rumus/status verifikasi. Tidak ada workbook internal atau kasus asli dalam pilot.
- [ ] AC-07: Dokumentasi menjelaskan model public-only, queue/steer, tool, fallback, batas kasus sensitif, dan perlindungan yang tidak tersedia. Tes docs lulus; PDF/build hanya bila generator tersedia.

## Approach

1. **Baseline:** inventaris versi/build dan overlay, `SessionInbox`, subagent, model IDs tanpa credential, dan perilaku `queue`/`steer`. Catat bahwa semua isi prompt/lampiran/hasil tool dapat mencapai model; jangan anggap klasifikasi via prompt sebagai security boundary.
2. **Kontrak public-only:** master menerima hanya paket input yang dinyatakan public/synthetic oleh pemanggil, tetapi pernyataan itu bukan klasifikasi otomatis atau consent. Policy menolak internal/confidential/case-original, credential dan token map; exact model/tool/path serta batas fan-out dinyatakan eksplisit. Jika caller tidak dapat menjamin data public, jangan gunakan fitur.
3. **Enforcement batas scope:** agent dispatcher/preflight membatasi file dan tool yang diteruskan oleh fitur ini. Ini bukan perlindungan seluruh session, shell OS, provider/network global, atau konten yang ditempel langsung. Jangan klaim sistem aman untuk data sensitif; simpan project/kasus sensitif di luar alur ini.
4. **Agen:** definisi master opt-in dan spesialis hanya untuk tugas public/synthetic. Explorer/reviewer baca-saja; writer memiliki output tunggal; investigator/Case Secure tidak termasuk rollout ini.
5. **Scheduler:** gunakan child session foreground/background yang sudah ada; coordinator hanya untuk DAG bounded, job status, deadline/cancel, dan penyatuan hasil. File satu writer; dependency menunggu. Jangan ubah arti `queue`/`steer` dalam core.
6. **Fallback:** hanya model public allowlisted; ambiguity menghentikan job, tanpa retry lintas provider. Hindsight fallback terpisah.
7. **Release:** jalankan uji negatif dan positif dari UI/HTTP dengan data sintetis, uji overlay pada paket desktop, cek audit tidak mengandung isi sensitif; perbarui README/manual Markdown lalu render PDF dari sumber, verifikasi judul/teks. Rilis pilot opt-in dulu; perlu keputusan baru dan data uji sebelum default-on.

**Gate public-only:** T-12 lama membuktikan proteksi data sensitif seluruh model/tool transport, yang tidak termasuk revised scope. Tidak boleh menafsirkan skip T-12 sebagai kelulusan keamanan; produk tidak boleh mengiklankan perlindungan sensitif. Sebelum entrypoint multi-agent public-only dikirim, T-03/T-04 wajib menjalankan preflight sebelum membaca file/dispatch, tolak kelas non-public, dan batasi tool/output; T-09 menguji provider fake. Batas ini tidak melindungi penggunaan umum sesi atau konten bebas.

## Decisions

### Asked
- D-01 Bolehkah cloud membaca isi kasus asli? → Di luar scope increment setelah revisi public-only; tidak ada data asli kasus yang dirutekan.
- D-02 Routing awal model → Data sensitif memakai GPT cloud yang disetujui; tugas aman memakai MiniMax atau MiMo. Model dipilih dari katalog yang benar-benar tersedia dan diuji; fallback hanya di dalam kelas izin yang sama (user).
- D-07 Batas rollout → Scope increment direvisi ke data publik/sintetis saja; dukungan data sensitif/kasus asli memerlukan increment terpisah dengan core-owned policy/consent binding dan final transport/tool enforcement (user, 2026-10-26).

### Defaulted (change any before sw-do)
- D-03 Rollout → opt-in per project untuk data publik/sintetis saja; belum dirilis sampai pilot, installer, dan dokumentasi lolos. Default-on memerlukan keputusan baru setelah bukti keamanan/biaya/kualitas.
- D-04 Queue → pertahankan `steer` default yang sudah ada di core; sediakan aksi `queue` yang menonjol untuk pesan susulan saat sibuk, jangan mengubah default global tanpa uji UX.
- D-05 Model → pilot memakai hanya ID yang tersedia/teruji, bukan hard-code rekomendasi kualitas dari nama; tidak ada klaim model berbayar otomatis lebih aman.
- D-06 Eksekusi → manfaatkan child sessions dan inbox yang ada; tidak membangun ulang sistem queue atau engine AI.

### Open
- none. Data sensitif tetap di luar scope dan harus ditolak oleh entry point multi-agent. Batas biaya/fan-out pilot konservatif ditetapkan sebelum pilot; nilai belum diketahui bukan izin membuka rute sensitif.

## Tasks

### T-01 Baseline, threat model, dan probe perilaku build
- AC: AC-01, AC-03, AC-05 | Files: docs/multi-agent/baseline.md, rebrand/test/e2e/multi-agent-baseline.test.ts | Test: bun test test/e2e/multi-agent-baseline.test.ts (cwd: rebrand)

### T-02 Schema rute, klasifikasi dan persetujuan per project
- AC: AC-03 | Files: rebrand/files/desktop/hyper/agent-policy.ts, rebrand/test/agent-policy.test.ts | Test: bun test test/agent-policy.test.ts (cwd: rebrand)

### T-03 Gerbang preflight untuk konten, tool dan model
- AC: AC-02, AC-03 | Files: rebrand/files/desktop/hyper/agent-gate.ts, rebrand/test/e2e/agent-gate.test.ts | Test: bun test test/e2e/agent-gate.test.ts (cwd: rebrand)

### T-04 Definisi agen spesialis dan bundle overlay
- AC: AC-01, AC-02 | Files: rebrand/files/desktop/hyper/agent-policy.ts, rebrand/files/desktop/hyper/agent-gate.ts, rebrand/files/desktop/hyper/agent-fallback.ts, rebrand/files/desktop/hyper/agent-guard.ts, rebrand/files/desktop/hyper/bundle.ts, rebrand/apply.ts, rebrand/test/agent-policy.test.ts, rebrand/test/e2e/agent-bundle.test.ts, rebrand/test/e2e/agent-gate.test.ts | Test: bun test test/e2e/agent-bundle.test.ts (cwd: rebrand)
- Dependencies: T-03. Runtime entrypoint must enforce public-only before content reads, restrict child/model/tool changes and be active in the shipped overlay. Merely copying standalone helpers or testing source text is insufficient. Installer/runtime E2E is mandatory before done.

### T-05 Fallback terikat policy dan penanganan delivery ambigu
- AC: AC-04 | Files: rebrand/files/desktop/hyper/agent-fallback.ts, rebrand/test/e2e/agent-fallback.test.ts | Test: bun test test/e2e/agent-fallback.test.ts (cwd: rebrand)

### T-06 Master dispatcher, scheduler DAG dan kontrak handoff
- AC: AC-02, AC-06 | Files: rebrand/files/desktop/hyper/agent-orchestrator.ts, rebrand/test/e2e/agent-orchestrator.test.ts | Test: bun test test/e2e/agent-orchestrator.test.ts (cwd: rebrand)

### T-07 Document public-only boundary and exclude Case Secure
- AC: AC-03, AC-04 | Files: README.md, docs/Panduan-Pengguna-Hyper-AI.md, docs/multi-agent/panduan.md, docs/multi-agent/pilot-results.md, docs/multi-agent/release-checklist.md | Test: bun test test/e2e/multi-agent-baseline.test.ts (cwd: rebrand)
- Scope: explicitly exclude Case Secure/original-case dispatch; document boundaries, public-only rule, and separate future security increment. No case-mode runtime changes.

### T-08 Verify existing inbox queue behavior (no new job status UI)
- AC: AC-05 | Files: packages/app/e2e/regression/session-queue.spec.ts, docs/multi-agent/panduan.md, docs/multi-agent/release-checklist.md | Test: bun run test:e2e -- regression/session-queue.spec.ts --project=chromium (cwd: packages/app)
- Dependencies: none. Existing inbox queue/steer UI stays unchanged; verify actual behavior. Master/child job status explicitly excluded; follow-up increment needed when dispatcher integrates.

### T-09 Synthetic fake-provider pilot E2E and evidence
- AC: AC-01, AC-02, AC-03, AC-04, AC-06 | Files: rebrand/test/e2e/multi-agent-pilot.test.ts, docs/multi-agent/pilot-results.md | Test: bun test test/e2e/multi-agent-pilot.test.ts (cwd: rebrand)
- Dependencies: T-04, T-07. Synthetic fixtures only; controlled fake provider; assert exact model, preflight denial, and absent forbidden bytes. No live provider/real data/cost claim. T-12 not released/closed by this test.

### T-10 Panduan pengguna, batas fitur dan PDF
- AC: AC-07 | Files: README.md, docs/Panduan-Pengguna-Hyper-AI.md, docs/multi-agent/panduan.md, docs/multi-agent/release-checklist.md, docs/Panduan-Pengguna-Hyper-AI.pdf | Test: python docs/build_user_manual_pdf.py
- Dependencies: T-09. Document only verified pilot behavior.

### T-11 Verify and close 0001
- AC: AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-07 | Files: docs/multi-agent/release-checklist.md | Test: specweave verify 0001-multi-agent-orchestration-with-data-safe-routing
- Dependencies: T-04, T-07, T-08, T-09, T-10; fresh-context review required. T-12 remains blocked for future sensitive-data support and is not completed here.

### T-12 Enforce routing on actual model and tool transport
- AC: AC-03, AC-04 | Files: rebrand/files/desktop/hyper/agent-guard.ts, rebrand/files/desktop/hyper/agent-policy.ts, rebrand/files/desktop/hyper/agent-gate.ts, rebrand/apply.ts, rebrand/test/e2e/agent-guard.test.ts, packages/plugin/src/effect/session.ts, packages/plugin/src/promise/session.ts, packages/plugin/src/effect/tool.ts, packages/plugin/src/promise/tool.ts, packages/plugin/src/promise/adapter.ts, packages/core/src/session/model-request.ts, packages/core/src/session/model-transport.ts, packages/core/src/tool.ts, packages/core/src/plugin/hooks.ts, packages/core/test/session-model-request-hooks.test.ts, docs/multi-agent/guard-evidence.md | Test: bun test test/session-model-request-hooks.test.ts (cwd: packages/core) AND bun test test/e2e/agent-guard.test.ts (cwd: rebrand)
- Dependencies: T-13, T-14, T-15. Original task requirement: enforce all model/tool transport boundaries and prove no forbidden bytes. Revised scope excludes sensitive data from rollout but does not make Core hook probes satisfy this contract. **Skipped for this public-only increment, not passed**; separate Core-owned security increment must implement trusted consent/session binding and final HTTP/WebSocket/tool enforcement before any sensitive-data support. T-12 is excluded from T-11 completion dependency; helper tests never count as transport proof.

### T-13 Probe real request hooks before selecting enforcement boundary
- AC: AC-03 | Files: packages/core/test/session-model-request-hooks.test.ts, docs/multi-agent/guard-evidence.md | Test: bun test test/session-model-request-hooks.test.ts (cwd: packages/core)
- Dependencies: none. This task proves whether hook rejection stops fake HTTP/WS transport for primary and auxiliary requests; it does not itself enable or finish T-12.

### T-14 Probe packaged-style Promise plugin denial of model and tool calls
- AC: AC-03 | Files: packages/core/test/session-model-request-hooks.test.ts, packages/core/test/session-runner.test.ts, docs/multi-agent/guard-evidence.md | Test: bun test test/session-model-request-hooks.test.ts (cwd: packages/core)
- Dependencies: T-13. Probe actual Promise adapter and fake transport; do not call guard safe until attachment, retry and installer paths are covered.

### T-15 Probe hook-order bypass at final transport boundary
- AC: AC-03, AC-04 | Files: packages/core/test/session-model-request-hooks.test.ts, docs/multi-agent/guard-evidence.md | Test: bun test test/session-model-request-hooks.test.ts (cwd: packages/core)
- Dependencies: T-14. Demonstrate whether an earlier routing hook can be overridden by a later hook before HTTP transport. Use result to locate mandatory final enforcement for T-12; no master activation.

### T-16 Close case-original tool alias bypass in route policy
- AC: AC-03 | Files: rebrand/files/desktop/hyper/agent-policy.ts, rebrand/test/agent-policy.test.ts | Test: bun test test/agent-policy.test.ts (cwd: rebrand)
- Dependencies: T-02. Restrict case-original to an explicit tool allowlist, not a short denylist; `execute`, browser, MCP aliases and unrecognized tools must fail before dispatch. This is necessary but not sufficient for T-12 runtime enforcement.

### T-17 Repair preflight regression from case tool allowlist
- AC: AC-03 | Files: rebrand/test/e2e/agent-gate.test.ts | Test: bun test test/e2e/agent-gate.test.ts (cwd: rebrand)
- Dependencies: T-16. Keep case-original read-only; test output checks using a separate approved public writer instead of weakening route policy.

### T-18 Restore existing config watch typecheck
- AC: AC-01 | Files: packages/util/src/fs-util.ts | Test: bun node_modules/@typescript/native-preview/bin/tsgo.js -b packages/core/tsconfig.json packages/core/tsconfig.tests.json (cwd: repository root)
- Dependencies: none. Restore missing shared watcher ignore list without changing its documented values; prerequisite for verifying T-12 build.
