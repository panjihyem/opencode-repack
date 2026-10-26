# Media, deck, and optional app connector enhancements

## Problem

Hyper AI already ships `hyper-report` (python-pptx), `hyper-chart` (matplotlib), `hyper-fundflow` (Sankey/treemap/graph), `hyper viz` (ECharts), Office tools and source-aware case templates. The gap is composing existing visual output into slides with provenance and layout QA, not creating another chart engine. Slides also lack image provenance and a dedicated image-generation tool. The `cx/gpt-6-sol` chat route does not by itself call a media API. External app integrations via Composio could expose case data or mutate connected accounts if enabled indiscriminately. Increment 0002 is closed as an **unreleased** text-only candidate, not proof of runtime security.

## Scope

In: incremental, optional enhancements to existing report/chart skills; image provenance and an opt-in 9Router public-image probe; a narrowly scoped Composio read-only feasibility pilot for public/synthetic fixtures; **Graphify-Labs local code-graph integration required** beside Hindsight; documentation and gates for later release. Out: bundling all OpenDesign, Graphify Cloud/LLM semantic scan of case documents by default, an always-on Composio catalog or remote sandbox, sending original case/internal/confidential data through cloud tools, guaranteed image entitlement, video generation, and declaring 0002 released.

This is a **planned backlog**, not an implementation or authorization to connect real accounts. Work in priority order; stop each feature at its verified gate. Future tasks may be split into separate implementation increments with the same ACs if ownership or tests need isolation.

## Acceptance Criteria

- [ ] AC-01: A public/synthetic deck fixture creates 16:9 `.pptx` with reproducible template/theme, captioned source data, a chart image and at least one editable PowerPoint chart; no source file overwritten. Rendered slides have no overflow and are inspected visually. Existing `hyper-report`/`hyper-chart` behavior stays valid.
- [ ] AC-02: Internet image search is opt-in and selects assets only with a recorded landing-page URL, creator, license URL, retrieval time and required attribution. Download validates host/redirect/content type/byte limit before embedding; absent license or disallowed URL fails closed. Offline deck creation remains possible.
- [ ] AC-03: Public-only image generation probes 9Router `GET /v1/models/image` for an entitled `cx/gpt-6-sol-image` (or actual advertised image ID) and `POST /v1/images/generations`; mock-provider tests validate selected model, PNG signature, size cap and no secret in logs. A live test may run only with explicit user consent for cost/data. If endpoint or entitlement fails, show unavailable; never relabel chat `cx/gpt-6-sol` as an image model. Saved image is insertable into PPTX and provenance records model/provider/prompt class without secret.
- [ ] AC-04: Composio remains absent by default. Feasibility contract using a fake service denies non-public classes, mismatched project/user/session, missing key, unknown/write/destructive tools; produces a single read-only toolkit proposal with disabled remote sandbox and connection management. No live OAuth or Composio tool is activated; actual connected-account proof belongs to a separate approved rollout increment.
- [ ] AC-05: User docs distinguish existing, tested, planned and unavailable capabilities; describe cloud data destinations, human approval for publish/send actions, model/asset licensing, cost limits and rollback. Verify package build and fresh-context review before closing implementation; no claim of released connector/media feature based on static tests alone.
- [ ] AC-06: Official Graphify-Labs `graphifyy` is installed in an isolated local environment, not replaced by chart/Sankey or Hindsight. A code-only synthetic repo produces `graphify-out/graph.json`, `GRAPH_REPORT.md`, and a working graph query/path; no docs/case files or network payload enter the run. OpenCode access is project-scoped, uninstallable, and does not overwrite user instructions; failure disables Graphify without breaking Hindsight recall. Real package/CLI/MCP integration must be tested before claiming available.

## Approach

### Existing assets and gaps (checked 2026-10-27)

| Area | Existing Hyper AI | Enhancement, smallest first |
| --- | --- | --- |
| Slides | `rebrand/files/desktop/hyper/skills.ts` `hyper-report`: python-pptx and templates | Brand/style guide, editable chart option, footer/overflow checks, render/PDF + visual inspection. Keep PNG when fidelity matters. |
| Charts | `hyper-chart`: matplotlib PNG; `hyper-fundflow`: Sankey/treemap/graph; `hyper viz`: ECharts SVG/PNG | Reuse existing chart artifacts in PPTX and retain units/source/math; no new chart engine, Sankey pipeline or graph tool. Editable PowerPoint chart is an export format for source tabular data, not a replacement. |
| Images | Web search tools and `cx` chat provider; no registered image-generation tool | Wikimedia Commons image selection with license/attribution manifest, then optional 9Router image-generation tool. Distinguish generated and licensed assets. |
| Media | `packages/ai` has Image/Video clients and xAI protocols, but Hyper AI has no user-facing media dispatcher | Reuse only after proving configured credentials and endpoint; no model-picker flag or chat `modalities` toggle alone. |
| App connections | OpenCode MCP available, Case Secure blocks selected MCPs but shell/model network remain possible | Composio as **project opt-in** via narrowly scoped session MCP or SDK; do not silently install global connectors. Verify guard at actual executor, not prompt text. |
| Packaging | Overlay/desktop installer exists; `0002` has fake-generator proof only | Tests for actual installed plugin, live path, then build/installer; preserve user's untracked reports/PDF. |

### Chosen order

1. **P0 deck composition/quality, not chart creation.** Reuse `hyper-chart` and `hyper viz` outputs (including Sankey), embed in PPTX with source/units/caption, optionally export source table as native editable chart, then render/overflow check. The T-01 synthetic two-chart generator is only an example; do not advertise it as new chart feature. Use installed `python-pptx`/`matplotlib`; don't add PptxGenJS unless Python path demonstrably fails. OpenDesign themes may inspire a reviewed style set; do not vendor app.
2. **P1 web image assets.** Search/choose via a source that provides license metadata (e.g., Commons), require user selection, record provenance. Allowlisted HTTPS downloads only, no arbitrary returned URL or automatic insertion into sensitive documents; attribution slide/notes when required.
3. **P1 generated public image.** 9Router's 2026-10-26 changelog lists `cx/gpt-6-sol-image` and image output capabilities. The active account/endpoint remains **unverified**; catalog and mocked generation precede a consented live smoke test. Do not copy `opencode-gpt-imagegen` V1 plugin into V2: current third-party package uses `@opencode-ai/plugin` and V1 entrypoints; port or write minimal V2 tool only if router supports image API. Its proxy mode omits authorization header. Video remains separate.
4. **P2 Composio pilot.** Current Composio sessions default to access to *every* toolkit. Create explicit allowlist for one read-only toolkit/tool pair with `sessionPreset: DIRECT_TOOLS`, `manageConnections: false`, `sandbox: false`, `mcp: true` only where server-side policy/approval is proven. `noElicitationSupportFallback: "deny"` for approval-required tools if MCP cannot elicit. Bind one user/account/project; use a scoped project API key, never store exported `session.mcp.headers` in repo or model-visible output. SDK path needed if `beforeExecute` interception is required; MCP bypasses SDK-side hooks. Disable by default in Case Secure and any non-public route. Do not rely on Composio tool tags alone as DLP. Run read-only public fixtures before any OAuth pilot.
5. **P1 Graphify code structure.** Install official `graphifyy` (double-y) in a separate venv and run code-only local AST extraction on explicit project roots. Prove graph query and path on synthetic code, then register a scoped CLI skill or MCP only after verifying versioned interface. Keep Graphify output out of source control and filter secrets/outputs. Hindsight still owns session/general semantic memories, not AST dependency edges. Never enable Graphify Cloud, docs/PDF semantic extraction, hooks or auto-index for case folders by default. Explicit removal and rollback required.
6. **Later only with demand:** OpenDesign companion app/MCP for interactive design iteration, video, workflow triggers, cloud publish/edit connectors, and case-data integration. These need their own data/security and cost decisions.

### Research evidence

- Hyper AI source: `rebrand/files/desktop/hyper/skills.ts`, `manifest.ts`, `rebrand/files/desktop/hyper/case/casemode.py`, `docs/multi-agent/pilot-results.md`.
- [OpenDesign README](https://github.com/nexu-io/open-design): deck templates/design systems, OpenCode MCP, HTML/PDF export; PPTX via agent skill, not guaranteed native editable fidelity. [PPTX catalogue entry](https://github.com/nexu-io/open-design/blob/main/skills/pptx-generator/SKILL.md) points to separate upstream bundle.
- [PptxGenJS](https://github.com/gitbrent/PptxGenJS): native PPTX chart/image alternative; [Marp CLI](https://github.com/marp-team/marp-cli) normally exports slides as raster backgrounds; editable export experimental. Neither is required initially.
- [9Router changelog](https://github.com/decolua/9router/blob/master/CHANGELOG.md): `cx/gpt-6-sol-image` in v0.5.111; [Codex images proposal](https://github.com/decolua/9router/issues/2718) shows entitlement and edits may vary. Catalog entry is not proof of this account's access.
- [Composio session policy](https://docs.composio.dev/docs/configuring-sessions): unrestricted default, toolkit/tool allowlist, direct-tools preset, sandbox disabled; [MCP caveats](https://docs.composio.dev/docs/sessions-via-mcp): hosted MCP receives a project key, bypasses SDK `beforeExecute`/`afterExecute`; [pricing](https://composio.dev/pricing): Hobby 100K calls/mo but Composio-managed app allowance 20K, quotas/pricing may change.
- [Graphify-Labs/graphify](https://github.com/Graphify-Labs/graphify): official PyPI name `graphifyy`; code-only tree-sitter graph is local, docs/media semantic pass can use an external LLM. Graphify outputs code structure; it is not `hyper viz` or Hindsight memory graph.

## Decisions

### Asked
- D-01 Composio pilot data boundary → user chose only public/synthetic and read-only tools (2026-10-27). No private/original-case data or account write tools authorized.
- D-06 User correction: Hyper AI already has chart, including Sankey; audit/update Hindsight memory and clarify Graphify before continuing media work (2026-10-27). Graphify is a distinct code-graph capability.
- D-07 User decision: Graphify is required in Hyper AI memory layer; add executable installation/integration task, not just a paper audit (2026-10-27). Keep code-only local by default.
- D-08 User declined live 9Router image test and billable generation; use fake provider only. Do not claim entitlement or live image support (2026-10-27).

### Defaulted (change any before sw-do)
- D-02 Reuse installed Python Office/chart stack; no full OpenDesign or PptxGenJS bundling by default. Upgrade only after visible sample fails quality/fidelity checks.
- D-03 External integrations, image search and image generation all default off, opt-in per project; no global app connection.
- D-04 Live image call and OAuth connection need explicit consent; development tests use fixtures/fake providers. No new credential committed.
- D-05 Source images require rights metadata and user selection. Generated imagery is labeled, not treated as verified factual evidence.

### Open
- none. Choose actual toolkit/account, brand template, and billed image model at each pilot gate; missing credentials or entitlement means the pilot stays off, not a reason to weaken tests.

## Tasks

### T-01 Deck quality with existing stack
- AC: AC-01, AC-05 | Files: rebrand/files/desktop/hyper/skills.ts, rebrand/files/desktop/hyper/office.ts, rebrand/files/desktop/hyper/deck.py, rebrand/apply.ts, rebrand/test/e2e/deck-quality.test.ts, docs/multi-agent/media-deck-plan.md | Test: cd rebrand && bun test test/e2e/deck-quality.test.ts
- Dependencies: none. Test through installed Office workflow with synthetic fixture, inspect PPTX structure and rendered slide artifacts; keep existing chart PNG behavior.

### T-02 Public licensed image assets
- AC: AC-02, AC-05 | Files: rebrand/files/desktop/hyper/skills.ts, rebrand/files/desktop/hyper/assets.ts, rebrand/test/e2e/deck-assets.test.ts, docs/multi-agent/media-deck-plan.md | Test: cd rebrand && bun test test/e2e/deck-assets.test.ts
- Dependencies: T-01. Fake metadata/image server with redirect/content-type/size/license failures; no web image auto-download in a sensitive project.
- Pause new implementation until T-06 memory/graph audit is recorded; do not substitute chart work for this asset task.

### T-03 Optional image generation probe and insert
- AC: AC-03, AC-05 | Files: rebrand/files/desktop/hyper/skills.ts, rebrand/files/desktop/hyper/image-generation.ts, rebrand/test/e2e/deck-image-generation.test.ts, docs/multi-agent/media-deck-plan.md | Test: cd rebrand && bun test test/e2e/deck-image-generation.test.ts
- Dependencies: T-01. A fake provider tests catalog/generation, PNG/output/provenance and denial. No live call or installed plugin because D-08 forbids billable test; status remains unavailable until separately approved live pilot.

### T-04 Composio feasibility contract, no global install
- AC: AC-04, AC-05 | Files: docs/multi-agent/composio-evaluation.md, rebrand/files/desktop/hyper/composio-policy.ts, rebrand/test/e2e/composio-policy.test.ts | Test: cd rebrand && bun test test/e2e/composio-policy.test.ts
- Dependencies: none. Decide MCP vs SDK on security evidence; simulate one read-only toolkit, denied write/unknown tool and no-key path. Do not use a live account until consent. If SDK authorization checks must run on each tool call, add separate runtime task/Files before activation.

### T-05 Verify and close 0003
- AC: AC-01, AC-02, AC-03, AC-04, AC-05, AC-06 | Files: docs/multi-agent/media-deck-plan.md, docs/multi-agent/composio-evaluation.md | Test: cd rebrand && bun test test/e2e/deck-quality.test.ts test/e2e/deck-assets.test.ts test/e2e/deck-image-generation.test.ts test/e2e/composio-policy.test.ts test/e2e/graphify-integration.test.ts
- Dependencies: T-01, T-02, T-03, T-04, T-06, T-07. Run package-scoped tests, Office render audit, graph fixture, fresh-context review and complete only supported scope. Never treat a planned/completed increment as authorization for cloud data egress.

### T-06 Audit existing charts, Hindsight graph and Graphify boundary
- AC: AC-01, AC-05 | Files: docs/multi-agent/graph-memory-audit.md, docs/multi-agent/media-deck-plan.md | Test: cd rebrand && bun test test/e2e/deck-quality.test.ts
- Dependencies: T-01. Confirm live Hindsight bank stats and existing Sankey/viz code; distinguish external Graphify-Labs (not installed) from Hindsight graph and from fundflow visualization. Record user correction in session memory, don't enable new service.

### T-07 Install isolated Graphify and expose scoped code graph
- AC: AC-05, AC-06 | Files: rebrand/files/desktop/cli/graphify.mjs, rebrand/files/desktop/cli/hyper.mjs, rebrand/scripts/prepare-bundle.ts, rebrand/files/desktop/hyper/skills.ts, rebrand/test/e2e/graphify-integration.test.ts, docs/multi-agent/graph-memory-audit.md | Test: cd rebrand && bun test test/e2e/graphify-integration.test.ts
- Dependencies: T-06. Use existing Hyper CLI, not unsafe desktop IPC: isolated official `graphifyy==0.9.96` installed on demand from existing Office uv, never at startup. Code-only backend none, explicit project marker, separate output, no global assistant instructions or cloud. Test actual CLI on synthetic code and negative case/docs/missing opt-in, rollback and bundling. If native CLI/package cannot be tested on this machine, do not mark done or claim shipped.

### T-08 Restrict Graphify to reviewed code paths
- AC: AC-06 | Files: rebrand/files/desktop/cli/graphify.mjs, rebrand/test/e2e/graphify-integration.test.ts, docs/multi-agent/graph-memory-audit.md | Test: cd rebrand && bun test test/e2e/graphify-integration.test.ts
- Dependencies: T-07. Independent review found opted-in repo containing `case.py` can still be scanned. Deny case/sensitive filenames and symlinked code paths before running CLI; keep output and Hindsight unchanged. Test a synthetic case.py negative fixture.

### T-09 Restore deck module in existing Office installs and bound slide text
- AC: AC-01, AC-05 | Files: rebrand/files/desktop/hyper/office.ts, rebrand/files/desktop/hyper/deck.py, rebrand/test/e2e/deck-quality.test.ts, docs/multi-agent/media-deck-plan.md | Test: cd rebrand && bun test test/e2e/deck-quality.test.ts
- Dependencies: T-01. Copy managed deck script when existing install marker is present without reinstalling packages. Bound label/caption length and render a long-text negative fixture; do not claim geometrical shape checks prove text fit.
