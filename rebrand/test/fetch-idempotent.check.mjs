import { strict as assert } from "node:assert"
import { mkdtemp, readFile, stat, rm, writeFile, utimes } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { spawnSync } from "node:child_process"

const home = await mkdtemp(join(tmpdir(), "hyper-fetch-check-"))
const file = join(home, "Hyper-Knowledge", "general", "regulasi", `jdih-kemenkeu-${new Date().toISOString().slice(0, 10)}.md`)
const cli = new URL("../files/desktop/cli/hyper.mjs", import.meta.url)
const run = () => spawnSync(process.execPath, ["-e", `
  process.env.USERPROFILE = ${JSON.stringify(home)}
  process.env.HOME = ${JSON.stringify(home)}
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ items: [{ title: "PMK Uji", url: "https://jdih.kemenkeu.go.id/dokumen", date_modified: "2026-11-01" }] }) })
  process.argv = ["bun", "hyper.mjs", "fetch", "--source", "kemenkeu"]
  await import(${JSON.stringify(cli.href)})
`], { encoding: "utf8" })

try {
  const firstRun = run()
  assert.equal(firstRun.status, 0, firstRun.stderr || firstRun.stdout)
  const first = await readFile(file, "utf8")
  const old = new Date("2020-01-01T00:00:00Z")
  await utimes(file, old, old)
  assert.equal(run().status, 0)
  assert.equal(await readFile(file, "utf8"), first)
  assert.equal((await stat(file)).mtime.getTime(), old.getTime())
  await writeFile(file, "dokumen milik user")
  assert.equal(run().status, 1)
  assert.equal(await readFile(file, "utf8"), "dokumen milik user")
  console.log("fetch idempotent dan file user aman: PASS")
} finally {
  await rm(home, { recursive: true, force: true })
}
