// Operasi manual: terapkan bundle ke direktori managed, atau rollback ke bundle sebelumnya.
// Default direktori = lokasi yang dibaca aplikasi untuk pengguna saat ini.
import { register } from "node:module"
import fs from "node:fs"
import path from "node:path"

register("./ts-resolve.mjs", import.meta.url)
const { applyBundle, readState, rollback, userManagedDirectory } = await import(
  "../packages/core/src/config/managed-apply.ts"
)
const { publicKey: appPublicKey, allowedPackages } = await import("../packages/core/src/config/managed-policy.ts")

const args = parseArgs(process.argv.slice(2))
const dir = path.resolve(args.dir ?? userManagedDirectory())
const key = args["public-key"] ?? appPublicKey()

if (args.rollback) {
  const result = rollback(dir, key)
  console.log(JSON.stringify(result, null, 2))
  process.exit(result.applied ? 0 : 1)
}

const bundlePath = path.resolve(args._[0] ?? "dist/config/stable/bundle.json")
const signaturePath = path.resolve(args.sig ?? `${bundlePath}.sig`)
const bundleBytes = fs.readFileSync(bundlePath)
const signature = fs.readFileSync(signaturePath, "utf-8").trim()
const enrollment = args.enrollment ?? readIfPresent(path.join(dir, "enrollment"))

const result = applyBundle({
  dir,
  bundleBytes,
  signature,
  publicKey: key,
  allowedPackages,
  appVersion: args["app-version"] ?? "manual",
  expectedChannel: args.channel ?? "stable",
  enrollment,
})
console.log(JSON.stringify({ ...result, state: readState(dir) }, null, 2))
process.exit(result.applied ? 0 : 1)

function readIfPresent(file) {
  try {
    return fs.readFileSync(file, "utf-8").trim() || undefined
  } catch {
    return undefined
  }
}

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
