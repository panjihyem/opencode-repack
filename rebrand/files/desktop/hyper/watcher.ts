import { open, stat } from "node:fs/promises"
import path from "node:path"

// F-04: folder ingest harus stabil sebelum file diproses. File yang masih ditulis
// (ukuran/mtime berubah di antara dua sampel) ditunda; file yang lenyap dilewati.
// ponytail: sampling berbasis polling, bukan fs.watch. Polling deterministik untuk
// diuji dan aman untuk OneDrive; fs.watch bisa diganti nanti tanpa ubah kontrak.

export type StabilityProbe = { size: number; mtime: number }
export type StabilityVerdict = { stable: boolean; reason: "ready" | "missing" | "growing" | "unreadable" }

/** Satu sampel; null = berkas tidak ada / tidak terbaca. */
export async function sample(file: string): Promise<StabilityProbe | null> {
  const info = await stat(file).catch(() => undefined)
  if (!info || !info.isFile()) return null
  return { size: info.size, mtime: info.mtimeMs }
}

export function compareSamples(before: StabilityProbe | null, after: StabilityProbe | null): StabilityVerdict {
  if (!before || !after) return { stable: false, reason: "missing" }
  if (before.size === 0) return { stable: false, reason: "growing" }
  if (before.size !== after.size || before.mtime !== after.mtime) return { stable: false, reason: "growing" }
  return { stable: true, reason: "ready" }
}

/** Tunggu sampai berkas sama pada dua sampel berturut-turut, atau batas tercapai. */
export async function waitStable(file: string, options: { intervalMs?: number; attempts?: number } = {}): Promise<StabilityVerdict> {
  const intervalMs = Math.max(1, options.intervalMs ?? 250)
  const attempts = Math.max(1, options.attempts ?? 8)
  let before = await sample(file)
  for (let i = 0; i < attempts; i++) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
    const after = await sample(file)
    const verdict = compareSamples(before, after)
    if (verdict.stable) return verdict
    if (verdict.reason === "missing") return verdict
    before = after
  }
  return { stable: false, reason: "growing" }
}

/** File bisa dibaca penuh? Deteksi file terkunci/terpotong sebelum ingest. */
export async function canReadFully(file: string) {
  const handle = await open(file, "r").catch(() => undefined)
  if (!handle) return false
  try {
    const info = await handle.stat()
    const buffer = Buffer.alloc(Math.min(info.size, 4096))
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, Math.max(0, info.size - buffer.length))
    return info.size === 0 || bytesRead > 0
  } catch {
    return false
  } finally {
    await handle.close().catch(() => {})
  }
}

/** Ekstensi yang diizinkan untuk auto-ingest; harus sejalan dengan daftar di knowledge.ts. */
export const WATCH_EXTENSIONS = new Set([".pdf", ".docx", ".doc", ".pptx", ".xlsx", ".csv", ".txt", ".md", ".rtf", ".html", ".png", ".jpg", ".jpeg"])

export function isWatchable(file: string) {
  return WATCH_EXTENSIONS.has(path.extname(file).toLowerCase()) && !path.basename(file).startsWith("~$") && !path.basename(file).startsWith(".")
}
