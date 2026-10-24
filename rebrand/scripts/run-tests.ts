// Menjalankan seluruh uji overlay: unit (bun test) + e2e yang tidak butuh
// Playwright/network. Wizard penuh (wizard.e2e.cjs) tetap manual karena butuh
// Electron + Playwright dan unduhan komponen.
//
// usage: bun rebrand/scripts/run-tests.ts
import { readdirSync, statSync } from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"

const here = import.meta.dir
const root = path.join(here, "..")
const failures: string[] = []

function run(label: string, command: string, args: string[], cwd: string) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit", env: process.env })
  if (result.status !== 0) failures.push(`${label} (exit ${result.status})`)
  return result.status === 0
}

run("bun test", process.execPath, ["test"], root)

const e2e = path.join(root, "test", "e2e")
for (const file of readdirSync(e2e).sort()) {
  if (!file.endsWith(".e2e.cjs")) continue
  if (file === "wizard.e2e.cjs") {
    console.log(`skip ${file} (butuh Playwright + jaringan)`)
    continue
  }
  run(file, process.execPath, [path.join(e2e, file)], root)
}

if (failures.length) {
  console.error(`\nGAGAL: ${failures.join(", ")}`)
  process.exit(1)
}
console.log("\nsemua uji overlay lulus")
