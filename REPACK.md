# Hyper AI repack

Hyper AI is OpenCode with its own name, logo and installers. This repository
tracks upstream ([anomalyco/opencode](https://github.com/anomalyco/opencode));
the repack itself is a small layer on top that never edits upstream files in
git. It is applied to a fresh upstream checkout at build time instead.

## What lives where

| Path | Purpose |
| --- | --- |
| `rebrand/brand.ts` | Product name, CLI name, bundle id, URL scheme, release repo. Change identity here. |
| `rebrand/apply.ts` | Find/replace rules for the TUI, CLI and desktop app, plus shipped files and icons. Critical rules abort the build when upstream rewrites the text they target. |
| `rebrand/files/` | Files that replace upstream modules outright (wordmark glyphs, wordmark test). |
| `rebrand/assets/` | Logo and the generated desktop icon set (`python3 rebrand/scripts/gen-icons.py` regenerates the icons). |
| `rebrand/verify.ts` | Post-build branding check on the CLI binary and desktop installer names. |
| `rebrand/scripts/package-cli.ts` | Archives the CLI builds as `hyper-ai-<os>-<arch>` release assets. |
| `.github/workflows/repack-build.yml` | Builds Windows, Linux and macOS and publishes a release. |
| `.github/workflows/repack-sync.yml` | Detects new upstream releases (and mirrors upstream `dev`). |

## Config OTA

The signed-config feature lives in `rebrand/files/core/config/` (bundle
verification, updater, platform directories) and is wired in by the critical
rules at the end of `rebrand/apply.ts`. Those rules patch `core/src/config.ts`,
`config/discovery.ts`, `config/watch.ts`, `server/src/process.ts` and
`server/src/handlers/config.ts`; a missing anchor aborts the build rather than
shipping an app that silently ignores OTA config. `config/` in this repository
holds what `.github/workflows/hyper-config-release.yml` signs and publishes.

## Staying current with upstream

`repack-sync` runs every 6 hours. When upstream publishes a new `vX.Y.Z` tag
without a matching `hyper-vX.Y.Z` release here, it dispatches `repack-build` for
that tag. The build checks out the upstream tag directly, so there are no merges
or conflicts to resolve for a release. Hyper AI `X.Y.Z` is OpenCode `X.Y.Z`.

If upstream rewrites a line a critical rule depends on, `apply.ts` fails with a
`FATAL` line naming the rule and nothing is built. Update the rule in
`rebrand/apply.ts` and re-run `repack-build` (the `force` input overwrites an
existing release).

The same workflow also merges upstream `dev` into this repository's `dev`
branch so the source stays browsable. Upstream changes workflow files, which the
default `GITHUB_TOKEN` cannot push: add a `REPACK_PUSH_TOKEN` secret (a PAT with
`repo` and `workflow` scope) to enable it. Builds do not depend on the mirror.

## Building

Run **repack-build** from the Actions tab (empty `upstream_ref` = newest
upstream release, or pass e.g. `v2.0.32`). Every run produces:

- Windows: `hyper-ai-desktop-win-x64.exe`, `-arm64.exe` (NSIS installer)
- macOS: `hyper-ai-desktop-mac-x64` / `-arm64` as `.dmg` and `.zip`
- Linux: `hyper-ai-desktop-linux-*` as `.AppImage`, `.deb`, `.rpm` (x64, arm64)
- Standalone CLI archives `hyper-ai-<os>-<arch>` for every upstream target

Locally, against any upstream checkout:

```sh
bun rebrand/apply.ts /path/to/opencode-checkout
cd /path/to/opencode-checkout/packages/cli && bun run script/build.ts --single
bun rebrand/verify.ts packages/cli/dist/cli-linux-x64/bin/opencode
```

`apply.ts` is idempotent; running it twice is safe.

## Ready to use after install

The desktop installer ships Context7 (vendored by `rebrand/scripts/prepare-bundle.ts`)
and registers it as an MCP server on first launch, using the app's own Electron
binary as Node. A setup wizard (`rebrand/files/desktop/wizard`) then offers the
heavier local stack, each component skipped when already present:

| Component | Source | Size |
| --- | --- | --- |
| LM Studio | official installer from `installers.lmstudio.ai`, unmodified (Windows x64/arm64, macOS arm64, Linux x64/arm64) | ~0.6-1.3 GB |
| Spark X2.5 4B (Q4_K_M) | Hugging Face `XHToken/Spark-X2.5-4B-GGUF`, into `~/.lmstudio/models` | 2.6 GB |
| Hindsight memory | `hindsight-api` from PyPI into a private uv-managed Python environment (CPU wheels), started with the app on 127.0.0.1:8888 and registered as MCP `mem` | ~2 GB |

Versions and URLs are pinned in `rebrand/files/desktop/hyper/manifest.ts`.
Nothing third-party is redistributed inside the installer: everything else is
downloaded from its publisher on the user's machine. Reopen the wizard with
`--hyper-setup`; logs are in `<userData>/hyper-bundle/logs`.

## Models: remote first, local as the offline alternative

The agent and the memory server both run on a **remote** model by default:

- The agent uses the MiniMax model that ships with OpenCode
  (`opencode/minimax-m3.1-flash-free`), set as the default model in the user's
  OpenCode config.
- The memory server (Hindsight) uses the same MiniMax model through the router
  the user already configured for OpenCode (`rebrand/files/desktop/hyper/router.ts`
  reads its `baseURL` and credential from `opencode.json`). The chain is
  `ocg/minimax-m3.1-flash-free` first, then `cx/gpt-6-luna` as failover; the
  consolidation chain gets the same failover member. Hyper AI stores no
  credential of its own — the router's is read at start time.

The local model (LM Studio) is an **offline alternative only**: it is not
offered as recommended in the wizard, and its server starts only when no
router credential is configured or the user turns the offline mode on. The
memory server never falls back to it while the router is reachable.


Tests: `cd rebrand && bun test` (unit), and
`rebrand/test/e2e/wizard.e2e.cjs` drives the real wizard in Electron (needs a
display, for example `xvfb-run`, and network).

Not included: LM Studio and OpenWork rebrands (patching proprietary binaries is
not redistributable), Engram (631 MB of dependencies), and the V2 Hindsight and
Engram plugin ports, which exist only in the private backup.

## Behaviour changes beyond naming

- The official update channel is never queried: the updater policy defaults to
  `disable` and manual checks/installs point to this repository's releases.
- Deep links use `hyper-ai://` and the bundle id is `ai.hyperai.desktop`, so the
  repack installs next to the official OpenCode app.
- The CLI still reads and writes OpenCode's config and data directories, so
  existing OpenCode profiles keep working.

## Signing

Builds are unsigned unless secrets are present. Windows: `AZURE_CLIENT_ID`,
`AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`, `AZURE_TRUSTED_SIGNING_*`. macOS:
`APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_API_KEY`,
`APPLE_API_KEY_ID`/`APPLE_API_ISSUER`, `APPLE_API_KEY_PATH`. Unsigned macOS
builds need right-click, Open on first launch.
