import { expect, test } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fetchCommonsAsset } from "../../files/desktop/hyper/assets"

test("licensed public Commons image stores provenance, rejects unsafe inputs", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "hyper-assets-"))
  const page = "https://commons.wikimedia.org/wiki/File:Public.png"
  const image = "https://upload.wikimedia.org/public.png"
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0])
  const metadata = { query: { pages: { "1": { imageinfo: [{ url: image, extmetadata: { Artist: { value: "Creator" }, LicenseShortName: { value: "CC BY 4.0" }, LicenseUrl: { value: "https://creativecommons.org/licenses/by/4.0/" }, AttributionRequired: { value: "true" } } }] } } } }
  let requests = 0
  const send: typeof fetch = async (url) => {
    requests++
    const uri = String(url)
    if (uri.startsWith("https://commons.wikimedia.org/w/api.php")) {
      const response = new Response(JSON.stringify(metadata), { headers: { "content-type": "application/json" } })
      Object.defineProperty(response, "url", { value: uri })
      return response
    }
    if (uri === image) {
      const response = new Response(png, { headers: { "content-type": "image/png" } })
      Object.defineProperty(response, "url", { value: uri })
      return response
    }
    throw new Error("unexpected URL")
  }
  const output = path.join(root, "asset.png")
  try {
    await expect(fetchCommonsAsset(page, output, { fetch: send, consent: false, dataClass: "public" })).rejects.toThrow("consent")
    await expect(fetchCommonsAsset(page, output, { fetch: send, consent: true, dataClass: "case-original" })).rejects.toThrow("consent")
    await expect(fetchCommonsAsset("https://127.0.0.1/wiki/File:Local.png", output, { fetch: send, consent: true, dataClass: "public" })).rejects.toThrow("URL")
    expect(requests).toBe(0)
    const record = await fetchCommonsAsset(page, output, { fetch: send, consent: true, dataClass: "public" })
    expect(record.license).toBe("CC BY 4.0")
    expect(record.attribution_required).toBe(true)
    expect(await readFile(output)).toEqual(png)
    expect(JSON.parse(await readFile(`${output}.license.json`, "utf8")).landing_url).toBe(page)
    await expect(fetchCommonsAsset(page, output, { fetch: send, consent: true, dataClass: "public" })).rejects.toThrow("exists")
    const oversized = path.join(root, "oversized.png")
    const huge: typeof fetch = async (url) => {
      const uri = String(url)
      const content = uri.includes("api.php") ? JSON.stringify(metadata) : Buffer.alloc(5_000_001, 0)
      const response = new Response(content, { headers: { "content-type": uri.includes("api.php") ? "application/json" : "image/png" } })
      Object.defineProperty(response, "url", { value: uri })
      return response
    }
    await expect(fetchCommonsAsset(page, oversized, { fetch: huge, consent: true, dataClass: "public" })).rejects.toThrow("too large")
    expect(await Bun.file(oversized).exists()).toBe(false)
  } finally { await rm(root, { recursive: true, force: true }) }
})
