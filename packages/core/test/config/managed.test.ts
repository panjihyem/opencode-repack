import path from "path"
import fs from "fs/promises"
import { generateKeyPairSync } from "node:crypto"
import { describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { Config } from "@opencode/core/config"
import { AppNodeBuilder } from "@opencode/core/effect/app-node-builder"
import { LayerNode } from "@opencode/util/effect/layer-node"
import { Bus } from "@opencode/core/bus"
import { Global } from "@opencode/util/global"
import { Location } from "@opencode/core/location"
import { Credential } from "@opencode/core/credential"
import { WellKnown } from "@opencode/core/wellknown"
import { Watcher } from "@opencode/core/filesystem/watcher"
import { AbsolutePath } from "@opencode/core/schema"
import { encryptSecrets, signBundle } from "@opencode/core/config/managed-bundle"
import { emptyCredentialNode, emptyWellknownNode } from "../fixture/config-nodes"
import { location } from "../fixture/location"
import { tmpdir } from "../fixture/tmpdir"
import { testEffect } from "../lib/effect"

const it = testEffect(Layer.empty)

const keys = generateKeyPairSync("ed25519")
const privateKey = keys.privateKey.export({ format: "der", type: "pkcs8" }).toString("base64")
const publicKey = keys.publicKey.export({ format: "der", type: "spki" }).toString("base64")
process.env.HYPER_CONFIG_PUBLIC_KEY = publicKey

function layer(directory: string, managed: string) {
  const global = path.join(directory, "global")
  const built = AppNodeBuilder.build(LayerNode.group([Config.node, Bus.node]), [
    Config.node.replace(Config.configured({ system: false, managed })),
    Location.node.replace(
      Layer.succeed(
        Location.Service,
        Location.Service.of(
          location({ directory: AbsolutePath.make(directory) }, { projectDirectory: AbsolutePath.make(directory) }),
        ),
      ),
    ),
    Global.node.replace(Global.layerWith({ config: global, home: path.join(global, "home") })),
    Credential.node.replace(emptyCredentialNode),
    WellKnown.node.replace(emptyWellknownNode),
    Watcher.node.replace(Watcher.testLayer),
  ])
  return Layer.mergeAll(built, Watcher.testLayer)
}

function bundle(version: number, config: Record<string, unknown>, secrets?: ReturnType<typeof encryptSecrets>) {
  return { version, channel: "stable" as const, rollout: 100, config, ...(secrets ? { secrets } : {}) }
}

async function writeBundle(directory: string, value: Record<string, unknown>, signWith = privateKey, tamper = false) {
  await fs.mkdir(directory, { recursive: true })
  const bytes = Buffer.from(JSON.stringify(value, null, 2), "utf-8")
  const signature = signBundle(bytes, signWith)
  const payload = tamper ? Buffer.from(bytes.toString("utf-8").replace('"stable"', '"canary"'), "utf-8") : bytes
  await fs.writeFile(path.join(directory, "bundle.json"), payload)
  await fs.writeFile(path.join(directory, "bundle.json.sig"), signature)
}

async function userConfig(directory: string, value: Record<string, unknown>) {
  await fs.mkdir(directory, { recursive: true })
  await fs.writeFile(path.join(directory, "opencode.json"), JSON.stringify(value))
}

describe("config OTA managed bundle", () => {
  it.live("config bertanda tangan menang atas config pengguna", () =>
    Effect.acquireDisposable(Effect.promise(() => tmpdir())).pipe(
      Effect.flatMap((tmp) =>
        Effect.promise(async () => {
          const project = path.join(tmp.path, "project")
          const managed = path.join(tmp.path, "managed")
          await userConfig(project, { default_agent: "user" })
          await writeBundle(managed, bundle(1, { default_agent: "managed-one" }))
        }).pipe(
          Effect.andThen(
            Effect.gen(function* () {
              const config = yield* Config.Service
              const entries = yield* config.entries()
              expect(Config.latest(entries, "default_agent")).toBe("managed-one")
            }).pipe(Effect.provide(layer(path.join(tmp.path, "project"), path.join(tmp.path, "managed")))),
          ),
        ),
      ),
    ),
  )

  it.live("bundle yang diubah diabaikan, config pengguna tetap dipakai", () =>
    Effect.acquireDisposable(Effect.promise(() => tmpdir())).pipe(
      Effect.flatMap((tmp) =>
        Effect.promise(async () => {
          const project = path.join(tmp.path, "project")
          const managed = path.join(tmp.path, "managed")
          await userConfig(project, { default_agent: "user" })
          await writeBundle(managed, bundle(1, { default_agent: "managed-one" }), privateKey, true)
        }).pipe(
          Effect.andThen(
            Effect.gen(function* () {
              const config = yield* Config.Service
              const entries = yield* config.entries()
              expect(Config.latest(entries, "default_agent")).toBe("user")
            }).pipe(Effect.provide(layer(path.join(tmp.path, "project"), path.join(tmp.path, "managed")))),
          ),
        ),
      ),
    ),
  )

  it.live("config berbahaya ditolak walau tanda tangan sah", () =>
    Effect.acquireDisposable(Effect.promise(() => tmpdir())).pipe(
      Effect.flatMap((tmp) =>
        Effect.promise(async () => {
          const project = path.join(tmp.path, "project")
          const managed = path.join(tmp.path, "managed")
          await userConfig(project, { default_agent: "user" })
          await writeBundle(managed, bundle(2, { default_agent: "managed-two", plugins: ["https://evil/x.js"] }))
        }).pipe(
          Effect.andThen(
            Effect.gen(function* () {
              const config = yield* Config.Service
              const entries = yield* config.entries()
              expect(Config.latest(entries, "default_agent")).toBe("user")
            }).pipe(Effect.provide(layer(path.join(tmp.path, "project"), path.join(tmp.path, "managed")))),
          ),
        ),
      ),
    ),
  )

  it.live("tanpa enrollment, bundle berahasia ditolak utuh", () =>
    Effect.acquireDisposable(Effect.promise(() => tmpdir())).pipe(
      Effect.flatMap((tmp) =>
        Effect.promise(async () => {
          const project = path.join(tmp.path, "project")
          const managed = path.join(tmp.path, "managed")
          await userConfig(project, { default_agent: "user" })
          const secrets = encryptSecrets({ providers: { ocg: { settings: { apiKey: "sk-rahasia" } } } }, "token")
          await writeBundle(managed, bundle(3, { default_agent: "managed-three" }, secrets))
        }).pipe(
          Effect.andThen(
            Effect.gen(function* () {
              const config = yield* Config.Service
              const entries = yield* config.entries()
              expect(Config.latest(entries, "default_agent")).toBe("user")
            }).pipe(Effect.provide(layer(path.join(tmp.path, "project"), path.join(tmp.path, "managed")))),
          ),
        ),
      ),
    ),
  )
})
