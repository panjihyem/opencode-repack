// HYPER_AI_MANAGED — call before reading a task's source or sending it to any child/model.
import { realpath, stat } from "node:fs/promises"
import path from "node:path"
import { authorizePublicRoute, type AgentRole, type DataClass, type ProjectPolicy } from "./agent-policy"

export type Dispatch = {
  project: string
  role: AgentRole
  dataClass: DataClass
  model: string
  files: string[]
  tools: string[]
  output?: string
}

const prohibited = /(?:^|[\\/])(?:tokens\.json|\.env(?:\.[^\\/]*)?|[^\\/]*(?:secret|credential|api[-_]?key)[^\\/]*)$/i

export async function preflightDispatch(policy: ProjectPolicy, request: Dispatch, projectRoot: string) {
  // Authorize strings first, then resolve every path to catch symlink escapes.
  const route = authorizePublicRoute(policy, request)
  const root = await realpath(projectRoot)
  const scoped = async (file: string) => {
    if (path.isAbsolute(file) || path.win32.isAbsolute(file) || file.split(/[\\/]/).includes("..") || prohibited.test(file)) throw new Error("Path outside approved scope")
    const target = await realpath(path.join(root, file))
    if (target === root || !target.startsWith(root + path.sep)) throw new Error("Path outside approved scope")
    return target
  }
  const files = await Promise.all(request.files.map(scoped))
  if ((request.role === "explorer" || request.role === "reviewer") && request.tools.some((tool) => /^(?:edit|write|patch|shell)$/i.test(tool)))
    throw new Error("Read-only agent cannot mutate")
  if (request.output) {
    if (request.role === "explorer" || request.role === "reviewer" || prohibited.test(request.output) || path.isAbsolute(request.output) || path.win32.isAbsolute(request.output) ||
      request.output.split(/[\\/]/).includes("..")) throw new Error("Output outside approved scope")
    const parent = await realpath(path.join(root, path.dirname(request.output)))
    if (parent !== root && !parent.startsWith(root + path.sep)) throw new Error("Output outside approved scope")
    if (!route.files.includes(request.output)) throw new Error("Output not approved")
    const existing = await stat(path.join(root, request.output)).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return undefined
      throw error
    })
    if (existing) throw new Error("Output already exists; do not overwrite or follow symlink")
  }
  return { route, files, output: request.output ? path.join(root, request.output) : undefined }
}
