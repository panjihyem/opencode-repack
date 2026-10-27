# Validate Windows installer and Office skill

## Problem

0004 proved only a Windows unpacked test artifact: Graphify CLI in resources runs, desktop compiled chunk contains `deck.py` text, but NSIS EXE and actual Office skill provisioning from package were not tested. Shipping without those gates risks missing scripts and broken skill links.

## Scope

In: build NSIS installer from current branch in clean worktree; inspect file hashes; invoke package's Office setup using isolated test userData/config or equivalent packaged main module without altering real user state; check managed `hyper-report` skill points to an actual deck script; run synthetic PPTX and verify output, negative case-mode Graphify probe. Out: installing over user's active Hyper AI, cloud image generation, Composio, Graphify Cloud, case data, automatic release/push.

## Acceptance Criteria

- [ ] AC-01: NSIS `hyper-ai-desktop-win-x64.exe` built from current commit, exists and is nonempty; bundle includes Graphify CLI, Office deck source and runtime; recorded SHA256 and exact commit.
- [ ] AC-02: With isolated fake config and existing Office install, package-provided Office provisioning creates managed `hyper-report/SKILL.md` pointing at real provisioned `deck.py`; synthetic deck generation via that path yields PPTX with PNG/native chart and renders to PDF; no user-authored skill or script overwritten.
- [ ] AC-03: Packaged Graphify CLI still rejects missing marker, Case Secure mode, docs/case code on all actions; only synthetic repo tested. No Hindsight or real project state modified.
- [ ] AC-04: Verification and independent review distinguish installer build from installed-app smoke and report all limits honestly. Close only if package gates proven; no cloud capability implied.

## Approach

Use a clean worktree from `feat/config-ota` rather than dirty user workspace. Install deps with frozen lockfile, apply `rebrand`, build direct electron-vite CLI if Bun script shim fails, prepare bundle, run prebuild then electron-builder `--win nsis`. Inspect resource `app.asar` and NSIS output; isolate testing under approved temp root. For runtime skill, prefer an invocation of the actual bundled Office installer/skill code with test userData and fake Office venv; never launch visible desktop or overwrite installed config. If that is impossible without opening GUI, report partial test and stop short of claiming AC-02. Do not use case files or new cloud credentials.

## Decisions

### Asked
- none; user asked to finish prior release gates without permission for live image/Composio calls.
### Defaulted (change any before sw-do)
- D-01 Windows x64 only; other OS packages deferred.
- D-02 No real application install or visible browser without explicit user approval; test artifacts in temp worktree.
- D-03 No push or release artifact upload implied; separate user request required.
### Open
- none

## Tasks

### T-01 Produce and inspect current Windows installer
- AC: AC-01 | Files: docs/multi-agent/installer-validation.md | Test: cd rebrand && bun test test/e2e/graphify-integration.test.ts
- Dependencies: none. Build overlay/NSIS in disposable worktree, hash EXE and inspect package files. If network or signing fails, record exact gate, do not mark done.

### T-02 Verify installed Office skill provisioning without user config
- AC: AC-02 | Files: rebrand/files/desktop/hyper/office.ts, rebrand/files/desktop/hyper/skills.ts, rebrand/test/e2e/deck-quality.test.ts, docs/multi-agent/installer-validation.md | Test: cd rebrand && bun test test/e2e/deck-quality.test.ts
- Dependencies: T-01. Exercise package-derived Office code in isolated test config; resolve managed deck path and render synthetic slide. Preserve user-authored skill and script fixtures.

### T-03 Packaged Graphify denial and final close
- AC: AC-03, AC-04 | Files: docs/multi-agent/installer-validation.md | Test: specweave verify 0005-validate-windows-installer-and-office-skill
- Dependencies: T-01, T-02. Run packaged CLI negative probes, verify, fresh-context review and complete. Explicitly state installed-app UI not tested if not run.
