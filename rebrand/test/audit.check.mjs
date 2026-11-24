import assert from "node:assert/strict"
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
const { audit } = await import(process.env.HYPER_AUDIT_TEST_MODULE || "../files/desktop/cli/audit.mjs")

const source = { document: "SYNTHETIC.pdf", page: 1 }
const row = (id, extra = {}) => ({ id, source, ...extra })
const tx = (id, extra = {}) => row(id, { date: "2026-01-02", amount: 100, currency: "IDR", reference: "001", ...extra })
let checks = 0
const check = (name, fn) => { fn(); checks++; console.log(`PASS ${name}`) }
check("unique conservative reconciliation and currency tieout", () => {
  const r = audit("bank-rec-to-gl", { bank: [tx("b1"), tx("b2", { amount: 50 })], ledger: [tx("g1")] })
  assert.equal(r.matches.length, 1); assert.equal(r.tieout[0].difference, 50); assert.equal(r.tieout[0].unmatchedDifference, 50)
})
check("duplicate ambiguity cannot consume ledger", () => {
  const r = audit("bank-rec-to-gl", { bank: [tx("b1"), tx("b2")], ledger: [tx("g1")] })
  assert.equal(r.matches.length, 0); assert.equal(r.ambiguous.length, 2); assert.equal(r.unmatchedLedger.length, 1)
})
check("input validation rejects float, missing source, unsafe total, invalid date", () => {
  for (const record of [tx("b", { amount: 1.1 }), tx("b", { source: null }), tx("b", { date: "2026-02-30" })])
    assert.throws(() => audit("bank-rec-to-gl", { bank: [record], ledger: [] }))
  assert.throws(() => audit("bank-rec-to-gl", { bank: [tx("a", { amount: Number.MAX_SAFE_INTEGER }), tx("b")], ledger: [] }))
})
check("seeded sample order independent without replacement", () => {
  const records = Array.from({ length: 20 }, (_, i) => row(String(i)))
  const input = { records, seed: "test-seed", method: "random", size: 8 }
  const a = audit("audit-sampling", input).selected.map((r) => r.id)
  assert.deepEqual(a, audit("audit-sampling", { ...input, records: records.toReversed() }).selected.map((r) => r.id))
  assert.equal(new Set(a).size, 8)
  assert.throws(() => audit("audit-sampling", { ...input, size: 21 }))
})
check("stratified exact allocations and validation", () => {
  const input = { records: [row("a", { band: "high" }), row("b", { band: "low" })], seed: "x", method: "stratified", field: "band", allocation: { high: 1, low: 0 } }
  assert.equal(audit("audit-sampling", input).strata[0].selected.length, 1)
  assert.throws(() => audit("audit-sampling", { ...input, allocation: { high: 1 } }))
})
check("duplicate flags and Benford abstention", () => {
  const r = audit("fraud-anomaly-detection", { records: [tx("a"), tx("b")] })
  assert.deepEqual(r.duplicates, [["a", "b"]]); assert.equal(r.benford.eligible, false)
})
check("Benford eligible frequencies and outlier", () => {
  const records = Array.from({ length: 120 }, (_, i) => tx(String(i), { amount: 10 ** (i % 4) + i, reference: String(i) }))
  const r = audit("fraud-anomaly-detection", { records, benford: { naturallyOccurring: true, unrestricted: true } })
  assert.equal(r.benford.eligible, true); assert.equal(r.benford.digits.reduce((s, d) => s + d.count, 0), 120)
  assert.throws(() => audit("fraud-anomaly-detection", { records: [tx("a"), tx("b", { currency: "USD" })] }))
})
check("trail source retention and currencies remain separate", () => {
  const r = audit("money-trail-mapping", { records: [tx("a", { from: "A", to: "B" }), tx("b", { from: "A", to: "B", currency: "USD" })] })
  assert.equal(r.edges.length, 2); assert.deepEqual(r.edges[0].transactions[0].source, source)
})
check("Docling JSON pages retained, missing provenance rejected", () => {
  const input = { document: "scan.pdf", docling: { texts: [{ text: "Example", prov: [{ page_no: 2 }] }] } }
  assert.equal(audit("structured-doc-extraction", input).items[0].sources[0].page, 2)
  assert.throws(() => audit("structured-doc-extraction", { ...input, docling: { texts: [{ text: "x" }] } }))
})
check("entity identifiers retain leading zeros and conflicts never merge", () => {
  const r = audit("cross-doc-entity-resolution", { records: [row("a", { name: "PT Contoh", identifier: { type: "tax", value: "001" } }), row("b", { name: "PT Contoh", identifier: { type: "tax", value: "1" } })] })
  assert.equal(r.pairs[0].status, "conflicting-id-review"); assert.equal(r.pairs[0].autoMerged, false)
})
check("legal abstains without verified matching passages", () => {
  assert.equal(audit("tax-legal-rag", { query: "pajak", corpus: [] }).status, "abstain")
  const fixture = row("f", { law: "FIKTIF", version: "fixture-only", article: "FAKE-1", text: "contoh pajak", verified: true })
  assert.equal(audit("tax-legal-rag", { query: "pajak", corpus: [fixture] }).passages[0].article, "FAKE-1")
  assert.equal(audit("tax-legal-rag", { query: "pajak", corpus: [{ ...fixture, verified: false }] }).status, "abstain")
})
check("evidence gaps and dangling IDs", () => {
  assert.deepEqual(audit("element-to-evidence-mapping", { evidence: [], elements: [{ id: "e", claim: "claim", evidenceIds: [] }] }).gaps, ["e"])
  assert.throws(() => audit("element-to-evidence-mapping", { evidence: [], elements: [{ id: "e", claim: "claim", evidenceIds: ["missing"] }] }))
})
check("timeline retains ambiguous and conflicting source assertions", () => {
  const r = audit("automated-timeline-builder", { events: [row("a", { text: "A", date: "2026-01-01", eventKey: "same" }), row("b", { text: "B", date: "2026-01-02", eventKey: "same" }), row("c", { text: "C", date: "01/02/2026" }), row("d", { text: "D", date: "2026-02-30" })] })
  assert.equal(r.ambiguous.length, 2); assert.equal(r.conflicts.length, 1)
})
check("draft is source-attributed and not a verdict", () => {
  const r = audit("investigation-drafting", { facts: [row("f", { text: "Catatan sintetis" })], gaps: ["asal pembayaran"] })
  assert.equal(r.questions[0].evidenceId, "f"); assert.match(r.markdown, /SYNTHETIC.pdf, hlm. 1/); assert.equal(r.status, "draft-for-human-review")
})
check("unknown commands and nonobject inputs rejected", () => {
  assert.throws(() => audit("constructor", {})); assert.throws(() => audit("audit-sampling", []))
})
check("fuzzy spelling candidate without identifier stays review-only", () => {
  const r = audit("cross-doc-entity-resolution", { records: [row("a", { name: "PT Contoh Fiktif" }), row("b", { name: "PT Contoh Fiktiff" })] })
  assert.equal(r.pairs[0].status, "name-candidate-review")
})
check("unknown page timeline stays unresolved", () => {
  assert.equal(audit("automated-timeline-builder", { events: [row("a", { text: "unknown", date: "", source: { document: "fixture", page: null } })] }).ambiguous.length, 1)
})
check("real CLI runs offline, preserves input and returns nonzero on invalid input", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "hyper-audit-check-"))
  try {
    const file = path.join(dir, "fixture.json")
    const content = JSON.stringify({ query: "SYNTHETIC", corpus: [] })
    writeFileSync(file, content)
    const cli = fileURLToPath(new URL("../files/desktop/cli/hyper.mjs", import.meta.url))
    const result = spawnSync(process.execPath, [cli, "audit", "tax-legal-rag", file], { encoding: "utf8" })
    assert.equal(result.status, 0, result.stderr)
    assert.equal(JSON.parse(result.stdout).status, "abstain")
    assert.equal(readFileSync(file, "utf8"), content)
    writeFileSync(file, "{")
    assert.notEqual(spawnSync(process.execPath, [cli, "audit", "tax-legal-rag", file]).status, 0)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
if (process.env.HYPER_AUDIT_TEST_PYTHON) check("CLI DOCX export and no-overwrite with installed office Python", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "hyper-audit-docx-"))
  try {
    const file = path.join(dir, "draft.json"), output = path.join(dir, "draft.docx")
    writeFileSync(file, JSON.stringify({ facts: [row("f", { text: "Fakta sintetis" })], gaps: [] }))
    const cli = fileURLToPath(new URL("../files/desktop/cli/hyper.mjs", import.meta.url))
    const args = [cli, "audit", "investigation-drafting", file, "--docx", output, "--python", process.env.HYPER_AUDIT_TEST_PYTHON]
    const result = spawnSync(process.execPath, args, { encoding: "utf8" })
    assert.equal(result.status, 0, result.stderr)
    const original = readFileSync(output)
    assert.equal(original.subarray(0, 2).toString(), "PK")
    const verify = spawnSync(process.env.HYPER_AUDIT_TEST_PYTHON, ["-c", "from docx import Document; import sys; t='\\n'.join(p.text for p in Document(sys.argv[1]).paragraphs); assert 'Fakta sintetis' in t and 'SYNTHETIC.pdf' in t and chr(0x2014) in t", output], { encoding: "utf8" })
    assert.equal(verify.status, 0, verify.stderr)
    assert.notEqual(spawnSync(process.execPath, args).status, 0)
    assert.deepEqual(readFileSync(output), original)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
console.log(`${checks} audit checks passed (synthetic data only)`)
