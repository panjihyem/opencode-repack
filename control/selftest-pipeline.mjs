// Uji pipeline ujung-ke-ujung lewat CLI: build -> verify -> apply -> rollback, termasuk rahasia terenkripsi.
// Menjalankan skrip sebagai pengguna/CI (bukan memanggil fungsi internal).
import { spawnSync } from "node:child_process"
import { generateKeyPairSync } from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

const root = path.join(import.meta.dirname, ".tmp", `pipeline-${process.pid}`)
fs.rmSync(root, { recursive: true, force: true })
fs.mkdirSync(root, { recursive: true })

const keys = generateKeyPairSync("ed25519")
const privateKey = keys.privateKey.export({ format: "der", type: "pkcs8" }).toString("base64")
const publicKey = keys.publicKey.export({ format: "der", type: "spki" }).toString("base64")
const keyFile = path.join(root, "private.b64")
fs.writeFileSync(keyFile, privateKey)
const enrollment = "token-uji-pipeline-123"

const config = {
  default_agent: "managed",
  providers: {
    ocg: {
      name: "Gateway",
      package: "@opencode/ai/providers/openai-compatible",
      settings: { baseURL: "https://llm.example.com/v1" },
      models: { "model-a": { name: "Model A" } },
    },
  },
}
const configFile = path.join(root, "opencode.json")
fs.writeFileSync(configFile, JSON.stringify(config, null, 2))

const secretsFile = path.join(root, "secrets.json")
const apiKey = "sk-pipeline-rahasia-77"
fs.writeFileSync(
  secretsFile,
  JSON.stringify({ providers: { ocg: { settings: { apiKey } } } }, null, 2),
)

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

const node = process.execPath
const env = { ...process.env, HYPER_CONFIG_PUBLIC_KEY: publicKey, CONFIG_ENROLLMENT_TOKEN: enrollment }

const build = spawnSync(
  node,
  [
    "control/build-bundle.mjs",
    "--config",
    configFile,
    "--secrets",
    secretsFile,
    "--version",
    "5",
    "--channel",
    "stable",
    "--key-file",
    keyFile,
    "--out",
    path.join(root, "out"),
  ],
  { env, encoding: "utf-8" },
)

check("build-bundle berhasil", () => {
  if (build.status !== 0) throw new Error(build.stderr || build.stdout)
  fs.accessSync(path.join(root, "out", "bundle.json"))
  fs.accessSync(path.join(root, "out", "bundle.json.sig"))
  fs.accessSync(path.join(root, "out", "manifest.json"))
})

check("manifest mencatat rahasia terenkripsi", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "out", "manifest.json"), "utf-8"))
  if (manifest.version !== 5) throw new Error("versi salah")
  if (manifest.hasSecrets !== true) throw new Error("hasSecrets salah")
})

check("verify-bundle menerima bundle sah", () => {
  const result = spawnSync(node, ["control/verify-bundle.mjs", path.join(root, "out", "bundle.json")], {
    env,
    encoding: "utf-8",
  })
  if (result.status !== 0) throw new Error(result.stderr || result.stdout)
  if (!result.stdout.includes("tanda tangan : valid")) throw new Error(result.stdout)
})

check("bundle di disk tidak memuat apiKey plaintext", () => {
  const bytes = fs.readFileSync(path.join(root, "out", "bundle.json"))
  if (bytes.includes(Buffer.from(apiKey))) throw new Error("apiKey bocor di bundle.json")
})

check("verify menolak bundle yang diubah", () => {
  const tampered = path.join(root, "rusak.json")
  fs.writeFileSync(tampered, fs.readFileSync(path.join(root, "out", "bundle.json"), "utf-8").replace('"stable"', '"canary"'))
  fs.copyFileSync(path.join(root, "out", "bundle.json.sig"), `${tampered}.sig`)
  const result = spawnSync(node, ["control/verify-bundle.mjs", tampered], { env, encoding: "utf-8" })
  if (result.status === 0) throw new Error("bundle rusak malah diterima")
})

const managed = path.join(root, "managed")
check("apply menulis bundle + state", () => {
  const result = spawnSync(
    node,
    [
      "control/apply.mjs",
      path.join(root, "out", "bundle.json"),
      "--dir",
      managed,
      "--app-version",
      "2.1.0",
      "--enrollment",
      enrollment,
    ],
    { env, encoding: "utf-8" },
  )
  if (result.status !== 0) throw new Error(result.stderr || result.stdout)
  const state = JSON.parse(fs.readFileSync(path.join(managed, "applied.json"), "utf-8"))
  if (state.version !== 5) throw new Error("state versi salah")
})

check("apply kedua kali menolak versi sama", () => {
  const result = spawnSync(
    node,
    ["control/apply.mjs", path.join(root, "out", "bundle.json"), "--dir", managed, "--app-version", "2.1.0"],
    { env, encoding: "utf-8" },
  )
  if (result.status === 0) throw new Error("versi sama seharusnya ditolak")
  if (!result.stdout.includes("<= terpasang")) throw new Error(result.stdout)
})

check("apply tanpa token menolak bundle berahasia", () => {
  const result = spawnSync(
    node,
    ["control/apply.mjs", path.join(root, "out", "bundle.json"), "--dir", path.join(root, "tanpa-token")],
    { env, encoding: "utf-8" },
  )
  if (result.status === 0) throw new Error("seharusnya ditolak tanpa token")
  if (!result.stdout.includes("token pendaftaran")) throw new Error(result.stdout)
})

check("apply versi baru menyimpan versi lama", () => {
  const build2 = spawnSync(
    node,
    [
      "control/build-bundle.mjs",
      "--config",
      configFile,
      // Isolasi dari config/secrets.json milik repo (CI menulisnya dari secret).
      "--secrets",
      "none",
      "--version",
      "6",
      "--channel",
      "stable",
      "--key-file",
      keyFile,
      "--out",
      path.join(root, "out2"),
    ],
    { env, encoding: "utf-8" },
  )
  if (build2.status !== 0) throw new Error(build2.stderr || build2.stdout)
  const result = spawnSync(
    node,
    ["control/apply.mjs", path.join(root, "out2", "bundle.json"), "--dir", managed, "--app-version", "2.1.0"],
    { env, encoding: "utf-8" },
  )
  if (result.status !== 0) throw new Error(result.stderr || result.stdout)
  if (!fs.existsSync(path.join(managed, "previous", "bundle.json"))) throw new Error("previous tidak tersimpan")
})

check("rollback memulihkan versi 5", () => {
  const result = spawnSync(node, ["control/apply.mjs", "--rollback", "--dir", managed], { env, encoding: "utf-8" })
  if (result.status !== 0) throw new Error(result.stderr || result.stdout)
  const state = JSON.parse(fs.readFileSync(path.join(managed, "applied.json"), "utf-8"))
  if (state.version !== 5) throw new Error(`versi setelah rollback: ${state.version}`)
})

check("rollback kedua kali gagal dengan pesan jelas", () => {
  const result = spawnSync(node, ["control/apply.mjs", "--rollback", "--dir", managed], { env, encoding: "utf-8" })
  if (result.status === 0) throw new Error("rollback kedua seharusnya gagal")
  if (!result.stdout.includes("tidak ada bundle sebelumnya")) throw new Error(result.stdout)
})

fs.rmSync(root, { recursive: true, force: true })
console.log(`\n${pass}${failures.length ? `/${pass + failures.length}` : ""} PASS`)
if (failures.length) {
  console.log(`\nGAGAL (${failures.length}):`)
  for (const failure of failures) console.log(` - ${failure}`)
  process.exit(1)
}
