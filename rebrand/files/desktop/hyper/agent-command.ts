// HYPER_AI_MANAGED — explicit text-only public workflow, no session model/tool hooks.
import { Plugin } from "@opencode/plugin"
import { runJobs, type Job } from "./agent-orchestrator"

const model = { providerID: "ocg", id: "minimax-m3" } as const
const forbidden = /\b(?:tokens\.json|\.env(?:\.[\w-]+)?|api[_ -]?key|secret|credential|case[_ -]?original|confidential|internal)\b/i

export function publicText(input: { text: string; files?: readonly unknown[]; agents?: readonly unknown[]; skills?: readonly unknown[] }) {
  if (input.files?.length || input.agents?.length || input.skills?.length) throw new Error("Public text command rejects attachments")
  const match = /^public:\s*([^]*)$/i.exec(input.text.trim())
  if (!match?.[1]?.trim() || forbidden.test(match[1])) throw new Error("Explicit public text required; sensitive marker rejected")
  return match[1].trim()
}

// ponytail: caller must declare public text; no automatic content classification. Upgrade requires trusted classification gate.
export default Plugin.define({
  id: "hyper-public-agents",
  async setup(ctx) {
    await ctx.command.transform((editor) => editor.add({
      name: "hyper-public-agents",
      description: "Run public text specialists (prefix input with public:); never use for case data",
      execute: async ({ sessionID, prompt }) => {
        const text = publicText(prompt)
        const job = (id: string, role: Job["role"], dependsOn: string[] = []): Job => ({
          id, role, dependsOn, project: ctx.location.project.id, dataClass: "public", model: `${model.providerID}/${model.id}`, files: ["<inline>"], tools: [],
        })
        const results = await runJobs([
          job("explore", "explorer"), job("analyze", "analyst"), job("draft", "writer", ["explore", "analyze"]), job("review", "reviewer", ["draft"]),
        ], async (task, handoffs) => {
          const context = handoffs.map((item) => `${item.id}: ${item.evidence}`).join("\n")
          const result = await ctx.generate.text({ model, prompt: `Role: ${task.role}. Use public text only. No files or tools.\n\n${text}\n${context}` })
          return { id: task.id, status: "completed" as const, evidence: result.text }
        })
        await ctx.session.synthetic({ sessionID, text: results.at(-1)?.evidence ?? "", delivery: "queue", resume: false })
      },
    }))
  },
})
