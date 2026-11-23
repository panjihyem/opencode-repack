# Rekomendasi keputusan owner — 22 November 2026

Status seluruh butir: **rekomendasi teknis, belum persetujuan owner atau legal**. Dokumen ini tidak mengubah status `HG-AUDIT-R1`, ADR, atau gate eksekusi. Keputusan yang memerlukan kewenangan organisasi tetap harus ditandatangani oleh pihak yang berwenang.

| Butir | Rekomendasi operasional sementara | Syarat membuka gate |
| --- | --- | --- |
| `A-01`, `M-00` | MVP hanya JDIH katalog resmi, ingest folder regular, dan rekap mingguan; data uji sintetis/non-sensitif. Tanpa pengiriman eksternal, otomasi desktop, atau akses kasus. | Owner menyetujui scope, metrik, rollback, dan pilot. |
| `HG-AUDIT-R1` dan ADR-001..007 | Pertahankan `pending`. Terapkan arah arsitektur sebagai batas konservatif, bukan klaim approval. ADR-007 tetap memblokir `run`/`tick`. | Review isi tiap dokumen dan keputusan ADR, catat identitas reviewer/tanggal dan bukti penerimaan. |
| Ancaman `T1`–`T20` | Terima daftar sebagai **register ancaman**, bukan penerimaan risiko residual. `T20` (admin dapat menulis ulang audit lokal) tidak diterima untuk produksi; butuh anchor eksternal. | Owner/security memutuskan toleransi per risiko dan hasil test mitigasinya. |
| Retensi audit/regular/log/backup | Angka rancangan: audit 90 hari, regular 90 hari, log tanpa prompt 14 hari, backup harian 30 hari. **Jangan jalankan pemusnahan otomatis** sebelum kebijakan resmi; backup perlu enkripsi dan uji restore. | Owner dan kepatuhan sahkan jangka waktu serta kewajiban simpan. |
| Artefak kasus | Lokal saja, tidak di folder cloud-sync; tidak ada auto-delete; pertahankan sampai aturan retensi resmi dan penutupan perkara disahkan. | Owner/kepatuhan tentukan lokasi, ACL, penanggung jawab, dan jadwal pemusnahan. |
| Arsip Hindsight dan penurunan zona | Perlakukan memori dengan data kasus sebagai `case`. Data kasus teredaksi tetap `case`; tidak boleh cloud. **Jangan izinkan** penurunan `case` ke `regular` sampai reviewer ditunjuk dan isolasi memori terbukti. | Penunjukan reviewer dan prosedur klasifikasi bertanda tangan. |
| `HG-DESKTOP-GO` | **No-go** Windows-MCP; tidak ada isolasi sesi terverifikasi. Lapisan approval/audit sudah ada (`Hyper-Hub-Desktop.ps1`, `H-03`), tetapi sidecar dan isolasi sesi belum. | VM/akun terpisah, sidecar terpasang, UAT non-sensitif |
| `HG-REMOTE-GO` | **No-go** MeshCentral/remote support pada mesin kasus. | Consent per sesi, akses berbatas waktu, audit, pencabutan seketika |
| `HG-SAAS-LIST` | Daftar kosong; Composio/Activepieces tidak diberi kredensial atau data kasus. Kontrak provenance graph ada (`J-02`), vendor belum. | Daftar endpoint, pemilik, klasifikasi data, retensi vendor, DPA |
| `HG-VOICE-SCOPE` | Voice realtime **tidak masuk MVP**; jangan merekam/transkripsi kasus. | Use case, dataset berizin, izin perekaman, retensi |
| Telegram/WhatsApp | Tidak aktif dalam pilot pertama; WhatsApp tetap `planned`. Jangan buat token/nomor atas nama pengguna. | Owner menyediakan akun/nomor khusus, allowlist, review kanal, dan uji pairing nyata. |
| Token GitHub lama | Anggap bocor karena pernah disimpan di `Desktop/cred.txt`; revoke dan buat token baru dengan hak minimal. | Pemilik akun GitHub melakukan revoke dan memverifikasi akses lama mati. |

`ponytail:` angka retensi di atas hanya rancangan kebijakan, bukan dasar penghapusan; aktifkan pemusnahan setelah review kepatuhan dan uji restore.
