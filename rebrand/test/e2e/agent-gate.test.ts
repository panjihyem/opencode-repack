import { expect, test } from "bun:test"
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { preflightDispatch } from "../../files/desktop/hyper/agent-gate"
import type { ProjectPolicy } from "../../files/desktop/hyper/agent-policy"

test("preflight permits scoped GPT case read and blocks escapes before file read", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "hyper-gate-"))
  const outside = await mkdtemp(path.join(os.tmpdir(), "hyper-outside-"))
  try {
    await mkdir(path.join(root, "results"))
    await writeFile(path.join(root, "case.json"), "synthetic")
    await writeFile(path.join(outside, "outside.txt"), "private")
    await symlink(outside, path.join(root, "link"), "junction")
    const policy: ProjectPolicy = {
      project: "p1",
      routes: [
        { role: "investigator", dataClass: "case-original", model: "cx/gpt-6-sol", files: ["case.json", "link/outside.txt"], tools: ["read"], consentId: "c1" },
        { role: "writer", dataClass: "public", model: "ocg/minimax-m3", files: ["case.json", "results/report.md"], tools: ["read", "write"] },
      ],
      consent: [{ id: "c1", project: "p1", dataClass: "case-original", model: "cx/gpt-6-sol", files: ["case.json", "link/outside.txt", "results/report.md"], expiresAt: "2030-01-01T00:00:00Z" }],
    }
    const base = { project: "p1", role: "investigator" as const, dataClass: "case-original" as const, model: "cx/gpt-6-sol", files: ["case.json"], tools: ["read"] }
    expect((await preflightDispatch(policy, base, root)).files).toEqual([path.join(root, "case.json")])
    await expect(preflightDispatch(policy, { ...base, files: ["link/outside.txt"] }, root)).rejects.toThrow("outside")
    await expect(preflightDispatch(policy, { ...base, output: "results/report.md" }, root)).rejects.toThrow("not approved")
    await expect(preflightDispatch(policy, { ...base, role: "writer", dataClass: "public", model: "ocg/minimax-m3", tools: ["read", "write"], output: "results/report.md" }, root)).resolves.toHaveProperty("output", path.join(root, "results/report.md"))
    policy.consent = []
    await expect(preflightDispatch(policy, base, root)).rejects.toThrow("consent")
  } finally {
    await rm(root, { recursive: true, force: true })
    await rm(outside, { recursive: true, force: true })
  }
})
