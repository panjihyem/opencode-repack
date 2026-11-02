# Hyper Hub — Threat Model (ringkas)

| Zona data | regular |
|-----------|---------|
| Status | proposed (pending owner approval) — dokumen ancaman, bukan persetujuan. |
| Tanggal | 1 November 2026 |
| Terkait | A-03, A-05, D-10, M-00 |
| Metode | STRIDE ringkas + trust boundary. Bukan penilaian risiko kuantitatif. |

## Tujuan

Memetakan ancaman Hyper Hub ke kontrol dan task backlog sehingga setiap risiko punya owner dan kontrol yang dapat diuji.

## Lingkup

- Trust boundary, aset, ancaman T1-T20, dan pemetaan ke `D-03`..`D-13`, `B-03`.

## Di luar lingkup

- Penilaian risiko kuantitatif, implementasi kontrol, dan review formal `D-10`.

## Jalur kegagalan

- Kontrol belum ada -> ancaman ditandai terbuka, bukan diasumsikan tertutup.

## Kriteria penerimaan

- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub-ContractCheck.ps1`

## 1. Aset

| Aset | Alasan dilindungi |
|---|---|
| Data kasus (dokumen, narasi, PII) | Kerahasiaan; dampak hukum/profesional |
| Kredensial & token (bot token, API key, service password, `tokens.json`) | Akses tidak sah ke layanan |
| Integritas audit (`audit.jsonl` + hash head) | Bukti dan forensik |
| `state.json` (zona, approval, lease) | Bila diubah → eksekusi tidak sah |
| Model cloud/kuota/biaya | Kebocoran biaya |
| Mesin host (file, jaringan internal) | Kerusakan data / pivot |

## 2. Trust boundary

```
[User GUI]  ─┐
             ├─(TB1)─ [OpenCode engine + plugin hyper-hub-bridge] ─(TB2)─ [Hyper Hub daemon]
[Agent/subagent]┘                                                         │
                                                                          ├─(TB3)─ [Connector: telegram/WAHA/browser/desktop]
                                                                          └─(TB4)─ [Kanal eksternal / internet / model cloud]
```

| ID | Boundary | Catatan |
|---|---|---|
| TB1 | User/agent ↔ engine | Agent adalah input tidak tepercaya (prompt injection, subagent) |
| TB2 | engine ↔ daemon | Loopback + bearer; plugin tipis; daemon pemegang keputusan |
| TB3 | daemon ↔ connector | Setiap connector entri registry (ADR-007) |
| TB4 | daemon/connector ↔ kanal eksternal | Satu-satunya jalur keluar; allowlist egress |
| TB5 | daemon ↔ disk lokal | state/audit/artifact; admin lokal dianggap bisa menulis |
| TB6 | daemon ↔ model cloud | prompt/lampiran keluar; zona case harus tidak melewati ini |

Aturan zona: data `case` **tidak boleh menyeberangi TB4 maupun TB6**. Data `regular` boleh menyeberangi TB4 hanya lewat connector `validated` + approval.

## 3. STRIDE

| Kategori | Permukaan relevan | Ringkas |
|---|---|---|
| Spoofing | TB1, TB2, TB3, approval Telegram | Bearer palsu, callback approval palsu, user/chat tidak dikenal |
| Tampering | TB5 disk, engine config | `state.json` diubah, audit ditulis ulang, konfigurasi permission dilonggarkan |
| Repudiation | audit | Aksi tanpa jejak, atau jejak tanpa bot (privilege tanpa akuntabilitas) |
| Information disclosure | TB4, TB6, log | Data kasus keluar ke cloud/kanal, secret bocor ke log, path traversal membaca file |
| DoS | engine, scheduler, connector | Spawn subagent berantai, retry storm, run ganda, job menumpuk |
| Elevation of privilege | agent → daemon → host | Shell dari job background, SSRF ke internal, approval replay |

## 4. Daftar ancaman

| ID | Ancaman | STRIDE | Dampak | Kontrol | Owner | Task |
|---|---|---|---|---|---|---|
| T1 | `state.json` diubah manual/oleh agent agar `add`/`run` dianggap sah atau `lastAuditHash` disesuaikan | Tampering, EoP | Eksekusi tidak sah, gate dilewati | Exclusive lock; verifikasi audit saat start/tick; `init` menolak state tanpa audit; state tidak pernah dibaca dari input eksternal; migrasi ke DB ber-WAL | Core runtime | `D-03` |
| T2 | Audit ditulis ulang / baris dihapus | Tampering, Repudiation | Bukti hilang, forensik mustahil | Hash-chain + head compare; append-only; penolakan bila head tidak cocok; anchor harian ke lokasi terpisah sebelum Fase 2 | Core runtime | `D-05` |
| T3 | Token/kredensial bocor ke log, audit, CSV, atau prompt | Info disclosure, Spoofing | Akses ke layanan, biaya, data | Bearer per instalasi di DPAPI; redaction log; audit menyimpan hash bukan isi; connector memakai `secret_ref`, bukan nilai; rotasi | Core runtime | `B-03` |
| T4 | Secret muncul di respons `/health` atau `/status` | Info disclosure | Bocor ke agent | Redaksi pada health/status; field allowlist | Core runtime | `B-04` |
| T5 | Prompt/data kasus terkirim ke model cloud | Info disclosure | Kebocoran rahasia berat | Zona `case` = model lokal saja; egress policy menolak kanal; redaction sebelum prompt/attachment; DLP test | Policy | `D-04` |
| T6 | Prompt injection dari dokumen/web/Telegram membuat agent memanggil tool berisiko | EoP, Tampering | Aksi destruktif / kirim data keluar | Konten = data, bukan instruksi; tool allowlist sempit untuk agent `hyper-ops`; approval untuk aksi berisiko; tidak ada auto-execute | Policy | `D-02` |
| T7 | Subagent spawning berantai / tak terbatas | DoS, EoP | Ledakan biaya, aksi paralel liar | Izin `subagent` eksplisit per agent ID (bukan daftar `*`); agent anak tidak dapat meluncurkan subagent; uji penolakan teraudit | Policy | `D-12` |
| T8 | Subagent paralel melewati batas steps atau mewarisi akses egress induk | DoS, EoP | Zona bocor, biaya | Batas `steps` + jumlah subagent paralel; subagent mewarisi zona dan tidak boleh lebih longgar; uji paralel non-sensitif | Policy | `D-13` |
| T9 | Egress data keluar via Telegram/WhatsApp/web/Composio | Info disclosure, EoP | Kebocoran / ban akun | Egress allowlist; case-zone menolak seluruh kanal eksternal; connector registry gate; web/`webfetch`/`websearch`/Context7 diblokir untuk case | Policy | `D-04` |
| T10 | Path traversal / symlink membaca file di luar workspace | Info disclosure | Baca file sensitif | Kanonisasi path; whitelist direktori; tolak traversal dan symlink keluar; batas ukuran/tipe; routing quarantine | Core runtime | `D-10` |
| T11 | SSRF: connector/browser menembak `127.0.0.1`, `169.254.169.254`, jaringan internal | Info disclosure, EoP | Baca internal, pivot | Host/port allowlist; tolak IP privat/loopback kecuali yang didaftarkan; tanpa redirect; origin allowlist browser | Policy | `D-10` |
| T12 | Approval replay/forgery (callback lama atau dari chat lain) | Spoofing, EoP | Aksi tanpa izin | Nonce single-use; ikat chat ID/user ID/nonce; expiry → deny; keputusan diaudit; high-risk butuh dashboard/double approval | Policy | `D-07` |
| T13 | Approval pending terbaca/terjawab oleh pihak lain lewat API loopback | Spoofing | Aksi tanpa izin | Bearer + loopback only; `list/get/reply` terautentikasi; reply `once/always/reject` terekam | Core runtime | `D-08` |
| T14 | Redaction gagal / token map terbaca | Info disclosure | Data kasus bocor | Token map terpisah dari context agent; 20 uji DLP; audit menyimpan jumlah redaction, bukan isi | Policy | `D-09` |
| T15 | Job ganda / run dobel saat restart atau concurrency | DoS, Tampering | Efek ganda (kirim 2x, ingest 2x) | Lease + idempotency key + resource lock; kill process tree; dead-letter | Core runtime | `D-10`, `C-04` |
| T16 | Konfigurasi permission V1 dilonggarkan saat migrasi | EoP | Deny-list mati | Migrasi V1→V2 dengan backup, deny-by-default, rollback diuji | Policy | `D-01` |
| T17 | Follower API engine berubah (endpoint experimental) | DoS, Tampering | Integrasi rusak / audit putus | Pin versi; contract test; fail-closed bila hook tidak tersedia | Core runtime | `D-06` |
| T18 | Supply chain / lisensi (dependency, model, tool pihak ketiga) | Tampering | Kode berbahaya, masalah legal | SBOM, pin versi, license scan, tolak AGPL yang di-link | Governance | `A-04` |
| T19 | Connector tidak tervalidasi dipakai untuk demo | EoP, Info disclosure | Gate jadiformalitas | Registry gate keras (ADR-007); eksekusi ditolak | Core runtime | `D-04` |
| T20 | Admin lokal menulis ulang state+audit sekaligus | Repudiation | Bukti palsu | Anchor eksternal harian; batas dinyatakan terang di ADR-005 | Governance | `D-05` |

**Catatan batas yang harus dinyatakan, bukan disembunyikan:**
- Case mode engine **bukan sandbox**: shell masih bisa jaringan, model cloud masih menerima prompt, `screen` melewatkan PII tak dikenal.
- Plugin memori global (`hyper-memory.ts`) belum membawa penanda zona → recall memori case/regular belum terisolasi.
- Hash-chain lokal tidak menahan penyerang dengan akses tulis penuh.

## 5. Kebutuhan owner (PENDING)

- Menyetujui tabel ancaman + penugasan owner di atas.
- Menyetujui bahwa `T20` diterima sementara sampai anchor eksternal terpasang.
- Menyebutkan pemilik data kasus yang berwenang memberi izin `case` → `regular`.

## 6. Validasi

`D-10` wajib menguji: state tampering (T1), audit tampering (T2), secret leakage (T3/T4), case→cloud (T5), egress kanal case (T9), path traversal (T10), SSRF (T11), replay approval (T12), subagent chain (T7/T8).

## Gate manusia

| human_gate_id | status | blocks_hats | keterangan |
|---------------|--------|-------------|------------|
| HG-AUDIT-R1 | pending | 30 | Review owner sebelum dipakai sebagai dasar implementasi |
