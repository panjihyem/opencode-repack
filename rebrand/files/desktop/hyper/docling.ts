import { mkdir, readFile, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import { manifest } from "./manifest"
import { executable } from "./platform"
import { run } from "./process"
import type { Report } from "./process"
import { ensureUv } from "./uv"

const docling = manifest.docling

export const doclingRoot = (dataDir: string) => path.join(dataDir, "docling")
const venvBin = (root: string) => path.join(root, "venv", process.platform === "win32" ? "Scripts" : "bin")
const cliBinary = (root: string) => path.join(venvBin(root), executable("docling"))
const marker = (root: string) => path.join(root, `installed-${docling.version}`)

/** Same marker style as Hindsight; also require the CLI binary to exist. */
export const doclingInstalled = (dataDir: string) =>
  Promise.all([stat(marker(doclingRoot(dataDir))).catch(() => undefined), stat(cliBinary(doclingRoot(dataDir))).catch(() => undefined)]).then(
    ([m, cli]) => Boolean(m && cli),
  )

/**
 * Installs the Docling document converter into an isolated Python environment:
 * PDF/scans/images become structured Markdown (tables, layout, plus OCR) fully
 * offline. OCR model files are fetched by Docling itself on first use and then
 * cached under the user's cache directory.
 */
export async function installDocling(dataDir: string, report: Report) {
  const root = doclingRoot(dataDir)
  await mkdir(root, { recursive: true })
  const uv = await ensureUv(root, report)

  report("Creating Python environment", 0.1)
  await run(uv, ["venv", "--python", docling.python, path.join(root, "venv")])
  report("Installing Docling (this takes a few minutes)", 0.25)
  const python = path.join(venvBin(root), executable("python"))
  await run(uv, ["pip", "install", "--python", python, "--torch-backend", "cpu", `${docling.package}==${docling.version}`])
  await writeFile(marker(root), new Date().toISOString())
}

/** Marks entries this module owns so a user-authored skill is never replaced. */
const MANAGED = "HYPER_AI_MANAGED"

/** Registers a skill so the agent knows how to turn documents into Markdown (and generate its own). */
export async function applyDocSkill(configDir: string, dataDir: string) {
  const root = doclingRoot(dataDir)
  const dir = path.join(configDir, "skill", "hyper-doc")
  const file = path.join(dir, "SKILL.md")
  const existing = await readFile(file, "utf8").catch(() => undefined)
  if (existing && !existing.includes(MANAGED)) return "kept" as const
  if (!existing && !(await stat(cliBinary(root)).catch(() => undefined))) return "skipped" as const
  const cli = cliBinary(root)
  const body = `---
name: hyper-doc
description: Mengubah PDF/scan/gambar menjadi Markdown terstruktur dengan Docling (OCR lokal, offline) dan membuat dokumen baru. Gunakan saat user meminta membaca atau mengekstrak dokumen, atau membuat dokumen.
---

# Dokumen (Hyper AI)

\`${MANAGED}\`

## Ekstraksi (PDF, scan, gambar)

Jalankan converter Docling lokal via shell:

\`\`\`
\`${cli}\` convert --output <folder-tujuan> --to md <berkas-atau-wildcard>
\`\`\`

- \`convert\` memakai \`--output\` untuk folder tujuan (bukan \`--output-dir\`), dan \`--to md\` untuk Markdown.
- Output default Markdown per berkas, tabel diekstrak, layout dipertahankan.
- OCR berjalan offline untuk hasil scan (RapidOCR lokal; model diunduh sekali lalu tersimpan cache).
- Untuk banyak halaman/berkas: kerangkum hasil teks terlebih dahulu, jangan menempel SELURUH berkas ke konteks.

## Pembuatan dokumen

- Tulis langsung Markdown/DOCX via shell; pakai hasil ekstraksi sebagai bahan data.
- Model chat remote gratisan atau lokal LM Studio keduanya bisa dipakai; untuk dokumen kerahasiaan tinggi lebih baik pakai model lokal.
`
  await mkdir(dir, { recursive: true })
  await writeFile(file, body)
  return "written" as const
}
