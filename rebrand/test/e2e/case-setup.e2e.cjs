// Uji self-check paket kasus dan panduan singkat.
//
// usage: node rebrand/test/e2e/case-setup.test.cjs
const { spawnSync } = require("node:child_process")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

const root = path.join(__dirname, "..", "..")
const script = path.join(root, "scripts", "check-case-setup.ts")
const caseDir = path.join(root, "files", "desktop", "hyper", "case")
const docs = path.join(root, "docs", "SECURITY-QUICKSTART.md")

const checks = []
const check = (name, ok, detail = "") => {
  checks.push({ name, ok })
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` - ${detail}` : ""}`)
}

const bun = process.platform === "win32" ? ["cmd.exe", ["/c", "bun"]] : ["bun", []]
const runBun = (args) => spawnSync(bun[0], [...bun[1], script, ...args], { encoding: "utf8", cwd: root })

const ok = runBun([caseDir])
check("self-check paket utuh", ok.status === 0, ok.stderr || ok.stdout)

const broken = fs.mkdtempSync(path.join(os.tmpdir(), "hyper-case-broken-"))
for (const name of ["case.py", "cli.py", "pseudonym.py", "casemode.py"]) {
  fs.copyFileSync(path.join(caseDir, name), path.join(broken, name))
}
fs.rmSync(path.join(broken, "pseudonym.py"))
const missing = runBun([broken])
check("self-check gagal bila komponen hilang", missing.status !== 0, missing.stdout)
check("komponen hilang disebut", /hilang: pseudonym\.py/.test(missing.stdout + missing.stderr))

check("panduan tersedia", fs.existsSync(docs))
const text = fs.readFileSync(docs, "utf8")
check("panduan memuat kontak", text.includes("info@talentabangsa.com"))
check("panduan memuat batas scanner", text.includes("bukan jaminan aman"))
check("panduan memuat alur mode", text.includes("mode on") && text.includes("mode off"))

fs.rmSync(broken, { recursive: true, force: true })
const failed = checks.filter((c) => !c.ok)
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`)
process.exit(failed.length ? 1 : 0)
