// HYPER_AI_MANAGED — fake-provider contract only; not registered as a tool.
import { mkdir, stat, writeFile } from "node:fs/promises"
import path from "node:path"

const maximum = 5_000_000
const png = [137, 80, 78, 71, 13, 10, 26, 10]

export async function generatePublicImage(input: { baseURL: string; model: string; prompt: string; output: string; dataClass: string; consent: boolean; apiKey: string }, send: typeof fetch) {
  if (!input.consent || input.dataClass !== "public" || !input.prompt.trim() || input.prompt.length > 500) throw new Error("Public image generation consent required")
  if (!input.apiKey) throw new Error("Image API key missing")
  const base = new URL(input.baseURL)
  if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash) throw new Error("Image provider URL rejected")
  if (await stat(input.output).catch(() => undefined) || await stat(`${input.output}.generation.json`).catch(() => undefined)) throw new Error("Output already exists")
  const api = base.href.replace(/\/$/, "")
  const headers = { Authorization: `Bearer ${input.apiKey}` }
  const catalog = await send(`${api}/models/image`, { headers, redirect: "error", signal: AbortSignal.timeout(10000) })
  if (!catalog.ok) throw new Error("Image model catalog unavailable")
  const list: unknown = await catalog.json()
  if (!list || typeof list !== "object" || !Array.isArray((list as { data?: unknown }).data) ||
    !(list as { data: Array<{ id?: string }> }).data.some((entry) => entry.id === input.model && entry.id !== "cx/gpt-6-sol")) throw new Error("Image model not entitled")
  const response = await send(`${api}/images/generations`, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ model: input.model, prompt: input.prompt, size: "1024x1024", response_format: "b64_json" }), redirect: "error", signal: AbortSignal.timeout(120000) })
  if (!response.ok) throw new Error(`Image provider returned HTTP ${response.status}`)
  const result: unknown = await response.json()
  const base64 = (result as { data?: Array<{ b64_json?: unknown }> })?.data?.[0]?.b64_json
  if (typeof base64 !== "string" || base64.length > maximum * 1.4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw new Error("Invalid image response")
  const bytes = Buffer.from(base64, "base64")
  if (bytes.length > maximum || !png.every((value, index) => bytes[index] === value)) throw new Error("Expected bounded PNG image")
  await mkdir(path.dirname(input.output), { recursive: true })
  await writeFile(input.output, bytes, { flag: "wx" })
  await writeFile(`${input.output}.generation.json`, JSON.stringify({ provider: base.origin, model: input.model, data_class: input.dataClass, generated_at: new Date().toISOString() }), { flag: "wx" })
  return input.output
}
