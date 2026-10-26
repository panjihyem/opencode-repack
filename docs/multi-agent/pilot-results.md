# Pilot results — 0001

## Status: pilot not run

No end-to-end pilot is authorized yet. Revised scope is public/synthetic-only; T-12's sensitive-data consent/runtime gate remains a separate blocked capability, not an authorization to use any sensitive payload. A fake-provider public-path test and packaged overlay verification are still required before release.

## Evidence available

- Rebrand/helper suites: 20 tests pass, 72 assertions. Covers baseline, policy, path preflight, fallback helper, orchestration helper, guard helper, and Case Secure UI helper flow; does not exercise packaged runtime or provider isolation.
- Core model hook suite: 9 tests pass, 21 assertions. Covers hook boundaries and denial probes with synthetic fixtures; does not establish a session-scoped approved policy or installer enforcement.
- Core typecheck: `bun node_modules/@typescript/native-preview/bin/tsgo.js -b packages/core/tsconfig.json packages/core/tsconfig.tests.json` exits 0.
- Case Secure UI helper flow: 11 tests / 23 assertions pass (`bun test test/case-ui.test.ts` in `rebrand`). Proves redaction/UI helper contracts, not provider/model isolation.
- Existing queue UI E2E is `packages/app/e2e/regression/session-queue.spec.ts` and exercises real inbox `queue`/`steer`; attempted headless run failed before Playwright started with `bun: Operation not permitted`. It does not cover multi-agent job statuses.
- Case Secure still allows model provider traffic and network access through `shell`; see `rebrand/files/desktop/hyper/case/casemode.py`.

## Not measured

No controlled fake-provider pilot, exact-model integration, project opt-in isolation, multi-agent child-job status, costs, upstream routing/retention, or package installer verification. Existing queue inbox UI is not a multi-agent queue. Do not treat missing measurements as zero risk or zero cost.

## Release decision

Blocked. Do not use original case data, confidential/internal data, or token maps with multi-agent routing. Public/synthetic-only manual exercises do not constitute a released pilot. Reopen after public-only preflight, fake-provider pilot, packaged overlay, and documented queue behavior pass. T-12 remains a separate prerequisite for any future sensitive-data support.
