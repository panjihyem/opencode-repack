import assert from "node:assert/strict"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { writeProjectSummary } from "./knowledge"

const root = await mkdtemp(path.join(os.tmpdir(), "hyper-project-summary-"))
try {
  const source = path.join(root, "catatan.md")
  await writeFile(source, "temuan")
  assert.equal(await writeProjectSummary(root, "kasus-1", [[source, 0]]), "written")
  const first = await readFile(path.join(root, "Ringkasan-Project.md"), "utf8")
  assert.match(first, /HYPER_AI_MANAGED: project summary/)
  assert.match(first, /catatan\.md/)
  assert.match(first, /Belum ada fakta dari memori/)
  assert.equal(await writeProjectSummary(root, "kasus-1", [], ["Keputusan X"]), "written")
  const recalled = await readFile(path.join(root, "Ringkasan-Project.md"), "utf8")
  assert.match(recalled, /Recall otomatis dari memori lokal/)
  assert.match(recalled, /Keputusan X/)
  const userFile = path.join(root, "Ringkasan-Project.md")
  await writeFile(userFile, "ringkasan milik pengguna")
  assert.equal(await writeProjectSummary(root, "kasus-1", [[source, 0]]), "kept")
  assert.equal(await readFile(userFile, "utf8"), "ringkasan milik pengguna")
} finally {
  await rm(root, { recursive: true, force: true })
}
