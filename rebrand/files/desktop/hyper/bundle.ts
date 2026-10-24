import { app, BrowserWindow, dialog, ipcMain, Notification, shell } from "electron"
import { chmod, mkdir, readFile, readlink, stat, symlink, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import type { ChildProcess } from "node:child_process"
import { components, modelChoices, provision, selectedModelId } from "./components"
import { applyServers, applyUnattended, managed } from "./config"
import { consentValid, consentVersion, readDocs, type Consent, type DocName } from "./consent"
import { applyDocSkill } from "./docling"
import { hindsightInstalled, startHindsight } from "./hindsight"
import { applyKnowledgeSkill, syncKnowledge } from "./knowledge"
import { lmStudioInstalled, startLmServer, tuneLmStudio } from "./lmstudio"
import { applySessionMemoryPlugin } from "./memory"
import { manifest } from "./manifest"
import { caseMode } from "./privacy"
import { resolveRouter } from "./router"
import { applyOfficeSkills } from "./skills"
import { caseModule, officePython } from "./office"
import { registerCaseUi, showCaseWindow } from "./case-ui"
import { startHyperUpdates } from "./updates"

// Makes a fresh Hyper AI install usable without manual setup:
//   - Context7 ships inside the installer and is registered as an MCP server
//   - the first launch opens a setup wizard for the heavier local stack
//     (LM Studio, a local model, the Hindsight memory server)
//   - installed services start with the app
// Failures are logged and shown in the wizard; the app never waits on this.
// Run `--hyper-setup` to open the wizard again.

type State = {
  wizard?: "completed" | "skipped"
  unattended?: boolean
  modelId?: string
  offline?: boolean
  consent?: Consent
}

const dataDir = () => path.join(app.getPath("userData"), "hyper-bundle")
const logDir = () => path.join(dataDir(), "logs")
const configDir = () => path.join(process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config"), "opencode")
// HYPER_AI_BUNDLE_ROOT lets the end-to-end test run an unpackaged app against a prepared bundle.
const bundleRoot = () => process.env.HYPER_AI_BUNDLE_ROOT ?? path.join(process.resourcesPath, "hyper-bundle")
const wizardDir = () => path.join(bundleRoot(), "wizard")
const stateFile = () => path.join(dataDir(), "state.json")
const docsNow = () => readDocs(wizardDir())
let caseUiDispose: (() => void) | undefined

export async function startHyperBundle() {
  if (!app.isPackaged && !process.env.HYPER_AI_BUNDLE_ROOT) return
  const children: ChildProcess[] = []
  app.once("will-quit", () => children.forEach((child) => child.kill()))
  const home = path.join(app.getPath("userData"), "hyper-bundle")
  caseUiDispose?.()
  caseUiDispose = registerCaseUi({
    ipcMain,
    BrowserWindow,
    dialog,
    shell,
    app,
    cli: caseModule(home),
    python: officePython(home),
    log,
    setCaseMode: async (enabled) => {
      const file = path.join(configDir(), "hyper", "privacy.json")
      const text = await readFile(file, "utf8").catch(() => "{}")
      const state = JSON.parse(text)
      await mkdir(path.dirname(file), { recursive: true })
      await writeFile(file, JSON.stringify({ ...state, case_mode: enabled }, null, 2))
    },
    onClose: (sender) => {
      const win = BrowserWindow.fromWebContents(sender)
      if (win && !win.isDestroyed()) win.close()
    },
  })
  ipcMain.removeHandler("hyper:case:open")
  ipcMain.handle("hyper:case:open", async (event) => {
    const parent = BrowserWindow.fromWebContents(event.sender) ?? undefined
    await openCaseWindow(parent)
    return { opened: true }
  })
  // Consent is checked in the main process, not only by the wizard button: a
  // closed window must not start downloads or local services.
  const docs = await docsNow()
  let opened = false
  if (!consentValid((await readState()).consent, docs)) {
    opened = true
    await openWizard(false)
    if (!consentValid((await readState()).consent, await docsNow())) {
      await log("consent", "setup needs accepted terms before services start")
      return
    }
  }

  startHyperUpdates((message) => log("updates", message))

  await registerContext7()

  const state = await readState()
  const recovery = process.argv.includes("--hyper-setup")
  // First launch shows the intro/consent and component choices; nothing is
  // downloaded until the user accepts and confirms. --hyper-setup reopens it.
  if ((!state.wizard || recovery) && !opened) await openWizard(!recovery)

  // Closing the wizard before it completes must not start the managed
  // services; the app still opens, and the next launch asks again.
  if ((await readState()).wizard !== "completed") {
    await log("setup", "wizard not completed; managed services stay off")
    return
  }

  // Services run on every launch once installed, not only right after setup.
  await startServices(children)
}

async function startServices(children: ChildProcess[]) {
  await applyDocSkill(configDir(), dataDir()).catch((error) => log("docs", error))
  await applyOfficeSkills(configDir(), dataDir()).catch((error) => log("skills", error))
  // Unattended mode (chosen in the wizard, default off): the agent acts without
  // approval prompts. Turning it off removes the standing grant; the user's own
  // permission rules always outrank anything written here.
  const state = await readState()
  const privacy = await caseMode(configDir())
  await applyUnattended(configDir(), state.unattended === true).catch((error) => log("permission", error))
  // Persistent memory plugin (managed): retains prompts and injects recall.
  // In case mode it is written as a no-op: automatic retain/recall is the path
  // that would carry case text off the machine, so it is removed, not filtered.
  await applySessionMemoryPlugin(configDir(), !privacy).catch((error) => log("memory", error))
  // Local web search MCP (no API key, no remote configuration).
  await registerSearch()
  // `hyper` command line companion (sync/recall without the GUI).
  await ensureHyperCli().catch((error) => log("cli", error))
  // The memory server follows the remote route: the MiniMax model that ships
  // with OpenCode, reached through the router the user already configured.
  // The local model is never used for memory while that route is available.
  if (await hindsightInstalled(dataDir())) {
    // Case mode: the memory server keeps running for local reads, but its
    // consolidation never reaches the remote router. A missing local model
    // fails the job locally instead of falling back to the remote route.
    const router = privacy ? undefined : await resolveRouter(configDir())
    const offlineModel = router ? undefined : await selectedModelId(state.modelId)
    const child = await startHindsight(dataDir(), logDir(), router, offlineModel)
    if (child) children.push(child)
    await registerMemory()
    // Knowledge tree: safe to run on every start; ingestion is asynchronous
    // inside the memory server, so this never blocks the app.
    void syncKnowledge((message) => log("knowledge", message))
      .catch((error) => log("knowledge", error))
      .then(() => applyKnowledgeSkill(configDir()).catch((error) => log("knowledge", error)))
  }
  // The local model is an offline alternative for the agent, not the memory
  // server: its server only starts when there is no remote route, or when the
  // user explicitly asked for the offline mode.
  if (await lmStudioInstalled(dataDir())) {
    const router = await resolveRouter(configDir())
    if (!router || state.offline === true) {
      await tuneLmStudio().catch((error) => log("lmstudio", error))
      await startLmServer(logDir())
    }
  }
}

let caseWindow: BrowserWindow | undefined
async function openCaseWindow(parent?: InstanceType<typeof BrowserWindow>) {
  if (caseWindow && !caseWindow.isDestroyed()) {
    caseWindow.show()
    caseWindow.focus()
    return
  }
  caseWindow = await showCaseWindow({ BrowserWindow, bundleRoot: bundleRoot(), parent })
  caseWindow.once("closed", () => { caseWindow = undefined })
}

function openWizard(auto: boolean) {
  return new Promise<void>((resolve) => {
    const window = new BrowserWindow({
      width: 760,
      height: 680,
      resizable: true,
      title: "Hyper AI â€” Penyiapan",
      autoHideMenuBar: true,
      webPreferences: {
        preload: path.join(bundleRoot(), "wizard", "preload.cjs"),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    })
    const send = (update: unknown) => window.isDestroyed() || window.webContents.send("hyper:progress", update)
    let outcome: State["wizard"] = "skipped"

    ipcMain.handle("hyper:auto", () => auto)
    ipcMain.handle("hyper:model-choices", () => modelChoices())
    ipcMain.handle("hyper:docs", async () => {
      const docs = await docsNow()
      return {
        version: consentVersion(docs),
        terms: { hash: docs.terms.hash },
        privacy: { hash: docs.privacy.hash },
        licenses: { hash: docs.licenses.hash },
      }
    })
    ipcMain.handle("hyper:doc", async (_event, name: DocName) => {
      const docs = await docsNow()
      const doc = docs[name]
      return doc ? { text: doc.text, hash: doc.hash } : { text: "", hash: "" }
    })
    ipcMain.handle("hyper:consent", async (_event, payload?: { terms?: string; privacy?: string }) => {
      const docs = await docsNow()
      if (payload?.terms !== docs.terms.hash || payload?.privacy !== docs.privacy.hash)
        return { ok: false, error: "docs-changed" }
      const consent: Consent = {
        version: consentVersion(docs),
        terms: docs.terms.hash,
        privacy: docs.privacy.hash,
        at: new Date().toISOString(),
      }
      const state = await readState()
      await writeState({ ...state, consent, unattended: false })
      return { ok: true, version: consent.version }
    })
    ipcMain.handle("hyper:plan", () =>
      Promise.all(
        components.map(async (item) => ({
          id: item.id,
          name: item.name,
          description: item.description,
          bytes: item.bytes,
          required: item.required ?? false,
          recommended: item.recommended ?? false,
          installed: !item.required && (await item.installed(dataDir())),
        })),
      ),
    )
    ipcMain.handle("hyper:start", async (_event, ids: string[], opts?: { unattended?: boolean; modelId?: string; offline?: boolean }) => {
      // The renderer cannot start provisioning without a current acceptance.
      const docs = await docsNow()
      if (!consentValid((await readState()).consent, docs)) return { ok: false, error: "consent" }
      // Persist the agent-autonomy choice before setup runs, so services pick it up.
      await writeState({
        ...(await readState()),
        unattended: opts?.unattended === true,
        offline: opts?.offline === true,
        ...(opts?.modelId ? { modelId: opts.modelId } : {}),
      })
      const failed = await provision(ids, dataDir(), (update) => {
        if (update.type === "step") send({ ...update })
        else send(update)
        if (update.type === "step") void log(update.id, `${update.status} ${update.message ?? ""}`)
      }, opts?.modelId)
      if (!failed.length) outcome = "completed"
      new Notification({
        title: "Hyper AI",
        body: failed.length
          ? `Setup belum lengkap (${failed.join(", ")}). Ulangi dengan --hyper-setup.`
          : "Semuanya siap. Hyper AI siap dipakai.",
      }).show()
      return { ok: true, failed }
    })
    ipcMain.handle("hyper:skip", () => window.close())
    ipcMain.handle("hyper:finish", () => window.close())

    window.on("closed", async () => {
      for (const channel of [
        "hyper:auto",
        "hyper:model-choices",
        "hyper:docs",
        "hyper:doc",
        "hyper:consent",
        "hyper:plan",
        "hyper:start",
        "hyper:skip",
        "hyper:finish",
      ]) {
        ipcMain.removeHandler(channel)
      }
      // Closing without finishing asks again on the next launch.
      if (outcome === "completed") await writeState({ ...(await readState()), wizard: outcome })
      resolve()
    })
    void window.loadFile(path.join(bundleRoot(), "wizard", "wizard.html"))
  })
}

async function registerContext7() {
  const entry = path.join(bundleRoot(), manifest.context7.entry)
  await applyServers(configDir(), {
    context7: managed({
      type: "local",
      // The app's own Electron binary doubles as Node, so no system Node is needed.
      command: [process.execPath, entry],
      environment: { ELECTRON_RUN_AS_NODE: "1" },
    }),
  }).catch((error) => log("context7", error))
}

async function registerMemory() {
  const { host, port } = manifest.hindsight
  await applyServers(configDir(), {
    mem: managed({ type: "remote", url: `http://${host}:${port}/mcp/`, oauth: false }),
  }).catch((error) => log("mem", error))
}

async function registerSearch() {
  const entry = path.join(bundleRoot(), "search", "mcp.mjs")
  await applyServers(configDir(), {
    "hyper-search": managed({
      type: "local",
      // The app's own Electron binary doubles as Node, so no system Node is needed.
      command: [process.execPath, entry],
      environment: { ELECTRON_RUN_AS_NODE: "1" },
    }),
  }).catch((error) => log("search", error))
}

/** Job file: { charts: [{ id, spec, width, height, format? }] } â€” specs are ECharts options (Sankey, graph, treemap, heatmapâ€¦). */
export async function runHyperViz(jobFile: string) {
  const exit = (code: number, message: string) => {
    process.stdout.write(`hyper-viz: ${message}\n`)
    app.exit(code)
  }
  try {
    const job = JSON.parse(await readFile(jobFile, "utf8")) as VizJob
    await app.whenReady()
    const window = new BrowserWindow({ show: false, width: 1200, height: 800, webPreferences: { sandbox: true } })
    const echarts = path.join(bundleRoot(), manifest.viz.entry)
    await window.loadURL("data:text/html,<html><body><div id='c' style='width:100%;height:100%'></div></body></html>")
    await window.webContents.executeJavaScript(
      `(async () => {
        const src = ${JSON.stringify(await readFile(echarts, "utf8"))}
        const script = document.createElement("script"); script.textContent = src; document.head.appendChild(script)
        return true
      })()`,
    )
    const results: VizResult[] = []
    for (const chart of job.charts ?? []) {
      const spec = JSON.stringify(chart.spec ?? {})
      const outputs = await window.webContents.executeJavaScript(
        `(async () => {
          const chart = echarts.init(document.getElementById("c"), null, {
            renderer: ${JSON.stringify(chart.format ?? "svg")},
            width: ${Number(chart.width) || 1600}, height: ${Number(chart.height) || 900},
          })
          chart.setOption(${spec})
          const fmt = ${JSON.stringify(chart.format ?? "svg")}
          const value = fmt === "svg"
            ? (typeof chart.renderToSVGString === "function" ? chart.renderToSVGString() : (document.getElementById("c").querySelector("svg")?.outerHTML ?? ""))
            : chart.getDataURL({ type: "png", pixelRatio: 2, backgroundColor: "#fff" })
          chart.dispose()
          return value
        })()`,
      )
      const dir = path.dirname(jobFile)
      const base = path.join(dir, chart.id ?? `chart-${results.length + 1}`)
      const file = `${base}.${chart.format === "png" ? "png" : "svg"}`
      if (chart.format === "png") await writeFile(file, Buffer.from(String(outputs).split(",")[1], "base64"))
      else await writeFile(file, String(outputs))
      results.push({ id: chart.id, file })
    }
    window.destroy()
    exit(0, `${results.length} chart selesai: ${results.map((result) => result.file).join(", ")}`)
  } catch (error) {
    exit(1, `gagal: ${error instanceof Error ? error.message : error}`)
  }
}

type VizJob = { charts?: Array<{ id?: string; spec?: unknown; width?: number; height?: number; format?: string }> }
type VizResult = { id?: string; file: string }

/** Makes the `hyper` CLI reachable from the user's shell (best effort). */
async function ensureHyperCli() {
  const bin = path.join(bundleRoot(), "bin")
  await chmod(path.join(bin, "hyper.mjs"), 0o755).catch(() => undefined)
  const link = path.join(os.homedir(), ".local", "bin", "hyper")
  const launcher = path.join(bin, "hyper.mjs")
  const current = await readlink(link).catch(() => undefined)
  if (current === launcher) return
  await stat(path.join(os.homedir(), ".local", "bin")).then(
    () => symlink(launcher, link).catch(() => undefined),
    () => log("cli", "~/.local/bin tidak ada â€” jalankan CLI lewat path lengkap aplikasi"),
  )
}

async function log(scope: string, detail: unknown) {
  const line = `${new Date().toISOString()} [${scope}] ${detail instanceof Error ? detail.stack : String(detail)}\n`
  await mkdir(logDir(), { recursive: true })
  await writeFile(path.join(logDir(), "setup.log"), line, { flag: "a" }).catch(() => undefined)
}

async function readState(): Promise<State> {
  const text = await readFile(stateFile(), "utf8").catch(() => undefined)
  return text ? (JSON.parse(text) as State) : {}
}

async function writeState(state: State) {
  await mkdir(dataDir(), { recursive: true })
  await writeFile(stateFile(), JSON.stringify(state, null, 2))
}
