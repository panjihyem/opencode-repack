# Verify — 0002-release-public-only-multi-agent-routing

PASS · 2026-10-26T09:42:10.409Z · commands from explicit

## Commands

### `cd rebrand && bun test test/e2e/agent-bundle.test.ts test/e2e/agent-command.test.ts test/agent-policy.test.ts test/e2e/agent-gate.test.ts test/e2e/agent-fallback.test.ts test/e2e/agent-orchestrator.test.ts test/e2e/multi-agent-baseline.test.ts` → exit 0 (1s)

```
bun test v1.4.4 (38afee6c8)

 19 pass
 0 fail
 90 expect() calls
Ran 19 tests across 7 files. [264.00ms]
```

## Acceptance criteria

5/5 met

| AC | Met | Text |
|---|---|---|
| AC-01 | x (tasks) | Desktop overlay build contains standalone public-text plugin and installer helper writes it into OpenCode plugin directory; no marker means zero model calls; case mode suppresses installation. Each execution requires opt-in marker in active project. Project root can invoke in own or descendant top-level session. |
| AC-02 | x (tasks) | Command rejects unknown/non-public classes, attachments, empty text and named token/secret markers before model call; rechecks project opt-in and case mode before each model call and publishing; only exact allowlisted model selected. Stateless `generate.text` has no tools, child session or file output; no protection against unlabeled secrets in pasted text is claimed. |
| AC-03 | x (tasks) | Public synthetic text passes bounded independent specialist stages then dependent reviewer; failures halt and no file is written. |
| AC-04 | x (tasks) | Fake generator records exact model and zero calls for denied inputs; ambiguous generation failure causes no retry/fallback or partial publish. No fake HTTP provider or provider-byte security claim. |
| AC-05 | x (tasks) | Inbox queue/steer unchanged; docs state explicit declaration limits. Windows desktop build and unpacked artifact contain command and required modules. NSIS installer unavailable in offline environment; candidate remains unreleased. |

## Tasks (ledger)

| Task | State | By | Evidence | Note |
|---|---|---|---|---|
| T-01 | done | opencode@riefky | cd rebrand && bun test test/e2e/agent-command.test.ts → exi… |  |
| T-02 | done | opencode@riefky | cd rebrand && bun test test/e2e/agent-command.test.ts → exi… |  |
| T-03 | done | opencode@riefky | cd rebrand && bun test test/e2e/agent-bundle.test.ts test/e… |  |
| T-04 | done | opencode@riefky | cd rebrand && bun test test/e2e/agent-bundle.test.ts test/e… |  |
| T-05 | done | opencode@riefky | cd rebrand && bun test test/e2e/agent-command.test.ts → exi… |  |

5/5 done · 0 skipped · 0 claimed · 0 blocked · 0 stale · 0 open
