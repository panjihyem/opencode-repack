import { app, BrowserWindow, ipcMain, Notification } from "electron"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import type { ChildProcess } from "node:child_process"
import { components, provision, selectedModelId } from "./components"
import { applyServers, applyUnattended, managed } from "./config"
import { applyDocSkill } from "./docling"
import { hindsightInstalled, startHindsight } from "./hindsight"
import { lmStudioInstalled, startLmServer, tuneLmStudio } from "./lmstudio"
import { manifest } from "./manifest"
import { applyOfficeSkills } from "./skills"

// Makes a fresh Hyper AI install usable without manual setup:
//   - Context7 ships inside the installer and is registered as an MCP server
//   - the first launch opens a setup wizard for the heavier local stack
//     (LM Studio, a local model, the Hindsight memory server)
//   - installed services start with the app
// Failures are logged and shown in the wizard; the app never waits on this.
// Run `--hyper-setup` to open the wizard again.

type State = { wizard?: "completed" | "skipped"; unattended?: boolean }

const dataDir = () => path.join(app.getPath("userData"), "hyper-bundle")
const logDir = () => path.join(dataDir(), "logs")
const configDir = () => path.join(process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config"), "opencode")
// HYPER_AI_BUNDLE_ROOT lets the end-to-end test run an unpackaged app against a prepared bundle.
const bundleRoot = () => process.env.HYPER_AI_BUNDLE_ROOT ?? path.join(process.resourcesPath, "hyper-bundle")
const stateFile = () => path.join(dataDir(), "state.json")

export async function startHyperBundle() {
  if (!app.isPackaged && !process.env.HYPER_AI_BUNDLE_ROOT) return
  const children: ChildProcess[] = []
  app.once("will-quit", () => children.forEach((child) => child.kill()))

  await registerContext7()

  const state = await readState()
  const recovery = process.argv.includes("--hyper-setup")
  // First launch is fully automatic: the wizard pre-selects every component and
  // starts provisioning without a single click, so one installer is all a user
  // needs. --hyper-setup reopens the same window in manual mode for recovery.
  if (!state.wizard || recovery) await openWizard(!recovery)

  // Services run on every launch once installed, not only right after setup.
  await startServices(children)
}

async function startServices(children: ChildProcess[]) {
  await applyDocSkill(configDir(), dataDir()).catch((error) => log("docs", error))
  await applyOfficeSkills(configDir(), dataDir()).catch((error) => log("skills", error))
  // Unattended mode (chosen in the wizard, default on): the agent acts without
  // approval prompts. Turning it off removes the standing grant; the user's own
  // permission rules always outrank anything written here.
  const state = await readState()
  await applyUnattended(configDir(), state.unattended !== false).catch((error) => log("permission", error))
  // The memory server follows the RAM-tiered model the wizard picked, but never
  // switches to a model that is not fully downloaded (older installs keep theirs).
  if (await hindsightInstalled(dataDir())) {
    const modelId = await selectedModelId()
    const child = await startHindsight(dataDir(), logDir(), modelId)
    if (child) children.push(child)
    await registerMemory()
  }
  if (await lmStudioInstalled(dataDir())) {
    await tuneLmStudio().catch((error) => log("lmstudio", error))
    await startLmServer(logDir())
  }
}

function openWizard(auto: boolean) {
  return new Promise<void>((resolve) => {
    const window = new BrowserWindow({
      width: 680,
      height: 560,
      resizable: false,
      title: "Hyper AI Setup",
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
    ipcMain.handle("hyper:start", async (_event, ids: string[], opts?: { unattended?: boolean }) => {
      // Persist the agent-autonomy choice before setup runs, so services pick it up.
      await writeState({ ...(await readState()), unattended: opts?.unattended !== false })
      const failed = await provision(ids, dataDir(), (update) => {
        if (update.type === "step") send({ ...update })
        else send(update)
        if (update.type === "step") void log(update.id, `${update.status} ${update.message ?? ""}`)
      })
      if (!failed.length) outcome = "completed"
      new Notification({
        title: "Hyper AI",
        body: failed.length
          ? `Setup belum lengkap (${failed.join(", ")}). Ulangi dengan --hyper-setup.`
          : "Semuanya siap. Hyper AI siap dipakai.",
      }).show()
    })
    ipcMain.handle("hyper:skip", () => window.close())
    ipcMain.handle("hyper:finish", () => window.close())

    window.on("closed", async () => {
      for (const channel of ["hyper:auto", "hyper:plan", "hyper:start", "hyper:skip", "hyper:finish"]) {
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
