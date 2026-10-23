/**
 * Kebijakan bawaan aplikasi untuk config OTA.
 *
 * Kunci publik di bawah adalah kunci penandatangan rilis config. Kunci privatnya
 * HANYA disimpan sebagai secret CI (`CONFIG_SIGNING_KEY`) — jangan pernah commit.
 * Rotasi: tambahkan kunci baru di sini, rilis aplikasi, lalu mulai menandatangani
 * dengan kunci baru. `HYPER_CONFIG_PUBLIC_KEY` menimpa nilai ini untuk pengujian.
 */
const DEFAULT_PUBLIC_KEY = "MCowBQYDK2VwAyEA6MmMQqlYGmpQo2ccbJ1u7RQiTPecvpNzMsQDaaPIxGM="

export function publicKey() {
  // Override hanya untuk build lokal/uji: build rilis tidak boleh bisa diarahkan
  // ke kunci penyerang lewat variabel lingkungan.
  const channel = process.env.OPENCODE_CHANNEL ?? "local"
  if (channel !== "local") return DEFAULT_PUBLIC_KEY
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
