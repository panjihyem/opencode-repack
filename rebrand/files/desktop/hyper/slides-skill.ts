import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { SLIDES_FILES, SLIDES_ROOT } from "./slides"

// Menulis skill hyper-slides beserta pustaka Python/PS-nya ke folder skill user.
// Berkas skrip hidup di <configDir>/skill/hyper-slides/scripts agar path relatif
// (`theme.json` di sebelah `slides_lib.py`) tetap valid dan bisa dipanggil agent.

const MANAGED = "HYPER_AI_MANAGED"

/** Absolute path folder skrip, untuk disuntikkan ke body skill. */
export const slidesScripts = (configDir: string) => path.join(configDir, "skill", SLIDES_ROOT, "scripts")

/** Skrip layanan lokal (Hindsight 8888 + LM Studio 1234) yang ikut dikirim. */
const SERVICES_SCRIPT = `# start-services.ps1 — nyalakan layanan lokal Hyper AI yang sering mati.
# Pemakaian: powershell -NoProfile -ExecutionPolicy Bypass -File start-services.ps1
# Aman dijalankan berulang: yang sudah hidup dilewati.
$ErrorActionPreference = "Continue"
$report = @()

# ---- Hindsight (memori, port 8888) ----
$hq = 8888
if ((Test-NetConnection 127.0.0.1 -Port $hq -WarningAction SilentlyContinue).TcpTestSucceeded) {
  $report += "Hindsight : sudah hidup ($hq)"
} else {
  $py = Join-Path $PSScriptRoot "..\\..\\..\\hyper-bundle\\office\\venv\\Scripts\\python.exe"
  if (-not (Test-Path $py)) { $py = "python" }
  $starter = @'
import json, os, subprocess
from pathlib import Path
cfg = json.load(open(os.path.expanduser("~/.config/opencode/opencode.json"), encoding="utf-8-sig"))
prov = cfg.get("provider") or {}
pick = prov.get("oc") or next(iter(prov.values()), {})
p = pick.get("options") or {}
key = p.get("apiKey") or p.get("api_key")
base = p.get("baseURL") or p.get("baseUrl")
model = "ocg/mimo-v2.6-flash-free"
api = Path(os.environ["APPDATA"]) / "ai.hyperai.desktop" / "hyper-bundle" / "hindsight" / "venv" / "Scripts" / "hindsight-api.exe"
env = dict(os.environ)
env.update({
    "PYTHONUTF8": "1", "PYTHONIOENCODING": "utf-8",
    "HINDSIGHT_API_LLM_PROVIDER": "openai",
    "HINDSIGHT_API_LLM_BASE_URL": base or "",
    "HINDSIGHT_API_LLM_API_KEY": key or "",
    "HINDSIGHT_API_LLM_MODEL": model,
    "HINDSIGHT_API_LLM_STRICT_SCHEMA": "false",
    "HINDSIGHT_API_LLM_TIMEOUT": "300",
    "HINDSIGHT_API_LLM_MAX_RETRIES": "2",
    "HINDSIGHT_API_CONSOLIDATION_LLM_PROVIDER": "openai",
    "HINDSIGHT_API_CONSOLIDATION_LLM_BASE_URL": base or "",
    "HINDSIGHT_API_CONSOLIDATION_LLM_API_KEY": key or "",
    "HINDSIGHT_API_CONSOLIDATION_LLM_MODEL": model,
})
log = Path(os.environ["TEMP"]) / "hindsight-run.log"
out = open(log, "w", encoding="utf-8")
proc = subprocess.Popen([str(api), "--host", "127.0.0.1", "--port", "8888"], env=env,
                        stdout=out, stderr=subprocess.STDOUT,
                        creationflags=subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.DETACHED_PROCESS)
print(f"hindsight pid={proc.pid}")
'@
  $starter | & $py -
  $ok = $false
  for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 2
    if ((Test-NetConnection 127.0.0.1 -Port $hq -WarningAction SilentlyContinue).TcpTestSucceeded) { $ok = $true; break }
  }
  $report += if ($ok) { "Hindsight : dinyalakan ($hq)" } else { "Hindsight : GAGAL -- cek $env:TEMP\\hindsight-run.log" }
}

# ---- LM Studio (model lokal, port 1234) ----
$lq = 1234
if ((Test-NetConnection 127.0.0.1 -Port $lq -WarningAction SilentlyContinue).TcpTestSucceeded) {
  $report += "LM Studio : sudah hidup ($lq)"
} else {
  $lms = Join-Path $env:USERPROFILE ".lmstudio\\bin\\lms.exe"
  if (Test-Path $lms) {
    & $lms daemon up *> $null
    & $lms server start --port $lq *> $null
    $ok = $false
    for ($i = 0; $i -lt 15; $i++) {
      Start-Sleep -Seconds 2
      if ((Test-NetConnection 127.0.0.1 -Port $lq -WarningAction SilentlyContinue).TcpTestSucceeded) { $ok = $true; break }
    }
    $report += if ($ok) { "LM Studio : dinyalakan ($lq)" } else { "LM Studio : GAGAL" }
  } else {
    $report += "LM Studio : lms.exe tidak ada (buka aplikasi sekali)"
  }
}

$report | ForEach-Object { Write-Output $_ }
if ($report -match "GAGAL") { exit 1 }
exit 0
`

/** Menulis skrip layanan ke <configDir>/bin (sekali, tidak menimpa milik user). */
export async function applyServicesScript(configDir: string) {
  const dir = path.join(configDir, "bin")
  const target = path.join(dir, "start-services.ps1")
  const existing = await readFile(target, "utf8").catch(() => undefined)
  if (existing === SERVICES_SCRIPT) return "unchanged" as const
  await mkdir(dir, { recursive: true })
  await writeFile(target, SERVICES_SCRIPT)
  return "written" as const
}

/**
 * Menulis seluruh berkas hyper-slides. Berkas milik user (tanpa penanda
 * managed) tidak pernah ditimpa: bila SKILL.md sudah ada dan bukan milik kita,
 * seluruh penulisan dilewati agar tidak ada campuran versi.
 */
export async function applySlidesSkill(configDir: string) {
  const root = path.join(configDir, "skill", SLIDES_ROOT)
  const skillFile = path.join(root, "SKILL.md")
  const existing = await readFile(skillFile, "utf8").catch(() => undefined)
  if (existing && !existing.includes(MANAGED)) return "kept" as const

  let written = 0
  for (const file of SLIDES_FILES) {
    const target = path.join(root, file.path)
    await mkdir(path.dirname(target), { recursive: true })
    const current = await readFile(target, "utf8").catch(() => undefined)
    if (current === file.content) continue
    await writeFile(target, file.content)
    written += 1
  }
  return (written === 0 ? "unchanged" : `written:${written}`) as string
}

/** Verifikasi pasca-tulis: semua berkas ada dan tidak kosong. */
export async function verifySlidesSkill(configDir: string) {
  const root = path.join(configDir, "skill", SLIDES_ROOT)
  const missing: string[] = []
  for (const file of SLIDES_FILES) {
    const content = await readFile(path.join(root, file.path), "utf8").catch(() => undefined)
    if (!content || content.length === 0) missing.push(file.path)
  }
  return missing
}
