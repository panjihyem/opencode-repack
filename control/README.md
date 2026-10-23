# Config OTA Hyper AI

Config (provider, model, agent, policy) dan kredensial bisa diperbarui tanpa merilis aplikasi.
Aplikasi memeriksa bundle bertanda tangan, memverifikasinya, lalu memuatnya **di atas** config pengguna.

```
repo config/ ──CI: validasi + tanda tangan Ed25519 + enkripsi rahasia──► GitHub Release `config-<channel>`
                                                                            │
aplikasi: GET bundle.json (+ .sig) ─► verifikasi ─► gate versi/rollout ─► tulis atomik ─► config watcher memuat
                                                                            │
                                                                    previous/ untuk rollback
```

## Berkas

| Berkas | Isi |
| --- | --- |
| `packages/core/src/config/managed-bundle.ts` | Tanda tangan, enkripsi AES-256-GCM, allowlist config, merge, gate versi/rollout. Murni Node. |
| `packages/core/src/config/managed-apply.ts` | Tulis atomik, anti-rollback, simpan versi sebelumnya, rollback. |
| `packages/core/src/config/updater.ts` | Unduh GitHub Releases + ETag, jadwal 6 jam, lapor status. |
| `packages/core/src/config/managed-policy.ts` | Kunci publik aplikasi + allowlist modul provider. |
| `packages/core/src/config/discovery.ts` | Sumber `managed` (per pengguna + per mesin), dibaca setelah system/MDM. |
| `packages/core/src/config.ts` | Verifikasi + materialisasi bundle saat config dimuat. |
| `packages/core/src/config/watch.ts` | Perubahan bundle memicu reload tanpa restart. |
| `control/*.mjs` | CLI build/verify/apply + uji mandiri. |
| `.github/workflows/hyper-config-release.yml` | CI: uji, bangun, tanda tangan, terbitkan aset. |

## Lokasi bundle

| Platform | Per pengguna (ditulis updater) | Per mesin (admin/MDM) |
| --- | --- | --- |
| Windows | `%LOCALAPPDATA%\HyperAI\managed` | `%ProgramData%\HyperAI\managed` |
| macOS | `~/Library/Application Support/HyperAI/managed` | `/Library/Application Support/HyperAI/managed` |
| Linux | `$XDG_CONFIG_HOME/hyperai/managed` | `/etc/hyperai/managed` |

Bila keduanya ada, versi mesin menang (dimuat belakangan). `enrollment` (token pendaftaran) diletakkan
di direktori yang sama dan **tidak** ikut ditulis updater.

## Alur rilis config

1. Salin contoh: `cp config/opencode.example.json config/opencode.json`, isi provider/model.
2. Naikkan `config/version` (harus selalu naik; anti-rollback menolak versi lama).
3. (Opsional) `config/secrets.json` hanya berisi `providers.<id>.settings.apiKey` — file ini di-gitignore.
4. Commit ke `dev` → workflow berjalan, atau jalankan manual dengan `workflow_dispatch`
   (channel, versi, rollout, min app version).
5. CI menerbitkan `bundle.json`, `bundle.json.sig`, `manifest.json` di release `config-stable`.

Lokal:

```bash
node control/build-bundle.mjs --config config/opencode.json --version 7 --channel stable
node control/verify-bundle.mjs dist/config/stable/bundle.json
```

## Rahasia

- `config/secrets.json` **tidak pernah** masuk repo.
- API key dienkripsi AES-256-GCM dengan kunci turunan HKDF-SHA256 dari `CONFIG_ENROLLMENT_TOKEN`.
- Yang ditulis ke disk adalah bundle terenkripsi; API key tidak pernah tersimpan plaintext.
- Tanpa token pendaftaran, bundle berahasia ditolak seluruhnya (bukan diterapkan sebagian).
- Batas keamanan: siapa pun yang punya token + akses file bisa mendekripsi saat runtime.
  Untuk keamanan penuh, gunakan gateway dengan token per pengguna (lihat opsi di diskusi awal).

## Rollout, rollback, kill switch

- `--rollout 10`: hanya ~10% instalasi (hash `installId:versi`) yang menerapkan; sisanya menunggu versi berikutnya.
- Rollback manual: `node control/apply.mjs --rollback --dir <managed-dir>` — memverifikasi tanda tangan bundle sebelumnya.
- Kill switch: kirim bundle baru dengan `policies` (mis. `deny provider.use`), bukan menghapus config pengguna.

## Setup kunci

```bash
node control/generate-keys.mjs
```

Simpan kunci privat sebagai secret `CONFIG_SIGNING_KEY`; salin kunci publik ke
`packages/core/src/config/managed-policy.ts`. Untuk pengujian, `HYPER_CONFIG_PUBLIC_KEY` menimpa kunci aplikasi.

## Yang sengaja ditolak dari config pusat

`plugins`, `skills`, `instructions`, `commands`, `mcp`, `experimental`, dan `providers.*.package`
di luar allowlist — semuanya jalur eksekusi kode. Config bertanda tangan pun tidak boleh menambahkannya.

## Uji

```bash
node control/selftest.mjs              # 31 cek: tanda tangan, enkripsi, allowlist, gate
node control/selftest-apply.mjs        # 14 cek: tulis atomik, rollback, tanpa plaintext
node control/selftest-pipeline.mjs     # 11 cek: build -> verify -> apply -> rollback lewat CLI
cd packages/core && bun test test/config/managed.test.ts test/config/updater.test.ts
```
