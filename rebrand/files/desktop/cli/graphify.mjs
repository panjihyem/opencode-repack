// HYPER_AI_MANAGED — opt-in Graphify code graph; no Hindsight overlap or cloud calls.
import { createHash } from "node:crypto"
import { spawn } from "node:child_process"
import { lstat, mkdir, readFile, realpath, readdir, stat } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

const home = () => path.join(process.env.HYPER_GRAPHIFY_HOME || path.join(os.homedir(), ".local", "share", "hyper-ai"), "graphify")
const binary = (name) => path.join(home(), "venv", process.platform === "win32" ? "Scripts" : "bin", `${name}${process.platform === "win32" ? ".exe" : ""}`)
const outputRoot = (project) => path.join(home(), "graphs", createHash("sha256").update(project).digest("hex").slice(0, 20))
const env = () => {
  const clean = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(?:.*(?:API_KEY|AUTH_TOKEN|ACCESS_TOKEN|SECRET)|GRAPHIFY_BACKEND|ANTHROPIC_BASE_URL|OPENAI_BASE_URL|OLLAMA_BASE_URL)$/i.test(key)))
  return { ...clean, GRAPHIFY_BACKEND: "none", GRAPHIFY_QUERY_LOG_DISABLE: "1" }
}

const run = (command, args, options = {}) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true, ...options, env: env() })
  let text = ""
  child.stdout.on("data", (data) => { text = (text + data).slice(-5000) })
  child.stderr.on("data", (data) => { text = (text + data).slice(-5000) })
  child.on("error", reject)
  child.on("close", (code) => code === 0 ? resolve(text) : reject(new Error(`graphify exited ${code}: ${text}`)))
})

const projectRoot = async (directory) => {
  const root = path.resolve(directory)
  if (await realpath(root) !== root || !(await lstat(root)).isDirectory()) throw new Error("Project root must be a real directory")
  if (!((await stat(path.join(root, ".git")).catch(() => undefined)) || (await stat(path.join(root, ".hg")).catch(() => undefined)))) throw new Error("Graphify requires a code repository")
  const marker = path.join(root, ".hyper-ai", "graphify.enabled")
  const parent = path.dirname(marker)
  if (await realpath(parent).catch((error) => { if (error.code === "ENOENT") return ""; throw error }) !== parent) throw new Error("Project opt-in missing")
  const info = await lstat(marker).catch((error) => { if (error.code === "ENOENT") return undefined; throw error })
  if (!info?.isFile() || info.size !== 0) throw new Error("Project opt-in missing")
  const config = path.join(process.env.OPENCODE_CONFIG_DIR || path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), "opencode"), "hyper", "privacy.json")
  const privacy = await readFile(config, "utf8").catch((error) => { if (error.code === "ENOENT") return "{}"; throw error })
  let caseMode = true
  try { caseMode = JSON.parse(privacy).case_mode === true } catch {}
  if (caseMode) throw new Error("Graphify unavailable in case mode")
  if (root === home() || root.startsWith(home() + path.sep)) throw new Error("Cannot index Graphify output")
  return root
}

const unsafeCode = async (root) => {
  const inspect = async (directory) => {
    for (const item of await readdir(directory, { withFileTypes: true })) {
      if (item.name === ".git" || item.name === ".hyper-ai" || item.name === "node_modules" || item.name === "graphify-out") continue
      if (item.isDirectory() && /^(?:docs?|documentation|knowledge|cases?|kasus|data)$/i.test(item.name)) throw new Error("Documentation or case directory in Graphify project")
      const full = path.join(directory, item.name)
      if (item.isSymbolicLink()) throw new Error("Symlink in Graphify project")
      if (/^(?:case|kasus|secret|credential|token|\.env)(?:\b|[_.-])/i.test(item.name)) throw new Error("Sensitive file in Graphify project")
      if (item.isDirectory()) await inspect(full)
    }
  }
  await inspect(root)
}

export async function graphify(args) {
  const [action, directory, ...rest] = args
  if (!action || !directory || !["index", "query", "path"].includes(action)) throw new Error("usage: hyper graphify index|query|path <opted-in-repo> [terms]")
  const project = await projectRoot(directory)
  await unsafeCode(project)
  const graph = path.join(outputRoot(project), "graphify-out", "graph.json")
  if (action === "index") {
    if (rest.length) throw new Error("Unexpected arguments")
    if (!(await stat(binary("graphify")).catch(() => undefined))?.isFile()) {
      const uv = process.env.HYPER_UV || path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "ai.hyperai.desktop", "hyper-bundle", "office", "uv", process.platform === "win32" ? "uv.exe" : "uv")
      if (!(await stat(uv).catch(() => undefined))?.isFile()) throw new Error("Office uv unavailable; Graphify not installed")
      await mkdir(home(), { recursive: true })
      await run(uv, ["venv", "--python", "3.12", path.join(home(), "venv")])
      await run(uv, ["pip", "install", "--python", binary("python"), "graphifyy==0.9.96"])
    }
    await mkdir(outputRoot(project), { recursive: true })
    await run(binary("graphify"), ["extract", project, "--code-only", "--out", outputRoot(project)])
    await run(binary("graphify"), ["cluster-only", outputRoot(project), "--no-label", "--backend=none", "--no-viz"])
    if (!(await stat(graph).catch(() => undefined))?.isFile()) throw new Error("Graphify output missing")
    return graph
  }
  if (!(await stat(graph).catch(() => undefined))?.isFile()) throw new Error("Graphify project has not been indexed")
  if (!rest.length || rest.some((arg) => !arg || arg.length > 250)) throw new Error("Graph query terms required")
  if (action === "path" && rest.length !== 2) throw new Error("Path requires two nodes")
  if (action === "query" && rest.length !== 1) throw new Error("Query requires one question")
  return run(binary("graphify"), [action, ...rest, "--graph", graph])
}

export { env as graphifyEnvironment }
