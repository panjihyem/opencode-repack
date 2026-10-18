import { chmod, cp, mkdir, readdir, rm, stat } from "node:fs/promises"
import path from "node:path"
import { download } from "./download"
import { executable, uvAsset } from "./platform"
import { run } from "./process"
import type { Report } from "./process"

async function findFile(dir: string, name: string): Promise<string | undefined> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isFile() && entry.name === name) return full
    if (entry.isDirectory()) {
      const nested = await findFile(full, name)
      if (nested) return nested
    }
  }
  return undefined
}

/**
 * Makes uv available under <root>/uv and returns its path. Every Python component
 * (Hindsight, Docling) shares this bootstrap, so uv is only downloaded once.
 */
export async function ensureUv(root: string, report: Report) {
  const uv = path.join(root, "uv", executable("uv"))
  if (await stat(uv).catch(() => undefined)) return uv
  const asset = uvAsset(process.platform, process.arch)
  if (!asset) throw new Error(`uv is not available for ${process.platform}/${process.arch}`)
  report("Downloading uv", 0.02)
  const archive = path.join(root, asset.file)
  await download(asset.url, archive)
  const extract = path.join(root, "uv-extract")
  await rm(extract, { recursive: true, force: true })
  await mkdir(extract, { recursive: true })
  // bsdtar ships with Windows 10+, macOS and most Linux distributions and reads both formats.
  await run("tar", ["-xf", archive, "-C", extract])
  const found = await findFile(extract, executable("uv"))
  if (!found) throw new Error("uv binary not found in archive")
  await mkdir(path.dirname(uv), { recursive: true })
  await cp(found, uv)
  await chmod(uv, 0o755)
  await rm(extract, { recursive: true, force: true })
  await rm(archive, { force: true })
  return uv
}
