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
    // Remote-first: the memory server runs on the MiniMax model that ships with
    // OpenCode, reached through the router the user already configured (the
    // "ocg/" route). The local model is never used for memory — it stays an
    // offline alternative for the agent only.
    llm: {
      provider: "openai",
      // Primary member of the chain; the same model id OpenCode itself uses.
      model: "ocg/minimax-m3.1-flash-free",
      // Failover members, tried in order when the primary is unreachable. The
      // upstream free route intermittently answers "api_key_expired", so a
      // second member keeps memory extraction running.
      failover: ["cx/gpt-6-luna", "ocg/mimo-v2.6-flash"],
      // Consolidation merges raw facts into observations: a summarisation job,
      // not a reasoning one. It gets its own chain so the backlog drains fast
      // instead of waiting on the reasoning model's latency.
      consolidation: { model: "cx/gpt-6-luna", failover: ["ocg/mimo-v2.6-flash"] },
      timeout: 300,
      maxRetries: 2,
    },
    // Offline alternative: only used when no router credential is configured.
    offline: { provider: "lmstudio", baseUrl: "http://localhost:1234/v1", model: "spark-x2.5-4b" },
  },
  lmstudio: { version: "0.4.25-1", port: 1234, jitUnloadSeconds: 900 },
  models: [
    {
      id: "spark-x2.5-4b",
      tier: "lite",
      publisher: "XHToken",
      repo: "Spark-X2.5-4B-GGUF",
      file: "Spark-X2.5-4B-Q4_K_M.gguf",
      bytes: 2600224352,
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
      // F6 forensic layer: DuckDB for transaction analysis, NetworkX for fund-flow
      // cycle detection, docxtpl for BAP/LHP letter templates, plotly for static charts.
      "duckdb>=1.1",
      "networkx>=3.4",
      "docxtpl>=0.19",
      "plotly>=5.24",
      "kaleido>=0.2",
    ],
  },
}
