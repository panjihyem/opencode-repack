<p align="center">
  <img src="rebrand/assets/icons/icon.png" alt="Hyper AI" width="120" />
</p>

<h1 align="center">Hyper AI</h1>

<p align="center">OpenCode, repacked as <strong>Hyper AI</strong>: branded desktop installers for Windows, macOS and Linux, with signed configuration updates.</p>

<p align="center">
  <a href="https://github.com/panjihyem/opencode-repack/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/panjihyem/opencode-repack?style=flat-square" /></a>
  <a href="https://github.com/panjihyem/opencode-repack/actions/workflows/repack-build.yml"><img alt="Build" src="https://img.shields.io/github/actions/workflow/status/panjihyem/opencode-repack/repack-build.yml?style=flat-square" /></a>
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/github/license/panjihyem/opencode-repack?style=flat-square" /></a>
</p>

---

## What this is

Hyper AI is a **repack** of [OpenCode](https://github.com/anomalyco/opencode): the upstream source is
checked out unchanged at build time, then a small overlay adds the product name, logo, installers
and the pieces Hyper AI ships on top. Hyper AI `X.Y.Z` is built from upstream `vX.Y.Z`.

What the overlay adds:

- **Desktop installers** for Windows, macOS and Linux (x64 and arm64), plus standalone CLI archives.
- **Auto-update** that points at this repository's releases, not the upstream channel.
- **Config OTA**: LLM providers, model list and credentials can be updated from a signed bundle
  without reinstalling the app. Bundles are Ed25519-signed, API keys are encrypted with
  AES-256-GCM, and a bundle that fails verification is ignored as a whole.
- **Ready-to-use extras**: Context7 is vendored and registered as an MCP server on first launch; a
  first-run wizard can install the optional local stack (LM Studio, a small local model, Hindsight
  memory). Nothing third-party is redistributed inside the installer; components are downloaded
  from their publishers.
- **Setup intro and consent**: before any component is downloaded, the wizard explains what runs
  locally and what is sent to cloud models, and requires accepting the bundled Terms, Privacy Policy
  and third-party licences. Declining or closing records no consent and starts no setup.
- **Case handling**: `hyper-case` provides local redaction/tokenisation, a screen step, restore for
  local rendering, and a case mode that denies web/Context7 integrations and disables automatic
  memory while keeping cloud providers and local analysis tools available. This is explicit
  per-case protection, not automatic anonymisation of every prompt.

Details, caveats and the full component list: [`REPACK.md`](REPACK.md). Security contact:
`info@talentabangsa.com`.

## Panduan Hyper AI

- [Paparan fitur (PDF)](docs/Hyper-AI-Features.pdf): ringkasan kemampuan, batasan, dan contoh penggunaan.
- [Panduan pengguna (PDF)](docs/Panduan-Pengguna-Hyper-AI.pdf): tutorial dari setup, project/session, prompting, knowledge, dokumen, Excel, template kasus, Hyper Case Secure, hingga koordinasi multi-agent.
- [Sumber panduan pengguna (Markdown)](docs/Panduan-Pengguna-Hyper-AI.md): teks yang dapat diperbarui; PDF dibangun dari sumber ini dengan `docs/build_user_manual_pdf.py` menggunakan Python + ReportLab pada Windows.

Multi-agent orchestration dengan routing sensitif masih **belum dirilis**. Gunakan alur subagent hanya untuk data publik/sintetis; jangan kirim kasus asli atau data rahasia ke model/provider cloud. Case Secure menghentikan beberapa integrasi dan memory, tetapi tidak memblokir provider model atau jaringan dari `shell`. Lihat status dan batas keamanan di [panduan](docs/Panduan-Pengguna-Hyper-AI.md#13-orkestrasi-agen-dan-subagent).

Untuk data sensitif, periksa model dan tool yang aktif sebelum memasukkan materi: pemrosesan file lokal atau redaksi kasus tidak otomatis mencegah prompt/konteks dikirim ke provider cloud.

## Install

Download from the [latest release](https://github.com/panjihyem/opencode-repack/releases/latest):

| Platform | Architecture | Asset |
| --- | --- | --- |
| Windows | x64 | `hyper-ai-desktop-win-x64.exe` |
| Windows | arm64 | `hyper-ai-desktop-win-arm64.exe` |
| macOS | Apple Silicon | `hyper-ai-desktop-mac-arm64.dmg` |
| macOS | Intel | `hyper-ai-desktop-mac-x64.dmg` |
| Linux | x64 | `hyper-ai-desktop-linux-x86_64.AppImage` / `.deb` / `.rpm` |
| Linux | arm64 | `hyper-ai-desktop-linux-arm64.AppImage` / `.deb` / `.rpm` |

Standalone CLI (no desktop app): `hyper-ai-windows-<arch>.zip`, `hyper-ai-darwin-<arch>.tar.gz`,
`hyper-ai-linux-<arch>.tar.gz` (musl variants included).

Builds are unsigned unless release signing secrets are configured. Unsigned macOS builds need
right-click → **Open** on first launch; Windows may show a SmartScreen prompt.

## Configuration updates (OTA)

The app checks GitHub Releases for a signed bundle on the `stable`, `beta` or `canary` channel and
loads it **above** the user's own config, so a centrally managed provider or model wins. The bundle
cannot introduce code: `plugins`, `skills`, `instructions`, `commands`, `mcp`, `formatter`, `lsp`,
`experimental`, and provider packages outside the allowlist are rejected even when correctly signed.

Encrypted credentials require an **enrollment token** provisioned by the administrator, stored next
to the bundle and never written by the updater:

| Platform | Managed directory |
| --- | --- |
| Windows | `%LOCALAPPDATA%\HyperAI\managed` |
| macOS | `~/Library/Application Support/HyperAI/managed` |
| Linux | `$XDG_CONFIG_HOME/hyperai/managed` (default `~/.config/hyperai/managed`) |

Without the token, a bundle that carries secrets is rejected entirely; a bundle without secrets
(config only) still applies. Releases are staged with a rollout percentage, and a machine can be
returned to its previous bundle with `node control/apply.mjs --rollback --dir <managed dir>` (the
previous bundle is kept and re-verified). Publishing flow, signing keys and the CLI live in
[`control/README.md`](control/README.md) and [`config/README.md`](config/README.md).

## Repository layout

| Path | Purpose |
| --- | --- |
| `rebrand/` | Everything this repack owns: identity, find/replace rules, shipped files, icons, verification. |
| `config/` | Central config (providers, models) signed and published by CI. |
| `control/` | Build, verify, apply and self-test the signed config bundles. |
| `.github/workflows/repack-build.yml` | Builds the installers for all platforms and publishes a release. |
| `.github/workflows/hyper-config-release.yml` | Signs and publishes the config bundle. |
| `packages/` | Upstream source mirror, kept browsable and used for local tests. **Not** what the installer is built from. |

## Build

Installers are built by CI, not locally:

1. run **repack-build** from the Actions tab (empty `upstream_ref` = newest upstream tag), or
   `repack-sync` dispatches it when upstream publishes a new release;
2. optionally run **hyper-config-release** to publish a new signed config bundle.

Against a local upstream checkout:

```sh
git clone https://github.com/anomalyco/opencode /tmp/opencode
git checkout v2.1.4   # inside the clone
bun rebrand/apply.ts /tmp/opencode
cd /tmp/opencode/packages/cli && bun run script/build.ts --single
bun rebrand/verify.ts packages/cli/dist/cli-linux-x64/bin/opencode
```

`rebrand/apply.ts` is idempotent. Rules marked critical abort the build when upstream rewrites the
text they target, so a release never silently loses a feature.

Tests: `cd rebrand && bun test`; config OTA: `node control/selftest.mjs`,
`node --import ./control/ts-resolve-register.mjs control/selftest-apply.mjs`,
`node control/selftest-pipeline.mjs`.

## Upstream, license and attribution

Hyper AI is built on [OpenCode](https://github.com/anomalyco/opencode), licensed under the MIT
License; see [`LICENSE`](LICENSE). Upstream documentation and translated README files
(`README.<locale>.md`) are inherited unchanged. Hyper AI is an independent repack and is not
affiliated with or endorsed by Anomaly Innovations or the OpenCode maintainers. Model providers
(including any gateway configured through OTA) are used under their own terms.
