import { readFile } from "node:fs/promises"
import path from "node:path"

/**
 * Case mode switch, written by `hyper-case mode on|off`.
 *
 * A missing file means the default posture. A file that cannot be parsed is
 * treated as armed: when the stricter posture is requested but unreadable, the
 * failure must not silently re-enable automatic memory or the remote route.
 */
export async function caseMode(configDir: string) {
  const text = await readFile(path.join(configDir, "hyper", "privacy.json"), "utf8").catch(() => undefined)
  if (text === undefined) return false
  try {
    const parsed: unknown = JSON.parse(text)
    return typeof parsed === "object" && parsed !== null && (parsed as { case_mode?: unknown }).case_mode === true
  } catch {
    return true
  }
}
