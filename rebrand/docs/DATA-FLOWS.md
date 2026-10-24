# Hyper AI â€” inventaris aliran data

Dokumen internal untuk menopang Ketentuan Penggunaan dan Kebijakan Privasi.
Diperiksa dari overlay `rebrand/` pada 2026-10-24. Bila kode berubah, perbarui
dokumen ini dan naskah wizard.

| Aliran | Data | Tujuan | Kapan | Sumber bukti |
|---|---|---|---|---|
| Model agent (cloud) | prompt, lampiran, kutipan berkas, keluaran tool | router `https://rai.talentabangsa.com/v1`, lalu penyedia model | setiap permintaan model non-lokal | `config/opencode.json`, provider `cx`/`ocg` |
| Model lokal (cadangan) | prompt/konteks | LM Studio di komputer | bila dipilih atau router tidak tersedia | `lmstudio.ts`, `manifest.models` |
| Memori Hindsight â€” simpan | fakta/percakapan | `http://127.0.0.1:8888` (lokal) | plugin memori aktif | `manifest.hindsight`, `memory.ts` |
| Memori Hindsight â€” ekstraksi/konsolidasi | potongan percakapan | model remote lewat router (`ocg/minimax-m3.1-flash-free`, `cx/gpt-6-luna`, `ocg/mimo-v2.6-flash`) | saat memori memproses fakta | `manifest.hindsight.llm` |
| Plugin memori otomatis | prompt pengguna | Hindsight lokal | mode non-kasus | `memory.ts` |
| Pencarian web (`hyper-search`) | kueri | DuckDuckGo, Bing, Wikipedia | tool dipanggil; dimatikan mode kasus | `files/desktop/search/mcp.mjs` |
| Context7 | kueri dokumentasi | layanan Context7 | tool dipanggil; dimatikan mode kasus | `bundle.ts` (`registerContext7`), `skills.ts` |
| Docling | berkas dokumen | proses lokal; model OCR diunduh sekali dari sumber paket lalu cache lokal | saat konversi | `docling.ts` |
| Office/grafik | berkas kerja | proses lokal (Python) | saat tool dipakai | `office.ts`, `viz` |
| Unduhan setup | paket Python/LM Studio/model | PyPI, penerbit LM Studio, Hugging Face (model), GitHub (bila ada) | saat wizard memasang komponen | `components.ts`, `uv.ts`, `lmstudio.ts` |
| Config OTA | metadata + bundle bertanda tangan | `github.com/panjihyem/opencode-repack` (`config-stable`) | saat mulai + tiap 6 jam | `updater.ts` |
| Update aplikasi | metadata rilis + installer | GitHub Releases | saat cek/pasang update | `updates.ts`, `app-update.yml` |
| Log | pesan, prompt/keluaran tool yang dicatat proses | `%APPDATA%\ai.hyperai.desktop\logs`, `~/.local/share/opencode/log` (lokal) | selama aplikasi berjalan | `bundle.ts` (`log`), OpenCode |
| Persetujuan setup | versi/hash dokumen, waktu, pilihan komponen | `userData/hyper-bundle/state.json` (lokal) | saat pengguna menyetujui | `bundle.ts` (state) |

## Catatan

- Overlay Hyper AI tidak menambahkan analitik/iklan. Perilaku pihak ketiga
  (Electron, OpenCode, provider) mengikuti konfigurasi dan kebijakan masing-masing.
- Data kasus yang tidak dimasukkan ke prompt/alat tidak dikirim oleh Hyper AI.
- `hyper-case redact` hanya melindungi data yang melewati alur itu; lampiran atau
  prompt mentah tetap dapat memuat data sensitif.
- Retensi di router/penyedia model tidak diatur oleh aplikasi; jangan menjanjikan
  penghapusan yang tidak dapat dibuktikan.
- Kontak pemilik produk: **info@talentabangsa.com**.
