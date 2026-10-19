// Pinned components provisioned for Hyper AI. Everything here is downloaded
// from its publisher on the user's machine; nothing third-party is
// redistributed inside the installer except open source npm packages
// (Context7), which rebrand/scripts/prepare-bundle.ts vendors at
// build time.
export const manifest = {
  context7: {
    package: "@upstash/context7-mcp",
    version: "4.4.2",
    // Relative to the bundle root (resources/hyper-bundle).
    entry: "context7/node_modules/@upstash/context7-mcp/dist/index.js",
  },
  viz: {
    package: "echarts",
    version: "6.1.0",
    entry: "viz/node_modules/echarts/dist/echarts.min.js",
  },
  uv: { version: "0.9.0" },
  hindsight: {
    package: "hindsight-api",
    version: "1.0.0",
    python: "3.12",
    host: "127.0.0.1",
    port: 8888,
    llm: { provider: "lmstudio", baseUrl: "http://localhost:1234/v1", model: "qwen3.5-9b" },
  },
  lmstudio: { version: "0.4.25-1", port: 1234, jitUnloadSeconds: 900 },
  models: [
    // Per-tier defaults, picked by physical RAM (see tieredModel in components).
    // Sizes are the exact byte counts of the pinned Q4_K_M quantizations.
    {
      id: "qwen3.5-9b",
      tier: "full",
      publisher: "unsloth",
      repo: "Qwen3.5-9B-GGUF",
      file: "Qwen3.5-9B-Q4_K_M.gguf",
      bytes: 5680522464,
    },
    {
      id: "qwen3.5-4b",
      tier: "lite",
      publisher: "unsloth",
      repo: "Qwen3.5-4B-GGUF",
      file: "Qwen3.5-4B-Q4_K_M.gguf",
      bytes: 2740937888,
    },
    {
      id: "lfm2.5-2.6b",
      tier: "nano",
      publisher: "LiquidAI",
      repo: "LFM2.5-2.6B-GGUF",
      file: "LFM2.5-2.6B-Q4_K_M.gguf",
      bytes: 1674455040,
    },
  ],
  docling: { package: "docling", version: "2.140.0", python: "3.12" },
  // Office toolkit: reading/writing Excel (formulas included), Word, PowerPoint,
  // PDF and charts for office & tax-investigation work. Minimum-version bounds
  // keep installs reproducible while letting uv resolve the newest compatible
  // builds on the user's machine.
  office: {
    python: "3.12",
    packages: [
      "openpyxl>=3.1",
      "pandas>=2.2",
      "formulas>=0.6",
      "python-docx>=1.1",
      "python-pptx>=1.0",
      "matplotlib>=3.9",
      "reportlab>=4.2",
      "pypdf>=5",
    ],
  },
}
