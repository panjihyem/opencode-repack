// Vendors the npm packages Hyper AI ships inside the desktop installer.
//
// usage: bun rebrand/scripts/prepare-bundle.ts <desktop-package-dir>
//
// electron-builder copies <desktop>/hyper-bundle into resources/hyper-bundle
// (see the extraResources rule in apply.ts). The packages are plain JavaScript,
// so one bundle serves every platform.

import { cp, rm } from "node:fs/promises"
import path from "node:path"
import { $ } from "bun"
import { manifest } from "./../files/desktop/hyper/manifest"

const desktop = process.argv[2] ? path.resolve(process.argv[2]) : undefined
if (!desktop) {
  console.error("usage: bun prepare-bundle.ts <desktop-package-dir>")
  process.exit(2)
}

const root = path.join(desktop, "hyper-bundle")
await rm(root, { recursive: true, force: true })

for (const component of [manifest.context7]) {
  const name = component.entry.split("/")[0]
  const prefix = path.join(root, name)
  await $`npm install --omit=dev --no-audit --no-fund --ignore-scripts --prefix ${prefix} ${component.package}@${component.version}`
  if (!(await Bun.file(path.join(root, component.entry)).exists()))
    throw new Error(`${component.package}@${component.version} has no ${component.entry}`)
  console.log(`bundled ${component.package}@${component.version}`)
}

// The setup wizard is plain HTML + a CommonJS preload so it needs no bundler.
// The search MCP server is the same: plain JavaScript, one bundle every OS.
await cp(path.join(import.meta.dir, "../files/desktop/wizard"), path.join(root, "wizard"), { recursive: true })
await cp(path.join(import.meta.dir, "../files/desktop/search"), path.join(root, "search"), { recursive: true })
console.log("bundled setup wizard + search MCP")
