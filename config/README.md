# Config pusat (OTA)

Isi folder ini yang dirilis ke semua pengguna oleh `.github/workflows/hyper-config-release.yml`.

| Berkas | Commit? | Isi |
| --- | --- | --- |
| `opencode.json` | ya | Config non-rahasia: provider, model, agent, policy. Disalin dari `opencode.example.json`. |
| `secrets.json` | **tidak** (gitignore) | Hanya `providers.<id>.settings.apiKey`; dienkripsi CI sebelum dirilis. |
| `version` | ya | Nomor versi bundle. **Wajib naik setiap rilis** (anti-rollback menolak versi lama). |
| `opencode.example.json` | ya | Contoh bentuk config yang lolos validasi. |
| `secrets.example.json` | ya | Contoh bentuk rahasia. |

Mulai:

```bash
cp config/opencode.example.json config/opencode.json
# sunting provider/baseURL/model
echo 2 > config/version
```

Yang tidak boleh ada di `opencode.json` (ditolak CI dan aplikasi): `plugins`, `skills`,
`instructions`, `commands`, `mcp`, `experimental`, dan `providers.*.package` di luar allowlist
`packages/core/src/config/managed-policy.ts`.

Detail alur, rollback, dan rollout: `control/README.md`.
