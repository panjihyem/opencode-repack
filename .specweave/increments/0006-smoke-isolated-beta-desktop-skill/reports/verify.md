# Verify — 0006-smoke-isolated-beta-desktop-skill

FAIL · 2026-10-27T05:02:08.261Z · commands from package.json scripts

## Commands

### `npm run test` → exit 1 (1s)

```

> opencode@2.0.32 test
> echo 'do not run tests from root' && exit 1

'do not run tests from root' 
```

### `npm run lint` → exit 1 (1s)

```

> opencode@2.0.32 lint
> oxlint && ast-grep scan -c script/ast-grep/gui-extensions/sgconfig.yml && bun script/sdk-docs.ts

Access is denied.
```

## Acceptance criteria

0/3 met

| AC | Met | Text |
|---|---|---|
| AC-01 |   | Test desktop launches in visible isolated profile; no real user config or documents changed. Packaged CLI reports `v2.0.32`; server denies unauthenticated forged MCP ticket and accepts synthetic authenticated `/api/info` on a temporary loopback server. |
| AC-02 |   | Desktop startup using valid isolated consent and pre-existing Office venv registers managed `hyper-report/SKILL.md`, points to an existing `deck.py` in isolated data dir, and script creates synthetic PPTX/PDF. Existing user-owned skill and deck in test fixture are preserved. |
| AC-03 |   | Report differentiates desktop launch, service state, discovered skill and limitations. Tests and fresh-context review pass. No artifact published or real profile modified. |

## Tasks (ledger)

| Task | State | By | Evidence | Note |
|---|---|---|---|---|
| T-01 | done | opencode@riefky | cd packages/desktop && bun test src/main/lifecycle/configur… |  |
| T-02 | done | opencode@riefky | cd rebrand && bun test test/e2e/deck-quality.test.ts → exit… |  |
| T-03 | claimed | opencode@riefky |  |  |

2/3 done · 0 skipped · 1 claimed · 0 blocked · 0 stale · 0 open
