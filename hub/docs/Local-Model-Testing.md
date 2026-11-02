# Hasil Testing Model Lokal

Ringkasan hasil uji model lokal Hyper AI. Data mentah ada di `flm-results/`.

**Batas klaim:** semua angka diukur pada satu mesin (AMD Ryzen AI 7 350, Radeon 860M,
RAM 16 GB) dengan `flm.exe` mode `performance`. Angka ini bukan tolok ukur mesin lain dan
bukan janji performa untuk pengguna lain.

## 1. Throughput NPU (dari `bench_*.csv`)

Decode tok/s, mode `performance`, prompt sama di setiap tahap context:

| Model | 1K | 32K | Catatan |
| --- | --- | --- | --- |
| `lfm2.5-it-1.2b` | 43,49 | 30,07 | tercepat; prefill tinggi |
| `lfm3-1.7b` | 29,60 | 20,17 | prefill rendah (440 tok/s) |
| `qwen3:1.7b` | 28,27 | 7,47 | turun tajam di 32K |
| `qwen3.5-2b-unc` | 21,17 | 14,76 | output sering tidak valid (lihat 3) |
| `qwen3.5-2b` | 18,94 | 14,00 | terpasang sebagai default lokal |

TTFT ikut naik seiring context. Contoh `qwen3.5-2b`: 1,37 dtk di 1K; `qwen3:1.7b` 60,89 dtk
di 32K.

## 2. Uji tool calling (kolom `tool_call`)

| Model | Hasil |
| --- | --- |
| `lfm3-1.7b` | 2/2 berhasil |
| `lfm2.5-it-1.2b` | 0/2 |

Kemampuan tools tidak merata; model tercepat justru gagal memanggil tool.

## 3. Model yang gagal dimuat

| Model | Gejala |
| --- | --- |
| `gemma4-it:e2b` | `GAGAL_LOAD`, `Failed to submit command to hw queue (0xc01e0200)` |
| `qwen3:4b` | `XRT 0xc01e0200`: DMA buffer page-in gagal. RAM bebas 7,11 GB saat uji, jadi bukan masalah RAM |
| `nemotron3.5-bolt:e4b` | `GAGAL_LOAD`, 0xc01e0200 |

`0xc01e0200` berulang pada beberapa checkpoint. Ini kendala kernel/runtime, bukan ukuran
model semata.

## 4. Probe kualitas (dari `quality-*.jsonl`)

| Model | Konfigurasi | Pass |
| --- | --- | --- |
| `hauhaucs-qwen3.5-4b` | iGPU, reasoning off, set lengkap | 5/5 |
| `lfm3-1.7b` | NPU | 3/3 (tool 1/1, long 0/1) |
| `qwen3.5-2b` | NPU | 3/5 |
| `dolphin-x1-nano` | iGPU | 1/5 |

`hauhaucs` dengan reasoning dimatikan jauh lebih baik daripada dengan reasoning menyala
(0/3 pada run pertama).

## 5. Perbandingan bridge Copilot vs lokal

Tiga kasus uji: hitung bukti, tidak mengarang, tahan instruksi sisipan.

| Model | Hasil | Waktu |
| --- | --- | --- |
| `copilot-bridge/copilot` | 3/3 lulus | 5,66-26,64 dtk |
| `flm/hauhaucs-qwen3.5-4b` | 2/3 (gagal hitung bukti) | 1,05-6,80 dtk |
| `flm/qwen3.5-2b` | data campur: run 1 = 0/3 (timeout), run terkoreksi lulus 2-3 kasus | 1,09-6,30 dtk |
| `flm/lfm3-1.7b` | data campur: run 1 = 0/3, run terkoreksi 3/3 | 18,3-42,9 dtk |
| `opencode/*-free` (cloud) | 0/9 | 14-34 dtk |

**Kesimpulan yang sah:** hanya `copilot-bridge/copilot` punya hasil bersih 3/3 dalam satu
konfigurasi. Model lokal belum bisa diklaim lulus karena datanya berasal dari dua run dengan
timeout berbeda.

## 6. Tool calling bridge Copilot: gagal

Permintaan fungsi diterima tetapi tidak menghasilkan `tool_calls`. Bridge mengubah percakapan
menjadi satu prompt teks. Akibatnya model `copilot` di konfigurasi lokal **tidak** boleh
diklaim mendukung tools, walaupun ditandai `tools: true`.

## 7. Cara mengulang

```powershell
# server lokal
& "$env:USERPROFILE\flm\flm.exe" serve qwen3.5-2b --pmode performance

# benchmark per model, simpan hasil sebelum lanjut
# probe kualitas
python flm-results\quality_probe.py
# perbandingan antar model
python flm-results\compare-copilot.py
```

Aturan uji yang dipegang: satu model pada satu waktu, hasil disimpan sebelum lanjut, mulai dari
model yang sudah terpasang.
