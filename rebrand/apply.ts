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
  // ---- TUI: terminal title / dialogs -------------------------------------
  {
    file: "packages/tui/src/attention.ts",
    find: 'const DEFAULT_TITLE = "OpenCode"',
    replace: `const DEFAULT_TITLE = "${NAME}"`,
  },
  {
    file: "packages/tui/src/app.tsx",
    find: 'renderer.setTerminalTitle("OpenCode")',
    replace: `renderer.setTerminalTitle("${NAME}")`,
    min: 2,
  },
  { file: "packages/tui/src/app.tsx", find: 'title: "Update OpenCode"', replace: `title: "Update ${NAME}"` },
  {
    file: "packages/tui/src/mini/runtime.lifecycle.ts",
    find: 'renderer.setTerminalTitle("OpenCode")',
    replace: `renderer.setTerminalTitle("${NAME}")`,
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
    find: "${bold}opencode -s ${input.sessionID}",
    replace: `\${bold}${CLI} -s \${input.sessionID}`,
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
    min: 2,
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
  ...["bundle", "components", "config", "docling", "download", "forensic", "hindsight", "knowledge", "lmstudio", "manifest", "memory", "office", "platform", "process", "skills", "updates", "uv"].map(
    (name) => ({
      file: `packages/desktop/src/main/hyper/${name}.ts`,
      source: `desktop/hyper/${name}.ts`,
      critical: true,
      create: true,
    }),
  ),
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
