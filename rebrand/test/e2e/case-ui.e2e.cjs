// Offline checks for the user-facing secure case window.
const fs = require("node:fs")
const path = require("node:path")

const desktop = path.join(__dirname, "..", "..", "files", "desktop")
const html = fs.readFileSync(path.join(desktop, "wizard", "case.html"), "utf8")
const preload = fs.readFileSync(path.join(desktop, "wizard", "case-preload.cjs"), "utf8")
const main = fs.readFileSync(path.join(desktop, "hyper", "case-ui.ts"), "utf8")
const bundle = fs.readFileSync(path.join(desktop, "hyper", "bundle.ts"), "utf8")
const apply = fs.readFileSync(path.join(__dirname, "..", "..", "apply.ts"), "utf8")

const checks = []
const check = (name, ok) => {
  checks.push({ name, ok })
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`)
}

check("localized case window title", html.includes("Mulai Kasus Sensitif"))
check("source picker JSON only", /extensions: \["json"\]/.test(main))
check("native folder picker", /openDirectory.*createDirectory/.test(main))
check("mode status is visible", /Mode Kasus Secure aktif/.test(html) && /caseMode/.test(html))
check("cloud warning is shown", /tetap memakai cloud/.test(html) || /model AI tetap memakai cloud/i.test(html))
check("shell limitation explained", /shell[^<]{0,100}(jaringan|internet)/i.test(html))
check("result contains no token map value", !/textContent\s*=\s*.*tokenMap/.test(html))
check("user must confirm before proceeding", /Lanjut ke analisa/.test(html) && /parameter\.redacted\.json saja/.test(html))
check("no automatic provider request in case UI", !/fetch\(|api\.prompt|sendMessage|submitPrompt/.test(html))
check("source file must be JSON", /DATA_EXTENSIONS/.test(main))
check("source cannot be overwritten", /realOutput === realSource/.test(main))
check("source content hash verified unchanged", /sourceHash !== afterHash/.test(main))
check("screen failure removes artifacts", /rm\(redactedPath, \{ force: true \}\)/.test(main) && /tokenPath/.test(main))
check("native confirmation before turning mode off", /Akhiri Mode Kasus Secure\?/.test(main) && /cancelId: 0/.test(main))
check("titlebar button is contributed in app chrome", /packages\/app\/src\/shell\/titlebar\/titlebar\.tsx/.test(apply) && /Kasus Secure/.test(apply))
check("titlebar uses built-in lock icon", /Icon name="lock"/.test(apply))
check("titlebar IPC is handled in main process", /ipcMain\.handle\("hyper:case:open"/.test(bundle))
check("preload caseSecure channel exists", /caseSecure\(\): void/.test(apply) && /caseSecure: \(\) => ipcRenderer\.invoke/.test(apply))
check("desktop bridge implements typed caseSecure", /caseSecure: \(\) => api\.caseSecure\(\)/.test(apply) && /caseSecure\(\): void/.test(apply))
check("secure window renderer sandboxed", /sandbox: true/.test(bundle) && /contextIsolation: true/.test(bundle) && /nodeIntegration: false/.test(bundle))
check("preload exposes fixed IPC only", /contextBridge\.exposeInMainWorld/.test(preload) && !/ipcRenderer\.send\([^"']/.test(preload))

const missingPackage = ["case.html", "case-preload.cjs"].filter((name) => !fs.existsSync(path.join(desktop, "wizard", name)))
check("case UI files present for bundle step", missingPackage.length === 0)
check("installer verifier requires case HTML and preload", /wizard\/case\.html/.test(fs.readFileSync(path.join(__dirname, "..", "..", "verify.ts"), "utf8")) && /wizard\/case-preload\.cjs/.test(fs.readFileSync(path.join(__dirname, "..", "..", "verify.ts"), "utf8")))

const failed = checks.filter((item) => !item.ok)
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`)
process.exit(failed.length ? 1 : 0)
