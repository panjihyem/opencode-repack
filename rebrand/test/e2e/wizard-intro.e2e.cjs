// Pemeriksaan statis wizard intro/persetujuan. Uji Electron penuh ada di
// wizard.e2e.cjs (butuh Playwright); pemeriksaan ini menjaga agar auto-start
// dan gerbang persetujuan tidak hilang tanpa disadari.
//
// usage: node rebrand/test/e2e/wizard-intro.e2e.cjs
const fs = require("node:fs")
const path = require("node:path")

const file = path.join(__dirname, "..", "..", "files", "desktop", "wizard", "wizard.html")
const html = fs.readFileSync(file, "utf8")

const checks = []
const check = (name, ok, detail = "") => {
  checks.push({ name, ok })
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` - ${detail}` : ""}`)
}

check("intro adalah langkah pertama", /<section id="step-intro">/.test(html))
check("langkah lain tersembunyi awalnya", (html.match(/id="step-(welcome|choose|run)" hidden/g) || []).length === 3)
check("tombol lanjut awalnya nonaktif", /id="next" class="primary" disabled/.test(html))
check("ada checkbox persetujuan", /id="consent" type="checkbox"/.test(html))
check("persetujuan mensyaratkan checkbox", /\$\("consent"\)\.checked/.test(html))
check("persetujuan dicatat sebelum langkah berikut", /api\.consent\(\{ terms: docs\.terms\.hash, privacy: docs\.privacy\.hash \}\)[\s\S]{0,400}return show\(1\)/.test(html))
check("tiga dokumen dapat dibuka", (html.match(/data-doc="(terms|privacy|licenses)"/g) || []).length === 3)
check("dokumen dibaca dari paket, bukan URL", /api\.doc\(name\)/.test(html) && !/https?:\/\//.test(html))

check("lima keunggulan ditampilkan", (html.match(/<li><b>/g) || []).length === 5)
check("menyebut ekstraksi dokumen lokal", /Ekstraksi dokumen lokal/.test(html))
check("menyebut pembuatan dokumen lokal", /Pembuatan dokumen lokal/.test(html))
check("menyebut memori lokal", /Hindsight menyimpan memori/.test(html))
check("menjelaskan data cloud", /prompt, lampiran, kutipan berkas, dan keluaran tool/.test(html))
check("menyatakan memori lokal bukan berarti offline", /bukan berarti ekstraksi\/konsolidasi memorinya offline/.test(html))
check("menyebut redaksi eksplisit", /tidak otomatis melindungi semua input/.test(html))

const unattended = html.match(/<input id="unattended"[^>]*>/)?.[0] ?? ""
check("mode tanpa konfirmasi default mati", !/\bchecked\b/.test(unattended), unattended)
check("tidak ada beginAuto lama", !/beginAuto/.test(html))
check("auto tidak memulai unduhan", !/if \(auto\)[\s\S]{0,300}api\.start/.test(html))
check("auto hanya memilih default", /if \(auto\) \{[\s\S]{0,300}unattended"\)\.checked = false/.test(html))

const failed = checks.filter((c) => !c.ok)
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`)
process.exit(failed.length ? 1 : 0)
