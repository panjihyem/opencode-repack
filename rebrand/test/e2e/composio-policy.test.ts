import { expect, test } from "bun:test"
import { authorizeComposio } from "../../files/desktop/hyper/composio-policy"

test("Composio pilot admits only one public read tool and isolates user/project/session", () => {
  const request = { project: "public-project", activeProject: "public-project", user: "owner", activeUser: "owner", session: "ses_demo", activeSession: "ses_demo", dataClass: "public", tool: "GITHUB_GET_REPOSITORY", keyPresent: true }
  expect(authorizeComposio(request)).toEqual({ toolkits: ["github"], tools: { github: { enable: ["GITHUB_GET_REPOSITORY"] } }, manageConnections: { enable: false }, sandbox: { enable: false }, sessionPreset: "DIRECT_TOOLS" })
  for (const change of [{ dataClass: "case-original" }, { dataClass: "internal" }, { project: "other" }, { user: "other" }, { session: "other" }, { keyPresent: false }, { tool: "GITHUB_DELETE_REPOSITORY" }, { tool: "GITHUB_CREATE_ISSUE" }])
    expect(() => authorizeComposio({ ...request, ...change })).toThrow()
})
