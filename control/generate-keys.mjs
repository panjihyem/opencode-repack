// Buat pasangan kunci Ed25519 untuk menandatangani config OTA.
// Kunci privat HANYA untuk secret CI; jangan pernah masuk repo.
import { generateKeyPairSync } from "node:crypto"
import fs from "node:fs"
import path from "node:path"

const target = process.argv[2] ?? process.env.HYPER_CONFIG_KEY_DIR ?? path.join(process.env.USERPROFILE ?? ".", ".hyper-ai", "config-keys")
fs.mkdirSync(target, { recursive: true })

const keys = generateKeyPairSync("ed25519")
const privateKey = keys.privateKey.export({ format: "der", type: "pkcs8" }).toString("base64")
const publicKey = keys.publicKey.export({ format: "der", type: "spki" }).toString("base64")

const privateFile = path.join(target, "private.b64")
fs.writeFileSync(privateFile, privateKey, { mode: 0o600 })
fs.writeFileSync(path.join(target, "public.b64"), publicKey)

console.log(`Kunci privat : ${privateFile}`)
console.log(`Kunci publik : ${publicKey}`)
console.log("")
console.log("Langkah:")
console.log("  1. Simpan isi kunci privat sebagai secret repo CONFIG_SIGNING_KEY.")
console.log("  2. Salin kunci publik ke packages/core/src/config/managed-policy.ts (publicKey()).")
console.log("  3. Buat secret CONFIG_ENROLLMENT_TOKEN (token pendaftaran organisasi).")
console.log("  4. Hapus kunci privat dari mesin ini setelah dipindahkan ke pengelola rahasia.")
