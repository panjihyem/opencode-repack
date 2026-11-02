# Upgrade Ledger - Hyper AI

Rekap perubahan lintas sesi. Sumber: isi `hub/` di repo ini, `Hyper-AI-Backlog.csv`, dan
bukti di `flm-results/`. Klaim di sini harus punya bukti berkas atau perintah.

## 1. Backlog resmi

82 task, 13 epic. Status terakhir: **19 done, 63 open**.

| Epic | Cakupan | Done |
| --- | --- | --- |
| A | Program dan governance | 5/6 |
| B | Hyper Hub core runtime | 3/8 |
| C | Scheduler dan job engine | 0/9 |
| D | Policy approval audit | 3/13 |
| E | Kanal komunikasi | 1/6 |
| F | Knowledge pipeline | 0/10 |
| G | Browser automation | 1/4 |
| H | Desktop automation | 1/4 |
| I | Integrasi SaaS | 1/3 |
| J | Graph memory | 1/4 |
| K | Voice realtime | 1/3 |
| L | Remote support | 1/3 |
| M | Quality dan rollout | 1/9 |

### Task selesai (19)

`A-02` ADR arsitektur · `A-03` threat model + zona data · `A-04` inventaris lisensi ·
`A-05` kebijakan data kasus · `A-06` spec gate · `B-02` discovery + version check ·
`B-06` lock tunggal · `B-07` evaluasi runtime · `D-11` pemilih agent · `D-12` batas subagent ·
`D-13` konkurensi subagent · `E-01` bot Telegram + allowlist · `G-02` origin policy ·
`H-01` go/no-go Windows-MCP (no-go) · `I-01` klasifikasi SaaS ·
`J-04` evaluasi Graphify · `K-01` batas privasi voice · `L-01` go/no-go remote support (no-go) ·
`M-03` observability CLI.

## 2. Lapisan Hub (tidak ada baris backlog)

| Bidang | Yang ada | Bukti |
| --- | --- | --- |
| Perintah | `init status discover policy-check add run tick audit self-check jobs schedule remove pause resume health remote` | `Hyper-Hub.ps1` |
| Cron | 5 field Asia/Jakarta, `-EveryMinutes` tanpa pembulatan diam-diam | `self-check` |
| Audit | hash chain append-only, deteksi tamper | `Hyper-Hub-SelfCheck.ps1` |
| Lock | satu runner; dua `add` paralel -> satu tersimpan | `SelfCheck` |
| Origin policy | allowlist/blocklist browser | `docs/Browser-Origin-Policy.md` |
| Kanal remote | `remote` + allowlist wajib + pairing QR | `docs/Remote-Pairing.md` |
| Gate | 5 skrip, semua exit 0 | `CHANGELOG.md` |

## 3. Model lokal dan Copilot (lintas sesi)

### Provider terpasang (config lokal, bukan bundle OTA)

| Provider | Model | Endpoint |
| --- | --- | --- |
| `flm` | `qwen3.5-2b`, `lfm3-1.7b`, `hauhaucs-qwen3.5-4b` | `127.0.0.1:52624/v1` |
| `copilot-bridge` | `copilot` | `127.0.0.1:57842/v1` |

Default tetap cloud (`ocg/mimo-v2.6-flash`). Angka performa: `docs/Local-Model-Testing.md`.

### Risiko yang tercatat

| Temuan | Bukti |
| --- | --- |
| Server FLM harus jalan manual; mati -> `ECONNREFUSED` | config lokal + log |
| Copilot bridge tanpa pengawas; port hidup tanpa jaminan | tidak ada health check di Hub |
| `permission: {"*":"allow"}` global | bertentangan dengan ADR-003 |
| `copilot-bridge/copilot` ditandai `tools:true` padahal uji tool calling gagal | `flm-results/compare-copilot-20261102.jsonl` |

## 4. Pending

Lihat `docs/Pending-Tasks.md` untuk daftar lengkap beserta pemilik dan prasyarat.
