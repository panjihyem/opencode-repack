import { expect, test } from "bun:test"
import { runJobs, type Job } from "../../files/desktop/hyper/agent-orchestrator"

const job = (id: string, dependsOn: string[] = [], output = `${id}.md`): Job => ({ id, dependsOn, output, project: "demo", role: "explorer", dataClass: "public", model: "ocg/minimax-m3", files: ["public.md"], tools: ["read"] })

test("parallel independent jobs finish before writer and reviewer; no duplicate job", async () => {
  const waves: string[][] = []
  let running = 0
  let peak = 0
  const result = await runJobs([job("explore"), job("extract"), job("draft", ["explore", "extract"]), job("review", ["draft"])], async (task, handoffs) => {
    running++
    peak = Math.max(peak, running)
    waves.push([task.id, ...handoffs.map((handoff) => handoff.id)])
    await new Promise((resolve) => setTimeout(resolve, 5))
    running--
    return { id: task.id, status: "completed", output: task.output }
  })
  expect(peak).toBe(2)
  expect(result.map((entry) => entry.id)).toEqual(["explore", "extract", "draft", "review"])
  expect(waves.find(([name]) => name === "draft")).toEqual(["draft", "explore", "extract"])
})

test("conflict, cycle and failed dependency stop without extra work", async () => {
  const execute = async (task: Job) => ({ id: task.id, status: "completed" as const })
  await expect(runJobs([job("a", [], "same.md"), job("b", [], "same.md")], execute)).rejects.toThrow("Multiple writers")
  await expect(runJobs([job("a", ["b"]), job("b", ["a"])], execute)).rejects.toThrow("cyclic")
  let calls = 0
  await expect(runJobs([job("a"), job("b", ["a"])], async (task) => { calls++; throw new Error(task.id) })).rejects.toThrow("Job failed: a")
  expect(calls).toBe(1)
})
