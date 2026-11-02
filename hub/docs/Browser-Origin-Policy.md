# Spec: origin allowlist dan blocklist browser automation

| Zona data | case |
|-----------|------|
| Status | draft |
| Task | G-02 |
| Dependensi | G-01, D-04 |

## Tujuan

Menetapkan satu daftar origin yang boleh dan tidak boleh dibuka otomatis oleh sisi browser, sehingga navigasi ke origin di luar allowlist berhenti sebelum request keluar. Penilai bersifat statis dan deterministik: masukan origin + zona, keluaran `allow`/`deny` beserta alasan. Versi pertama belum menavigasi apa pun (G-01 belum ada).

## Lingkup

- Bentuk normalisasi origin: `scheme://host[:port]`, huruf kecil, tanpa path/query/fragment. Origin yang tidak bisa dinormalisasi → `deny` (`origin tidak dapat dinormalisasi`).
- Skema yang diterima hanya `https` dan `http`; skema lain (`file`, `ftp`, `chrome`, `javascript`, `data`, `blob`, `about`) selalu `deny`.
- Aturan pencocokan: kecocokan **persis** `scheme + host + port efektif`. Tidak ada pencocokan akhiran, tidak ada wildcard di tengah. Wildcard hanya sah satu bentuk: `*.contoh.go.id` yang cocok pada tepat satu label di depan.
- Port efektif: `443` untuk `https`, `80` untuk `http`; ditulis ulang implisit ke bentuk baku.
- Blocklist dievaluasi **lebih dulu** dari allowlist; bila keduanya cocok → `deny`.
- Zona `case`: allowlist berisi hanya origin hukum publik yang dibutuhkan riset, tiap entri wajib punya `alasan` dan `pemilik`; blocklist mencakup semua origin lain (deny-by-default).
- Zona `regular`: allowlist tetap eksplisit, bukan "semua kecuali blocklist".
- Penyimpanan daftar: berkas JSON lokal `browser-origin-policy.json` di root Hub, dibaca hanya oleh agent berzona `regular`, tidak pernah ditulis oleh runtime.
- Penilai ikut `policy-check` sebagai operasi baru `browser.navigate` dengan parameter `-Origin`.

## Di luar lingkup

- Menjalankan browser, memasang Playwright, atau membuka koneksi apa pun (G-01).
- Blokir berbasis konten, IP, atau reputasi domain; ini hanya pencocokan string origin.
- Penanganan redirect lintas origin di runtime — dicatat sebagai syarat G-01, bukan implementasi di sini.
- Proxy, sertifikat, atau pinning TLS.
- Kebijakan egress jaringan umum (D-04) — dokumen berbeda.

## Jalur kegagalan

- Berkas policy hilang / tidak terbaca / JSON rusak → **semua** navigasi `deny` (`policy tidak terbaca`), bukan allow.
- Origin masukan kosong, berisi kredensial (`user:pass@`), berisi karakter kontrol, atau lebih dari 2048 karakter → `deny`.
- Host berupa alamat IP literal atau `localhost` → `deny` di kedua zona (SSRF lokal).
- Origin cocok dengan blocklist → `deny` walau ada di allowlist; alasan menyebut aturan blocklist.
- Wildcard ganda (`*.*.x`), wildcard di posisi TLD (`contoh.*`), atau wildcard tanpa titik → `deny`.
- Entri allowlist tanpa `alasan` atau `pemilik` → berkas dianggap tidak valid, semua `deny`.
- Apa pun yang tidak terklasifikasi → `deny`. Tidak ada jalur yang mengembalikan `allow` karena kesalahan.
- Respons penilai selalu `executable: false`; `allow` bukan izin eksekusi.

## Kriteria penerimaan

- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub.ps1 policy-check -Zone regular -Operation browser.navigate -Origin https://jdih.go.id` → `allow`, exit 0.
- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub.ps1 policy-check -Zone regular -Operation browser.navigate -Origin http://localhost:8080` → `deny`.
- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub.ps1 policy-check -Zone regular -Operation browser.navigate -Origin file:///C:/Windows/System32/drivers/etc/hosts` → `deny`.
- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub.ps1 policy-check -Zone case -Operation browser.navigate -Origin https://evil.example.com` → `deny`.
- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub.ps1 policy-check -Zone regular -Operation browser.navigate` (tanpa `-Origin`) → `deny`, bukan galat tak tertangani.
- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub-SpecCheck.ps1 -Spec .\docs\Browser-Origin-Policy.md` → `issues` hanya gate `HG-AUDIT-R1`, exit 2 sampai gate disetujui.
- Setiap baris uji di atas juga dijalankan tanpa `init` dan **tidak** boleh membuat direktori root.

## Batas egress

Zona `case` — tujuan keluar yang dilarang dan yang diizinkan:

- Dilarang: semua kanal eksternal (Telegram, WAHA, Composio, SMTP), model cloud, dan origin yang tidak ada di allowlist `case`.
- Dilarang di kedua zona: `localhost`, alamat IP literal, RFC1918, link-local, `file:`, `javascript:`, `data:`.
- Diizinkan di zona `case` hanya: origin hukum publik yang dibutuhkan pencarian dokumen (mis. `jdih.*.go.id`, `peraturan.go.id`), tanpa query yang memuat data kasus.
- Tingkat redaksi: `case` tidak mengirim parameter, header, atau body yang berasal dari data kasus; URL yang dikirim hanya origin + path publik.
- Model yang diizinkan di zona `case`: tidak ada model cloud. Pemrosesan tetap lokal.

## Gate manusia

| human_gate_id | status | blocks_hats | keterangan |
|---------------|--------|-------------|------------|
| HG-AUDIT-R1 | pending | 30 | Review manusia sebelum implementasi |
