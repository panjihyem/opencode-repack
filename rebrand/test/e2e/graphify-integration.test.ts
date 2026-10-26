import { expect, test } from "bun:test"
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { graphify, graphifyEnvironment } from "../../files/desktop/cli/graphify.mjs"

test("opted-in repo indexes code offline and queries extracted call edge", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "hyper-graphify-test-"))
  const project = path.join(root, "project")
  const output = path.join(root, "data")
  const previousHome = process.env.HYPER_GRAPHIFY_HOME
  const previousUv = process.env.HYPER_UV
  process.env.HYPER_GRAPHIFY_HOME = output
  process.env.HYPER_UV = path.join(process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming"), "ai.hyperai.desktop", "hyper-bundle", "office", "uv", "uv.exe")
  try {
    await mkdir(path.join(project, ".hyper-ai"), { recursive: true })
    await mkdir(path.join(project, ".git"))
    await writeFile(path.join(project, "a.py"), "from b import greet\n\ndef run():\n    return greet()\n")
    await writeFile(path.join(project, "b.py"), "def greet():\n    return 'hello'\n")
    await writeFile(path.join(project, "case.json"), "SENSITIVE_GRAPHIFY_CANARY")
    expect(graphifyEnvironment().GRAPHIFY_BACKEND).toBe("none")
    await expect(graphify(["query", project, "greet"])).rejects.toThrow("opt-in missing")
    await writeFile(path.join(project, ".hyper-ai", "graphify.enabled"), "")
    const result = await graphify(["index", project])
    const content = await readFile(result, "utf8")
    expect(content).toContain("greet")
    expect(content).not.toContain("SENSITIVE_GRAPHIFY_CANARY")
    expect(await readFile(path.join(path.dirname(result), "GRAPH_REPORT.md"), "utf8")).toContain("Community")
    expect(await graphify(["path", project, "run()", "greet()"])).toContain("calls")
    expect(await graphify(["query", project, "greet"])).toContain("greet")
    const config = path.join(root, "config")
    const before = process.env.OPENCODE_CONFIG_DIR
    process.env.OPENCODE_CONFIG_DIR = config
    try {
      await mkdir(path.join(config, "hyper"), { recursive: true })
      await writeFile(path.join(config, "hyper", "privacy.json"), '{"case_mode":true}')
      await expect(graphify(["query", project, "greet"])).rejects.toThrow("case mode")
    } finally {
      if (before === undefined) delete process.env.OPENCODE_CONFIG_DIR
      else process.env.OPENCODE_CONFIG_DIR = before
    }
    expect(await readFile(path.join(project, "case.json"), "utf8")).toBe("SENSITIVE_GRAPHIFY_CANARY")
    await rm(path.join(project, ".hyper-ai", "graphify.enabled"))
    await expect(graphify(["query", project, "greet"])).rejects.toThrow("opt-in missing")
  } finally {
    if (previousHome === undefined) delete process.env.HYPER_GRAPHIFY_HOME
    else process.env.HYPER_GRAPHIFY_HOME = previousHome
    if (previousUv === undefined) delete process.env.HYPER_UV
    else process.env.HYPER_UV = previousUv
    await rm(root, { recursive: true, force: true })
  }
}, 120000)
