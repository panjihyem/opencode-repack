import type { Dispatch } from "./agent-gate"
import path from "node:path"

export type Job = Dispatch & { id: string; dependsOn: string[]; output?: string }
export type Handoff = { id: string; status: "completed" | "failed"; output?: string; source?: string; evidence?: string }

// ponytail: coordinator schedules a bounded DAG only; worker execution stays with existing child sessions.
export async function runJobs(jobs: Job[], execute: (job: Job, handoffs: readonly Handoff[]) => Promise<Handoff>, concurrent = 2) {
  if (!Number.isInteger(concurrent) || concurrent < 1 || concurrent > 4) throw new Error("Invalid concurrency")
  const ids = new Set(jobs.map((job) => job.id))
  if (ids.size !== jobs.length || jobs.some((job) => !job.id || job.dependsOn.includes(job.id) || job.dependsOn.some((id) => !ids.has(id))))
    throw new Error("Invalid job graph")
  const outputs = jobs.flatMap((job) => job.output ? [path.win32.normalize(job.output.replaceAll("/", "\\")).toLowerCase()] : [])
  if (new Set(outputs).size !== outputs.length) throw new Error("Multiple writers for one output")
  const complete = new Map<string, Handoff>()
  const waiting = new Map(jobs.map((job) => [job.id, job]))
  while (waiting.size) {
    const ready = [...waiting.values()].filter((job) => job.dependsOn.every((id) => complete.get(id)?.status === "completed"))
    if (!ready.length) throw new Error("Blocked or cyclic job graph")
    const batch = ready.slice(0, concurrent)
    for (const job of batch) waiting.delete(job.id)
    const handoffs = [...complete.values()]
    const results = await Promise.allSettled(batch.map((job) => execute(job, handoffs)))
    for (let index = 0; index < batch.length; index++) {
      const result = results[index]
      if (result.status === "rejected" || result.value.status !== "completed" || result.value.id !== batch[index].id)
        throw new Error(`Job failed: ${batch[index].id}`)
      complete.set(batch[index].id, result.value)
    }
  }
  return [...complete.values()]
}
