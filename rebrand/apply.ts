// Hyper AI rebrand pass.
//
// Runs against a fresh upstream OpenCode checkout *before* it is built, so the
// repack never carries a long-lived patch set that could conflict with
// upstream. The pass is idempotent and tolerant of upstream churn:
//
//   applied  upstream text found and replaced
//   already  rebranded text already in place (a previous run)
//   missing  neither text present - upstream rewrote the line
//
// A missing *critical* rule aborts the pass before anything is written, so a
// half-rebranded tree is never built. Non-critical misses only warn; the built
// artifacts are checked separately by verify.ts.
//
// usage: bun rebrand/apply.ts <source-root>

import { cp } from "node:fs/promises"
import path from "node:path"
import { brand } from "./brand"

const root = process.argv[2]
if (!root) {
  console.error("usage: bun apply.ts <source-root>")
  process.exit(2)
}

const NAME = brand.name
const CLI = brand.cli

type Rule = {
  file: string
  find: string
  replace: string
  /** minimum number of occurrences required (default 1) */
  min?: number
  /** abort the pass when the upstream text can no longer be found */
  critical?: boolean
}

const rules: Rule[] = [
  {
    file: "packages/desktop/src/preload/index.ts",
    find: "  getPathForFile: (file: File) => webUtils.getPathForFile(file),",
    replace: '  getPathForFile: (file: File) => webUtils.getPathForFile(file),\n  caseSecure: () => ipcRenderer.invoke("hyper:case:open"),',
    critical: true,
  },
  {
    file: "packages/desktop/src/renderer/api.ts",
    find: "  getPathForFile: (file) => window.electron.getPathForFile(file),",
    replace: '  getPathForFile: (file) => window.electron.getPathForFile(file),\n  caseSecure: () => window.electron.caseSecure(),',
    critical: true,
  },
  {
    file: "packages/desktop/src/renderer/api-types.ts",
    find: "  getPathForFile(file: File): string",
    replace: '  getPathForFile(file: File): string\n  caseSecure(): void',
    critical: true,
  },
  {
    file: "packages/gui-extensions/src/sdk/host-apis.ts",
    find: "export interface Desktop {\n  /** The operating system. */",
    replace: "export interface Desktop {\n  /** Opens the local Hyper Case Secure assistant. */\n  caseSecure(): void\n  /** The operating system. */",
    critical: true,
  },
  {
    file: "packages/desktop/src/renderer/platform/index.ts",
    find: "    runDesktopMenuAction: createDesktopMenuAction(api),",
    replace: "    runDesktopMenuAction: createDesktopMenuAction(api),\n    caseSecure: () => api.caseSecure(),",
    critical: true,
  },
  {
    file: "packages/app/src/runtime/platform/platform.tsx",
    find: "        platform: \"desktop\"\n        os?: DesktopOS",
    replace: "        platform: \"desktop\"\n        caseSecure?(): void\n        os?: DesktopOS",
    critical: true,
  },
  {
    file: "packages/app/src/shell/titlebar/titlebar.tsx",
    find: 'import { TitlebarItem } from "@opencode/gui-extensions/sdk"',
    replace: 'import { TitlebarItem } from "@opencode/gui-extensions/sdk"\nimport { Icon } from "@opencode/ui/icon"',
    critical: true,
  },
  {
    file: "packages/app/src/shell/titlebar/titlebar.tsx",
    find: "                    <TitlebarItems items={titlebarItems} />",
    replace: `                    <Show when={platform.platform === "desktop"}>
                      <button
                        type="button"
                        class="me-2 inline-flex h-7 items-center gap-1 rounded-full border border-v2-border-border-muted px-2 text-xs text-v2-text-text-base hover:bg-v2-background-bg-layer-02 focus-visible:outline-none"
                        aria-label="Mulai Kasus Sensitif"
                        title="Mulai Kasus Sensitif"
                        onClick={() => platform.caseSecure?.()}
                      >
                        <Icon name="lock" class="size-3.5" />
                        <span>Kasus Secure</span>
                      </button>
                    </Show>
                    <TitlebarItems items={titlebarItems} />`,
    critical: true,
  },
  // ---- TUI: terminal title / dialogs -------------------------------------
  {
    file: "packages/tui/src/attention.ts",
    find: 'const DEFAULT_TITLE = "OpenCode"',
    replace: `const DEFAULT_TITLE = "${NAME}"`,
  },
  {
    file: "packages/tui/src/app.tsx",
    find: 'setTerminalTitle(renderer, "OpenCode")',
    replace: `setTerminalTitle(renderer, "${NAME}")`,
    min: 2,
  },
  { file: "packages/tui/src/app.tsx", find: 'title: "Update OpenCode"', replace: `title: "Update ${NAME}"` },
  {
    file: "packages/tui/src/mini/runtime.lifecycle.ts",
    find: 'setTerminalTitle(renderer, "OpenCode")',
    replace: `setTerminalTitle(renderer, "${NAME}")`,
  },
  {
    file: "packages/tui/src/mini/footer.permission.tsx",
    find: "Tell OpenCode what to do differently",
    replace: `Tell ${NAME} what to do differently`,
    min: 2,
  },
  {
    file: "packages/tui/src/mini/footer.prompt.tsx",
    find: 'description: "close OpenCode"',
    replace: `description: "close ${NAME}"`,
  },
  {
    file: "packages/tui/src/routes/session/permission.tsx",
    find: "Tell OpenCode what to do differently",
    replace: `Tell ${NAME} what to do differently`,
  },
  { file: "packages/tui/src/component/terminal-pane.tsx", find: "restart OpenCode", replace: `restart ${NAME}` },
  {
    file: "packages/tui/src/mini/splash.ts",
    find: "opencode mini -s ${meta.session_id}",
    replace: `${CLI} mini -s \${meta.session_id}`,
    critical: true,
  },

  // ---- TUI: crash screen -------------------------------------------------
  { file: "packages/tui/src/component/error-component.tsx", find: "OpenCode crashed", replace: `${NAME} crashed` },
  {
    file: "packages/tui/src/component/error-component.tsx",
    find: "OpenCode {app.version}",
    replace: `${NAME} {app.version}`,
  },
  {
    file: "packages/tui/src/component/error-component.tsx",
    find: "the OpenCode crash screen",
    replace: `the ${NAME} crash screen`,
  },
  {
    file: "packages/tui/src/component/error-component.tsx",
    find: "The OpenCode TUI crashed",
    replace: `The ${NAME} TUI crashed`,
  },

  // ---- TUI: update dialog ------------------------------------------------
  { file: "packages/tui/src/component/dialog-update.tsx", find: "restart OpenCode.", replace: `restart ${NAME}.` },
  { file: "packages/tui/src/component/dialog-update.tsx", find: "Installing OpenCode", replace: `Installing ${NAME}` },
  {
    file: "packages/tui/src/component/dialog-update.tsx",
    find: "OpenCode is already up to date.",
    replace: `${NAME} is already up to date.`,
  },

  // ---- CLI: help / usage -------------------------------------------------
  {
    file: "packages/cli/src/commands/commands.ts",
    find: `OPENCODE_CLI_NAME : "opencode"`,
    replace: `OPENCODE_CLI_NAME : "${CLI}"`,
    critical: true,
  },
  {
    file: "packages/cli/src/commands/commands.ts",
    find: '"OpenCode command line interface"',
    replace: `"${NAME} command line interface"`,
    critical: true,
  },
  {
    file: "packages/cli/src/commands/commands.ts",
    find: '"Directory to start OpenCode in"',
    replace: `"Directory to start ${NAME} in"`,
  },
  {
    file: "packages/cli/src/commands/commands.ts",
    find: '"Upgrade OpenCode to the latest or a specific version"',
    replace: `"Upgrade ${NAME} to the latest or a specific version"`,
  },
  {
    file: "packages/cli/src/commands/commands.ts",
    find: '"Uninstall OpenCode, keeping session data, configuration, and state"',
    replace: `"Uninstall ${NAME}, keeping session data, configuration, and state"`,
  },
  {
    file: "packages/cli/src/commands/commands.ts",
    find: '"Run OpenCode with a message"',
    replace: `"Run ${NAME} with a message"`,
  },

  // ---- CLI: handlers / services -----------------------------------------
  {
    file: "packages/cli/src/acp/service.ts",
    find: 'command: "opencode", args: ["auth", "login"], label: "OpenCode Login"',
    replace: `command: "${CLI}", args: ["auth", "login"], label: "${NAME} Login"`,
  },
  {
    file: "packages/cli/src/acp/service.ts",
    find: 'name: "OpenCode", version: OPENCODE_VERSION',
    replace: `name: "${NAME}", version: OPENCODE_VERSION`,
  },
  { file: "packages/cli/src/acp/translate.ts", find: '"OpenCode prompt failed"', replace: `"${NAME} prompt failed"` },
  {
    file: "packages/cli/src/acp/error.ts",
    find: '"OpenCode server is unavailable"',
    replace: `"${NAME} server is unavailable"`,
  },
  {
    file: "packages/cli/src/commands/handlers/pair.ts",
    find: "expose your OpenCode server",
    replace: `expose your ${NAME} server`,
  },
  { file: "packages/tui/src/component/dialog-update.tsx", find: '"Updating OpenCode"', replace: `"Updating ${NAME}"` },
  {
    file: "packages/cli/src/commands/handlers/default.ts",
    find: "OpenCode update could not start the new background service",
    replace: `${NAME} update could not start the new background service`,
  },
  { file: "packages/cli/src/services/update-preflight.tsx", find: '"Loading OpenCode"', replace: `"Loading ${NAME}"` },
  {
    file: "packages/cli/src/services/update-preflight.tsx",
    find: '["OpenCode", colors.muted, true]',
    replace: `["${NAME}", colors.muted, true]`,
    min: 1,
  },
  {
    file: "packages/cli/src/commands/handlers/uninstall.ts",
    find: 'intro("Uninstall OpenCode")',
    replace: `intro("Uninstall ${NAME}")`,
  },
  {
    file: "packages/cli/src/commands/handlers/uninstall.ts",
    find: "shared by OpenCode versions",
    replace: `shared by ${NAME} versions`,
  },
  {
    file: "packages/cli/src/services/updater.ts",
    find: '"OpenCode update available"',
    replace: `"${NAME} update available"`,
  },
  { file: "packages/cli/src/services/updater.ts", find: '"updated OpenCode"', replace: `"updated ${NAME}"` },

  // ---- Update channel: the repack never installs the official binary -----
  // Policy defaults to "disable" when no config file sets one.
  {
    file: "packages/cli/src/services/updater.ts",
    find: 'return values.findLast((value) => value !== undefined) ?? "notify"',
    replace: 'return values.findLast((value) => value !== undefined) ?? "disable"',
    critical: true,
  },
  // Manual update checks and installs must not reach the official channel
  // either. Releases of the repack are published on GitHub (see REPACK.md).
  {
    file: "packages/cli/src/services/updater.ts",
    find: 'const apply = Effect.fn("cli.updater.apply")(function* (version: string) {',
    replace:
      'const apply = Effect.fn("cli.updater.apply")(function* (version: string) {\n' +
      "    if (version !== undefined)\n" +
      "      return yield* Effect.fail(\n" +
      "        new Error(\n" +
      `          "Updates for ${NAME} are published at ${brand.homepage}/releases - download the latest release.",\n` +
      "        ),\n" +
      "      )",
    critical: true,
  },
  {
    file: "packages/cli/src/services/updater.ts",
    find: 'const check = Effect.fn("cli.updater.check")(function* () {\n    if (OPENCODE_LOCAL)',
    replace:
      'const check = Effect.fn("cli.updater.check")(function* () {\n' +
      "    return {\n" +
      '      type: "unavailable" as const,\n' +
      `      message: "${NAME} updates are published at ${brand.homepage}/releases.",\n` +
      "    }\n" +
      "    if (OPENCODE_LOCAL)",
    critical: true,
  },

  // ---- Build script: baked-in CLI name + user agent ----------------------
  {
    file: "packages/cli/script/build.ts",
    find: `OPENCODE_CLI_NAME: "'opencode'"`,
    replace: `OPENCODE_CLI_NAME: "'${CLI}'"`,
    critical: true,
  },
  {
    file: "packages/cli/script/build.ts",
    find: "--user-agent=opencode/",
    replace: `--user-agent=${CLI}/`,
    critical: true,
  },

  // ---- SDK: default service spawn fallback -------------------------------
  {
    file: "packages/client/src/promise/service.ts",
    find: '["opencode", "serve", "--service"]',
    replace: `["${CLI}", "serve", "--service"]`,
  },
  {
    file: "packages/client/src/effect/service.ts",
    find: '["opencode", "serve", "--service"]',
    replace: `["${CLI}", "serve", "--service"]`,
  },

  // ---- CLI: lowercase `opencode <subcommand>` mentions --------------------
  {
    file: "packages/cli/src/mini-host.ts",
    find: "opencode mini requires a controlling terminal",
    replace: `${CLI} mini requires a controlling terminal`,
  },
  {
    file: "packages/cli/src/mini.ts",
    find: "opencode mini requires a TTY stdout",
    replace: `${CLI} mini requires a TTY stdout`,
  },
  {
    file: "packages/cli/src/server-process.ts",
    find: "opencode service set port <port>",
    replace: `${CLI} service set port <port>`,
  },
  {
    file: "packages/cli/src/services/service-config.ts",
    find: "Usage: opencode service ",
    replace: `Usage: ${CLI} service `,
  },
  { file: "packages/cli/src/acp/service.ts", find: "opencode auth login", replace: `${CLI} auth login` },
  {
    file: "packages/cli/src/commands/handlers/pair.ts",
    find: "opencode service set hostname",
    replace: `${CLI} service set hostname`,
  },
  { file: "packages/cli/src/commands/handlers/stats.ts", find: '"opencode stats"', replace: `"${CLI} stats"` },
  {
    file: "packages/tui/src/component/dialog-pair.tsx",
    find: "opencode service set hostname",
    replace: `${CLI} service set hostname`,
  },
  { file: "packages/tui/src/util/error.ts", find: "opencode models", replace: `${CLI} models` },

  // ---- One remaining user-visible permission prompt -----------------------
  {
    file: "packages/core/src/tool/plugin/websearch.ts",
    find: "Allow OpenCode to search the web",
    replace: `Allow ${NAME} to search the web`,
  },

  // ---- Wordmark spacing, stats heading, resume hint ------------------------
  { file: "packages/tui/src/component/logo.tsx", find: "gap={1}", replace: "gap={2}", critical: true },
  {
    file: "packages/tui/src/util/presentation.ts",
    find: "`opencode -s ${input.session.sessionID}`",
    replace: "`" + CLI + " -s ${input.session.sessionID}`",
    critical: true,
  },
  { file: "packages/tui/src/util/presentation.ts", find: "${left} ${right}", replace: "${left}  ${right}" },
  {
    file: "packages/tui/src/feature-plugins/system/stats.tsx",
    find: "opencode / stats",
    replace: `${CLI} / stats`,
    critical: true,
  },

  // ---- Desktop: identity, installers, protocol ---------------------------
  // The channel suffixes (.dev / .beta) survive because only the prefix moves.
  {
    file: "packages/desktop/src/main/constants.ts",
    find: '"OpenCode Dev"',
    replace: `"${NAME} Dev"`,
    min: 2,
    critical: true,
  },
  {
    file: "packages/desktop/src/main/constants.ts",
    find: '"OpenCode Beta"',
    replace: `"${NAME} Beta"`,
    critical: true,
  },
  {
    file: "packages/desktop/src/main/constants.ts",
    find: 'prod: "OpenCode"',
    replace: `prod: "${NAME}"`,
    critical: true,
  },
  {
    file: "packages/desktop/src/main/constants.ts",
    find: "ai.opencode.desktop",
    replace: brand.appId,
    min: 3,
    critical: true,
  },
  { file: "packages/desktop/src/main/storage/store.ts", find: "ai.opencode.desktop", replace: brand.appId },
  { file: "packages/desktop/src/main/windows/early.ts", find: 'title: "OpenCode"', replace: `title: "${NAME}"` },
  { file: "packages/desktop/src/main/windows/appearance.ts", find: 'title: "OpenCode"', replace: `title: "${NAME}"` },
  {
    file: "packages/desktop/src/renderer/index.html",
    find: "<title>OpenCode</title>",
    replace: `<title>${NAME}</title>`,
    critical: true,
  },
  {
    file: "packages/desktop/src/main/lifecycle/index.ts",
    find: 'arg.startsWith("opencode://")',
    replace: `arg.startsWith("${brand.scheme}://")`,
    critical: true,
  },
  {
    file: "packages/desktop/src/main/lifecycle/environment.ts",
    find: 'app.setAsDefaultProtocolClient("opencode")',
    replace: `app.setAsDefaultProtocolClient("${brand.scheme}")`,
    critical: true,
  },

  { file: "packages/desktop/src/main/lifecycle/deep-link.test.ts", find: "opencode://", replace: `${brand.scheme}://` },
  // Ship the vendored bundle (Context7 + setup wizard) next to the app resources.
  {
    file: "packages/desktop/electron-builder.config.ts",
    find: '    extraResources: [\n      {\n        from: "resources/",',
    replace:
      '    extraResources: [\n      { from: "hyper-bundle/", to: "hyper-bundle" },\n      {\n        from: "resources/",',
    critical: true,
  },
  // Start the first-run provisioner once the main bundle has loaded.
  {
    file: "packages/desktop/src/main/desktop.ts",
    find: "marks.bundle = Date.now()",
    replace: 'marks.bundle = Date.now()\n\nvoid import("./hyper/bundle").then((module) => module.startHyperBundle())',
    critical: true,
  },
  // Headless chart rendering must bypass the single-instance lock so a chart can render even
  // while the app is open. It never touches the GUI or the user's session state.
  {
    file: "packages/desktop/src/main/index.ts",
    find: "if (acquireApplicationLock()) {\n  registerRendererScheme()",
    replace:
      '// Headless chart rendering (Hyper AI): the agent passes `--hyper-viz=<job.json>` and this\n// process only renders ECharts specs to SVG/PNG, then exits. It deliberately runs outside the\n// single-instance lock so a chart can render even while the app is open, and it never touches\n// the GUI or the user\'s session state.\nconst vizArg = process.argv.find((arg) => arg.startsWith("--hyper-viz="))\nif (vizArg) {\n  void import("./hyper/bundle").then((module) => module.runHyperViz(vizArg.slice("--hyper-viz=".length)))\n} else if (acquireApplicationLock()) {\n  registerRendererScheme()',
    critical: true,
  },
  // Windows signing needs the upstream Azure account; without it the build is simply unsigned.
  {
    file: "packages/desktop/electron-builder.config.ts",
    find: 'if (process.env.GITHUB_ACTIONS !== "true") return',
    replace: 'if (process.env.GITHUB_ACTIONS !== "true" || !process.env.AZURE_TRUSTED_SIGNING_ACCOUNT_NAME) return',
    critical: true,
  },
  {
    file: "packages/desktop/electron-builder.config.ts",
    find: "ai.opencode.desktop",
    replace: brand.appId,
    min: 4,
    critical: true,
  },
  {
    file: "packages/desktop/electron-builder.config.ts",
    find: 'productName: "OpenCode Dev"',
    replace: `productName: "${NAME} Dev"`,
    critical: true,
  },
  {
    file: "packages/desktop/electron-builder.config.ts",
    find: 'productName: "OpenCode Beta"',
    replace: `productName: "${NAME} Beta"`,
    critical: true,
  },
  {
    file: "packages/desktop/electron-builder.config.ts",
    find: 'productName: "OpenCode"',
    replace: `productName: "${NAME}"`,
    critical: true,
  },
  // NOTE: electron-builder 26 dropped `appImage` from LinuxConfiguration
  // (scheme.json: linux has publish, not appImage) — injecting it here made
  // every package job fail schema validation. AppImage assets publish fine
  // through the workflow's own release step.
  {
    file: "packages/desktop/electron-builder.config.ts",
    find: 'name: "OpenCode Beta", schemes: ["opencode"]',
    replace: `name: "${NAME} Beta", schemes: ["${brand.scheme}"]`,
    critical: true,
  },
  {
    file: "packages/desktop/electron-builder.config.ts",
    find: 'name: "OpenCode", schemes: ["opencode"]',
    replace: `name: "${NAME}", schemes: ["${brand.scheme}"]`,
    critical: true,
  },
  {
    file: "packages/desktop/electron-builder.config.ts",
    find: 'artifactName: "opencode-desktop-',
    replace: `artifactName: "${CLI}-desktop-`,
    critical: true,
  },
  {
    file: "packages/desktop/electron-builder.config.ts",
    find: 'packageName: "opencode-dev"',
    replace: `packageName: "${CLI}-dev"`,
  },
  {
    file: "packages/desktop/electron-builder.config.ts",
    find: 'packageName: "opencode-beta"',
    replace: `packageName: "${CLI}-beta"`,
  },
  {
    file: "packages/desktop/electron-builder.config.ts",
    find: 'packageName: "opencode",',
    replace: `packageName: "${CLI}",`,
  },
  // Updates for the desktop app come from this repository's GitHub releases.
  {
    file: "packages/desktop/electron-builder.config.ts",
    find: 'provider: "generic",\n          url: "https://opencode.ai/update/api/beta/desktop/opencode/",\n          channel: "latest",',
    replace: `provider: "github",\n          owner: "${brand.repo.owner}",\n          repo: "${brand.repo.name}",\n          channel: "latest",`,
    critical: true,
  },
  {
    file: "packages/desktop/electron-builder.config.ts",
    find: 'provider: "generic",\n          url: "https://opencode.ai/update/api/latest/desktop/opencode/",\n          channel: "latest",',
    replace: `provider: "github",\n          owner: "${brand.repo.owner}",\n          repo: "${brand.repo.name}",\n          channel: "latest",`,
    critical: true,
  },
  // The hidden legacy launcher only exists to migrate pins from the old app id.
  {
    file: "packages/desktop/electron-builder.config.ts",
    find: "fpm: [metainfoFpm(appId), legacyDesktopEntryFpm]",
    replace: "fpm: [metainfoFpm(appId)]",
    min: 1,
    critical: true,
  },

  {
    file: "packages/desktop/scripts/copy-metainfo.ts",
    find: "ai.opencode.desktop",
    replace: brand.appId,
    critical: true,
  },
  {
    file: "packages/desktop/scripts/copy-metainfo.ts",
    find: 'productName = channel === "prod" ? "OpenCode" : `OpenCode ${',
    replace: `productName = channel === "prod" ? "${NAME}" : \`${NAME} \${`,
    critical: true,
  },
  { file: "packages/desktop/scripts/copy-metainfo.ts", find: "Open source AI coding agent", replace: brand.summary },
  {
    file: "packages/desktop/scripts/copy-metainfo.ts",
    find: "OpenCode is an open source agent that helps you write and run code with any AI model.",
    replace: `${NAME} is an AI agent that helps you write and run code with any AI model. It is repacked from the open source OpenCode project.`,
  },
  {
    file: "packages/desktop/scripts/copy-metainfo.ts",
    find: '<developer id="ly.anoma">',
    replace: '<developer id="id.ai.bikinin">',
  },
  { file: "packages/desktop/scripts/copy-metainfo.ts", find: "Anomaly Innovations Inc.", replace: brand.vendor },
  {
    file: "packages/desktop/scripts/copy-metainfo.ts",
    find: "https://github.com/anomalyco/opencode/issues",
    replace: `${brand.homepage}/issues`,
  },
  {
    file: "packages/desktop/scripts/copy-metainfo.ts",
    find: '<url type="homepage">https://opencode.ai</url>',
    replace: `<url type="homepage">${brand.homepage}</url>`,
  },
  {
    file: "packages/desktop/scripts/copy-metainfo.ts",
    find: '<url type="vcs-browser">https://github.com/anomalyco/opencode</url>',
    replace: `<url type="vcs-browser">${brand.homepage}</url>`,
  },
  {
    file: "packages/desktop/package.json",
    find: '"homepage": "https://opencode.ai"',
    replace: `"homepage": "${brand.homepage}"`,
  },
  {
    file: "packages/desktop/package.json",
    find: '"name": "OpenCode",\n    "email": "hello@opencode.ai"',
    replace: `"name": "${brand.vendor}",\n    "email": "${brand.maintainerEmail}"`,
    critical: true,
  },
  // Built-in provider models.dev display names -> Hyper AI (IDs stay "opencode*").
  {
    file: "packages/core/src/models-dev.ts",
    find: `    const info = {
      id: providerID,
      name: item.name,`,
    replace: `    const info = {
      id: providerID,
      name:
        item.id === "opencode"
          ? ${JSON.stringify(NAME)}
          : item.id === "opencode-go"
            ? ${JSON.stringify(NAME + " Go")}
            : item.name,`,
    critical: true,
  },
  {
    file: "packages/core/src/models-dev/snapshot.txt",
    find: '"name":"OpenCode Go"',
    replace: JSON.stringify(NAME + " Go"),
    critical: true,
  },
  {
    file: "packages/core/src/models-dev/snapshot.txt",
    find: '"name":"OpenCode"',
    replace: JSON.stringify(NAME),
    critical: true,
  },
  // GUI/user-visible branding: web-app HTML + PWA manifest + desktop theme name + titlebar menu.
  { file: "packages/app/index.html", find: "<title>OpenCode</title>", replace: `<title>${NAME}</title>`, critical: true },
  {
    file: "packages/app/manifest.json",
    find: '"name": "OpenCode",\n  "short_name": "OpenCode",',
    replace: `"name": "${NAME}",\n  "short_name": "${NAME}",`,
    critical: true,
  },
  {
    file: "packages/ui/src/theme/themes/oc-2.json",
    find: '"name": "OpenCode"',
    replace: `"name": "${NAME}"`,
    critical: true,
  },
  {
    file: "packages/app/src/shell/titlebar/windows-menu.tsx",
    find: '<Menu.GroupLabel class="desktop-app-menu-heading">OpenCode</Menu.GroupLabel>',
    replace: `<Menu.GroupLabel class="desktop-app-menu-heading">${NAME}</Menu.GroupLabel>`,
    critical: true,
  },
  { file: "packages/desktop/resources/linux/opencode-desktop.desktop", find: "Name=OpenCode", replace: `Name=${NAME}` },

  // ---- Config OTA ---------------------------------------------------------
  // The build checks out upstream fresh, so the managed-config modules and the
  // hooks that load them live here and are re-applied every time. Every rule is
  // critical: a silent miss would ship an installer without the OTA feature.
  {
    file: "packages/core/src/config.ts",
    find: 'import { ConfigWatch } from "./config/watch.js"',
    replace: `import { ConfigWatch } from "./config/watch.js"
import * as ManagedBundle from "./config/managed-bundle.js"
import * as ManagedPolicy from "./config/managed-policy.js"`,
    critical: true,
  },
  {
    file: "packages/core/src/config.ts",
    find: `  global: Schema.optional(Schema.Boolean),
  system: Schema.optional(Schema.Union([Schema.Boolean, Schema.String])),`,
    replace: `  global: Schema.optional(Schema.Boolean),
  system: Schema.optional(Schema.Union([Schema.Boolean, Schema.String])),
  // false skips signed Hyper AI config bundles; a string points discovery at one directory
  // (%LOCALAPPDATA%\\HyperAI\\managed, /etc/hyperai/managed) instead of the platform defaults.
  managed: Schema.optional(Schema.Union([Schema.Boolean, Schema.String])),`,
    critical: true,
  },
  {
    file: "packages/core/src/config.ts",
    find: `      const load = Effect.fn("Config.load")(function* (sources: ConfigDiscovery.Sources) {`,
    replace: `      /**
       * Config OTA: baca \`bundle.json\` + tanda tangannya, verifikasi dengan kunci publik
       * aplikasi, lalu materialisasi (config + rahasia terenkripsi). Tanda tangan rusak
       * atau config berbahaya berarti bundle diabaikan, bukan diterapkan.
       */
      const loadManagedBundle = Effect.fnUntraced(function* (directory: AbsolutePath) {
        const bundlePath = path.join(directory, "bundle.json")
        const signaturePath = path.join(directory, "bundle.json.sig")
        const text = yield* fs.readFileStringSafe(bundlePath)
        const signature = yield* fs.readFileStringSafe(signaturePath)
        if (text === undefined || signature === undefined) return [] as Document[]
        const bytes = Buffer.from(text.replace(/^\\uFEFF/, ""), "utf-8")
        if (!ManagedBundle.verifyBundle(bytes, signature.trim(), ManagedPolicy.publicKey())) {
          yield* Effect.logWarning("managed config rejected: signature", { source: bundlePath })
          return [] as Document[]
        }
        const enrollment = yield* fs.readFileStringSafe(path.join(directory, "enrollment"))
        const materialized = yield* Effect.try(() =>
          ManagedBundle.materialize(
            ManagedBundle.decodeBundle(bytes),
            enrollment?.trim(),
            ManagedPolicy.allowedPackages,
          ),
        ).pipe(
          Effect.catch((error) =>
            Effect.logWarning("managed config rejected: invalid", { source: bundlePath, error }).pipe(
              Effect.as(undefined),
            ),
          ),
        )
        if (!materialized) return [] as Document[]
        const info = yield* parseInfo(JSON.stringify(materialized), AbsolutePath.make(bundlePath))
        return info ? [new Document({ type: "document", path: AbsolutePath.make(bundlePath), info })] : []
      })

      const load = Effect.fn("Config.load")(function* (sources: ConfigDiscovery.Sources) {`,
    critical: true,
  },
  {
    file: "packages/core/src/config.ts",
    find: `          ...(sources.preferences ? yield* loadPreferences(sources.preferences).pipe(Effect.orDie) : []),`,
    replace: `          ...(sources.preferences ? yield* loadPreferences(sources.preferences).pipe(Effect.orDie) : []),
          ...(yield* Effect.forEach(
            (sources.managed ?? []).filter((source) => source.present),
            (source) => loadManagedBundle(source.path),
          ).pipe(Effect.orDie, Effect.map((entries) => entries.flat()))),`,
    critical: true,
  },
  {
    file: "packages/core/src/config/discovery.ts",
    find: `  readonly preferences?: AbsolutePath`,
    replace: `  readonly preferences?: AbsolutePath
  /**
   * Config OTA Hyper AI: direktori dengan \`bundle.json\` + \`bundle.json.sig\`.
   * Dimuat setelah system/MDM sehingga menang atas config pengguna.
   */
  readonly managed?: readonly { readonly path: AbsolutePath; readonly present: boolean }[]`,
    critical: true,
  },
  {
    file: "packages/core/src/config/discovery.ts",
    find: `/** Platform system configuration directory`,
    replace: `/** Direktori managed per platform; pengguna lebih dulu, mesin sesudahnya (mesin menang). */
export function managedDirectories(platform: NodeJS.Platform = process.platform, env: NodeJS.ProcessEnv = process.env) {
  if (platform === "darwin")
    return [
      path.join(env.HOME || os.homedir(), "Library", "Application Support", "HyperAI", "managed"),
      "/Library/Application Support/HyperAI/managed",
    ].map((directory) => AbsolutePath.make(directory))
  if (platform === "win32")
    return [
      path.join(env.LOCALAPPDATA || path.join(env.USERPROFILE || "", "AppData", "Local"), "HyperAI", "managed"),
      path.join(env.ProgramData || "C:\\\\ProgramData", "HyperAI", "managed"),
    ].map((directory) => AbsolutePath.make(directory))
  return [
    path.join(env.XDG_CONFIG_HOME || path.join(env.HOME || "", ".config"), "hyperai", "managed"),
    "/etc/hyperai/managed",
  ].map((directory) => AbsolutePath.make(directory))
}

/** Berkas bundle yang dibaca dari setiap direktori managed. */
export const managedBundleFiles = ["bundle.json", "bundle.json.sig", "enrollment"] as const

/** Platform system configuration directory`,
    critical: true,
  },
  {
    file: "packages/core/src/config/discovery.ts",
    find: `  return {
    system: globalEnabled && system ? { path: system, present: yield* fs.isDir(system) } : undefined,
    preferences,`,
    replace: `  // Config OTA: bundle bertanda tangan yang ditulis updater aplikasi.
  const managed = globalEnabled && options?.managed !== false
    ? yield* Effect.forEach(
        typeof options?.managed === "string" ? [AbsolutePath.make(path.resolve(options.managed))] : managedDirectories(),
        (directory) =>
          fs.isFile(path.join(directory, "bundle.json")).pipe(Effect.map((present) => ({ path: directory, present }))),
      )
    : []

  return {
    system: globalEnabled && system ? { path: system, present: yield* fs.isDir(system) } : undefined,
    preferences,
    managed,`,
    critical: true,
  },
  {
    file: "packages/core/src/config/watch.ts",
    find: `import path from "path"
import { FSUtil } from "@opencode/util/fs-util"
import type { Watcher } from "../filesystem/watcher.js"
import type { ConfigDiscovery } from "./discovery.js"`,
    replace: `import fs from "node:fs"
import path from "path"
import { FSUtil } from "@opencode/util/fs-util"
import type { Watcher } from "../filesystem/watcher.js"
import { ConfigDiscovery } from "./discovery.js"

/**
 * Bagian pertama dari path yang belum ada (nenek moyangnya sudah ada). Menonton path
 * ini sebagai kandidat entri membuat pembuatan direktori terdeteksi, lalu reconcile
 * berikutnya menambah watch lebih dalam.
 */
function firstMissing(target: string) {
  let current = target
  for (let depth = 0; depth < 6; depth++) {
    const parent = path.dirname(current)
    if (parent === current) return current
    if (fs.existsSync(parent)) return current
    current = parent
  }
  return current
}`,
    critical: true,
  },
  {
    file: "packages/core/src/config/watch.ts",
    find: `    ...(sources.system?.present ? [sources.system.path] : []),`,
    replace: `    ...(sources.system?.present ? [sources.system.path] : []),
    ...(sources.managed ?? []).filter((source) => source.present).map((source) => source.path),`,
    critical: true,
  },
  {
    file: "packages/core/src/config/watch.ts",
    find: `    ...(sources.system ? [sources.system.path] : []),`,
    replace: `    ...(sources.system ? [sources.system.path] : []),
    ...(sources.managed ?? []).flatMap((source) =>
      // Direktori ada: tonton ketiga berkasnya agar bundle pertama/berikutnya memicu reload.
      // Direktori belum ada: menontonnya gagal (ENOENT), jadi tonton bagian pertama yang belum ada.
      fs.existsSync(source.path)
        ? [source.path, ...ConfigDiscovery.managedBundleFiles.map((name) => path.join(source.path, name))]
        : [firstMissing(source.path)],
    ),`,
    critical: true,
  },
  {
    file: "packages/server/src/process.ts",
    find: `import type { ServerOptions } from "./options"`,
    replace: `import type { ServerOptions } from "./options"
import { startConfigUpdater } from "@opencode/core/config/updater"
import { allowedPackages, publicKey } from "@opencode/core/config/managed-policy"
import { userManagedDirectory } from "@opencode/core/config/managed-apply"`,
    critical: true,
  },
  {
    file: "packages/server/src/process.ts",
    find: `  const bound = yield* listen({ hostname, port })`,
    replace: `  const bound = yield* listen({ hostname, port })
  // Config OTA: unduh bundle bertanda tangan; Config memuatnya dari direktori managed.
  // Hanya channel rilis yang memeriksa; build lokal tidak menghubungi jaringan.
  const otaChannel =
    process.env.HYPER_CONFIG_CHANNEL ?? (options.app?.channel === "prod" ? "stable" : options.app?.channel)
  if (
    !process.env.HYPER_CONFIG_OTA_DISABLE &&
    (otaChannel === "stable" || otaChannel === "beta" || otaChannel === "canary")
  ) {
    const updater = startConfigUpdater({
      dir: userManagedDirectory(),
      channel: otaChannel,
      appVersion: options.app?.version ?? "unknown",
      publicKey: publicKey(),
      allowedPackages,
    })
    yield* Effect.addFinalizer(() => Effect.sync(() => updater.stop()))
  }`,
    critical: true,
  },
  {
    file: "packages/server/src/handlers/config.ts",
    find: `import { Config } from "@opencode/core/config"
import { ShellSelect } from "@opencode/core/shell/select"
import { Effect } from "effect"`,
    replace: `import { Config } from "@opencode/core/config"
import { ShellSelect } from "@opencode/core/shell/select"
import { Document, Info, type Entry } from "@opencode/schema/config"
import { Effect } from "effect"`,
    critical: true,
  },
  {
    file: "packages/server/src/handlers/config.ts",
    find: `export const ConfigHandler = HttpApiBuilder.group(Api, "server.config", (handlers) =>`,
    replace: `/**
 * \`config.get\` melayani UI/SDK, bukan provider yang benar-benar memanggil model.
 * API key yang berasal dari config OTA (maupun config pengguna) tidak boleh ikut
 * terkirim ke klien: cukup penanda bahwa nilainya ada.
 */
function redact(entry: Entry): Entry {
  if (entry.type !== "document" || !entry.info.providers) return entry
  const providers = Object.fromEntries(
    Object.entries(entry.info.providers).map(([id, provider]) => {
      if (!provider.settings || typeof provider.settings.apiKey !== "string") return [id, provider]
      return [id, { ...provider, settings: { ...provider.settings, apiKey: "***" } }]
    }),
  )
  return new Document({ type: "document", path: entry.path, info: new Info({ ...entry.info, providers }) })
}

export const ConfigHandler = HttpApiBuilder.group(Api, "server.config", (handlers) =>`,
    critical: true,
  },
  {
    file: "packages/server/src/handlers/config.ts",
    find: `    .handle("config.get", () => Config.Service.use((config) => config.entries()))`,
    replace: `    .handle("config.get", () =>
      Config.Service.use((config) => config.entries().pipe(Effect.map((entries) => entries.map(redact)))),
    )`,
    critical: true,
  },
]

// Files this repack owns outright: shipped under rebrand/files and copied over
// the upstream version, because find/replace cannot express a rewritten module.
type Write = { file: string; source: string; critical?: boolean; create?: boolean }
const writes: Write[] = [
  { file: "packages/tui/src/logo.ts", source: "logo.ts", critical: true },
  { file: "packages/tui/test/logo-render.test.tsx", source: "logo-render.test.tsx", create: true },
  // Pixel-art wordmark redrawn as "HYPER AI" (GUI Logo/Splash/Mark + provider mark).
  { file: "packages/ui/src/components/logo.tsx", source: "ui/components/logo.tsx", critical: true },
  { file: "packages/app/src/providers/opencode-logo.tsx", source: "app/providers/opencode-logo.tsx", critical: true },
  // First-run provisioning for the desktop app (see rebrand/files/desktop/hyper).
  // Every module that hyper/*.ts imports relatively must be listed here or the
  // bundler fails with UNRESOLVED_IMPORT (router/privacy were missing once).
  ...["bundle", "case-ui", "components", "config", "consent", "docling", "download", "forensic", "hindsight", "knowledge", "lmstudio", "manifest", "memory", "office", "platform", "privacy", "process", "router", "skills", "updates", "uv"].map(
    (name) => ({
      file: `packages/desktop/src/main/hyper/${name}.ts`,
      source: `desktop/hyper/${name}.ts`,
      critical: true,
      create: true,
    }),
  ),
  // Config OTA: signed bundle loading, updater, and platform directories.
  ...["managed-bundle", "managed-apply", "managed-policy", "updater"].map((name) => ({
    file: `packages/core/src/config/${name}.ts`,
    source: `core/config/${name}.ts`,
    critical: true,
    create: true,
  })),
]

// Directories copied verbatim over upstream (icons are binary).
const icons = ["dev", "beta", "prod"].map((channel) => ({
  from: path.join(import.meta.dir, "assets", "icons"),
  to: path.join(root, "packages/desktop/icons", channel),
}))

// Post-conditions: every one of these must hold before a single byte is
// written, otherwise the pass fails and the tree is left untouched.
const checks: Array<{ file: string; contains: string }> = [
  { file: "packages/tui/src/logo.ts", contains: "rows([H, Y, P, E, R])" },
  { file: "packages/tui/src/component/logo.tsx", contains: "gap={2}" },
  { file: "packages/tui/src/util/presentation.ts", contains: `${CLI} -s ` },
  { file: "packages/cli/src/commands/commands.ts", contains: `"${NAME} command line interface"` },
  { file: "packages/cli/script/build.ts", contains: `OPENCODE_CLI_NAME: "'${CLI}'"` },
  { file: "packages/desktop/electron-builder.config.ts", contains: `productName: "${NAME}"` },
  { file: "packages/desktop/electron-builder.config.ts", contains: brand.repo.name },
  { file: "packages/desktop/src/main/constants.ts", contains: brand.appId },
  { file: "packages/desktop/src/main/desktop.ts", contains: "startHyperBundle" },
  { file: "packages/desktop/electron-builder.config.ts", contains: "hyper-bundle" },
  { file: "packages/core/src/config.ts", contains: "loadManagedBundle" },
  { file: "packages/core/src/config/discovery.ts", contains: "managedDirectories" },
  { file: "packages/core/src/config/watch.ts", contains: "firstMissing" },
  { file: "packages/server/src/process.ts", contains: "startConfigUpdater" },
  { file: "packages/server/src/handlers/config.ts", contains: "function redact" },
]

const cache = new Map<string, string>()
const touched = new Set<string>()
const applied: string[] = []
const already: string[] = []
const warnings: string[] = []
const fatal: string[] = []

async function read(file: string) {
  const full = path.join(root, file)
  if (cache.has(full)) return cache.get(full)
  const handle = Bun.file(full)
  if (!(await handle.exists())) return undefined
  // Windows checkouts convert to CRLF, which would break every multi-line find.
  const text = (await handle.text()).replaceAll("\r\n", "\n")
  cache.set(full, text)
  return text
}

function miss(critical: boolean | undefined, message: string) {
  if (critical) fatal.push(message)
  else warnings.push(message)
}

for (const rule of rules) {
  const label = `${rule.file} <- ${JSON.stringify(rule.find.slice(0, 70))}`
  const text = await read(rule.file)
  if (text === undefined) {
    miss(rule.critical, `${label} (file not found)`)
    continue
  }
  // Idempotent: a previous run already replaced this text. A replacement that
  // merely sits inside another rule's output (same text on another line) must
  // not hide remaining upstream text, so the find text has to be gone too -
  // unless the replacement extends the find text, which can never be both.
  if (text.includes(rule.replace) && (rule.replace.includes(rule.find) || !text.includes(rule.find))) {
    already.push(label)
    continue
  }
  const count = text.split(rule.find).length - 1
  if (count < (rule.min ?? 1)) {
    miss(rule.critical, `${label} (found ${count}, need >=${rule.min ?? 1})`)
    continue
  }
  cache.set(path.join(root, rule.file), text.replaceAll(rule.find, rule.replace))
  touched.add(path.join(root, rule.file))
  applied.push(`${label} x${count}`)
}

for (const write of writes) {
  const label = `${write.file} <= rebrand/files/${write.source}`
  const content = await Bun.file(path.join(import.meta.dir, "files", write.source)).text()
  const current = await read(write.file)
  if (current === undefined && !write.create) {
    miss(write.critical, `${label} (target file not found)`)
    continue
  }
  if (current === content) {
    already.push(label)
    continue
  }
  cache.set(path.join(root, write.file), content)
  touched.add(path.join(root, write.file))
  applied.push(`${label} (overwritten)`)
}

for (const check of checks) {
  const text = await read(check.file)
  if (text === undefined || !text.includes(check.contains))
    fatal.push(`${check.file}: expected ${JSON.stringify(check.contains)} after rebrand`)
}

console.log(`rebrand: ${rules.length} rules, ${writes.length} shipped files, ${icons.length} icon sets`)
console.log(
  `  applied ${applied.length} | already ${already.length} | warnings ${warnings.length} | fatal ${fatal.length}`,
)
for (const entry of warnings) console.log(`  warn   ${entry}`)
for (const entry of fatal) console.log(`  FATAL  ${entry}`)

if (fatal.length) {
  console.error("\nrebrand FAILED - nothing was written")
  process.exit(1)
}

for (const [full, text] of cache) if (touched.has(full)) await Bun.write(full, text)
for (const icon of icons) await cp(icon.from, icon.to, { recursive: true, force: true })
for (const entry of applied) console.log(`  apply  ${entry}`)
console.log(`rebrand ok: ${touched.size} file(s) updated, icons refreshed`)
