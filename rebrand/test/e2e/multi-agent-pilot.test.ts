import { expect, test } from "bun:test"
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { preflightDispatch } from "../../files/desktop/hyper/agent-gate"
import { runJobs, type Job } from "../../files/desktop/hyper/agent-orchestrator"
import { approvedFallback } from "../../files/desktop/hyper/agent-fallback"
import type { ProjectPolicy } from "../../files/desktop/hyper/agent-policy"

test("synthetic public helper pipeline, denial before read, and bounded handoffs", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "public-pipeline-"))
  try {
    await mkdir(path.join(root, "results"))
    await writeFile(path.join(root, "public.txt"), "Synthetic public figure: 12")
    await writeFile(path.join(root, "tokens.json"), "FORBIDDEN_BYTES")
    const policy: ProjectPolicy = { project: "demo", consent: [], routes: ["explorer", "extractor", "writer", "reviewer"].map((role) => ({
      role: role as Job["role"], dataClass: "public", model: "ocg/minimax-m3", files: ["public.txt", "results/draft.md"], tools: ["read"],
    })) }
    const make = (id: string, role: Job["role"], dependsOn: string[] = []): Job => ({
      id, role, dependsOn, project: "demo", dataClass: "public", model: "ocg/minimax-m3", files: ["public.txt"], tools: ["read"],
    })
    const jobs = [make("explore", "explorer"), make("extract", "extractor"), { ...make("draft", "writer", ["explore", "extract"]), output: "results/draft.md" }, make("review", "reviewer", ["draft"])]
    let reads = 0
    const execute = async (job: Job, handoffs: readonly { id: string }[]) => {
      const approved = await preflightDispatch(policy, job, root)
      reads++
      const source = await readFile(approved.files[0], "utf8")
      expect(source).toContain("Synthetic public figure")
      if (job.id === "draft") expect(handoffs.map((item) => item.id)).toEqual(["explore", "extract"])
      if (job.id === "review") expect(handoffs.at(-1)?.id).toBe("draft")
      return { id: job.id, status: "completed" as const, source: "public.txt", evidence: "synthetic fixture", output: job.output }
    }
    const result = await runJobs(jobs, execute, 2)
    expect(result.map((item) => item.id)).toEqual(["explore", "extract", "draft", "review"])
    expect(reads).toBe(4)
    for (const invalid of [
      { ...jobs[0], dataClass: "case-original" },
      { ...jobs[0], dataClass: undefined },
      { ...jobs[0], files: ["tokens.json"] },
      { ...jobs[0], files: ["../outside.txt"] },
    ]) await expect(execute(invalid as Job, [])).rejects.toThrow()
    expect(reads).toBe(4)
    const mixed = { ...policy, routes: [...policy.routes, { ...policy.routes[0], dataClass: "internal" as const, model: "cx/gpt-6-sol" }] }
    await expect(preflightDispatch(mixed, jobs[0], path.join(root, "missing"))).rejects.toThrow("public-only")
    expect(() => approvedFallback(policy, jobs[0], ["cx/gpt-6-sol"], "ambiguous")).toThrow("Delivery uncertain")
    expect(() => approvedFallback(policy, jobs[0], ["cx/gpt-6-sol"], "not-sent")).toThrow("No approved fallback")
    await expect(runJobs([jobs[0], { ...jobs[2], dependsOn: [], output: "public.txt" }, { ...jobs[1], output: "public.txt" }], execute)).rejects.toThrow("Multiple writers")
    expect(reads).toBe(4)
    await expect(runJobs([jobs[0], { ...jobs[1], dependsOn: ["explore"] }], async (job) => { throw new Error(job.id) })).rejects.toThrow("Job failed: explore")
    expect(await readFile(path.join(root, "tokens.json"), "utf8")).toBe("FORBIDDEN_BYTES")
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
