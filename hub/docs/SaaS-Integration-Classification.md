# Spec: klasifikasi integrasi SaaS non-sensitif

| Zona data | case |
|-----------|------|
| Status | draft — daftar endpoint menunggu persetujuan owner |
| Task | I-01 |
| Dependensi | A-05 |

## Tujuan

Menetapkan daftar endpoint SaaS dan klasifikasi data yang **boleh** keluar dari mesin, sehingga integrasi berikutnya (Composio, Activepieces) punya batas tertulis, bukan kesepakatan lisan. Bila daftar tidak ada, semua egress ditolak.

## Lingkup

- Aturan penentu: hanya **zona `regular`** boleh memanggil SaaS. Zona `case` tidak pernah memanggil SaaS.
- Klasifikasi yang dipakai:

| Kelas | Contoh | Boleh keluar? |
|---|---|---|
| `publik` | daftar nama peraturan, halaman JDIH, judul artikel | ya, ke endpoint allowlist |
| `internal` | nama tugas, status job, jam jadwal | ya, hanya bila disetujui per-endpoint |
| `terbatas` | nama pihak non-publik, nomor berkas internal dalam kalimat | tidak |
| `kasus` | dokumen perkara, identitas wajib pajak/pihak, hasil analisa, attachment | **tidak pernah** |

- Daftar endpoint kandidat (belum disetujui — semua `deny` saat ini):

| Endpoint | Kelas maksimum | Status |
|---|---|---|
| `api.telegram.org` (bot) | `internal` | menunggu approval owner |
| WAHA lokal `127.0.0.1` | `internal` | menunggu approval owner |
| Composio `*.composio.dev` | `publik` | menunggu approval owner |
| JDIH `*.go.id` | `publik` | menunggu approval owner (lihat `Browser-Origin-Policy.md`) |

- Setiap entri wajib punya `pemilik`, `alasan`, `kelas maksimum`, dan `retensi di pihak ketiga`.
- DPA/terms pihak ketiga dicek sebelum status diubah dari `menunggu`.

## Di luar lingkup

- Pemasangan Composio/Activepieces (I-02, I-03).
- Kebijakan kanal Telegram/WAHA (Epic E).
- Redaksi teknis di runtime (`D-09`).

## Jalur kegagalan

- Entri tanpa salah satu field wajib → dianggap tidak ada, `deny`.
- Kelas data tidak dikenal → `deny`.
- Permintaan dari zona `case` → `deny`, tanpa melihat kelas.
- Endpoint tidak ada di daftar → `deny` (`policy tidak terbaca` atau `origin tidak ada di allowlist`).
- Kunci API bocor / tidak bisa disimpan di DPAPI → `deny` sampai diperbaiki.
- Respons penilai selalu `executable: false`.

## Kriteria penerimaan

- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub.ps1 policy-check -Zone case -Operation external.send` → `deny`.
- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub.ps1 policy-check -Zone regular -Operation external.send` → `deny` selama registry connector kosong.
- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub-SpecCheck.ps1 -Spec .\docs\SaaS-Integration-Classification.md` → `issues` hanya gate `HG-AUDIT-R1`, exit 2 sampai disetujui.
- Setiap baris daftar endpoint punya keempat field wajib terisi.
- Daftar yang disetujui ditandatangani owner sebelum ada endpoint yang berstatus `disetujui`.

## Batas egress

Zona `case` — daftar putih dan larangan:

- Dilarang: Telegram, WAHA, Composio, Activepieces, SMTP, dan semua model cloud.
- Diizinkan: tidak ada. Zona `case` tidak melakukan egress ke layanan SaaS apa pun.
- Tingkat redaksi: tidak berlaku, karena tidak ada egress. Bila kelak diizinkan untuk `publik`, hanya judul/nama peraturan yang dikirim, tanpa potongan dokumen.
- Model yang diizinkan di zona `case`: tidak ada model cloud.

## Gate manusia

| human_gate_id | status | blocks_hats | keterangan |
|---------------|--------|-------------|------------|
| HG-AUDIT-R1 | pending | 30 | Review manusia sebelum implementasi |
| HG-SAAS-LIST | pending | 30 | Owner menyetujui daftar endpoint dan kelas data |
