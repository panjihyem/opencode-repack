import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { manifest } from "./manifest"

// Persistent memory across sessions, powered by the local Hindsight server:
//  - every user prompt is retained into the `sessions` bank automatically
//    (fact extraction runs asynchronously under the local tiered model),
//  - relevant memories are recalled and injected into the system prompt at
//    every turn, so a new session already knows past work,
//  - long sessions keep a transcript tail in memory before compaction.

const MANAGED = "HYPER_AI_MANAGED"

/** Writes the managed agent plugin; a user-authored file is never replaced. */
export async function applySessionMemoryPlugin(configDir: string, enabled = true) {
  const dir = path.join(configDir, "plugin")
  const file = path.join(dir, "hyper-memory.ts")
  const existing = await readFile(file, "utf8").catch(() => undefined)
  if (existing && !existing.includes(MANAGED)) return "kept" as const
  if (!enabled) {
    // Case mode: the plugin keeps its slot but does nothing. Automatic retain
    // and recall are exactly the paths that would push case text off the
    // machine, so they are removed rather than filtered.
    await mkdir(dir, { recursive: true })
    await writeFile(
      file,
      `// ${MANAGED} - disabled while case mode is on (hyper-case mode on).
// No prompt is retained, no recall is injected, no transcript is uploaded.
export default { id: "hyper-memory", setup: async () => {} }
`,
    )
    return "disabled" as const
  }
  const port = manifest.hindsight.port
  const body = `// ${MANAGED} — persistent local memory for every session.
export default {
  id: "hyper-memory",
  setup: async (ctx) => {
    const API = "http://127.0.0.1:${port}/v1/default"
    const json = (route, init) =>
      fetch(API + route, init).then((r) => (r.ok ? r.json().catch(() => ({})) : {}))
    const put = async (route, body2) =>
      json(route, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body2) })
    const post = async (route, body2) =>
      json(route, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body2) })

    let bankReady = false
    const ensureBank = () => {
      if (bankReady) return
      bankReady = true
      put("/banks/sessions", {
        name: "sessions",
        mission: "Ingatan sesi kerja: permintaan pengguna, keputusan, dan temuan yang dibutuhkan lintas sesi.",
      }).catch(() => undefined)
    }

    const { basename } = await import("node:path")
    const project = () => {
      try {
        const dir2 = ctx.location && (ctx.location.project?.canonical || ctx.location.directory)
        return dir2 ? basename(dir2) : ""
      } catch {
        return ""
      }
    }

    const textOf = (value, depth = 0) => {
      if (typeof value === "string") return value
      if (!value || typeof value !== "object" || depth > 4) return ""
      if (typeof value.text === "string") return value.text
      if (Array.isArray(value)) return value.map((item) => textOf(item, depth + 1)).filter(Boolean).join(" ")
      const parts = value.parts || value.content
      return Array.isArray(parts) ? textOf(parts, depth + 1) : ""
    }

    const messagesText = (messages) =>
      (Array.isArray(messages) ? messages : [])
        .filter((message) => message && (message.role === "user" || message.role === "assistant"))
        .slice(-10)
        .map((message) => (message.role === "user" ? "User: " : "Asisten: ") + String(textOf(message.content ?? message.parts ?? message, 0)).slice(0, 400))
        .filter((line) => line.length > 6)
        .join("\\n")

    const latestUser = (messages) => {
      const users = (Array.isArray(messages) ? messages : []).filter((message) => message && message.role === "user")
      if (!users.length) return ""
      return String(textOf(users[users.length - 1].content ?? users[users.length - 1].parts, 0)).slice(0, 4000).trim()
    }

    const inject = (event, text) => {
      try {
        const part = { type: "text", text }
        if (event.system.length === 0) event.system.push(part)
        else event.system.splice(1, 0, part)
      } catch {}
    }

    const recall = async (query) => {
      let general, sessions
      try {
        ;[general, sessions] = await Promise.all([
          post("/banks/general/memories/recall", { query, max_tokens: 900 }),
          post("/banks/sessions/memories/recall", { query, max_tokens: 900 }),
        ])
      } catch {
        return ""
      }
      const facts = [...(general.results || []), ...(sessions.results || [])]
        .map((result) => (result.text || "").slice(0, 280))
        .filter(Boolean)
        .slice(0, 8)
      if (!facts.length) return ""
      return [
        "# Konteks memori Hyper AI (recall otomatis dari bank sessions+general)",
        ...facts.map((fact) => "- " + fact),
      ].join("\\n")
    }

    const retained = new Set()
    const recalled = new Map()

    ctx.session.hook("context", async (event) => {
      // Never fail the request: wrap every step defensively.
      try {
        ensureBank()
        const prompt = latestUser(event.messages)
        if (!prompt || prompt.length < 8) return
        const key = event.sessionID + ":" + prompt.slice(0, 200)
        if (recalled.has(key)) {
          inject(event, recalled.get(key))
          return
        }
        if (recalled.size > 200) {
          recalled.clear()
          retained.clear()
        }
        const body = await recall(prompt.slice(0, 700))
        if (body) {
          recalled.set(key, body)
          inject(event, body)
        }
        // Retain the user's ask once (deduplicated in this process; Hindsight
        // also merges near-duplicates server side).
        if (!retained.has(key)) {
          retained.add(key)
          void post("/banks/sessions/memories", {
            items: [{ content: prompt, context: "permintaan", tags: ["session:" + event.sessionID, "project:" + project(), "role:user"] }],
            async: true,
          }).catch(() => undefined)
        }
      } catch {}
    })

    // Long sessions: keep the transcript tail in the sessions bank as the
    // conversation is compacted, so nothing is lost to summarisation.
    ctx.session.hook("compaction", async (event) => {
      try {
        const tail = messagesText(event.messages)
        if (!tail || tail.length < 40) return
        await post("/banks/sessions/memories", {
          items: [{ content: "Transkrip sebelum kompakasi:\\n" + tail, context: "transkrip", tags: ["session:" + event.sessionID, "project:" + project(), "scope:tail"] }],
          async: true,
        })
      } catch {}
    })
  },
}
`
  await mkdir(dir, { recursive: true })
  await writeFile(file, body)
  return "written" as const
}
