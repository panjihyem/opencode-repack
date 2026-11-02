# Remote Pairing dan Whitelist

Cara pengguna Hyper AI menautkan kanal remote dan menentukan siapa yang boleh bicara ke agen.

| Zona data | regular |

## Tujuan

Satu alur yang bisa diikuti pengguna untuk menautkan Telegram dan WhatsApp ke Hyper AI, dengan allowlist wajib dan rahasia tidak pernah lewat argumen perintah.

## Lingkup

- Perintah `Hyper-Hub.ps1 remote`: `channels`, `status`, `allow`, `setup`, `pair`, `unpair`, `clear`.
- Penulisan `%LOCALAPPDATA%\HyperHub\remote-<kanal>\.env` dengan ACL hanya pemilik.
- Bridge WhatsApp (`opencode-chat-bridge`) dan bridge Telegram (`grinev/opencode-telegram-bot`).

## Di luar lingkup

- Membuat bot Telegram di @BotFather atau memindai QR atas nama pengguna.
- Kanal `whatsapp` pada perintah `remote` (masih `planned`; lihat Batasan).
- WAHA, WhatsApp Business API, dan grup WhatsApp.

## Jalur kegagalan

| Kondisi | Perilaku |
|---|---|
| Allowlist kosong | Tolak semua pesan, termasuk dari akun sendiri |
| `-OwnerId` kosong atau bukan angka saat `setup` | Gagal sebelum `.env` ditulis |
| Input bukan terminal saat `setup` | Gagal dengan pesan agar dijalankan di jendela interaktif |
| `pair` tanpa allowlist | Gagal dengan instruksi menjalankan `allow` |
| Bridge tidak melapor dalam 45 detik | Gagal; QR tidak dibuat |
| ACL `.env` gagal dikunci | Gagal keras |

## Kriteria penerimaan

1. `remote -Sub allow -Channel telegram -OwnerId 123456789` menulis allowlist dan mengembalikan `allowed` berisi ID tersebut.
2. `remote -Sub setup -Channel telegram` tanpa `-OwnerId` gagal dengan pesan `OwnerId wajib diisi`.
3. Nomor `081234567890` dinormalisasi menjadi `6281234567890`.
4. `tests/allowlist-gate.check.ts` lulus seluruh kasus.
5. `Hyper-Hub.ps1 self-check`, `Hyper-Hub-ContractCheck.ps1`, `Hyper-Hub-SelfCheck.ps1` keluar dengan kode 0.
6. `icacls` pada `.env` hanya menampilkan pemilik.

## Langkah pengguna

### Telegram

1. Bot dari @BotFather; ID dari @userinfobot.
2. `remote -Sub allow -Channel telegram -OwnerId <id>`
3. `remote -Sub setup -Channel telegram -OwnerId <id> -ModelProvider <p> -ModelId <m>` (prompt tersembunyi, jendela interaktif)
4. `remote -Sub status -Channel telegram` harus `configured:true`
5. Jalankan `node dist\index.js` di `%LOCALAPPDATA%\HyperHub\remote-telegram`

### WhatsApp

1. `remote -Sub allow -Channel whatsapp -OwnerId 081234567890`
2. `remote -Sub pair -Channel whatsapp`
3. Bila `paired:false`, buka `qr.txt` dan pindai di WhatsApp > Perangkat Tertaut
4. `remote -Sub status -Channel whatsapp`
5. Putuskan dengan `remote -Sub unpair -Channel whatsapp`

## Tabel perintah

| Perintah | Arti |
|---|---|
| `remote -Sub channels` | Daftar kanal dan status |
| `remote -Sub status -Channel <kanal>` | Terpasang, terkonfigurasi, allowlist, model |
| `remote -Sub allow -Channel <kanal>` | Tampilkan allowlist |
| `remote -Sub allow -Channel <kanal> -OwnerId <id>` | Tambah allowlist |
| `remote -Sub setup -Channel telegram -OwnerId <id> -ModelProvider <p> -ModelId <m>` | Simpan token lewat prompt tersembunyi |
| `remote -Sub pair -Channel whatsapp [-Reset]` | Pairing QR WhatsApp |
| `remote -Sub unpair -Channel whatsapp` | Hapus sesi tertaut |
| `remote -Sub clear -Channel <kanal>` | Kosongkan rahasia |

## Batasan yang diketahui

- `Hyper-Hub.ps1` masih menolak kanal `whatsapp`; pairing dijalankan langsung dari folder bridge sampai `Get-RemoteChannels` mengaktifkannya.
- Bridge Telegram (`grinev`) hanya mengenal satu ID pemilik (`TELEGRAM_ALLOWED_USER_ID`); perintah `allow` menulis ID pertama ke sana dan seluruh daftar ke `TELEGRAM_ALLOWED_USERS`.
- Bridge WhatsApp memakai OpenCode ACP; mode sesi hanya `build` atau `plan`. `plan` terbukti read-only pada uji lokal.

## Gate manusia

| Gate | Status | Cakupan | Catatan |
|---|---|---|---|
| HG-AUDIT-R1 | pending | 30 | Review owner sebelum dipakai sebagai dasar implementasi |
