# Data Zone Policy — data kasus vs regular

| Zona data | regular |
|-----------|---------|
| Status | proposed (pending owner approval) |
|Tanggal | 1 November 2026 |
|Terkeit | A-05, A-03, D-03, D-04, D-09, M-00 |

**Rujukan:** ADR-004 (pengambilan keputusan zona), `docs/Hyper-Hub-Threat-Model.md` (T5, T9, T14).

## Tujuan

Menetapkan aturan tunggal yang dapat diuji tentang apa yang boleh disentuh data zona `case` dan `regular`, sehingga tidak ada jalur keluar bagi data kasus dan mode regular tidak mendapat pembatasan baru dari aturan ini. Kebijakan ini menjadi rujukan `Test-HubPolicy`, redaksi, retensi, dan checklist review manusia.

## Lingkup

- Definisi dan penetapan zona, termasuk aturan "bila ragu, case" (§1, §6).
- Daftar kanal yang diblokir untuk `case` (§3) dan syarat kanal `regular`.
- Aturan redaksi (§4), retensi (§5), checklist review manusia (§8).

## Di luar lingkup

- Implementasi penegakan egress (`D-04`), approval broker (`D-07`), dan mesin redaksi (`D-09`).
- Nilai resmi retensi dan path penyimpanan — masih `PENDING` (§9).
- Perubahan `Hyper-Hub.ps1`, konfigurasi global, atau kebijakan zona untuk mode regular.

## Jalur kegagalan

- Zona tidak dikenal atau tidak ditulis → **deny** (ADR-003), bukan menebak `regular`.
- Spec `case` tanpa `## Batas egress` → `Hyper-Hub-SpecCheck.ps1` exit 2, spec tidak dipakai.
- Policy/audit/approval tidak tersedia → seluruh eksekusi diblokir, bukan dilanjutkan dengan default permisif.
- Recall memori lintas zona belum terisolasi (§7) → pekerjaan case end-to-end **dinyatakan belum aman**, bukan diasumsikan aman.
- Gate `HG-AUDIT-R1` tidak `approved` → spec ditolak (exit 2).

## Kriteria penerimaan

- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub-SpecCheck.ps1 -Spec .\docs\Data-Zone-Policy.md`
- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub.ps1 policy-check -Zone case -Operation external.send` menghasilkan `deny`.
- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub.ps1 policy-check -Zone regular -Operation local.status` menghasilkan `allow`.
- Semua keputusan `executable: false` sampai connector registry tervalidasi (ADR-007).

## 1. Definisi zona

| Zona | Isi | Contoh |
|---|---|---|
| `case` | Data berkas kasus/pemeriksaan yang belum dipublikasikan, mengandung identitas pihak, atau terikat kewajiban seumur hidup | dokumen WP/PKP/SP2, BAP draft, LHP draft, bukti transaksi, PII, tangkapan layar sistem internal, korpus penalty |
| `regular` | Data yang dapat dipublikasikan atau tidak dapat dikaitkan ke pihak tertentu | regulasi publik, dokumen JDIH, template kosong, catatan teknis, kode |

Aturan tunggal: **bila ragu, zananya `case`.** Zona tidak dikenal = deny (ADR-003).

Zona melekat pada spec, job, run, session, dan artifact. Satu langkah pakai data case → seluruh run case.

## 2. Aturan local-only untuk case

Diizinkan:
- `local.status` dan operasi status/health lokal.
- Model lokal yang lolos review lisensi `A-04`.
- Ekstraksi lokal (Docling/OCR lokal), Hindsight lokal pada `127.0.0.1`, render dokumen lokal.
- Penyimpanan lokal dengan ACL dan backup terenkripsi (kepemilikan path `PENDING`).

Dilarang tanpa kecuali pada MVP:
- semua model cloud (termasuk provider yang sama dengan sesi UI);
- shell bebas ke jaringan;
- plugin memori otomatis yang mengirim transkrip;
- attachment asli ke chat model mana pun.

## 3. Kanal yang diblokir untuk case

| Kanal | Status case |
|---|---|
| Telegram | diblokir |
| WhatsApp / WAHA | diblokir |
| Composio / integrasi SaaS | diblokir |
| Playwright / browser automation / `webfetch` / `websearch` | diblokir |
| Context7 / MCP eksternal | diblokir |
| Graphify dengan backend cloud | diblokir |
| Remote support (MeshCentral) | diblokir |
| Hindsight lokal | diizinkan (lihat §7, PENDING isolasi) |
| Model lokal | diizinkan |

Kanal `regular` tidak otomatis diblokir, tetapi wajib: connector `validated` (ADR-007) + allowlist egress + approval bila high-risk.

## 4. Redaksi

1. Redaksi wajib **sebelum** prompt/lampiran keluar dari zona case (walau tujuannya model lokal).
2. Redaksi menangani minimal: nama, NIK/NPWP, alamat, nomor rekening, nomor telepon, email, dan token secret.
3. Token map hasil redaksi disimpan terpisah dari context agent dan **tidak boleh** dibaca agent.
4. Audit hanya menyimpan: hash, panjang, jumlah redaction, level redaksi — bukan teks.
5. Hanya redaksi saja **tidak** mengubah zona menjadi `regular`. `PENDING` (owner): apakah data kasus yang sudah diredaksi boleh ke model cloud? Rekomendasi: **tidak** untuk MVP.

## 5. Retensi

| Objek | Default | PENDING |
|---|---|---|
| Audit event | 90 hari | konfirmasi durasi |
| Artifact case | tetap sampai kasus ditutup | jadwal pemusnahan |
| Artifact regular | 90 hari | - |
| Log proses | 14 hari, tanpa isi prompt | - |
| Backup | harian, 30 hari | tujuan & enkripsi |

Retensi tidak berlaku untuk bahan yang wajib disimpan menurut aturan pemeriksaan; **jangka waktu resmi `PENDING`** (owner + kepatuhan).

## 6. Menandai zona pada spec

Label di tabel depan spec (`Hyper-Hub-Spec-Template.md`):

```markdown
| Zona data | regular |
```

Nilai sah hanya `case` atau `regular`. Spec bertanda `case` **wajib** punya bagian `## Batas egress` yang menyebut: dilarang kanal eksternal, model lokal yang diizinkan, tingkat redaksi. `Hyper-Hub-SpecCheck.ps1` menolak spec `case` tanpa bagian itu (exit 2).

Spesifikasi job juga menulis `policy:` dan zona; bila keduanya berbeda, nilai yang lebih ketat menang.

## 7. Gap yang harus dinyatakan

- Plugin memori global (`hyper-memory.ts`) belum membawa penanda zona → recall case dan regular belum terisolasi. **Belum aman** untuk case end-to-end.
- Case mode engine bukan sandbox: shell, model cloud, dan `screen` tidak dijamin oleh engine.
- Hindsight lokal menerima teks; arsip lokalnya diperlakukan sebagai zona case `PENDING` konfirmasi.

## 8. Checklist review manusia (wajib sebelum eksekusi job case)

- [ ] Spec berlabel `Zona data: case` dan lolos `Hyper-Hub-SpecCheck.ps1` (exit 0).
- [ ] Bagian `## Batas egress` ada dan menyebut larangan kanal eksternal.
- [ ] Tidak ada connector eksternal di langkah mana pun (Telegram/WAHA/Composio/browser/web).
- [ ] Model yang dipakai ada di allowlist model lokal.
- [ ] Redaksi aktif; jumlah redaction tercatat di audit.
- [ ] Token map tidak masuk context agent dan tidak ada di artefak.
- [ ] Direktori kerja tidak mengandung symlink keluar workspace.
- [ ] Artifact disimpan lokal dengan ACL benar; tidak ada salinan ke folder tersinkron cloud.
- [ ] Approval manusia untuk langkah berisiko tercatat (nonce single-use).
- [ ] Gate `HG-AUDIT-R1` = `approved`.

## 9. Keputusan yang butuh persetujuan owner

1. `PENDING` — apakah data kasus teredaksi boleh dikirim ke model cloud? (rekomendasi: tidak).
2. `PENDING` — durasi retensi resmi artifact case dan audit (kepatuhan + jadwal pemusnahan).
3. `PENDING` — apakah arsip Hindsight lokal otomatis dianggap zona `case`.
4. `PENDING` — pemilik path penyimpanan case (neverik folder OneDrive/ter-sinkron?).
5. `PENDING` — siapa reviewer manusia berwenang untuk menurunkan zona `case` → `regular`.

## Batas egress

Spec ini bertanda zona `regular` karena isinya kebijakan teknis tanpa data kasus. Bila dokumen turunan bertanda `case`, kanal keluar berikut dilarang: Telegram, WhatsApp/WAHA, Composio/SaaS, Playwright/browser/`webfetch`/`websearch`, Context7/MCP eksternal, Graphify backend cloud, dan semua model cloud. Model yang diizinkan hanya model lokal terdaftar di allowlist `A-04`.

## Gate manusia

| human_gate_id | status | blocks_hats | keterangan |
|---------------|--------|-------------|------------|
| HG-AUDIT-R1 | pending | 30 | Review owner atas kebijakan zona data sebelum penegakan egress |
