// End-to-end check of the Hyper AI setup wizard in real Electron.
//
// usage: node rebrand/test/e2e/wizard.e2e.cjs <work-dir> <electron-binary> <screenshots-dir>
//
// <work-dir> must hold `bundle.cjs` (bun build of files/desktop/hyper/bundle.ts
// for node, electron external) and `hyper-bundle/` (output of
// scripts/prepare-bundle.ts). Needs network: the selected components are
// really downloaded. HOME is redirected into <work-dir>, so nothing leaks
// into the real profile.

const { _electron } = require("playwright")
const fs = require("node:fs")
const path = require("node:path")

const [work, electronBinary, shots] = process.argv.slice(2).map((p) => path.resolve(p))
const components = (process.env.E2E_COMPONENTS ?? "lmstudio,hindsight").split(",")
fs.mkdirSync(shots, { recursive: true })

const home = path.join(work, "home")
fs.mkdirSync(home, { recursive: true })
const checks = []
const check = (name, ok, detail = "") => {
  checks.push({ name, ok })
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` - ${detail}` : ""}`)
}

;(async () => {
  const app = await _electron.launch({
    executablePath: electronBinary,
    args: ["--no-sandbox", path.join(__dirname, "harness-main.cjs"), "--hyper-setup"],
    env: {
      ...process.env,
      HOME: home,
      XDG_CONFIG_HOME: path.join(home, ".config"),
      E2E_USERDATA: path.join(work, "userdata"),
      E2E_BUNDLE: path.join(work, "bundle.cjs"),
      HYPER_AI_BUNDLE_ROOT: path.join(work, "hyper-bundle"),
    },
  })
  const page = await app.firstWindow()
  await page.setViewportSize({ width: 760, height: 680 }).catch(() => undefined)
  const snap = (name) => page.screenshot({ path: path.join(shots, `${name}.png`) })
  await page.waitForSelector("#step-intro")

  // Step 0: intro + offline documents + explicit consent.
  check("intro is shown first", (await page.textContent("#title")).includes("Hyper AI"))
  check("next is disabled before consent", await page.isDisabled("#next"))
  check("five advantages are shown", (await page.$$("#step-intro .advantages li")).length === 5)
  await page.click('[data-doc="terms"]')
  await page.waitForSelector("#docdialog[open]")
  check("terms open offline", (await page.textContent("#doctext")).includes("info@talentabangsa.com"))
  await page.click("#docclose")
  await page.check("#consent")
  check("next enabled after consent", await page.isEnabled("#next"))
  await snap("0-intro")
  await page.click("#next")

  // Step 1: options
  await page.waitForSelector("#step-welcome")
  check("unattended is off by default", !(await page.isChecked("#unattended")))
  await snap("1-options")
  await page.click("#next")

  // Step 2: component choice
  await page.waitForSelector("#components input")
  const ids = await page.$$eval("#components input", (inputs) => inputs.map((i) => i.dataset.id))
  check("all four components are offered", ["context7", "lmstudio", "models", "hindsight"].every((id) => ids.includes(id)), ids.join(","))
  check("Context7 is required and checked", await page.isChecked('#components input[data-id="context7"]'))
  check("Context7 cannot be unticked", await page.isDisabled('#components input[data-id="context7"]'))
  for (const id of ids.filter((id) => id !== "context7")) {
    const input = page.locator(`#components input[data-id="${id}"]`)
    if ((await input.isChecked()) !== components.includes(id)) await input.click()
  }
  await snap("2-choose")
  await page.click("#next")

  // Step 3: progress, then completion
  await page.waitForSelector("#progress .row")
  await snap("3-progress")
  const started = Date.now()
  let shotAt = 0
  while (Date.now() - started < 25 * 60_000) {
    if (await page.isEnabled("#next")) break
    if (Date.now() - shotAt > 20_000) (shotAt = Date.now()), await snap(`3-progress-${Math.round((Date.now() - started) / 1000)}s`)
    await page.waitForTimeout(1000)
  }
  await snap("4-complete")
  const title = await page.textContent("#title")
  const statuses = await page.$$eval("#progress .row", (rows) => rows.map((r) => [r.id.replace("row-", ""), r.dataset.status]))
  console.log("statuses", JSON.stringify(statuses))
  check("wizard reports completion", title.includes("Semuanya siap"), title)
  for (const [id, status] of statuses) check(`${id} finished`, status === "done" || status === "skipped", status)

  // Filesystem results
  const config = JSON.parse(fs.readFileSync(path.join(home, ".config", "opencode", "opencode.json"), "utf8"))
  const context7 = config.mcp?.servers?.context7
  check("Context7 registered as MCP server", context7?.type === "local" && fs.existsSync(context7.command[1]), context7?.command?.[1])
  if (components.includes("hindsight")) {
    const venv = path.join(work, "userdata", "hyper-bundle", "hindsight", "venv", "bin", "hindsight-api")
    check("Hindsight installed into its own environment", fs.existsSync(venv), venv)
  }
  if (components.includes("lmstudio") && process.platform === "linux") {
    const image = path.join(work, "userdata", "hyper-bundle", "lm-studio", "LM-Studio.AppImage")
    check("LM Studio AppImage installed and executable", fs.existsSync(image) && (fs.statSync(image).mode & 0o111) !== 0, image)
  }

  // Finishing closes the window, which can abort the click itself.
  await page.click("#next", { noWaitAfter: true }).catch(() => undefined)
  await new Promise((resolve) => setTimeout(resolve, 3000))
  const state = path.join(work, "userdata", "hyper-bundle", "state.json")
  check("wizard remembered completion", fs.existsSync(state) && JSON.parse(fs.readFileSync(state, "utf8")).wizard === "completed")
  const saved = JSON.parse(fs.readFileSync(state, "utf8"))
  check("consent stored with document hashes", Boolean(saved.consent?.version && saved.consent?.terms && saved.consent?.privacy && saved.consent?.at))
  const config2 = JSON.parse(fs.readFileSync(path.join(home, ".config", "opencode", "opencode.json"), "utf8"))
  if (components.includes("hindsight")) check("memory MCP registered after install", config2.mcp?.servers?.mem?.url?.includes(":8888/mcp"))

  await app.close().catch(() => undefined)
  const failed = checks.filter((c) => !c.ok)
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`)
  process.exit(failed.length ? 1 : 0)
})().catch((error) => {
  console.error(error)
  process.exit(1)
})
