# Zona Data: Verifikasi Subagent (D-11, D-12, D-13)

| Zona data | regular |
|-----------|---------|
| Tanggal | 1 November 2026 |
| Status | draft, desain siap direview; belum ada penegakan runtime. |

## Tujuan

Mencatat fakta terverifikasi tentang agent, batas subagent, dan warisan zona data, beserta bukti yang masih kurang untuk `D-11`..`D-13`.

## Lingkup

- Konfigurasi agent nyata di mesin ini, kebijakan subagent, batas steps/konkurensi, zona data subagent.

## Di luar lingkup

- Penegakan runtime: belum ada, karena connector registry belum tervalidasi (ADR-007).

## Jalur kegagalan

- `policy-check` tidak tahu zona sesi -> hanya alat bantu keputusan; klaim isolasi case belum boleh dibuat.

## Kriteria penerimaan

- Uji manual GUI (D-11) dan uji penolakan subagent/webfetch tersimpan sebagai bukti sebelum D-12/D-13 ditutup.

Cakupan: perilaku agent Hyper AI/OpenCode, batas subagent, dan warisan zona data.
Eksekusi job dan kanal eksternal tetap nonaktif (`ADR-007`).

---

## D-11 — Pemilih agent GUI dan perilaku mode

### Fakta terverifikasi di mesin ini

| Item | Hasil | Cara verifikasi |
|------|-------|-----------------|
| `agents` di `C:\Users\<user>\.config\opencode\opencode.json` | tidak ada | kunci teratas hanya `providers`, `mcp`, `permission`, `disabled_providers`, `model` |
| Folder `~/.config/opencode/agents/` | tidak ada | `Get-ChildItem` kosong |
| Folder `.opencode/agents/` sebelum pekerjaan ini | tidak ada | `Get-ChildItem` kosong |
| Event pemilihan agent | aktif | log server `event.type=agent.updated` |
| Agent terlihat (bawaan OpenCode V2) | `build`, `plan` (primary); `general`, `explore` (subagent) | dokumentasi V2 |
| Agent tersembunyi | `compaction`, `title`, `summary` | dokumentasi V2 |

Jumlah agent terlihat = **4** selama tidak ada agent kustom. Setelah pekerjaan ini,
`.opencode/agents/hyper-ops.md` dan `.opencode/agents/hyper-reviewer.md` menambah
2 agent, sehingga menjadi **6**. Jumlah itu baru berlaku bila OpenCode memuat file
tersebut; belum ada uji pemuatan GUI.

### Yang perlu diuji manual (belum bisa dari sini)

1. Buka Hyper AI, pastikan `hyper-ops` muncul di pemilih agent dan `hyper-reviewer`
   muncul di katalog subagent.
2. Pilih `hyper-ops`, jalankan `status` dan `audit`; pastikan keduanya berjalan.
3. Pada agent `hyper-ops`, minta menjalankan `Get-ChildItem`; harus **ditolak** oleh
   izin shell.
4. Pada agent `hyper-ops`, minta `policy-check -Zone case -Operation external.send`;
   harus **ditolak** oleh izin shell (bukan hanya oleh aturan Hub).
5. Ubah `default_agent` bila ingin agent lain menjadi default; catat bahwa sesi lama
   tidak ikut berubah.

**Jangan** mengandalkan `hidden: true` sebagai kontrol keamanan; izin
(`permissions`) yang menegakkan.

---

## D-12 — Batas subagent per induk

Desain kebijakan:

| Aturan | Nilai | Alasan |
|--------|-------|--------|
| Subagent per induk | eksplisit per agent ID | `subagent: "*"` memberi akses tak terbatas ke agent mana pun |
| `general` dan `explore` | tetap deny subagent | keduanya tidak dapat meluncurkan subagent |
| `hyper-ops` | deny subagent | operator Hub tidak perlu delegasi |
| Induk orkestrator | allow hanya `hyper-reviewer` | satu tingkat, tanpa rantai |
| Kedalaman | maksimal 1 | mencegah spawning berantai |
| `steps` | angka tetap per agent | membatasi langkah model |

Bentuk izin yang diusulkan untuk orkestrator (contoh, belum dipasang):

```yaml
permissions:
  - action: subagent
    resource: "*"
    effect: deny
  - action: subagent
    resource: hyper-reviewer
    effect: allow
```

Aturan terakhir yang cocok menang, jadi urutan deny-lalu-allow wajib.
Penolakan harus tercatat di audit (`run.denied`) ketika Hub menjadi penghubungnya;
selama ini penegakan berada di OpenCode, bukan Hub, sehingga bukti audit Hub
belum ada. Itu sebabnya `D-12` tetap `P0` dan belum boleh dinyatakan selesai.

**Bukti yang diperlukan sebelum `D-12` ditutup:** satu uji yang menunjukkan agent
anak tidak dapat meluncurkan subagent, dengan keluaran penolakan yang disimpan.

---

## D-13 — Batas langkah, konkurensi, dan zona data subagent

### Risiko utama

Subagent berjalan dengan konteks segar dan **izinnya sendiri**, tetapi ia juga
mewarisi model sesi induk bila `model` tidak disetel. Pada zona `case`, itu
berarti data kasus dapat ikut ke model cloud melalui subagent, meskipun induk
tidak mengirimnya.

### Kebijakan

| Kontrol | Aturan |
|---------|--------|
| Model | agent yang boleh digunakan pada zona `case` wajib memakai model lokal yang terdaftar |
| Konkurensi | maksimal 2 subagent paralel; job latar belakang tidak dihitung selama runner mati |
| `steps` | 6–8 per agent; agent review lebih kecil |
| Zona | zona menempel pada run, bukan pada proses; subagent mewarisi zona induk dan tidak dapat menaikkannya |
| Egress | subagent zona `case` mewarisi `deny` untuk `webfetch`, `websearch`, `external.send`, `model.cloud` |
| Penurunan zona | hanya oleh reviewer berwenang (`Data-Zone-Policy.md`, item PENDING) |

### Batas yang jujur harus dicatat

Kontrak `policy-check` di `Hyper-Hub.ps1` **tidak** mengetahui zona milik sesi
OpenCode. Saat ini zona adalah parameter eksplisit; siapa pun yang memanggil
`policy-check -Zone regular` mendapat jawaban zona regular. Karena itu:

- `policy-check` adalah alat bantu keputusan, bukan penegak.
- Penegakan sebenarnya harus berada di titik eksekusi (connector/job runner), dan
  itu belum ada (`ADR-007`).
- Sampai connector registry tervalidasi, klaim "subagent case tidak bisa keluar"
  belum dapat dibuktikan otomatis.

### Uji yang harus ada

1. Dua subagent paralel pada data non-sensitif selesai tanpa saling menimpa file.
2. Subagent dengan izin `webfetch: deny` gagal saat mencoba `webfetch`.
3. Agent anak yang mencoba `subagent` ditolak.
4. Skenario zona `case`: `policy-check` menolak `model.cloud` dan `external.send`;
   uji ini hanya membuktikan kontrak, bukan isolasi runtime.

---

## Status backlog

| Task | Status setelah pekerjaan ini |
|------|------------------------------|
| `D-11` | fakta konfigurasi tercatat; uji GUI manual tersisa |
| `D-12` | kebijakan tertulis; **penegakan + bukti audit belum ada** |
| `D-13` | kebijakan tertulis; **warisan zona belum ditegakkan** |

Tidak ada task di atas yang boleh ditandai selesai tanpa bukti uji.

## Gate manusia

| human_gate_id | status | blocks_hats | keterangan |
|---------------|--------|-------------|------------|
| HG-AUDIT-R1 | pending | 30 | Review owner sebelum dipakai sebagai dasar implementasi |
