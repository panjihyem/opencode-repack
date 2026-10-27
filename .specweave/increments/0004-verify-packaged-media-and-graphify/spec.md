# Verify packaged media and Graphify

## Problem

0003 completed scoped local work: synthetic PPTX, Graphify CLI fixture, optional Commons asset and fake image/Composio contracts. No freshly built desktop package proves the new CLI, deck script, skill, or opt-in graph can run from installed artifacts. Completion must not be confused with package release.

## Scope

In: build current `feat/config-ota` overlay in an isolated disposable worktree; run packaged `hyper graphify` on synthetic code without network; verify Office deck module and skill after packaging; inspect artifact, record proof and limitations. Out: real case data, Composio OAuth, live/billable image generation, user-config overwrite, release to end users.

## Acceptance Criteria

- [ ] AC-01: Overlay applies to clean checkout and desktop build plus Windows unpacked package exit 0. Packaged resources include `bin/hyper.mjs`, `bin/graphify.mjs`, Office `deck.py` source and compiled desktop managed skill path; package artifact evidence names path, commit and hash.
- [ ] AC-02: From packaged CLI resources, opted-in synthetic repo yields local Graphify graph and query/path with `GRAPHIFY_BACKEND=none`; without marker, case mode or docs/case code, no graph command executes, including queries after a sensitive file appears. Hindsight service/data unchanged. No real project scan.
- [ ] AC-03: Source of managed Office `deck.py` in compiled desktop artifact is inspected; overlay script generates synthetic deck and renders to PDF without overwriting user source; pre-existing Office install preserves user-authored deck. Installed desktop skill registration/execution remains unproven and blocks release claim.
- [ ] AC-04: Report says which features are shipped in test artifact versus fake-only/inactive, and what remains unproven; package build/inspection and fresh-context review pass before closing 0004.

## Approach

Start with `specweave pickup`. Avoid modifying current checkout's untracked PDFs/`.specweave/state/` or unrelated `packages/storybook` files. Create a fresh worktree based on this branch; `bun install --frozen-lockfile --ignore-scripts` there if needed. Apply overlay from this branch, then build using direct electron-vite CLI when Windows Bun script shims return `Operation not permitted`. Use bundled uv/Python or a temporary test environment, never a production account or case file. Keep large EXE out of Git; no push or release implied by verification. Existing 0003 code may need minimal installer fix if runtime test fails, with exact task Files amended before edits.

## Decisions

### Asked
- none. User explicitly requests finish/bundle evidence for 0003 (2026-10-27); live paid calls already declined.
### Defaulted (change any before sw-do)
- D-01 Packaging target: Windows x64 unpacked desktop first; NSIS only if toolchain available and all package gates pass.
- D-02 No cloud activation: Graphify code-only/local; image-gen and Composio remain fake/inactive.
- D-03 No destructive cleanup of existing worktrees or user files.
### Open
- none

## Tasks

### T-01 Verify clean overlay build and packaged resources
- AC: AC-01 | Files: docs/multi-agent/package-validation.md, rebrand/apply.ts, rebrand/scripts/prepare-bundle.ts, rebrand/files/desktop/hyper/office.ts | Test: cd rebrand && bun test test/e2e/graphify-integration.test.ts test/e2e/deck-quality.test.ts
- Dependencies: none. Run overlay/build/package in disposable worktree, inspect resources and hash. Fix missing bundle files only inside listed Files; don't claim installer when only unpacked artifact passed.

### T-02 Exercise packaged Graphify and Office entrypoints
- AC: AC-02, AC-03 | Files: rebrand/files/desktop/cli/graphify.mjs, rebrand/files/desktop/cli/hyper.mjs, rebrand/test/e2e/graphify-integration.test.ts, rebrand/test/e2e/deck-quality.test.ts, docs/multi-agent/package-validation.md | Test: cd rebrand && bun test test/e2e/graphify-integration.test.ts test/e2e/deck-quality.test.ts
- Dependencies: T-01. Invoke copied CLI from package resource directory; use synthetic repo, marker, negative fixtures, and packaged deck script. No live app config or cloud calls.

### T-03 Verify and close 0004
- AC: AC-01, AC-02, AC-03, AC-04 | Files: docs/multi-agent/package-validation.md | Test: specweave verify 0004-verify-packaged-media-and-graphify
- Dependencies: T-01, T-02. Recheck package evidence, review in fresh context, then complete as verified test artifact only.

### T-04 Recheck Graphify guard on every command and narrow deck claim
- AC: AC-02, AC-03, AC-04 | Files: rebrand/files/desktop/cli/graphify.mjs, rebrand/test/e2e/graphify-integration.test.ts, docs/multi-agent/package-validation.md | Test: cd rebrand && bun test test/e2e/graphify-integration.test.ts test/e2e/deck-quality.test.ts
- Dependencies: T-02. Reviewer found query/path can run after docs/case file appears and packaged deck source is not an installed executable. Deny all Graphify actions in unsafe repo; report only verified Office source/render evidence.
