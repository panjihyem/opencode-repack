import { expect, test } from "bun:test"
import { approvedFallback } from "../../files/desktop/hyper/agent-fallback"
import type { ProjectPolicy } from "../../files/desktop/hyper/agent-policy"

test("case fallback rejects MiMo and only selects explicitly consented GPT", () => {
  const p: ProjectPolicy = {
    project: "case-a",
    routes: ["cx/gpt-6-sol", "cx/gpt-6-luna"].map((model, index) => ({ role: "investigator", dataClass: "case-original", model, files: ["case.json"], tools: ["read"], consentId: `c${index}` })),
    consent: ["cx/gpt-6-sol", "cx/gpt-6-luna"].map((model, index) => ({ id: `c${index}`, project: "case-a", dataClass: "case-original", model, files: ["case.json"], expiresAt: "2030-01-01T00:00:00Z" })),
  }
  const request = { project: "case-a", role: "investigator" as const, dataClass: "case-original" as const, model: "cx/gpt-6-sol", files: ["case.json"], tools: ["read"] }
  expect(approvedFallback(p, request, ["ocg/mimo-v2.5-pro", "cx/gpt-6-luna"], "not-sent")).toBe("cx/gpt-6-luna")
  expect(() => approvedFallback(p, request, ["ocg/mimo-v2.5-pro"], "not-sent")).toThrow("No approved fallback")
  expect(() => approvedFallback(p, request, ["cx/gpt-6-luna"], "ambiguous")).toThrow("Delivery uncertain")
  expect(() => approvedFallback(p, request, ["cx/gpt-6-luna"], "accepted")).toThrow("Delivery uncertain")
  p.consent.pop()
  expect(() => approvedFallback(p, request, ["cx/gpt-6-luna"], "not-sent")).toThrow("No approved fallback")
})
