// Uji `hyper-case mode` terhadap config OpenCode V2.
//
// usage: node rebrand/test/e2e/case-mode.test.cjs
const { spawnSync } = require("node:child_process")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

const here = __dirname
const caseDir = path.join(here, "..", "..", "files", "desktop", "hyper", "case")
const cli = path.join(caseDir, "cli.py")

const checks = []
const check = (name, ok, detail = "") => {
  checks.push({ name, ok })
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` - ${detail}` : ""}`)
}

function python() {
  const candidates = [
    process.env.HYPER_TEST_PYTHON,
    process.env.APPDATA && path.join(process.env.APPDATA, "ai.hyperai.desktop", "hyper-bundle", "office", "venv", "Scripts", "python.exe"),
    process.env.APPDATA && path.join(process.env.APPDATA, "ai.hyperai.desktop", "hyper-bundle", "office", "venv", "bin", "python"),
    process.platform === "win32" ? "python" : "python3",
    "python",
  ].filter(Boolean)
  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ["--version"], { encoding: "utf8" })
    if (probe.status === 0) return candidate
  }
  throw new Error("python 3 tidak ditemukan; set HYPER_TEST_PYTHON")
}

const py = python()
const work = fs.mkdtempSync(path.join(os.tmpdir(), "hyper-case-mode-"))
const home = path.join(work, "home")
const xdg = path.join(home, "xdg")
const configDir = path.join(xdg, "opencode")
const configFile = path.join(configDir, "opencode.json")
const pluginFile = path.join(configDir, "plugin", "hyper-memory.ts")
const privacyFile = path.join(configDir, "hyper", "privacy.json")
fs.mkdirSync(path.dirname(pluginFile), { recursive: true })

const userPolicy = { action: "provider.use", resource: "cx", effect: "allow" }
fs.writeFileSync(
  configFile,
  JSON.stringify(
    {
      model: "ocg/deepseek-v4.1-flash",
      permission: { "*": "allow", webfetch: "deny", websearch: "deny", bash: "ask" },
      policies: [userPolicy],
    },
    null,
    2,
  ) + "\n",
)
fs.writeFileSync(pluginFile, "// HYPER_AI_MANAGED - persistent local memory\nexport default { id: 'hyper-memory' }\n")
fs.mkdirSync(path.dirname(privacyFile), { recursive: true })
fs.writeFileSync(privacyFile, JSON.stringify({ managed_permissions: ["websearch"] }))

const run = (action) =>
  spawnSync(py, [cli, "mode", action], {
    encoding: "utf8",
    env: { ...process.env, HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: xdg },
  })

const readConfig = () => JSON.parse(fs.readFileSync(configFile, "utf8"))
const ours = (config) =>
  (config.policies || []).filter(
    (rule) =>
      rule &&
      rule.effect === "deny" &&
      ((rule.action === "integration.use" && ["mcp:context7", "mcp:hyper-search"].includes(rule.resource)) ||
        (rule.action === "tool.use" && ["webfetch:*", "websearch:*"].includes(rule.resource))),
  )

const on = run("on")
check("mode on exits 0", on.status === 0, on.stderr || on.stdout)

const enabled = readConfig()
check("V2 deny policies ditambahkan (4)", ours(enabled).length === 4, JSON.stringify(ours(enabled)))
check("policy milik user tetap ada", enabled.policies.some((rule) => rule.action === "provider.use" && rule.resource === "cx"))
check("provider cloud tidak diblokir", !enabled.policies.some((rule) => rule.action === "provider.use" && rule.effect === "deny"))
check("permission V1 milik user tidak dihapus", enabled.permission && enabled.permission["*"] === "allow" && enabled.permission.webfetch === "deny" && enabled.permission.bash === "ask")
check("hanya larangan V1 tercatat yang dibersihkan", enabled.permission && enabled.permission.websearch === undefined && enabled.permission.webfetch === "deny")
check("plugin memori dinonaktifkan", fs.readFileSync(pluginFile, "utf8").includes("disabled while case mode is on"))

const onAgain = run("on")
check("mode on idempoten", onAgain.status === 0 && ours(readConfig()).length === 4, onAgain.stderr)

const off = run("off")
check("mode off exits 0", off.status === 0, off.stderr || off.stdout)
const disabled = readConfig()
check("policy buatan mode dicabut", ours(disabled).length === 0)
check("policy user bertahan setelah off", disabled.policies.length === 1 && disabled.policies[0].resource === "cx")
check("permission user bertahan setelah off", disabled.permission["*"] === "allow" && disabled.permission.webfetch === "deny" && disabled.permission.bash === "ask")
check("plugin no-op dibersihkan", !fs.existsSync(pluginFile))

const offAgain = run("off")
check("mode off idempoten", offAgain.status === 0)

fs.rmSync(work, { recursive: true, force: true })
const failed = checks.filter((c) => !c.ok)
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`)
process.exit(failed.length ? 1 : 0)
