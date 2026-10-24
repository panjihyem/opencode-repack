// Single source of truth for the Hyper AI identity. Change values here, not in
// apply.ts, when the product name, bundle id or release repository moves.
export const brand = {
  name: "Hyper AI",
  cli: "hyper-ai",
  // Desktop bundle id. `.dev` / `.beta` suffixes are kept for non-prod channels.
  appId: "ai.hyperai.desktop",
  // URL scheme for deep links; deliberately different from `opencode` so the
  // repack can be installed next to the official app.
  scheme: "hyper-ai",
  vendor: "Bikinin AI",
  maintainerEmail: "noreply@bikinin.ai.id",
  // Support/legal contact shown in the setup documents (user-provided).
  supportEmail: "info@talentabangsa.com",
  repo: { owner: "panjihyem", name: "opencode-repack" },
  homepage: "https://github.com/panjihyem/opencode-repack",
  summary: "AI coding agent, repacked from OpenCode",
}
