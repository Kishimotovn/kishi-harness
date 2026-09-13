---
description: "Connect a local MCP client to DSH creator tools for native UI prototyping, with an owned Session, command logging, and the existing Client approval flow."
kind: "package-bundle"
---

# @deepseek-ai/dsh-experimental-mcp-creator

## Summary

Use DSH's creator tools from a local MCP client such as VS Code Copilot. Inspect live Host and Client capabilities, define a temporary plugin, and run it through DSH's native approval panel. The connection owns one dedicated creator Session and does not request model inference. This private development package is opt-in and requires a loopback-only Web profile. Treat creator access as shell access, not as a sandboxed extension API.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

## Use this package

Follow the [VS Code creator setup guide](../../../docs/user/guide/creator-mcp.md). Installing this private bundle adds its [profile layer](cordis.patch.yml), which mounts the creator plugin beside the Web application and reserves stdout for MCP. No shipped profile includes it. Do not install it in a normal interactive profile or combine it with another stdio server.

| Field | Default | Meaning |
| --- | --- | --- |
| `cwd` | Required | Existing absolute workspace directory |
| `sessionId` | Required | Identity of the new creator Session; an existing live identity is not adopted |
| `callTimeoutMs` | `60000` | Tool-call deadline in milliseconds, including Client inspection waits; integer from 1 to 2147483647 |

The supplied overlay creates a fresh Session identity for each process. The native browser lists it as **VS Code Creator**, and MCP initialization names its exact identity and local Web URL. Client queries require a responding DSH page. A missing or disposed Session rejects calls; the connection never selects a different live Session.

MCP initialization also advertises a local browser sign-in file for browsers that do not share the default browser's cookie. Open that file in the browser, then navigate directly to the clean Web URL. Its redirect uses the existing DSH token exchange; `HttpOnly` and `SameSite=Strict` remain enabled. The launch token stays inside the temporary file, never in tool results. On POSIX the containing directory is mode `0700` and the file is `0600`; normal bridge shutdown removes both. Do not read, print, or share the file's contents.

The MCP roster contains `cordis_inspect_list`, `cordis_inspect_query`, `cordis_inspect_self`, `cordis_define`, `cordis_run`, `cordis_stop`, and `cordis_undefine`. Discovery copies their live descriptions and input schemas. Responses preserve the DSH content and error result; `structuredContent` contains the canonical result, including its `value` when available. An `awaiting-approval` or `starting` result is not a completed activation.

One call may run at a time. MCP cancellation, the configured deadline, connection closure, and Session disposal cancel the current call. The bridge waits for tool execution to settle before accepting another call or finishing shutdown. A tool or middleware that ignores cancellation can delay settlement.

-----

## Understand the Implementation

<details>
<summary>Implementation internals</summary>

The [Profile plugin](src/index.ts) creates an Agent-backed Session, mounts the shipped `cordis` preset read-only, and rejects model pre-steps for that Session. The [MCP server](src/server.ts) exposes an explicit creator-tool allowlist through the official MCP SDK. The [command adapter](src/command.ts) invokes the existing tool pipeline through a scoped `creator-mcp` command, preserving tool policy and producing paired `command/run` and `command/done` records without inventing assistant messages or turn/step events.

The native Cordis panel owns Client approval and activation. Command results record the synchronous outcome, while the dynamic runner owns later activation state. This package does not add a Chat renderer, change the agent loop, or define Session event types.

The [browser handoff](src/browser-handoff.ts) writes the running Connection service's authenticated URL to a private redirect file under the workspace's ignored `.cache/`. VS Code permits local navigation within its trusted workspace; a system-temporary path outside that workspace is refused. The public file path lets browser automation complete the existing login without carrying the token through the model. A direct clean-URL navigation after the file redirect handles strict-cookie cross-site redirect behavior without weakening authentication.

No invariant companion is published: the package exposes no independent runtime projection to reconcile. Each request checks the exact Agent owner; tests cover command registration, protocol outcomes, cancellation, real profile startup, and native Client activation/removal.

</details>

-----

## Further Exploration

- [Creator-mode plugin skill](../../preset/agent-presets/presets/cordis/skills/cordis-plugin-development/SKILL.md) explains live inspection and narrow Client-slot registration.
- [Creator tools](../../extensions/tool-cordis/README.md) own definitions, activation, diagnostics, and removal.
- [Commands](../../interaction/commands/README.md) own the model-free execution log.
- [Decision record](../../../.agents/notes/implemented/feature/2026-09-09-creator-tools-over-local-mcp.md) records the ownership and transport trade-offs.

## Model Experience

### External Creator Requests

#### What the model sees

The connected MCP client receives the selected live creator-tool schemas and their normal output content, plus the canonical result in `structuredContent`. The dedicated DSH Session does not issue a model request; its command records do not become fabricated assistant history.

#### Token effect

Tool schemas and returned results consume context in the external MCP client's model. The bridge adds no inference request in DSH and no additional system-prompt section of its own.

#### KV Cache effect

The external client owns its request and cache policy. Changing live tool schemas can change that client's request prefix. No DSH model request or DSH KV-cache entry is created by the dedicated creator Session.

## Known Limitations and Deferred Work

The connection is local development tooling, with these deliberate limits:

- Only stdio and the seven creator tools are exposed; there is no general remote tool executor, HTTP MCP listener, Resources service, or Prompts service.
- Dynamic definitions remain process-local. Restarting MCP creates a fresh Session; saved command history does not restore running plugins.
- Calls appear as command history, not model-generated tool cards. Use the existing native Cordis panel for approvals, versions, and active plugin state.
- DSH steering notifications are not forwarded to the MCP client. After the human answers a Client approval, use `cordis_inspect_self` to read the resulting state.
- Generic tool policy that requires an open model turn fails closed in this model-free Session. The bridge does not fabricate a turn to satisfy it.
- VS Code server trust and discovery require an editor action. Automated MCP/browser tests do not prove that a particular editor session has enabled the server.

### Dev Note

None.
