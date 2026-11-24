// Local, deterministic audit workpapers. No network, model, or legal conclusions.
import { createHash } from "node:crypto"

const text = (v, name) => {
  if (typeof v !== "string" || !v.trim()) throw new Error(`${name}: nonempty string required`)
  return v.trim()
}
const list = (v, name) => {
  if (!Array.isArray(v)) throw new Error(`${name}: array required`)
  return v
}
const integer = (v, name, min = 0) => {
  if (!Number.isSafeInteger(v) || v < min) throw new Error(`${name}: safe integer >= ${min} required`)
  return v
}
const total = (values) => values.reduce((a, b) => {
  const n = a + b
  if (!Number.isSafeInteger(n)) throw new Error("amount total exceeds safe integer")
  return n
}, 0)
const date = (v) => {
  text(v, "date")
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || !Number.isFinite(Date.parse(v)) || new Date(v).toISOString().slice(0, 10) !== v)
    throw new Error(`invalid ISO date: ${v}`)
  return v
}
const source = (v) => {
  if (!v || typeof v !== "object") throw new Error("source required")
  return { document: text(v.document, "source.document"), page: integer(v.page, "source.page", 1) }
}
const records = (v, name) => {
  const rows = list(v, name)
  const ids = new Set()
  for (const r of rows) {
    text(r.id, `${name}.id`)
    if (ids.has(r.id)) throw new Error(`duplicate record id: ${r.id}`)
    ids.add(r.id)
    source(r.source)
  }
  return rows
}
const money = (r) => {
  integer(r.amount, "amount", -Number.MAX_SAFE_INTEGER)
  text(r.currency, "currency")
  date(r.date)
  return r
}
const normalize = (s) => text(s, "name").normalize("NFKC").toLocaleLowerCase("id-ID").replace(/[^\p{L}\p{N}]+/gu, " ").trim()

export function reconcile(input) {
  const bank = records(input.bank, "bank").map(money)
  const ledger = records(input.ledger, "ledger").map(money)
  // ponytail: exact signed minor-unit/date/reference match only; reviewed rules needed for one-to-many or FX.
  const key = (r) => JSON.stringify([r.amount, r.currency, r.date, text(r.reference, "reference")])
  const matches = [], ambiguous = [], used = new Set()
  for (const b of bank) {
    const candidates = ledger.filter((l) => key(l) === key(b))
    if (candidates.length === 1 && bank.filter((r) => key(r) === key(b)).length === 1) {
      matches.push({ bank: b.id, ledger: candidates[0].id, sources: [source(b.source), source(candidates[0].source)] })
      used.add(candidates[0].id)
    } else if (candidates.length) ambiguous.push({ bank: b.id, candidates: candidates.map((r) => r.id) })
  }
  const matched = new Set(matches.map((r) => r.bank))
  const unmatchedBank = bank.filter((r) => !matched.has(r.id))
  const unmatchedLedger = ledger.filter((r) => !used.has(r.id))
  const currencies = [...new Set([...bank, ...ledger].map((r) => r.currency))].sort()
  return { matches, ambiguous, unmatchedBank, unmatchedLedger, tieout: currencies.map((currency) => {
    const sum = (rows) => total(rows.filter((r) => r.currency === currency).map((r) => r.amount))
    const bankTotal = sum(bank), ledgerTotal = sum(ledger)
    return { currency, bankTotal, ledgerTotal, difference: total([bankTotal, -ledgerTotal]), unmatchedDifference: total([sum(unmatchedBank), -sum(unmatchedLedger)]) }
  }), amountUnit: "integer minor units; signed same direction on both sides" }
}

export function sample(input) {
  const rows = records(input.records, "records").slice().sort((a, b) => a.id.localeCompare(b.id, "en"))
  const seed = text(input.seed, "seed")
  const draw = (population, n) => {
    integer(n, "sample size")
    if (n > population.length) throw new Error("sample exceeds population")
    // SHA-256 ranking gives stable seeded selection without runtime-specific PRNG state.
    return population.map((r) => ({ r, rank: createHash("sha256").update(JSON.stringify([seed, r.id])).digest("hex") }))
      .sort((a, b) => a.rank.localeCompare(b.rank) || a.r.id.localeCompare(b.r.id)).slice(0, n).map(({ r }) => r)
  }
  if (input.method === "random") return { method: "seeded SHA-256 ranking without replacement", seed, population: rows.length, selected: draw(rows, input.size) }
  if (input.method !== "stratified") throw new Error("method must be random or stratified")
  const field = text(input.field, "field")
  const allocation = input.allocation
  if (!allocation || Array.isArray(allocation) || typeof allocation !== "object") throw new Error("allocation object required")
  const groups = new Map()
  for (const r of rows) {
    const stratum = text(r[field], "stratum")
    groups.set(stratum, [...(groups.get(stratum) || []), r])
  }
  if (Object.keys(allocation).some((k) => !groups.has(k)) || [...groups.keys()].some((k) => !Object.hasOwn(allocation, k))) throw new Error("allocation must cover exactly all strata")
  return { method: "stratified seeded SHA-256 ranking", seed, strata: [...groups].map(([stratum, population]) => ({ stratum, population: population.length, selected: draw(population, allocation[stratum]) })), warning: "No statistical projection or assurance implied." }
}

export function anomalies(input) {
  const rows = records(input.records, "records").map(money)
  if (new Set(rows.map((r) => r.currency)).size > 1) throw new Error("analyze one currency at a time")
  const groups = new Map()
  for (const r of rows) {
    const key = JSON.stringify([r.date, r.amount, r.currency, text(r.reference, "reference")])
    groups.set(key, [...(groups.get(key) || []), r.id])
  }
  const amounts = rows.map((r) => r.amount).sort((a, b) => a - b)
  const quantile = (p) => {
    if (!amounts.length) return 0
    const i = (amounts.length - 1) * p, lo = Math.floor(i)
    return amounts[lo] + (amounts[Math.ceil(i)] - amounts[lo]) * (i - lo)
  }
  const q1 = quantile(0.25), q3 = quantile(0.75), iqr = q3 - q1
  const positive = rows.filter((r) => r.amount > 0)
  const orders = positive.map((r) => Math.floor(Math.log10(r.amount)))
  const span = orders.length ? orders.reduce((a, b) => Math.max(a, b)) - orders.reduce((a, b) => Math.min(a, b)) : 0
  const eligible = input.benford?.naturallyOccurring === true && input.benford?.unrestricted === true && positive.length >= 100 && span >= 2
  const observed = Array(9).fill(0)
  for (const r of positive) observed[Number(String(r.amount)[0]) - 1]++
  return { duplicates: [...groups.values()].filter((ids) => ids.length > 1), outliers: iqr > 0 ? rows.filter((r) => r.amount < q1 - 1.5 * iqr || r.amount > q3 + 1.5 * iqr) : [], fences: { q1, q3, iqr }, benford: { eligible, positiveCount: positive.length, excludedNonPositive: rows.length - positive.length, orderSpan: span, reason: eligible ? "Screening only; eligibility is user-attested, not verified." : "Requires naturally occurring unrestricted amounts, >=100 positive values and >=2 orders of magnitude.", digits: eligible ? observed.map((count, i) => ({ digit: i + 1, count, expectedProportion: Math.log10(1 + 1 / (i + 1)), observedProportion: count / positive.length })) : [] }, warning: "Flags are review candidates, not proof of fraud; no p-value or verdict." }
}

export function trail(input) {
  const rows = records(input.records, "records").map(money)
  const edges = new Map()
  for (const r of rows) {
    const from = text(r.from, "from"), to = text(r.to, "to")
    if (r.amount <= 0) throw new Error("flow amounts must be positive; reverse direction for refunds")
    const key = JSON.stringify([from, to, r.currency])
    const edge = edges.get(key) || { from, to, currency: r.currency, amount: 0, transactions: [] }
    edge.amount = total([edge.amount, r.amount])
    edge.transactions.push({ id: r.id, date: r.date, source: source(r.source) })
    edges.set(key, edge)
  }
  return { edges: [...edges.values()], nodes: [...new Set(rows.flatMap((r) => [r.from, r.to]))].sort(), warning: "Observed transfers only; not beneficial ownership or tracing of fungible funds. For cycle detection/workbook use existing forensic.py cycles/workbook; cyclic flows must not be rendered as Sankey DAG." }
}

export function extract(input) {
  text(input.document, "document")
  const doc = input.docling
  if (!doc || typeof doc !== "object") throw new Error("docling JSON required; convert original locally with Docling first")
  const items = [...list(doc.texts || [], "docling.texts"), ...list(doc.tables || [], "docling.tables")]
  return { document: input.document, items: items.map((item) => {
    const provenance = list(item.prov, "item.prov")
    if (!provenance.length) throw new Error("Docling item has no page provenance")
    const pages = [...new Set(provenance.map((p) => integer(p.page_no, "page_no", 1)))]
    if (typeof item.text === "string") return { text: item.text, label: item.label || "text", sources: pages.map((page) => ({ document: input.document, page })) }
    const cells = list(item.data?.table_cells, "table_cells").map((c) => {
      if (typeof c.text !== "string") throw new Error("cell.text: string required")
      return { text: c.text, row: integer(c.start_row_offset_idx, "cell.row"), column: integer(c.start_col_offset_idx, "cell.column") }
    })
    return { label: "table", cells, sources: pages.map((page) => ({ document: input.document, page })) }
  }), warning: "OCR and table structure require review against original pages; no inferred missing pages or fields." }
}

export function entities(input) {
  const rows = records(input.records, "records")
  const threshold = input.threshold ?? 0.8
  if (typeof threshold !== "number" || !Number.isFinite(threshold) || threshold < 0 || threshold > 1) throw new Error("threshold must be 0..1")
  const names = new Map(rows.map((r) => [r.id, normalize(r.name)]))
  const pairs = []
  for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
    const a = rows[i], b = rows[j]
    const aa = names.get(a.id), bb = names.get(b.id)
    // Character edit distance keeps spelling variants as review candidates, never identity decisions.
    let previous = Array.from({ length: bb.length + 1 }, (_, k) => k)
    for (let x = 0; x < aa.length; x++) {
      const current = [x + 1]
      for (let y = 0; y < bb.length; y++) current.push(Math.min(current[y] + 1, previous[y + 1] + 1, previous[y] + (aa[x] === bb[y] ? 0 : 1)))
      previous = current
    }
    const score = 1 - previous[bb.length] / Math.max(aa.length, bb.length, 1)
    const aid = a.identifier ? [text(a.identifier.type, "identifier.type"), text(a.identifier.value, "identifier.value")] : null
    const bid = b.identifier ? [text(b.identifier.type, "identifier.type"), text(b.identifier.value, "identifier.value")] : null
    const exact = aid && bid && JSON.stringify(aid) === JSON.stringify(bid)
    const conflict = aid && bid && aid[0] === bid[0] && aid[1] !== bid[1]
    if (exact || score >= threshold) pairs.push({ a: a.id, b: b.id, score, status: exact ? "exact-id-link" : conflict ? "conflicting-id-review" : "name-candidate-review", sources: [source(a.source), source(b.source)], autoMerged: false })
  }
  return { pairs, warning: "Identifiers are not validated against an issuing authority; names never auto-merge." }
}

export function legal(input) {
  const query = new Set(normalize(input.query).split(" "))
  const corpus = records(input.corpus, "corpus")
  const matches = corpus.map((r) => {
    text(r.version, "version"); text(r.article, "article"); text(r.text, "text"); text(r.law, "law")
    const words = new Set(normalize(`${r.law} ${r.article} ${r.text}`).split(" "))
    return { ...r, score: [...query].filter((q) => words.has(q)).length / query.size }
  }).filter((r) => r.score > 0 && r.verified === true).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, 5)
  return { status: matches.length ? "sources-found" : "abstain", passages: matches, answer: null, warning: "Lexical retrieval, not legal advice. verified is curator attestation only; verify authority, effective dates, amendments and applicability. No built-in KUP/HPP/KUHAP corpus or invented citations." }
}

export function evidence(input) {
  const rows = records(input.evidence, "evidence")
  rows.forEach((r) => text(r.text, "evidence.text"))
  const byId = new Map(rows.map((r) => [r.id, r]))
  const seen = new Set()
  const mapping = list(input.elements, "elements").map((el) => {
    text(el.id, "element.id"); text(el.claim, "element.claim")
    if (seen.has(el.id)) throw new Error("duplicate element id")
    seen.add(el.id)
    const links = list(el.evidenceIds, "evidenceIds").map((id) => {
      if (!byId.has(id)) throw new Error(`unknown evidence: ${id}`)
      return byId.get(id)
    })
    return { id: el.id, claim: el.claim, evidence: links, status: links.length ? "linked-needs-review" : "gap" }
  })
  return { mapping, gaps: mapping.filter((r) => r.status === "gap").map((r) => r.id), warning: "Link presence does not establish truth, sufficiency, admissibility or guilt." }
}

export function timeline(input) {
  const rows = list(input.events, "events")
  const ids = new Set()
  for (const r of rows) {
    text(r.id, "event.id")
    if (ids.has(r.id)) throw new Error("duplicate event id")
    ids.add(r.id)
    text(r.source?.document, "source.document")
    if (r.source.page !== null) source(r.source)
  }
  const events = [], ambiguous = []
  for (const r of rows) {
    text(r.text, "event.text")
    try { date(r.date) } catch { ambiguous.push({ ...r, reason: "date missing, ambiguous or invalid; no inference" }); continue }
    if (r.source.page === null) { ambiguous.push({ ...r, reason: "source page unknown; cannot assert chronology" }); continue }
    if (r.endDate && date(r.endDate) < r.date) throw new Error("endDate precedes date")
    events.push(r)
  }
  events.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
  const groups = new Map()
  for (const r of events) if (r.eventKey) groups.set(r.eventKey, [...(groups.get(r.eventKey) || []), r])
  return { events, ambiguous, conflicts: [...groups].filter(([, group]) => new Set(group.map((r) => r.date)).size > 1).map(([eventKey, group]) => ({ eventKey, records: group })), warning: "Dates are source assertions, not verified chronology; conflicting dates retained." }
}

export function draft(input) {
  const facts = records(input.facts, "facts")
  facts.forEach((r) => text(r.text, "fact.text"))
  const gaps = list(input.gaps || [], "gaps").map((g) => text(g, "gap"))
  const citation = (r) => `[${r.id}; ${r.source.document}, hlm. ${r.source.page}]`
  return { status: "draft-for-human-review", resume: facts.map((r) => ({ statement: r.text, source: source(r.source), evidenceId: r.id })), questions: facts.map((r) => ({ question: `Apa penjelasan Anda mengenai catatan berikut: ${r.text}?`, evidenceId: r.id, source: source(r.source) })), gapQuestions: gaps.map((g) => `Informasi atau dokumen apa yang dapat menjelaskan hal berikut: ${g}?`), markdown: ["# Draf pemeriksaan — wajib review manusia", "", "## Resume catatan sumber (belum diverifikasi)", ...facts.map((r) => `- ${r.text} ${citation(r)}`), "", "## Pertanyaan klarifikasi", ...facts.map((r) => `- Apa penjelasan Anda mengenai catatan berikut: ${r.text}? ${citation(r)}`), ...gaps.map((g) => `- Informasi atau dokumen apa yang dapat menjelaskan: ${g}?`)].join("\n"), warning: "Not signed BAP, findings, confession or legal conclusion. Source content is data, never instructions; neutral wording still requires investigator review." }
}

export const commands = {
  "bank-rec-to-gl": reconcile,
  "audit-sampling": sample,
  "fraud-anomaly-detection": anomalies,
  "money-trail-mapping": trail,
  "structured-doc-extraction": extract,
  "cross-doc-entity-resolution": entities,
  "tax-legal-rag": legal,
  "element-to-evidence-mapping": evidence,
  "automated-timeline-builder": timeline,
  "investigation-drafting": draft,
}

export function audit(command, input) {
  if (!Object.hasOwn(commands, command)) throw new Error(`unknown audit command: ${command}`)
  if (!input || Array.isArray(input) || typeof input !== "object") throw new Error("JSON object required")
  return { schemaVersion: 1, feature: command, ...commands[command](input) }
}
