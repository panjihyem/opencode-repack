# Panduan Pengguna Hyper AI

## Manual end-to-end untuk project, session, prompting, knowledge dan kasus

**Edisi 1.0 · 25 Oktober 2026**
Untuk pengguna Hyper AI desktop dan CLI `hyper`.

---

## Tentang panduan ini

Manual ini membimbing satu siklus kerja lengkap: menyiapkan project, mengelola sesi, memberi instruksi yang terarah, memakai file dan knowledge, mengolah dokumen/Excel, membuat template kasus berulang, mengatur kolaborasi agen, memeriksa hasil, dan menutup pekerjaan dengan aman.

### Mulai cepat: satu pekerjaan dari awal sampai selesai

Contoh: buat ringkasan dokumen dan laporan dari satu PDF **yang boleh diproses dengan model terpilih**.

1. Buka Hyper AI. Periksa model aktif dan kebijakan data; untuk dokumen sensitif, pastikan jalur model/tool yang dipakai memang disetujui. Jangan masukkan data asli untuk latihan.
2. Buat folder `C:\Kerja\Telaah-Contoh` dan subfolder `01-Sumber-Asli`, `02-Ekstraksi`, `03-Analisis`, `04-Draf`, `05-Review-dan-final`. Salin dokumen sumber ke `01-Sumber-Asli`; jangan edit sumber.
3. Buka folder itu sebagai project di aplikasi. Buat sesi baru khusus tujuan tersebut; tulis tujuan, keluaran, batas, dan sumber file pada prompt pertama.
4. Bila PDF perlu OCR, jalankan perintah Docling pada §7 dengan path folder ini. Periksa halaman pertama, tengah dan akhir Markdown hasil ekstraksi terhadap PDF sumber.
5. Kirim prompt ini: `Baca 02-Ekstraksi/dokumen.md. Buat tabel fakta dengan halaman sumber, angka, dan pertanyaan terbuka. Jangan menambah fakta di luar dokumen; jangan membuat file final dahulu.`
6. Setelah memeriksa tabel, minta: `Buat draf ringkasan di 04-Draf/ringkasan.md dari fakta yang sudah diverifikasi. Tandai [PERLU VERIFIKASI] untuk bagian tanpa bukti.`
7. Periksa sumber, angka dan redaksi; pindahkan versi disetujui ke `05-Review-dan-final` serta catat reviewer, tanggal dan file sumber. Mulai sesi baru hanya bila tujuan berubah; simpan handoff §3.2.

**Hasil yang diharapkan:** sumber asli utuh, ekstraksi terpisah, draf dengan rujukan, keputusan review tercatat. Jika perlu bank memori project, simpan referensi **yang diizinkan di-ingest** ke `%USERPROFILE%\Hyper-Knowledge\projects\<nama-project>`, buka aplikasi dan jalankan `hyper sync`; langkah ini tidak wajib untuk tutorial dasar.

Fitur tertentu memerlukan komponen opsional seperti Docling, Paket Office, Hindsight, atau model lokal. Nama menu/opsi dapat berbeda menurut versi dan konfigurasi. Jika menu tidak tampak, cek komponen terpasang dan panduan skill terkait.

> **Penting:** Hyper AI dapat memakai model cloud. Prompt, lampiran, kutipan dokumen yang dibaca tool, dan keluaran tool yang diteruskan ke model dapat dikirim ke router/provider. Pemrosesan file lokal tidak otomatis menjadikan analisis model lokal.

## Daftar isi

1. Peta kerja Hyper AI
2. Persiapan pertama kali
3. Mengelola project dan sesi
4. Metode prompting yang menghasilkan kerja terarah
5. Menggunakan file dan sumber pengetahuan
6. Mengelola Knowledge Tree dan memperbarui knowledge
7. Ekstraksi dokumen dengan Docling
8. Excel: membaca, memeriksa formula, menganalisis dan membuat workbook
9. Membuat dokumen, laporan, slide dan chart
10. Template kasus berulang
11. Hyper Case Secure untuk data sensitif
12. Orkestrasi agen dan subagent
13. Verifikasi keluaran dan menutup pekerjaan
14. Keamanan, privasi dan pemecahan masalah
15. Checklist operasional
16. Lampiran prompt dan perintah

---

## 1. Peta kerja Hyper AI

Hyper AI menyatukan beberapa lapisan kerja:

| Lapisan | Peran |
|---|---|
| Project dan sesi | Mengatur konteks, file, riwayat, tujuan dan pekerjaan yang sedang berlangsung. |
| Agen dan model | Memahami instruksi, menyusun rencana, menggunakan tool, dan menghasilkan draf. |
| Integrasi/tool | Membaca dokumentasi, mencari informasi, bekerja dengan file dan mengakses layanan yang dikonfigurasi. |
| Knowledge Tree | Menampung referensi umum, regulasi, putusan, template dan bahan project. |
| Memory layer | Menyimpan fakta/observasi lintas sesi serta mengambilnya kembali sebagai konteks. |
| Modul lokal | Mengekstrak dokumen, memeriksa Excel, membuat dokumen/chart, memproses transaksi dan meredaksi kasus. |

Pola yang sehat: **tentukan tujuan → berikan sumber dan batas → minta rencana bila tugas besar → jalankan analisis bertahap → validasi → setujui hasil**.

---

## 2. Persiapan pertama kali

### 2.1 Setup dan persetujuan

1. Baca pengantar, Ketentuan Penggunaan, Kebijakan Privasi dan lisensi pihak ketiga.
2. Setujui dokumen sebelum setup melanjutkan.
3. Pilih komponen hanya sesuai kebutuhan kerja:
   - **Context7**: dokumentasi library untuk agen; termasuk di paket.
   - **Hindsight memory**: memori lintas sesi; layanan penyimpanan berjalan lokal.
   - **Ekstraksi Dokumen / Docling**: PDF, scan dan gambar ke Markdown terstruktur.
   - **Paket Office**: Excel, Word, PowerPoint, PDF, chart dan toolkit analisis.
   - **LM Studio + model lokal**: alternatif inferensi lokal untuk konfigurasi yang mendukung.
4. Periksa ruang disk, RAM, hak instalasi, akses jaringan dan kebijakan organisasi.
5. Mode praktis tanpa konfirmasi tidak wajib; untuk tugas sensitif, biarkan mati.

### 2.2 Memahami pilihan model

- **Model cloud**: biasanya kemampuan utama. Prompt/konteks yang dikirim dapat diproses provider.
- **Router/failover**: dapat mengarahkan permintaan ke model cadangan; semua tujuan harus memenuhi kebijakan data Anda.
- **Model lokal**: dapat membantu tugas tertentu tanpa mengirim prompt ke model cloud, tetapi kemampuan, RAM, kecepatan dan fitur integrasinya berbeda.
- **Memori Hindsight**: lokasi penyimpanan lokal tidak berarti ekstraksi/konsolidasi fakta selalu lokal. Konfigurasi dapat memakai model remote.

Untuk data sangat sensitif, jangan mengandalkan tebakan status. Verifikasi model aktif, route, tool, memory dan izin sebelum memasukkan data.

---

## 3. Mengelola project dan sesi

### 3.1 Project sebagai batas konteks kerja

Gunakan satu project untuk satu tujuan kerja yang berkesinambungan, misalnya:

- `Telaah-Regulasi-2026`
- `Analisis-Transaksi-Kasus-A`
- `Penyusunan-Laporan-Internal`

Simpan sumber project di folder project, bukan di Knowledge Tree `general`, kecuali sumber memang layak dibagikan lintas pekerjaan. Pisahkan project yang memiliki kewenangan akses atau tingkat kerahasiaan berbeda.

Sediakan struktur sederhana:

```text
Project/
  00-Petunjuk-dan-scope.md
  01-Sumber-Asli/       # read-only bila memungkinkan
  02-Ekstraksi/
  03-Analisis/
  04-Draf/
  05-Review-dan-final/
  06-Log-keputusan/
```

Jangan masukkan token map, kredensial, dump database, atau data yang tidak diperlukan ke folder yang dapat di-ingest atau dibaca oleh banyak tool.

### 3.2 Session: kapan lanjut, kapan mulai baru

**Lanjutkan sesi yang sama** jika tujuan, dataset, definisi dan keputusan masih sama. Ini mempertahankan konteks percakapan, tetapi konteks panjang dapat menjadi bising.

**Mulai sesi baru** jika:

- tujuan berubah secara material;
- beralih dari project/klien/kasus satu ke yang lain;
- perlu menguji ulang analisis dari konteks bersih;
- sesi lama memuat asumsi yang tidak lagi berlaku;
- mulai tahap finalisasi dan ingin membatasi konteks pada sumber terverifikasi.

Saat pindah sesi, tulis handoff ringkas di file project:

```text
Tujuan:
Status saat ini:
Sumber yang telah diperiksa (nama file/halaman/sheet):
Keputusan yang disetujui:
Asumsi yang belum dibuktikan:
Pertanyaan terbuka:
Langkah berikutnya:
File output dan versinya:
```

Memory membantu mengingat, tetapi bukan ledger resmi. Keputusan material tetap dicatat di project dengan sumber dan tanggal.

---

## 4. Metode prompting yang menghasilkan kerja terarah

Prompt yang baik menyatakan **hasil, konteks, bahan, batas, metode, format, dan pemeriksaan**.

### 4.1 Kerangka prompt

```text
TUJUAN
Apa keputusan/hasil yang ingin dicapai?

KONTEKS
Project, periode, audiens, definisi istilah.

SUMBER
File, sheet, halaman, URL atau folder yang boleh digunakan.
Urutkan sumber utama dan sumber sekunder.

BATAS
Apa yang tidak boleh dilakukan? (mis. jangan kirim data ke cloud,
jangan menimpa file sumber, jangan menambah fakta yang tidak ada)

METODE
Langkah pemeriksaan, perhitungan, perbandingan atau analisis.

KELUARAN
Format, struktur, bahasa, panjang, tabel/chart/lampiran.

VALIDASI
Minta kutipan sumber, rumus, total kontrol, daftar asumsi,
ketidakpastian, dan pemeriksaan yang harus lulus.
```

### 4.2 Contoh prompt untuk analisis

```text
Tujuan: bandingkan tiga versi workbook penjualan dan jelaskan perubahan total.
Sumber: gunakan hanya file versi A, B, C; sheet “Transaksi”; periode Jan–Mar.
Jangan ubah file asli. Pertahankan formula. Tunjukkan baris yang ditambah,
dihapus, berubah, nilai kosong dan duplikat kunci.
Keluaran: tabel ringkasan, daftar pengecualian, metode dan file workbook
hasil baru. Cocokkan total per bulan terhadap jumlah baris sumber.
Jangan simpulkan penyebab perubahan jika tidak didukung sumber.
```

### 4.3 Contoh prompt untuk menulis dokumen

```text
Buat draf memo untuk pembaca pimpinan. Gunakan hanya sumber terlampir.
Pisahkan fakta, analisis dan rekomendasi. Setiap fakta material beri rujukan
nama berkas + halaman. Jika sumber tidak cukup, tulis [PERLU VERIFIKASI],
jangan mengarang. Tampilkan ringkasan eksekutif, latar, temuan, risiko,
opsi, rekomendasi, sumber dan pertanyaan terbuka. Simpan sebagai file baru.
```

### 4.4 Pola bertahap untuk pekerjaan besar

1. **Rencana**: minta daftar tahap, file yang dibutuhkan, risiko dan output.
2. **Persetujuan**: konfirmasi batas sumber, klasifikasi dan format.
3. **Ekstraksi**: proses file; simpan hasil beserta halaman/sheet asal.
4. **Analisis**: hitung atau bandingkan; jangan campur fakta dengan dugaan.
5. **Draf**: hasilkan dokumen terstruktur.
6. **Review adversarial**: minta pemeriksa mencari kesalahan, data hilang dan klaim tanpa bukti.
7. **Finalisasi**: manusia menyetujui, versi final dan catatan keputusan.

### 4.5 Instruksi yang membuat hasil lebih baik

- Sebutkan unit, periode, mata uang, metode pembulatan dan definisi populasi.
- Tunjuk halaman/sheet/range, bukan “lihat file” saja.
- Minta “tunjukkan sumber/rumus” alih-alih hanya “beri jawaban”.
- Minta tabel “fakta / sumber / inferensi / ketidakpastian”.
- Batasi panjang hasil awal; minta lampiran terpisah untuk detail.
- Untuk narasi sensitif, gunakan data sintetis atau Hyper Case Secure terlebih dahulu.

---

## 5. Menggunakan file dan sumber pengetahuan

### 5.1 File dalam project

1. Simpan file ke folder project yang aksesnya sesuai.
2. Beri nama yang menyatakan versi/tanggal; pertahankan sumber asli read-only.
3. Minta Hyper AI menyebut file, halaman, sheet atau range yang digunakan.
4. Untuk output, sebut path baru; jangan menimpa file sumber.
5. Periksa file hasil secara langsung. Ringkasan chat bukan bukti file tersimpan benar.

### 5.2 Membaca dokumen panjang

- Ekstrak dahulu PDF/scan menggunakan Docling: hasil Markdown disimpan ke folder ekstraksi.
- Untuk banyak dokumen, ekstrak per berkas, catat halaman dan buat indeks sumber.
- Minta tabel sumber dengan kolom file, halaman, topik, kutipan, interpretasi dan status verifikasi.
- OCR dapat keliru. Verifikasi angka, tanda minus, nomor pasal, tanggal, catatan kaki dan tabel pada citra asli.
- Jangan mengirim seluruh dokumen sensitif ke model hanya demi ringkasan; ekstrak/minimalkan bagian yang perlu dan pilih route sesuai kebijakan.

---

## 6. Mengelola Knowledge Tree dan memperbarui knowledge

### 6.1 Klasifikasi folder

```text
%USERPROFILE%\Hyper-Knowledge\
  general\
    regulasi\
    putusan\
    template\
    umum\
  projects\
    <nama-project>\
  ingest\
```

- `general`: sumber umum yang boleh dipakai lintas project.
- `projects/<nama>`: sumber, catatan dan hasil yang hanya relevan untuk project itu.
- `ingest`: area kerja/penerimaan sebelum materi ditata; `hyper sync` memindai `general` dan `projects`, bukan folder ini.

### 6.2 Memasukkan sumber baru

1. Verifikasi asal, otoritas, versi, tanggal berlaku, status dan kelengkapan berkas.
2. Simpan ke subfolder yang tepat. Jangan taruh data pribadi kasus pada `general`.
3. Untuk aturan/putusan, tambahkan metadata/front matter bila dikelola library template:

```yaml
---
judul: "Judul dokumen resmi"
jenis: PMK
nomor: "NN"
tahun: 2026
status: berlaku
tag: [topik-a, topik-b]
sumber: https://sumber-resmi.example/
---
```

4. Bila memakai CLI template knowledge, jalankan `hyper-tpl kb add <berkas> --judul "..." --jenis PMK --nomor NN --tahun 2026 --tag topik-a,topik-b`.
5. Jalankan `hyper-tpl kb check` untuk metadata/duplikasi dan `hyper-tpl kb index` untuk memperbarui `general\INDEX.md`.
6. Jalankan `hyper sync` saat service memori Hyper AI tersedia. Periksa jumlah berhasil/gagal.
7. Uji `hyper recall` dengan kueri yang diketahui jawabannya. Buka sumber asli untuk memastikan versi dan kutipan.

### 6.3 Feed regulasi

`hyper fetch --source kemenkeu` mengambil feed resmi JDIH Kementerian Keuangan dan membuat katalog tautan. `djp` merupakan alias feed, bukan feed DJP terpisah. Katalog bukan naskah hukum; buka tautan resmi, simpan naskah yang relevan dan verifikasi metadata sebelum dipakai.

### 6.4 Memory hygiene

- Ingat: recall bisa salah konteks, tidak lengkap, atau usang.
- Catat keputusan/temuan substantif dalam file project dan cantumkan reviewer; jangan mengandalkan memory sebagai satu-satunya arsip.
- Jangan ingest file sementara, duplikat, token map, credential, atau data yang tidak boleh menjadi konteks lintas sesi.
- Lakukan prosedur koreksi/penghapusan sesuai kebijakan retensi organisasi; lokasi memory server lokal tidak membuktikan pemrosesan model sepenuhnya lokal.

---

## 7. Ekstraksi dokumen dengan Docling

Contoh perintah:

```powershell
& "$env:APPDATA\ai.hyperai.desktop\hyper-bundle\docling\venv\Scripts\docling.exe" `
  convert --output "C:\Kerja\Project\02-Ekstraksi" --to md `
  "C:\Kerja\Project\01-Sumber-Asli\dokumen.pdf"
```

Untuk banyak file, gunakan wildcard atau proses batch sesuai kemampuan Docling versi terpasang. Simpan satu Markdown per sumber.

Checklist ekstraksi:

- Bandingkan halaman pertama/tengah/akhir dengan sumber asli.
- Periksa struktur tabel, header, footnote, angka desimal dan tanda negatif.
- Catat halaman sumber pada kutipan penting.
- Jika OCR buruk, gunakan citra resolusi lebih tinggi atau koreksi manual yang dicatat.
- Jangan menganggap teks yang berhasil diekstrak otomatis benar.

---

## 8. Excel: formula, analisis dan workbook baru

### 8.1 Audit awal workbook

Sebelum analisis, catat nama sheet, ukuran, header, tipe data, formula, hidden row/column, merged cells, named ranges, external links, tabel dan filter. Simpan file sumber tetap utuh.

### 8.2 Membaca formula dan cached value

```python
from openpyxl import load_workbook

path = "sumber.xlsx"
formula_wb = load_workbook(path, data_only=False, read_only=True)
cache_wb = load_workbook(path, data_only=True, read_only=True)

for ws in formula_wb.worksheets:
    cache = cache_wb[ws.title]
    for row in ws.iter_rows():
        for cell in row:
            if isinstance(cell.value, str) and cell.value.startswith("="):
                print(ws.title, cell.coordinate, cell.value,
                      "cached=", cache[cell.coordinate].value)
```

`data_only=False` menunjukkan formula; `data_only=True` menunjukkan nilai cache tersimpan, yang mungkin belum diperbarui. Formula yang berubah perlu dikalkulasi ulang pada Excel/engine yang disetujui sebelum final.

### 8.3 Formula umum

| Kebutuhan | Contoh | Hal yang diverifikasi |
|---|---|---|
| Total | `=SUM(E2:E500)` | Rentang, baris total, data tersembunyi. |
| Total bersyarat | `=SUMIFS(E:E,B:B,B2)` | Kriteria, duplikat, tipe data kolom. |
| Jumlah bersyarat | `=COUNTIFS(A:A,A2,C:C,"OK")` | Definisi status dan baris kosong. |
| Logika | `=IF(OR(A2="",B2=""),"PERIKSA","OK")` | Field wajib dan string berisi spasi. |
| Lookup | `=XLOOKUP(A2,Ref!A:A,Ref!C:C,"TIDAK DITEMUKAN")` | Kunci unik dan referensi yang tidak cocok. |
| Rasio terlindung | `=IFERROR(E2/F2,0)` | Jangan sembunyikan denominator nol; beri status pemeriksaan. |
| Pembulatan | `=ROUND(E2,0)` | Kebijakan pembulatan dan presisi sumber. |

### 8.4 Memeriksa formula

1. Cari sel error (`#REF!`, `#VALUE!`, `#N/A`, `#DIV/0!`).
2. Bandingkan pola formula antarbaris; temukan sel formula yang tertimpa nilai.
3. Telusuri dependensi dan referensi lintas-sheet; konfirmasi sheet/range masih tepat.
4. Uji beberapa baris awal, tengah dan akhir serta kasus batas.
5. Rekonsiliasi total workbook dengan query independen atau hitung kontrol.
6. Tulis formula bahasa Inggris dalam file; aplikasi spreadsheet menerjemahkan tampilannya sesuai locale.

### 8.5 Membuat workbook analitis

Pola sheet yang disarankan:

1. `README` — tujuan, periode, unit, sumber, versi dan batasan.
2. `Sumber` — manifest file/halaman/sheet dan tanggal.
3. `Data_Bersih` — hasil normalisasi dengan kolom asal tetap terlacak.
4. `Analisis` — formula/query, asumsi dan perhitungan.
5. `Pemeriksaan` — totals, unmatched, duplicate, missing dan error.
6. `Ringkasan` — angka utama dan chart yang memakai sumber sama.

Simpan output ke file baru. `openpyxl` menulis formula tetapi tidak selalu menghitung hasil; set kalkulasi saat buka dan verifikasi di spreadsheet engine yang sesuai. Pustaka `formulas` dapat mengevaluasi subset/graf formula, namun kompatibilitas semua fungsi Excel tidak dijamin.

---

## 9. Pembuatan dokumen dan chart

### 9.1 Dokumen Word

Alur: buat outline → sepakati pembaca dan tujuan → petakan sumber ke bagian → isi fakta → buat tabel → tambahkan daftar sumber → QA format. Gunakan `python-docx` untuk struktur dan `docxtpl` untuk template berulang.

Template BAP/LHP atau memo sebaiknya memisahkan:

- identitas/metadata;
- dasar dan ruang lingkup;
- metode dan sumber;
- fakta/temuan dengan bukti;
- analisis dan asumsi;
- simpulan dan usul;
- lampiran, checklist, reviewer, tanggal dan versi.

Isi yang belum diketahui ditandai `[ISI]`/`[PERLU VERIFIKASI]`, bukan dikarang.

### 9.2 PowerPoint

- Satu pesan utama per slide; detail dipindah ke notes/lampiran.
- Judul slide berisi kesimpulan, bukan hanya nama topik.
- Angka utama menonjol; unit, periode, sumber dan definisi tetap tersedia.
- Untuk presentasi eksekutif, sertakan keputusan yang diminta, risiko, opsi dan langkah lanjut.

### 9.3 PDF

- ReportLab untuk dokumen data-driven yang mengalir, tabel, header/footer dan grafik.
- pypdf untuk gabung/pisah/isi form AcroForm yang kompatibel.
- QA jumlah halaman, font, clipping, metadata, urutan baca, link, tabel terpotong dan ekstraksi teks.

### 9.4 Chart

Contoh kode chart garis lokal:

```python
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

bulan = ["Jan", "Feb", "Mar", "Apr"]
jumlah = [12, 18, 16, 24]  # data contoh, ganti dengan data tervalidasi
fig, ax = plt.subplots(figsize=(8, 4))
ax.plot(bulan, jumlah, marker="o", color="#2463A6", linewidth=2)
ax.set(title="Jumlah per bulan", ylabel="Jumlah (unit)")
ax.grid(axis="y", alpha=.25)
fig.savefig("tren.png", dpi=200, bbox_inches="tight")
```

**Pilihan chart:** garis untuk tren; batang untuk perbandingan; pie/donut hanya komposisi dengan sedikit kategori; scatter untuk relasi; histogram untuk distribusi; Sankey untuk aliran; graph untuk hubungan. Hindari 3D, skala menyesatkan dan label tanpa unit.

### 9.5 Infografis dan contoh chart

Visual dalam manual ini memakai angka sintetis untuk mendemonstrasikan desain, bukan data operasional, benchmark, statistik kinerja, atau telemetri produk. Pada analisis nyata, cantumkan sumber, tanggal, cakupan, unit, filter, transformasi dan batasan.

---

## 10. Skills dan modul kerja

| Skill | Penerapan |
|---|---|
| `hyper-doc` | Ekstraksi PDF/scan/gambar ke Markdown dan panduan OCR. |
| `hyper-excel` | Formula, audit workbook, analisis dan workbook baru. |
| `hyper-report` | DOCX, PPTX, PDF, form dan laporan resmi. |
| `hyper-chart` | Chart statistik untuk laporan. |
| `hyper-fundflow` | DuckDB, siklus dana, graph/Sankey dan workbook lampiran. |
| `hyper-tax-id` | Alur kerja dan draf dokumen penyidikan pajak, dengan verifikasi sumber hukum. |
| `hyper-case` | Schema kasus, validasi field, redaksi, screen dan render. |
| `hyper-knowledge` | Knowledge Tree, sumber, ingest dan recall. |
| `hyper-template` | Capture/cek/template kasus dan knowledge metadata. |

Skill memberi prosedur, bukan otoritas. Ikuti sumber primer, batas data dan checklist dalam skill; skill yang dihasilkan/dikelola dapat berbeda antarinstalasi.

---

## 11. Templating kasus berulang

### 11.1 Struktur template

Satu template kasus umumnya terdiri dari:

- `parameter.schema.json`: struktur dan field wajib;
- `playbook.md`: langkah, kriteria dan checklist;
- `template/`: DOCX/XLSX/PPTX sumber yang sudah digeneralisasi;
- `template.json`: variabel, placeholder dan nilai turunan;
- `README.md`: panduan penerapan, prasyarat dan review.

### 11.2 Capture → check → new

1. Selesaikan satu contoh kerja dan kumpulkan sumber/dokumen yang boleh dijadikan template.
2. Ganti data kasus dengan placeholder menggunakan `hyper-tpl capture` dan pemetaan `vars.json`.
3. Jalankan `hyper-tpl show <slug>` untuk meninjau variabel dan `hyper-tpl check <folder-files>` untuk sisa identitas/placeholder.
4. Jalankan `hyper-tpl new <slug> <folder-kasus-baru> --data case.json`.
5. Baca checklist dan setiap hasil; kode gagal/placeholder tersisa berarti jangan gunakan sebagai final.
6. Verifikasi nilai lama hilang, nilai baru benar, formula/chart utuh, nomor turunan benar, dan output tersimpan sebagai file baru.

Alur perintah dasar:

```powershell
hyper-tpl capture "C:\Kerja\Kasus-Selesai" --name penyidikan-pajak `
  --title "Penyidikan Pajak" --vars vars.json
hyper-tpl show penyidikan-pajak
hyper-tpl check "C:\Users\User\Hyper-Templates\penyidikan-pajak\files"
hyper-tpl new penyidikan-pajak "C:\Kerja\Kasus-Baru" --data case.json
```

Sebelum `capture`, bersihkan material sumber yang tidak berwenang untuk template. Gunakan file kerja sementara yang telah dianonimkan, review setiap file hasil, dan hindari `--keep-examples` kecuali contoh tersanitasi memang diperlukan serta disetujui.

### 11.3 Variabel dan nomor turunan

Contoh `vars.json`:

```json
{
  "WP_NAMA": "PT Contoh",
  "NILAI_TEMUAN": "125000000",
  "NO_SP2RB": {
    "value": "SP2RB-001",
    "derive": { "from": "NO_SP2ID", "replace": ["SP2ID", "SP2RB"] }
  }
}
```

Nilai data pribadi tidak disimpan ke manifest template kecuali opsi contoh eksplisit memang dibutuhkan dan diotorisasi. PDF template disalin apa adanya, bukan ditransformasikan menjadi template; simpan sumber DOCX/XLSX/PPTX bila tersedia.

### 11.4 Knowledge library dan template

- Tambahkan front matter `judul`, `jenis`, `nomor`, `tahun`, `status`, `tag`, `sumber`.
- Jalankan `hyper-tpl kb check`, perbaiki duplikasi jenis+nomor+tahun, lalu `hyper-tpl kb index`.
- Jalankan `hyper sync` untuk memasukkan indeks/sumber ke memory bank.
- Pastikan template menautkan sumber dan basis hukum yang benar-benar tersedia; model tidak boleh mengisi dasar hukum dari tebakan.

---

## 12. Hyper Case Secure

Hyper Case Secure diakses dari tombol **Kasus Secure** pada titlebar desktop. Gunakan data sintetis saat latihan. Prosedur per kasus:

1. Pastikan jenis kasus dan schema sudah disahkan.
2. Pilih file parameter JSON dan folder hasil kosong yang terpisah.
3. Pilih jenis kasus yang tersedia, parameter JSON, dan folder hasil kosong; wizard memvalidasi schema/field wajib.
4. Tekan **Aktifkan & buat salinan redaksi**; main process menjalankan Python yang disertakan di instalasi, mode aktif, hasil discreen dan ditulis lewat folder staging ke salinan kerja.
5. Periksa identitas yang diganti, struktur JSON, nominal dan konteks. Jangan tampilkan/copy/kirim `tokens.json`.
6. Pilih **Lanjut ke analisa** hanya jika berwenang; UI membuka folder hasil dan tidak mengirim prompt/file otomatis.
7. Analisis salinan redaksi saja. Untuk dokumen final, jalankan `restore` lokal dengan token map dan akses terbatas.
8. Tekan **Akhiri mode kasus** lalu konfirmasi bila perlindungan tidak lagi diperlukan; file sumber/output/token tetap ada.

Contoh menyiapkan schema latihan (isi sintetis):

```json
{
  "title": "Kasus Uji",
  "required": ["kasus_id", "wp"],
  "properties": {
    "kasus_id": {"type": "string"},
    "wp": {"type": "object", "properties": {
      "nama": {"type": "string"},
      "npwp": {"type": "string"},
      "alamat": {"type": "string"}
    }}
  }
}
```

**Jangan** gunakan identitas sungguhan untuk latihan. Screen mengenali pola tertentu dan nilai yang diketahui dari sheet, bukan semua kemungkinan identitas.

Mode ini menolak integrasi web tertentu dan mematikan memori otomatis terkelola, tetapi **tidak** mematikan provider cloud, tidak mengisolasi shell dan tidak mengintersep semua prompt/lampiran.

---

## 13. Orkestrasi agen dan subagent

### 13.1 Cara delegasi

Subagent tepat untuk pekerjaan yang punya input, batas dan output mandiri, misalnya:

- satu agen inventaris sumber;
- satu agen audit formula/total;
- satu agen adversarial review;
- agen utama menyatukan hasil dan menyelesaikan konflik.

### 13.2 Prompt subagent yang baik

```text
Mandat: audit formula workbook sintetis.
File yang boleh dibuka: [file/range]. Jangan mengubah file apa pun.
Periksa: formula hilang, error, duplicate key, total per periode.
Keluaran: temuan dengan sheet!cell, nilai/formula, bukti, severity,
dan tes verifikasi. Jangan menyimpulkan penyebab di luar bukti.
```

### 13.3 Aturan koordinasi

- Tetapkan owner file agar dua agen tidak mengedit area yang sama.
- Beri path input/output dan format laporan yang jelas.
- Gunakan background task untuk pekerjaan panjang; jangan menduplikasi kerja yang masih berlangsung.
- Periksa temuan satu per satu pada sumber/tes; jangan menerima jawaban agen sebagai bukti final.
- Ambil konteks sensitif seminimal mungkin. Semua agen dapat memakai provider/tool yang membawa data keluar.

### 13.4 Playbook multi-agent end-to-end

**Contoh tugas:** menganalisis transaksi dan menghasilkan draf laporan beserta lampiran.

1. **Agen utama / koordinator** menerima tujuan, klasifikasi, file sumber, definisi kolom, periode, output, larangan dan reviewer. Ia menetapkan rencana serta siapa pemilik tiap output.
2. **Agen inventaris data** membuat data dictionary: kolom, tipe, missing, duplicate, periode, satuan, asumsi dan kualitas. Tidak mengubah sumber.
3. **Agen analitik** menghitung agregat, siklus dan pengecualian memakai dataset yang disetujui. Menyerahkan query, rumus, filter dan total kontrol.
4. **Agen visual/dokumen** membuat workbook/chart/draf dari tabel hasil yang sama; tidak membuat angka baru.
5. **Agen reviewer** mencari klaim tanpa sumber, angka tidak cocok, formula hilang, kesimpulan yang melampaui bukti dan risiko privasi. Review tidak mengedit output utama tanpa izin.
6. **Koordinator** menggabungkan laporan, menyelesaikan konflik dengan kembali ke sumber, mencatat keputusan dan menyerahkan daftar pemeriksaan kepada manusia.
7. **Pemilik pekerjaan** meninjau sumber/angka/draf, menerima atau menolak perubahan, menetapkan file final dan otorisasi distribusi.

Tabel handoff yang disarankan:

| Kolom | Isi |
|---|---|
| Agent/owner | Nama peran dan file yang boleh diubah. |
| Mandat | Satu hasil yang terukur. |
| Input | Path, versi, sheet/halaman, hash atau tanggal sumber. |
| Batas | Tool/jaringan yang boleh dipakai, file yang dilarang, data yang disamarkan. |
| Output | Path baru, format, schema dan naming. |
| Bukti | Rumus/query, line/sheet/cell, kutipan atau langkah reproduksi. |
| Status | Selesai, blocker, asumsi, pertanyaan dan reviewer. |

Jangan menjalankan beberapa agen pada file bersama tanpa locking/ownership. Untuk tindakan sensitif, lebih baik urutan terkontrol daripada paralelisme.

---

## 14. Verifikasi dan penutupan pekerjaan

Sebelum final:

1. **Fakta**: setiap klaim material mempunyai sumber dan halaman/sheet.
2. **Angka**: formula, unit, pembulatan, periode dan total silang cocok.
3. **File**: output dapat dibuka; sumber tidak berubah; tidak ada temporary/staging/token map yang terselip.
4. **Privasi**: tidak ada data lebih dari yang perlu; penerima dan provider disetujui.
5. **Dokumen**: placeholders, hidden rows, metadata, chart source, lampiran dan nomor diperiksa.
6. **Review**: minta pemeriksa mencari kontra-bukti, missing data dan output berbahaya.
7. **Persetujuan**: reviewer manusia menandatangani/menyetujui versi final.
8. **Arsip**: simpan versi final, sumber yang digunakan, metodologi, log keputusan dan masa retensi.

---

## 15. Keamanan, privasi dan pemecahan masalah

### 15.1 Batas data

Saat memakai model cloud, prompt, lampiran, kutipan isi dokumen yang diproses tool dan hasil tool yang masuk ke prompt dapat diteruskan ke router/provider. Log lokal dapat pula memuat kutipan atau prompt. Memory yang tersimpan lokal dapat mengekstrak fakta menggunakan model remote.

### 15.2 Checklist keamanan

- Apakah klasifikasi data membolehkan cloud/provider yang aktif?
- Apakah file sumber hanya berisi data minimum dan disimpan di folder terbatas?
- Apakah memory/knowledge ingest sesuai tujuan dan hak akses?
- Apakah `unattended` diperlukan? Jika tidak, matikan.
- Apakah output dan token map dipisah? Apakah backup/sinkronisasi melindunginya?
- Apakah shell, MCP, pencarian dan update boleh mengakses jaringan?
- Siapa reviewer, pemilik data, penerima dokumen dan pemegang token map?

### 15.3 Troubleshooting singkat

| Gejala | Pemeriksaan awal |
|---|---|
| Memory recall kosong | Pastikan Hindsight berjalan, bank tersedia, file masuk tree, lalu `hyper sync`; cek ingest error. |
| Regulasi tidak ditemukan | Periksa klasifikasi folder, front matter, `hyper-tpl kb index`, kemudian sync dan uji recall. |
| Docling gagal | Cek komponen terpasang, ruang disk, file rusak/enkripsi, cache OCR dan log lokal. |
| Formula tidak berubah | Formula writer bukan calculation engine; buka/recalculate di Excel yang disetujui lalu cocokkan cache. |
| Output dokumen tak sesuai template | Periksa schema, variabel/derive, placeholder tersisa, versi template dan layout. |
| Model lokal lambat/tidak muncul | Periksa model terunduh, RAM, service port dan opsi offline; jangan menganggap memori otomatis lokal. |
| Hasil subagent berbeda | Minta setiap agen memberi sumber dan bukti; pilih reviewer, bukan voting jawaban. |

---

## 16. Checklist harian

### Sebelum mulai

- [ ] Project/sesi dan data classification benar.
- [ ] Tujuan, output, sumber dan batas prompt eksplisit.
- [ ] Model, provider, MCP dan tool sesuai kebijakan.
- [ ] Sumber asli terpisah; belum ada data yang tak perlu di-ingest.

### Sebelum kirim/terbitkan

- [ ] Kutipan dan nomor halaman dicek ke sumber.
- [ ] Formula, totals, unit dan chart direkonsiliasi.
- [ ] PII/token map tidak ikut dalam lampiran.
- [ ] Placeholder, hidden content dan metadata ditinjau.
- [ ] Reviewer manusia menyetujui versi final.

### Saat menutup project

- [ ] Catat keputusan, pertanyaan terbuka dan versi output.
- [ ] Sinkronkan knowledge hanya yang berhak dipakai ulang.
- [ ] Bersihkan file sementara sesuai kebijakan retensi.
- [ ] Simpan handoff singkat jika pekerjaan berlanjut pada sesi berikut.

---

## Lampiran A — Template prompt copy/paste

```text
TUJUAN:
KONTEKS/PROJECT:
DATA CLASSIFICATION:
SUMBER YANG BOLEH DIPAKAI:
SUMBER YANG TIDAK BOLEH DIPAKAI:
METODE/PEMERIKSAAN:
BATAS TOOL/JARINGAN/MODEL:
OUTPUT DAN FORMAT:
ASUMSI YANG DIIZINKAN:
JIKA DATA KURANG:
VALIDASI YANG WAJIB LULUS:
REVIEWER/PENERIMA:
```

## Lampiran B — Perintah yang sering dipakai

```text
hyper sync
hyper recall "kueri" --bank general --limit 10
hyper banks
hyper fetch --source kemenkeu --limit 20
hyper viz C:\path\job.json

hyper-tpl list
hyper-tpl show <slug>
hyper-tpl check <folder-files>
hyper-tpl new <slug> <folder-kasus-baru> --data case.json
hyper-tpl kb check
hyper-tpl kb index
```

> Nama/opsi CLI harus dikonfirmasi terhadap versi terpasang dengan `--help`; gunakan path instalasi yang benar bila launcher tidak tersedia.

---

**Akhir panduan.** Hyper AI membantu menstrukturkan pekerjaan; tanggung jawab atas kewenangan data, validitas sumber, interpretasi profesional dan persetujuan final tetap pada pengguna/organisasi.
