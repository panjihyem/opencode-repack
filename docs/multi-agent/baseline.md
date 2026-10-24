# Baseline multi-agent Hyper AI (pilot 0001)

## Perilaku yang sudah ada

- Core V2 menyimpan input pending dalam `session_inbox`. `queue` menunggu batas giliran idle; `steer` dapat dibaca di batas langkah aktif (`packages/core/src/session/inbox.ts`, `execution.ts`, `runner/llm.ts`). `Session.prompt` masih default ke `steer`; aksi `prompt.queue` sudah tersedia pada TUI. Belum ada queue khusus orkestrasi job domain.
- Built-in subagent `explore` dan `general` dapat berjalan sebagai child foreground/background; parent menerima notifikasi selesai. Parent default tidak otomatis membagi semua tugas. Definisi custom agent dapat menentukan model/izin; skill domain tidak otomatis membatasi tool.
- `case-ui.ts` memvalidasi parameter dan menghasilkan `parameter.redacted.json` serta `tokens.json`. `casemode.py` menutup beberapa MCP/web dan memori otomatis, **tidak** menutup provider cloud atau jaringan lewat shell.
- `rebrand/files/desktop/hyper/hindsight.ts` punya failover tersendiri untuk ekstraksi/konsolidasi memori, **bukan** fallback model agent. `router.ts` memilih router dari konfigurasi dan dapat mencari router cadangan; belum ada batas per kelas data.
- User config yang diperiksa tanpa membaca credential memuat provider IDs `cx`, `ocg`; katalog berisi GPT di `cx`, MiniMax dan MiMo di `ocg`. Ketersediaan ID bukan bukti kontrak privasi, kualitas, retensi atau tujuan upstream. LM Studio lokal tidak terpasang pada mesin ini.

## Keputusan rute yang diuji

| Kelas | Rute usulan | Fallback | Prasyarat |
|---|---|---|---|
| Publik/aman | MiniMax atau MiMo yang tersedia | Hanya model aman teruji | Izin tool, batas biaya |
| Internal/rahasia | GPT cloud yang disetujui | GPT/provider yang sama-sama disetujui | Kontrak pemrosesan, project allowlist |
| Kasus asli | GPT cloud yang disetujui per project/scope | **Fail-closed** bila rute pengganti belum disetujui | Persetujuan eksplisit, klasifikasi, minimalisasi, tanpa token map |

Nama model/provider harus ditetapkan berdasarkan katalog **dan** uji koneksi/kebijakan sebelum pilot; jangan mengunci ID dari contoh saja. Router upstream harus diverifikasi sebelum disebut penerima akhir.

## Ancaman dan gate

1. Pesan, lampiran, hasil `read`, output shell/MCP, memori, dan handoff child dapat menjadi konteks model. Gate harus berlaku sebelum konten dibaca/dikirim, bukan sekadar prompt master. Pola regex PII tidak menjamin semua identitas tersaring.
2. Tool shell berjalan dengan otoritas OS pengguna; permission path berbasis parser bukan sandbox. Untuk kasus asli, menolak shell/network yang tak dapat dibatasi dan menahan task jika tidak dapat dibuktikan aman.
3. Agent-specific permission tidak otomatis diwarisi child. Semua spesialis harus mendapat izin eksplisit; project config dapat berubah saat berjalan. Scope, provider, model, dan consent perlu diikat pada job dan dicek ulang sebelum dispatch/retry.
4. `provider.use` policy V2 membatasi provider, bukan satu model dalam provider. Pilihan model spesifik perlu gate runtime atau isolasi yang dapat diuji; jika tak tersedia, stop sensitif. Mode kasus yang dikelola pengguna tidak boleh ditimpa.
5. Saat delivery provider ambigu, tidak boleh retry payload kasus otomatis ke provider lain. Audit hanya catat ID job, kelas, provider/model ID, status, keputusan izin dan hash/versi input; jangan catat teks sumber, prompt, token, credential atau isi hasil.
6. File ownership tunggal, serialisasi state kasus, batas fan-out kecil, dan batas durasi. Queue pesan pengguna berbeda dari job background subagent. `steer` tidak boleh memperluas izin tanpa persetujuan baru.

## Pemeriksaan build sebelum rilis

`bun test rebrand/test/e2e/multi-agent-baseline.test.ts` menjaga kontrak inti di checkout. Test itu **tidak** membuktikan installer berperilaku sama. Saat pilot, uji paket desktop hasil overlay pada build rilisan, termasuk UI queue dan rute model; cek versi core karena `packages/` checkout bukan satu-satunya sumber installer. Bila probe gagal, jangan klaim otomatisasi siap pakai.
