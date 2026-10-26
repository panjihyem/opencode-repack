import { expect, test } from "bun:test"
import { guardOutbound, guardTool } from "../../files/desktop/hyper/agent-guard"
import type { GuardScope } from "../../files/desktop/hyper/agent-guard"

const scope: GuardScope = {
  endpoint: "https://approved.example.test/v1",
  request: { project: "p", role: "explorer", dataClass: "public", model: "ocg/minimax-m3", files: ["public.md"], tools: ["read"] },
  policy: {
    project: "p",
    routes: [{ role: "explorer", dataClass: "public", model: "ocg/minimax-m3", files: ["public.md"], tools: ["read"] }],
    consent: [],
  },
}

test("public route rejects provider, endpoint, secret attachment and tool switch", () => {
  const allowed = { model: "ocg/minimax-m3", url: "https://approved.example.test/v1/chat/completions", payload: "synthetic" }
  expect(() => guardOutbound(scope, allowed)).not.toThrow()
  expect(() => guardOutbound(scope, { ...allowed, model: "ocg/mimo-v2.6-flash" })).toThrow()
  expect(() => guardOutbound(scope, { ...allowed, url: "https://other.example.test/v1/chat/completions" })).toThrow()
  expect(() => guardOutbound(scope, { ...allowed, transport: "websocket", url: "wss://approved.example.test/v1/responses" })).not.toThrow()
  expect(() => guardOutbound(scope, { ...allowed, transport: "websocket", url: "wss://other.example.test/v1/responses" })).toThrow()
  expect(() => guardOutbound(scope, { ...allowed, payload: "include tokens.json" })).toThrow()
  expect(() => guardTool(scope, "read")).not.toThrow()
  expect(() => guardTool(scope, "execute")).toThrow()
})
