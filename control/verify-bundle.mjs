// Verifikasi bundle persis seperti aplikasi: tanda tangan, bentuk, allowlist, anti-rollback tidak dievaluasi di sini.
import { register } from "node:module"
import fs from "node:fs"
import path from "node:path"

register("./ts-resolve.mjs", import.meta.url)
const { checkConfig, decodeBundle, sha256Hex, verifyBundle } = await import(
  "../packages/core/src/config/managed-bundle.ts"
)
const { allowedPackages, publicKey: appPublicKey } = await import("../packages/core/src/config/managed-policy.ts")

const args = parseArgs(process.argv.slice(2))
const bundlePath = path.resolve(args._[0] ?? "dist/config/stable/bundle.json")
const signaturePath = path.resolve(args.sig ?? `${bundlePath}.sig`)
const key = args["public-key"] ?? appPublicKey()

const bytes = fs.readFileSync(bundlePath)
const signature = fs.readFileSync(signaturePath, "utf-8").trim()

if (!verifyBundle(bytes, signature, key)) {
  console.error("TANDA TANGAN TIDAK VALID")
  process.exit(1)
}
const bundle = decodeBundle(bytes)
const checked = checkConfig(bundle.config, allowedPackages)
if (!checked.ok) {
  console.error(`CONFIG DITOLAK:\n - ${checked.problems.join("\n - ")}`)
  process.exit(1)
}

console.log("tanda tangan : valid")
console.log("versi        : " + bundle.version + " (" + bundle.channel + ", rollout " + (bundle.rollout ?? 100) + "%)")
console.log("min app      : " + (bundle.minAppVersion ?? "-"))
console.log("sha256       : " + sha256Hex(bytes))
console.log("rahasia      : " + (bundle.secrets ? "terenkripsi" : "tidak ada"))
console.log("config keys  : " + Object.keys(bundle.config).join(", "))

function parseArgs(argv) {
  const out = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (!arg.startsWith("--")) {
      out._.push(arg)
      continue
    }
    const key = arg.slice(2)
    const next = argv[i + 1]
    out[key] = next && !next.startsWith("--") ? (i++, next) : true
  }
  return out
}
