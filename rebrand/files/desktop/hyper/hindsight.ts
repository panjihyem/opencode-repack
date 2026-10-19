import { mkdir, stat, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { manifest } from "./manifest"
import { executable } from "./platform"
import { launch, listening, run } from "./process"
import type { Report } from "./process"
import { ensureUv } from "./uv"

const hindsight = manifest.hindsight

export const hindsightRoot = (dataDir: string) => path.join(dataDir, "hindsight")
const venvBin = (root: string) => path.join(root, "venv", process.platform === "win32" ? "Scripts" : "bin")
const serverBinary = (root: string) => path.join(venvBin(root), executable("hindsight-api"))
const marker = (root: string) => path.join(root, `installed-${hindsight.version}`)

export const hindsightInstalled = (dataDir: string) =>
  stat(marker(hindsightRoot(dataDir))).then(
    () => true,
    () => false,
  )

/** Creates an isolated Python environment with the pinned hindsight-api; uv fetches its own Python. */
export async function installHindsight(dataDir: string, report: Report) {
  const root = hindsightRoot(dataDir)
  await mkdir(root, { recursive: true })
  const uv = await ensureUv(root, report)

  report("Creating Python environment", 0.15)
  await run(uv, ["venv", "--python", hindsight.python, path.join(root, "venv")])
  report("Installing Hindsight (this takes a few minutes)", 0.3)
  const python = path.join(venvBin(root), executable("python"))
  // CPU wheels keep the environment a few GB smaller; the memory server only embeds text.
  await run(uv, ["pip", "install", "--python", python, "--torch-backend", "cpu", `${hindsight.package}==${hindsight.version}`])
  await writeFile(marker(root), new Date().toISOString())
}

/**
 * pg0's bundled PostgreSQL binaries are linked against Homebrew's OpenSSL
 * (/opt/homebrew/opt/openssl@3), which machines without Homebrew don't have and
 * users shouldn't need. Rewire those load commands to the OpenSSL dylibs shipped
 * inside psycopg2's wheel in our venv. install_name_tool rejects replacement
 * paths longer than the originals, so a short symlink directory keeps everything
 * fitting — no Homebrew required.
 */
async function patchPostgresOpenSSL(dataDir: string) {
  if (process.platform !== "darwin") return
  const homeRoot = process.env.PG0_HOME ?? path.join(os.homedir(), ".pg0")
  const dylibs = path.join(hindsightRoot(dataDir), "venv", "lib", "python3.12", "site-packages", "psycopg2", ".dylibs")
  const body = [
    'export PATH="/usr/bin:/bin:$PATH"',
    'found=0',
    'for lib in "$HYPER_PG0_HOME"/installation/*/bin/* "$HYPER_PG0_HOME"/installation/*/lib/*.dylib; do',
    '  [ -f "$lib" ] || continue',
    '  otool -L "$lib" 2>/dev/null | grep -q "/opt/homebrew/opt/openssl@3" || continue',
    '  found=1',
    '  break',
    'done',
    '[ "$found" = 1 ] || exit 0',
    'mkdir -p "$HYPER_HL_DIR"',
    'for name in libssl.3.dylib libcrypto.3.dylib; do',
    '  [ -f "$HYPER_VENV_DYLIBS/$name" ] || continue',
    '  ln -sf "$HYPER_VENV_DYLIBS/$name" "$HYPER_HL_DIR/$name"',
    'done',
    'for lib in "$HYPER_PG0_HOME"/installation/*/bin/* "$HYPER_PG0_HOME"/installation/*/lib/*.dylib; do',
    '  [ -f "$lib" ] || continue',
    '  otool -L "$lib" 2>/dev/null | grep "/opt/homebrew/opt/openssl@3" | awk \'{print $1}\' |',
    '    while IFS= read -r dep; do',
    '      install_name_tool -change "$dep" "$HYPER_HL_DIR/$(basename "$dep")" "$lib" 2>/dev/null',
    '    done',
    '  codesign --force --sign - "$lib" >/dev/null 2>&1',
    'done',
    'exit 0',
  ].join("\n")
  await run(
    "bash",
    ["-c", body],
    {
      env: {
        HYPER_PG0_HOME: homeRoot,
        HYPER_VENV_DYLIBS: dylibs,
        HYPER_HL_DIR: path.join(homeRoot, "hl"),
      },
    },
  ).catch(() => undefined)
}

/** Starts the local memory server unless one already answers on its port. */
export async function startHindsight(dataDir: string, logDir: string, model = hindsight.llm.model) {
  if (await listening(hindsight.port, hindsight.host)) return undefined
  await patchPostgresOpenSSL(dataDir)
  const root = hindsightRoot(dataDir)
  const env: NodeJS.ProcessEnv = {
    PYTHONUTF8: "1",
    HINDSIGHT_API_LLM_PROVIDER: hindsight.llm.provider,
    HINDSIGHT_API_LLM_BASE_URL: hindsight.llm.baseUrl,
    HINDSIGHT_API_LLM_MODEL: model,
    HINDSIGHT_API_LLM_STRICT_SCHEMA: "true",
    HINDSIGHT_API_LLM_TIMEOUT: "300",
    HINDSIGHT_API_LLM_TEMPERATURE: "none",
  }
  if (model.startsWith("qwen")) {
    // Reasoning mode makes each extraction call take minutes and trips client
    // timeouts, so it is switched off. The template kwargs are Qwen-specific;
    // other model families reject unknown kwargs.
    env.HINDSIGHT_API_LLM_REASONING_EFFORT = "none"
    env.HINDSIGHT_API_LLM_EXTRA_BODY = JSON.stringify({
      reasoning_effort: "none",
      chat_template_kwargs: { enable_thinking: false },
    })
  }
  return launch(
    serverBinary(root),
    ["--host", hindsight.host, "--port", String(hindsight.port)],
    path.join(logDir, "hindsight.log"),
    env,
  )
}

