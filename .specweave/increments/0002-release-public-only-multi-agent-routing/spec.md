# Release public-only multi-agent routing

## Problem

Increment 0001 closed as an unreleased helper prototype. No OpenCode runtime invokes its preflight, routes child jobs, or packages those helpers. Users cannot run public-only multi-agent workflows; publishing the helper as-is would falsely imply enforcement at model and tool transport.

## Scope

In: explicit public-text-only opt-in command in the active project; server plugin dispatch through OpenCode `generate.text` using configured provider credentials and exact model; tool-free specialist stages with bounded orchestration; fake-provider tests; overlay and desktop build proof; queue/steer unchanged. Out: reading files or attachments, child sessions, file output, internal/confidential/original-case data, whole-session data-loss prevention, automatic classification of pasted content, new credentials, default-on rollout.

## Acceptance Criteria

- [ ] AC-01: Desktop overlay build contains standalone public-text plugin and installer helper writes it into OpenCode plugin directory; no marker means zero model calls; case mode suppresses installation. Each execution requires opt-in marker in active project. Project root can invoke in own or descendant top-level session.
- [ ] AC-02: Command rejects unknown/non-public classes, attachments, empty text and named token/secret markers before model call; rechecks project opt-in and case mode before each model call and publishing; only exact allowlisted model selected. Stateless `generate.text` has no tools, child session or file output; no protection against unlabeled secrets in pasted text is claimed.
- [ ] AC-03: Public synthetic text passes bounded independent specialist stages then dependent reviewer; failures halt and no file is written.
- [ ] AC-04: Fake generator records exact model and zero calls for denied inputs; ambiguous generation failure causes no retry/fallback or partial publish. No fake HTTP provider or provider-byte security claim.
- [ ] AC-05: Inbox queue/steer unchanged; docs state explicit declaration limits. Windows desktop build and unpacked artifact contain command and required modules. NSIS installer unavailable in offline environment; candidate remains unreleased.

## Approach

Use global server plugin command with active-location execution guard and `ctx.generate.text({model,prompt})` (Core stateless path uses configured credentials and no tools/session). Opt-in marker `.hyper-ai/public-agents.enabled` is an empty regular file in project canonical directory; resolve parent and marker without symlink traversal. Re-read marker and global `hyper/privacy.json` (case mode) before each generation and publishing. Bind session project ID to active project; accept a top-level session at project root or below. Require literal `public:` prefix and reject prompt attachments. Treat user declaration as trust boundary, not DLP: no unlabeled secrets guarantee. Never use mutable session hooks or direct desktop HTTP as guard. Install managed plugin without replacing user files; build and inspect packaged artifact. Existing 0001 helper tests remain regression evidence, not runtime proof.

Baseline build check (2026-10-26): `bun run build` in `packages/desktop` fails with `bun: Operation not permitted` launching `electron-vite` via Windows script shim. Running `bun node_modules/electron-vite/bin/electron-vite.js build` in `packages/desktop` exits 0 and produces `out/`; this builds existing code only, **not** this increment. `bun install --frozen-lockfile` reaches root `prepare` then fails at `husky` with the same Windows permission error. No dependency manifest or lockfile changed.

Desktop build run after applying overlay in temporary worktree succeeds through direct electron-vite CLI; two existing CSS warnings for unsupported `::highlight` optimization. `bun run build` script's prebuild runs then Windows shim exits `Operation not permitted`. NSIS `.exe` packaging fails because `github.com` DNS unavailable. Direct CLI server start fails before bind with `SyntaxError: Export named 'hasMcpClientTicketURL' not found` (overlay source checkout API mismatch); no runtime registration/provider test proven. Temporary worktree `app.asar` had command strings, but source included e06f379 predating final session-root fix; do not count as final artifact proof.

## Decisions

### Asked
- D-01 Target: user chose public-only multi-agent runtime release, not simply building the closed prototype (2026-10-26).
### Defaulted (change any before sw-do)
- D-02 Transport: reuse server's OpenCode credentials/session, never a separate desktop HTTP worker.
- D-03 Rollout: opt-in only; no sensitive-data support or whole-session claims.
- D-04 Reversible MVP cut: explicit text-only server command with stateless `generate.text`; file, child and output workflows deferred. No transport-isolation or automatic-classification claim.
- D-05 Per-project opt-in: command globally discoverable but execution requires explicit empty marker in active canonical project and case mode off, rechecked before each external call. User may opt in by creating marker; removing it stops future calls.
### Open
- none

## Tasks

### T-01 Explicit public-text server command
- AC: AC-01, AC-02 | Files: rebrand/files/desktop/hyper/agent-command.ts, rebrand/test/e2e/agent-command.test.ts | Test: cd rebrand && bun test test/e2e/agent-command.test.ts

### T-02 Text orchestration and fake generator
- AC: AC-02, AC-03, AC-04 | Files: rebrand/files/desktop/hyper/agent-command.ts, rebrand/test/e2e/agent-command.test.ts | Test: cd rebrand && bun test test/e2e/agent-command.test.ts
- Dependencies: T-01. Fake generator must be called through actual command executor, not a standalone helper.

### T-03 Desktop entrypoint and installer
- AC: AC-01, AC-05 | Files: rebrand/files/desktop/hyper/agent-command.ts, rebrand/files/desktop/hyper/agent-install.ts, rebrand/files/desktop/hyper/bundle.ts, rebrand/apply.ts, rebrand/test/e2e/agent-bundle.test.ts, rebrand/test/e2e/agent-command.test.ts, docs/multi-agent/release-checklist.md | Test: cd rebrand && bun test test/e2e/agent-bundle.test.ts test/e2e/agent-command.test.ts
- Dependencies: T-01, T-02. Build and inspect unpacked desktop artifact. NSIS installer not required by this task test; current installer download/runtime mismatch remain documented release gates.

### T-04 Verify and close 0002
- AC: AC-01, AC-02, AC-03, AC-04, AC-05 | Files: docs/multi-agent/pilot-results.md, docs/multi-agent/release-checklist.md | Test: cd rebrand && bun test test/e2e/agent-bundle.test.ts test/e2e/agent-command.test.ts
- Dependencies: T-01, T-02, T-03. Closes only as **unreleased candidate**; NSIS installer and live server runtime are outstanding, not claimed.

### T-05 Serialize specialist calls behind revocable gates
- AC: AC-02, AC-04 | Files: rebrand/files/desktop/hyper/agent-command.ts, rebrand/test/e2e/agent-command.test.ts | Test: cd rebrand && bun test test/e2e/agent-command.test.ts
- Dependencies: T-02. Don't start second generation until first returns and opt-in/case-mode gate passes again.
