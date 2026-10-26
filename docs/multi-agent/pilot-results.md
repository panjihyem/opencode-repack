# Pilot results — 0001

## Status: synthetic helper harness passed; provider pilot not run

`bun test test/e2e/multi-agent-pilot.test.ts` in `rebrand`: 1 pass, 20 assertions. Synthetic file passed through preflight, bounded DAG and fake executor (explore/extract/draft/review metadata). Negative fixtures rejected non-public, unknown, token path, escape and mixed policy before fixture read; ambiguous fallback and duplicate output rejected. No provider, child session, write or audit transport was exercised. T-12 remains skipped, not a security clearance.

## Evidence available

- Rebrand/helper suites: 20 tests pass, 72 assertions. Covers baseline, policy, path preflight, fallback helper, orchestration helper, guard helper, and Case Secure UI helper flow; does not exercise packaged runtime or provider isolation.
- Core model hook suite: 9 tests pass, 21 assertions. Covers hook boundaries and denial probes with synthetic fixtures; does not establish a session-scoped approved policy or installer enforcement.
- Core typecheck: `bun node_modules/@typescript/native-preview/bin/tsgo.js -b packages/core/tsconfig.json packages/core/tsconfig.tests.json` exits 0.
- Case Secure UI helper flow: 11 tests / 23 assertions pass (`bun test test/case-ui.test.ts` in `rebrand`). Proves redaction/UI helper contracts, not provider/model isolation.
- Existing queue UI E2E `packages/app/e2e/regression/session-queue.spec.ts` exercises real inbox `queue`/`steer`: 31/31 headless Chromium tests passed with external Vite server and `PLAYWRIGHT_BASE_URL` (see `release-checklist.md`). It does not cover multi-agent job statuses.
- Case Secure still allows model provider traffic and network access through `shell`; see `rebrand/files/desktop/hyper/case/casemode.py`.

## Not measured

No controlled fake-provider pilot, exact-model integration, project opt-in isolation, multi-agent child-job status, costs, upstream routing/retention, or package installer verification. Existing queue inbox UI is not a multi-agent queue. Do not treat missing measurements as zero risk or zero cost. The helper modules are deliberately absent from desktop entrypoint and installer overlay (`agent-bundle.test.ts`).

## Release decision

Close 0001 only as unreleased helper prototype after verify/review. Do not use original case data, confidential/internal data, or token maps with multi-agent routing. Future release needs Core dispatcher, transport policy, fake-provider pilot and installer proof in separate scope.
