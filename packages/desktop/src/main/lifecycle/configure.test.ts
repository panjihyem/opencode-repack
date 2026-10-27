import { expect, test } from "bun:test"
import { readFile } from "node:fs/promises"

test("packaged test root sets appData before using userData", async () => {
  const source = await readFile(new URL("./configure.ts", import.meta.url), "utf8")
  expect(source).toContain('if (testRoot) app.setPath("appData", path.join(testRoot, "appData"))')
  const appData = source.indexOf('app.setPath("appData"')
  const userData = source.indexOf('app.setPath("userData"')
  expect(appData).toBeGreaterThan(0)
  expect(userData).toBeGreaterThan(appData)
  expect(source).toContain('process.env.OPENCODE_DESKTOP_TEST_ROOT')
})
