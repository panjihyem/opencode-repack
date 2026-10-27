# Smoke isolated Beta desktop skill

## Problem

Increment 0005 built Beta NSIS installer with matched `opencode v2.0.32` CLI and proved packaged Node auth, but never launched desktop. Skill registration and Office deck path at application startup remain unverified. User explicitly approved visible isolated-profile smoke, not replacement of active installation.

## Scope

In: run already-built `Hyper AI Beta.exe` from unpacked Beta artifact with temporary `APPDATA`, `USERPROFILE`, XDG config/data/cache and database; prepare existing Office fixture and valid setup consent locally; inspect resulting `hyper-report/SKILL.md` and managed deck path; stop test process and record logs. Out: installing NSIS over real profile, account sign-in, model calls, case documents, Graphify Cloud or Composio.

## Acceptance Criteria

- [ ] AC-01: Test desktop launches in visible isolated profile; no real user config or documents changed. Packaged CLI reports `v2.0.32`; server denies unauthenticated forged MCP ticket and accepts synthetic authenticated `/api/info` on a temporary loopback server.
- [ ] AC-02: Desktop startup using valid isolated consent and pre-existing Office venv registers managed `hyper-report/SKILL.md`, points to an existing `deck.py` in isolated data dir, and script creates synthetic PPTX/PDF. Existing user-owned skill and deck in test fixture are preserved.
- [ ] AC-03: Report differentiates desktop launch, service state, discovered skill and limitations. Tests and fresh-context review pass. No artifact published or real profile modified.

## Approach

Consent is computed from packaged wizard Markdown, written only into temporary `userData/hyper-bundle/state.json`. No auto-download: wizard marked completed and Office fixture reuses already installed venv path through a test-local link/copy. Start the visible packaged Beta executable with `OPENCODE_DESKTOP_TEST_ROOT` only if build respects that variable when packaged; otherwise use isolated OS environment and check paths before launch. Stop only own spawned processes, never global OpenCode/Hyper AI services. If safe isolation cannot be guaranteed, do not launch; document exact gate. No binary or secret committed.

## Decisions

### Asked
- D-01 User allowed opening visible Beta desktop with isolated test profile, not touching active Hyper AI profile (2026-10-27).
### Defaulted (change any before sw-do)
- D-02 Synthetic fixture only, no cloud or paid provider calls.
- D-03 Leave user's untracked reports/PDF and storybook files untouched.
### Open
- none

## Tasks

### T-01 Prove isolated profile setup and desktop startup
- AC: AC-01 | Files: docs/multi-agent/desktop-smoke.md | Test: cd rebrand && bun test test/e2e/agent-bundle.test.ts
- Dependencies: none. Verify test root resolution and current installed processes before launch; capture only own PID and test logs.

### T-02 Verify packaged Office skill through desktop startup
- AC: AC-02 | Files: docs/multi-agent/desktop-smoke.md | Test: cd rebrand && bun test test/e2e/deck-quality.test.ts
- Dependencies: T-01. Inspect isolated files and execute referenced deck script with synthetic fixture; negative user-owned fixture if safe. No installed profile writes.

### T-03 Verify and close 0006
- AC: AC-01, AC-02, AC-03 | Files: docs/multi-agent/desktop-smoke.md | Test: specweave verify 0006-smoke-isolated-beta-desktop-skill
- Dependencies: T-01, T-02. Independent review and close only measured scope.
