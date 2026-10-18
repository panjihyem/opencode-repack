import { mkdir, readFile, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import { officeInstalled, officePython } from "./office"

// Office-work skills for the agent: Excel (including formulas), reports
// (DOCX/PPTX/PDF), charts and tax-investigation documents. Written only while
// the office toolkit is installed; a user-authored skill is never replaced.

const MANAGED = "HYPER_AI_MANAGED"

type SkillSpec = {
  id: string
  description: string
  body: (python: string) => string
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
]

/** Writes the office skills next to the other Hyper AI skills; reports which were written/skipped/kept. */
export async function applyOfficeSkills(configDir: string, dataDir: string) {
  if (!(await officeInstalled(dataDir))) return ["skipped"] as const
  const python = officePython(dataDir)
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
    await writeFile(file, spec.body(python))
    results.push("written")
  }
  return results
}
