// Memeriksa gerbang persetujuan di proses utama dan bentuk catatan lokal.
// Uji hashing ada di rebrand/test/consent.test.ts; uji Electron penuh dapat
// dijalankan dengan wizard.e2e.cjs bila Playwright tersedia.
//
// usage: node rebrand/test/e2e/wizard-consent.e2e.cjs
const fs = require("node:fs")
const path = require("node:path")

const hyper = path.join(__dirname, "..", "..", "files", "desktop", "hyper")
const bundle = fs.readFileSync(path.join(hyper, "bundle.ts"), "utf8")
const wizard = fs.readFileSync(path.join(__dirname, "..", "..", "files", "desktop", "wizard", "wizard.html"), "utf8")

const checks = []
const check = (name, ok, detail = "") => {
  checks.push({ name, ok })
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` - ${detail}` : ""}`)
}

const gate = bundle.indexOf("if (!consentValid((await readState()).consent, docs))")
const updates = bundle.indexOf("startHyperUpdates(")
const services = bundle.indexOf("await startServices(children)")
check("gerbang consent sebelum updater", gate !== -1 && gate < updates)
check("gerbang consent sebelum layanan", gate !== -1 && gate < services)
check("tanpa consent tidak menjalankan layanan", /consentValid\(\(await readState\(\)\)\.consent, await docsNow\(\)\)\)[\s\S]{0,200}return/.test(bundle))
check("start ditolak tanpa consent", /ipcMain\.handle\("hyper:start"[\s\S]{0,400}if \(!consentValid[\s\S]{0,120}return \{ ok: false, error: "consent" \}/.test(bundle))
check("consent membandingkan hash dokumen", /payload\?\.terms !== docs\.terms\.hash \|\| payload\?\.privacy !== docs\.privacy\.hash/.test(bundle))
check("consent mencatat versi dan waktu", /version: consentVersion\(docs\)[\s\S]{0,120}terms: docs\.terms\.hash[\s\S]{0,120}privacy: docs\.privacy\.hash[\s\S]{0,120}at: new Date\(\)\.toISOString\(\)/.test(bundle))
check("catatan consent tanpa isi kasus", !/consent\s*[:=][\s\S]{0,200}(prompt|content|sheet|caseFile|tokens)/i.test(bundle))
check("tanpa konfirmasi default mati", /unattended: opts\?\.unattended === true/.test(bundle))
check("wizard tidak memanggil start sebelum consent", wizard.indexOf("api.consent") < wizard.indexOf("api.start"))
check("dokumen berubah meminta persetujuan ulang", /docs-changed/.test(bundle) && /docs-changed/.test(wizard))

const failed = checks.filter((c) => !c.ok)
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`)
process.exit(failed.length ? 1 : 0)
