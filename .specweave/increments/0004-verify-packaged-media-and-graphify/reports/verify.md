# Verify — 0004-verify-packaged-media-and-graphify

PASS · 2026-10-27T01:01:38.751Z · commands from explicit

## Commands

### `cd rebrand && bun test test/e2e/graphify-integration.test.ts test/e2e/deck-quality.test.ts test/e2e/deck-assets.test.ts test/e2e/deck-image-generation.test.ts test/e2e/composio-policy.test.ts` → exit 0 (39s)

```
bun test v1.4.4 (38afee6c8)

 5 pass
 0 fail
 60 expect() calls
Ran 5 tests across 5 files. [38.74s]
```

## Acceptance criteria

4/4 met

| AC | Met | Text |
|---|---|---|
| AC-01 | x (tasks) | Overlay applies to clean checkout and desktop build plus Windows unpacked package exit 0. Packaged resources include `bin/hyper.mjs`, `bin/graphify.mjs`, Office `deck.py` source and compiled desktop managed skill path; package artifact evidence names path, commit and hash. |
| AC-02 | x (tasks) | From packaged CLI resources, opted-in synthetic repo yields local Graphify graph and query/path with `GRAPHIFY_BACKEND=none`; without marker, case mode or docs/case code, no graph command executes, including queries after a sensitive file appears. Hindsight service/data unchanged. No real project scan. |
| AC-03 | x (tasks) | Source of managed Office `deck.py` in compiled desktop artifact is inspected; overlay script generates synthetic deck and renders to PDF without overwriting user source; pre-existing Office install preserves user-authored deck. Installed desktop skill registration/execution remains unproven and blocks release claim. |
| AC-04 | x (tasks) | Report says which features are shipped in test artifact versus fake-only/inactive, and what remains unproven; package build/inspection and fresh-context review pass before closing 0004. |

## Tasks (ledger)

| Task | State | By | Evidence | Note |
|---|---|---|---|---|
| T-01 | done | opencode@riefky | cd rebrand && bun test test/e2e/graphify-integration.test.t… |  |
| T-02 | done | opencode@riefky | cd rebrand && bun test test/e2e/graphify-integration.test.t… |  |
| T-03 | done | opencode@riefky | cd rebrand && bun test test/e2e/graphify-integration.test.t… |  |
| T-04 | done | opencode@riefky | cd rebrand && bun test test/e2e/graphify-integration.test.t… |  |
| T-05 | done | opencode@riefky | cd rebrand && bun test test/e2e/graphify-integration.test.t… |  |

5/5 done · 0 skipped · 0 claimed · 0 blocked · 0 stale · 0 open
