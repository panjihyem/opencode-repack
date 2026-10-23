export * as ConfigDiscovery from "./discovery.js"

import os from "os"
import path from "path"
import { Effect } from "effect"
import { FSUtil } from "@opencode/util/fs-util"
import { Global } from "@opencode/util/global"
import { Location } from "../location.js"
import { AbsolutePath } from "../schema.js"
import type { Options } from "../config.js"

export const names = ["opencode.json", "opencode.jsonc"]

/** Eligible sources in priority order, including paths that may appear later. */
export interface Sources {
  readonly system?: { readonly path: AbsolutePath; readonly present: boolean }
  /** macOS MDM managed preferences plist (`ai.opencode.managed`), when one is deployed. */
  readonly preferences?: AbsolutePath
  /**
   * Config OTA Hyper AI: direktori dengan `bundle.json` + `bundle.json.sig`.
   * Dimuat setelah system/MDM sehingga menang atas config pengguna.
   */
  readonly managed?: readonly { readonly path: AbsolutePath; readonly present: boolean }[]
  readonly global?: AbsolutePath
  readonly explicit?: AbsolutePath
  readonly direct: readonly AbsolutePath[]
  readonly project: readonly { readonly path: AbsolutePath; readonly present: boolean }[]
  readonly claude: readonly AbsolutePath[]
  readonly agents: readonly AbsolutePath[]
}

/** Direktori managed per platform; pengguna lebih dulu, mesin sesudahnya (mesin menang). */
export function managedDirectories(platform: NodeJS.Platform = process.platform, env: NodeJS.ProcessEnv = process.env) {
  if (platform === "darwin")
    return [
      path.join(env.HOME || os.homedir(), "Library", "Application Support", "HyperAI", "managed"),
      "/Library/Application Support/HyperAI/managed",
    ].map((directory) => AbsolutePath.make(directory))
  if (platform === "win32")
    return [
      path.join(env.LOCALAPPDATA || path.join(env.USERPROFILE || "", "AppData", "Local"), "HyperAI", "managed"),
      path.join(env.ProgramData || "C:\\ProgramData", "HyperAI", "managed"),
    ].map((directory) => AbsolutePath.make(directory))
  return [
    path.join(env.XDG_CONFIG_HOME || path.join(env.HOME || "", ".config"), "hyperai", "managed"),
    "/etc/hyperai/managed",
  ].map((directory) => AbsolutePath.make(directory))
}

/** Berkas bundle yang dibaca dari setiap direktori managed. */
export const managedBundleFiles = ["bundle.json", "bundle.json.sig", "enrollment"] as const

/** Platform system configuration directory (`/Library/Application Support/opencode`, `/etc/opencode`, `%ProgramData%\opencode`). */
export function systemDirectory(platform: NodeJS.Platform = process.platform, env: NodeJS.ProcessEnv = process.env) {
  if (platform === "darwin") return AbsolutePath.make("/Library/Application Support/opencode")
  if (platform === "win32") return AbsolutePath.make(path.join(env.ProgramData || "C:\\ProgramData", "opencode"))
  return AbsolutePath.make("/etc/opencode")
}

/** macOS MDM managed preferences plists, most specific first; the first one present wins. */
export function preferencePaths(user: string) {
  return [
    AbsolutePath.make(path.join("/Library/Managed Preferences", user, "ai.opencode.managed.plist")),
    AbsolutePath.make("/Library/Managed Preferences/ai.opencode.managed.plist"),
  ]
}

// Keys macOS and MDM profiles inject into managed preferences that are not OpenCode config.
const preferenceMetadata = new Set([
  "PayloadDisplayName",
  "PayloadIdentifier",
  "PayloadType",
  "PayloadUUID",
  "PayloadVersion",
  "_manualProfile",
])

/** Removes MDM payload metadata from `plutil -convert json` output. */
export function stripPreferenceMetadata(json: string) {
  const parsed: unknown = JSON.parse(json)
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return json
  return JSON.stringify(Object.fromEntries(Object.entries(parsed).filter(([key]) => !preferenceMetadata.has(key))))
}

export const discover = Effect.fn("ConfigDiscovery.discover")(function* (options?: Options) {
  const fs = yield* FSUtil.Service
  const global = yield* Global.Service
  const location = yield* Location.Service
  const system = (() => {
    if (options?.system === false) return
    if (typeof options?.system === "string") return AbsolutePath.make(path.resolve(options.system))
    return systemDirectory()
  })()
  const globalDirectory = AbsolutePath.make(global.config)
  const globalAgentsDirectory = AbsolutePath.make(path.join(global.home, ".agents"))
  const globalClaudeDirectory = AbsolutePath.make(path.join(global.home, ".claude"))
  const configDirectories = [...(system ? [system] : []), globalDirectory]
  const globalRoots = yield* Effect.forEach(
    [...configDirectories, globalClaudeDirectory, globalAgentsDirectory],
    (item) => fs.resolve(item),
  )
  const current = yield* fs.resolve(location.directory)
  const directories =
    globalRoots.slice(0, configDirectories.length).includes(current) || options?.project === false
      ? []
      : yield* fs.up({ targets: ["."], start: location.directory }).pipe(Effect.orDie)
  const discovered = yield* Effect.forEach(directories, (directory) =>
    Effect.gen(function* () {
      // Resolve the parent too: missing children must honor symlinked global roots.
      const parent = yield* fs.resolve(directory)
      return yield* Effect.forEach([".claude", ".agents", ".opencode", ...names.toReversed()], (name) =>
        fs
          .resolve(path.join(parent, name))
          .pipe(Effect.map((resolved) => ({ item: AbsolutePath.make(path.join(directory, name)), resolved }))),
      )
    }),
  ).pipe(
    Effect.map((items) => items.flat()),
    Effect.orDie,
  )

  const globalEnabled = options?.global !== false
  const globalFiles = yield* Effect.forEach(
    configDirectories.flatMap((directory) => names.map((name) => path.join(directory, name))),
    (file) => fs.resolve(file),
  )
  // Global sources must not re-enter through the project walk.
  const visible = discovered
    .filter(({ resolved }) =>
      globalEnabled
        ? !globalRoots.includes(resolved) && !globalFiles.includes(resolved)
        : !globalRoots.some((root) => resolved === root || resolved.startsWith(root + path.sep)),
    )
    .map(({ item }) => item)

  // A custom system directory replaces platform discovery, so it also skips host MDM preferences.
  const preferences =
    globalEnabled && (options?.system ?? true) === true && process.platform === "darwin"
      ? (yield* Effect.filter(
          preferencePaths(yield* Effect.try(() => os.userInfo().username).pipe(Effect.orElseSucceed(() => "user"))),
          fs.isFile,
        )).at(0)
      : undefined

  // Config OTA: bundle bertanda tangan yang ditulis updater aplikasi.
  const managed = globalEnabled && options?.managed !== false
    ? yield* Effect.forEach(
        typeof options?.managed === "string" ? [AbsolutePath.make(path.resolve(options.managed))] : managedDirectories(),
        (directory) =>
          fs.isFile(path.join(directory, "bundle.json")).pipe(Effect.map((present) => ({ path: directory, present }))),
      )
    : []

  return {
    system: globalEnabled && system ? { path: system, present: yield* fs.isDir(system) } : undefined,
    preferences,
    managed,
    global: globalEnabled ? globalDirectory : undefined,
    explicit: options?.file ? AbsolutePath.make(path.resolve(options.file)) : undefined,
    direct: visible.filter((item) => ![".agents", ".claude", ".opencode"].includes(path.basename(item))).toReversed(),
    project: yield* Effect.forEach(
      visible.filter((item) => path.basename(item) === ".opencode").toReversed(),
      (directory) => fs.isDir(directory).pipe(Effect.map((present) => ({ path: directory, present }))),
    ),
    claude:
      options?.claude === false
        ? []
        : [
            ...new Set([
              ...(globalEnabled ? [globalClaudeDirectory] : []),
              ...visible.filter((item) => path.basename(item) === ".claude").toReversed(),
            ]),
          ],
    agents: [
      ...new Set([
        ...(globalEnabled ? [globalAgentsDirectory] : []),
        ...visible.filter((item) => path.basename(item) === ".agents").toReversed(),
      ]),
    ],
  } satisfies Sources
})
