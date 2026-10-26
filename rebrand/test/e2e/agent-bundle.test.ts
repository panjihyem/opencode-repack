import { expect, test } from "bun:test"
import { readFile } from "node:fs/promises"

test("unreleased agent helpers are absent from desktop entrypoint and overlay", async () => {
  const apply = await readFile(new URL("../../apply.ts", import.meta.url), "utf8")
  const bundle = await readFile(new URL("../../files/desktop/hyper/bundle.ts", import.meta.url), "utf8")
  const installed = apply.match(/\.\.\.\["bundle",[^\n]+\.map\(/)?.[0]
  expect(installed).toBeDefined()
  expect(installed).not.toMatch(/agent-(?:policy|gate|guard|orchestrator|fallback)/)
  expect(bundle).not.toMatch(/agent-(?:policy|gate|guard|orchestrator|fallback)/)
})
