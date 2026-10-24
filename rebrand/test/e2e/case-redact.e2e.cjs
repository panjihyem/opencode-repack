// Uji alur redaksi lokal `hyper-case` (tanpa jaringan).
//
// usage: node rebrand/test/e2e/case-redact.test.cjs
const { spawnSync } = require("node:child_process")
const crypto = require("node:crypto")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

const caseDir = path.join(__dirname, "..", "..", "files", "desktop", "hyper", "case")
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
    if (spawnSync(candidate, ["--version"], { encoding: "utf8" }).status === 0) return candidate
  }
  throw new Error("python 3 tidak ditemukan; set HYPER_TEST_PYTHON")
}

const py = python()
const work = fs.mkdtempSync(path.join(os.tmpdir(), "hyper-case-redact-"))
const home = path.join(work, "home")
const kind = "uji-ppn"
const kindDir = path.join(home, "Hyper-Knowledge", "cases", kind)
fs.mkdirSync(kindDir, { recursive: true })

const person = { type: "object", properties: { nama: { type: "string" }, npwp: { type: "string" }, alamat: { type: "string" } } }
fs.writeFileSync(
  path.join(kindDir, "parameter.schema.json"),
  JSON.stringify(
    {
      title: "Uji PPN",
      required: ["wp", "terperiksa"],
      properties: {
        wp: person,
        terperiksa: { type: "object", properties: { nama: { type: "string" }, nip: { type: "string" } } },
        rekening: { type: "array", items: { type: "object", properties: { nomor: { type: "string" }, pemilik: { type: "string" }, bank: { type: "string" } } } },
        dasar: { type: "object", properties: { nomor: { type: "string" } } },
        nilai: { type: "number" },
      },
    },
    null,
    2,
  ),
)

const sheet = {
  wp: { nama: "Budi Santoso", npwp: "09.123.456.7-890.000", alamat: "Jl. Merdeka No. 10 Jakarta" },
  terperiksa: { nama: "Siti Aminah", nip: "198501012010011001" },
  rekening: [{ nomor: "1234567890123", pemilik: "Budi Santoso", bank: "Bank Uji" }],
  dasar: { nomor: "SP2-0001/2026" },
  nilai: 125000000,
}
const sheetFile = path.join(work, "parameter.json")
const original = JSON.stringify(sheet, null, 2) + "\n"
fs.writeFileSync(sheetFile, original)
const before = crypto.createHash("sha256").update(fs.readFileSync(sheetFile)).digest("hex")

const env = { ...process.env, HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: path.join(home, ".config") }
const run = (...args) => spawnSync(py, [cli, ...args], { encoding: "utf8", env, cwd: work })

const out = path.join(work, "hasil")
const redact = run("redact", kind, "--data", sheetFile, "--out", out)
check("redact exits 0", redact.status === 0, redact.stderr || redact.stdout)
check("parameter asli tidak berubah", before === crypto.createHash("sha256").update(fs.readFileSync(sheetFile)).digest("hex"))

const redactedFile = path.join(out, "parameter.redacted.json")
const tokensFile = path.join(out, "tokens.json")
const redacted = fs.readFileSync(redactedFile, "utf8")
check("sheet redaksi dan token map dibuat", fs.existsSync(redactedFile) && fs.existsSync(tokensFile))
check("NIK/NPWP/nama asli tidak ada di sheet redaksi", !redacted.includes("09.123.456.7-890.000") && !redacted.includes("Budi Santoso") && !redacted.includes("Siti Aminah"))
check("nominal tetap dipertahankan", redacted.includes("125000000"))
check("token bertipe dipakai", redacted.includes("[[NAMA-1]]") && redacted.includes("[[NPWP-1]]"), redacted.slice(0, 200))

const tokens = JSON.parse(fs.readFileSync(tokensFile, "utf8"))
check("token map menyimpan nilai asli secara lokal", Object.values(tokens.tokens || {}).includes("Budi Santoso"))

const raw = path.join(work, "mentah.txt")
fs.writeFileSync(raw, "WP dengan NIK 3174012508900001 dan NPWP 09.123.456.7-890.000\n")
const blocked = run("screen", "--data", raw)
check("screen memblokir pola identitas", blocked.status !== 0, blocked.stdout)
check("screen tidak menyebut pasti aman", !/pasti aman/i.test(blocked.stdout))

const nameOnly = path.join(work, "nama.txt")
fs.writeFileSync(nameOnly, "Pemilik rekening: Budi Santoso\n")
const nameBlocked = run("screen", "--data", nameOnly, "--tokens", tokensFile)
check("screen memblokir nilai yang dikenal dari sheet", nameBlocked.status !== 0, nameBlocked.stdout)

const narrative = path.join(work, "narasi.txt")
fs.writeFileSync(narrative, "Pihak yang diperiksa menyetujui jadwal pertemuan berikutnya.\n")
const clean = run("screen", "--data", narrative)
check("narasi tanpa pola lolos", clean.status === 0, clean.stdout)
check("peringatan keterbatasan ditampilkan", /BUKAN jaminan aman/i.test(clean.stdout), clean.stdout)

const restoredFile = path.join(work, "pulih.json")
const restored = run("restore", "--data", redactedFile, "--tokens", tokensFile, "--out", restoredFile)
check("restore exits 0", restored.status === 0, restored.stderr || restored.stdout)
const restoredText = fs.readFileSync(restoredFile, "utf8")
check("nilai asli kembali setelah restore", restoredText.includes("Budi Santoso") && restoredText.includes("09.123.456.7-890.000"))

const again = run("redact", kind, "--data", sheetFile, "--out", out)
check("redact menolak menimpa hasil", again.status !== 0, again.stdout)

const leftovers = path.join(work, "token-asing.txt")
fs.writeFileSync(leftovers, "nilai [[TIDAK-ADA-1]]\n")
const badRestore = run("restore", "--data", leftovers, "--tokens", tokensFile)
check("restore menolak token tak dikenal", badRestore.status !== 0, badRestore.stdout)

fs.rmSync(work, { recursive: true, force: true })
const failed = checks.filter((c) => !c.ok)
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`)
process.exit(failed.length ? 1 : 0)
