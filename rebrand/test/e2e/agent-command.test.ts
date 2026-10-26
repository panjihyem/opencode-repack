import { expect, test } from "bun:test"
import command, { publicText } from "../../files/desktop/hyper/agent-command"

test("explicit public text command rejects sensitive and attached input before generation", async () => {
  let execute: ((input: { sessionID: string; prompt: { text: string; files?: unknown[] } }) => Promise<void>) | undefined
  const calls: unknown[] = []
  await command.setup({
    command: { transform: async (register: (editor: { add: (item: { execute: typeof execute }) => void }) => void) => register({ add: (item) => { execute = item.execute } }) },
    generate: { text: async (input: unknown) => { calls.push(input); return { text: "Reviewed synthetic public text" } } },
    session: { synthetic: async (input: unknown) => { calls.push(input) } },
  } as never)
  expect(publicText({ text: "public: synthetic figure 12" })).toBe("synthetic figure 12")
  for (const text of ["unknown text", "case-original: 12", "public: tokens.json", "public: API key 123", "public:  "])
    await expect(execute!({ sessionID: "test", prompt: { text } })).rejects.toThrow()
  await expect(execute!({ sessionID: "test", prompt: { text: "public: synthetic", files: [{ uri: "file:///secret" }] } })).rejects.toThrow("attachments")
  expect(calls).toHaveLength(0)
  await execute!({ sessionID: "test", prompt: { text: "public: synthetic figure 12" } })
  expect(calls).toEqual([
    { model: { providerID: "ocg", id: "minimax-m3" }, prompt: "Review this public text. No files or tools.\n\nsynthetic figure 12" },
    { sessionID: "test", text: "Reviewed synthetic public text", delivery: "queue", resume: false },
  ])
})
