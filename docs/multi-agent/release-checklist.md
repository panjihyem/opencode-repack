# Release checklist — 0001

## Decision

**Blocked; do not release multi-agent routing.** Approved scope is public/synthetic-only. This is a record of open release gates, not a completion certificate; no protection for sensitive data is claimed.

## Verified locally

- [x] Combined rebrand/helper tests pass: 20 tests / 72 assertions.
- [x] Core request-hook tests pass: 9 tests / 21 assertions.
- [x] Core TypeScript build check passes.
- [x] Documentation labels runtime routing as unreleased and restricts examples to public/synthetic data.
- [x] Case Secure UI helper tests pass: `bun test test/case-ui.test.ts` in `rebrand` (11 tests, 23 assertions); no claim of provider isolation.
- [x] Existing `packages/app/e2e/regression/session-queue.spec.ts` owns actual inbox queue/steer behavior; this does not prove master/child-job queue status. Attempted E2E run blocked because `playwright` command is unavailable in this workspace.

## Validation commands

`bun test test/e2e/multi-agent-baseline.test.ts` in `rebrand`: pass (1 test, 6 assertions).

`bun test test/agent-policy.test.ts test/e2e/agent-gate.test.ts test/e2e/agent-fallback.test.ts test/e2e/agent-guard.test.ts test/e2e/agent-orchestrator.test.ts test/e2e/multi-agent-baseline.test.ts` in `rebrand`: pass (11 tests, 51 assertions). These validate helpers only.

`bun test test/session-model-request-hooks.test.ts` in `packages/core`: pass (9 tests, 21 assertions). These are hook boundary probes, not installer enforcement.

Headless UI attempt: `bun run test:e2e -- regression/session-queue.spec.ts --project=chromium` in `packages/app` failed before Playwright start: `bun: command not found: playwright`.

`bun node_modules/@typescript/native-preview/bin/tsgo.js -b packages/core/tsconfig.json packages/core/tsconfig.tests.json` from repository root: pass.

`python docs/build_user_manual_pdf.py`: blocked; Python is not installed (Windows Store execution alias only). Existing PDF was not overwritten.

## Required before release

- [ ] Enforce public-only input classification at actual multi-agent dispatch before reading/forwarding content; reject non-public and unknown classes.
- [ ] Send public synthetic payload through controlled fake provider; prove exact route and no forbidden bytes in rejected HTTP/WebSocket/tool calls.
- [ ] Cover attachments, child sessions, model/provider switches, auxiliary requests, retries, ambiguous delivery, MCP, shell, and nested Code Mode.
- [ ] Verify public-only gate modules/config are present and active in packaged desktop installer; test absence of opt-in leaves old behavior unchanged.
- [ ] Keep Case Secure/original-case outside feature scope; no mode flag-as-isolation claim.
- [ ] Preserve actual inbox `queue`/`steer` behavior; verify when Playwright becomes available. Master/child job status remains excluded until dispatcher integration and needs separate scope/AC.
- [ ] Run approved public/synthetic end-to-end pilot against controlled fake provider; measure model, denials, bytes, UI, cost, and audit redaction.
- [ ] Render and inspect manual PDF from Markdown source.
- [ ] Run `specweave verify`, fresh-context adversarial review, then complete increment only when all gates pass.

## Current non-claims

Case Secure does not block model provider traffic or network-capable shell commands. Public-only classification at a feature entrypoint is not whole-session data-loss prevention. Helper tests and core probes are not installer or provider security evidence. No pilot cost, retention, or upstream router behavior has been measured. Sensitive-data support needs separate Core-owned consent/runtime enforcement before it can be considered.
