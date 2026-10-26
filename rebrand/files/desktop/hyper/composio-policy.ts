// HYPER_AI_MANAGED — evaluation only; no SDK, key or remote MCP installed.
const toolkit = "github"
const tool = "GITHUB_GET_REPOSITORY"

export function authorizeComposio(input: { project: string; activeProject: string; user: string; activeUser: string; session: string; activeSession: string; dataClass: string; tool: string; keyPresent: boolean }) {
  if (!input.project || input.project !== input.activeProject || !input.user || input.user !== input.activeUser || !input.session || input.session !== input.activeSession) throw new Error("Composio scope denied")
  if (input.dataClass !== "public" || !input.keyPresent) throw new Error("Composio unavailable for this data or account")
  if (input.tool !== tool) throw new Error("Composio tool not approved")
  return { toolkits: [toolkit], tools: { [toolkit]: { enable: [tool] } }, manageConnections: { enable: false }, sandbox: { enable: false }, sessionPreset: "DIRECT_TOOLS" as const }
}
