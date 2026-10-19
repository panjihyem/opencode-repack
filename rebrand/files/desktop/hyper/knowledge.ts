import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { manifest } from "./manifest"

// The "master brain": every Hyper AI project and session shares a local
// knowledge tree. Dropping files under general/ makes them searchable through
// the memory server in all sessions; each folder under projects/ gets its own
// memory bank. Hindsight parses the documents itself, so no extra tooling is
// needed on the user's machine.

const SUPPORTED = new Set([".pdf", ".docx", ".doc", ".pptx", ".xlsx", ".csv", ".txt", ".md", ".rtf", ".html", ".png", ".jpg", ".jpeg"])
const MAX_BYTES = 250e6

export type KnowledgeDirs = { root: string; generalRoot: string; projectsRoot: string; manifestFile: string }

export const knowledgeRoot = () => path.join(os.homedir(), "Hyper-Knowledge")
/** Exposed for the standalone `hyper` CLI in the bundle (see files/desktop/cli). */
export const hindsightApiRoot = () => api()
const api = () => `http://${manifest.hindsight.host}:${manifest.hindsight.port}/v1/default`

/** Creates the folder skeleton. Idempotent; nothing user-authored is touched. */
export async function ensureKnowledgeFolders(): Promise<KnowledgeDirs> {
  const root = knowledgeRoot()
  const generalRoot = path.join(root, "general")
  for (const dir of [
    path.join(generalRoot, "regulasi"),
    path.join(generalRoot, "putusan"),
    path.join(generalRoot, "template"),
    path.join(generalRoot, "umum"),
    path.join(root, "projects"),
    path.join(root, "ingest"),
  ])
    await mkdir(dir, { recursive: true })
  return { root, generalRoot, projectsRoot: path.join(root, "projects"), manifestFile: path.join(root, "ingest-manifest.json") }
}

type Manifest = { files: Record<string, { size: number; mtime: number; bank: string }> }
type SyncResult = { ingested: string[]; failed: string[]; skipped: number; banks: string[] }

const readManifest = (file: string) =>
  readFile(file, "utf8")
    .then<Manifest>((text) => JSON.parse(text))
    .catch((): Manifest => ({ files: {} }))

async function ensureBank(bank: string, mission: string) {
  const response = await fetch(`${api()}/banks/${encodeURIComponent(bank)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: bank, mission }),
  })
  if (!response.ok && response.status !== 409) throw new Error(`bank ${bank}: ${response.status}`)
}

async function retainFile(bank: string, file: string, context: string, tags: string[]) {
  // Ingestion runs asynchronously inside the memory server, under the local
  // tiered model, so a large drop-in does not stall the app.
  const form = new FormData()
  const bytes = await readFile(file)
  form.append("files", new Blob([new Uint8Array(bytes)]), path.basename(file))
  form.append("request", JSON.stringify({ files_metadata: [{ context, tags }] }))
  const response = await fetch(`${api()}/banks/${encodeURIComponent(bank)}/files/retain`, { method: "POST", body: form })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json() as Promise<{ operation_ids?: string[] }>
}

/**
 * Walks the tree, compares against ingest-manifest.json and sends everything
 * new or changed into the memory server; also creates a bank per project
 * folder. Safe to run on every app start — unchanged files are skipped.
 */
export async function syncKnowledge(log?: (message: string) => void): Promise<SyncResult> {
  const dirs = await ensureKnowledgeFolders()
  const state = await readManifest(dirs.manifestFile)
  const result: SyncResult = { ingested: [], failed: [], skipped: 0, banks: [] }

  await ensureBank("general", "Pengetahuan umum lintas project: regulasi, putusan, template, referensi kerja kantor.")
  result.banks.push("general")

  const next: Manifest["files"] = { ...state.files }

  const bases: Array<[string, string]> = [[dirs.generalRoot, "general"]]
  // A new project folder gets its own bank the next time the app runs.
  const projectsHere = (await readdir(dirs.projectsRoot, { withFileTypes: true }).catch(() => [])).filter((entry) => entry.isDirectory())
  for (const entry of projectsHere) {
    const slug = entry.name
    const bank = `project:${slug}`
    await ensureBank(bank, `Project ${slug}: data, catatan, dan temuan tahap kerja.`)
    result.banks.push(bank)
    bases.push([path.join(dirs.projectsRoot, slug), bank])
  }

  const walk = async (baseKind: string, dir: string, bank: string): Promise<void> => {
    for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(baseKind, full, bank)
        continue
      }
      if (!SUPPORTED.has(path.extname(entry.name).toLowerCase())) continue
      const info = await stat(full).catch(() => undefined)
      if (!info || info.size > MAX_BYTES || info.size === 0) continue
      const prior = state.files[full]
      if (prior && prior.size === info.size && prior.mtime === info.mtimeMs) {
        result.skipped++
        continue
      }
      const scopeDir = bank === "general" ? dirs.generalRoot : dirs.projectsRoot
      const scope = path.relative(scopeDir, path.dirname(full)).split(path.sep)[0] || "umum"
      const context = bank === "general" ? "pengetahuan umum" : `project:${scope}`
      const tags = [bank === "general" ? `knowledge:${scope}` : `project:${scope}`]
      try {
        await retainFile(bank, full, context, tags)
        next[full] = { size: info.size, mtime: info.mtimeMs, bank }
        result.ingested.push(full)
        log?.(`ingest ${full} -> ${bank} (${tags[0]})`)
      } catch (error) {
        result.failed.push(full)
        log?.(`ingest gagal ${full}: ${error instanceof Error ? error.message : error}`)
      }
    }
  }
  for (const [base, bank] of bases) await walk(bank, base, bank)

  await writeFile(dirs.manifestFile, JSON.stringify({ files: next }, null, 2))
  return result
}

const MANAGED = "HYPER_AI_MANAGED"

/** Registers the skill that tells the agent where knowledge lives and how to use it. */
export async function applyKnowledgeSkill(configDir: string) {
  const dir = path.join(configDir, "skill", "hyper-knowledge")
  const file = path.join(dir, "SKILL.md")
  const existing = await readFile(file, "utf8").catch(() => undefined)
  if (existing && !existing.includes(MANAGED)) return "kept" as const
  const root = knowledgeRoot()
  const body = `---
name: hyper-knowledge
description: Folder pengetahuan bersama (master brain) di ${root}; mencari regulasi/putusan/template yang sudah di-ingest via MCP mem, dan menata dokumen project. Gunakan sebelum menjawab pertanyaan aturan atau prosedur kerja.
---

# Folder Pengetahuan (Hyper AI)

\`${MANAGED}\`

## Struktur

- \`general/regulasi\` — UU, PP, PMK, PER, SE dan dokumen aturan lain
- \`general/putusan\` — yurisprudensi dan preseden
- \`general/template\` — templat dokumen kerja (BAP, LHP, surat, form)
- \`general/umum\` — referensi umum lain
- \`projects/<nama>\` — folder project; tiap folder memakai bank memori \`project:<nama>\`

## Cara kerja

- Berkas yang di-drop ke folder ini di-ingest otomatis (app memindai setiap
  mulai) dan menjadi fakta di memori; tidak perlu memproses ulang manual.
- Sebelum menjawab pertanyaan regulasi/prosedur: cari lewat MCP \`mem\`
  (bank \`general\`, tag \`knowledge:<subfolder>\`) — jawab HANYA dari fakta yang
  ditemukan, sebut sumbernya (berkas + kutipan). Bila tak ditemukan, katakan
  tidak ada di pengetahuan lokal dan minta berkasnya.
- Untuk dokumen project user: tinggal simpan di folder project-nya.
- Bila user minta menambah/memperbarui pengetahuan: pastikan berkas berada di
  folder yang tepat, kemudian biarkan pipeline yang bekerja.
`
  await mkdir(dir, { recursive: true })
  await writeFile(file, body)
  return "written" as const
}
