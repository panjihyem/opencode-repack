import assert from "node:assert/strict"
import { mkdtemp, rm, writeFile, appendFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { canReadFully, compareSamples, isWatchable, sample, waitStable } from "./watcher"

// F-04: debounce/stability check untuk watch-folder ingest.

assert.equal(isWatchable("catatan.md"), true)
assert.equal(isWatchable("LAPORAN.PDF"), true)
assert.equal(isWatchable("~$laporan.docx"), false, "file lock Office harus dilewati")
assert.equal(isWatchable(".gitkeep"), false, "file tersembunyi harus dilewati")
assert.equal(isWatchable("skrip.exe"), false, "ekstensi tidak didukung harus dilewati")
assert.equal(isWatchable("tanpa-ekstensi"), false)

assert.deepEqual(compareSamples({ size: 10, mtime: 100 }, { size: 10, mtime: 100 }), { stable: true, reason: "ready" })
assert.deepEqual(compareSamples({ size: 10, mtime: 100 }, { size: 12, mtime: 200 }), { stable: false, reason: "growing" })
assert.deepEqual(compareSamples({ size: 10, mtime: 100 }, { size: 10, mtime: 200 }), { stable: false, reason: "growing" })
assert.deepEqual(compareSamples({ size: 0, mtime: 100 }, { size: 0, mtime: 100 }), { stable: false, reason: "growing" }, "file kosong belum siap")
assert.deepEqual(compareSamples(null, { size: 10, mtime: 100 }), { stable: false, reason: "missing" })
assert.deepEqual(compareSamples({ size: 10, mtime: 100 }, null), { stable: false, reason: "missing" })

const root = await mkdtemp(path.join(os.tmpdir(), "hyper-watcher-"))
try {
  const stableFile = path.join(root, "stabil.md")
  await writeFile(stableFile, "# selesai\n")
  assert.deepEqual(await waitStable(stableFile, { intervalMs: 20, attempts: 3 }), { stable: true, reason: "ready" })
  assert.equal(await canReadFully(stableFile), true)

  const missingFile = path.join(root, "hilang.md")
  assert.deepEqual(await waitStable(missingFile, { intervalMs: 20, attempts: 3 }), { stable: false, reason: "missing" })

  // File yang terus bertambah harus dinyatakan belum stabil.
  const growingFile = path.join(root, "tumbuh.md")
  await writeFile(growingFile, "a")
  const ticker = setInterval(() => { appendFile(growingFile, "x".repeat(64)).catch(() => {}) }, 15)
  let verdict
  try { verdict = await waitStable(growingFile, { intervalMs: 20, attempts: 5 }) } finally { clearInterval(ticker) }
  assert.equal(verdict.stable, false, "file yang sedang ditulis tidak boleh dianggap stabil")
  assert.equal(verdict.reason, "growing")

  // File kosong tidak pernah stabil.
  const emptyFile = path.join(root, "kosong.md")
  await writeFile(emptyFile, "")
  assert.equal((await waitStable(emptyFile, { intervalMs: 10, attempts: 2 })).stable, false)
  assert.equal((await sample(emptyFile))?.size, 0)
  assert.equal(await canReadFully(emptyFile), true, "file kosong terbaca, ditolak oleh aturan ukuran di gate")

  console.log("watcher F-04: PASS")
} finally {
  await rm(root, { recursive: true, force: true })
}
