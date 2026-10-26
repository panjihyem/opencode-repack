# Panduan status dan batas multi-agent

## Status 26 Oktober 2026

Pilot multi-agent dengan routing runtime belum dirilis. Scope yang disetujui hanya public/synthetic. Jangan kirim kasus asli, data internal/rahasia, attachment sensitif, atau token map melalui fitur ini. Persetujuan pengguna saja bukan isolasi transport; dukungan data sensitif memerlukan increment keamanan tersendiri.

Case Secure menonaktifkan memory terkelola dan sebagian integrasi web, tetapi tidak memblokir model cloud atau akses jaringan dari `shell`. Jangan sebut ini sebagai isolasi atau bukti consent enforcement.

`agent-policy.ts`, `agent-gate.ts`, `agent-fallback.ts`, dan `agent-orchestrator.ts` saat ini adalah helper dengan tes terisolasi; bukan dispatcher runtime. Fitur master, antrean job domain, status child-job, pilot provider, dan laporan biaya/keamanan belum tersedia. Inbox inti tetap memiliki semantik `queue`/`steer` tersendiri.

## Prosedur uji aman yang tersedia

1. Buat fixture sintetis tanpa identitas, credential, atau data produksi; synthetic fixture untuk tes bukan izin runtime-class selain public.
2. Jalankan policy, path preflight, fallback, scheduler, dan transport probe sesuai tes yang tersedia.
3. Perlakukan tes helper dan fake transport sebagai bukti lokal saja; bukan bukti installer atau rute provider upstream.
4. Hentikan uji saat tujuan model/provider berubah, consent tidak tersedia, atau delivery ambigu. Jangan retry payload sensitif.
5. Review output dan distribusi secara manual. Restore token map hanya lokal dengan persetujuan manusia.

Pilot public-only belum boleh dibuka: preflight belum terhubung ke entrypoint runtime, fake-provider pilot belum dibuat, dan installer overlay belum memaketkan helper. Inbox `queue`/`steer` lulus 31 tes Playwright headless; status queued/active/finished/failed untuk master/child-job belum tersedia, dan inbox queue UI tidak menggantikannya.
