// HYPER_AI_MANAGED — explicit text-only public workflow, no session model/tool hooks.
const model = { providerID: "ocg", id: "minimax-m3.1-flash-free" } as const
const forbidden = /\b(?:tokens\.json|\.env(?:\.[\w-]+)?|api[_ -]?key|secret|credential|case[_ -]?original|confidential|internal)\b/i
const maximum = 4_000

export function publicText(input: { text: string; files?: readonly unknown[]; agents?: readonly unknown[]; skills?: readonly unknown[] }) {
  if (input.files?.length || input.agents?.length || input.skills?.length) throw new Error("Public text command rejects attachments")
  const match = /^public:\s*([^]*)$/i.exec(input.text.trim())
  if (!match?.[1]?.trim() || match[1].length > maximum || forbidden.test(match[1])) throw new Error("Explicit public text required; sensitive marker rejected")
  return match[1].trim()
}

// ponytail: caller must declare public text; no automatic content classification. Upgrade requires trusted classification gate.
export default {
  id: "hyper-public-agents",
  async setup(ctx) {
    await ctx.command.transform((editor) => editor.add({
      name: "hyper-public-agents",
      description: "Run public text specialists (prefix input with public:); never use for case data",
      execute: async ({ sessionID, prompt }) => {
        const text = publicText(prompt)
        const stages = await Promise.all(["explorer", "analyst"].map((role) =>
          ctx.generate.text({ model, prompt: `Role: ${role}. Use public text only. No files or tools.\n\n${text}` }),
        ))
        if (stages.some((stage) => stage.text.length > maximum)) throw new Error("Specialist result too large")
        const draft = await ctx.generate.text({ model, prompt: `Role: writer. Public text:\n${text}\nExplorer: ${stages[0].text}\nAnalyst: ${stages[1].text}` })
        if (draft.text.length > maximum) throw new Error("Specialist result too large")
        const review = await ctx.generate.text({ model, prompt: `Role: reviewer. Verify public draft against source.\nSource: ${text}\nDraft: ${draft.text}` })
        if (review.text.length > maximum) throw new Error("Specialist result too large")
        await ctx.session.synthetic({ sessionID, text: review.text, delivery: "queue", resume: false })
      },
    }))
  },
}
