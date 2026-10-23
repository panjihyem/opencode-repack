/**
 * Penerapan bundle config OTA ke disk (aman-gagal, atomik, bisa di-rollback).
 *
 * Dipakai dua sisi:
 * - updater aplikasi (`gui-extensions`) setelah mengunduh dari GitHub Releases;
 * - CLI `control/apply.mjs` untuk uji/operasi manual.
 *
 * Yang ditulis ke disk adalah *bundle asli* (masih terenkripsi) + tanda tangannya,
 * bukan hasil dekripsi. Dengan begitu API key tidak pernah tersimpan plaintext.
 * Pembacaan oleh core memverifikasi tanda tangan lagi sebelum dipakai.
 */
import { createHash, randomBytes } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { BundleError, decodeBundle, materialize, shouldApply, verifyBundle, type Bundle } from "./managed-bundle.js"

export const BUNDLE_FILE = "bundle.json"
export const SIGNATURE_FILE = "bundle.json.sig"
export const STATE_FILE = "applied.json"
export const INSTALL_FILE = "install-id"
const PREVIOUS_DIR = "previous"

export interface State {
  readonly version: number
  readonly sha256: string
  readonly appliedAt: string
  readonly appVersion: string
  readonly channel: string
  readonly installId: string
}

export interface ApplyInput {
  readonly dir: string
  readonly bundleBytes: Uint8Array
  readonly signature: string
  readonly publicKey: string
  readonly allowedPackages: readonly string[]
  readonly appVersion: string
  readonly enrollment?: string
  /** Untuk uji deterministik; default waktu sekarang. */
  readonly now?: Date
}

export interface ApplyResult {
  readonly applied: boolean
  readonly reason: string
  readonly version?: number
  readonly dir: string
}

export function installId(dir: string): string {
  const file = path.join(dir, INSTALL_FILE)
  try {
    const existing = fs.readFileSync(file, "utf-8").trim()
    if (/^[a-f0-9]{32}$/.test(existing)) return existing
  } catch {}
  const id = randomBytes(16).toString("hex")
  fs.mkdirSync(dir, { recursive: true })
  writeAtomic(file, Buffer.from(id, "utf-8"))
  return id
}

export function readState(dir: string): State | undefined {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(dir, STATE_FILE), "utf-8"))
    if (typeof parsed?.version !== "number" || typeof parsed?.sha256 !== "string") return undefined
    return parsed as State
  } catch {
    return undefined
  }
}

export function readBundle(dir: string): { bytes: Buffer; signature: string } | undefined {
  try {
    const bytes = fs.readFileSync(path.join(dir, BUNDLE_FILE))
    const signature = fs.readFileSync(path.join(dir, SIGNATURE_FILE), "utf-8").trim()
    return { bytes, signature }
  } catch {
    return undefined
  }
}

export function applyBundle(input: ApplyInput): ApplyResult {
  const { dir, bundleBytes, signature, publicKey, allowedPackages } = input
  if (!bundleBytes?.byteLength) return { applied: false, reason: "bundle kosong", dir }
  if (!signature?.trim()) return { applied: false, reason: "tanda tangan kosong", dir }
  if (!verifyBundle(bundleBytes, signature.trim(), publicKey))
    return { applied: false, reason: "tanda tangan tidak valid", dir }

  let bundle: Bundle
  try {
    bundle = decodeBundle(bundleBytes)
  } catch (error) {
    return { applied: false, reason: `bundle rusak: ${(error as Error).message}`, dir }
  }

  const previous = readState(dir)
  const id = installId(dir)
  const gate = shouldApply({
    bundle,
    currentVersion: previous?.version,
    appVersion: input.appVersion,
    installId: id,
  })
  if (!gate.apply) return { applied: false, reason: gate.reason, version: bundle.version, dir }

  // Validasi isi + dekripsi sebelum menyentuh file: bundle buruk tidak boleh menggantikan yang sehat.
  let materialized: Record<string, unknown>
  try {
    materialized = materialize(bundle, input.enrollment, allowedPackages)
  } catch (error) {
    if (error instanceof BundleError) return { applied: false, reason: error.message, version: bundle.version, dir }
    throw error
  }

  fs.mkdirSync(dir, { recursive: true })
  const current = readBundle(dir)
  if (current) {
    const previousDir = path.join(dir, PREVIOUS_DIR)
    fs.mkdirSync(previousDir, { recursive: true })
    writeAtomic(path.join(previousDir, BUNDLE_FILE), current.bytes)
    writeAtomic(path.join(previousDir, SIGNATURE_FILE), Buffer.from(current.signature, "utf-8"))
  }
  writeAtomic(path.join(dir, BUNDLE_FILE), bundleBytes)
  writeAtomic(path.join(dir, SIGNATURE_FILE), Buffer.from(signature.trim(), "utf-8"))
  const state: State = {
    version: bundle.version,
    sha256: createHash("sha256").update(bundleBytes).digest("hex"),
    appliedAt: (input.now ?? new Date()).toISOString(),
    appVersion: input.appVersion,
    channel: bundle.channel,
    installId: id,
  }
  writeAtomic(path.join(dir, STATE_FILE), Buffer.from(JSON.stringify(state, null, 2), "utf-8"))
  // materialized hanya dipakai untuk memastikan config+rahasia valid; hasilnya tidak ditulis.
  void Object.keys(materialized)
  return { applied: true, reason: "ok", version: bundle.version, dir }
}

/** Kembalikan bundle sebelumnya; tanda tangan diverifikasi ulang sebelum dipulihkan. */
export function rollback(dir: string, publicKey: string): ApplyResult {
  const previousDir = path.join(dir, PREVIOUS_DIR)
  let bytes: Buffer
  let signature: string
  try {
    bytes = fs.readFileSync(path.join(previousDir, BUNDLE_FILE))
    signature = fs.readFileSync(path.join(previousDir, SIGNATURE_FILE), "utf-8").trim()
  } catch {
    return { applied: false, reason: "tidak ada bundle sebelumnya", dir }
  }
  if (!verifyBundle(bytes, signature, publicKey)) return { applied: false, reason: "tanda tangan bundle sebelumnya rusak", dir }
  let bundle: Bundle
  try {
    bundle = decodeBundle(bytes)
  } catch (error) {
    return { applied: false, reason: `bundle sebelumnya rusak: ${(error as Error).message}`, dir }
  }
  writeAtomic(path.join(dir, BUNDLE_FILE), bytes)
  writeAtomic(path.join(dir, SIGNATURE_FILE), Buffer.from(signature, "utf-8"))
  const state: State = {
    version: bundle.version,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    appliedAt: new Date().toISOString(),
    appVersion: "rollback",
    channel: bundle.channel,
    installId: installId(dir),
  }
  writeAtomic(path.join(dir, STATE_FILE), Buffer.from(JSON.stringify(state, null, 2), "utf-8"))
  fs.rmSync(previousDir, { recursive: true, force: true })
  return { applied: true, reason: "rollback", version: bundle.version, dir }
}

function writeAtomic(file: string, bytes: Uint8Array) {
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, bytes)
  // Windows: rename ke file yang sedang dipegang antivirus/indeks bisa EPERM sesaat.
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      fs.renameSync(tmp, file)
      return
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code !== "EPERM" && code !== "EACCES" && code !== "EBUSY") throw error
      if (attempt === 7) {
        fs.copyFileSync(tmp, file)
        fs.rmSync(tmp, { force: true })
        return
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20)
    }
  }
}

/** Direktori managed per platform; mesin (machine) menang atas pengguna bila keduanya ada. */
export function managedDirectories(platform: NodeJS.Platform = process.platform): string[] {
  const env = process.env
  if (platform === "win32") {
    const local = env.LOCALAPPDATA ?? path.join(env.USERPROFILE ?? "", "AppData", "Local")
    return [path.join(local, "HyperAI", "managed"), path.join(env.ProgramData ?? "C:\\ProgramData", "HyperAI", "managed")]
  }
  if (platform === "darwin") {
    return [
      path.join(env.HOME ?? "", "Library", "Application Support", "HyperAI", "managed"),
      "/Library/Application Support/HyperAI/managed",
    ]
  }
  return [
    path.join(env.XDG_CONFIG_HOME ?? path.join(env.HOME ?? "", ".config"), "hyperai", "managed"),
    "/etc/hyperai/managed",
  ]
}

/** Direktori tulis default updater: per pengguna, agar tidak butuh admin. */
export function userManagedDirectory(platform: NodeJS.Platform = process.platform) {
  return managedDirectories(platform)[0]
}
