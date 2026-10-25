import { expect, test } from "bun:test"
import { guardOutbound, guardTool } from "../../files/desktop/hyper/agent-guard"
import type { GuardScope } from "../../files/desktop/hyper/agent-guard"

const scope: GuardScope = {
  endpoint: "https://approved.example.test/v1",
  request: { project: "p", role: "investigator", dataClass: "case-original", model: "cx/gpt-6-sol", files: ["case.json"], tools: ["read"] },
  policy: {
    project: "p",
    routes: [{ role: "investigator", dataClass: "case-original", model: "cx/gpt-6-sol", files: ["case.json"], tools: ["read"], consentId: "ok" }],
    consent: [{ id: "ok", project: "p", dataClass: "case-original", model: "cx/gpt-6-sol", files: ["case.json"], expiresAt: "2030-01-01T00:00:00Z" }],
  },
}

test("consented GPT route rejects provider, endpoint, secret attachment and tool switch", () => {
  const allowed = { model: "cx/gpt-6-sol", url: "https://approved.example.test/v1/chat/completions", payload: "synthetic" }
  expect(() => guardOutbound(scope, allowed)).not.toThrow()
  expect(() => guardOutbound(scope, { ...allowed, model: "ocg/mimo-v2.6-flash" })).toThrow()
  expect(() => guardOutbound(scope, { ...allowed, url: "https://other.example.test/v1/chat/completions" })).toThrow()
  expect(() => guardOutbound(scope, { ...allowed, payload: "include tokens.json" })).toThrow()
  expect(() => guardTool(scope, "read")).not.toThrow()
  expect(() => guardTool(scope, "execute")).toThrow()
})
