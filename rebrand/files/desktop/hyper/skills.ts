import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { caseModule, deckModule, forensicModule, officeInstalled, officePython } from "./office"

// Office-work skills for the agent: Excel (including formulas), reports
// (DOCX/PPTX/PDF), charts and tax-investigation documents. Written only while
// the office toolkit is installed; a user-authored skill is never replaced.

const MANAGED = "HYPER_AI_MANAGED"

// forensic.py ditulis sebagai artefak managed di dataDir/office (lihat office.ts);
// path absolutnya disuntikkan ke body skill lewat placeholder ini.
const FORENSIC_PLACEHOLDER = "__FORENSIC_PY__"

type SkillSpec = {
  id: string
  description: string
  body: (python: string, forensic: string, caseCli: string) => string
}

const skills: SkillSpec[] = [
  {
    id: "hyper-excel",
    description:
      "Membaca, menganalisa dan membuat Excel (.xlsx): data, formula, audit rantai formula, tabel ringkasan. Gunakan untuk file Excel apa pun.",
    body: (python) => `---
name: hyper-excel
description: Membaca, menganalisa dan membuat file Excel (.xlsx) beserta formula; audit dan buat formula baru. Gunakan untuk pekerjaan spreadsheet apa pun.
---

# Excel (Hyper AI)

\`${MANAGED}\`

Python siap pakai: \`${python}\`

## Membaca data & formula

Jangan menempel isi file utuh ke konteks; tulis script kecil lalu jalankan:

\`\`\`
${python} script.py
\`\`\`

- \`openpyxl\` untuk nilai, formula dan sheet: \`load_workbook(path, data_only=False)\` —
  \`data_only=False\` mempertahankan formula; pairing dengan \`data_only=True\` (nilai cache)
  memperlihatkan mana formula yang berbeda nilainya.
- Daftar formula + sel + rantai referensi: eksplorasi \`cell.value\` berawal "=".
- \`formulas\` paket dapat MEMBACA xlsx lalu mengevaluasi seluruh graf formula (Excel Calculator):

\`\`\`
import formulas
xl = formulas.ExcelModel().loads("file.xlsx").finish()
solusi = xl.calculate()   # lacak dependensi, uji skenario
\`\`\`

## Menulis / memodifikasi

- Buat workbook baru + sheet + formula dengan \`openpyxl\`; perlu penghitungan nilai oleh Excel
  saat dibuka — tulis formula, bukan nilai.
- Tabel besar/statistik: \`pandas.read_excel\` / \`to_excel\` (\`openpyxl\` sebagai engine).
- Selalu simpan ke berkas BARU saat memodifikasi milik user; jangan menimpa asli.
- Formula bahasa Indonesia/English mapping: gunakan nama fungsi Inggris di berkas (\`SUM\`, \`VLOOKUP\`;
  Excel menerjemahkan tampilan).
`,
  },
  {
    id: "hyper-report",
    description:
      "Membuat dokumen Word (.docx), PowerPoint (.pptx), PDF, dan pengolahan form PDF. Gunakan saat membuat laporan, slide, atau dokumen resmi.",
    body: (python) => `---
name: hyper-report
description: Membuat dokumen Word (.docx), PowerPoint (.pptx), PDF, dan pengolahan PDF (gabung, pisah, isi form). Gunakan saat membuat laporan/slide/dokumen resmi.
---

# Laporan & Dokumen Resmi (Hyper AI)

\`${MANAGED}\`

Python siap pakai: \`${python}\`

## Word (.docx) — \`python-docx\`

- Struktur: heading → paragraf → tabel; gaya nama standar ("Heading 1", "Table Grid").
- Untuk laporan panjang: buat dulu kerangka (outline) dari data hasil analisa, minta konfirmasi
  isi bila user perlu, baru generate.

## PowerPoint (.pptx) — \`python-pptx\`

- Slide dari template: \`Presentation("template.pptx")\`; placeholder diisi \`slide.shapes\`.
- 1 ide per slide; angka penting ditampilkan besar; detail pindah ke speaker notes.
- Untuk data publik/sintetis, generator contoh 16:9: \`${python} __DECK_PY__ input.json hasil-baru.pptx\`. JSON: {"data_class":"public","title":"Tren","source":"Dataset publik 2026","rows":[{"label":"A","value":12}]}. Hasil dua slide: grafik PNG dan chart PowerPoint yang bisa diedit; sumber tercetak. Jangan timpa berkas asli.
- Render setiap slide ke gambar/PDF dan cek teks terpotong, footer, chart serta atribusi sebelum menyerahkan PPTX. Jangan kirim data kasus asli ke layanan desain/gambar cloud.
- Aset gambar internet: cari dan pilih dulu halaman file Wikimedia Commons beserta pembuat dan lisensinya. Hanya untuk data publik dengan persetujuan eksplisit. Unduh memakai modul \`assets.ts\` terikat host dan simpan \`.license.json\` bersama gambar. Sertakan sumber dan atribusi pada slide/catatan. Jangan anggap semua gambar internet bebas pakai.

## PDF — \`reportlab\`, \`pypdf\`

- PDF data-driven (form BAP/LHP): \`reportlab\` (canvas atau platypus untuk dokumen mengalir).
- Gabung/pisah/isi form bertanda (AcroForm): \`pypdf\` (\`PdfWriter\`, \`append\`, field \`update_page_form_field_values\`).
- Font Indonesia aman: font bawaan mendukung Latin dasar; PNG/SVG chart dari \`hyper-chart\`.

## Alur baku laporan

1. Kumpulkan data (Excel/Docling/knowledge).
2. Buat chart (matplotlib) sebagai PNG.
3. Sisipkan ke DOCX/PPTX/PDF.
`,
  },
  {
    id: "hyper-graphify",
    description: "Peta struktur kode lokal per project dengan Graphify; berbeda dari chart/Sankey dan Hindsight.",
    body: () => `---
name: hyper-graphify
description: Peta struktur kode lokal pada repo yang secara eksplisit diaktifkan user. Tidak untuk berkas kasus.
---

# Graphify kode lokal

\`${MANAGED}\`

Hindsight = ingatan sesi/pengetahuan; hyper-fundflow = Sankey; Graphify = hubungan kode (import/call) per repo.

Setelah user membuat berkas kosong \`.hyper-ai/graphify.enabled\` di root repo kode yang dipilih, jalankan \`hyper graphify index <repo>\` (memasang graphifyy 0.9.96 di venv terpisah saat pertama kali), lalu \`hyper graphify query <repo> "pertanyaan"\` atau \`hyper graphify path <repo> "run()" "greet()"\`. Semua kode diproses AST lokal; output terpisah di ~/.local/share/hyper-ai/graphify/graphs/. Jangan jalankan pada data kasus, jangan aktifkan Graphify Cloud, semantic docs, global hook, atau graphify install.

Rollback: hapus marker project untuk menolak akses; hapus venv/graph project hanya atas permintaan user. Jangan menyentuh memori Hindsight.
`,
  },
  {
    id: "hyper-chart",
    description:
      "Membuat grafik analisa (batang, garis, jumlah, scatter) dari data Excel/CSV; pilihan chart tepat guna untuk laporan.",
    body: (python) => `---
name: hyper-chart
description: Membuat grafik dari data (batang, garis, pie, scatter, histogram) untuk laporan dan analisa; simpan sebagai PNG/SVG siap sisipkan ke dokumen.
---

# Grafik (Hyper AI)

\`${MANAGED}\`

Python siap pakai: \`${python}\` — paket \`matplotlib\` (+ \`pandas\` untuk baca data).

## Praktik

- Backend tanpa layar wajib: \`matplotlib.use("Agg")\` sebelum pyplot.
- Simpan: \`plt.savefig("out.png", dpi=200, bbox_inches="tight")\`.
- Data dari Excel: \`pandas.read_excel\`; dulu agregasi (\`groupby\`/pivot), baru plot.
- Pilihan tepat: tren waktu → garis; perbandingan kategori → batang; komposisi ≤5 bagian → pie;
  insight angka tunggal → teks besar, tanpa chart.

## Gaya untuk dokumen resmi

- Judul + satuan + sumber data di caption/bawah.
- Warna datar, tanpa 3D; label nilai langsung di batang bila sedang.
- Diagram alur (visual): tulis Mermaid di Markdown — dirender GUI.
`,
  },
  {
    id: "hyper-tax-id",
    description:
      "Alur dan dokumen penyidikan pajak (SP2ID, BAP, SP2RB, SPNP, LHP); cek konsistensi data penilaian; membuat draf dokumen dari templat lokal. Gunakan untuk pertanyaan prosedur penyidikan dan pembuatan dokumennya.",
    body: () => `---
name: hyper-tax-id
description: Alur dan dokumen penyidikan pajak (SP2ID, BAP, SP2RB, SPNP, LHP); cek konsistensi data penilaian; membuat draf dokumen dari templat lokal. Gunakan untuk pertanyaan prosedur penyidikan dan pembuatan dokumennya.
---

# Penyidikan Pajak (Hyper AI)

\`${MANAGED}\`

## Alur acuan (dasar umum; dokumen resmi selalu jadi sumber utama)

1. SP2ID (surat perintah penyidikan) → penyidikan dimulai.
2. Tindakan: pengumpulan alat bukti, pemeriksaan rekening (SP2RB), penelitian penilaian.
3. BAP (berita acara pemeriksaan) — materi terstruktur: siapa, peristiwa, alat bukti, pernyataan.
4. SPNP (surat pemberitahuan tidak ada tindak lanjut) atau proses lanjutan sesuai temuan.
5. LHP / berita acara penelitian untuk penutup.

## Untuk setiap kasus

- Sumber kebenaran: berkas di folder \`Hyper-Knowledge\` (regulasi/putusan/template) dan memori
  bank \`general\` — cari dulu via MCP \`mem\` sebelum menjawab. Bila regulasi tidak ditemukan
  di sana, sebut bahwa jawaban memakai dasar umum dan minta berkas regulasinya untuk diverifikasi.
- Sebutkan sumber dengan nama berkas + halaman yang benar-benar ada; jangan menyebut nomor
  regulasi dari ingatan tanpa verifikasi.

## Draf dokumen

- Pakai templat user dari \`template/\`; bila belum ada, buat draf dengan bagian baku
  (dasar perintah, hasil, simpulan, usul) dan tandai teks [ISI] yang butuh verifikasi user.
- Data subjek dimanfaatkan secara lokal; keluaran dibuat ringkas sesuai kebutuhan, tidak berlebihan.
`,
  },
  {
    id: "hyper-fundflow",
    description:
      "Analisa aliran dana forensik: sankey/treemap/graph dari data transaksi (Excel/CSV), deteksi siklus transaksi berulang, ekspor workbook multi-sheet + grafik statis. Gunakan untuk visualisasi aliran dana dan analisa jaringan transaksi.",
    body: (python, forensic) => `---
name: hyper-fundflow
description: Analisa aliran dana forensik (Sankey/treemap/graph dari transaksi), deteksi siklus transaksi berulang, ekspor workbook multi-sheet + grafik statis. Gunakan untuk visualisasi aliran dana dan jaringan transaksi.
---

# Aliran Dana Forensik (Hyper AI)

\`${MANAGED}\`

Python siap pakai: \`${python}\` — paket \`duckdb\`, \`networkx\`, \`plotly\`, \`pandas\`, \`openpyxl\`.

## Toolkit cepat (forensic.py)

Modul managed: \`${forensic}\`. Skema tabel transaksi \`hia_txn\`
(tanggal, dari, ke, nominal, keterangan, ref) — nama kolom sumber fleksibel
(pengirim/penerima/asal/tujuan… otomatis dinormalkan).

\`\`\`
${python} ${forensic} --db kasus.duckdb load     --csv transaksi.csv
${python} ${forensic} --db kasus.duckdb summary  --top 20
${python} ${forensic} --db kasus.duckdb cycles   --out cycles.json
${python} ${forensic} --db kasus.duckdb sankey   --min 1000000 --out sankey.json
${python} ${forensic} --db kasus.duckdb workbook --out kasus.xlsx
${python} ${forensic} --db kasus.duckdb docgen --kind lhp --out draf-lhp.docx
${python} ${forensic} --db kasus.duckdb docgen --kind bap --out draf-bap.docx
${python} ${forensic} --db kasus.duckdb exhibit --out daftar-lampiran.docx
\`\`\`

- \`workbook\` → 4 sheet (Ringkasan / Rekap Aliran / Transaksi / Siklus) siap lampir BAP/LHP.
- \`docgen --kind bap|lhp\` → draf DOCX dari statistik kasus; isi identitas, dasar, simpulan, dan usul lewat \`--set key=value\` atau JSON \`--context\`. Teks \`[ISI]\` wajib diverifikasi penyidik.
- \`exhibit\` → daftar lampiran awal (data transaksi, workbook, siklus, Sankey) + item tambahan via \`--item\`.
- \`sankey\` mengeluarkan job \`hyper viz\` — render: \`hyper viz sankey.json\`
  (hasil \`aliran-dana.svg\` di folder yang sama; loop/siklus dipisah di laporan siklus).

## Baca & agregasi transaksi

- Sumber: Excel/CSV via \`pandas\`; langsung ke DuckDB untuk agregasi skala besar tanpa memuat
  seluruhnya ke memori:

\`\`\`
import duckdb, pandas as pd
df = pd.read_excel("transaksi.xlsx")
duckdb.sql("CREATE TABLE txn AS SELECT * FROM df")
ringkas = duckdb.sql("""
  SELECT pengirim, penerima, count(*) AS jumlah, sum(nominal) AS total
  FROM txn GROUP BY 1,2 ORDER BY total DESC
""").df()
\`\`\`

## Deteksi siklus & jaringan (networkx)

- Bangun graf berarah berbobot (\`nx.from_pandas_edgelist\`, \`DiGraph\`, bobot = total nominal).
- Cari siklus transaksi berulang: \`nx.cycle_basis\` (tak berarah) atau \`nx.simple_cycles\` (berarah,
  hati-hati biaya komputasi — batasi ke subgraf/top-N).
- Metrik: \`nx.pagerank\` (simpul pengumpul dana), degree sentralitas, komunitas terdeteksi.

## Grafik statis (plotly)

- Sankey: \`go.Sankey(node=dict(label=…), link=dict(source=…, target=…, value=…))\`;
  simpan \`fig.write_image("sankey.png", scale=2)\` (butuh \`kaleido\`).
- Sankey/Treemap besar → render via aplikasi: tulis job \`{"charts":[{id,format,spec}]} lalu
  \`hyper viz <job.json>\` (Chromium lokal, hasil SVG + PNG di folder job).
- \`kaleido\` gagal (font/OS) → jatuhkan ke matplotlib \`Agg\` atau \`hyper viz\`.

## Workbook multi-sheet (openpyxl)

- Satu workbook: sheet \`Ringkasan\`, \`Transaksi\`, \`Siklus\`, \`Sumber\`. Tulis dengan \`openpyxl\`;
  sisipkan Sankey/heatmap sebagai gambar (\`ws.add_image\`) bila perlu.
- Selalu simpan ke berkas BARU; jangan menimpa file milik user.
- Angka di chart harus = angka di sheet (sumber sama) agar lulus pemeriksaan visual.

## Laporan

- Sisipkan PNG Sankey/heatmap ke DOCX/LHP via \`python-docx\` (\`hyper-report\`).
`,
  },
  {
    id: "hyper-case",
    description:
      "Menangani kasus berulang: parameter sheet per jenis kasus, validasi kelengkapan field, dan render dokumen resmi (BAP/LHP/lampiran) dari satu sumber data. Gunakan saat mengerjakan pemeriksaan yang polanya sudah pernah ada.",
    body: (python, _forensic, caseCli) => `---
name: hyper-case
description: Menangani kasus berulang Hyper AI - parameter sheet per jenis kasus, validasi field wajib, dan render dokumen resmi (BAP/LHP/lampiran) dari satu sumber data. Gunakan saat mengerjakan pemeriksaan yang polanya sudah pernah ada.
---

# Kasus Berulang (Hyper AI)

\`${"HYPER_AI_MANAGED"}\`

## Struktur jenis kasus

Setiap jenis kasus adalah satu folder di \`~/Hyper-Knowledge/cases/<jenis-kasus>/\`:

- \`playbook.md\` - urutan langkah, kriteria, dan checklist
- \`parameter.schema.json\` - field yang dibutuhkan (JSON Schema) + peta ke placeholder docx
- \`template/*.docx\` - dokumen keluaran
- \`contoh/\` - satu contoh kasus terisi

## Perintah

\`\`\`
${python} ${caseCli} list
${python} ${caseCli} playbook <jenis>
${python} ${caseCli} new <jenis> [--out parameter.json]
${python} ${caseCli} validate <jenis> [--data parameter.json]
${python} ${caseCli} render <jenis> --data parameter.json --out dokumen/
${python} ${caseCli} checklist <jenis> --data parameter.json
${python} ${caseCli} mode on|off|status
${python} ${caseCli} redact <jenis> --data parameter.json --out folder/
${python} ${caseCli} screen --data teks.txt [--tokens tokens.json]
${python} ${caseCli} restore --data parameter.redacted.json --tokens tokens.json --out pulih.json
\`\`\`

## Data sensitif (wajib untuk kasus nyata)

Model agent berjalan di penyedia remote. Karena itu identitas tidak boleh masuk ke
percakapan, sekalipun mode kasus aktif.

1. \`mode on\` - mematikan plugin memori otomatis, membuat Hindsight tidak memakai
   router remote, dan menolak alat yang menghubungi pihak luar (\`webfetch\`,
   \`websearch\`, Context7, pencarian web). \`mode off\` mencabut persis itu.
2. \`redact\` - menghasilkan \`parameter.redacted.json\` (token \`[[NAMA-1]]\` dan
   sejenisnya) plus \`tokens.json\` bermode 0600.
3. Kerjakan analisis dan penulisan memakai **sheet redaksi**. Jangan pernah
   mengirim isi \`tokens.json\` ke mana pun, jangan menempelkannya ke jawaban.
4. \`restore\` dijalankan **lokal** saat merender dokumen, supaya dokumen berisi
   nilai asli.
5. \`screen\` sebelum mengirim teks yang memuat data kasus. Lolos pola bukan
   jaminan aman: nilai dan narasi tetap bisa sensitif.

Mode kasus **tidak** membuat model remote aman dan **tidak** menutup \`shell\`
(di sana perintah jaringan bisa keluar). Kalau sebuah tugas memerlukan data
asli di luar render lokal, hentikan dan minta keputusan manusia.

## Alur kerja wajib

1. **Baca playbook** lebih dulu: \`playbook <jenis>\`. Ikuti urutan langkahnya.
2. **Isi parameter sheet** dari data yang ada. Jangan mengarang angka, nama, atau nomor
   peraturan. Field wajib yang tidak ada dibiarkan kosong; render ditolak sampai lengkap.
3. **Validasi** sebelum merender: \`validate\`. Field wajib yang kosong memblokir render.
4. **Render**: \`render\`. Angka pada dokumen, lampiran, dan tabel berasal dari satu sumber.
5. **Periksa \`[ISI]\`** dan nilai sumber pada dokumen sebelum ditandatangani.
   Field statistik yang belum tersedia ditandai \`[ISI]\`.
6. **Checklist** untuk melihat langkah yang belum terpenuhi.

## Aturan

- Nomor pasal wajib berasal dari berkas regulasi atau bank memori. Tanpa sumber, biarkan \`[ISI]\`.
- Angka harus berasal dari analisis lokal (DuckDB / \`forensic.py\`), bukan diketik ulang.
- Simpan parameter sheet di folder project kasus, bukan di \`general\`.
`,
  },
]

/** Writes the office skills next to the other Hyper AI skills; reports which were written/skipped/kept. */
export async function applyOfficeSkills(configDir: string, dataDir: string) {
  if (!(await officeInstalled(dataDir))) return ["skipped"] as const
  const python = officePython(dataDir)
  const forensic = forensicModule(dataDir)
  const caseCli = caseModule(dataDir)
  const deck = deckModule(dataDir)
  const results: string[] = []
  for (const spec of skills) {
    const dir = path.join(configDir, "skill", spec.id)
    const file = path.join(dir, "SKILL.md")
    const existing = await readFile(file, "utf8").catch(() => undefined)
    if (existing && !existing.includes(MANAGED)) {
      results.push("kept")
      continue
    }
    await mkdir(dir, { recursive: true })
    await writeFile(file, spec.body(python, forensic, caseCli).split(FORENSIC_PLACEHOLDER).join(forensic).split("__DECK_PY__").join(deck))
    results.push("written")
  }
  return results
}
