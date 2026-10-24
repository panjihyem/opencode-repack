import { describe, expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { consentValid, consentVersion, readDocs } from "../files/desktop/hyper/consent"

const wizard = path.join(import.meta.dir, "..", "files", "desktop", "wizard")

describe("persetujuan setup", () => {
  test("hash dokumen menentukan versi persetujuan", async () => {
    const docs = await readDocs(wizard)
    const version = consentVersion(docs)
    const consent = { version, terms: docs.terms.hash, privacy: docs.privacy.hash, at: new Date().toISOString() }
    expect(consentValid(consent, docs)).toBe(true)
    expect(consentValid({ ...consent, terms: "lain" }, docs)).toBe(false)
    expect(consentValid(undefined, docs)).toBe(false)
  })

  test("dokumen yang berubah membatalkan persetujuan lama", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "hyper-consent-"))
    const source = await readDocs(wizard)
    for (const name of ["terms", "privacy", "licenses"] as const) {
      await writeFile(path.join(dir, { terms: "TERMS.md", privacy: "PRIVACY.md", licenses: "LICENSES.md" }[name]), source[name].text)
    }
    const before = await readDocs(dir)
    const consent = {
      version: consentVersion(before),
      terms: before.terms.hash,
      privacy: before.privacy.hash,
      at: new Date().toISOString(),
    }
    expect(consentValid(consent, before)).toBe(true)

    await writeFile(path.join(dir, "TERMS.md"), source.terms.text + "\nperubahan material\n")
    const after = await readDocs(dir)
    expect(consentValid(consent, after)).toBe(false)
    await rm(dir, { recursive: true, force: true })
  })

  test("dokumen wajib lengkap", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "hyper-consent-"))
    await writeFile(path.join(dir, "TERMS.md"), "a")
    await expect(readDocs(dir)).rejects.toThrow()
    await rm(dir, { recursive: true, force: true })
  })
})
