import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

type Server = Record<string, unknown>

/** Marks entries this module owns, so a later run may refresh their paths without touching the user's own servers. */
export const MANAGED = "HYPER_AI_MANAGED"

/**
 * Adds MCP servers to `<configDir>/opencode.json`. The user's own servers are
 * never replaced; entries previously written here are refreshed so a moved
 * install keeps working. A file that is not strict JSON (for example JSONC
 * with comments) is left alone and reported as "skipped".
 */
export async function applyServers(configDir: string, servers: Record<string, Server>) {
  const file = path.join(configDir, "opencode.json")
  const text = await readFile(file, "utf8").catch(() => undefined)
  const existing = text === undefined ? {} : parse(text)
  if (!existing) return "skipped" as const

  const mcp = record(existing.mcp)
  const current = record(mcp.servers)
  const next = Object.fromEntries(
    Object.entries(servers).flatMap(([name, server]) => {
      const present = current[name]
      return present === undefined || isManaged(present) ? [[name, server]] : []
    }),
  )
  if (Object.keys(next).every((name) => JSON.stringify(current[name]) === JSON.stringify(next[name])))
    return "unchanged" as const

  await mkdir(configDir, { recursive: true })
  await writeFile(
    file,
    JSON.stringify({ ...existing, mcp: { ...mcp, servers: { ...current, ...next } } }, null, 2) + "\n",
  )
  return "updated" as const
}

export function managed(server: Server) {
  const environment = { ...record(server.environment), [MANAGED]: "1" }
  return server.type === "local"
    ? { ...server, environment }
    : { ...server, headers: { ...record(server.headers), [MANAGED]: "1" } }
}

/**
 * "Unattended" mode switch: grants the agent standing permission so it never
 * stops to ask for approval — the default for non-technical users. Turning it
 * off removes the standing grant this module wrote earlier; the user's own
 * permission rules are never touched either way.
 */
export async function applyUnattended(configDir: string, enabled: boolean) {
  const file = path.join(configDir, "opencode.json")
  const text = await readFile(file, "utf8").catch(() => undefined)
  const existing = text === undefined ? {} : parse(text)
  if (!existing) return "skipped" as const

  const permission: Record<string, unknown> = record(existing.permission)
  if (enabled) {
    if (permission["*"] !== undefined) return "unchanged" as const
    await mkdir(configDir, { recursive: true })
    await writeFile(file, JSON.stringify({ ...existing, permission: { ...permission, "*": "allow" } }, null, 2) + "\n")
    return "updated" as const
  }
  if (permission["*"] !== "allow") return "unchanged" as const
  delete permission["*"]
  await mkdir(configDir, { recursive: true })
  await writeFile(file, JSON.stringify({ ...existing, permission }, null, 2) + "\n")
  return "updated" as const
}

function isManaged(server: unknown) {
  const value = record(server)
  return MANAGED in record(value.environment) || MANAGED in record(value.headers)
}

function parse(text: string) {
  try {
    const value: unknown = JSON.parse(text)
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined
  } catch {
    return undefined
  }
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}
