// Uji mandiri modul inti config OTA (tanpa bun/Electron: Node 24 menjalankan .ts langsung).
// Fokus: keputusan keamanan yang tidak boleh salah - tanda tangan, enkripsi, allowlist, gate versi.
import { generateKeyPairSync } from "node:crypto"
import assert from "node:assert/strict"
import {
  BundleError,
  checkConfig,
  compareVersions,
  decodeBundle,
  decryptSecrets,
  encryptSecrets,
  inRollout,
  materialize,
  mergeManaged,
  secretsToConfig,
  shouldApply,
  signBundle,
  verifyBundle,
} from "../packages/core/src/config/managed-bundle.ts"
import { allowedPackages } from "../packages/core/src/config/managed-policy.ts"

let pass = 0
const failures = []
function check(name, fn) {
  try {
    fn()
    pass++
  } catch (error) {
    failures.push(`${name}: ${error.message}`)
  }
}

const keys = generateKeyPairSync("ed25519")
const privB64 = keys.privateKey.export({ format: "der", type: "pkcs8" }).toString("base64")
const pubB64 = keys.publicKey.export({ format: "der", type: "spki" }).toString("base64")
const other = generateKeyPairSync("ed25519")
const otherPriv = other.privateKey.export({ format: "der", type: "pkcs8" }).toString("base64")

const baseConfig = {
  model: "ocg/deepseek-v4.1-flash",
  providers: {
    ocg: {
      name: "OpenCode Gateway",
      package: "@opencode/ai/providers/openai-compatible",
      settings: { baseURL: "https://llm.example.com/v1" },
      models: { "deepseek-v4.1-flash": { name: "DeepSeek V4.1" } },
    },
  },
  policies: [{ effect: "deny", action: "provider.use", resource: "cx" }],
}

function bundle(overrides = {}) {
  return {
    version: 2,
    channel: "stable",
    minAppVersion: "2.0.0",
    rollout: 100,
    config: baseConfig,
    ...overrides,
  }
}

function bytesOf(value) {
  return Buffer.from(JSON.stringify(value, null, 2), "utf-8")
}

function signed(overrides = {}, privateKey = privB64) {
  const bytes = bytesOf(bundle(overrides))
  return { bytes, signature: signBundle(bytes, privateKey) }
}

// --- tanda tangan -----------------------------------------------------------
check("bundle sah lolos verifikasi", () => {
  const { bytes, signature } = signed()
  assert.equal(verifyBundle(bytes, signature, pubB64), true)
})

check("perubahan 1 byte membatalkan tanda tangan", () => {
  const { bytes, signature } = signed()
  const tampered = Buffer.from(bytes.toString("utf-8").replace("stable", "canary"), "utf-8")
  assert.equal(verifyBundle(tampered, signature, pubB64), false)
})

check("kunci publik lain menolak tanda tangan", () => {
  const { bytes, signature } = signed()
  const otherPub = other.publicKey.export({ format: "der", type: "spki" }).toString("base64")
  assert.equal(verifyBundle(bytes, signature, otherPub), false)
})

check("tanda tangan sampah tidak melempar", () => {
  const { bytes } = signed()
  assert.equal(verifyBundle(bytes, "bukan-base64!", pubB64), false)
  assert.equal(verifyBundle(bytes, "", pubB64), false)
})

check("bundle > 2MB ditolak", () => {
  const huge = Buffer.alloc(2 * 1024 * 1024 + 1, 0x20)
  assert.equal(verifyBundle(huge, "x", pubB64), false)
})

// --- bentuk bundle ----------------------------------------------------------
check("decode bundle valid", () => {
  const { bytes } = signed()
  const decoded = decodeBundle(bytes)
  assert.equal(decoded.version, 2)
  assert.equal(decoded.channel, "stable")
  assert.deepEqual(decoded.config, baseConfig)
})

check("decode menolak versi 0 / channel asing / rollout > 100 / config bukan objek", () => {
  for (const bad of [
    { version: 0, channel: "stable", config: {} },
    { version: 1, channel: "nightly", config: {} },
    { version: 1, channel: "stable", rollout: 150, config: {} },
    { version: 1, channel: "stable", config: [] },
    { version: 1, channel: "stable" },
  ]) {
    assert.throws(() => decodeBundle(bytesOf(bad)), BundleError)
  }
})

check("decode menolak JSON rusak", () => {
  assert.throws(() => decodeBundle(Buffer.from("{bukan json")), BundleError)
})

// --- allowlist config -------------------------------------------------------
check("config wajar diterima", () => {
  const result = checkConfig(baseConfig, allowedPackages)
  assert.equal(result.ok, true, result.problems.join("; "))
})

check("plugins/skills/instructions/mcp/commands ditolak", () => {
  for (const key of ["plugins", "skills", "instructions", "mcp", "commands", "experimental"]) {
    const result = checkConfig({ ...baseConfig, [key]: [] })
    assert.equal(result.ok, false, `${key} seharusnya ditolak`)
  }
})

check("kunci tak dikenal ditolak", () => {
  const result = checkConfig({ ...baseConfig, rm_rf: true })
  assert.equal(result.ok, false)
})

check("package model di luar allowlist ditolak", () => {
  const bad = { providers: { ocg: { models: { m1: { package: "paket-sembarang" } } } } }
  assert.equal(checkConfig(bad, allowedPackages).ok, false)
  const ok = {
    providers: { ocg: { models: { m1: { package: "@opencode/ai/providers/openai-compatible" } } } },
  }
  const result = checkConfig(ok, allowedPackages)
  assert.equal(result.ok, true, result.problems.join("; "))
})

check("formatter dan lsp ditolak (membawa command)", () => {
  for (const key of ["formatter", "lsp"]) {
    const result = checkConfig({ ...baseConfig, [key]: { x: { command: ["sh", "-c", "curl evil"] } } })
    assert.equal(result.ok, false, `${key} seharusnya ditolak`)
  }
})

check("kunci berbahaya __proto__/constructor ditolak", () => {
  for (const key of ["__proto__", "constructor", "prototype"]) {
    const provider = JSON.parse(`{"${key}": {"settings": {}}} `)
    const model = JSON.parse(`{"${key}": {"package": "@opencode/ai/providers/openai-compatible"}}`)
    assert.equal(checkConfig({ providers: { ocg: provider } }, allowedPackages).ok, false, `provider.${key}`)
    assert.equal(checkConfig({ providers: { ocg: { models: model } } }, allowedPackages).ok, false, `models.${key}`)
  }
})

check("package provider di luar allowlist ditolak", () => {
  const result = checkConfig(
    { providers: { evil: { package: "left-pad", settings: {} } } },
    ["@opencode/gateway"],
  )
  assert.equal(result.ok, false)
  const ok = checkConfig({ providers: { ocg: { package: "@opencode/gateway" } } }, ["@opencode/gateway"])
  assert.equal(ok.ok, true, ok.problems.join("; "))
})

check("apiKey plaintext di config pusat ditolak", () => {
  const result = checkConfig({ providers: { ocg: { settings: { apiKey: "sk-bocor" } } } }, allowedPackages)
  assert.equal(result.ok, false)
  assert.match(result.problems.join("; "), /hanya boleh .*secrets/)
})

check("header sensitif literal ditolak, rujukan env diterima", () => {
  assert.equal(checkConfig({ providers: { ocg: { headers: { Authorization: "Bearer sk-x" } } } }, allowedPackages).ok, false)
  assert.equal(
    checkConfig({ providers: { ocg: { models: { m: { headers: { "x-api-key": "sk-x" } } } } } }, allowedPackages).ok,
    false,
  )
  assert.equal(
    checkConfig({ providers: { ocg: { settings: { headers: { authorization: "Bearer sk" } } } } }, allowedPackages).ok,
    false,
  )
  const envHeader = { providers: { ocg: { headers: { Authorization: "{env:OCG_TOKEN}" } } } }
  assert.equal(checkConfig(envHeader, allowedPackages).ok, true)
  const envKey = { providers: { ocg: { settings: { apiKey: "{env:OCG_KEY}" } } } }
  assert.equal(checkConfig(envKey, allowedPackages).ok, true)
})

check("merge menolak kunci berbahaya dari pusat", () => {
  const managed = JSON.parse('{"__proto__":{"polluted":true}}')
  assert.throws(() => mergeManaged({ a: 1 }, managed), BundleError)
  assert.equal({}.polluted, undefined)
})

// --- enkripsi rahasia -------------------------------------------------------
const secrets = { providers: { ocg: { settings: { apiKey: "sk-rahasia-123", baseURL: "https://evil" } } } }
const enrollment = "org-enrollment-token-2026"

check("enkripsi/dekripsi bolak-balik", () => {
  const envelope = encryptSecrets(secrets, enrollment)
  const plain = decryptSecrets(envelope, enrollment)
  assert.deepEqual(plain, secrets)
})

check("token salah gagal dekripsi", () => {
  const envelope = encryptSecrets(secrets, enrollment)
  assert.throws(() => decryptSecrets(envelope, "token-lain"), BundleError)
})

check("ciphertext diubah gagal dekripsi (GCM)", () => {
  const envelope = encryptSecrets(secrets, enrollment)
  const raw = Buffer.from(envelope.ct, "base64")
  raw[0] ^= 0xff
  assert.throws(() => decryptSecrets({ ...envelope, ct: raw.toString("base64") }, enrollment), BundleError)
})

check("envelope dengan kdf asing ditolak", () => {
  const envelope = encryptSecrets(secrets, enrollment)
  assert.throws(() => decryptSecrets({ ...envelope, kdf: "md5" }, enrollment), BundleError)
})

check("rahasia hanya mengisi apiKey", () => {
  const filtered = secretsToConfig(secrets)
  assert.deepEqual(filtered, { providers: { ocg: { settings: { apiKey: "sk-rahasia-123" } } } })
  assert.equal(JSON.stringify(filtered).includes("evil"), false)
})

check("provider id aneh diabaikan", () => {
  const filtered = secretsToConfig({
    providers: { "../etc": { settings: { apiKey: "x" } }, ok: { settings: { apiKey: "y" } } },
  })
  assert.deepEqual(Object.keys(filtered.providers), ["ok"])
})

// --- merge ------------------------------------------------------------------
check("merge: managed menang, nilai lain tetap", () => {
  const merged = mergeManaged(
    { model: "a", providers: { ocg: { name: "lama", settings: { baseURL: "u1", apiKey: "lama" } } }, keep: 1 },
    { model: "b", providers: { ocg: { settings: { apiKey: "baru" } } } },
  )
  assert.equal(merged.model, "b")
  assert.equal(merged.keep, 1)
  assert.equal(merged.providers.ocg.name, "lama")
  assert.equal(merged.providers.ocg.settings.baseURL, "u1")
  assert.equal(merged.providers.ocg.settings.apiKey, "baru")
})

check("merge: array diganti utuh", () => {
  assert.deepEqual(mergeManaged({ a: [1, 2] }, { a: [3] }), { a: [3] })
})

check("materialize menyatukan config + rahasia", () => {
  const envelope = encryptSecrets(secrets, enrollment)
  const result = materialize(bundle({ secrets: envelope }), enrollment, allowedPackages)
  assert.equal(result.providers.ocg.settings.apiKey, "sk-rahasia-123")
  assert.equal(result.providers.ocg.settings.baseURL, "https://llm.example.com/v1")
  assert.equal(result.providers.ocg.name, "OpenCode Gateway")
})

check("materialize tanpa token saat ada rahasia ditolak", () => {
  const envelope = encryptSecrets(secrets, enrollment)
  assert.throws(() => materialize(bundle({ secrets: envelope }), undefined, allowedPackages), BundleError)
})

check("materialize menolak config berbahaya walau bertanda tangan", () => {
  const envelope = encryptSecrets(secrets, enrollment)
  assert.throws(
    () => materialize(bundle({ config: { ...baseConfig, plugins: ["https://evil/x.js"] }, secrets: envelope }), enrollment, allowedPackages),
    BundleError,
  )
})

// --- rollout & gate ---------------------------------------------------------
check("rollout 100 selalu, 0 tidak pernah", () => {
  assert.equal(inRollout({ ...bundle(), rollout: 100 }, "install-1"), true)
  assert.equal(inRollout({ ...bundle(), rollout: 0 }, "install-1"), false)
})

check("rollout deterministik per instalasi", () => {
  const b = { ...bundle(), rollout: 50 }
  assert.equal(inRollout(b, "install-abc"), inRollout(b, "install-abc"))
})

check("rollout 50 menyebar wajar (300 instalasi)", () => {
  const b = { ...bundle(), rollout: 50 }
  const hit = Array.from({ length: 300 }, (_, i) => inRollout(b, `install-${i}`)).filter(Boolean).length
  assert.ok(hit > 100 && hit < 200, `dapat ${hit}/300`)
})

check("anti-rollback: versi sama/lama ditolak, baru diterima", () => {
  const gate = (version, currentVersion) =>
    shouldApply({ bundle: bundle({ version }), currentVersion, appVersion: "2.1.0", installId: "i" })
  assert.equal(gate(2, 2).apply, false)
  assert.equal(gate(1, 2).apply, false)
  assert.equal(gate(3, 2).apply, true)
  assert.equal(gate(1, undefined).apply, true)
})

check("minAppVersion dihormati", () => {
  const result = shouldApply({ bundle: bundle({ minAppVersion: "3.0.0" }), appVersion: "2.9.9", installId: "i" })
  assert.equal(result.apply, false)
  assert.match(result.reason, /3\.0\.0/)
})

check("compareVersions", () => {
  assert.equal(compareVersions("2.10.0", "2.9.9"), 1)
  assert.equal(compareVersions("2.0.0", "2.0.0"), 0)
  assert.equal(compareVersions("1.9.9", "2.0.0"), -1)
})

check("gate menolak bundle di luar rollout", () => {
  const result = shouldApply({ bundle: bundle({ rollout: 0 }), appVersion: "2.1.0", installId: "i" })
  assert.equal(result.apply, false)
})

// --- key generation dipakai CI ---------------------------------------------
check("kunci privat hasil generate bisa menandatangani", () => {
  const { bytes } = signed({}, otherPriv)
  const otherPub = other.publicKey.export({ format: "der", type: "spki" }).toString("base64")
  assert.equal(verifyBundle(bytes, signBundle(bytes, otherPriv), otherPub), true)
})

console.log(`\n${pass}${failures.length ? `/${pass + failures.length}` : ""} PASS`)
if (failures.length) {
  console.log(`\nGAGAL (${failures.length}):`)
  for (const failure of failures) console.log(` - ${failure}`)
  process.exit(1)
}
