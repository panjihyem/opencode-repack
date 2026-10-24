import { BrowserWindow } from "electron"
import type { IpcMain, App, dialog as Dialog, shell as Shell } from "electron"
import { createHash } from "node:crypto"
import { chmod, link, mkdir, mkdtemp, readFile, readdir, realpath, rm, stat } from "node:fs/promises"
import path from "node:path"
import { spawn } from "node:child_process"

type CaseItem = { id: string; title: string; description: string; templates: string[]; required: string[] }
type CaseStatus = { case_mode: boolean; enabled_at?: string }
type Runner = (python: string, args: string[], timeoutMs?: number) => Promise<{ stdout: string; stderr: string }>

const DATA_EXTENSIONS = new Set([".json"])

export class CaseUiError extends Error {}

function parseJson(text: string, label: string) {
  try {
    const value = JSON.parse(text)
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("expected object")
    return value as Record<string, unknown>
  } catch {
    throw new CaseUiError(`${label} bukan JSON object yang valid.`)
  }
}

function runPython(python: string, args: string[], timeoutMs = 120_000) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(python, args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] })
    let stdout = ""
    let stderr = ""
    const collect = (target: "stdout" | "stderr") => (chunk: Buffer) => {
      if (target === "stdout") stdout = (stdout + chunk.toString("utf8")).slice(-16_000)
      else stderr = (stderr + chunk.toString("utf8")).slice(-16_000)
    }
    child.stdout.on("data", collect("stdout"))
    child.stderr.on("data", collect("stderr"))
    const timer = setTimeout(() => child.kill(), timeoutMs)
    child.once("error", (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.once("close", (code) => {
      clearTimeout(timer)
      if (code === 0) resolve({ stdout, stderr })
      else reject(new CaseUiError(code === null ? "Proses dibatalkan." : "Hyper Case gagal. Periksa file kasus dan coba lagi."))
    })
  })
}

export async function listCases(cli: string, python: string, run: Runner = runPython): Promise<CaseItem[]> {
  const { stdout } = await run(python, [cli, "list", "--json"])
  const parsed = parseJson(stdout, "Daftar kasus")
  if (!Array.isArray(parsed.cases)) throw new CaseUiError("Daftar kasus tidak tersedia.")
  return parsed.cases.filter((item): item is CaseItem =>
    item && typeof item.id === "string" && typeof item.title === "string",
  )
}

export async function inspectParameter(cli: string, python: string, kind: string, file: string, run: Runner = runPython) {
  const { stdout } = await run(python, [cli, "validate", kind, "--data", file, "--json"])
  const report = parseJson(stdout, "Hasil pemeriksaan")
  return {
    valid: report.valid === true,
    missing: Array.isArray(report.field_wajib_kosong) ? report.field_wajib_kosong.filter((x) => typeof x === "string") : [],
    wrongType: Array.isArray(report.tipe_salah) ? report.tipe_salah.filter((x) => typeof x === "string") : [],
  }
}

export async function activateCaseMode(cli: string, python: string, run: Runner = runPython) {
  const { stdout } = await run(python, [cli, "mode", "on", "--json"])
  const result = parseJson(stdout, "Status mode kasus")
  if (result.case_mode !== true) throw new CaseUiError("Mode Kasus Secure belum aktif.")
  return { case_mode: true, blocked: Array.isArray(result.changed) ? result.changed : [] }
}

export async function deactivateCaseMode(cli: string, python: string, run: Runner = runPython) {
  const { stdout } = await run(python, [cli, "mode", "off", "--json"])
  const result = parseJson(stdout, "Status mode kasus")
  return { case_mode: result.case_mode === true }
}

export async function redactCase(
  cli: string,
  python: string,
  kind: string,
  source: string,
  outputDir: string,
  run: Runner = runPython,
) {
  const realSource = path.resolve(source)
  const realOutput = path.resolve(outputDir)
  const sourceStat = await stat(realSource).catch(() => undefined)
  if (!sourceStat?.isFile()) throw new CaseUiError("Pilih file parameter kasus yang tersedia.")
  if (!DATA_EXTENSIONS.has(path.extname(realSource).toLowerCase()))
    throw new CaseUiError("Untuk alur ini pilih parameter kasus JSON. PDF asli jangan dikirim ke chat.")
  const outputStat = await stat(realOutput).catch(() => undefined)
  if (!outputStat?.isDirectory()) throw new CaseUiError("Pilih folder hasil kosong yang tersedia.")
  const [sourceRealPath, outputRealPath] = await Promise.all([realpath(realSource), realpath(realOutput)])
  const sourceRelativeToOutput = path.relative(outputRealPath, sourceRealPath)
  if (outputRealPath === path.dirname(sourceRealPath) || (sourceRelativeToOutput !== ".." && !sourceRelativeToOutput.startsWith(`..${path.sep}`) && !path.isAbsolute(sourceRelativeToOutput)))
    throw new CaseUiError("Pilih folder hasil terpisah yang tidak memuat file sumber.")
  const sourceHash = await readFile(realSource).then(BunlessHash)
  const validation = await inspectParameter(cli, python, kind, realSource, run)
  if (!validation.valid) return { ok: false as const, validation, source: realSource, output: realOutput }

  await mkdir(realOutput, { recursive: true })
  const before = await readdir(realOutput).catch(() => [])
  if (before.length) throw new CaseUiError("Pilih folder hasil yang kosong agar berkas lama tidak tertimpa.")

  await activateCaseMode(cli, python, run)
  const redactedPath = path.join(realOutput, "parameter.redacted.json")
  const tokenPath = path.join(realOutput, "tokens.json")
  const staging = await mkdtemp(path.join(realOutput, ".hyper-case-"))
  const stagedRedacted = path.join(staging, "parameter.redacted.json")
  const stagedTokenMap = path.join(staging, "tokens.json")
  let publishedRedacted = false
  let publishedTokenMap = false
  let modeEnabled = false
  try {
    await activateCaseMode(cli, python, run)
    modeEnabled = true
    const { stdout } = await run(python, [cli, "redact", kind, "--data", realSource, "--out", staging, "--json"])
    const commandResult = parseJson(stdout, "Hasil redaksi")
    if (commandResult.ok !== true) throw new CaseUiError("Pemeriksaan menemukan pola identitas pada hasil. Artefak hasil dihapus; jangan gunakan untuk analisa.")
    const [redactedStat, tokenStat, afterHash, existing] = await Promise.all([
      stat(stagedRedacted).catch(() => undefined),
      stat(stagedTokenMap).catch(() => undefined),
      readFile(realSource).then(BunlessHash),
      readdir(realOutput),
    ])
    if (!redactedStat?.isFile() || !tokenStat?.isFile()) throw new CaseUiError("Hasil redaksi tidak lengkap; jangan lanjutkan analisa.")
    if (sourceHash !== afterHash) throw new CaseUiError("File sumber berubah selama redaksi; hentikan dan periksa file asli.")
    if (existing.some((entry) => entry !== path.basename(staging))) throw new CaseUiError("Folder hasil berubah saat redaksi. Pilih folder kosong lain.")
    if (process.platform !== "win32") await chmod(stagedTokenMap, 0o600).catch(() => undefined)
    await link(stagedRedacted, redactedPath)
    publishedRedacted = true
    await link(stagedTokenMap, tokenPath)
    publishedTokenMap = true
  } catch (error) {
    await Promise.all([
      publishedRedacted ? rm(redactedPath, { force: true }) : undefined,
      publishedTokenMap ? rm(tokenPath, { force: true }) : undefined,
    ])
    if (modeEnabled) await run(python, [cli, "mode", "off", "--json"]).catch(() => undefined)
    throw error
  } finally {
    await rm(staging, { recursive: true, force: true })
  }
  return {
    ok: true as const,
    source: realSource,
    output: realOutput,
    redacted: redactedPath,
    tokenMap: tokenPath,
    warning: "Kirim hanya parameter.redacted.json. Jangan kirim tokens.json atau file asli. Pemeriksaan pola bukan jaminan anonimisasi.",
  }
}

function BunlessHash(data: Buffer) {
  return createHash("sha256").update(data).digest("hex")
}

export function registerCaseUi(deps: {
  ipcMain: IpcMain
  BrowserWindow: typeof BrowserWindow
  dialog: typeof Dialog
  shell: typeof Shell
  app: App
  cli: string
  python: string
  runPython?: Runner
  log: (name: string, value: unknown) => Promise<void>
  setCaseMode: (enabled: boolean) => Promise<unknown>
  onClose: (sender: Electron.WebContents) => void
}) {
  const cli = deps.cli
  const python = deps.python
  const run = deps.runPython ?? runPython
  const approvedOutputs = new Set<string>()
  const channels = [
    "hyper:case:status",
    "hyper:case:list",
    "hyper:case:pick-parameter",
    "hyper:case:pick-output",
    "hyper:case:prepare",
    "hyper:case:open-output",
    "hyper:case:deactivate",
    "hyper:case:close",
  ]
  for (const channel of channels) deps.ipcMain.removeHandler(channel)

  deps.ipcMain.handle("hyper:case:status", async () => {
    const result = await run(python, [cli, "mode", "status", "--json"])
    const status = parseJson(result.stdout, "Status mode kasus") as CaseStatus
    return { caseMode: status.case_mode === true, ...status }
  })
  deps.ipcMain.handle("hyper:case:list", async () => listCases(cli, python, run))
  deps.ipcMain.handle("hyper:case:pick-parameter", async (event) => {
    const win = deps.BrowserWindow.fromWebContents(event.sender)
    const result = await deps.dialog.showOpenDialog(win ?? undefined, {
      title: "Pilih parameter kasus (JSON)",
      properties: ["openFile"],
      filters: [{ name: "Parameter kasus JSON", extensions: ["json"] }],
    })
    return result.canceled ? null : result.filePaths[0] ?? null
  })
  deps.ipcMain.handle("hyper:case:pick-output", async (event) => {
    const win = deps.BrowserWindow.fromWebContents(event.sender)
    const result = await deps.dialog.showOpenDialog(win ?? undefined, {
      title: "Pilih folder kosong untuk hasil redaksi",
      properties: ["openDirectory", "createDirectory"],
    })
    return result.canceled ? null : result.filePaths[0] ?? null
  })
  deps.ipcMain.handle("hyper:case:prepare", async (_event, input: { kind?: string; file?: string; output?: string }) => {
    if (!input || typeof input.kind !== "string" || typeof input.file !== "string" || typeof input.output !== "string")
      throw new CaseUiError("Pilih jenis kasus, file parameter, dan folder hasil terlebih dahulu.")
    const cases = await listCases(cli, python, run)
    if (!cases.some((item) => item.id === input.kind)) throw new CaseUiError("Jenis kasus tidak tersedia di Hyper-Knowledge.")
    const result = await redactCase(cli, python, input.kind, input.file, input.output, run)
    if (!result.ok) return result
    try {
      await deps.setCaseMode(true)
    } catch (error) {
      await Promise.all([rm(result.redacted, { force: true }), rm(result.tokenMap, { force: true })])
      await run(python, [cli, "mode", "off", "--json"]).catch(() => undefined)
      await deps.setCaseMode(false).catch(() => undefined)
      throw new CaseUiError("Hasil redaksi dihapus karena status mode tidak tersimpan. Periksa izin konfigurasi, lalu coba lagi.", { cause: error })
    }
    approvedOutputs.add(path.resolve(result.output))
    await deps.log("case-ui", `redacted ${path.basename(result.source)} -> ${result.output}`).catch(() => undefined)
    return result
  })
  deps.ipcMain.handle("hyper:case:open-output", async (_event, output: string) => {
    if (typeof output !== "string" || !path.isAbsolute(output) || !approvedOutputs.has(path.resolve(output)))
      throw new CaseUiError("Folder hasil tidak dikenal. Buat salinan redaksi melalui wizard terlebih dahulu.")
    const error = await deps.shell.openPath(output)
    if (error) throw new CaseUiError(`Folder hasil gagal dibuka: ${error}`)
    return ""
  })
  deps.ipcMain.handle("hyper:case:deactivate", async (event) => {
    const win = deps.BrowserWindow.fromWebContents(event.sender)
    const confirmation = await deps.dialog.showMessageBox(win ?? undefined, {
      type: "warning",
      title: "Akhiri Mode Kasus Secure?",
      message: "Perlindungan mode kasus akan dimatikan. Berkas kasus dan token tidak dihapus.",
      buttons: ["Kembali", "Akhiri Mode Kasus"],
      defaultId: 0,
      cancelId: 0,
    })
    if (confirmation.response !== 1) return { cancelled: true }
    const disabled = await deactivateCaseMode(cli, python)
    await deps.setCaseMode(false)
    return disabled
  })
  deps.ipcMain.handle("hyper:case:close", (event) => deps.onClose(event.sender))
  return () => {
    for (const channel of channels) deps.ipcMain.removeHandler(channel)
  }
}

export async function showCaseWindow(deps: { BrowserWindow: typeof BrowserWindow; bundleRoot: string; parent?: InstanceType<typeof BrowserWindow> }) {
  const window = new deps.BrowserWindow({
    width: 620,
    height: 700,
    resizable: true,
    parent: deps.parent,
    modal: Boolean(deps.parent),
    title: "Hyper AI — Kasus Sensitif",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(deps.bundleRoot, "wizard", "case-preload.cjs"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  await window.loadFile(path.join(deps.bundleRoot, "wizard", "case.html"))
  return window
}


export async function openCaseWindowForIpc(deps: {
  BrowserWindow: typeof BrowserWindow
  bundleRoot: string
  parent?: InstanceType<typeof BrowserWindow>
  current?: InstanceType<typeof BrowserWindow>
}) {
  if (deps.current && !deps.current.isDestroyed()) {
    deps.current.show()
    deps.current.focus()
    return deps.current
  }
  return showCaseWindow(deps)
}
