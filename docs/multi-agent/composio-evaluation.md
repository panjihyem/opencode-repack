# Composio evaluation — no connection active

Status: only fake policy contract tested. No API key, OAuth account, MCP server, or tool has been installed in Hyper AI. `composio-policy.ts` is not registered by desktop overlay; it cannot authorize real calls.

Composio sessions default to **all** toolkits if no allowlist is supplied. A later public-only pilot must bind a project/user/session to one connected account and one explicit read tool (`github/GITHUB_GET_REPOSITORY` in fixture), with remote sandbox and connection management disabled. Never pass case/internal/confidential text, attachments, tokens or prompts to Composio. Any send/publish/write action requires its own consent and implementation gate.

Current MCP `session.mcp.headers` can contain a project API key and must not be placed in config, logs, or model output. MCP calls go directly to Composio and bypass SDK `beforeExecute`/`afterExecute` hooks; if runtime interception is required, use SDK direct tools with explicit server-side enforcement. Approval fallback must deny when client cannot elicit. A fake request that mutates data class, user, project, session, key presence or tool name fails closed (`composio-policy.test.ts`). No live connected-account evidence is claimed. Rollback is no connection or plugin to remove; separate approved increment required for any OAuth pilot.

Sources: [session policies](https://docs.composio.dev/docs/configuring-sessions), [MCP trade-offs](https://docs.composio.dev/docs/sessions-via-mcp), [pricing](https://composio.dev/pricing).
