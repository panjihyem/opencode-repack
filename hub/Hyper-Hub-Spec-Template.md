# Spec: <topik>

| Zona data | regular |
|-----------|---------|
| Status | draft |

## Tujuan

<hasil yang ingin dicapai, satu paragraf>

## Lingkup

- <yang dikerjakan>

## Di luar lingkup

- <yang sengaja tidak dikerjakan>

## Jalur kegagalan

- <kegagalan dan perilaku aman>

## Kriteria penerimaan

- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Hyper-Hub-SpecCheck.ps1 -Spec <berkas ini>`

## Batas egress

Wajib untuk zona `case`: tulis daftar tujuan keluar yang dilarang dan model yang diizinkan.

## Gate manusia

| human_gate_id | status | blocks_hats | keterangan |
|---------------|--------|-------------|------------|
| HG-AUDIT-R1 | pending | 30 | Review manusia sebelum implementasi |
