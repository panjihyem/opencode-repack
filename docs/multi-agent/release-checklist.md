# Release checklist — 0001

## Decision

**Prototype only; do not release multi-agent routing.** Scope 0001 is helper contracts and synthetic harness, not opt-in runtime. Closing increment does not authorize use of multi-agent in desktop or sensitive-data handling.

T-12 was explicitly skipped as out of scope, not passed. A separate Core-owned security increment is required before any original-case/internal/confidential use. Desktop dispatcher and fake-provider pilot remain future work, not T-04/T-09 claims.

## Verified locally

- [x] Combined rebrand/helper tests pass: 20 tests / 72 assertions.
- [x] Core request-hook tests pass: 9 tests / 21 assertions.
- [x] Core TypeScript build check passes.
- [x] Documentation labels runtime routing as unreleased and restricts examples to public/synthetic data.
- [x] Case Secure UI helper tests pass: `bun test test/case-ui.test.ts` in `rebrand` (11 tests, 23 assertions); no claim of provider isolation.
- [x] Existing `packages/app/e2e/regression/session-queue.spec.ts` owns actual inbox queue/steer behavior; 31/31 headless Chromium tests pass with external Vite server. This does not prove master/child-job queue status.
- [x] `agent-bundle.test.ts`: agent helpers absent from desktop entrypoint and installer overlay (1 test, 3 assertions); proves **not shipped**, not installer security.
- [x] `multi-agent-pilot.test.ts`: synthetic preflight/DAG/fake-executor pipeline (1 test, 20 assertions); no provider/model traffic or real pilot.

## Validation commands

`bun test test/e2e/multi-agent-baseline.test.ts` in `rebrand`: pass (1 test, 6 assertions).

`bun test test/agent-policy.test.ts test/e2e/agent-gate.test.ts test/e2e/agent-fallback.test.ts test/e2e/agent-guard.test.ts test/e2e/agent-orchestrator.test.ts test/e2e/multi-agent-baseline.test.ts` in `rebrand`: pass (11 tests, 51 assertions). These validate helpers only.

`bun test test/session-model-request-hooks.test.ts` in `packages/core`: pass (9 tests, 21 assertions). These are hook boundary probes, not installer enforcement.

Headless UI: set `VITE_OPENCODE_TEST_FIXTURES=1`, `VITE_OPENCODE_SERVER_HOST=127.0.0.1`, `VITE_OPENCODE_SERVER_PORT=4096`; start `node ./node_modules/vite/bin/vite.js --host 127.0.0.1 --port 3000 --strictPort` in `packages/app`. Then set `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000`, `PWDEBUG=0`, `PLAYWRIGHT_HTML_OPEN=never`; run `node ./node_modules/@playwright/test/cli.js test regression/session-queue.spec.ts --project=chromium --workers=2 --reporter=list` in `packages/app`: 31 passed (2.9m). Browser installed via `node ./node_modules/@playwright/test/cli.js install chromium-headless-shell`. Original Bun `webServer` script still fails in this environment; do not treat this workaround as installer evidence.

`bun node_modules/@typescript/native-preview/bin/tsgo.js -b packages/core/tsconfig.json packages/core/tsconfig.tests.json` from repository root: pass.

`%APPDATA%\ai.hyperai.desktop\hyper-bundle\office\venv\Scripts\python.exe docs/build_user_manual_pdf.py`: pass using installed Office venv and ReportLab 5.1.0. `pypdf` extracted public-only text from generated `docs/Panduan-Pengguna-Hyper-AI.pdf` (14 pages); commit `d5842a3`. This proves document generation, not pilot behavior.

## Required before release

- [ ] Enforce public-only input classification at actual multi-agent dispatch before reading/forwarding content; reject non-public and unknown classes.
- [ ] Send public synthetic payload through controlled fake provider; prove exact route and no forbidden bytes in rejected HTTP/WebSocket/tool calls.
- [ ] Cover attachments, child sessions, model/provider switches, auxiliary requests, retries, ambiguous delivery, MCP, shell, and nested Code Mode.
- [ ] Verify public-only gate modules/config are present and active in packaged desktop installer; test absence of opt-in leaves old behavior unchanged.
- [ ] Keep Case Secure/original-case outside feature scope; no mode flag-as-isolation claim.
- [x] Preserve actual inbox `queue`/`steer` behavior: targeted headless UI suite passed. Master/child job status remains excluded until dispatcher integration and needs separate scope/AC.
- [ ] Run approved public/synthetic end-to-end pilot against controlled fake provider; measure model, denials, bytes, UI, cost, and audit redaction.
- [x] Render and inspect manual PDF from Markdown source (14 pages; public-only text extracted).
- [ ] For prototype close: run `specweave verify` with explicit package-scoped commands and inspect independent review. Release gates above remain open for future increment.

## Current non-claims

Case Secure does not block model provider traffic or network-capable shell commands. No multi-agent feature entrypoint exists. Helper tests and core probes are not installer or provider security evidence. No pilot cost, retention, or upstream router behavior has been measured. Sensitive-data support needs separate Core-owned consent/runtime enforcement before it can be considered.
