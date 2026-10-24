import { expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
const source = (file: string) => readFile(new URL(`../../../${file}`, import.meta.url), "utf8")

test("baseline retains explicit queue and steer and avoids claiming case mode blocks cloud", async () => {
  const inbox = await source("packages/core/src/session/inbox.ts")
  const session = await source("packages/core/src/session/session.ts")
  const caseMode = await source("rebrand/files/desktop/hyper/case/casemode.py")
  const baseline = await source("docs/multi-agent/baseline.md")
  expect(inbox).toContain('export type Promotable = "input" | "steer"')
  expect(session).toContain('delivery: input.delivery ?? "steer"')
  expect(caseMode).toContain("model agent itu sendiri")
  expect(baseline).toContain("Fail-closed")
  expect(baseline).toContain("MiniMax atau MiMo")
  expect(baseline).toContain("Persetujuan eksplisit")
})
