import { expect, test } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { applyPublicAgentPlugin } from "../../files/desktop/hyper/agent-install"

test("managed plugin installs as standalone source and case mode disables it", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "hyper-agent-bundle-"))
  try {
    expect(await applyPublicAgentPlugin(dir)).toBe("installed")
    const file = path.join(dir, "plugin", "hyper-public-agents.ts")
    const source = await readFile(file, "utf8")
    expect(source).toContain('name: "hyper-public-agents"')
    expect(source).not.toContain('from "./')
    expect(source).not.toContain('from "@opencode/plugin"')
    const installed = await import(`${file}?isolated=1`)
    let registered = false
    await installed.default.setup({ command: { transform: async (callback: (editor: { add: (definition: { name: string }) => void }) => void) => callback({ add: (definition) => { registered = definition.name === "hyper-public-agents" } }) } })
    expect(registered).toBe(true)
    expect(await applyPublicAgentPlugin(dir, false)).toBe("disabled")
    expect(await readFile(file, "utf8")).not.toContain("ctx.generate.text")
    await writeFile(file, "// user plugin\n")
    expect(await applyPublicAgentPlugin(dir)).toBe("kept")
    expect(await readFile(file, "utf8")).toBe("// user plugin\n")
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test("installer lists guarded plugin and desktop installs it after privacy check", async () => {
  const apply = await readFile(new URL("../../apply.ts", import.meta.url), "utf8")
  const bundle = await readFile(new URL("../../files/desktop/hyper/bundle.ts", import.meta.url), "utf8")
  expect(apply).toContain('"agent-install", "bundle"')
  expect(bundle).toContain("applyPublicAgentPlugin(configDir(), !privacy)")
})
