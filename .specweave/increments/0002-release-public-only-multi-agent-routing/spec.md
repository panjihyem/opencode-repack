# Release public-only multi-agent routing

## Problem

Increment 0001 closed as an unreleased helper prototype. No OpenCode runtime invokes its preflight, routes child jobs, or packages those helpers. Users cannot run public-only multi-agent workflows; publishing the helper as-is would falsely imply enforcement at model and tool transport.

## Scope

In: project-scoped opt-in for explicitly public text/files; trusted server-side dispatch through OpenCode's configured provider and credentials; restricted tools, model, child and output handling; bounded orchestration; fake-provider tests; packaged desktop build and proof; queue/steer regression. Out: internal/confidential/original-case data, whole-session data-loss prevention, automated detection of pasted secrets, new credentials, default-on rollout.

## Acceptance Criteria

- [ ] AC-01: With opt-in absent, existing session and case behavior unchanged; opt-in applies to one project and only its explicit entrypoint. Installer contains the working entrypoint and required modules.
- [ ] AC-02: Public-only dispatch rejects unknown/non-public classes, attachments and sensitive paths before reading or transmitting; model, tool, child and output changes cannot bypass the chosen route. General session remains outside this guarantee.
- [ ] AC-03: Public synthetic workload runs bounded independent specialists then dependent reviewer; duplicate output and failures stop. No original-case or internal bytes reach fake provider.
- [ ] AC-04: Controlled fake-provider integration proves exact approved model and zero outgoing forbidden bytes for denied input, retries, auxiliary requests and ambiguous delivery; audit stores metadata only.
- [ ] AC-05: Existing inbox queue/steer UI unchanged; release docs state limits and per-project opt-in; desktop build and package succeed and installed artifact contains active feature.

## Approach

Use OpenCode server/plugin API with its own credentials, not desktop direct HTTP. Keep input/output validation before reads and at final model/tool transport; the existing plugin hooks alone are mutable in order and do not constitute a final guard. Reject attempts to switch model, use tools or attach files within the feature. Integrate only after fake transport proves this boundary; package via rebrand overlay, build desktop, inspect artifact. Do not ship or claim release when a gate fails. Existing 0001 helper tests remain regression evidence, not runtime proof.

Baseline build check (2026-10-26): `bun run build` in `packages/desktop` fails with `bun: Operation not permitted` launching `electron-vite` via Windows script shim. Running `bun node_modules/electron-vite/bin/electron-vite.js build` in `packages/desktop` exits 0 and produces `out/`; this builds existing code only, **not** this increment. `bun install --frozen-lockfile` reaches root `prepare` then fails at `husky` with the same Windows permission error. No dependency manifest or lockfile changed.

## Decisions

### Asked
- D-01 Target: user chose public-only multi-agent runtime release, not simply building the closed prototype (2026-10-26).
### Defaulted (change any before sw-do)
- D-02 Transport: reuse server's OpenCode credentials/session, never a separate desktop HTTP worker.
- D-03 Rollout: opt-in only; no sensitive-data support or whole-session claims.
### Open
- none

## Tasks

### T-01 Secure server-owned dispatch
- AC: AC-01, AC-02 | Files: packages/core/src/session/model-transport.ts, packages/core/src/session/model-request.ts, packages/core/test/session-model-request-hooks.test.ts, rebrand/files/desktop/hyper/agent-policy.ts, rebrand/files/desktop/hyper/agent-gate.ts | Test: cd packages/core && bun test test/session-model-request-hooks.test.ts

### T-02 Public orchestration and fake provider
- AC: AC-02, AC-03, AC-04 | Files: rebrand/files/desktop/hyper/agent-orchestrator.ts, rebrand/files/desktop/hyper/agent-guard.ts, rebrand/test/e2e/multi-agent-pilot.test.ts | Test: cd rebrand && bun test test/e2e/multi-agent-pilot.test.ts
- Dependencies: T-01. Pilot must traverse real dispatch, not a fake executor alone.

### T-03 Desktop entrypoint and installer
- AC: AC-01, AC-05 | Files: rebrand/files/desktop/hyper/bundle.ts, rebrand/apply.ts, rebrand/test/e2e/agent-bundle.test.ts, docs/multi-agent/release-checklist.md | Test: cd packages/desktop && bun run build
- Dependencies: T-01, T-02. Package and inspect actual installer before marking done.

### T-04 Verify and close 0002
- AC: AC-01, AC-02, AC-03, AC-04, AC-05 | Files: docs/multi-agent/pilot-results.md, docs/multi-agent/release-checklist.md | Test: specweave verify 0002-release-public-only-multi-agent-routing
- Dependencies: T-01, T-02, T-03. Independent review and complete only after tests, package and runtime proof.
