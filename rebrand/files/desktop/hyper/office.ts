import { createHash } from "node:crypto"
import { copyFile, mkdir, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import { FORENSIC_SOURCE } from "./forensic"
import { manifest } from "./manifest"
import { executable } from "./platform"
import { run } from "./process"
import type { Report } from "./process"
import { ensureUv } from "./uv"

const office = manifest.office

/** Root of the shipped bundle (resources/hyper-bundle). */
const bundleRoot = () => process.env.HYPER_AI_BUNDLE_ROOT ?? path.join(process.resourcesPath, "hyper-bundle")

export const officeRoot = (dataDir: string) => path.join(dataDir, "office")
const venvBin = (root: string) => path.join(root, "venv", process.platform === "win32" ? "Scripts" : "bin")
const pythonBinary = (root: string) => path.join(venvBin(root), executable("python"))
// The marker name follows the package list, so bumping a dep triggers a reinstall.
const marker = (root: string) =>
  path.join(root, `installed-${createHash("sha256").update(office.packages.join(",")).digest("hex").slice(0, 8)}`)

export const officeInstalled = (dataDir: string) =>
  Promise.all([stat(marker(officeRoot(dataDir))).catch(() => undefined), stat(pythonBinary(officeRoot(dataDir))).catch(() => undefined)]).then(
    ([m, py]) => Boolean(m && py),
  )

/**
 * Installs the office toolkit into an isolated Python environment: reading and
 * writing Excel (with formula parsing), Word, PowerPoint, PDF and charts, fully
 * local. Data never leaves the machine — sensitive case files included.
 */
export async function installOffice(dataDir: string, report: Report) {
  const root = officeRoot(dataDir)
  await mkdir(root, { recursive: true })
  const uv = await ensureUv(root, report)

  report("Creating Python environment", 0.1)
  await run(uv, ["venv", "--python", office.python, path.join(root, "venv")])
  report("Installing Excel/Word/PDF/chart libraries (this takes a few minutes)", 0.3)
  const python = pythonBinary(root)
  await run(uv, ["pip", "install", "--python", python, ...office.packages])
  await writeForensicModule(root)
  await writeCaseModule(root)
  await writeFile(marker(root), new Date().toISOString())
}

/** Managed copy of the forensic CLI (DuckDB/NetworkX/openpyxl) next to the venv. */
async function writeForensicModule(root: string) {
  const target = path.join(forensicRoot(root), "forensic.py")
  await mkdir(forensicRoot(root), { recursive: true })
  await writeFile(target, FORENSIC_SOURCE)
}

/**
 * Copies the recurring-case module next to the forensic CLI. The Python files
 * travel inside the app bundle (resources/hyper-bundle/office/lib/case), so
 * there is a single source of truth for them.
 */
async function writeCaseModule(root: string) {
  const source = path.join(bundleRoot(), "office", "lib", "case")
  const target = path.join(forensicRoot(root), "case")
  await mkdir(target, { recursive: true })
  await Promise.all(
    ["case.py", "cli.py", "pseudonym.py", "casemode.py"].map((name) =>
      copyFile(path.join(source, name), path.join(target, name)),
    ),
  )
}

export const forensicRoot = (root: string) => path.join(root, "lib")
/** Absolute path of forensic.py for skills and shell use. */
export const forensicModule = (dataDir: string) => path.join(forensicRoot(officeRoot(dataDir)), "forensic.py")
/** Absolute path of the recurring-case CLI for skills and shell use. */
export const caseModule = (dataDir: string) => path.join(forensicRoot(officeRoot(dataDir)), "case", "cli.py")

/** Same Python the office libraries live in, for skills and shell use. */
export const officePython = (dataDir: string) => pythonBinary(officeRoot(dataDir))
