# Release public-only multi-agent routing

## Problem

Increment 0001 closed as an unreleased helper prototype. No OpenCode runtime invokes its preflight, routes child jobs, or packages those helpers. Users cannot run public-only multi-agent workflows; publishing the helper as-is would falsely imply enforcement at model and tool transport.

## Scope

In: explicit public-text-only opt-in command in the active project; server plugin dispatch through OpenCode `generate.text` using configured provider credentials and exact model; tool-free specialist stages with bounded orchestration; fake-provider tests; overlay and desktop build proof; queue/steer unchanged. Out: reading files or attachments, child sessions, file output, internal/confidential/original-case data, whole-session data-loss prevention, automatic classification of pasted content, new credentials, default-on rollout.

## Acceptance Criteria

- [ ] AC-01: Installed overlay registers explicit public-text command; absent invocation leaves normal session and case mode unchanged. Command runs in active project only; no default-on dispatch.
- [ ] AC-02: Command rejects unknown/non-public classes, attachments, empty text and named token/secret markers before model call; only exact allowlisted model selected. Stateless `generate.text` has no tools, child session or file output; no protection against unlabeled secrets in pasted text is claimed.
- [ ] AC-03: Public synthetic text passes bounded independent specialist stages then dependent reviewer; failures halt and no file is written.
- [ ] AC-04: Fake generator integration records exact selected model and zero calls for denied input, retries or ambiguous delivery. No fake HTTP provider or provider-byte security claim.
- [ ] AC-05: Inbox queue/steer unchanged; docs state explicit declaration limits. Desktop bundle builds and installer contains registered command and required modules.

## Approach

Use a project-loaded server plugin command and `ctx.generate.text({model,prompt})` (Core stateless path uses configured credentials and no tools/session). Require literal `public:` prefix and reject prompt attachments. Pass only text to bounded scheduler; no path reads or file writes. Treat user declaration as trust boundary, not DLP: no unlabeled secrets guarantee. Never use mutable session hooks or direct desktop HTTP as guard. Install managed plugin without replacing user files; build and inspect packaged artifact. Existing 0001 helper tests remain regression evidence, not runtime proof.

Baseline build check (2026-10-26): `bun run build` in `packages/desktop` fails with `bun: Operation not permitted` launching `electron-vite` via Windows script shim. Running `bun node_modules/electron-vite/bin/electron-vite.js build` in `packages/desktop` exits 0 and produces `out/`; this builds existing code only, **not** this increment. `bun install --frozen-lockfile` reaches root `prepare` then fails at `husky` with the same Windows permission error. No dependency manifest or lockfile changed.

## Decisions

### Asked
- D-01 Target: user chose public-only multi-agent runtime release, not simply building the closed prototype (2026-10-26).
### Defaulted (change any before sw-do)
- D-02 Transport: reuse server's OpenCode credentials/session, never a separate desktop HTTP worker.
- D-03 Rollout: opt-in only; no sensitive-data support or whole-session claims.
- D-04 Reversible MVP cut: explicit text-only server command with stateless `generate.text`; file, child and output workflows deferred. No transport-isolation or automatic-classification claim.
### Open
- none

## Tasks

### T-01 Explicit public-text server command
- AC: AC-01, AC-02 | Files: rebrand/files/desktop/hyper/agent-command.ts, rebrand/test/e2e/agent-command.test.ts | Test: cd rebrand && bun test test/e2e/agent-command.test.ts

### T-02 Text orchestration and fake generator
- AC: AC-02, AC-03, AC-04 | Files: rebrand/files/desktop/hyper/agent-command.ts, rebrand/test/e2e/agent-command.test.ts | Test: cd rebrand && bun test test/e2e/agent-command.test.ts
- Dependencies: T-01. Fake generator must be called through actual command executor, not a standalone helper.

### T-03 Desktop entrypoint and installer
- AC: AC-01, AC-05 | Files: rebrand/files/desktop/hyper/agent-command.ts, rebrand/files/desktop/hyper/agent-install.ts, rebrand/files/desktop/hyper/bundle.ts, rebrand/apply.ts, rebrand/test/e2e/agent-bundle.test.ts, docs/multi-agent/release-checklist.md | Test: cd rebrand && bun test test/e2e/agent-bundle.test.ts
- Dependencies: T-01, T-02. Also build desktop and package/inspect installer before marking done.

### T-04 Verify and close 0002
- AC: AC-01, AC-02, AC-03, AC-04, AC-05 | Files: docs/multi-agent/pilot-results.md, docs/multi-agent/release-checklist.md | Test: specweave verify 0002-release-public-only-multi-agent-routing
- Dependencies: T-01, T-02, T-03. Independent review and complete only after tests, package and runtime proof.
