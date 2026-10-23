/**
 * Kebijakan bawaan aplikasi untuk config OTA.
 *
 * Kunci publik di bawah adalah kunci penandatangan rilis config. Kunci privatnya
 * HANYA disimpan sebagai secret CI (`CONFIG_SIGNING_KEY`) — jangan pernah commit.
 * Rotasi: tambahkan kunci baru di sini, rilis aplikasi, lalu mulai menandatangani
 * dengan kunci baru. `HYPER_CONFIG_PUBLIC_KEY` menimpa nilai ini untuk pengujian.
 */
const DEFAULT_PUBLIC_KEY = "MCowBQYDK2VwAyEA6MmMQqlYGmpQo2ccbJ1u7RQiTPecvpNzMsQDaaPIxGM="

// Ditanam saat build rilis (vite `define`). `typeof` aman ketika build lokal/uji tidak mendefinisikannya.
declare const OPENCODE_CHANNEL: string | undefined
const buildChannel = typeof OPENCODE_CHANNEL === "string" ? OPENCODE_CHANNEL : undefined

export function publicKey() {
  // Override lingkungan hanya untuk build lokal/uji. Build rilis memakai kunci yang
  // ditanam di binary; env pengguna tidak boleh mengarahkannya ke kunci penyerang.
  if (buildChannel !== undefined && buildChannel !== "local") return DEFAULT_PUBLIC_KEY
  if (process.env.OPENCODE_CHANNEL !== undefined && process.env.OPENCODE_CHANNEL !== "local")
    return DEFAULT_PUBLIC_KEY
  return process.env.HYPER_CONFIG_PUBLIC_KEY ?? DEFAULT_PUBLIC_KEY
}

/**
 * Modul provider yang boleh dipilih config pusat. `package` adalah specifier impor,
 * jadi daftar ini mencegah config yang ditandatangani mengimpor kode sembarang.
 */
export const allowedPackages: readonly string[] = [
  "@opencode/ai/providers/openai-compatible",
  "@opencode/ai/providers/anthropic",
  "@opencode/ai/providers/google",
  "@opencode/ai/providers/openai",
  "@opencode/ai/providers/openrouter",
]
