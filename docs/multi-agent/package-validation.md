# 0004 package verification — test artifact only

Build source: `95fa65496f30916ed62472cb58ac1a6d68302151`, clean worktree at `C:\Users\User\AppData\Local\Temp\opencode\hyper-verify-0004`. Current workspace PDFs and user edits untouched.

## Rebuilt after per-command Graphify guard

Source commit `08a22a1f5b3921d65e501c95f67f23f6a3daf580`; clean worktree `C:\Users\User\AppData\Local\Temp\opencode\hyper-verify-0004-final`. `bun install --frozen-lockfile --ignore-scripts`, rebrand apply, direct electron-vite desktop build, `prepare-bundle.ts`, and `electron-builder --win --dir` exit 0. `dist/win-unpacked/resources/app.asar` SHA256 `6820E786D977B1CB27D7C3AB007846F9324487E6767A54347E0961BE5C704248`; packaged `bin/graphify.mjs` SHA256 `72DFD923795B7DD2F5ED8B5D0E466DFA048A2192E871BBA7451C207634689F53`.

From **rebuilt packaged** `bin/hyper.mjs`, synthetic graph query returned `run() --calls--> greet()` with exit 0. After `docs/notes.py` was added, packaged `query` and `path` both refused with `Documentation or case directory in Graphify project`, exit 1. Removing that test directory restored query exit 0. This replaces the older artifact below for Graphify security evidence. It still does not prove installed desktop skill registration/Office module execution, real account, NSIS, or absence of disguised sensitive code.

| Gate | Evidence |
| --- | --- |
| Overlay | `bun rebrand/apply.ts .` exit 0, 0 fatal; 2 noncritical TUI title warnings. |
| Dependencies | `bun install --frozen-lockfile --ignore-scripts` exit 0. |
| Desktop | Direct `bun node_modules/electron-vite/bin/electron-vite.js build --logLevel silent` exit 0; two CSS `::highlight` warnings. Standard Bun script shim remains unreliable on this Windows host. |
| Bundle | `bun rebrand/scripts/prepare-bundle.ts packages/desktop` exit 0; includes `bin/hyper.mjs`, `bin/graphify.mjs`, Context7, search and Office case resources. |
| Windows unpacked | `bun node_modules/electron-builder/out/cli/cli.js --win --dir --config electron-builder.config.ts` exit 0. `dist/win-unpacked/resources/app.asar`: SHA256 `933458C8DC281E42C841B7967887D2DC3157E8AB1E0769A151FA96DD46CE8CC3`. `bin/graphify.mjs`: SHA256 `5D20D4C9ED38948F724BCE5847A4871CE1D7B25AAC1071035B046B71D83FF5E4`. `app.asar` main chunk contains `hyper-report` and managed `deck.py` source. |
| Graphify packaged CLI | `node dist/win-unpacked/resources/hyper-bundle/bin/hyper.mjs graphify index <synthetic-repo>` exit 0, creates 4-node graph. `path run() greet()` and query `greet` exit 0. Removed opt-in marker, named `case.py`, `docs/notes.py` and enabled Case Secure each fail with exit 1. Hindsight service/banks untouched; graph stored under temporary data directory. |
| Deck | `deck.py` source is embedded in compiled desktop main chunk; no standalone installed script was exercised. Overlay `src/main/hyper/deck.py` run against existing Office Python creates PPTX (46,581 bytes) with PNG and editable native chart. Render via PowerPoint COM to PDF (176,826 bytes), visual review pane previewed. Synthetic source unchanged. Installed desktop skill invocation remains unverified. |

**Not proven:** an installed/started desktop's actual skill registration or Office module provisioning, all platforms, NSIS installer, live 9Router image entitlement/generation, Composio OAuth, and absence of sensitive data under disguised filenames. This is a Windows unpacked **test artifact**, not production release. Before distributing, perform installer smoke test, exact CLI/runtime compatibility check, packaged skill discovery, and a security review of scan-root policy. No new cloud permission granted. A new build is needed after Graphify's per-command guard change; existing artifact hash above belongs to the earlier commit.
