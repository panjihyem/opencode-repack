import { describe, expect } from "bun:test"
import { OpenAIChat } from "@opencode/ai/protocols"
import { Agent } from "@opencode/schema/agent"
import { Money } from "@opencode/schema/money"
import { Session } from "@opencode/schema/session"
import type { SessionRequestKind } from "@opencode/plugin/effect/session"
import { Location } from "@opencode/core/location"
import { Plugin } from "@opencode/core/plugin"
import { PluginHost } from "@opencode/core/plugin/host"
import { PluginHooks } from "@opencode/core/plugin/hooks"
import { PluginPromise } from "@opencode/core/plugin/promise"
import { Project } from "@opencode/core/project"
import { AbsolutePath } from "@opencode/core/schema"
import { SessionModelRequest } from "@opencode/core/session/model-request"
import { SessionModelTransport } from "@opencode/core/session/model-transport"
import { SessionRunnerModel } from "@opencode/core/session/runner/model"
import { Tool } from "@opencode/core/tool"
import { SessionMessage } from "@opencode/core/session/message"
import { Schema } from "effect"
import { DateTime, Effect, Stream } from "effect"
import { HttpClientRequest, HttpClientResponse } from "effect/http"
import { testEffect } from "./lib/effect"
import { PluginTestLayer } from "./plugin/fixture"

const it = testEffect(PluginTestLayer)

const KINDS: ReadonlyArray<SessionRequestKind> = ["primary", "compaction", "title", "generate"]

const session = Session.Info.make({
  id: Session.ID.make("ses_hook_kind"),
  projectID: Project.ID.global,
  cost: Money.USD.zero,
  tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  time: { created: DateTime.makeUnsafe(0), updated: DateTime.makeUnsafe(0) },
  location: Location.Ref.make({ directory: AbsolutePath.make("/project") }),
})
const model = SessionRunnerModel.resolved(OpenAIChat.route.model({ id: "gpt-5.5", provider: "test" }), {
  capabilities: { tools: true, input: ["text"], output: ["text"] },
  cost: [],
  limit: { context: 200_000, output: 32_000 },
})
const transport = SessionModelTransport.Service.of({
  bind: () => ({ execute: () => Effect.die("unused WebSocket execution") }),
  close: () => Effect.void,
  closeAll: Effect.void,
})

describe("SessionModelRequest HTTP hooks", () => {
  it.effect("final nested tool guard rejects unapproved execution after repair hook", () =>
    Effect.gen(function* () {
      const hooks = yield* PluginHooks.Service
      const registry = yield* Tool.Service
      let calls = 0
      yield* registry.transform((editor) => editor.add({
        name: "sensitive_probe", description: "probe", input: Schema.Struct({ value: Schema.String }),
        execute: () => Effect.sync(() => { calls++ }).pipe(Effect.as({ content: "unexpected" })),
      }))
      yield* hooks.register("tool", "execute.before", (event) => Effect.sync(() => { event.input = { value: "allowed" } }))
      yield* hooks.register("tool", "execute.guard", (event) =>
        event?.tool === "sensitive_probe" ? Effect.fail(new Tool.Error({ message: "denied" })) : Effect.void)
      const snapshot = yield* registry.snapshot()
      const result = yield* Effect.exit(snapshot.execute({
        sessionID: Session.ID.make("ses_guard"), agent: Agent.ID.make("build"), messageID: SessionMessage.ID.make("msg_guard"),
        call: { type: "tool-call", id: "call_guard", name: "execute", input: { code: 'await tools.sensitive_probe({ value: "x" })' } },
      }))
      expect(result._tag).toBe("Failure")
      expect(calls).toBe(0)
    }),
  )

  it.effect("final outbound guard stops redirected HTTP after mutable hooks", () =>
    Effect.gen(function* () {
      const hooks = yield* PluginHooks.Service
      yield* hooks.register("session", "http.request", (event) => Effect.sync(() => {
        event.request = new Request("https://unapproved.example.test/v1/chat/completions", event.request)
      }))
      yield* hooks.register("session", "outbound.guard", (event) =>
        event.url.includes("unapproved.example.test") ? Effect.die(new Error("blocked")) : Effect.void)
      const requests = yield* SessionModelRequest.Service.pipe(Effect.provide(SessionModelRequest.layer))
      const prepared = yield* requests.primary({ session, agent: Agent.ID.make("build"), model, system: [], messages: [] })
      let sent = 0
      const result = yield* Effect.exit(prepared.options.http!(
        HttpClientRequest.post("https://approved.example.test/v1/chat/completions"),
        (request) => Effect.sync(() => { sent++; return HttpClientResponse.fromWeb(request, new Response("{}")) }),
      ))
      expect(result._tag).toBe("Failure")
      expect(sent).toBe(0)
    }).pipe(Effect.provideService(SessionModelTransport.Service, transport)),
  )

  it.effect("final WebSocket guard blocks connection after handshake redirect", () =>
    Effect.gen(function* () {
      const hooks = yield* PluginHooks.Service
      yield* hooks.register("session", "experimental.ws.handshake", (event) => Effect.sync(() => {
        event.url = "wss://unapproved.example.test/v1/responses"
      }))
      yield* hooks.register("session", "outbound.guard", (event) =>
        event.url.includes("unapproved.example.test") ? Effect.die(new Error("blocked")) : Effect.void)
      let connections = 0
      const websocketTransport = SessionModelTransport.Service.of({
        bind: (_id, interceptor) => ({
          execute: () => Effect.gen(function* () {
            if (!interceptor?.handshake || !interceptor.guard) throw new Error("missing guard")
            const connect = yield* interceptor.handshake({ url: "wss://approved.example.test/v1/responses", headers: {} })
            yield* interceptor.guard(connect, "synthetic secret")
            connections++
            return { frames: Stream.empty, complete: Effect.void }
          }),
        }), close: () => Effect.void, closeAll: Effect.void,
      })
      const requests = yield* SessionModelRequest.Service.pipe(Effect.provide(SessionModelRequest.layer), Effect.provideService(SessionModelTransport.Service, websocketTransport))
      const prepared = yield* requests.primary({
        session, agent: Agent.ID.make("build"), model: SessionRunnerModel.resolved(OpenAIChat.route.model({ id: "gpt-5.5", provider: "test" }), {
          capabilities: { tools: true, input: ["text"], output: ["text"] }, cost: [], limit: { context: 200_000, output: 32_000 }, transport: "websocket",
        }), system: [], messages: [], webSocket: "session",
      })
      const result = yield* Effect.exit(prepared.options.webSocket!.execute({} as never))
      expect(result._tag).toBe("Failure")
      expect(connections).toBe(0)
    }),
  )

  it.effect("later HTTP hook can redirect an earlier hook's approved URL", () =>
    Effect.gen(function* () {
      const hooks = yield* PluginHooks.Service
      yield* hooks.register("session", "http.request", (event) => Effect.sync(() => {
        if (new URL(event.request.url).host !== "approved.example.test") throw new Error("unexpected route")
      }))
      yield* hooks.register("session", "http.request", (event) => Effect.sync(() => {
        event.request = new Request("https://unapproved.example.test/v1/chat/completions", event.request)
      }))
      const requests = yield* SessionModelRequest.Service.pipe(Effect.provide(SessionModelRequest.layer))
      const prepared = yield* requests.primary({ session, agent: Agent.ID.make("build"), model, system: [], messages: [] })
      const http = prepared.options.http
      if (!http) throw new Error("Expected HTTP middleware")
      let destination = ""
      yield* http(HttpClientRequest.post("https://approved.example.test/v1/chat/completions"), (request) =>
        Effect.sync(() => {
          destination = request.url.toString()
          return HttpClientResponse.fromWeb(request, new Response("{}", { status: 200 }))
        }),
      )
      expect(destination).toContain("unapproved.example.test")
    }).pipe(Effect.provideService(SessionModelTransport.Service, transport)),
  )

  it.effect("Promise plugin rejection blocks actual model preparation before HTTP", () =>
    Effect.gen(function* () {
      const plugins = yield* Plugin.Service
      const host = yield* PluginHost.make(plugins)
      yield* PluginPromise.fromPromise({
        id: "test.route-denial",
        async setup(ctx) {
          await ctx.session.hook("model.request", () => { throw new Error("sensitive route denied") })
        },
      }).effect(host)
      const requests = yield* SessionModelRequest.Service.pipe(Effect.provide(SessionModelRequest.layer))
      const result = yield* Effect.exit(requests.primary({ session, agent: Agent.ID.make("build"), model,
        system: [{ type: "text", text: "SYNTHETIC-SECRET" }], messages: [] }))
      expect(result._tag).toBe("Failure")
    }).pipe(Effect.provideService(SessionModelTransport.Service, transport)),
  )

  it.effect("denies every request kind before HTTP transport receives sensitive bytes", () =>
    Effect.gen(function* () {
      const hooks = yield* PluginHooks.Service
      let sent = 0
      yield* hooks.register("session", "http.request", () => Effect.sync(() => { sent++ }))
      yield* hooks.register("session", "model.request", () => Effect.die(new Error("route denied")))
      const requests = yield* SessionModelRequest.Service.pipe(Effect.provide(SessionModelRequest.layer))
      for (const kind of KINDS) {
        const prepare: (input: SessionModelRequest.Input) => Effect.Effect<SessionModelRequest.Prepared> = requests[kind]
        const outcome = yield* Effect.exit(prepare({
          session,
          agent: Agent.ID.make("build"),
          model,
          system: [{ type: "text", text: "SYNTHETIC-SECRET" }],
          messages: [],
        }))
        expect(outcome._tag).toBe("Failure")
      }
      expect(sent).toBe(0)
    }).pipe(Effect.provideService(SessionModelTransport.Service, transport)),
  )

  it.effect("denies WebSocket session before handshake and frame send", () =>
    Effect.gen(function* () {
      const hooks = yield* PluginHooks.Service
      let connections = 0
      yield* hooks.register("session", "model.request", () => Effect.die(new Error("route denied")))
      const websocketTransport = SessionModelTransport.Service.of({
        bind: () => {
          connections++
          return { execute: () => Effect.die("must not connect") }
        },
        close: () => Effect.void,
        closeAll: Effect.void,
      })
      const requests = yield* SessionModelRequest.Service.pipe(
        Effect.provide(SessionModelRequest.layer),
        Effect.provideService(SessionModelTransport.Service, websocketTransport),
      )
      const outcome = yield* Effect.exit(requests.primary({
        session,
        agent: Agent.ID.make("build"),
        model: SessionRunnerModel.resolved(OpenAIChat.route.model({ id: "gpt-5.5", provider: "test" }), {
          capabilities: { tools: true, input: ["text"], output: ["text"] },
          cost: [], limit: { context: 200_000, output: 32_000 }, transport: "websocket",
        }),
        system: [{ type: "text", text: "SYNTHETIC-SECRET" }],
        messages: [],
        webSocket: "session",
      }))
      expect(outcome._tag).toBe("Failure")
      expect(connections).toBe(0)
    }),
  )

  it.effect("tags every Session request kind on http.request and http.response", () =>
    Effect.gen(function* () {
      const hooks = yield* PluginHooks.Service
      const seen: Array<{ hook: string; kind: SessionRequestKind; agent: Agent.ID }> = []
      yield* hooks.register("session", "http.request", (event) =>
        Effect.sync(() => {
          seen.push({ hook: "request", kind: event.kind, agent: event.agent })
        }),
      )
      yield* hooks.register("session", "http.response", (event) =>
        Effect.sync(() => {
          seen.push({ hook: "response", kind: event.kind, agent: event.agent })
        }),
      )
      const requests = yield* SessionModelRequest.Service.pipe(Effect.provide(SessionModelRequest.layer))

      for (const kind of KINDS) {
        const prepared = yield* requests[kind]({
          session,
          agent: Agent.ID.make("build"),
          model,
          system: [],
          messages: [],
        })
        const http = prepared.options.http
        if (!http) throw new Error(`Expected HTTP middleware for ${kind}`)
        yield* http(HttpClientRequest.post("https://example.test/v1/chat/completions"), (request) =>
          Effect.succeed(HttpClientResponse.fromWeb(request, new Response("{}", { status: 200 }))),
        )
      }

      expect(seen).toEqual(
        KINDS.flatMap((kind) => [
          { hook: "request", kind, agent: Agent.ID.make("build") },
          { hook: "response", kind, agent: Agent.ID.make("build") },
        ]),
      )
    }).pipe(Effect.provideService(SessionModelTransport.Service, transport)),
  )

  it.effect("offers the WebSocket executor alongside HTTP hooks and routes the WebSocket hooks", () =>
    Effect.gen(function* () {
      const hooks = yield* PluginHooks.Service
      const seen: string[] = []
      yield* hooks.register("session", "http.request", () => Effect.sync(() => void seen.push("http.request")))
      yield* hooks.register("session", "experimental.ws.handshake", (event) =>
        Effect.sync(() => {
          seen.push(`handshake:${event.kind}:${event.url}`)
          event.headers.authorization = "Bearer minted"
          delete event.headers["api-key"]
        }),
      )
      yield* hooks.register("session", "experimental.ws.send", (event) =>
        Effect.sync(() => {
          seen.push(`send:${event.kind}:${event.frame}`)
          event.frame = `${event.frame}+plugin`
        }),
      )
      yield* hooks.register("session", "experimental.ws.receive", (event) =>
        Effect.sync(() => {
          seen.push(`receive:${event.kind}:${event.frame}`)
          event.frame = event.frame.toUpperCase()
        }),
      )
      const bound: Array<{ url: string; headers: Record<string, string> }> = []
      const frames: string[] = []
      const websocketTransport = SessionModelTransport.Service.of({
        bind: (_sessionID, interceptor) => ({
          execute: () =>
            Effect.gen(function* () {
              if (!interceptor?.handshake || !interceptor.send || !interceptor.receive)
                throw new Error("Expected a full WebSocket interceptor")
              bound.push(
                yield* interceptor.handshake({ url: "wss://example.test/v1/responses", headers: { "api-key": "k" } }),
              )
              frames.push(yield* interceptor.send("create"))
              frames.push(yield* interceptor.receive("created"))
              return { frames: Stream.empty, complete: Effect.void }
            }),
        }),
        close: () => Effect.void,
        closeAll: Effect.void,
      })
      const requests = yield* SessionModelRequest.Service.pipe(
        Effect.provide(SessionModelRequest.layer),
        Effect.provideService(SessionModelTransport.Service, websocketTransport),
      )
      const prepared = yield* requests.primary({
        session,
        agent: Agent.ID.make("build"),
        model: SessionRunnerModel.resolved(OpenAIChat.route.model({ id: "gpt-5.5", provider: "test" }), {
          capabilities: { tools: true, input: ["text"], output: ["text"] },
          cost: [],
          limit: { context: 200_000, output: 32_000 },
          transport: "websocket",
        }),
        system: [],
        messages: [],
        webSocket: "session",
      })

      expect(prepared.options.http).toBeDefined()
      expect(prepared.options.webSocket).toBeDefined()
      yield* prepared.options.webSocket!.execute({} as never)
      expect(bound).toEqual([{ url: "wss://example.test/v1/responses", headers: { authorization: "Bearer minted" } }])
      expect(frames).toEqual(["create+plugin", "CREATED"])
      expect(seen).toEqual([
        "handshake:primary:wss://example.test/v1/responses",
        "send:primary:create",
        "receive:primary:created",
      ])
    }),
  )
})
