// HYPER_AI_MANAGED — local web search, no API key, no remote configuration.
// Minimal MCP (Model Context Protocol) server over stdio: speaks JSON-RPC 2.0
// and exposes a `search` tool. Sources, tried in order:
//   1. DuckDuckGo HTML endpoints (clean markup; blocked on a few networks),
//   2. Bing region-aware results (with redirect links decoded back to URLs),
//   3. Wikipedia (always available reference fallback).
// Runs through the app's own Electron binary as Node. Plain JavaScript: one
// bundle serves every platform.

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36"

// ␣ Strip tags/entities from engine markup.
const decode = (text) =>
  String(text)
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .trim()

// DDG and Bing both wrap result hrefs in redirect URLs; unwrap them.
const unwrap = (href) => {
  const ddg = String(href).match(/uddg=([^&"']+)/)
  if (ddg) return decodeURIComponent(ddg[1])
  const bing = String(href).match(/u=a1([A-Za-z0-9_-]+)/)
  if (bing) {
    const padded = bing[1] + "=".repeat((4 - (bing[1].length % 4)) % 4)
    try {
      return Buffer.from(padded, "base64url").toString("utf8")
    } catch {
      return href
    }
  }
  const url = String(href)
  return url.startsWith("//") ? "https:" + url : url
}

const ok = (url) => /^https?:\/\//.test(url)

async function get(url, headers = {}) {
  const response = await fetch(url, {
    headers: { "User-Agent": UA, "Accept-Language": "id-ID,id;q=0.9,en;q=0.8", ...headers },
    signal: AbortSignal.timeout(15000),
  })
  if (!response.ok) throw new Error("HTTP " + response.status)
  return response.text()
}

// ── DuckDuckGo (html + lite endpoints) ─────────────────────────────────────
function parseDdg(html) {
  const results = []
  const blocks = html.split('class="result__body"')
  for (const block of blocks.slice(1)) {
    const anchor = block.match(/class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/) || block.match(/href="([^"]+)"[^>]*class="result__a"[^>]*>([\s\S]*?)<\/a>/)
    if (!anchor) continue
    const snippet = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/)
    results.push({ title: decode(anchor[2]).slice(0, 240), url: unwrap(anchor[1]).slice(0, 500), content: snippet ? decode(snippet[1]).slice(0, 600) : "" })
  }
  if (results.length) return results
  // lite.duckduckgo.com: table rows of result links; snippet rows follow.
  for (const row of html.split("<tr>")) {
    const anchor = row.match(/<a[^>]+class="result-link"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/)
    if (anchor) results.push({ title: decode(anchor[2]).slice(0, 240), url: unwrap(anchor[1]).slice(0, 500), content: "" })
  }
  return results.filter((result) => result.title && ok(result.url))
}

// ── Bing (region-aware; redirect links carry base64url targets) ────────────
function parseBing(html) {
  const results = []
  const blocks = html.split('class="b_algo"')
  for (const block of blocks.slice(1)) {
    const anchor = block.match(/<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>([\s\S]{0,300}?)<\/a>/)
    if (!anchor) continue
    const title = decode(anchor[2]).slice(0, 240)
    const url = unwrap(anchor[1])
    if (!title || !ok(url)) continue
    const snippet = block.match(/<p[^>]*>([\s\S]{1,500}?)<\/p>/)
    results.push({ title, url: url.slice(0, 500), content: snippet ? decode(snippet[1]).slice(0, 600) : "" })
  }
  return results
}

// ── Wikipedia (id first, then en) ──────────────────────────────────────────
async function wikipedia(query, limit) {
  for (const lang of ["id", "en"]) {
    try {
      const html = await get(
        `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&format=json&origin=*&srlimit=${limit}&srsearch=${encodeURIComponent(query)}`,
        { Accept: "application/json" },
      )
      const data = JSON.parse(html)
      const hits = (data.query && data.query.search) || []
      if (!hits.length) continue
      return hits.map((hit) => ({
        title: hit.title.slice(0, 240),
        url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(String(hit.title).replace(/ /g, "_"))}`,
        content: decode(hit.snippet || "").slice(0, 600),
      }))
    } catch {
      // Next language.
    }
  }
  return []
}

const SOURCES = [
  ["duckduckgo", (query, limit) => get("https://html.duckduckgo.com/html/?q=" + encodeURIComponent(query)).then(parseDdg)],
  ["duckduckgo-lite", (query, limit) => get("https://lite.duckduckgo.com/lite/?q=" + encodeURIComponent(query)).then(parseDdg)],
  ["bing", (query, limit) => get("https://www.bing.com/search?q=" + encodeURIComponent(query) + "&cc=id&count=" + limit).then(parseBing)],
  ["wikipedia", wikipedia],
]

async function search({ query, limit = 8 }) {
  const queryText = String(query || "").trim()
  if (!queryText) throw new Error("query kosong")
  const max = Math.min(Math.max(Number(limit) || 8, 1), 20)
  // Anti-bot walls serve canned results that share nothing with the query;
  // require each hit to echo at least one query word (≥ 4 chars or a number).
  const tokens = queryText.toLowerCase().match(/[a-z0-9]{4,}/g) || []
  const plausible = (result) => {
    if (!tokens.length) return true
    const hay = (result.title + " " + (result.content || "") + " " + result.url).toLowerCase()
    return tokens.some((token) => hay.includes(token))
  }
  const attempts = []
  for (const [name, source] of SOURCES) {
    try {
      let results = await source(queryText, max)
      // An anti-bot wall often still returns links — but canned ones, which
      // repeat the same domain. Reject those blocks and try the next source.
      const domains = new Set(results.map((result) => String(result.url).split("/")[2]?.split(".").slice(-2).join(".")))
      if (results.length >= 3 && domains.size <= 1) {
        attempts.push(name + ": blok anti-bot (hanya 1 domain)")
        continue
      }
      const filtered = results.filter(plausible)
      if (!filtered.length && results.length) {
        attempts.push(name + ": blok anti-bot (tanpa irisan query)")
        continue
      }
      const unique = [...new Map(filtered.map((result) => [result.url, result])).values()].slice(0, max)
      if (unique.length) return { query: queryText, provider: name, results: unique }
      attempts.push(name + ": 0 hasil")
    } catch (error) {
      attempts.push(name + ": " + (error instanceof Error ? error.message : String(error)))
    }
  }
  throw new Error("semua sumber gagal (" + attempts.join("; ") + ")")
}

const TOOL = {
  name: "search",
  description:
    "Pencarian web lokal tanpa API key (DuckDuckGo/Bing/Wikipedia). Gunakan untuk fakta terkini, regulasi baru, atau halaman yang perlu konfirmasi. Kembalikan judul, URL, dan ringkasan.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Kata kunci pencarian (boleh bahasa Indonesia atau Inggris)" },
      limit: { type: "integer", description: "Jumlah hasil (1-20, default 8)" },
    },
    required: ["query"],
  },
}

const dispatch = (tool, args) => {
  if (tool !== "search") throw new Error("tool tidak dikenal: " + tool)
  return search(args || {})
}

// ── JSON-RPC 2.0 stdio loop ────────────────────────────────────────────────
let buffer = ""
const write = (payload) => process.stdout.write(JSON.stringify(payload) + "\n")
const reply = (id, value) => write({ jsonrpc: "2.0", result: value ?? {}, id })

process.stdin.setEncoding("utf8")
let inFlight = 0
const settle = () => {
  if (Math.max(inFlight - 1, 0) === 0) exitCheck()
}
const exitCheck = () => {
  if (stdinClosed && inFlight <= 0) process.exit(0)
}
let stdinClosed = false
process.stdin.on("data", (chunk) => {
  buffer += chunk
  for (const line of buffer.split("\n")) {
    if (line.trim().startsWith("{")) void run(line.trim())
  }
  const last = buffer.lastIndexOf("\n")
  buffer = last === -1 ? buffer : buffer.slice(last + 1)
})
process.stdin.on("end", () => {
  stdinClosed = true
  exitCheck()
})

async function run(line) {
  inFlight++
  try {
    await handle(line)
  } finally {
    inFlight--
    exitCheck()
  }
}

async function handle(line) {
  let request
  try {
    request = JSON.parse(line)
  } catch {
    return
  }
  const { id, method, params } = request
  try {
    if (method === "initialize") {
      reply(id, {
        protocolVersion: params?.protocolVersion || "2025-03-26",
        serverInfo: { name: "hyper-search", version: "1.0.0" },
        capabilities: { tools: {} },
      })
    } else if (String(method).startsWith("notifications/")) {
      // Notifications need no response.
    } else if (method === "tools/list") {
      reply(id, { tools: [TOOL] })
    } else if (method === "prompts/list") {
      reply(id, { prompts: [] })
    } else if (method === "resources/list") {
      reply(id, { resources: [] })
    } else if (method === "ping") {
      reply(id, {})
    } else if (method === "tools/call") {
      const result = await dispatch(params?.name, params?.arguments)
      reply(id, { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] })
    } else if (id !== undefined) {
      write({ jsonrpc: "2.0", error: { code: -32601, message: "method tidak ada: " + method }, id })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (id !== undefined) {
      if (method === "tools/call") reply(id, { content: [{ type: "text", text: "Gagal: " + message }], isError: true })
      else write({ jsonrpc: "2.0", error: { code: -32603, message }, id })
    }
  }
}
