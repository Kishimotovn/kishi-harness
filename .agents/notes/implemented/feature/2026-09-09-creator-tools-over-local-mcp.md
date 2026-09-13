# Agent Note: Creator tools over local MCP

Status: implemented

## Problem

An external coding assistant needs live DSH Host and Client inspection to prototype the native UI. Loading creator-mode instructions does not give that assistant the running harness's tools. DSH's MCP client imports external tools, while creator operations require an Agent-backed Session and Client queries require a responding browser.

## Decision

The private [creator MCP plugin](../../../../packages/experimental/mcp-creator/README.md) exposes the existing seven creator tools through a local stdio MCP connection in an opt-in Web profile. It owns one exact creator Session, mounts the shipped preset read-only, and rejects model pre-steps for that Session. The normal CLI dependency graph and shipped profile defaults do not mount the bridge.

Each invocation uses a scoped command and the existing tool pipeline. Commands supply paired log-only lifecycle records without adding fake assistant messages, model calls, or turn/step events. Native Cordis state and the existing panel retain Client approval and activation. The MCP server preserves live input schemas and returns the canonical DSH result as structured content.

One in-flight operation owns cancellation and draining. Session disposal, MCP closure, client cancellation, and the configured deadline cancel the call. A missing owner, unrelated tool, or overlapping call is rejected. The Web server must bind to `127.0.0.1`; no additional HTTP listener or MCP authentication scheme is introduced.

The integrated browser signs in through a private temporary redirect file containing the running Connection service's launch URL. MCP advertises only the file path and clean Web URL. The directory lives under the workspace's ignored `.cache/` because VS Code refuses local files outside trusted workspace folders. On POSIX the directory and file are owner-only, and normal bridge shutdown removes them. Navigating to the clean URL after the file redirect preserves DSH's strict cookie policy while allowing a browser with a separate cookie store to authenticate.

## Alternatives considered

**Direct tool execution without a command** runs middleware but omits the command lifecycle record. The agent loop owns normal model tool-call records; inventing those outside their turn/step history would misrepresent their source.

**A new external-call method in the agent loop** would broaden a shared runtime API when the existing command service already supplies model-free execution and logging. The bridge remains an opt-in plugin.

**HTTP MCP beside the Web server** would require an additional authentication path for the editor. Browser cookies are not automatically credentials for a separate MCP client. Local stdio avoids that credential handoff.

**Returning the launch token in a tool result or disabling Web authentication** would expose a credential to model history or weaken the existing browser checks. The private-file handoff uses the normal token exchange without either change.

**Recreating the conversation UI** duplicates functionality that DSH already supplies and prevents reliable use of its live slots and lifecycle controls. The bridge uses the native Client rather than a parallel chat renderer.

## Consequences

The external assistant can inspect and modify the running native UI without spending a DSH model request. It gains creator-level authority, which must be treated as shell access. VS Code trust and DSH Client-package approval remain separate human actions.

MCP calls appear as commands, not model-generated tool cards. Later DSH steering is not forwarded to MCP; callers inspect the package state after approval. Dynamic definitions remain process-local, so a restart creates a fresh Session and does not restore packages from command history. Generic policy that requires an open model turn fails closed.

The [MCP client decision](2026-07-07-mcp-client-plugin.md) remains independently valid for importing external tools; this outbound creator connection does not replace that package or its policy. No active record is fully superseded.

## Verification

Focused tests cover schema discovery, logged execution, tool denial, overlapping calls, cancellation, timeout, missing Session, real source/built profile startup, and a native Client-slot change that remains absent before approval and disappears on stop. The [tooling task](https://github.com/Kishimotovn/kishi-harness/issues/17) records live editor discovery, human-approved Client activation, and removal verified through the Client slot registry. The native browser test separately verifies the rendered change and intact composer.
