import { chmod, cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { download } from "./download"
import { manifest } from "./manifest"
import { executable, lmStudioInstaller, modelUrl } from "./platform"
import { launch, run } from "./process"
import type { Report } from "./process"

const exists = (file: string) =>
  stat(file).then(
    () => true,
    () => false,
  )

export const lmsPath = () => path.join(os.homedir(), ".lmstudio", "bin", executable("lms"))

/** Where each platform's installer leaves the app, used to detect an existing install. */
function appLocation(dataDir: string) {
  if (process.platform === "win32")
    return path.join(
      process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local"),
      "Programs",
      "LM Studio",
      "LM Studio.exe",
    )
  // LM Studio's newer builds check that they run from /Applications and misbehave
  // (their CLI tooling cannot find a valid install) when launched from elsewhere.
  if (process.platform === "darwin") return "/Applications/LM Studio.app"
  return path.join(dataDir, "lm-studio", "LM-Studio.AppImage")
}

export async function lmStudioInstalled(dataDir: string) {
  return (
    (await exists(lmsPath())) || (await exists(appLocation(dataDir))) || (await exists("/Applications/LM Studio.app"))
  )
}

/** Installs the official, unmodified LM Studio build for this platform. */
export async function installLmStudio(dataDir: string, report: Report) {
  const installer = lmStudioInstaller(process.platform, process.arch)
  if (!installer) throw new Error(`LM Studio does not publish a build for ${process.platform}/${process.arch}`)
  const downloads = path.join(dataDir, "downloads")
  const file = path.join(downloads, path.basename(new URL(installer.url).pathname))
  report("Downloading LM Studio", 0)
  await download(installer.url, file, (done, total) => total && report("Downloading LM Studio", done / total))

  report("Installing LM Studio", 1)
  let installed: string | undefined
  if (installer.kind === "exe") await run(file, ["/S"])
  if (installer.kind === "dmg") installed = await installDmg(file)
  if (installer.kind === "appimage") {
    const target = appLocation(dataDir)
    await mkdir(path.dirname(target), { recursive: true })
    await cp(file, target)
    await chmod(target, 0o755)
    installed = target
  }
  await rm(file, { force: true })
  // Their CLI ("lms") only trusts standalone install-location marker files under
  // ~/.lmstudio/.internal, which the installer itself does not create on headless
  // machines. Writing them lets the daemon bootstrap succeed in the wizard.
  if (process.platform === "darwin" && installed) {
    const internal = path.join(os.homedir(), ".lmstudio", ".internal")
    await mkdir(internal, { recursive: true })
    await writeFile(path.join(internal, "app-install-location.json"), JSON.stringify({ json: installed }))
    await writeFile(path.join(internal, "llmster-install-location.json"), JSON.stringify({ json: installed }))
  }
}

/** Copies the app out of the DMG; prefers /Applications, falls back to ~/Applications. */
async function installDmg(dmg: string) {
  const mount = await mkdtemp(path.join(os.tmpdir(), "hyper-ai-lmstudio-"))
  await run("hdiutil", ["attach", dmg, "-nobrowse", "-readonly", "-mountpoint", mount])
  try {
    const preferred = "/Applications/LM Studio.app"
    const fallback = path.join(os.homedir(), "Applications", "LM Studio.app")
    let target = preferred
    try {
      await cp(path.join(mount, "LM Studio.app"), preferred, { recursive: true, force: true })
    } catch {
      target = fallback
      await mkdir(path.dirname(fallback), { recursive: true })
      await cp(path.join(mount, "LM Studio.app"), fallback, { recursive: true, force: true })
    }
    return target
  } finally {
    await run("hdiutil", ["detach", mount, "-force"]).catch(() => undefined)
    await rm(mount, { recursive: true, force: true })
  }
}

/** Downloads the pinned GGUF models into LM Studio's models directory; pass ids to restrict the set. */
export async function installModels(report: Report, ids?: string[]) {
  for (const model of manifest.models.filter((m) => !ids || ids.includes(m.id))) {
    const dest = path.join(os.homedir(), ".lmstudio", "models", model.publisher, model.repo, model.file)
    const present = await stat(dest).then(
      (info) => info.size === model.bytes,
      () => false,
    )
    if (present) continue
    report(`Downloading ${model.id}`, 0)
    await download(modelUrl(model), dest, (done, total) => total && report(`Downloading ${model.id}`, done / total))
  }
}

/**
 * Aligns LM Studio's memory policy with Hyper AI's expectation: when a model
 * is requested it JIT-loads automatically, and memory is freed on its own —
 * the previous JIT model unloads as soon as another is loaded, and an idle
 * model unloads after 15 minutes. Runs on every launch (idempotent) and never
 * touches settings it does not know about.
 */
export async function tuneLmStudio() {
  const settings = path.join(os.homedir(), ".lmstudio", "apps", "bionic", "settings.json")
  if (!(await exists(settings))) return "wait" as const
  let value: unknown
  try {
    value = JSON.parse(await readFile(settings, "utf8"))
  } catch {
    return "skip" as const
  }
  const body = typeof value === "object" && value !== null ? (value as Record<string, any>) : {}
  const jit = body.jitModelTTL
  const ttl = manifest.lmstudio.jitUnloadSeconds ?? 900
  const aligned =
    body.unloadPreviousJITModelOnLoad === true &&
    typeof jit === "object" &&
    jit !== null &&
    jit.enabled === true &&
    jit.ttlSeconds === ttl
  if (aligned) return "unchanged" as const
  body.unloadPreviousJITModelOnLoad = true
  body.jitModelTTL = { enabled: true, ttlSeconds: ttl }
  await mkdir(path.dirname(settings), { recursive: true })
  await writeFile(settings, JSON.stringify(body, null, 2))
  return "updated" as const
}

/** Starts LM Studio's headless server when a CLI binary exists. */
export async function startLmServer(logDir: string) {  // The app normally links the installed CLI into ~/.lmstudio/bin after its first
  // GUI run, but a fresh wizard-only install hasn't run yet: fall back to the
  // copy bundled inside the app itself.
  const candidates = [
    lmsPath(),
    path.join("/Applications/LM Studio.app", "Contents/Resources/app/.webpack/lms"),
    path.join(os.homedir(), "Applications/LM Studio.app/Contents/Resources/app/.webpack/lms"),
  ]
  let lms: string | undefined
  for (const candidate of candidates) if (await exists(candidate)) lms = candidate
  if (!lms) return false
  await run(lms, ["daemon", "up"]).catch(() => undefined)
  const child = await launch(
    lms,
    ["server", "start", "--port", String(manifest.lmstudio.port)],
    path.join(logDir, "lmstudio.log"),
  )
  child.unref()
  return true
}
