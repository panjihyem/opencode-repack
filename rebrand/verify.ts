// Branding check for built Hyper AI artifacts. Run in CI before publishing so
// a half-rebranded build is never released.
//
// usage: bun rebrand/verify.ts <cli-binary> [--desktop <desktop-dist-dir>]

import { readdir } from "node:fs/promises"
import path from "node:path"
import { brand } from "./brand"

const args = process.argv.slice(2)
const target = args[0]
if (!target) {
  console.error("usage: bun verify.ts <cli-binary> [--desktop <dist-dir>]")
  process.exit(2)
}
const desktopIndex = args.indexOf("--desktop")
const desktopDist = desktopIndex === -1 ? undefined : args[desktopIndex + 1]

const NAME = brand.name
const CLI = brand.cli

// latin1 keeps every byte as one character, so ASCII literals are never
// mangled by UTF-8 decoding of the surrounding machine code.
const blob = Buffer.from(await Bun.file(target).arrayBuffer()).toString("latin1")

const expectPresent = [
  `${NAME} command line interface`,
  `${CLI} / stats`,
  `${NAME} crashed`,
  `Tell ${NAME} what to do differently`,
  `${CLI} -s `,
  `Allow ${NAME} to search the web`,
  `${CLI} mini requires a TTY stdout`,
  `${CLI} mini -s `,
  // wordmark glyph tables from logo.ts. The bundler escapes non-ASCII literals
  // as \uXXXX, so these are matched in escaped form ("▄▀▀▄", "█^^█").
  "\\u2584\\u2580\\u2580\\u2584",
  "\\u2588^^\\u2588",
]

const expectAbsent = [
  "OpenCode command line interface",
  "OpenCode crashed",
  "Tell OpenCode what to do differently",
  "opencode -s ses",
  "Allow OpenCode to search the web",
  "opencode / stats",
  "opencode mini -s ",
]

let bad = 0
for (const s of expectPresent) {
  const ok = blob.includes(s)
  if (!ok) bad++
  console.log(`${ok ? "OK  " : "MISS"} present: ${JSON.stringify(s)}`)
}
for (const s of expectAbsent) {
  const ok = !blob.includes(s)
  if (!ok) bad++
  console.log(`${ok ? "OK  " : "LEAK"} absent : ${JSON.stringify(s)}`)
}

if (desktopDist) {
  // Installers are named after the product, never after upstream.
  const files = await readdir(desktopDist, { recursive: true })
  const installers = files.filter(
    (file) => /\.(exe|dmg|zip|AppImage|deb|rpm)$/.test(file) && !file.includes("unpacked"),
  )
  const named = installers.filter((file) => path.basename(file).startsWith(`${CLI}-desktop-`))
  const ok = installers.length > 0 && named.length === installers.length
  if (!ok) bad++
  console.log(`${ok ? "OK  " : "FAIL"} desktop installers named ${CLI}-desktop-*: ${installers.join(", ") || "(none)"}`)

  // The case module and its quickstart must travel inside the app bundle.
  // electron-builder places it under the app resources, not at dist/ root.
  const expected = [
    "office/lib/case/case.py",
    "office/lib/case/cli.py",
    "office/lib/case/pseudonym.py",
    "office/lib/case/casemode.py",
    "docs/SECURITY-QUICKSTART.md",
    "wizard/TERMS.md",
    "wizard/PRIVACY.md",
    "wizard/LICENSES.md",
    "wizard/case.html",
    "wizard/case-preload.cjs",
  ]
  const normalized = files.map((entry) => entry.replace(/\\/g, "/"))
  for (const file of expected) {
    const exists = normalized.some((entry) => entry.endsWith(`hyper-bundle/${file}`))
    if (!exists) bad++
    console.log(`${exists ? "OK  " : "MISS"} bundled: ${file}`)
  }
}

console.log(`\nproblems: ${bad}`)
process.exit(bad ? 1 : 0)
