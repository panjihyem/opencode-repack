// Headless wizard interaction with real case CLI; isolated synthetic home, no Electron or network.
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const crypto = require("node:crypto")
const { spawnSync } = require("node:child_process")

const root = path.resolve(__dirname, "../..")
const playwright = require(path.resolve(root, "../node_modules/.bun/playwright@1.59.1/node_modules/playwright"))
const work = fs.mkdtempSync(path.join(os.tmpdir(), "hyper-case-window-"))
const home = path.join(work, "home")
const kind = "synthetic"
const source = path.join(work, "input.json")
const output = path.join(work, "result")
const schema = path.join(home, "Hyper-Knowledge", "cases", kind, "parameter.schema.json")
const cli = path.join(root, "files/desktop/hyper/case/cli.py")
const py = process.env.HYPER_TEST_PYTHON || (process.platform === "win32" ? path.join(process.env.APPDATA, "ai.hyperai.desktop/hyper-bundle/office/venv/Scripts/python.exe") : "python3")
const env = { ...process.env, HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: path.join(home, ".config") }
const input = JSON.stringify({ kasus_id: "SYN-001", wp: { nama: "Budi Santoso", npwp: "09.123.456.7-890.000" } })
fs.mkdirSync(path.dirname(schema), { recursive: true })
fs.mkdirSync(path.join(home, ".config/opencode"), { recursive: true })
fs.writeFileSync(path.join(home, ".config/opencode/opencode.json"), "{}")
fs.writeFileSync(schema, JSON.stringify({ title: "Kasus sintetik", required: ["kasus_id", "wp"], properties: { kasus_id: { type: "string" }, wp: { type: "object", properties: { nama: { type: "string" }, npwp: { type: "string" } } } } }))
fs.writeFileSync(source, input)
fs.mkdirSync(output)
const hash = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex")
const before = hash(source)
const cliRun = (...args) => {
  const r = spawnSync(py, [cli, ...args, "--json"], { env, encoding: "utf8", timeout: 30000 })
  if (r.status !== 0) throw new Error(r.stderr || r.stdout || `CLI exited ${r.status}`)
  return JSON.parse(r.stdout)
}
let opened = false
let confirm = false
let requests = 0
let browser
;(async () => {
  browser = await playwright.chromium.launch({ executablePath: process.env.HYPER_TEST_BROWSER || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true })
  const context = await browser.newContext({ offline: true })
  const page = await context.newPage()
  page.on("request", (request) => { if (/^https?:/.test(request.url())) requests++ })
  await page.exposeBinding("caseBridge", async (_source, method, input) => {
    if (method === "status") return { caseMode: cliRun("mode", "status").case_mode }
    if (method === "list") return cliRun("list").cases
    if (method === "pickParameter") return source
    if (method === "pickOutput") return output
    if (method === "prepare") {
      if (!input || input.kind !== kind || input.file !== source || input.output !== output) throw Error("invalid input")
      const report = cliRun("validate", kind, "--data", source)
      if (!report.valid) return { ok: false, validation: { missing: report.field_wajib_kosong, wrongType: report.tipe_salah } }
      try {
        cliRun("mode", "on")
        const result = cliRun("redact", kind, "--data", source, "--out", output)
        return { ok: result.ok, output }
      } catch (error) { console.error("bridge prepare:", error); throw error }
    }
    if (method === "openOutput") { opened = input === output; return "" }
    if (method === "deactivate") {
      if (!confirm) return { cancelled: true }
      cliRun("mode", "off")
      return { caseMode: false }
    }
    throw Error(`unexpected method ${method}`)
  })
  await page.addInitScript(() => {
    window.hyperCase = Object.fromEntries(["status", "list", "pickParameter", "pickOutput", "prepare", "openOutput", "deactivate", "close"].map((method) => [method, (input) => window.caseBridge(method, input)]))
  })
  await page.goto(`file:///${path.join(root, "files/desktop/wizard/case.html").replace(/\\/g, "/")}`)
  await page.locator("#kind option[value=synthetic]").waitFor({ state: "attached" })
  const assert = (value, label) => { if (!value) throw Error(label); console.log(`PASS ${label}`) }
  assert((await page.locator("body").innerText()).includes("model AI tetap memakai cloud"), "cloud warning visible")
  assert((await page.locator("body").innerText()).includes("terminal masih dapat mengakses internet"), "shell warning visible")
  await page.locator("#prepare").click()
  assert((await page.locator("#message").innerText()).includes("Pilih jenis kasus"), "missing selection blocked")
  await page.locator("#kind").selectOption(kind)
  await page.locator("#pick-source").click()
  await page.locator("#pick-output").click()
  fs.writeFileSync(source, JSON.stringify({ kasus_id: "SYN-001", wp: {} }))
  await page.locator("#prepare").click()
  await page.locator("#message").getByText(/Parameter belum lengkap/).waitFor()
  assert(!fs.existsSync(path.join(output, "tokens.json")) && !cliRun("mode", "status").case_mode, "invalid data cannot activate mode")
  fs.writeFileSync(source, input)
  await page.locator("#prepare").click()
  try { await page.locator("#continue:visible").waitFor({ timeout: 10000 }) }
  catch (error) { console.error("wizard message:", await page.locator("#message").innerText()); throw error }
  assert(cliRun("mode", "status").case_mode && hash(source) === before, "mode on and original unchanged")
  const redacted = fs.readFileSync(path.join(output, "parameter.redacted.json"), "utf8")
  assert(!redacted.includes("Budi Santoso") && !redacted.includes("09.123.456.7-890.000"), "redacted copy excludes identifiers")
  assert(!(await page.locator("body").innerText()).includes("Budi Santoso"), "token map never displayed")
  assert(!opened, "analysis requires explicit continue")
  await page.locator("#continue").click()
  assert(opened, "continue opens output without model request")
  await page.locator("#end-mode").click()
  assert(cliRun("mode", "status").case_mode, "cancel preserves mode")
  confirm = true
  await page.locator("#end-mode").click()
  await page.getByText("Mode Kasus Secure belum aktif").waitFor()
  assert(fs.existsSync(path.join(output, "tokens.json")) && !cliRun("mode", "status").case_mode, "exit preserves files")
  assert(requests === 0, "zero network or model requests")
  await page.screenshot({ path: path.join(work, "case-window.png") })
  console.log(`capture: ${path.join(work, "case-window.png")}`)
})().catch((error) => { console.error(error); process.exitCode = 1 }).finally(async () => { await browser?.close() })
