import { expect, test } from "bun:test"
import { approvedFallback } from "../../files/desktop/hyper/agent-fallback"
import type { ProjectPolicy } from "../../files/desktop/hyper/agent-policy"

test("public-only fallback rejects all non-public routes and ambiguous delivery", () => {
  const p: ProjectPolicy = {
    project: "case-a",
    routes: ["cx/gpt-6-sol", "cx/gpt-6-luna"].map((model, index) => ({ role: "investigator", dataClass: "case-original", model, files: ["case.json"], tools: ["read"], consentId: `c${index}` })),
    consent: ["cx/gpt-6-sol", "cx/gpt-6-luna"].map((model, index) => ({ id: `c${index}`, project: "case-a", dataClass: "case-original", model, files: ["case.json"], expiresAt: "2030-01-01T00:00:00Z" })),
  }
  const request = { project: "case-a", role: "investigator" as const, dataClass: "case-original" as const, model: "cx/gpt-6-sol", files: ["case.json"], tools: ["read"] }
  expect(() => approvedFallback(p, request, ["ocg/mimo-v2.5-pro", "cx/gpt-6-luna"], "not-sent")).toThrow("public-only")
  expect(() => approvedFallback(p, request, ["ocg/mimo-v2.5-pro"], "not-sent")).toThrow("public-only")
  const publicRequest = { ...request, role: "explorer" as const, dataClass: "public" as const, model: "ocg/minimax-m3", files: ["public.md"] }
  p.routes = [
    { role: "explorer", dataClass: "public", model: "ocg/minimax-m3", files: ["public.md"], tools: ["read"] },
    { role: "explorer", dataClass: "public", model: "ocg/mimo-v2.5-pro", files: ["public.md"], tools: ["read"] },
  ]
  expect(() => approvedFallback(p, publicRequest, ["ocg/mimo-v2.5-pro"], "ambiguous")).toThrow("Delivery uncertain")
  expect(() => approvedFallback(p, publicRequest, ["ocg/mimo-v2.5-pro"], "accepted")).toThrow("Delivery uncertain")
  expect(approvedFallback(p, publicRequest, ["ocg/mimo-v2.5-pro"], "not-sent")).toBe("ocg/mimo-v2.5-pro")
})
