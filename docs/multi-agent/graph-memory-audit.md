# Existing charts and memory graph audit — 0003

Checked 2026-10-27. This is a capability boundary record, not evidence that Graphify was installed.

| Capability | Status and evidence | Owner |
| --- | --- | --- |
| Basic charts | Existing `hyper-chart` uses matplotlib PNG; `hyper-report` embeds graphics into PPTX/DOCX/PDF (`rebrand/files/desktop/hyper/skills.ts`). T-01 added only source-captioned PPTX composition, **not a new chart engine**. | Hyper AI Office |
| Sankey/treemap/graph | Already in `hyper-fundflow`, `forensic.ts` Sankey job and `hyper viz` ECharts renderer (`rebrand/files/desktop/hyper/forensic.ts`, `bundle.ts`). Reuse SVG/PNG artifacts in slides; do not reimplement. | Hyper AI forensic/viz |
| Hindsight memory graph | MCP `mem` connected. `sessions`: 552 facts (233 world, 100 experience, 219 observation), 628 entity links; `general`: 48 facts, 15 entity links. Both have `pending_consolidation: 0` and `failed_consolidation: 0` as of check. Recall returned existing chart/Sankey fact and 2026-10-23 decision. Session correction retained: chart/Sankey already present. | `mem` / Hindsight |
| Graphify-Labs code graph | **Not installed** in active Hyper AI. Unlike Hindsight episodic/general memories, Graphify maps deterministic AST calls/imports and optional docs relationships per repo. Not same as Sankey and not a replacement for Hindsight. User requires adding it as separate local memory-layer capability. | T-07 |

Graphify gate: official package is `graphifyy`; run isolated, code-only (`GRAPHIFY_BACKEND=none`, no cloud) on explicit synthetic repo first. Never scan case documents or turn on cloud/LLM semantic extraction by default. Test `extract`, `query`, `path`, project-scoped access, rollback and packaged installation. Until T-07 passes, answer **Graphify unavailable**.
