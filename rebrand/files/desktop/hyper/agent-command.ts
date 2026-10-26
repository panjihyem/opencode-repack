// HYPER_AI_MANAGED — explicit text-only public workflow, no session model/tool hooks.
import { Plugin } from "@opencode/plugin"

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
        const result = await ctx.generate.text({ model, prompt: `Review this public text. No files or tools.\n\n${text}` })
        await ctx.session.synthetic({ sessionID, text: result.text, delivery: "queue", resume: false })
      },
    }))
  },
})
