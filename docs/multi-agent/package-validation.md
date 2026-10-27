# 0004 package verification — test artifact only

Build source: `95fa65496f30916ed62472cb58ac1a6d68302151`, clean worktree at `C:\Users\User\AppData\Local\Temp\opencode\hyper-verify-0004`. Current workspace PDFs and user edits untouched.

| Gate | Evidence |
| --- | --- |
| Overlay | `bun rebrand/apply.ts .` exit 0, 0 fatal; 2 noncritical TUI title warnings. |
| Dependencies | `bun install --frozen-lockfile --ignore-scripts` exit 0. |
| Desktop | Direct `bun node_modules/electron-vite/bin/electron-vite.js build --logLevel silent` exit 0; two CSS `::highlight` warnings. Standard Bun script shim remains unreliable on this Windows host. |
| Bundle | `bun rebrand/scripts/prepare-bundle.ts packages/desktop` exit 0; includes `bin/hyper.mjs`, `bin/graphify.mjs`, Context7, search and Office case resources. |
| Windows unpacked | `bun node_modules/electron-builder/out/cli/cli.js --win --dir --config electron-builder.config.ts` exit 0. `dist/win-unpacked/resources/app.asar`: SHA256 `933458C8DC281E42C841B7967887D2DC3157E8AB1E0769A151FA96DD46CE8CC3`. `bin/graphify.mjs`: SHA256 `5D20D4C9ED38948F724BCE5847A4871CE1D7B25AAC1071035B046B71D83FF5E4`. `app.asar` main chunk contains `hyper-report` and managed `deck.py` source. |
| Graphify packaged CLI | `node dist/win-unpacked/resources/hyper-bundle/bin/hyper.mjs graphify index <synthetic-repo>` exit 0, creates 4-node graph. `path run() greet()` and query `greet` exit 0. Removed opt-in marker, named `case.py` and enabled Case Secure each fail with exit 1. Hindsight service/banks untouched; graph stored under temporary data directory. |
| Deck | Overlay `src/main/hyper/deck.py` run against installed Office Python creates PPTX (46,581 bytes) with PNG and editable native chart. Render via PowerPoint COM to PDF (176,826 bytes), visual review pane previewed. Synthetic source unchanged. |

**Not proven:** an installed/started desktop's actual skill registration, all platforms, NSIS installer, live 9Router image entitlement/generation, Composio OAuth, and absence of sensitive data under disguised filenames. This is a Windows unpacked **test artifact**, not production release. Before distributing, perform installer smoke test, exact CLI/runtime compatibility check, packaged skill discovery, and a security review of scan-root policy. No new cloud permission granted.
