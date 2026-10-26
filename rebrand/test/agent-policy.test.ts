import { expect, test } from "bun:test"
import { authorizePublicRoute, authorizeRoute, validatePolicy, validatePublicPolicy, type ProjectPolicy } from "../files/desktop/hyper/agent-policy"

const policy = (): ProjectPolicy => ({
  project: "case-a",
  routes: [
    { role: "explorer", dataClass: "public", model: "ocg/minimax-m3", files: ["public.md"], tools: ["read"] },
    { role: "investigator", dataClass: "case-original", model: "cx/gpt-6-sol", files: ["case.json"], tools: ["read"], consentId: "approval-1" },
  ],
  consent: [],
})

test("public MiniMax route only", () => {
  expect(authorizeRoute(policy(), { project: "case-a", role: "explorer", dataClass: "public", model: "ocg/minimax-m3", files: ["public.md"], tools: ["read"] }).model).toBe("ocg/minimax-m3")
})

test("unapproved provider, file, tool, project and expired consent fail closed", () => {
  const request = { project: "case-a", role: "investigator" as const, dataClass: "case-original" as const, model: "cx/gpt-6-sol", files: ["case.json"], tools: ["read"] }
  expect(() => authorizeRoute(policy(), { ...request, model: "ocg/mimo-v2.5-pro" })).toThrow()
  expect(() => authorizeRoute(policy(), { ...request, files: ["tokens.json"] })).toThrow()
  expect(() => authorizeRoute(policy(), { ...request, files: ["other.json"] })).toThrow()
  expect(() => authorizeRoute(policy(), { ...request, tools: ["shell"] })).toThrow()
  expect(() => authorizeRoute(policy(), { ...request, project: "case-b" })).toThrow()
  expect(() => authorizePublicRoute(policy(), { ...request, dataClass: "case-original" })).toThrow("public-only")
})

test("rejects unsafe policy configuration before reading files", () => {
  const unsafe = policy()
  unsafe.routes[1] = { ...unsafe.routes[1], model: "ocg/mimo-v2.5-pro" }
  expect(() => validatePolicy(unsafe)).toThrow()
  const leaky = policy()
  leaky.routes[1] = { ...leaky.routes[1], files: ["folder/tokens.json"] }
  expect(() => validatePolicy(leaky)).toThrow()
  for (const tool of ["execute", "browser", "shell", "mcp", "readFile", "opencode_subagent", "write"]) {
    const bypass = policy()
    bypass.routes[1] = { ...bypass.routes[1], tools: [tool] }
    expect(() => validatePolicy(bypass)).toThrow("restricted tools")
  }
})

test("public feature entrypoint rejects every non-public class before route lookup", () => {
  const p = policy()
  for (const dataClass of ["internal", "confidential", "case-original"] as const) {
    expect(() => authorizePublicRoute(p, { project: "case-a", role: "explorer", dataClass, model: "ocg/minimax-m3", files: ["public.md"], tools: ["read"] })).toThrow("public-only")
  }
})

test("public policy validator refuses non-public configured routes and consent", () => {
  expect(() => validatePublicPolicy(policy())).toThrow("public-only")
  const publicPolicy = policy()
  publicPolicy.routes = publicPolicy.routes.slice(0, 1)
  expect(validatePublicPolicy(publicPolicy)).toBe(publicPolicy)
  publicPolicy.consent.push({ id: "c", project: "case-a", dataClass: "public", model: "ocg/minimax-m3", files: ["public.md"], expiresAt: "2030-01-01T00:00:00Z" })
  expect(() => validatePublicPolicy(publicPolicy)).toThrow("public-only")
  publicPolicy.consent = []
  publicPolicy.routes[0] = { ...publicPolicy.routes[0], tools: ["shell"] }
  expect(() => validatePublicPolicy(publicPolicy)).toThrow("Unapproved public route tool")
  publicPolicy.routes[0] = { ...publicPolicy.routes[0], role: "investigator", tools: ["read"] }
  expect(() => validatePublicPolicy(publicPolicy)).toThrow("Unapproved public route tool")
})
