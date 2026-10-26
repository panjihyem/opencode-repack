import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import commandSource from "./agent-command.ts?raw"

// Managed runtime module has no imports; copied into OpenCode's auto-discovered plugin directory.
export async function applyPublicAgentPlugin(configDir: string, enabled = true) {
  const file = path.join(configDir, "plugin", "hyper-public-agents.ts")
  const existing = await readFile(file, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return undefined
    throw error
  })
  if (existing && !existing.startsWith("// HYPER_AI_MANAGED")) return "kept" as const
  const source = enabled
    ? commandSource
    : '// HYPER_AI_MANAGED — disabled for case mode\nexport default { id: "hyper-public-agents", setup: async () => {} }\n'
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, source)
  return enabled ? "installed" as const : "disabled" as const
}
