# Verify — 0005-validate-windows-installer-and-office-skill

PASS · 2026-10-27T03:25:12.186Z · commands from explicit

## Commands

### `cd packages/server && bun test test/auth.test.ts` → exit 0 (2s)

```
bun test v1.4.4 (38afee6c8)

test\auth.test.ts:
[03:23:59.532] INFO (#2): database schema bootstrap started {
  migrations: 50,
}
[03:23:59.565] INFO (#2): database schema bootstrap completed {
  migrations: 50,
  durationMs: 33,
}

 3 pass
 0 fail
 10 expect() calls
Ran 3 tests across 1 file. [2.16s]
```

### `cd rebrand && bun test test/e2e/deck-quality.test.ts test/e2e/graphify-integration.test.ts test/e2e/deck-assets.test.ts test/e2e/deck-image-generation.test.ts test/e2e/composio-policy.test.ts` → exit 0 (72s)

```
bun test v1.4.4 (38afee6c8)

 5 pass
 0 fail
 65 expect() calls
Ran 5 tests across 5 files. [72.20s]
```

## Acceptance criteria

4/4 met

| AC | Met | Text |
|---|---|---|
| AC-01 | x (tasks) | NSIS `hyper-ai-desktop-win-x64.exe` built from current commit, exists and is nonempty; bundle includes Graphify CLI, Office deck source and runtime; recorded SHA256 and exact commit. |
| AC-02 | x (tasks) | Isolated source-module provisioning test creates managed `hyper-report/SKILL.md` pointing at provisioned `deck.py` and preserves user-authored skill/script; package resource `deck.py` independently generates a synthetic PPTX with PNG/native chart and renders to PDF. A launched installed-app end-to-end skill invocation is **not** covered; distribution requires separate smoke test. |
| AC-03 | x (tasks) | Packaged Graphify CLI still rejects missing marker, Case Secure mode, docs/case code on all actions; only synthetic repo tested. No Hindsight or real project state modified. |
| AC-04 | x (tasks) | Verification and independent review distinguish installer build from installed-app smoke and Node server authentication runtime, reporting limits honestly. Close only as isolated Beta test artifact, not distribution; no cloud capability implied. |

## Tasks (ledger)

| Task | State | By | Evidence | Note |
|---|---|---|---|---|
| T-01 | done | opencode@riefky | cd rebrand && bun test test/e2e/graphify-integration.test.t… |  |
| T-02 | done | opencode@riefky | cd rebrand && bun test test/e2e/deck-quality.test.ts → exit… |  |
| T-03 | done | opencode@riefky | cd rebrand && bun test test/e2e/graphify-integration.test.t… |  |
| T-04 | done | opencode@riefky | cd packages/server && bun test test/auth.test.ts → exit 0 l… |  |

4/4 done · 0 skipped · 0 claimed · 0 blocked · 0 stale · 0 open
