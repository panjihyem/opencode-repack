// HYPER_AI_MANAGED — the `hyper` command-line companion.
// Works with or without the desktop app: `sync` re-scans ~/Hyper-Knowledge and
// ingests into the local memory server (same contract as the app-start sync).
// Offered via resources/hyper-bundle/bin and linked into ~/.local/bin.
import { performance } from "node:perf_hooks"
import { fileURLToPath } from "node:url"
import path from "node:path"

const binDir = path.dirname(fileURLToPath(import.meta.url))
const bundled = path.join(binDir, "knowledge.mjs")

const usage = () =>
  [
    "hyper — Hyper AI command-line companion",
    "",
    "Perintah:",
    "  sync                Pindai ~/Hyper-Knowledge, ingest berkas baru/berubah ke memori",
    "  recall <kueri>      Cari fakta di seluruh bank (opsional: --bank <nama> --limit <n>)",
    "  banks               Daftar bank memori",
    "",
    "Server memori berjalan bersama aplikasi Hyper AI (tanpa aplikasi, gitu tanpa",
    "  `hyper sync` akan melaporkan koneksi gagal — buka aplikasinya dulu).",
  ].join("\n")

const parseFlags = (args) => {
  const flags = {}
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--bank") flags.bank = args[++i]
    else if (args[i] === "--limit") flags.limit = Number(args[++i]) || 10
  }
  return flags
}

const json = async (url, init) => {
  const response = await fetch(url, init)
  if (!response.ok) throw new Error(response.status === 404 ? "server tidak merespons (aplikasi Hyper AI sedang tidak berjalan?)" : `HTTP ${response.status}`)
  return response.json()
}

async function main() {
  const [command, ...rest] = process.argv.slice(2)
  if (!command || command === "--help" || command === "-h" || command === "help") return console.log(usage())

  const knowledge = await import(bundled).catch((error) => {
    console.error("modul knowledge gagal dimuat:", error.message)
    process.exit(1)
  })
  const api = knowledge.hindsightApiRoot()

  if (command === "sync") {
    const start = performance.now()
    const result = await knowledge.syncKnowledge((message) => console.log(" ", message))
    const secs = ((performance.now() - start) / 1000).toFixed(1)
    console.log("")
    console.log(`${result.ingested.length} ter-ingest, ${result.skipped} dilewati, ${result.failed.length} gagal — ${secs}s`)
    console.log("bank:", result.banks.join(", "))
    if (result.failed.length) {
      console.log("gagal:")
      for (const file of result.failed) console.log("  -", file)
    }
    return
  }

  if (command === "banks") {
    const data = await json(api + "/banks")
    for (const bank of data.banks || []) console.log(bank.bank_id)
    return
  }

  if (command === "recall") {
    const query = rest.filter((arg, index) => !(rest[index - 1] === "--bank" || rest[index - 1] === "--limit")).join(" ")
    const flags = parseFlags(rest)
    if (!query.trim()) return console.log("kueri kosong — contoh: hyper recall \"PMK pemeriksaan pajak\"")
    const banks = flags.bank ? [flags.bank] : (await json(api + "/banks")).banks.map((bank) => bank.bank_id)
    let found = 0
    for (const bank of banks) {
      const data = await json(api + `/banks/${encodeURIComponent(bank)}/memories/recall`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, max_tokens: (flags.limit || 10) * 250 }),
      })
      for (const result of data.results || []) {
        found++
        console.log(`[${bank}] `, (result.text || "").replace(/\n/g, " ").slice(0, 300))
        console.log("   tag:", (result.tags || []).join(" ") || "(—)")
        if (found >= (flags.limit || 10)) return
      }
    }
    if (!found) console.log("tidak ada fakta yang cocok")
    return
  }

  console.log(`perintah tidak dikenal: ${command}`)
  console.log(usage())
  process.exitCode = 2
}

await main()
