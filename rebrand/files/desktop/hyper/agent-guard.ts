// HYPER_AI_MANAGED — defense in depth for an explicitly opted-in task, not a host OS sandbox.
import { authorizeRoute, type ProjectPolicy } from "./agent-policy"
import type { Dispatch } from "./agent-gate"

export type GuardScope = { policy: ProjectPolicy; request: Dispatch; endpoint: string }

export function guardOutbound(scope: GuardScope, outbound: { model: string; url: string; payload: string }, now = new Date()) {
  authorizeRoute(scope.policy, { ...scope.request, model: outbound.model }, now)
  const expected = new URL(scope.endpoint)
  const actual = new URL(outbound.url)
  if (expected.protocol !== "https:" || actual.protocol !== "https:" || actual.origin !== expected.origin ||
    !actual.pathname.startsWith(expected.pathname.endsWith("/") ? expected.pathname : `${expected.pathname}/`))
    throw new Error("Unapproved model endpoint")
  if (/tokens\.json|(?:^|[\s/])\.env(?:\.|\b)/i.test(outbound.payload)) throw new Error("Forbidden attachment in model payload")
}

export function guardTool(scope: GuardScope, tool: string, now = new Date()) {
  authorizeRoute(scope.policy, scope.request, now)
  if (!scope.request.tools.includes(tool)) throw new Error("Unapproved tool")
}
