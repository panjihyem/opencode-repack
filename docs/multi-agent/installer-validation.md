# 0005 Windows installer and Office skill validation

Source commit `437e19fc0c5744ad4f74900ba9fccc64c6870c96`. Build in clean worktree `C:\Users\User\AppData\Local\Temp\opencode\hyper-verify-0005` (not user's active config). `bun install --frozen-lockfile --ignore-scripts`, overlay apply (0 fatal; 2 noncritical TUI title warnings), direct electron-vite desktop build (2 CSS warnings), `prepare-bundle.ts`, prebuild, and electron-builder NSIS build all exited 0. First 420s attempt timed out leaving a 223 KB incomplete EXE; second run completed successfully.

Installer: `packages/desktop/dist/hyper-ai-desktop-win-x64.exe` in build worktree, 292,265,885 bytes, SHA256 `E6E29FC7D43379CD4B86A40651CB4807E82A2BFFD94B4015676A882E6DCB90F3`. This file is not committed or published. Unpacked resources contain `bin/hyper.mjs` and `bin/graphify.mjs`; compiled `app.asar` contains managed `deck.py` and `hyper-report` skill source. No visible desktop or NSIS install into user profile has been performed.

The next Office provisioning change copies `deck.py` from package resources rather than relying only on compiled source. An isolated `applyOfficeSkills` fixture verifies generated `hyper-report/SKILL.md` points at provisioned deck, managed stale deck refreshes, and user-authored skill survives. This fixture executes source module with a resource root; it is **not** a launched installed desktop. Rebuild and inspect a package containing this change before claiming packaged runtime.

Remaining runtime gates: verify Graphify negatives on the rebuilt package and packaged Office resource/provisioning; no visible installed-app smoke. Live image generation and Composio remain off by prior decision.
