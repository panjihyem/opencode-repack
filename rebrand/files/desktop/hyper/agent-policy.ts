// HYPER_AI_MANAGED — fail-closed routing policy; never store prompt, credential, or token map here.
export type DataClass = "public" | "internal" | "confidential" | "case-original"
export type AgentRole = "master" | "explorer" | "extractor" | "analyst" | "investigator" | "writer" | "reviewer"

export type Route = {
  model: string
  role: AgentRole
  dataClass: DataClass
  files: string[]
  tools: string[]
  consentId?: string
}

export type ProjectPolicy = {
  project: string
  routes: Route[]
  consent: { id: string; project: string; dataClass: DataClass; model: string; files: string[]; expiresAt: string }[]
}

const classes = new Set<DataClass>(["public", "internal", "confidential", "case-original"])
const roles = new Set<AgentRole>(["master", "explorer", "extractor", "analyst", "investigator", "writer", "reviewer"])
const forbidden = /(?:^|[\\/])(?:tokens\.json|\.env(?:\.[^\\/]*)?|[^\\/]*(?:secret|credential|api[-_]?key)[^\\/]*)$/i
const modelId = /^(?:cx\/gpt-[^\s#]+|ocg\/(?:minimax|mimo)[^\s#]*)$/i
// Only individually reviewed, read-only tools may see original case material.
const caseTools = new Set(["read", "glob", "grep"])
const publicTools = new Set(["read", "glob", "grep"])

export function validatePolicy(input: unknown): ProjectPolicy {
  if (!input || typeof input !== "object") throw new Error("Project policy missing")
  const policy = input as ProjectPolicy
  if (typeof policy.project !== "string" || !policy.project.trim() || !Array.isArray(policy.routes) || !Array.isArray(policy.consent))
    throw new Error("Invalid project policy")
  for (const route of policy.routes) {
    if (!route || !roles.has(route.role) || !classes.has(route.dataClass) || typeof route.model !== "string" || !modelId.test(route.model))
      throw new Error("Invalid route")
    if (!Array.isArray(route.files) || !route.files.length || route.files.some((file) => typeof file !== "string" || !file || forbidden.test(file)))
      throw new Error("Invalid or forbidden route file")
    if (!Array.isArray(route.tools) || route.tools.some((tool) => typeof tool !== "string" || !tool))
      throw new Error("Invalid route tools")
    if (route.dataClass !== "public" && !route.model.startsWith("cx/gpt-")) throw new Error("Sensitive data requires approved GPT route")
    if (route.dataClass === "case-original" && (!route.consentId || route.tools.some((tool) => !caseTools.has(tool))))
      throw new Error("Case route needs consent and restricted tools")
  }
  for (const entry of policy.consent) {
    if (!entry || typeof entry.id !== "string" || !entry.id || entry.project !== policy.project || !classes.has(entry.dataClass) ||
      typeof entry.model !== "string" || !modelId.test(entry.model) || !Array.isArray(entry.files) ||
      entry.files.some((file) => typeof file !== "string" || !file || forbidden.test(file)) ||
      typeof entry.expiresAt !== "string" || !Number.isFinite(Date.parse(entry.expiresAt))) throw new Error("Invalid consent")
  }
  return policy
}

export function authorizeRoute(policy: ProjectPolicy, request: { project: string; role: AgentRole; dataClass: DataClass; model: string; files: string[]; tools: string[] }, now = new Date()): Route {
  validatePolicy(policy)
  if (request.project !== policy.project || !Array.isArray(request.files) || !request.files.length ||
    request.files.some((file) => typeof file !== "string" || !file || forbidden.test(file)) ||
    !Array.isArray(request.tools)) throw new Error("Request outside project scope")
  const route = policy.routes.find((candidate) => candidate.role === request.role && candidate.dataClass === request.dataClass &&
    candidate.model === request.model && request.files.every((file) => candidate.files.includes(file)) &&
    request.tools.every((tool) => candidate.tools.includes(tool)))
  if (!route) throw new Error("No approved route")
  if (request.dataClass !== "public") {
    const consent = policy.consent.find((entry) => entry.id === route.consentId && entry.project === request.project &&
      entry.dataClass === request.dataClass && entry.model === request.model && request.files.every((file) => entry.files.includes(file)) &&
      Date.parse(entry.expiresAt) > now.getTime())
    if (!consent) throw new Error("Explicit consent missing or expired")
  }
  return route
}

export function authorizePublicRoute(policy: ProjectPolicy, request: Parameters<typeof authorizeRoute>[1]): Route {
  if (request.dataClass !== "public") throw new Error("Multi-agent routing is public-only")
  return authorizeRoute(policy, request)
}

export function validatePublicPolicy(input: unknown): ProjectPolicy {
  const policy = validatePolicy(input)
  if (policy.routes.some((route) => route.dataClass !== "public") || policy.consent.length)
    throw new Error("Multi-agent policy is public-only")
  if (policy.routes.some((route) => route.role === "investigator" || route.tools.some((tool) => !publicTools.has(tool))))
    throw new Error("Unapproved public route tool or role")
  return policy
}
