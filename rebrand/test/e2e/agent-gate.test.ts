import { expect, test } from "bun:test"
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { preflightDispatch } from "../../files/desktop/hyper/agent-gate"
import type { ProjectPolicy } from "../../files/desktop/hyper/agent-policy"

test("preflight rejects case dispatch before file read and permits scoped public route", async () => {
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
        { role: "writer", dataClass: "public", model: "ocg/minimax-m3", files: ["case.json", "results/report.md", "link/outside.txt"], tools: ["read", "write"] },
      ],
      consent: [{ id: "c1", project: "p1", dataClass: "case-original", model: "cx/gpt-6-sol", files: ["case.json", "link/outside.txt", "results/report.md"], expiresAt: "2030-01-01T00:00:00Z" }],
    }
    const base = { project: "p1", role: "investigator" as const, dataClass: "case-original" as const, model: "cx/gpt-6-sol", files: ["case.json"], tools: ["read"] }
    await expect(preflightDispatch(policy, base, root)).rejects.toThrow("public-only")
    const publicRequest = { ...base, role: "writer" as const, dataClass: "public" as const, model: "ocg/minimax-m3", files: ["case.json"], tools: ["read", "write"] }
    await expect(preflightDispatch(policy, { ...publicRequest, files: ["link/outside.txt"] }, root)).rejects.toThrow("Path outside approved scope")
    await expect(preflightDispatch(policy, { ...publicRequest, output: "results/report.md" }, root)).resolves.toHaveProperty("output", path.join(root, "results/report.md"))
  } finally {
    await rm(root, { recursive: true, force: true })
    await rm(outside, { recursive: true, force: true })
  }
})
