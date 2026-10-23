// Uji penerapan bundle di disk: atomik, menolak yang rusak, menyimpan versi sebelumnya,
// dan tidak pernah menulis API key plaintext.
import assert from "node:assert/strict"
import { generateKeyPairSync } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import {
  applyBundle,
  readBundle,
  readState,
  rollback,
  installId,
  managedDirectories,
} from "../packages/core/src/config/managed-apply.ts"
import { encryptSecrets, signBundle } from "../packages/core/src/config/managed-bundle.ts"

let pass = 0
const failures = []
async function check(name, fn) {
  try {
    await fn()
    pass++
  } catch (error) {
    failures.push(`${name}: ${error.message}`)
  }
}

const keys = generateKeyPairSync("ed25519")
const privateKey = keys.privateKey.export({ format: "der", type: "pkcs8" }).toString("base64")
const publicKey = keys.publicKey.export({ format: "der", type: "spki" }).toString("base64")

const enrolled = "enrollment-uji-123"
const secret = "sk-jangan-sampai-tertulis-plaintext-9f8e7d"
const allowedPackages = ["@opencode/ai/providers/openai-compatible"]
const root = path.join(import.meta.dirname, ".tmp", `apply-${process.pid}`)
fs.rmSync(root, { recursive: true, force: true })
fs.mkdirSync(root, { recursive: true })

function bundle(version, extra = {}) {
  return {
    version,
    channel: "stable",
    minAppVersion: "2.0.0",
    rollout: 100,
    config: { model: `ocg/m${version}`, providers: { ocg: { settings: { baseURL: "https://llm.example.com/v1" } } } },
    ...extra,
  }
}

function sign(value, key = privateKey) {
  const bytes = Buffer.from(JSON.stringify(value, null, 2), "utf-8")
  return { bytes, signature: signBundle(bytes, key) }
}

function apply(dir, version, extra = {}, enrollment = enrolled) {
  const { bytes, signature } = sign(bundle(version, extra))
  return applyBundle({
    dir,
    bundleBytes: bytes,
    signature,
    publicKey,
    allowedPackages,
    appVersion: "2.1.0",
    enrollment,
    now: new Date("2026-10-23T09:00:00Z"),
  })
}

await check("pasang pertama berhasil dan menulis state", () => {
  const dir = path.join(root, "kasus-1")
  const result = apply(dir, 2)
  assert.equal(result.applied, true, result.reason)
  const state = readState(dir)
  assert.equal(state.version, 2)
  assert.equal(state.channel, "stable")
  assert.match(state.sha256, /^[a-f0-9]{64}$/)
  assert.match(installId(dir), /^[a-f0-9]{32}$/)
})

await check("versi sama tidak dipasang ulang", () => {
  const dir = path.join(root, "kasus-1")
  const result = apply(dir, 2)
  assert.equal(result.applied, false)
  assert.match(result.reason, /<= terpasang/)
})

await check("bundle yang diubah ditolak dan file lama utuh", () => {
  const dir = path.join(root, "kasus-1")
  const before = readBundle(dir)
  const { bytes, signature } = sign(bundle(3))
  const tampered = Buffer.from(bytes.toString("utf-8").replace("stable", "canary"), "utf-8")
  const result = applyBundle({ dir, bundleBytes: tampered, signature, publicKey, allowedPackages, appVersion: "2.1.0" })
  assert.equal(result.applied, false)
  assert.match(result.reason, /tanda tangan/)
  assert.deepEqual(readBundle(dir), before)
  assert.equal(readState(dir).version, 2)
})

await check("tanda tangan tanpa kunci privat tidak diterima", () => {
  const dir = path.join(root, "kasus-1")
  const evil = generateKeyPairSync("ed25519")
  const evilPriv = evil.privateKey.export({ format: "der", type: "pkcs8" }).toString("base64")
  const { bytes, signature } = sign(bundle(9), evilPriv)
  const result = applyBundle({ dir, bundleBytes: bytes, signature, publicKey, allowedPackages, appVersion: "2.1.0" })
  assert.equal(result.applied, false)
  assert.match(result.reason, /tanda tangan/)
})

await check("versi lebih baru dipasang, versi lama disimpan", () => {
  const dir = path.join(root, "kasus-1")
  const result = apply(dir, 3)
  assert.equal(result.applied, true, result.reason)
  assert.equal(readState(dir).version, 3)
  const previous = fs.readFileSync(path.join(dir, "previous", "bundle.json"))
  assert.equal(JSON.parse(previous.toString("utf-8")).version, 2)
})

await check("config berbahaya ditolak walau bertanda tangan (plugins)", () => {
  const dir = path.join(root, "kasus-1")
  const result = apply(dir, 4, { config: { ...bundle(4).config, plugins: ["https://evil/x.js"] } })
  assert.equal(result.applied, false)
  assert.match(result.reason, /plugins/)
  assert.equal(readState(dir).version, 3)
})

await check("package provider di luar allowlist ditolak", () => {
  const dir = path.join(root, "kasus-1")
  const result = apply(dir, 4, {
    config: { providers: { bad: { package: "paket-sembarang", settings: {} } } },
  })
  assert.equal(result.applied, false)
  assert.match(result.reason, /allowlist/)
})

await check("rahasia tidak pernah tertulis plaintext", () => {
  const dir = path.join(root, "kasus-2")
  const envelope = encryptSecrets({ providers: { ocg: { settings: { apiKey: secret } } } }, enrolled)
  const result = apply(dir, 5, { secrets: envelope })
  assert.equal(result.applied, true, result.reason)
  for (const file of ["bundle.json", "bundle.json.sig", "applied.json"]) {
    const bytes = fs.readFileSync(path.join(dir, file))
    assert.equal(bytes.includes(Buffer.from(secret, "utf-8")), false, `${file} memuat apiKey plaintext`)
  }
})

await check("bundle dengan rahasia butuh token pendaftaran", () => {
  const dir = path.join(root, "kasus-3")
  const envelope = encryptSecrets({ providers: { ocg: { settings: { apiKey: secret } } } }, enrolled)
  const result = apply(dir, 5, { secrets: envelope }, "")
  assert.equal(result.applied, false)
  assert.match(result.reason, /token pendaftaran/)
})

await check("token salah menolak bundle (GCM)", () => {
  const dir = path.join(root, "kasus-4")
  const envelope = encryptSecrets({ providers: { ocg: { settings: { apiKey: secret } } } }, enrolled)
  const result = apply(dir, 5, { secrets: envelope }, "token-keliru")
  assert.equal(result.applied, false)
  assert.match(result.reason, /mendekripsi/)
})

await check("rollback memulihkan versi sebelumnya", () => {
  const dir = path.join(root, "kasus-1")
  const result = rollback(dir, publicKey)
  assert.equal(result.applied, true, result.reason)
  assert.equal(result.version, 2)
  assert.equal(readState(dir).version, 2)
  const restored = readBundle(dir)
  assert.equal(JSON.parse(restored.bytes.toString("utf-8")).version, 2)
})

await check("rollback dua kali gagal dengan pesan jelas", () => {
  const dir = path.join(root, "kasus-1")
  const result = rollback(dir, publicKey)
  assert.equal(result.applied, false)
  assert.match(result.reason, /tidak ada bundle sebelumnya/)
})

await check("anti-rollback setelah rollback: versi 3 boleh lagi", () => {
  const dir = path.join(root, "kasus-1")
  const result = apply(dir, 3)
  assert.equal(result.applied, true, result.reason)
})

await check("direktori managed per platform", () => {
  const win = managedDirectories("win32")
  assert.equal(win.length, 2)
  assert.match(win[0], /HyperAI[\\/]managed$/)
  assert.match(win[1], /ProgramData[\\/]HyperAI[\\/]managed$/)
  const linux = managedDirectories("linux")
  assert.match(linux[0], /hyperai[\\/]managed$/)
  assert.match(linux[1], /etc[\\/]hyperai[\\/]managed$/)
})

fs.rmSync(root, { recursive: true, force: true })
console.log(`\n${pass}${failures.length ? `/${pass + failures.length}` : ""} PASS`)
if (failures.length) {
  console.log(`\nGAGAL (${failures.length}):`)
  for (const failure of failures) console.log(` - ${failure}`)
  process.exit(1)
}
