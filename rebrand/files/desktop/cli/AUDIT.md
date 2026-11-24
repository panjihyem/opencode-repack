# Local audit engine — schemaVersion 1

Entry: `hyper audit <feature> <input.json>`; development: `bun rebrand/files/desktop/cli/hyper.mjs audit ...`.
Draft DOCX: `hyper audit investigation-drafting input.json --docx new-draft.docx --python <installed-office-python>` (python-docx already in office bundle). Existing output is refused. PDF conversion remains existing report-tool workflow, not part of this command.
JSON stdout, errors nonzero, no network, input never overwritten. Redirect only to a new workpaper file.
Amounts are signed safe integer **minor units**; same sign convention bank/GL. IDs and identifiers are strings (preserve leading zeros).
All records require unique `id` and `source: {document: "file or source identifier", page: 1}`. Page >=1, asserted by caller; original must be reviewed.
No inference of document authenticity, legal sufficiency, guilt, or identity. No case data is sent anywhere.

| Feature | Input fields beyond record id/source | Output / ceiling |
|---|---|---|
| bank-rec-to-gl | `bank`, `ledger` arrays: `date` YYYY-MM-DD, `amount`, `currency`, `reference` | Unique exact signed amount/currency/date/reference pairs only; duplicate candidates stay ambiguous/unmatched. Per-currency totals, difference, unmatchedDifference; no one-to-many/FX |
| audit-sampling | `records`, string `seed`, `method: "random"`, `size`; or `method: "stratified"`, `field`, `allocation: {stratum: size}` | Stable SHA-256 seeded ranking without replacement; full explicit stratum allocation. No statistical assurance/projection |
| fraud-anomaly-detection | `records`: date/amount/currency/reference; `benford: {naturallyOccurring: true, unrestricted: true}` | Duplicate keys, 1.5 IQR flags (zero IQR abstains), first-digit frequencies only when >=100 positive amounts spanning >=2 orders. One currency per run; no fraud verdict/p-value |
| money-trail-mapping | `records`: date/amount/currency/`from`/`to`; positive amounts | Directed observed transfers with transaction source references; separate currencies. Reuse existing forensic.py cycles/workbook for graph analysis/export; no beneficial-owner inference |
| structured-doc-extraction | `document`, `docling`: exported Docling JSON (`texts`, `tables`, `prov[].page_no`) | Page-linked text and table cells. Convert original locally using installed Docling `--to json`; no OCR model download or original conversion performed by this command |
| cross-doc-entity-resolution | `records`: `name`, optional `identifier: {type, value}`; optional `threshold` 0..1 | Exact identifier links or normalized character edit-distance name candidates; conflicting IDs flagged, never auto merge |
| tax-legal-rag | `query`, `corpus` records: `law`, `version`, `article`, `text`, `verified: true` | Up to five lexical source matches, `answer: null`; empty/unverified/no-match abstains. Curator must verify law, effective dates and amendments. No real legal corpus shipped |
| element-to-evidence-mapping | `evidence` records with `text`; `elements: [{id, claim, evidenceIds: []}]` | Linked evidence and empty-link gaps; unknown IDs rejected. Link does not establish claim |
| automated-timeline-builder | `events`: `text`, `date`, optional `endDate`, optional `eventKey`; source.page may be null only here | ISO-date ordering, ambiguous/invalid dates or unknown pages retained separately, same eventKey differing dates flagged. No date inference |
| investigation-drafting | `facts` records with `text`, `gaps` string array | Factual source-attributed resume, neutral clarification questions, Markdown; human review required, not signed BAP. Use existing office/report tools to convert reviewed Markdown into DOCX/PDF |

Example:

```json
{"bank":[{"id":"b1","date":"2026-01-02","amount":10000,"currency":"IDR","reference":"001","source":{"document":"bank.pdf","page":1}}],"ledger":[{"id":"g1","date":"2026-01-02","amount":10000,"currency":"IDR","reference":"001","source":{"document":"gl.pdf","page":2}}]}
```

## Implementation tasks and evidence

- [x] Local deterministic engine for all ten named commands with boundary validation and source contracts.
- [x] CLI dispatch before memory-service import; offline, no account required.
- [x] Bundle integration: prepare-bundle.ts copies entire cli directory, including audit.mjs and this contract.
- [x] Managed hyper-audit skill registered in existing skills.ts; installed with office skills, not forced onto existing user skills.
- [x] Runnable synthetic/negative checks: `bun rebrand/test/audit.check.mjs`.
- [x] DOCX export via existing office Python, source references preserved; refuses overwrite. Set `HYPER_AUDIT_TEST_PYTHON` to installed office Python to include export integration check.
- [x] Independent acceptance fixture adapted at input boundary: B1/G1 matched; B3 ambiguous; B4 unmatched; exact/conflicting/fuzzy entities preserved; V2 before V1, V3/V4/V5 unresolved.
- [x] Installed engine-session skill discovery and command execution; desktop GUI/installer build remains untested.
- [ ] Real curated KUP/HPP/KUHAP corpus and legal-owner review; no fictional law represented as real.
- [ ] Original scan OCR, DOCX/PDF artifact QA and production acceptance with authorized inputs; existing tools reused, not proven by synthetic JSON tests.

ponytail: lexical legal retrieval and edit-distance name similarity are minimal review aids; add validated ranking/model-assisted review only with evaluated corpus and explicit human acceptance. Entity pairs are quadratic: use reviewed blocking before large populations. Exact money matching intentionally leaves uncertain pairs unresolved.

## Verification (2026-11-24)

- Audit checks: 19 passed including real CLI valid/invalid JSON and real python-docx export/readback/no-overwrite; synthetic fixtures only. Temporary check directories removed in finally blocks.
- Full overlay runner: passed (22 Bun tests passed, 1 skipped; 18 audit checks at that run; all non-wizard overlay suites passed). Network/Playwright wizard explicitly skipped.
- Independent colleague fixture: reconciliation, entities, timeline assertions passed; schema adapter supplied synthetic document/page metadata for CSV/entity fixtures, unknown timeline pages retained as null. Not evidence of original-document provenance.
- `bun run check`: stopped before typecheck because `oxlint` missing. No dependency installation performed; full lint/typecheck not verified.
- `git diff --check`: passed. No commit, push, application restart or installed application modification.
- Bundling coverage is source-path evidence (`prepare-bundle.ts` copies cli directory); installer was not rebuilt, no desktop end-to-end claim.

### Isolated integration follow-up

- Copied CLI bundle to isolated agent workspace `audit-stage/hyper-bundle/bin`; invoked real `applyOfficeSkills` against isolated config and read-only existing office installation. All 8 skills written there, including `hyper-audit`; staged CLI draft/export and extraction executed successfully without knowledge service.
- Real installed Docling: `HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 docling convert --pipeline native --no-ocr --no-tables --to json --output <stage>/docling <stage>/draft.pdf` passed; staged structured extraction returned 7 text items with page 1 provenance. Native text-PDF path only: scan OCR/table ML remains untested, no model downloads.
- Draft DOCX exported with existing python-docx; PDF made using existing ReportLab from DOCX text, then pypdf readback and pypdfium2 PNG render. Visual QA of corrected `draft-utf8-page-1.png`: legible, no clipped/overlapping text. No claim of exact DOCX-to-PDF layout preservation or Word GUI QA.
- Visual QA caught Windows stdin encoding corruption; exporter now decodes stdin bytes explicitly as UTF-8, regression asserts Unicode em dash survives DOCX readback. 19 checks passed after correction.
- Cached existing oxlint executable found: `bun C:/Users/SER/.bun/install/cache/oxlint@1.60.0@@@1/bin/oxlint <five changed JS/TS files>` returned 0 warnings/errors. Repo config enabled 1 rule for those paths; this is not full typecheck or canonical check. No dependency/lockfile changes.
- Stage artifacts retained in agent workspace only, not installed application. Initial encoding-broken draft artifacts retained for traceability; corrected outputs are named `draft-utf8.docx`, `draft-utf8.pdf`, `draft-utf8-page-1.png`.

### Targeted installed activation (2026-11-24)

- Loose bundle deployed to installed `resources/hyper-bundle/bin`: hyper.mjs, audit.mjs, audit-export.py, AUDIT.md. Only existing hyper.mjs replaced; prior bytes and SHA-256 manifest retained in local deployment backup. No asar modification, signature workaround, process termination, config overwrite or restart.
- Managed `hyper-audit/SKILL.md` added to existing user skill directory with absolute local Bun/CLI/Python paths; no preexisting user skill overwritten. Existing active sessions left untouched. Skill discovery may require a fresh session; not claimed for stale sessions.
- Installed engine import: 19/19 audit checks passed with `HYPER_AUDIT_TEST_MODULE=file:///<installed-bin>/audit.mjs`; CLI subprocess/export checks still exercise repository launcher, installed draft CLI separately passed.
- Full regression after activation: overlay runner pass (22 Bun pass, 1 skip, 19 audit, all non-wizard suites); Hub security 25/25. Full cached oxlint scan: 5123 files, 0 errors, 1309 warnings outside changed audit files. Changed JS/TS lint: 0 warnings/errors.
- Canonical full check remains unverified: missing checkout node_modules/tool shims; `bun run check` fails missing oxlint; direct `bun run typecheck` fails missing turbo executable (Bun resolves turbo.json instead). Cached lint is not a substitute for workspace typecheck. No dependencies/lockfiles altered and no unrelated upstream cleanup attempted.
- Commit/push withheld while required release gates remain unverified. Remote github/hyper-hub-next confirmed at pre-audit 37812a02c054dff3bd719e93742fbf21a7976706. Legal corpus, scanned OCR, full desktop/installer build remain explicitly unavailable, not passed.
- Installed Hyper CLI live-session proof: synthetic session `ses_df5d0ac09ffeXWSJvsiFzqWO9k` loaded `hyper-audit` through real skill tool, listed all ten commands, then executed installed bundle `investigation-drafting` with exit 0 and returned `status: draft-for-human-review`, `resume[0].evidenceId: F1`. Initial invocation correctly rejected an accidental trailing punctuation argument; corrected invocation passed without changing validation. This proves engine-session discovery/execution, not desktop GUI coverage for all ten commands. Only synthetic prompt/session history was created; user sessions were not resumed or interrupted.

### Approved dependency repair and canonical verification

- User approved minimal manifest/lock repair. Root manifest is source of truth: it does not declare Context7, and manifest history has no matching addition. `bun install --lockfile-only` pruned the stale Context7 4.4.2 lock entry and orphaned dependencies; remaining root resolutions were not intentionally upgraded. Transitive placement/deduplication changed as unused Context7 dependencies disappeared. Bun used: 1.4.5; packageManager declaration remains 1.4.2.
- Removed four inactive patchedDependencies declarations: absent standard-openapi 0.2.9, Mistral 3.0.51, Google 3.0.73, and obsolete gcp-metadata 8.1.2 (resolved 8.1.4 already handles expected aggregate network failures). Historical patch files retained, not deleted. Frozen install passed with lifecycle scripts enabled.
- Canonical check exposed preexisting integration errors. Restored the prior explicit config watcher ignore list because FSUtil.ignoreGlobs does not exist. Removed the unsupported MCP ticket exemption/import because this protocol has no MCP ticket endpoint; MCP requests keep password authentication rather than inventing a bypass.
- Windows checkout materialized the custom-elements declaration symlink as plain text. OS denied symlink creation; replaced that stub with an import of the same shared declaration. Commit must record this as a regular file, not a symlink containing TypeScript.
- Final `bun run check`: exit 0, 35/35 tasks successful, no cache hits. Lint retains existing nonfatal warnings; not a zero-warning claim. Server process tests: 3 passed, 141 assertions. Audit: 19/19 including installed-office DOCX export/Unicode/no-overwrite. Overlay runner passed, wizard network/Playwright test still explicitly skipped.
- Security PowerShell rerun refused by OS execution policy. No policy override attempted. Previous 25/25 result remains historical, not a current rerun. Commit/push withheld pending resolution of this required security gate. Logs retained under local Temp/opencode (`hyper-canonical-check-final.log`, `hyper-frozen-install-final.log`, `hyper-overlay-final.log`, `hyper-server-process-test.log`); dependency installation and generated local typecheck artifacts also written.
- Independent teammate reports session `ses_df5d0987effeZvjCpPWFVdZCt6` loaded installed skill and returned legal empty-corpus abstention, exit 0; not rerun here.
