# Verify — 0003-plan-media-decks-and-optional-app-connectors

PASS · 2026-10-27T00:05:39.115Z · commands from explicit

## Commands

### `cd rebrand && bun test test/e2e/deck-quality.test.ts test/e2e/deck-assets.test.ts test/e2e/deck-image-generation.test.ts test/e2e/composio-policy.test.ts test/e2e/graphify-integration.test.ts` → exit 0 (37s)

```
bun test v1.4.4 (38afee6c8)

 5 pass
 0 fail
 58 expect() calls
Ran 5 tests across 5 files. [37.13s]
```

## Acceptance criteria

6/6 met

| AC | Met | Text |
|---|---|---|
| AC-01 | x (tasks) | A public/synthetic deck fixture creates 16:9 `.pptx` with reproducible template/theme, captioned source data, a chart image and at least one editable PowerPoint chart; no source file overwritten. Rendered slides have no overflow and are inspected visually. Existing `hyper-report`/`hyper-chart` behavior stays valid. |
| AC-02 | x (tasks) | Internet image search is opt-in and selects assets only with a recorded landing-page URL, creator, license URL, retrieval time and required attribution. Download validates host/redirect/content type/byte limit before embedding; absent license or disallowed URL fails closed. Offline deck creation remains possible. |
| AC-03 | x (tasks) | Public-only image generation probes 9Router `GET /v1/models/image` for an entitled `cx/gpt-6-sol-image` (or actual advertised image ID) and `POST /v1/images/generations`; mock-provider tests validate selected model, PNG signature, size cap and no secret in logs. A live test may run only with explicit user consent for cost/data. If endpoint or entitlement fails, show unavailable; never relabel chat `cx/gpt-6-sol` as an image model. Saved image is insertable into PPTX and provenance records model/provider/prompt class without secret. |
| AC-04 | x (tasks) | Composio remains absent by default. Feasibility contract using a fake service denies non-public classes, mismatched project/user/session, missing key, unknown/write/destructive tools; produces a single read-only toolkit proposal with disabled remote sandbox and connection management. No live OAuth or Composio tool is activated; actual connected-account proof belongs to a separate approved rollout increment. |
| AC-05 | x (tasks) | User docs distinguish existing, tested, planned and unavailable capabilities; describe cloud data destinations, human approval for publish/send actions, model/asset licensing, cost limits and rollback. Verify package build and fresh-context review before closing implementation; no claim of released connector/media feature based on static tests alone. |
| AC-06 | x (tasks) | Official Graphify-Labs `graphifyy` is installed in an isolated local environment, not replaced by chart/Sankey or Hindsight. A code-only synthetic repo produces `graphify-out/graph.json`, `GRAPH_REPORT.md`, and a working graph query/path; no docs/case files or network payload enter the run. OpenCode access is project-scoped, uninstallable, and does not overwrite user instructions; failure disables Graphify without breaking Hindsight recall. Real package/CLI/MCP integration must be tested before claiming available. |

## Tasks (ledger)

| Task | State | By | Evidence | Note |
|---|---|---|---|---|
| T-01 | done | opencode@riefky | cd rebrand && bun test test/e2e/deck-quality.test.ts → exit… |  |
| T-02 | done | opencode@riefky | cd rebrand && bun test test/e2e/deck-assets.test.ts → exit … |  |
| T-03 | done | opencode@riefky | cd rebrand && bun test test/e2e/deck-image-generation.test.… |  |
| T-04 | done | opencode@riefky | cd rebrand && bun test test/e2e/composio-policy.test.ts → e… |  |
| T-05 | done | opencode@riefky | cd rebrand && bun test test/e2e/deck-quality.test.ts test/e… |  |
| T-06 | done | opencode@riefky | cd rebrand && bun test test/e2e/deck-quality.test.ts → exit… |  |
| T-07 | done | opencode@riefky | cd rebrand && bun test test/e2e/graphify-integration.test.t… |  |
| T-08 | done | opencode@riefky | cd rebrand && bun test test/e2e/graphify-integration.test.t… |  |
| T-09 | done | opencode@riefky | cd rebrand && bun test test/e2e/deck-quality.test.ts → exit… |  |
| T-10 | done | opencode@riefky | cd rebrand && bun test test/e2e/deck-assets.test.ts → exit … |  |
| T-11 | done | opencode@riefky | cd rebrand && bun test test/e2e/graphify-integration.test.t… |  |
| T-12 | done | opencode@riefky | cd rebrand && bun test test/e2e/deck-quality.test.ts → exit… |  |

12/12 done · 0 skipped · 0 claimed · 0 blocked · 0 stale · 0 open
