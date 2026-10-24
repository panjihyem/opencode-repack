import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import path from "node:path"

// Offline legal documents shown before setup. Hashing the exact bytes means a
// changed document can never inherit an earlier acceptance.
export const docFiles = {
  terms: "TERMS.md",
  privacy: "PRIVACY.md",
  licenses: "LICENSES.md",
} as const

export type DocName = keyof typeof docFiles
export type Doc = { text: string; hash: string }
export type Docs = Record<DocName, Doc>
export type Consent = { version: string; terms: string; privacy: string; at: string }

export const digest = (text: string) => createHash("sha256").update(text).digest("hex")

export async function readDocs(dir: string): Promise<Docs> {
  const entries = await Promise.all(
    (Object.keys(docFiles) as DocName[]).map(async (name) => {
      const text = await readFile(path.join(dir, docFiles[name]), "utf8")
      return [name, { text, hash: digest(text) }] as const
    }),
  )
  return Object.fromEntries(entries) as Docs
}

/** Stable short version derived only from the two documents the user accepts. */
export function consentVersion(docs: Docs) {
  return digest(`${docs.terms.hash}:${docs.privacy.hash}`).slice(0, 16)
}

export function consentValid(consent: Consent | undefined, docs: Docs) {
  return Boolean(
    consent &&
      consent.version === consentVersion(docs) &&
      consent.terms === docs.terms.hash &&
      consent.privacy === docs.privacy.hash,
  )
}
