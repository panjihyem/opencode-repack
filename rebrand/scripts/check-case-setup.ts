// Memeriksa paket `hyper-case` yang ikut installer, tanpa jaringan.
//
// usage: bun rebrand/scripts/check-case-setup.ts [case-dir]
//
// `case-dir` default ke sumber overlay; saat verifikasi paket, arahkan ke
// `hyper-bundle/office/lib/case` di hasil electron-builder.
import { spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const here = import.meta.dir
const caseDir = path.resolve(process.argv[2] ?? path.join(here, "..", "files", "desktop", "hyper", "case"))
const required = ["case.py", "cli.py", "pseudonym.py", "casemode.py"]

const problems: string[] = []
for (const name of required) {
  if (!existsSync(path.join(caseDir, name))) problems.push(`hilang: ${name}`)
}
if (problems.length) {
  console.error(`paket kasus tidak lengkap di ${caseDir}`)
  for (const problem of problems) console.error(`- ${problem}`)
  process.exit(1)
}

function python(): string {
  const candidates = [
    process.env.HYPER_CASE_PYTHON,
    process.env.APPDATA && path.join(process.env.APPDATA, "ai.hyperai.desktop", "hyper-bundle", "office", "venv", "Scripts", "python.exe"),
    process.env.APPDATA && path.join(process.env.APPDATA, "ai.hyperai.desktop", "hyper-bundle", "office", "venv", "bin", "python"),
    process.platform === "win32" ? "python" : "python3",
    "python",
  ].filter(Boolean) as string[]
  for (const candidate of candidates) {
    if (spawnSync(candidate, ["--version"], { encoding: "utf8" }).status === 0) return candidate
  }
  throw new Error("python 3 tidak ditemukan; set HYPER_CASE_PYTHON")
}

const pythonBinary = python()
const work = mkdtempSync(path.join(os.tmpdir(), "hyper-case-check-"))
const home = path.join(work, "home")
const kind = "uji-setup"
const kindDir = path.join(home, "Hyper-Knowledge", "cases", kind)
mkdirSync(kindDir, { recursive: true })
writeFileSync(
  path.join(kindDir, "parameter.schema.json"),
  JSON.stringify({
    title: "Uji setup",
    required: ["wp"],
    properties: { wp: { type: "object", properties: { nama: { type: "string" }, npwp: { type: "string" } } } },
  }),
)
const sheet = path.join(work, "parameter.json")
writeFileSync(sheet, JSON.stringify({ wp: { nama: "Nama Uji", npwp: "09.123.456.7-890.000" } }))

const env = { ...process.env, HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: path.join(home, ".config") }
const cli = path.join(caseDir, "cli.py")
const run = (...args: string[]) => spawnSync(pythonBinary, [cli, ...args], { encoding: "utf8", env, cwd: work })

const results: string[] = []
const expect = (label: string, result: ReturnType<typeof run>, codes: number[]) => {
  if (!codes.includes(result.status ?? -1)) {
    console.error(`GAGAL ${label}: exit ${result.status}\n${result.stderr || result.stdout}`)
    problems.push(label)
    return
  }
  results.push(label)
}

mkdirSync(path.join(home, ".config", "opencode"), { recursive: true })
writeFileSync(path.join(home, ".config", "opencode", "opencode.json"), JSON.stringify({ model: "ocg/deepseek-v4.1-flash", policies: [] }, null, 2))

expect("mode on", run("mode", "on"), [0])
expect("mode status", run("mode", "status"), [0])
expect("redact", run("redact", kind, "--data", sheet, "--out", path.join(work, "hasil")), [0])
const raw = path.join(work, "mentah.txt")
writeFileSync(raw, "NIK 3174012508900001\n")
expect("screen memblokir", run("screen", "--data", raw), [1, 2])
expect("mode off", run("mode", "off"), [0])

if (problems.length) {
  console.error(`\nself-check gagal (${problems.length}): ${problems.join(", ")}`)
  rmSync(work, { recursive: true, force: true })
  process.exit(1)
}
rmSync(work, { recursive: true, force: true })
console.log(`self-check kasus lulus (${results.length} langkah, tanpa jaringan)`)
