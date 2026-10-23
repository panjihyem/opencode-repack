import path from "path"
import fs from "fs/promises"
import { generateKeyPairSync } from "node:crypto"
import { afterAll, describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { signBundle } from "@opencode/core/config/managed-bundle"
import { readState } from "@opencode/core/config/managed-apply"
import { checkForConfigUpdate } from "@opencode/core/config/updater"
import { tmpdir } from "../fixture/tmpdir"
import { testEffect } from "../lib/effect"

const it = testEffect(Layer.empty)
const keys = generateKeyPairSync("ed25519")
const privateKey = keys.privateKey.export({ format: "der", type: "pkcs8" }).toString("base64")
const publicKey = keys.publicKey.export({ format: "der", type: "spki" }).toString("base64")

function signed(version: number, channel: "stable" | "beta" = "stable") {
  const value = {
    version,
    channel,
    rollout: 100,
    config: { default_agent: `managed-${version}` },
  }
  const bytes = Buffer.from(JSON.stringify(value, null, 2), "utf-8")
  return { bytes, signature: signBundle(bytes, privateKey) }
}

const state = { bytes: Buffer.alloc(0), signature: "", etag: '"v0"' }
const server = Bun.serve({
  port: 0,
  fetch(request) {
    const url = new URL(request.url)
    if (url.pathname.endsWith("/bundle.json")) {
      if (request.headers.get("if-none-match") === state.etag) return new Response(null, { status: 304 })
      return new Response(state.bytes, { headers: { etag: state.etag, "content-type": "application/json" } })
    }
    if (url.pathname.endsWith("/bundle.json.sig")) return new Response(state.signature)
    return new Response("not found", { status: 404 })
  },
})

afterAll(() => server.stop(true))

describe("config OTA updater", () => {
  it.live("mengunduh, menerapkan, lalu 304 tidak mengubah apa pun", () =>
    Effect.acquireDisposable(Effect.promise(() => tmpdir())).pipe(
      Effect.flatMap((tmp) =>
        Effect.promise(async () => {
          const first = signed(1)
          state.bytes = first.bytes
          state.signature = first.signature
          state.etag = '"v1"'
          const dir = path.join(tmp.path, "managed")
          const options = {
            dir,
            channel: "stable" as const,
            appVersion: "2.1.0",
            publicKey,
            allowedPackages: [],
            baseUrl: `http://localhost:${server.port}`,
          }
          const firstResult = await checkForConfigUpdate(options)
          expect(firstResult.status).toBe("applied")
          expect(readState(dir)?.version).toBe(1)

          const second = await checkForConfigUpdate(options)
          expect(second.status).toBe("up-to-date")
          expect(readState(dir)?.version).toBe(1)
          await fs.access(path.join(dir, "etag-stable.json"))
        }),
      ),
    ),
  )

  it.live("304 dengan file lokal hilang mengunduh ulang", () =>
    Effect.acquireDisposable(Effect.promise(() => tmpdir())).pipe(
      Effect.flatMap((tmp) =>
        Effect.promise(async () => {
          const first = signed(7)
          state.bytes = first.bytes
          state.signature = first.signature
          state.etag = '"v7"'
          const dir = path.join(tmp.path, "managed")
          const options = {
            dir,
            channel: "stable" as const,
            appVersion: "2.1.0",
            publicKey,
            allowedPackages: [],
            baseUrl: `http://localhost:${server.port}`,
          }
          expect((await checkForConfigUpdate(options)).status).toBe("applied")
          await fs.rm(path.join(dir, "bundle.json"))
          await fs.rm(path.join(dir, "bundle.json.sig"))
          const recovered = await checkForConfigUpdate(options)
          expect(recovered.status).toBe("applied")
          await fs.access(path.join(dir, "bundle.json"))
          await fs.access(path.join(dir, "bundle.json.sig"))
        }),
      ),
    ),
  )

  it.live("menghapus .sig tidak membuka downgrade, tetapi versi sama dipulihkan", () =>
    Effect.acquireDisposable(Effect.promise(() => tmpdir())).pipe(
      Effect.flatMap((tmp) =>
        Effect.promise(async () => {
          const dir = path.join(tmp.path, "managed")
          const options = {
            dir,
            channel: "stable" as const,
            appVersion: "2.1.0",
            publicKey,
            allowedPackages: [],
            baseUrl: `http://localhost:${server.port}`,
          }
          const current = signed(9)
          state.bytes = current.bytes
          state.signature = current.signature
          state.etag = '"v9"'
          expect((await checkForConfigUpdate(options)).status).toBe("applied")

          await fs.rm(path.join(dir, "bundle.json.sig"))
          const older = signed(8)
          state.bytes = older.bytes
          state.signature = older.signature
          state.etag = '"v8"'
          const downgrade = await checkForConfigUpdate(options)
          expect(downgrade.status).toBe("skipped")
          expect(readState(dir)?.version).toBe(9)

          state.bytes = current.bytes
          state.signature = current.signature
          state.etag = '"v9-lagi"'
          const repair = await checkForConfigUpdate(options)
          expect(repair.status).toBe("applied")
          await fs.access(path.join(dir, "bundle.json.sig"))
        }),
      ),
    ),
  )

  it.live("bundle dari channel lain ditolak", () =>
    Effect.acquireDisposable(Effect.promise(() => tmpdir())).pipe(
      Effect.flatMap((tmp) =>
        Effect.promise(async () => {
          const beta = signed(8, "beta")
          state.bytes = beta.bytes
          state.signature = beta.signature
          state.etag = '"v8-beta"'
          const dir = path.join(tmp.path, "managed")
          const result = await checkForConfigUpdate({
            dir,
            channel: "stable",
            appVersion: "2.1.0",
            publicKey,
            allowedPackages: [],
            baseUrl: `http://localhost:${server.port}`,
          })
          expect(result.status).toBe("skipped")
          expect(result.reason).toContain("channel beta")
          expect(readState(dir)).toBeUndefined()
        }),
      ),
    ),
  )

  it.live("versi baru diterapkan, bundle yang diubah ditolak", () =>
    Effect.acquireDisposable(Effect.promise(() => tmpdir())).pipe(
      Effect.flatMap((tmp) =>
        Effect.promise(async () => {
          const dir = path.join(tmp.path, "managed")
          const options = {
            dir,
            channel: "stable" as const,
            appVersion: "2.1.0",
            publicKey,
            allowedPackages: [],
            baseUrl: `http://localhost:${server.port}`,
          }
          const first = signed(3)
          state.bytes = first.bytes
          state.signature = first.signature
          state.etag = '"v3"'
          expect((await checkForConfigUpdate(options)).status).toBe("applied")

          const second = signed(4)
          state.bytes = Buffer.from(second.bytes.toString("utf-8").replace("stable", "canary"), "utf-8")
          state.signature = second.signature
          state.etag = '"v4-rusak"'
          const rejected = await checkForConfigUpdate(options)
          expect(rejected.status).toBe("error")
          expect(readState(dir)?.version).toBe(3)
        }),
      ),
    ),
  )

  it.live("aset hilang menghasilkan error, bukan melempar", () =>
    Effect.acquireDisposable(Effect.promise(() => tmpdir())).pipe(
      Effect.flatMap((tmp) =>
        Effect.promise(async () => {
          const missing = Bun.serve({ port: 0, fetch: () => new Response("nope", { status: 404 }) })
          try {
            const result = await checkForConfigUpdate({
              dir: path.join(tmp.path, "managed"),
              channel: "stable",
              appVersion: "2.1.0",
              publicKey,
              allowedPackages: [],
              baseUrl: `http://localhost:${missing.port}`,
            })
            expect(result.status).toBe("error")
            expect(result.reason).toContain("404")
          } finally {
            missing.stop(true)
          }
        }),
      ),
    ),
  )

  it.live("server mati menghasilkan error tanpa melempar", () =>
    Effect.acquireDisposable(Effect.promise(() => tmpdir())).pipe(
      Effect.flatMap((tmp) =>
        Effect.promise(async () => {
          const result = await checkForConfigUpdate({
            dir: path.join(tmp.path, "managed"),
            channel: "stable",
            appVersion: "2.1.0",
            publicKey,
            allowedPackages: [],
            baseUrl: "http://127.0.0.1:1",
          })
          expect(result.status).toBe("error")
          expect(result.reason).toContain("gagal mengunduh")
        }),
      ),
    ),
  )
})
