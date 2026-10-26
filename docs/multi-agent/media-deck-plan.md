# Media/deck enhancement — 0003

Status: local deck example tested; image search, image generation and Composio not enabled. Keep private/case data local.

Correction: `hyper-chart`, `hyper-fundflow` Sankey/treemap/graph and `hyper viz` already ship. T-01 adds an auditable PPTX composition example, **not a new chart pipeline**. Graphify-Labs code graph is distinct from both these visualizations and Hindsight memory graph; see `graph-memory-audit.md`. User requires separate T-07 local Graphify integration. No Graphify tool installed yet.

`hyper-report` continues using installed `python-pptx` and `hyper-chart` continues using matplotlib PNG. `deck.py` adds a bounded public/synthetic 16:9 example with two slides: embedded PNG and native editable PowerPoint chart. Both carry `Sumber:` caption. It refuses non-public input and existing output. This is not an automatic classification or claim of pixel-perfect branding.

Verification: `bun test test/e2e/deck-quality.test.ts` in `rebrand` checks output data/source unchanged, PNG signature, editable chart and shape bounds. A synthetic deck was rendered to PDF with PowerPoint, two slides, and visually inspected; no apparent overlap. Output kept in approved temporary workspace, not distributed as document template. The Office CLI ships `deck.py` from overlay and managed `hyper-report` skill references it; pre-existing user skills are not overwritten.

Next gates:
- Source-licensed web images only, with creator/license/landing URL manifest; no automatic network fetch for confidential/case data.
- Generated images only after 9Router catalog + entitlement and explicit cost/data consent; never infer image capability from `cx/gpt-6-sol` chat alias.
- Composio remains disabled. Pilot one public/synthetic read-only toolkit with no remote sandbox or write privileges. Any publish/send action requires human approval.
- Render and inspect each deck before delivery. Keep PPTX charts editable when user needs editing; PNG when exact appearance matters.
