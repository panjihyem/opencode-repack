// Vendors the npm packages Hyper AI ships inside the desktop installer.
//
// usage: bun rebrand/scripts/prepare-bundle.ts <desktop-package-dir>
//
// electron-builder copies <desktop>/hyper-bundle into resources/hyper-bundle
// (see the extraResources rule in apply.ts). The packages are plain JavaScript,
// so one bundle serves every platform.

import { chmod, cp, mkdir, rename, rm } from "node:fs/promises"
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

for (const component of [manifest.context7, manifest.viz]) {
  const name = component.entry.split("/")[0]
  const prefix = path.join(root, name)
  await $`npm install --omit=dev --no-audit --no-fund --ignore-scripts --prefix ${prefix} ${component.package}@${component.version}`
  if (!(await Bun.file(path.join(root, component.entry)).exists()))
    throw new Error(`${component.package}@${component.version} has no ${component.entry}`)
  console.log(`bundled ${component.package}@${component.version}`)
}

// The setup wizard is plain HTML + a CommonJS preload so it needs no bundler.
// The search MCP server is the same: plain JavaScript, one bundle every OS.
await $`cp -R ${path.join(import.meta.dir, "../files/desktop/wizard")} ${path.join(root, "wizard")}`
await $`cp -R ${path.join(import.meta.dir, "../files/desktop/search")} ${path.join(root, "search")}`
// Security quickstart ships as well: the packaged app can point users at it
// without a network request.
await mkdir(path.join(root, "docs"), { recursive: true })
await cp(path.join(import.meta.dir, "../docs/SECURITY-QUICKSTART.md"), path.join(root, "docs", "SECURITY-QUICKSTART.md"))
console.log("bundled setup wizard + search MCP + security quickstart")

// The recurring-case module ships as loose Python files: the installer copies
// them next to forensic.py, so the .py files stay the single source of truth.
await mkdir(path.join(root, "office", "lib", "case"), { recursive: true })
await Promise.all(
  ["case.py", "cli.py", "pseudonym.py", "casemode.py", "selfcheck.py"].map((name) =>
    cp(path.join(import.meta.dir, "../files/desktop/hyper/case", name), path.join(root, "office/lib/case", name)),
  ),
)

// The `hyper` CLI shares the knowledge module with the app: compile it as a
// standalone ESM (electron-free) plus the thin launcher that drives it. Bun's
// naming only emits `.js`, so rename to .mjs for the launcher's import.
await $`cp -R ${path.join(import.meta.dir, "../files/desktop/cli")} ${path.join(root, "bin")}`
if (!(await Bun.file(path.join(root, "bin", "graphify.mjs")).exists())) throw new Error("Graphify CLI companion missing")
await Bun.build({
  entrypoints: [path.join(import.meta.dir, "../files/desktop/hyper/knowledge.ts")],
  target: "node",
  external: ["electron"],
  format: "esm",
  outdir: path.join(root, "bin"),
  naming: "[dir]/knowledge.[ext]",
})
await rename(path.join(root, "bin", "knowledge.js"), path.join(root, "bin", "knowledge.mjs"))
await chmod(path.join(root, "bin", "hyper.mjs"), 0o755)
console.log("bundled hyper CLI (bin/knowledge.mjs + bin/hyper.mjs)")
