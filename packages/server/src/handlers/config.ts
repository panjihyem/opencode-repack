import { Config } from "@opencode/core/config"
import { ShellSelect } from "@opencode/core/shell/select"
import { Document, Info, type Entry } from "@opencode/schema/config"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { Api } from "../api"

/**
 * `config.get` melayani UI/SDK, bukan provider yang benar-benar memanggil model.
 * API key yang berasal dari config OTA (maupun config pengguna) tidak boleh ikut
 * terkirim ke klien: cukup penanda bahwa nilainya ada.
 */
function redact(entry: Entry): Entry {
  if (entry.type !== "document" || !entry.info.providers) return entry
  const providers = Object.fromEntries(
    Object.entries(entry.info.providers).map(([id, provider]) => {
      if (!provider.settings || typeof provider.settings.apiKey !== "string") return [id, provider]
      return [id, { ...provider, settings: { ...provider.settings, apiKey: "***" } }]
    }),
  )
  return new Document({ type: "document", path: entry.path, info: new Info({ ...entry.info, providers }) })
}

export const ConfigHandler = HttpApiBuilder.group(Api, "server.config", (handlers) =>
  handlers
    .handle("config.get", () =>
      Config.Service.use((config) => config.entries().pipe(Effect.map((entries) => entries.map(redact)))),
    )
    .handle(
      "config.update",
      Effect.fn(function* (ctx) {
        const config = yield* Config.Service
        if (!config.update) return yield* Effect.die(new Error("Config updates are unavailable"))
        return yield* config.update(ctx.payload).pipe(Effect.orDie)
      }),
    )
    .handle(
      "config.shells",
      Effect.fn(function* () {
        const shell = yield* ShellSelect.Service
        if (!shell.list) return yield* Effect.die(new Error("Shell discovery is unavailable"))
        return yield* shell.list()
      }),
    ),
)
