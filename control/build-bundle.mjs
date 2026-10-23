// Bangun bundle config OTA: validasi -> (opsional) enkripsi rahasia -> tanda tangan Ed25519.
// Jalankan: node control/build-bundle.mjs --version 7 --channel stable
import { register } from "node:module"
import { createHash, createPrivateKey, createPublicKey } from "node:crypto"
import fs from "node:fs"
import path from "node:path"

register("./ts-resolve.mjs", import.meta.url)
const { checkConfig, encryptSecrets, sha256Hex, signBundle } = await import(
  "../packages/core/src/config/managed-bundle.ts"
)
const { allowedPackages } = await import("../packages/core/src/config/managed-policy.ts")

const args = parseArgs(process.argv.slice(2))
const configPath = path.resolve(args.config ?? "config/opencode.json")
const secretsPath = args.secrets === "none" ? undefined : path.resolve(args.secrets ?? "config/secrets.json")
const outDir = path.resolve(args.out ?? path.join("dist", "config", args.channel ?? "stable"))
const channel = args.channel ?? "stable"
const version = Number(args.version)
const rollout = Number(args.rollout ?? 100)
const minAppVersion = args["min-app-version"]

if (!Number.isInteger(version) || version < 1) fail("--version wajib bilangan bulat >= 1")
if (!["stable", "beta", "canary"].includes(channel)) fail("--channel harus stable|beta|canary")
if (!Number.isFinite(rollout) || rollout < 0 || rollout > 100) fail("--rollout harus 0-100")

const config = JSON.parse(fs.readFileSync(configPath, "utf-8"))
const checked = checkConfig(config, allowedPackages)
if (!checked.ok) fail(`config ditolak:\n - ${checked.problems.join("\n - ")}`)

let secrets
if (secretsPath && fs.existsSync(secretsPath)) {
  const token = process.env.CONFIG_ENROLLMENT_TOKEN
  if (!token) fail("config/secrets.json ada tetapi CONFIG_ENROLLMENT_TOKEN belum diisi")
  const raw = JSON.parse(fs.readFileSync(secretsPath, "utf-8"))
  secrets = encryptSecrets(raw, token)
  const leaked = Object.keys(raw.providers ?? {}).filter((id) => raw.providers[id]?.settings?.baseURL)
  if (leaked.length) fail(`secrets.json hanya boleh berisi apiKey (bukan baseURL): ${leaked.join(", ")}`)
}

const signingKey = args["key-file"]
  ? fs.readFileSync(path.resolve(args["key-file"]), "utf-8").trim()
  : process.env.CONFIG_SIGNING_KEY
if (!signingKey) fail("CONFIG_SIGNING_KEY (atau --key-file) belum diisi")

const bundle = {
  version,
  channel,
  ...(minAppVersion ? { minAppVersion } : {}),
  issuedAt: new Date().toISOString(),
  rollout,
  config,
  ...(secrets ? { secrets } : {}),
}
const bytes = Buffer.from(JSON.stringify(bundle, null, 2), "utf-8")
const signature = signBundle(bytes, signingKey)
const digest = sha256Hex(bytes)

const signingPublic = createPublicKey(
  createPrivateKey({ key: Buffer.from(signingKey, "base64"), format: "der", type: "pkcs8" }),
).export({ format: "der", type: "spki" })
const fingerprint = createHash("sha256").update(signingPublic).digest("hex").slice(0, 16)

const manifest = {
  version,
  channel,
  minAppVersion: minAppVersion ?? null,
  rollout,
  sha256: digest,
  size: bytes.byteLength,
  issuedAt: bundle.issuedAt,
  hasSecrets: Boolean(secrets),
  signingKeyFingerprint: fingerprint,
}

if (args["dry-run"]) {
  console.log(JSON.stringify({ ...manifest, configKeys: Object.keys(config) }, null, 2))
  process.exit(0)
}

fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(path.join(outDir, "bundle.json"), bytes)
fs.writeFileSync(path.join(outDir, "bundle.json.sig"), signature)
fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2))

console.log(`bundle  : ${path.join(outDir, "bundle.json")}`)
console.log(`versi   : ${version} (${channel}, rollout ${rollout}%)`)
console.log(`sha256  : ${digest}`)
console.log(`rahasia : ${secrets ? "terenkripsi" : "tidak ada"}`)
console.log(`kunci   : ${fingerprint}`)

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (!arg.startsWith("--")) continue
    const key = arg.slice(2)
    const next = argv[i + 1]
    out[key] = next && !next.startsWith("--") ? (i++, next) : true
  }
  return out
}

function fail(message) {
  console.error(`GAGAL: ${message}`)
  process.exit(1)
}
