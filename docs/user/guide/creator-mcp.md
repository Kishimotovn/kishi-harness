# Use DSH Creator Tools from VS Code

## Summary

Connect VS Code Copilot to a dedicated local DSH creator Session for native UI prototyping. DSH keeps its conversation, composer, plugin panel, and approval flow. This setup requires a repository checkout with dependencies and Web artifacts already built; it does not provision a hosted application or require model-provider calls.

## Table of Contents

- [Prepare the profile](#prepare-the-profile)
- [Connect VS Code](#connect-vs-code)
- [Open the integrated browser](#open-the-integrated-browser)
- [Make a reversible UI change](#make-a-reversible-ui-change)
- [Stop and recover](#stop-and-recover)
- [Verification](#verification)
- [Dev Note](#dev-note)

## Prepare the Profile

Run these commands from the repository root. The separate Harness home keeps creator sessions and settings apart from a normal DSH installation.

```sh
./node_modules/.bin/tsc -b packages/experimental/mcp-creator --pretty false
./node_modules/.bin/tsdown --filter @deepseek-ai/dsh-experimental-mcp-creator --logLevel warn
DSH_HOME="$HOME/.dsh-kishi-creator" node apps/cli/lib/bin.js plugin --profile web add "link:$PWD/packages/experimental/mcp-creator" --offline --ignore-scripts
```

The installation links the package and activates its [bundle layer](../../../packages/experimental/mcp-creator/cordis.patch.yml) in the selected profile. The layer reserves stdout for MCP, disables automatic model-generated session titles, and mounts the creator connection. Nothing is added to the normal Harness home.

## Connect VS Code

The workspace [MCP configuration](../../../.vscode/mcp.json) defines `dshCreator`. In **MCP: List Servers**, start that server and review its trust prompt. The configuration uses `node` from the editor's environment; if Node is not available there, set `command` to your Node executable's absolute path.

The server launches the supported `dsh --profile web` application with the installed creator bundle, chooses a free loopback port, and opens the native Web UI. The launch token is passed to the browser without printing it. In that UI, open **VS Code Creator**. MCP initialization and the server log show the clean local URL and Session identity.

Use the chat tool picker to enable the discovered creator tools. If this chat still lacks them, confirm the server is running and start a new chat turn after discovery. The checked-in configuration alone does not mean the tools are enabled in a particular editor session.

## Open the Integrated Browser

VS Code's integrated browser has its own cookies. If the clean local URL reports that authentication is required, open the **Browser sign-in file** advertised in the MCP initialization instructions or server log using the browser-opening tool. The file lives in an owner-only temporary directory under the workspace's ignored `.cache/` so VS Code can open it within the trusted workspace. Do not use a file-reading tool: the private file contains the launch credential.

After the file redirects, navigate directly to the advertised clean native Web URL. DSH's strict cookie may withhold authentication during the first cross-site redirect; a fresh navigation completes this flow without changing cookie policy. The resulting URL contains no token. The assistant can then inspect the native page and take screenshots in VS Code. Restarting the server changes the handoff path and may change the port, so use the current connection's values.

## Make a Reversible UI Change

Load the [composition skill](../../../packages/preset/agent-presets/presets/cordis/skills/editing-cordis-compositions/SKILL.md) and [plugin-development skill](../../../packages/preset/agent-presets/presets/cordis/skills/cordis-plugin-development/SKILL.md). Call `cordis_inspect_list`, select the returned Client Slot provider, and query the exact slot before defining code. Prefer an additive inner slot; replacing a root region can remove its descendants.

Define one small Client package, then run the returned package identity. The human approves it in DSH's native Cordis panel. `awaiting-approval` and `starting` describe pending work, not success. Read `cordis_inspect_self` after approval to confirm the final state, and inspect the actual browser result. Stop the package to withdraw its effects; remove it only when its versions are no longer needed.

## Stop and Recover

Stop `dshCreator` through VS Code's MCP server controls. Closing stdin requests DSH shutdown, cancellation reaches the active tool, and cleanup drains it before disposing the creator Session and deleting the temporary browser sign-in file. An uncooperative tool can delay settlement; DSH's launcher owns the final process-shutdown deadline.

Restarting creates a fresh creator Session and clears temporary dynamic definitions. A saved plugin ID from the old process is not a reference to a new plugin. Keep authored source in the repository and inspect the new runtime before defining it again. Rebuild the bridge after source edits, then restart the server; do not assume a build changed an existing process.

## Verification

These focused commands exercise the command adapter, MCP protocol, built DSH startup, and an isolated native browser. The browser test uses the existing approval controls in a test-only Session and makes no model request.

```sh
./node_modules/.bin/vitest run packages/experimental/mcp-creator/tests/command.spec.ts packages/experimental/mcp-creator/tests/server.spec.ts
./node_modules/.bin/vitest run packages/experimental/mcp-creator/tests/browser-handoff.spec.ts
DSH_EXAMPLE_MODE=lib ./node_modules/.bin/vitest run packages/experimental/mcp-creator/tests/profile.spec.ts
DSH_SNAPSHOT=replay ./node_modules/.bin/vitest run --config vitest.web.config.ts apps/web/tests/creator-mcp.e2e.ts
```

The [package reference](../../../packages/experimental/mcp-creator/README.md) owns configuration, command logging, cancellation, and limitations. Native browser evidence does not replace the editor's server-trust decision or the human's approval of a live UI change.

## Dev Note

None.
