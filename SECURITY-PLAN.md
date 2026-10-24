# Hyper AI â€” hardening ringan (draf)

Tujuan: tetap memakai model cloud untuk analisa, tetapi mengurangi kemungkinan
data kasus mentah terkirim. **Tidak ada layanan resident, model lokal wajib,
proxy, microVM, atau scanner di semua request.** Ini bukan jaminan anonimisasi
otomatis. Jika pengguna mengirim prompt/lampiran mentah, provider cloud tetap
menerimanya.

## Pakai yang sudah ada di paket

1. `hyper-case redact`: buat salinan sheet kasus berpseudonim dan token map
   lokal; sumber asli tetap. `hyper-case screen`: cek pola identitas sebelum
   konten dikirim. `hyper-case restore`: pulihkan hasil akhir di laptop.
2. `hyper-case mode on`: matikan memori otomatis dan batasi alat keluar
   non-model; provider cloud serta tool analisa lokal tetap bekerja. Benahi
   penerapannya memakai `policies`/`permissions` OpenCode V2 yang benar.
3. Tambah self-check setup offline: pastikan perintah, file, redaksi dan
   mode on/off bekerja pada contoh sintetis. Jika gagal, beri petunjuk,
   bukan diam-diam menyatakan aman.
4. Panduan singkat di paket: aktifkan mode, redaksi data kasus, periksa hasil,
   analisa menggunakan versi token, pulihkan hanya di laptop.

## Batas keamanan yang jujur

- `screen` berbasis pola dan nilai yang dikenal dari sheet. Nama bebas, foto,
  screenshot, lampiran PDF, angka unik, dan narasi kontekstual mungkin lolos.
- Mode kasus tidak mengisolasi shell/host dan tidak mencegat semua request
  model. Berkas asli tetap lokal **hanya bila tidak dilampirkan/dikirim**.
- Saat mode aktif, provider cloud tetap menerima data yang pengguna atau agen
  kirim. Untuk kasus sensitif, jangan berikan sumber asli ke chat/tool yang
  dapat mengirim kontennya.
- Token map tidak ikut disalin/dikirim; batasi akses file lokal sesuai OS.

## Repo GitHub: gunakan hanya bila ada kebutuhan terukur

| Repo | Keputusan |
|------|-----------|
| [OpenCode V2 policies](https://opencode.ai/v2/docs/policies) | **Pakai bawaan** untuk pembatasan tool/integrasi, tanpa dependensi tambahan. |
| [gitleaks/gitleaks](https://github.com/gitleaks/gitleaks) | Opsi scan secret di CI, bukan di laptop user. |
| [google/osv-scanner](https://github.com/google/osv-scanner) | Opsi audit dependensi CI, bukan runtime. |
| [data-privacy-stack/presidio](https://github.com/data-privacy-stack/presidio), [DataFog/datafog-python](https://github.com/DataFog/datafog-python) | **Tidak dipasang sekarang**; detector lama sudah ada, tambahan Python/NER bisa menambah waktu dan false positive. |
| [promptfoo/promptfoo](https://github.com/promptfoo/promptfoo), [NVIDIA/SkillSpector](https://github.com/NVIDIA/SkillSpector) | Opsi pengujian CI bila ada anggaran pemeliharaan, bukan bagian installer. |
| [superradcompany/microsandbox](https://github.com/superradcompany/microsandbox) | **Tunda**: besar, perlu virtualisasi; bukan kebutuhan alur analisa sehari-hari. |

## Rencana increment 0003 (direvisi)

1. Benahi `hyper-case mode` untuk config V2; pastikan cloud tetap tersedia.
2. Uji `redact`, `screen`, `restore` pada kasus sintetis; perbaiki hanya
   temuan nyata.
3. Tambah self-check setup offline dan panduan satu halaman.
4. Pastikan berkas dan checks ikut overlay installer. **Verify and close 0003.**

Ukuran keberhasilan: alur kasus sintetis lulus, data asli tidak muncul di
sheet redaksi, operasi sehari-hari tetap sama saat mode tidak aktif, dan
tidak ada proses/hop jaringan tambahan. Waktu/kinerja uji diukur sebelum
klaim â€œringanâ€; bukan target angka yang ditebak.

Status: intro/persetujuan dan perbaikan mode kasus sudah diimplementasikan di increment 0003/0004.\n\nSumber: inspeksi `rebrand/files/desktop/hyper/case/{casemode,pseudonym,cli}.py`,
`rebrand/files/core/config/managed-bundle.ts` dan dokumentasi OpenCode V2
`config`/`policies` (2026-10-24). Riset repo GitHub awal pada 2026-10-23.
