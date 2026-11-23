# Analisis komparabilitas benchmark lokal - 23 November 2026

Dibuat oleh `Hyper-Hub-Rerun.ps1` (N-07). **Tidak ada model yang dijalankan ulang** dan tidak
ada angka baru. Tujuan berkas ini: memisahkan hasil yang boleh dibandingkan dari yang tidak.

## Hasil pemindaian 19 CSV

| Skema | Berkas | Keterangan |
| --- | --- | --- |
| `bench-agg` | 5 | agregat per panjang konteks (ttft/prefill/decode avg+std+min+max) |
| `compare` | 6 | perbandingan antar model dengan `load_ok`/`tool_call_ok` |
| `bench-v2` | 2 | per-context dengan `iterations` dan `tool_call` |
| `bench-v1` | 2 | per-context dengan `iterations`, tanpa `tool_call` |
| `bench-functional` | 1 | per-context dengan `functional_status` |
| `load-failed` | 2 | model gagal dimuat (XRT `0xc01e0200`) |
| `test-failed` | 1 | tes gagal, tanpa metrik |

**14 grup komparabel, 5 tidak.**

## Yang tidak komparabel dan alasannya

| Berkas | Alasan |
| --- | --- |
| `gemma4-it-e2b-NPU2.csv` | gagal load (`Failed to submit command to hw queue`) |
| `nemotron-e4b-NPU2.csv` | gagal load |
| `qwen3-4b-NPU2.csv` | tes gagal (`XRT 0xc01e0200`, DMA page-in) |
| `lfm2.5-it-1.2b-NPU2.csv` | `tool_call` 0/2: klaim tool calling tidak terpenuhi |
| `unc-2b-NPU2.csv` | `functional_status=INVALID_OUTPUT`: angka kecepatan tidak bermakna |

## Batas jujur

Backlog N-07 meminta "ulangi perbandingan dengan timeout seragam". Itu butuh menjalankan
ulang model dengan parameter identik. Itu **tidak dilakukan** karena:

1. Runtime yang tersedia sekarang adalah LM Studio (loopback 1234), bukan server FLM yang
   dipakai artefak lama (`flm-results` memakai jalur NPU2/iGPU melalui FLM).
2. Menjalankan benchmark NPU2 butuh runtime FLM yang sudah tidak terpasang.
3. Menjalankan model di LM Studio pengguna akan memakai sumber daya mesin tanpa izin eksplisit
   dan menghasilkan angka yang tidak sebanding dengan artefak lama (runtime berbeda).

Kesimpulan: N-07 **tidak ditandai selesai**. Yang selesai adalah bagian yang aman dan
objektif — klasifikasi komparabilitas — dan daftar ulang eksplisit di atas.

## Cara mengulang nanti

Saat FLM terpasang kembali:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub-Rerun.ps1
```

Skrip yang sama akan memberi tahu grup mana yang sudah seragam. Jalankan benchmark baru
dengan `iterations >= 2`, `tool_call` lengkap, dan `functional_status=OK` agar masuk
kategori komparabel.
