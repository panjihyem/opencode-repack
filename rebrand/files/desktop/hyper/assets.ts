// HYPER_AI_MANAGED — optional Commons image with explicit source and license.
import { mkdir, stat, writeFile } from "node:fs/promises"
import path from "node:path"

const hosts = new Set(["commons.wikimedia.org", "upload.wikimedia.org"])
const maximum = 5_000_000

async function bounded(response: Response, cap: number) {
  if (!response.body) throw new Error("Image response has no body")
  const reader = response.body.getReader()
  const parts: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > cap) throw new Error("Image response too large")
      parts.push(value)
    }
  } finally {
    await reader.cancel().catch(() => undefined)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const part of parts) { bytes.set(part, offset); offset += part.byteLength }
  return bytes
}

function approved(url: string, host: string) {
  const parsed = new URL(url)
  if (parsed.protocol !== "https:" || parsed.host !== host || parsed.username || parsed.password || parsed.hash || !hosts.has(host)) throw new Error("Image URL not approved")
  return parsed
}

export async function fetchCommonsAsset(landing: string, output: string, options: { fetch?: typeof fetch; dataClass: "public" | "synthetic" | "internal" | "case-original"; consent: boolean }) {
  if (!options.consent || !["public", "synthetic"].includes(options.dataClass)) throw new Error("Public asset consent required")
  const page = approved(landing, "commons.wikimedia.org")
  const title = decodeURIComponent(page.pathname.split("/").at(-1) ?? "")
  if (!title.startsWith("File:")) throw new Error("Select a Commons file page")
  if (await stat(output).catch(() => undefined) || await stat(`${output}.license.json`).catch(() => undefined)) throw new Error("Asset already exists")
  const send = options.fetch ?? fetch
  const metadataUrl = new URL("https://commons.wikimedia.org/w/api.php")
  for (const [key, value] of Object.entries({ action: "query", format: "json", prop: "imageinfo", iiprop: "url|extmetadata", titles: title })) metadataUrl.searchParams.set(key, value)
  const metadata = await send(metadataUrl, { redirect: "manual", signal: AbortSignal.timeout(15000) })
  if (!metadata.ok || metadata.redirected || metadata.url !== metadataUrl.href || Number(metadata.headers.get("content-length") ?? 0) > 100_000) throw new Error("Image metadata response rejected")
  const metadataBytes = await bounded(metadata, 100_000)
  const body = new TextDecoder().decode(metadataBytes)
  const pages = (JSON.parse(body) as { query?: { pages?: Record<string, { imageinfo?: Array<{ url: string; extmetadata: Record<string, { value?: string }> }> }> } }).query?.pages
  const info = Object.values(pages ?? {}).find((entry) => entry.imageinfo?.[0])?.imageinfo?.[0]
  const rights = info?.extmetadata
  const creator = rights?.Artist?.value?.replace(/<[^>]*>/g, "").trim()
  const license = rights?.LicenseShortName?.value
  const licenseUrl = rights?.LicenseUrl?.value
  if (!creator || !license || !licenseUrl || !info?.url) throw new Error("Image license missing")
  const parsedLicense = new URL(licenseUrl)
  if (parsedLicense.protocol !== "https:" || parsedLicense.hostname !== "creativecommons.org") throw new Error("Image license URL not approved")
  const mediaUrl = approved(info.url, "upload.wikimedia.org")
  const response = await send(mediaUrl, { redirect: "manual", signal: AbortSignal.timeout(20000) })
  if (!response.ok || response.redirected || response.url !== mediaUrl.href || Number(response.headers.get("content-length") ?? 0) > maximum || !["image/png", "image/jpeg"].includes(response.headers.get("content-type")?.split(";")[0] ?? "")) throw new Error("Image response rejected")
  const bytes = await bounded(response, maximum)
  if (bytes.byteLength > maximum || !(bytes.slice(0, 8).every((value, index) => value === [137, 80, 78, 71, 13, 10, 26, 10][index]) || bytes.slice(0, 3).every((value, index) => value === [255, 216, 255][index]))) throw new Error("Image bytes invalid")
  const record = { landing_url: page.href, image_url: mediaUrl.href, creator, license, license_url: licenseUrl, attribution_required: rights?.AttributionRequired?.value === "true", retrieved_at: new Date().toISOString() }
  await mkdir(path.dirname(output), { recursive: true })
  await writeFile(output, bytes, { flag: "wx" })
  await writeFile(`${output}.license.json`, JSON.stringify(record, null, 2), { flag: "wx" })
  return record
}
