import { readFile } from "node:fs/promises"
import path from "node:path"

// The remote LLM route for the memory server.
//
// Hyper AI ships no credential of its own: the router the user already
// configured for OpenCode (the "cx" provider by default) is reused, so the
// memory server talks to the same MiniMax model the agent uses. Without a
// router the caller falls back to the offline (local) route.

export type RouterTarget = { providerID: string; baseURL: string; apiKey: string }

const DEFAULT_PROVIDER = "cx"

type ProviderEntry = { name?: string; settings?: { baseURL?: string; apiKey?: string } }

const providerID = () => {
  const fromEnv = process.env.HYPER_ROUTER_PROVIDER?.trim()
  return fromEnv && fromEnv.length ? fromEnv : DEFAULT_PROVIDER
}

const readProviders = async (configDir: string): Promise<Record<string, ProviderEntry>> => {
  const file = path.join(configDir, "opencode.json")
  const text = await readFile(file, "utf8").catch(() => undefined)
  if (!text) return {}
  try {
    const parsed = JSON.parse(text) as { providers?: Record<string, ProviderEntry> }
    const providers = parsed.providers
    if (!providers || typeof providers !== "object") return {}
    return providers
  } catch {
    // A JSONC config (comments) is not strict JSON; the user still configured a
    // router, but this parser cannot read it. The caller falls back to offline.
    return {}
  }
}

const usable = (entry: ProviderEntry | undefined) => {
  const baseURL = entry?.settings?.baseURL
  const apiKey = entry?.settings?.apiKey
  if (!baseURL || !apiKey) return undefined
  return { baseURL, apiKey }
}

/**
 * Resolves the router endpoint from the user's OpenCode config: the pinned
 * provider id first, then any provider that looks like a router, so a renamed
 * or replaced router still resolves.
 */
export async function resolveRouter(configDir: string): Promise<RouterTarget | undefined> {
  const providers = await readProviders(configDir)
  const pinned = usable(providers[providerID()])
  if (pinned) return { providerID: providerID(), ...pinned }
  const fallback = Object.entries(providers).find(
    ([id, entry]) => id !== providerID() && /router/i.test(entry.name ?? "") && usable(entry),
  )
  if (!fallback) return undefined
  const [id, entry] = fallback
  const target = usable(entry)
  if (!target) return undefined
  return { providerID: id, ...target }
}
