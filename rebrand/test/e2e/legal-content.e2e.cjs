// Memeriksa naskah hukum offline yang dikirim bersama installer.
//
// usage: node rebrand/test/e2e/legal-content.e2e.cjs
const fs = require("node:fs")
const path = require("node:path")

const wizard = path.join(__dirname, "..", "..", "files", "desktop", "wizard")
const docs = path.join(__dirname, "..", "..", "docs")

const checks = []
const check = (name, ok, detail = "") => {
  checks.push({ name, ok })
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` - ${detail}` : ""}`)
}

const read = (file) => {
  const full = path.join(wizard, file)
  return fs.existsSync(full) ? fs.readFileSync(full, "utf8") : ""
}

const terms = read("TERMS.md")
const privacy = read("PRIVACY.md")
const licenses = read("LICENSES.md")
const flows = fs.readFileSync(path.join(docs, "DATA-FLOWS.md"), "utf8")

check("tiga dokumen ada", Boolean(terms && privacy && licenses))
for (const [name, text] of [
  ["Terms", terms],
  ["Privacy", privacy],
  ["Licenses", licenses],
]) {
  check(`${name} punya versi`, /Versi:\s*\d{4}-\d{2}-\d{2}/.test(text))
  check(`${name} memuat kontak`, text.includes("info@talentabangsa.com"))
  check(`${name} tanpa placeholder`, !/\b(TBD|TODO|lorem ipsum)\b/i.test(text))
}

check("Terms menyebut lisensi MIT", /MIT/.test(terms) && /sebagaimana adanya/i.test(terms))
check("Terms menyebut hukum Indonesia", /Republik Indonesia/.test(terms))
check("Terms membatasi bantuan AI", /dapat salah|bukan pengganti/i.test(terms))

check("Privacy membedakan proses lokal", /secara lokal/i.test(privacy))
check("Privacy menyebut model cloud", /model cloud/i.test(privacy))
check("Privacy menyebut Hindsight dan model remote", /Hindsight/.test(privacy) && /model\s+remote/i.test(privacy))
check("Privacy menyebut router", /rai\.talentabangsa\.com/.test(privacy))
check("Privacy menyebut batas jaminan penyedia", /tidak dapat menjamin/i.test(privacy))
check("Privacy menyebut hak subjek data", /mengakses|menghapus|menarik persetujuan/i.test(privacy))
check("Privacy menyebut mode kasus dan shell", /mode kasus/i.test(privacy) && /shell/i.test(privacy))

check("Licenses memuat teks MIT OpenCode", /Permission is hereby granted/.test(licenses) && /THE SOFTWARE IS PROVIDED/.test(licenses))
check("Licenses menyebut komponen pihak ketiga", /Electron/.test(licenses) && /Docling/.test(licenses))

const forbidden = [
  [/100%\s*aman/i, "klaim 100% aman"],
  [/semua data (tetap|selalu) (lokal|aman)/i, "klaim semua data lokal"],
  [/pasti aman/i, "klaim pasti aman"],
  [/tanpa risiko/i, "klaim tanpa risiko"],
]
for (const [pattern, label] of forbidden) {
  const hit = [terms, privacy, licenses].some((text) => pattern.test(text))
  check(`tidak ada ${label}`, !hit)
}

check("inventaris mencatat router", /rai\.talentabangsa\.com/.test(flows))
check("inventaris mencatat memori remote", /ekstraksi\/konsolidasi/i.test(flows) && /remote/i.test(flows))
check("inventaris mencatat log lokal", /log/i.test(flows) && /lokal/i.test(flows))

const prepare = fs.readFileSync(path.join(__dirname, "..", "..", "scripts", "prepare-bundle.ts"), "utf8")
const verify = fs.readFileSync(path.join(__dirname, "..", "..", "verify.ts"), "utf8")
check("wizard beserta dokumen dikemas", /files\/desktop\/wizard/.test(prepare))
check("quickstart dikemas", /SECURITY-QUICKSTART\.md/.test(prepare))
check("verify memeriksa dokumen di paket", /wizard\/TERMS\.md/.test(verify) && /wizard\/LICENSES\.md/.test(verify))
const brand = fs.readFileSync(path.join(__dirname, "..", "..", "brand.ts"), "utf8")
const support = brand.match(/supportEmail:\s*"([^"]+)"/)?.[1] ?? ""
const vendor = brand.match(/vendor:\s*"([^"]+)"/)?.[1] ?? ""
check("kontak berasal dari brand.ts", Boolean(support) && terms.includes(support) && privacy.includes(support))
check("operator sesuai brand.ts", Boolean(vendor) && terms.includes(vendor) && privacy.includes(vendor))
const apache = fs.readFileSync(path.join(wizard, "APACHE-2.0.txt"), "utf8")
const bsd = fs.readFileSync(path.join(wizard, "BSD-3-CLAUSE.txt"), "utf8")
check("teks Apache-2.0 disertakan", /Apache License/.test(apache) && /Version 2\.0/.test(apache))
check("teks BSD-3-Clause disertakan", /Redistribution and use in source and binary forms/.test(bsd))
check("Licenses merujuk berkas lisensi", /APACHE-2\.0\.txt/.test(licenses) && /BSD-3-CLAUSE\.txt/.test(licenses))
const failed = checks.filter((c) => !c.ok)
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`)
process.exit(failed.length ? 1 : 0)
