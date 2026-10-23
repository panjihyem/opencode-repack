import fs from "node:fs"
import os from "node:os"
import path from "path"
import { describe, expect, test } from "bun:test"
import type { ConfigDiscovery } from "@opencode/core/config/discovery"
import { ConfigWatch } from "@opencode/core/config/watch"
import { AbsolutePath } from "@opencode/core/schema"

const project = path.resolve("watch-plan-project")
const root = AbsolutePath.make(path.join(project, ".opencode"))
const sources: ConfigDiscovery.Sources = {
  direct: ["opencode.json", "opencode.jsonc"].map((name) => AbsolutePath.make(path.join(project, name))),
  project: [{ path: root, present: false }],
  claude: [AbsolutePath.make(path.join(project, ".claude"))],
  agents: [AbsolutePath.make(path.join(project, ".agents"))],
}

describe("ConfigWatch.plan", () => {
  test("watches an existing ancestor for a managed directory that does not exist yet", () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "oc-watch-"))
    try {
      const missing = ConfigWatch.plan({
        ...sources,
        managed: [{ path: AbsolutePath.make(path.join(base, "belum-ada", "managed")), present: false }],
      })
      const targets = Array.from(missing.values())
      expect(
        targets.some((target) => target.type === "entries" && target.path === base && target.names.includes("belum-ada")),
      ).toBe(true)
    } finally {
      fs.rmSync(base, { recursive: true, force: true })
    }
  })

  test("groups missing candidates and keeps parent watches when roots appear", () => {
    const missing = ConfigWatch.plan(sources)
    expect(Array.from(missing.values())).toEqual([
      { path: project, type: "entries", names: [".agents", ".claude", ".opencode", "opencode.json", "opencode.jsonc"] },
    ])
    const system = AbsolutePath.make(path.join(project, "system-opencode"))
    const present = ConfigWatch.plan({
      ...sources,
      system: { path: system, present: true },
      project: [{ path: root, present: true }],
    })
    expect(Array.from(present.values())).toEqual([
      { path: system, type: "directory", ignore: ["node_modules", ".git", "**/{node_modules,.git}/**"] },
      { path: root, type: "directory", ignore: ["node_modules", ".git", "**/{node_modules,.git}/**"] },
      {
        path: project,
        type: "entries",
        names: [".agents", ".claude", ".opencode", "opencode.json", "opencode.jsonc", "system-opencode"],
      },
    ])
  })

  test("adds exact watches for explicit files only when not already covered", () => {
    expect(ConfigWatch.plan({ ...sources, explicit: sources.direct[0] })).toEqual(ConfigWatch.plan(sources))
    const present = { ...sources, project: [{ path: root, present: true }] }
    expect(ConfigWatch.plan({ ...present, explicit: AbsolutePath.make(path.join(root, "custom.json")) })).toEqual(
      ConfigWatch.plan(present),
    )
    const directory = path.resolve("watch-plan-external")
    expect(
      Array.from(
        ConfigWatch.plan({ ...sources, explicit: AbsolutePath.make(path.join(directory, "custom.json")) }).values(),
      ),
    ).toContainEqual({ path: directory, type: "entries", names: ["custom.json"] })
  })
})
