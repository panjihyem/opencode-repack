import { expect, test } from "bun:test"
import { authorizeRoute, validatePolicy, type ProjectPolicy } from "../files/desktop/hyper/agent-policy"

const policy = (): ProjectPolicy => ({
  project: "case-a",
  routes: [
    { role: "explorer", dataClass: "public", model: "ocg/minimax-m3", files: ["public.md"], tools: ["read"] },
    { role: "investigator", dataClass: "case-original", model: "cx/gpt-6-sol", files: ["case.json"], tools: ["read"], consentId: "approval-1" },
  ],
  consent: [{ id: "approval-1", project: "case-a", dataClass: "case-original", model: "cx/gpt-6-sol", files: ["case.json"], expiresAt: "2030-01-01T00:00:00Z" }],
})

test("public MiniMax and explicitly approved GPT case routes", () => {
  expect(authorizeRoute(policy(), { project: "case-a", role: "explorer", dataClass: "public", model: "ocg/minimax-m3", files: ["public.md"], tools: ["read"] }).model).toBe("ocg/minimax-m3")
  expect(authorizeRoute(policy(), { project: "case-a", role: "investigator", dataClass: "case-original", model: "cx/gpt-6-sol", files: ["case.json"], tools: ["read"] }, new Date("2026-10-25")).model).toBe("cx/gpt-6-sol")
})

test("unapproved provider, file, tool, project and expired consent fail closed", () => {
  const request = { project: "case-a", role: "investigator" as const, dataClass: "case-original" as const, model: "cx/gpt-6-sol", files: ["case.json"], tools: ["read"] }
  expect(() => authorizeRoute(policy(), { ...request, model: "ocg/mimo-v2.5-pro" })).toThrow()
  expect(() => authorizeRoute(policy(), { ...request, files: ["tokens.json"] })).toThrow()
  expect(() => authorizeRoute(policy(), { ...request, files: ["other.json"] })).toThrow()
  expect(() => authorizeRoute(policy(), { ...request, tools: ["shell"] })).toThrow()
  expect(() => authorizeRoute(policy(), { ...request, project: "case-b" })).toThrow()
  expect(() => authorizeRoute(policy(), request, new Date("2031-01-01"))).toThrow()
  const noConsent = policy()
  noConsent.consent = []
  expect(() => authorizeRoute(noConsent, request)).toThrow()
})

test("rejects unsafe policy configuration before reading files", () => {
  const unsafe = policy()
  unsafe.routes[1] = { ...unsafe.routes[1], model: "ocg/mimo-v2.5-pro" }
  expect(() => validatePolicy(unsafe)).toThrow()
  const leaky = policy()
  leaky.routes[1] = { ...leaky.routes[1], files: ["folder/tokens.json"] }
  expect(() => validatePolicy(leaky)).toThrow()
})
