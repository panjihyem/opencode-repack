# Hyper AI Hub - Changelog

Catatan perubahan lapisan **Hub** (kontrol lokal Hyper AI). Ini bukan changelog aplikasi
Hyper AI; rilis aplikasi dicatat di `CHANGELOG.md` root dan mengikuti upstream.

Format: `## <tanggal> - <ringkas>` lalu bagian `Tambah / Ubah / Perbaiki / Gate`.

## 2026-11-02 - remote channel, allowlist wajib, pairing WhatsApp

### Tambah

- Perintah `remote` menggantikan `telegram`: `channels`, `status`, `setup`, `allow`, `pair`,
  `unpair`, `clear`. Kanal dipilih lewat `-Channel`; `telegram` = `implemented`,
  `whatsapp` = `planned`.
- `remote -Sub allow` untuk mengelola allowlist tanpa membuka `.env`. Nomor WhatsApp
  dinormalisasi (`08xx`, `+62 8xx` -> `628xx`).
- `remote -Sub pair` menjalankan bridge WhatsApp, menunggu `status.json`/`qr.txt`, dan
  mengembalikan `paired:true` + nomor atau `paired:false` + path QR.
- `remote -Sub unpair` menghapus sesi tertaut dan menghentikan proses bridge.
- `Write-DotEnv` mengunci `.env` dengan `icacls /inheritance:r /grant:r` (sebelumnya
  `Set-Acl` + `SetAccessRuleProtection`).
- Bridge WhatsApp menulis `status.json` dan `qr.txt`; perintah `/pair` di chat.
- Dokumen `docs/Remote-Pairing.md`, `docs/Upgrade-Ledger.md`, `docs/Pending-Tasks.md`,
  `docs/Local-Model-Testing.md`, `hub/SETUP.md`.

### Ubah

- `defaultAgent` di `chat-bridge.json` diteruskan ke ACP lewat
  `session/set_config_option` (kategori `mode`). Hyper AI 2.1.10 tidak punya `modes` di
  `session/new` dan mengabaikan `params.agent`.
- Kanal `remote` boleh dipanggil tanpa state (`init`): katalog kanal bersifat statis.

### Perbaiki

- Allowlist fail-closed: allowlist kosong menolak semua pesan, termasuk pesan dari akun
  yang tertaut sendiri. Sebelumnya `isUserAllowed` mengembalikan `true` bila allowlist kosong.
- `setup` mewajibkan `-OwnerId` sebelum token diminta dan menulis nilainya ke
  `TELEGRAM_ALLOWED_USER_ID` serta `TELEGRAM_ALLOWED_USERS`.
- `remote -Sub channels` sebelumnya gagal dengan `Hub not initialized`.

### Gate

`self-check`, `SelfCheck`, `ContractCheck`, `SpecCheck -SelfCheck`,
`VersionCheck -SelfCheck`: exit 0. `tsc --noEmit` dan `bun build` bridge WhatsApp: exit 0.
`tests/allowlist-gate.check.ts`: 12/12 PASS.
