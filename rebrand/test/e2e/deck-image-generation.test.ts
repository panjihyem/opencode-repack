import { expect, test } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { generatePublicImage } from "../../files/desktop/hyper/image-generation"

test("fake image provider requires public entitlement and saves bounded PNG without credentials", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "hyper-image-gen-"))
  const output = path.join(dir, "image.png")
  const input = { baseURL: "https://router.example/v1", model: "cx/gpt-6-sol-image", prompt: "Synthetic red square", output, dataClass: "public", consent: true, apiKey: "FAKE_KEY_NOT_A_SECRET" }
  const bytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0])
  const calls: Array<{ url: string; body?: string }> = []
  let offered = input.model
  const send: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), body: init?.body as string | undefined })
    if (String(url).endsWith("/models/image")) return Response.json({ data: [{ id: offered }] })
    if (String(url).endsWith("/images/generations")) return Response.json({ data: [{ b64_json: bytes.toString("base64") }] })
    throw new Error("Unexpected endpoint")
  }
  try {
    await expect(generatePublicImage({ ...input, dataClass: "case-original" }, send)).rejects.toThrow("Public")
    await expect(generatePublicImage({ ...input, consent: false }, send)).rejects.toThrow("consent")
    expect(calls).toHaveLength(0)
    expect(await generatePublicImage(input, send)).toBe(output)
    expect(calls.map((call) => call.url)).toEqual(["https://router.example/v1/models/image", "https://router.example/v1/images/generations"])
    expect(JSON.parse(calls[1].body!).model).toBe(input.model)
    expect(await readFile(output)).toEqual(bytes)
    const manifest = await readFile(`${output}.generation.json`, "utf8")
    expect(manifest).toContain(input.model)
    expect(manifest).not.toContain(input.apiKey)
    await expect(generatePublicImage(input, send)).rejects.toThrow("exists")
    const other = path.join(dir, "other.png")
    offered = "cx/gpt-6-sol"
    await expect(generatePublicImage({ ...input, output: other }, send)).rejects.toThrow("not entitled")
    expect(calls.filter((call) => call.url.endsWith("/images/generations"))).toHaveLength(1)
  } finally { await rm(dir, { recursive: true, force: true }) }
})
