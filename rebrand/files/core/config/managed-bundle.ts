/**
 * Config OTA: bundle bertanda tangan + rahasia terenkripsi.
 *
 * Modul ini sengaja bebas dari Effect/Electron agar bisa diuji langsung dengan Node
 * (`node control/selftest.mjs`). Semua keputusan keamanan ada di sini:
 * - tanda tangan Ed25519 wajib valid sebelum bundle dipakai;
 * - config ditolak bila memuat jalan eksekusi kode (plugins, skills URL, MCP lokal);
 * - rahasia hanya boleh mengisi `providers.<id>.settings.apiKey`;
 * - anti-rollback: versi harus lebih tinggi dari yang sudah terpasang.
 */
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createPrivateKey,
  createPublicKey,
  hkdfSync,
  randomBytes,
  sign,
  verify,
} from "node:crypto"

export type Channel = "stable" | "beta" | "canary"

export interface Envelope {
  readonly v: 1
  readonly kdf: "hkdf-sha256"
  readonly salt: string
  readonly iv: string
  readonly tag: string
  readonly ct: string
}

export interface Bundle {
  readonly version: number
  readonly channel: Channel
  readonly minAppVersion?: string
  readonly issuedAt?: string
  /** 0-100; install memakai hash(installId + versi) untuk rollout bertahap. */
  readonly rollout?: number
  readonly config: Record<string, unknown>
  readonly secrets?: Envelope | null
}

const INFO = "hyper-config-secrets-v1"
export const MAX_BUNDLE_BYTES = 2 * 1024 * 1024

/** Top-level yang boleh datang dari pusat. Sisanya ditolak (bukan diabaikan diam-diam). */
const ALLOWED_TOP = new Set([
  "model",
  "default_agent",
  "agents",
  "providers",
  "policies",
  "permissions",
  "compaction",
  "websearch",
  "tool_output",
  "watcher",
  "media",
  "share",
  "update",
])

/**
 * Config pusat tidak boleh menjadi jalur eksekusi kode. `formatter` dan `lsp` sengaja
 * tidak diizinkan karena keduanya membawa `command: string[]` yang dijalankan proses.
 */
const FORBIDDEN_TOP = new Set([
  "plugins",
  "skills",
  "instructions",
  "commands",
  "mcp",
  "references",
  "experimental",
  "formatter",
  "lsp",
])

/** Kunci objek yang bisa mengubah prototipe saat di-merge. */
const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"])

/** Nilai rahasia hanya boleh berupa rujukan env, bukan string literal. */
const ENV_REF = /^\{env:[A-Za-z_][A-Za-z0-9_]*\}$/
const SECRET_HEADER = /authorization|cookie|x-api-key|api-key|token|secret|password/i

/** Header bernama sensitif tidak boleh membawa nilai literal (akan ikut terbit di repo/release). */
function checkHeaders(value: unknown, path: string, problems: string[]) {
  if (value === undefined) return
  if (!isRecord(value)) {
    problems.push(`${path} wajib objek`)
    return
  }
  for (const [name, header] of Object.entries(value)) {
    if (UNSAFE_KEYS.has(name)) problems.push(`${path}.${name} tidak diizinkan`)
    if (typeof header === "string" && SECRET_HEADER.test(name) && !ENV_REF.test(header))
      problems.push(`${path}.${name} hanya boleh {env:NAMA} atau lewat secrets terenkripsi`)
  }
}

export class BundleError extends Error {}

function b64decode(value: string): Buffer {
  return Buffer.from(value, "base64")
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex")
}

/** Tanda tangan memakai byte mentah bundle (persis seperti yang dipublikasikan). */
export function signBundle(bundleBytes: Uint8Array, privateKeyB64: string): string {
  const key = createPrivateKey({ key: b64decode(privateKeyB64), format: "der", type: "pkcs8" })
  return sign(null, bundleBytes, key).toString("base64")
}

export function verifyBundle(bundleBytes: Uint8Array, signatureB64: string, publicKeyB64: string): boolean {
  if (bundleBytes.byteLength > MAX_BUNDLE_BYTES) return false
  try {
    const key = createPublicKey({ key: b64decode(publicKeyB64), format: "der", type: "spki" })
    return verify(null, bundleBytes, key, b64decode(signatureB64))
  } catch {
    return false
  }
}

export function decodeBundle(bundleBytes: Uint8Array): Bundle {
  if (bundleBytes.byteLength > MAX_BUNDLE_BYTES) throw new BundleError("bundle terlalu besar")
  let parsed: unknown
  try {
    parsed = JSON.parse(Buffer.from(bundleBytes).toString("utf-8"))
  } catch {
    throw new BundleError("bundle bukan JSON valid")
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new BundleError("bundle bukan objek")
  const bundle = parsed as Record<string, unknown>
  if (typeof bundle.version !== "number" || !Number.isInteger(bundle.version) || bundle.version < 1)
    throw new BundleError("version wajib bilangan bulat >= 1")
  if (bundle.channel !== "stable" && bundle.channel !== "beta" && bundle.channel !== "canary")
    throw new BundleError("channel tidak dikenal")
  if (!bundle.config || typeof bundle.config !== "object" || Array.isArray(bundle.config))
    throw new BundleError("config wajib objek")
  if (bundle.rollout !== undefined && (typeof bundle.rollout !== "number" || bundle.rollout < 0 || bundle.rollout > 100))
    throw new BundleError("rollout harus 0-100")
  if (bundle.secrets !== undefined && bundle.secrets !== null) assertEnvelope(bundle.secrets)
  return bundle as unknown as Bundle
}

function assertEnvelope(value: unknown): asserts value is Envelope {
  if (!value || typeof value !== "object") throw new BundleError("secrets bukan envelope")
  const env = value as Record<string, unknown>
  if (env.v !== 1 || env.kdf !== "hkdf-sha256") throw new BundleError("envelope versi/kdf tidak didukung")
  for (const field of ["salt", "iv", "tag", "ct"]) {
    if (typeof env[field] !== "string" || !env[field]) throw new BundleError(`envelope.${field} kosong`)
  }
}

/** Validasi isi config pusat: tolak yang tidak dikenal dan seluruh jalur eksekusi kode. */
export function checkConfig(config: Record<string, unknown>, allowedPackages?: readonly string[]) {
  const problems: string[] = []
  for (const key of Object.keys(config)) {
    if (FORBIDDEN_TOP.has(key)) problems.push(`"${key}" tidak diizinkan dari config pusat`)
    else if (!ALLOWED_TOP.has(key)) problems.push(`"${key}" bukan kunci yang dikenal`)
  }
  const providers = config.providers
  if (providers !== undefined) {
    if (!providers || typeof providers !== "object" || Array.isArray(providers)) problems.push("providers wajib objek")
    else {
      for (const [id, raw] of Object.entries(providers as Record<string, unknown>)) {
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
          problems.push(`providers.${id} wajib objek`)
          continue
        }
        const provider = raw as Record<string, unknown>
        for (const key of Object.keys(provider)) {
          if (UNSAFE_KEYS.has(key)) problems.push(`providers.${id}.${key} tidak diizinkan`)
        }
        if (provider.package !== undefined) {
          if (typeof provider.package !== "string" || !allowedPackages?.includes(provider.package))
            problems.push(`providers.${id}.package tidak ada di allowlist`)
        }
        if (provider.settings !== undefined && (typeof provider.settings !== "object" || Array.isArray(provider.settings)))
          problems.push(`providers.${id}.settings wajib objek`)
        // Rahasia wajib lewat amplop terenkripsi: config ini di-commit dan dipublikasikan.
        if (isRecord(provider.settings)) {
          for (const key of ["apiKey", "authorization"]) {
            const value = provider.settings[key]
            if (typeof value === "string" && !ENV_REF.test(value))
              problems.push(`providers.${id}.settings.${key} hanya boleh {env:NAMA} atau lewat secrets terenkripsi`)
          }
        }
        checkHeaders(provider.headers, `providers.${id}.headers`, problems)
        if (isRecord(provider.settings)) checkHeaders(provider.settings.headers, `providers.${id}.settings.headers`, problems)
        // `models.<id>.package` juga specifier impor (model resolver menjalankan npm add + import).
        if (provider.models !== undefined) {
          if (!isRecord(provider.models)) problems.push(`providers.${id}.models wajib objek`)
          else {
            for (const [modelID, rawModel] of Object.entries(provider.models)) {
              if (UNSAFE_KEYS.has(modelID)) {
                problems.push(`providers.${id}.models.${modelID} tidak diizinkan`)
                continue
              }
              if (!isRecord(rawModel)) continue
              for (const key of Object.keys(rawModel)) {
                if (UNSAFE_KEYS.has(key)) problems.push(`providers.${id}.models.${modelID}.${key} tidak diizinkan`)
              }
              checkHeaders(rawModel.headers, `providers.${id}.models.${modelID}.headers`, problems)
              const pkg = rawModel.package
              if (pkg !== undefined && (typeof pkg !== "string" || !allowedPackages?.includes(pkg)))
                problems.push(`providers.${id}.models.${modelID}.package tidak ada di allowlist`)
            }
          }
        }
      }
    }
  }
  return { ok: problems.length === 0, problems }
}

/** Hanya apiKey yang boleh masuk dari rahasia terenkripsi. */
export function secretsToConfig(secrets: Record<string, unknown>): Record<string, unknown> {
  const providers = secrets.providers
  if (!providers || typeof providers !== "object" || Array.isArray(providers)) return {}
  const out: Record<string, unknown> = {}
  for (const [id, raw] of Object.entries(providers as Record<string, unknown>)) {
    if (!/^[A-Za-z0-9._-]+$/.test(id)) continue
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue
    const settings = (raw as Record<string, unknown>).settings
    if (!settings || typeof settings !== "object" || Array.isArray(settings)) continue
    const apiKey = (settings as Record<string, unknown>).apiKey
    if (typeof apiKey === "string" && apiKey.length > 0) out[id] = { settings: { apiKey } }
  }
  return { providers: out }
}

export function encryptSecrets(secrets: Record<string, unknown>, enrollment: string): Envelope {
  const salt = randomBytes(16)
  const iv = randomBytes(12)
  const key = deriveKey(enrollment, salt)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  const ct = Buffer.concat([cipher.update(Buffer.from(JSON.stringify(secrets), "utf-8")), cipher.final()])
  return {
    v: 1,
    kdf: "hkdf-sha256",
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ct: ct.toString("base64"),
  }
}

export function decryptSecrets(envelope: Envelope, enrollment: string): Record<string, unknown> {
  assertEnvelope(envelope)
  const key = deriveKey(enrollment, b64decode(envelope.salt))
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, b64decode(envelope.iv))
    decipher.setAuthTag(b64decode(envelope.tag))
    const plain = Buffer.concat([decipher.update(b64decode(envelope.ct)), decipher.final()])
    const parsed = JSON.parse(plain.toString("utf-8"))
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new BundleError("rahasia bukan objek")
    return parsed as Record<string, unknown>
  } catch (error) {
    if (error instanceof BundleError) throw error
    throw new BundleError("gagal mendekripsi rahasia: token pendaftaran salah atau data rusak")
  }
}

function deriveKey(secret: string, salt: Buffer): Buffer {
  return Buffer.from(hkdfSync("sha256", Buffer.from(secret, "utf-8"), salt, Buffer.from(INFO), 32))
}

/** Deep merge: nilai managed menang; array/primitive diganti utuh. */
export function mergeManaged<T>(base: T, managed: T): T {
  if (Array.isArray(base) || Array.isArray(managed)) return managed
  if (!isRecord(base) || !isRecord(managed)) return managed
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(base)) {
    if (!UNSAFE_KEYS.has(key)) out[key] = value
  }
  for (const [key, value] of Object.entries(managed)) {
    if (UNSAFE_KEYS.has(key)) throw new BundleError(`kunci ${key} tidak diizinkan`)
    const prev = out[key]
    out[key] = isRecord(prev) && isRecord(value) ? mergeManaged(prev, value) : value
  }
  return out as T
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

/** Rollout deterministik per instalasi: hasilnya stabil untuk installId+versi yang sama. */
export function inRollout(bundle: Bundle, installId: string): boolean {
  const percent = bundle.rollout ?? 100
  if (percent >= 100) return true
  if (percent <= 0) return false
  // Modulo 64-bit agar sebaran merata (byte pertama % 100 bias ke nilai rendah).
  const bucket = Number(createHash("sha256").update(`${installId}:${bundle.version}`).digest().readBigUInt64BE(0) % 100n)
  return bucket < percent
}

export function compareVersions(a: string, b: string): number {
  const pa = a.split(/[.+-]/).map((p) => Number.parseInt(p, 10) || 0)
  const pb = b.split(/[.+-]/).map((p) => Number.parseInt(p, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d > 0 ? 1 : -1
  }
  return 0
}

export interface GateInput {
  readonly bundle: Bundle
  readonly currentVersion?: number
  /** Versi yang pernah di-rollback: jangan dipasang lagi walau asetnya masih dipublikasikan. */
  readonly blockedVersion?: number
  readonly appVersion: string
  readonly installId: string
}

/** Keputusan terakhir sebelum menulis file: anti-rollback, minAppVersion, rollout. */
export function shouldApply(input: GateInput): { apply: boolean; reason: string } {
  if (input.currentVersion !== undefined && input.bundle.version <= input.currentVersion)
    return { apply: false, reason: `versi ${input.bundle.version} <= terpasang ${input.currentVersion}` }
  if (input.blockedVersion !== undefined && input.bundle.version <= input.blockedVersion)
    return { apply: false, reason: `versi ${input.bundle.version} <= versi rollback ${input.blockedVersion}` }
  if (input.bundle.minAppVersion && compareVersions(input.appVersion, input.bundle.minAppVersion) < 0)
    return { apply: false, reason: `butuh aplikasi >= ${input.bundle.minAppVersion}` }
  if (!inRollout(input.bundle, input.installId)) return { apply: false, reason: "belum masuk rollout" }
  return { apply: true, reason: "ok" }
}

/** Bundle lengkap siap tulis: config + rahasia (bila ada dan token tersedia). */
export function materialize(
  bundle: Bundle,
  enrollment: string | undefined,
  allowedPackages: readonly string[],
): Record<string, unknown> {
  const checked = checkConfig(bundle.config, allowedPackages)
  if (!checked.ok) throw new BundleError(`config pusat ditolak: ${checked.problems.join("; ")}`)
  if (!bundle.secrets) return bundle.config
  if (!enrollment) throw new BundleError("bundle memuat rahasia tetapi token pendaftaran belum diisi")
  const secrets = secretsToConfig(decryptSecrets(bundle.secrets, enrollment))
  return mergeManaged(bundle.config, secrets)
}
