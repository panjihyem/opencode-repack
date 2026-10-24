import { authorizeRoute, type ProjectPolicy } from "./agent-policy"
import type { Dispatch } from "./agent-gate"

// ponytail: no automatic retry after ambiguous delivery; add provider receipt tracking before enabling it.
export function approvedFallback(policy: ProjectPolicy, request: Dispatch, candidates: readonly string[], delivery: "not-sent" | "ambiguous" | "accepted", now = new Date()) {
  if (delivery !== "not-sent") throw new Error("Delivery uncertain; do not retry sensitive content")
  authorizeRoute(policy, request, now)
  for (const model of candidates) {
    if (model === request.model) continue
    try {
      authorizeRoute(policy, { ...request, model }, now)
      return model
    } catch {
      // Candidate not approved for this exact project, class, role, files and tools.
    }
  }
  throw new Error("No approved fallback; task stopped")
}
