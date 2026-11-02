# Spec: use case voice dan batas privasi

| Zona data | case |
|-----------|------|
| Status | draft — use case menunggu persetujuan owner |
| Task | K-01 |
| Dependensi | A-05 |

## Tujuan

Menetapkan apakah Hyper AI memakai masukan suara sama sekali, dan bila ya, batas privasinya: apa yang direkam, di mana diproses, berapa lama disimpan, dan apa yang dilarang. Tanpa dokumen ini, fitur voice tidak dibangun.

## Lingkup

- Use case yang dievaluasi (belum disetujui):

| Use case | Manfaat | Data masuk | Rekomendasi |
|---|---|---|---|
| Dikte catatan kerja non-sensitif | cepat mencatat ringkasan tugas | suara → teks lokal | **go** untuk zona `regular` saja |
| Perintah suara untuk kontrol Hub | hands-free saat membaca dokumen | suara → perintah terbatas | tunda, tumpang tindih dengan H-01 |
| Transkripsi wawancara/perkara | — | suara pihak ketiga | **no-go** |
| Asisten realtime dua arah | — | audio berkelanjutan | **no-go** selama belum perlu |

- Batas privasi wajib:
  - STT berjalan **lokal** (`whisper.cpp` atau `sherpa-onnx`, dicek di `K-02`); tidak ada audio yang dikirim ke layanan cloud.
  - Audio mentah dihapus setelah transkripsi selesai; yang disimpan hanya teks, dan hanya bila pengguna memintanya.
  - Retensi teks transkripsi: tidak otomatis disimpan; bila disimpan, masuk aturan retensi artefak `regular`, bukan `case`.
  - Mikrofon hanya aktif atas tindakan pengguna; tidak ada perekaman latar.
  - Indikator perekaman harus terlihat selama mikrofon aktif.
- Zona `case`: **tidak ada fitur suara** pada versi ini.

## Di luar lingkup

- Benchmark STT (`K-02`) dan spike LiveKit/Pipecat (`K-03`).
- Pengenalan suara (identifikasi pembicara).
- Wake word.

## Jalur kegagalan

- Model STT tidak tersedia lokal → fitur suara nonaktif, tidak beralih ke cloud.
- Audio gagal diproses → berkas audio dihapus, tidak disimpan untuk "dicek nanti".
- Mikrofon aktif tanpa indikator → fitur dimatikan sampai indikator berfungsi.
- Permintaan suara di zona `case` → ditolak.
- Transkripsi yang tampak memuat data kasus → tidak diproses; pengguna diberi peringatan.

## Kriteria penerimaan

- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub-SpecCheck.ps1 -Spec .\docs\Voice-Privacy-Boundary.md` → `issues` hanya gate `HG-AUDIT-R1`, exit 2 sampai disetujui.
- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub.ps1 policy-check -Zone case -Operation external.send` → `deny` (memastikan tidak ada jalur audio ke cloud).
- Tidak ada endpoint audio/cloud di daftar `docs/SaaS-Integration-Classification.md`.
- Retensi teks transkripsi tercatat dengan angka hari, bukan "sesuai kebutuhan".

## Batas egress

Zona `case` — audio adalah data paling mudah bocor:

- Dilarang: mengirim audio atau transkripsi ke layanan apa pun (cloud STT, Telegram voice note, WAHA, Composio).
- Dilarang: perekaman otomatis, perekaman latar, dan penyimpanan audio mentah lebih dari proses transkripsi.
- Diizinkan: tidak ada. Zona `case` tidak memakai fitur suara.
- Tingkat redaksi: untuk `regular`, teks transkripsi tidak memuat data kasus; bila terdeteksi, dipotong sebelum disimpan.
- Model yang diizinkan di zona `case`: tidak ada model cloud; STT lokal pun tidak diaktifkan untuk `case`.

## Gate manusia

| human_gate_id | status | blocks_hats | keterangan |
|---------------|--------|-------------|------------|
| HG-AUDIT-R1 | pending | 30 | Review manusia sebelum implementasi |
| HG-VOICE-SCOPE | pending | 30 | Owner menyetujui use case dan retensi |
