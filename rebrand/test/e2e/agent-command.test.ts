import { expect, test } from "bun:test"
import { mkdtemp, mkdir, rm, writeFile, unlink } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import command, { publicText } from "../../files/desktop/hyper/agent-command"

async function project() {
  const root = await mkdtemp(path.join(os.tmpdir(), "hyper-public-command-"))
  await mkdir(path.join(root, ".hyper-ai"))
  await writeFile(path.join(root, ".hyper-ai", "public-agents.enabled"), "")
  return { root, location: { directory: root, project: { id: "test-project", canonical: root } }, cleanup: () => rm(root, { recursive: true, force: true }) }
}

test("explicit public text command rejects sensitive and attached input before generation", async () => {
  const fixture = await project()
  try {
  let execute: ((input: { sessionID: string; prompt: { text: string; files?: unknown[] } }) => Promise<void>) | undefined
  const calls: unknown[] = []
  await command.setup({
    location: fixture.location,
    command: { transform: async (register: (editor: { add: (item: { execute: typeof execute }) => void }) => void) => register({ add: (item) => { execute = item.execute } }) },
    generate: { text: async (input: unknown) => { calls.push(input); return { text: "Reviewed synthetic public text" } } },
    session: { get: async () => ({ projectID: fixture.location.project.id, location: { directory: fixture.root } }), synthetic: async (input: unknown) => { calls.push(input) } },
  } as never)
  expect(publicText({ text: "public: synthetic figure 12" })).toBe("synthetic figure 12")
  for (const text of ["unknown text", "case-original: 12", "public: tokens.json", "public: API key 123", "public:  "])
    await expect(execute!({ sessionID: "test", prompt: { text } })).rejects.toThrow()
  await expect(execute!({ sessionID: "test", prompt: { text: "public: synthetic", files: [{ uri: "file:///secret" }] } })).rejects.toThrow("attachments")
  expect(calls).toHaveLength(0)
  await execute!({ sessionID: "test", prompt: { text: "public: synthetic figure 12" } })
  expect(calls).toHaveLength(5)
  expect(calls.slice(0, 4).every((entry) => (entry as { model?: unknown }).model && (entry as { prompt?: string }).prompt?.includes("synthetic figure 12"))).toBe(true)
  expect(calls.slice(0, 4).map((entry) => (entry as { model: unknown }).model)).toEqual(Array(4).fill({ providerID: "ocg", id: "minimax-m3.1-flash-free" }))
  expect((calls[3] as { prompt: string }).prompt).toContain("Draft: Reviewed synthetic public text")
  expect(calls[4]).toEqual({ sessionID: "test", text: "Reviewed synthetic public text", delivery: "queue", resume: false })
  } finally { await fixture.cleanup() }
})

test("failed specialist stops downstream work and never publishes partial results", async () => {
  const fixture = await project()
  try {
  let execute: ((input: { sessionID: string; prompt: { text: string } }) => Promise<void>) | undefined
  let generated = 0
  let published = 0
  await command.setup({
    location: fixture.location,
    command: { transform: async (register: (editor: { add: (item: { execute: typeof execute }) => void }) => void) => register({ add: (item) => { execute = item.execute } }) },
    generate: { text: async () => { generated++; throw new Error("delivery ambiguous") } },
    session: { get: async () => ({ projectID: fixture.location.project.id, location: { directory: fixture.root } }), synthetic: async () => { published++ } },
  } as never)
  await expect(execute!({ sessionID: "test", prompt: { text: "public: synthetic only" } })).rejects.toThrow("delivery ambiguous")
  expect(generated).toBe(1)
  expect(published).toBe(0)
  } finally { await fixture.cleanup() }
})

test("project opt-in removal stops dispatch between stages", async () => {
  const fixture = await project()
  try {
    let execute: ((input: { sessionID: string; prompt: { text: string } }) => Promise<void>) | undefined
    let generated = 0
    let published = 0
    await command.setup({
      location: fixture.location,
      command: { transform: async (register: (editor: { add: (item: { execute: typeof execute }) => void }) => void) => register({ add: (item) => { execute = item.execute } }) },
      generate: { text: async () => { generated++; if (generated === 1) await unlink(path.join(fixture.root, ".hyper-ai", "public-agents.enabled")); return { text: "public result" } } },
      session: { get: async () => ({ projectID: fixture.location.project.id, location: { directory: fixture.root } }), synthetic: async () => { published++ } },
    } as never)
    await expect(execute!({ sessionID: "test", prompt: { text: "public: synthetic" } })).rejects.toThrow("Project opt-in missing")
    expect(generated).toBeLessThanOrEqual(2)
    expect(published).toBe(0)
  } finally { await fixture.cleanup() }
})

test("concurrent opt-in revocation prevents next specialist call", async () => {
  const fixture = await project()
  try {
    let execute: ((input: { sessionID: string; prompt: { text: string } }) => Promise<void>) | undefined
    let generated = 0
    let published = 0
    await command.setup({
      location: fixture.location,
      command: { transform: async (register: (editor: { add: (item: { execute: typeof execute }) => void }) => void) => register({ add: (item) => { execute = item.execute } }) },
      generate: { text: async () => {
        generated++
        await unlink(path.join(fixture.root, ".hyper-ai", "public-agents.enabled"))
        return { text: "public result" }
      } },
      session: { get: async () => ({ projectID: fixture.location.project.id, location: { directory: fixture.root } }), synthetic: async () => { published++ } },
    } as never)
    await expect(execute!({ sessionID: "test", prompt: { text: "public: synthetic" } })).rejects.toThrow("Project opt-in missing")
    expect(generated).toBe(1)
    expect(published).toBe(0)
  } finally { await fixture.cleanup() }
})

test("unmarked project and child session deny before generating", async () => {
  const fixture = await project()
  try {
    let execute: ((input: { sessionID: string; prompt: { text: string } }) => Promise<void>) | undefined
    let calls = 0
    let parentID: string | undefined
    await command.setup({
      location: fixture.location,
      command: { transform: async (register: (editor: { add: (item: { execute: typeof execute }) => void }) => void) => register({ add: (item) => { execute = item.execute } }) },
      generate: { text: async () => { calls++; return { text: "public" } } },
      session: { get: async () => ({ projectID: fixture.location.project.id, location: { directory: fixture.root }, parentID }), synthetic: async () => {} },
    } as never)
    parentID = "child"
    await expect(execute!({ sessionID: "test", prompt: { text: "public: synthetic" } })).rejects.toThrow("Session outside")
    parentID = undefined
    await unlink(path.join(fixture.root, ".hyper-ai", "public-agents.enabled"))
    await expect(execute!({ sessionID: "test", prompt: { text: "public: synthetic" } })).rejects.toThrow("Project opt-in missing")
    expect(calls).toBe(0)
  } finally { await fixture.cleanup() }
})

test("project root command accepts its nested top-level session", async () => {
  const fixture = await project()
  const nested = path.join(fixture.root, "packages", "app")
  try {
    await mkdir(nested, { recursive: true })
    let execute: ((input: { sessionID: string; prompt: { text: string } }) => Promise<void>) | undefined
    let generated = 0
    let published = 0
    await command.setup({
      location: { ...fixture.location, directory: fixture.root },
      command: { transform: async (register: (editor: { add: (item: { execute: typeof execute }) => void }) => void) => register({ add: (item) => { execute = item.execute } }) },
      generate: { text: async () => { generated++; return { text: "public result" } } },
      session: { get: async () => ({ projectID: fixture.location.project.id, location: { directory: nested } }), synthetic: async () => { published++ } },
    } as never)
    await execute!({ sessionID: "nested-session", prompt: { text: "public: synthetic" } })
    expect(generated).toBe(4)
    expect(published).toBe(1)
  } finally { await fixture.cleanup() }
})

test("case mode change stops public generations before next stage", async () => {
  const fixture = await project()
  const previous = process.env.OPENCODE_CONFIG_DIR
  const config = await mkdtemp(path.join(os.tmpdir(), "hyper-public-config-"))
  process.env.OPENCODE_CONFIG_DIR = config
  try {
    let execute: ((input: { sessionID: string; prompt: { text: string } }) => Promise<void>) | undefined
    let generated = 0
    let published = 0
    await mkdir(path.join(config, "hyper"))
    await command.setup({
      location: fixture.location,
      command: { transform: async (register: (editor: { add: (item: { execute: typeof execute }) => void }) => void) => register({ add: (item) => { execute = item.execute } }) },
      generate: { text: async () => {
        generated++
        if (generated === 1) await writeFile(path.join(config, "hyper", "privacy.json"), '{"case_mode":true}')
        return { text: "public result" }
      } },
      session: { get: async () => ({ projectID: fixture.location.project.id, location: { directory: fixture.root } }), synthetic: async () => { published++ } },
    } as never)
    await expect(execute!({ sessionID: "test", prompt: { text: "public: synthetic" } })).rejects.toThrow("case mode")
    expect(generated).toBeLessThanOrEqual(2)
    expect(published).toBe(0)
  } finally {
    if (previous === undefined) delete process.env.OPENCODE_CONFIG_DIR
    else process.env.OPENCODE_CONFIG_DIR = previous
    await fixture.cleanup()
    await rm(config, { recursive: true, force: true })
  }
})
