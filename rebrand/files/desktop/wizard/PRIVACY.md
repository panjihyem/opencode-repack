# Kebijakan Privasi Hyper AI

Versi: 2026-10-24 Â· Berlaku untuk aplikasi Hyper AI dan paket setup-nya.

Kebijakan ini menjelaskan data apa yang diproses Hyper AI, di mana, dan untuk
apa. Hyper AI dikelola oleh **Bikinin AI**. Kontak: **info@talentabangsa.com**.

## 1. Peran Anda

Saat Anda memproses berkas kasus, data wajib pajak, atau data pribadi lain,
**Anda atau organisasi Anda adalah pengendali data**. Kami menyediakan alat dan,
untuk permintaan model, layanan router. Anda menentukan data apa yang dimasukkan
dan model mana yang dipakai.

## 2. Yang diproses secara lokal

- Ekstraksi dokumen/OCR (Docling), pembuatan Excel/Word/PowerPoint/PDF, dan grafik.
- Riwayat sesi, basis data sesi, log, berkas kasus, dan token map redaksi.
- Penyimpanan memori Hindsight pada layanan lokal `127.0.0.1:8888`.
- Berkas konfigurasi, kunci API yang disimpan di konfigurasi aplikasi, dan
  catatan persetujuan setup.

Data lokal tidak diunggah otomatis oleh Hyper AI. Data lokal dapat dibaca oleh
proses lain di komputer yang sama bila perlindungan sistem operasi tidak memadai.

## 3. Yang dikirim ke pihak luar

### a. Permintaan model AI

Saat Anda memakai model cloud, Hyper AI mengirim **prompt, lampiran yang Anda
sertakan, kutipan/isi berkas yang dibaca tool, dan keluaran tool** ke router
Hyper AI di `rai.talentabangsa.com` dan/atau penyedia model yang dikonfigurasi.
Data ini dapat diproses, disimpan, atau dicatat oleh router/penyedia sesuai
kebijakan mereka. Kami tidak dapat menjamin penghapusan oleh penyedia pihak
ketiga.

### b. Memori Hindsight

Isi memori disimpan lokal. Namun **ekstraksi dan konsolidasi fakta memakai model
remote** melalui router, sehingga potongan percakapan yang diproses memori dapat
dikirim ke model. Menyimpan memori secara lokal bukan berarti pemrosesannya
sepenuhnya offline.

### c. Pencarian web dan Context7

Bila diaktifkan, kueri dan sebagian konteks dapat dikirim ke layanan pencarian
atau penyedia dokumentasi. Mode kasus menonaktifkan integrasi ini.

### d. Pembaruan dan konfigurasi

Pemeriksaan pembaruan aplikasi dan konfigurasi bertanda tangan mengambil metadata
dari GitHub. Alamat IP dan informasi teknis standar dapat terlihat oleh GitHub.
Hyper AI tidak menambahkan analitik atau iklan.

### e. Log dan laporan kerusakan

Log disimpan lokal dan dapat memuat prompt, keluaran tool, atau potongan berkas.
Hyper AI tidak mengunggah log secara otomatis. Jangan mengirim log ke pihak lain
tanpa meredaksi data sensitif.

## 4. Tujuan dan dasar pemrosesan

Data diproses untuk menjalankan fitur yang Anda minta (analisa, ekstraksi,
pembuatan dokumen, memori, pembaruan), menjaga keamanan, dan memenuhi kewajiban
hukum. Untuk data pribadi pihak ketiga dalam berkas Anda, dasar pemrosesan dan
kewajiban pemberitahuan merupakan tanggung jawab Anda sebagai pengendali data.

## 5. Penyimpanan dan retensi

- Data lokal tersimpan sampai Anda menghapusnya dari komputer/aplikasi.
- Retensi di router/penyedia model mengikuti kebijakan masing-masing penyedia.
- Log lokal dapat dihapus; menghapusnya dapat mengurangi kemampuan diagnosis.

## 6. Pembagian data

Kami tidak menjual data Anda. Data dapat diteruskan kepada penyedia model,
layanan pencarian/dokumentasi, GitHub (pembaruan), dan penegak hukum bila
diwajibkan hukum. Kami tidak mengendalikan kebijakan penyedia tersebut.

## 7. Keamanan

Hyper AI menyediakan redaksi lokal (`hyper-case redact/screen`), mode kasus, dan
pembatasan integrasi. Batasnya:

- Redaksi hanya berjalan pada data yang Anda masukkan ke alur itu; prompt atau
  lampiran mentah yang dikirim langsung ke model tetap dapat memuat data sensitif.
- Pemeriksaan pola dapat melewatkan nama, alamat, gambar, atau narasi.
- Mode kasus tidak mengisolasi `shell` dan tidak mencegat semua permintaan model.

Jangan mengandalkan aplikasi ini sebagai satu-satunya pengaman data sensitif.

## 8. Hak Anda

Anda dapat mengakses, memperbaiki, menghapus, atau menarik persetujuan atas data
yang tersimpan lokal dengan menghapus berkas/aplikasi. Untuk permintaan terkait
data yang diproses router, hubungi **info@talentabangsa.com**. Anda juga berhak
mengajukan keluhan kepada otoritas pelindungan data pribadi yang berwenang.

## 9. Anak

Hyper AI bukan layanan untuk anak di bawah 18 tahun dan tidak ditujukan untuk
memproses data anak tanpa kewenangan yang sah.

## 10. Perubahan

Kebijakan dapat diperbarui. Versi dan hash ditampilkan pada penyiapan; perubahan
material meminta persetujuan ulang. Versi lama dapat disediakan atas permintaan.

## 11. Kontak

**Bikinin AI** â€” info@talentabangsa.com â€” talentabangsa.com.
