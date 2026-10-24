# Hyper AI — mulai aman untuk data kasus

Panduan singkat ini ikut di dalam paket. Tidak ada layanan tambahan yang
berjalan karena panduan ini.

## Yang lokal dan yang tidak

| Bagian | Lokasi |
|---|---|
| OCR/ekstraksi dokumen (Docling), Excel/Word/PPT/PDF, grafik | **Lokal** di komputer |
| Sesi, riwayat, log, token map kasus | **Lokal** di komputer |
| Penyimpanan memori Hindsight | **Lokal** (`127.0.0.1:8888`) |
| Ekstraksi/konsolidasi fakta memori | **Model remote** lewat router |
| Analisa oleh agent | **Model remote** sesuai provider yang dipilih |
| Pencarian web/Context7 | **Remote** (dimatikan saat mode kasus) |

Artinya: menyimpan memori secara lokal **bukan** berarti isinya tidak pernah
diproses model remote. Prompt, lampiran, dan keluaran tool yang dikirim ke
model dapat keluar dari komputer ini.

## Alur kerja untuk kasus sensitif

1. Aktifkan mode kasus:
   ```
   <python> <cli.py> mode on
   ```
   Mode ini mematikan plugin memori otomatis dan menolak Context7, pencarian
   web, `webfetch`, serta `websearch`. Provider cloud dan tool analisa lokal
   tetap tersedia.
2. Buat sheet redaksi dari parameter kasus:
   ```
   <python> <cli.py> redact <jenis> --data parameter.json --out hasil/
   ```
   Hasil: `parameter.redacted.json` (untuk dianalisa) dan `tokens.json`
   (peta nilai asli, **jangan dikirim ke mana pun**).
3. Periksa teks yang akan dikirim:
   ```
   <python> <cli.py> screen --data teks.txt [--tokens hasil/tokens.json]
   ```
4. Analisa memakai sheet redaksi. Jangan menempelkan isi `tokens.json` ke chat.
5. Pulihkan nilai asli hanya saat merender dokumen di komputer:
   ```
   <python> <cli.py> restore --data parameter.redacted.json --tokens tokens.json --out pulih.json
   ```
6. Matikan mode kasus bila selesai:
   ```
   <python> <cli.py> mode off
   ```

## Batas yang harus dipahami

- `screen` hanya memeriksa pola dan nilai yang dikenal. Nama, alamat, foto,
  screenshot, lampiran PDF, dan narasi kontekstual bisa lolos. **Lolos pola
  bukan jaminan aman.**
- Mode kasus tidak mengisolasi `shell` dan tidak mencegat semua request model.
  Jangan memberi shell akses jaringan saat mengerjakan data asli.
- Berkas asli tetap lokal hanya jika tidak dilampirkan atau dikirim ke chat.
- Jangan mengirim `tokens.json`, API key, atau kredensial ke model/aplikasi lain.
- Cadangkan hasil kerja; kehilangan `tokens.json` membuat nilai asli pada sheet
  redaksi tidak bisa dipulihkan.

## Bantuan

Pertanyaan keamanan dan privasi: **info@talentabangsa.com**.
