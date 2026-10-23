/**
 * Pemeriksa config OTA: unduh bundle + tanda tangan dari GitHub Releases, terapkan
 * lewat `managed-apply` (verifikasi, anti-rollback, rollout, enkripsi rahasia).
 *
 * Tidak menyentuh Electron: pemanggil memberi `appVersion`, `dir`, dan `fetch`.
 */
import fs from "node:fs"
import path from "node:path"
import { applyBundle, BUNDLE_FILE, SIGNATURE_FILE, readState, type ApplyResult } from "./managed-apply.js"
import type { Channel } from "./managed-bundle.js"

export interface UpdaterOptions {
  readonly dir: string
  readonly channel: Channel
  readonly appVersion: string
  readonly publicKey: string
  readonly allowedPackages: readonly string[]
  /** Token pendaftaran organisasi; bila kosong dibaca dari `<dir>/enrollment`. */
  readonly enrollment?: string
  /** Folder aset rilis. Default: GitHub Releases tag `config-<channel>`. */
  readonly baseUrl?: string
  readonly fetch?: typeof fetch
  /** Default 6 jam. */
  readonly intervalMs?: number
  readonly now?: () => Date
  readonly log?: (message: string, detail?: Record<string, unknown>) => void
}

export interface CheckResult {
  readonly status: "applied" | "up-to-date" | "skipped" | "error"
  readonly reason: string
  readonly version?: number
}

export function releaseBaseUrl(channel: Channel) {
  return `https://github.com/panjihyem/opencode-repack/releases/download/config-${channel}`
}

interface Cache {
  readonly etag?: string
  readonly version?: number
}

export async function checkForConfigUpdate(options: UpdaterOptions): Promise<CheckResult> {
  const base = (options.baseUrl ?? releaseBaseUrl(options.channel)).replace(/\/+$/, "")
  const request = options.fetch ?? fetch
  const log = options.log ?? (() => {})
  const cacheFile = path.join(options.dir, `etag-${options.channel}.json`)
  const cache = readCache(cacheFile)

  let bundleResponse: Response
  try {
    bundleResponse = await request(`${base}/bundle.json`, {
      headers: cache.etag ? { "If-None-Match": cache.etag } : {},
      redirect: "follow",
    })
  } catch (error) {
    return { status: "error", reason: `gagal mengunduh: ${(error as Error).message}` }
  }
  if (bundleResponse.status === 304) return { status: "up-to-date", reason: "304 not modified", version: cache.version }
  if (!bundleResponse.ok) return { status: "error", reason: `HTTP ${bundleResponse.status} pada bundle` }

  const bundleBytes = new Uint8Array(await bundleResponse.arrayBuffer())
  const signatureResponse = await request(`${base}/bundle.json.sig`, { redirect: "follow" })
  if (!signatureResponse.ok) return { status: "error", reason: `HTTP ${signatureResponse.status} pada tanda tangan` }
  const signature = (await signatureResponse.text()).trim()
  const enrollment = options.enrollment ?? readFile(path.join(options.dir, "enrollment"))

  const result: ApplyResult = applyBundle({
    dir: options.dir,
    bundleBytes,
    signature,
    publicKey: options.publicKey,
    allowedPackages: options.allowedPackages,
    appVersion: options.appVersion,
    enrollment,
    now: options.now?.(),
  })
  log("config update checked", { status: result.reason, version: result.version })

  if (!result.applied) {
    if (result.reason === "tanda tangan tidak valid") return { status: "error", reason: result.reason }
    return { status: "skipped", reason: result.reason, version: result.version }
  }
  writeCache(cacheFile, { etag: bundleResponse.headers.get("etag") ?? undefined, version: result.version })
  return { status: "applied", reason: result.reason, version: result.version }
}

/** Jalankan sekali saat start lalu berkala (default 6 jam, jitter 0-10%). */
export function startConfigUpdater(options: UpdaterOptions) {
  const interval = options.intervalMs ?? 6 * 60 * 60 * 1000
  let timer: ReturnType<typeof setTimeout> | undefined
  let stopped = false

  const schedule = () => {
    if (stopped) return
    const jitter = Math.floor(interval * 0.1 * Math.random())
    timer = setTimeout(run, interval + jitter)
    timer.unref?.()
  }
  const run = () => {
    if (stopped) return
    checkForConfigUpdate(options)
      .catch((error) => options.log?.("config update failed", { error: String(error) }))
      .finally(schedule)
  }
  run()
  return {
    check: () => checkForConfigUpdate(options),
    stop: () => {
      stopped = true
      if (timer) clearTimeout(timer)
    },
  }
}

export function managedState(dir: string) {
  return { state: readState(dir), files: { bundle: path.join(dir, BUNDLE_FILE), signature: path.join(dir, SIGNATURE_FILE) } }
}

function readCache(file: string): Cache {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf-8"))
    return typeof parsed === "object" && parsed ? parsed : {}
  } catch {
    return {}
  }
}

function writeCache(file: string, value: Cache) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(value, null, 2))
}

function readFile(file: string) {
  try {
    return fs.readFileSync(file, "utf-8").trim() || undefined
  } catch {
    return undefined
  }
}
