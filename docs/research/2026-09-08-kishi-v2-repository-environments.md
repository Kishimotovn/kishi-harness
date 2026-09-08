# Kishi v2 repository environments and model credentials

## Summary

DSH provides persistent per-Agent shells, live model/provider settings, and managed credential storage, but its normal BYOK composition is not repository-scoped. Kishi still needs repository ownership and administrator authorization around these mechanisms, including an assigned-member read-only view.

Environment files do not isolate secrets. Child environments inherit a name-scrubbed parent plus explicit overrides, and the owned Linux sandbox profiles permit filesystem reads from `/` subject to underlying OS permissions. A repository command running as the credential-file owner is not denied that read merely because its cwd, config file, or writable workspace differs.

This reference records findings for [Research DSH repository environments and model credentials](https://github.com/Kishimotovn/kishi-harness/issues/15). It is not approved access policy or a shipped multi-repository security guarantee. [Decide repository access and credential ownership](https://github.com/Kishimotovn/kishi-harness/issues/7) owns the policy decisions.

## Contents

- [Scope](#scope)
- [Subprocess environment](#subprocess-environment)
- [Persistent terminals](#persistent-terminals)
- [Credential resolution](#credential-resolution)
- [Models and BYOK](#models-and-byok)
- [Configuration scoping](#configuration-scoping)
- [Linux sandbox and Docker](#linux-sandbox-and-docker)
- [Reusable primitives and gaps](#reusable-primitives-and-gaps)
- [Evidence](#evidence)
- [Dev Note](#dev-note)

## Scope

The [hosting decision](https://github.com/Kishimotovn/kishi-harness/issues/6#issuecomment-5581551252) selects native Kishi/DSH on a DigitalOcean Linux Droplet, launched through a supported `dsh` profile and systemd. The existing DSH sandbox remains enabled. Repository Docker use must follow that decision's one-action administrator permission rules without exposing other repositories or Kishi credentials; this research selects no new isolation or deployment architecture.

Each connected repository needs its own terminal environment and administrator-controlled model/BYOK settings. Kishi manages keys; assigned members see non-secret settings read-only. Repository builds and tests may receive only that repository's administrator-supplied application/test credentials, never Kishi GitHub App, model, Firebase, backup, or other repositories' secrets. These are requested requirements, not claims about current enforcement.

Behavior described below is source inspection unless the [evidence table](#evidence) identifies an executed check. Mocked dispatch and profile-construction tests do not prove kernel isolation.

## Subprocess environment

**Source inspection:** [`SENSITIVE_ENV_PATTERN` and `scrubbedParentEnv()`](../../packages/subprocess/subprocess/src/index.ts#L45) remove inherited names matching `/KEY|PASSWORD|SECRET|TOKEN/i` and names beginning with `DSH_`, case-insensitively. Other defined parent entries survive, including `PATH` and `HOME`. The helper also applies the child proxy environment overlay. A secret under an unrelated name is not covered by this name filter.

[`childEnv()`](../../packages/subprocess/subprocess-local/src/spawn.ts#L46) merges explicit entries after that scrub. An explicit string can restore a secret-shaped name; an explicit `undefined` removes an ordinary inherited entry. There is no replace-environment or repository-allowlist mode in this helper. Windows folds explicit names case-insensitively; POSIX uses object spread. [`LocalSubprocessRuntime.spawn()` and `spawnTerminal()`](../../packages/subprocess/subprocess-local/src/index.ts) both construct their target environment through this shared path; PTY allocation passes that result to node-pty.

The [owning service test](../../packages/subprocess/subprocess/tests/service.spec.ts) passed with harmless synthetic variables: credential-shaped and `DSH_*` names disappear while an ordinary variable and `PATH` survive. The [explicit-merge, tombstone, and credential-override tests](../../packages/subprocess/subprocess-local/tests/spawn.spec.ts#L423) own the corresponding subprocess behavior. A name scrub is not evidence that all sensitive values are excluded, nor that the child cannot read a credential file.

**Integration gap:** Kishi needs an administrator-controlled mapping from a repository's application/test credential references to its execution environment, with an exact policy for inherited non-secret runtime variables. The current explicit overlay is reusable for deliberate forwarding, but the ambient base is not an allowlist. Neither global `process.env` mutation nor sourcing a repository file is an adequate substitute for that policy.

## Persistent terminals

The [terminal registry](../../packages/terminal/terminal/src/index.ts#L104) retains sessions in memory and authorizes operations against the exact live `Agent` object. Names are owner-local, not repository-global. Other agents cannot list or operate on that owner's terminals through this API. Owner disposal aborts pending creation and closes owned sessions; service disposal closes all owners. Restarting the host or creating a replacement Agent does not restore a live shell from a session log.

The [base composition](../../packages/bundle/base/cordis.patch.yml#L246) mounts the fresh-shell Bash tool. The [shipped minimal preset](../../packages/preset/agent-presets/presets/minimal/agent.cordis.yml#L21) instead composes a realm-isolated terminal registry, terminal backend, and persistent Bash tool. [`persistentShells()`](../../packages/shell/tool-bash-persistent/src/index.ts#L219) caches one shell per exact Agent, starting in `owner.session.header.cwd`; later calls reuse it until reset/disposal. The [persistent-tool test](../../packages/shell/tool-bash-persistent/tests/tools.spec.ts#L316) passed for reuse with a synthetic backend. Thus terminal persistence depends on selected composition, not merely on using `dsh`.

[`TerminalSpawnRequest`](../../packages/terminal/terminal/src/types.ts) carries a backend type, optional name, and optional initial cwd; it has no repository identifier or environment map. [`BashTerminalBackend.spawn()`](../../packages/terminal/terminal-bash/src/index.ts) resolves sandbox mode and workspace root from the owner session, chooses the supplied cwd or that root, confines argv when required, and adds terminal-specific environment entries. [`Config`](../../packages/terminal/terminal-bash/src/config.ts) selects shell executable/arguments and terminal behavior, but exposes no general `env` or env-file field. The bash default is interactive `--noprofile --norc -i`, not automatic shell-profile or dotenv loading.

The backend creates one shell and sends later input to that shell. Its cwd, exports, and already inherited values can persist between sends. Later parent environment or key changes do not retroactively replace a running shell's environment. Removing a backend registration leaves already created sessions in the registry; closing the owner or terminal service has different cleanup semantics. The [registry lifecycle tests](../../packages/terminal/terminal/tests/service.spec.ts) and [real-shell persistence/reload fixture](../../packages/terminal/terminal-bash/tests/local.spec.ts) are the owners of these distinctions.

The [terminal policy-wiring tests](../../packages/terminal/terminal-bash/tests/index.spec.ts) passed for confined argv, session-derived cwd/root, and missing-sandbox rejection using mocked process backends. They do not exercise kernel confinement. The real-shell fixture uses `danger-full-access` or a passthrough sandbox and is not executed here. The [sandbox-mode fence](../../packages/terminal/terminal-bash/src/index.ts) rejects a mode change while this owner has open or pending persistent terminals.

**Integration gap:** exact-Agent ownership is reusable, but it is not a connected-repository terminal manager. Kishi must bind authorized repository/worktree identity to Agent, terminal creation and reuse, and credential selection. Rotation/revocation needs an explicit policy for existing terminals and their descendants; changing a settings file alone cannot retract an environment value already delivered to a process.

## Credential resolution

The services are [`@deepseek-ai/dsh-credentials` / `ctx.credentials`](../../packages/credentials/credentials/src/index.ts) and [`@deepseek-ai/dsh-credentials-local` / `LocalCredentialProvider`](../../packages/credentials/credentials-local/src/index.ts). The latter defaults to a managed credential document under the Harness home, with configurable `path`, `dshHome`, and watching. It is not a repository-scoped provider selected automatically from terminal cwd.

The provider has two distinct address forms:

- `CredentialRef` is a validated environment-variable name. `resolve(ref)` returns a value and source; `describe(ref)` returns only configured/source/writable facts.
- `CredentialKey` is `<plugin-scope>/<id>`, such as a model plugin and provider route. It addresses a stored API-key or authorization-grant record. That scope is a plugin name, not a repository or member identity, and record reads do not use dotenv fallback.

[`LocalCredentialProvider.resolve()` and `describe()`](../../packages/credentials/credentials-local/src/index.ts#L617) implement reference precedence: non-empty inherited launch value, then managed credential file, then invocation-directory dotenv, then Harness-home dotenv. An inherited value is read-only and makes writes reject; a dotenv fallback may be overridden by a managed write. The [layering tests](../../packages/credentials/credentials-local/tests/local.spec.ts) passed these cases, including the invoking project's key ranking below the managed store. This project-trusting fallback does not implement Kishi's administrator-only model-key requirement.

[`loadLayeredEnv()`](../../packages/boot/app-boot/src/index.ts) reads only the invocation directory and Harness-home dotenv files at launch. It validates both before applying either, refuses file-supplied bootstrap controls such as `PATH`, `NODE_OPTIONS`, and `DSH_*`, and permits home-file proxy settings as a named exception. It materializes accepted entries into `process.env` without replacing an existing value and returns a provenance-preserving snapshot. It does not discover dotenv files for each connected repository or each terminal command. Missing files are optional; other read failures warn, whereas forbidden names throw.

[`createLaunchEnvironmentSnapshot()`](../../packages/util/launch-environment/src/index.ts) copies its inputs. A later cwd/workspace switch or file edit does not change a supplied snapshot; its [tests](../../packages/util/launch-environment/tests/launch-environment.spec.ts) passed. `launchEnvironmentOf(ctx)` falls back to the current process environment only when a launcher snapshot is absent, which matters when interpreting direct plugin unit tests. Managed-file watching and successful writes can update credential resolution for the next consumer operation; they do not rewrite the launch snapshot or a running terminal.

The managed document is not materialized into `process.env`. The local provider uses direct Node filesystem access, creates owner-only storage, and rejects a POSIX credential file readable by group/other before reading it. Synthetic tests passed for mode `0600` creation and rejection of mode `0644`. This protects against other OS users, not arbitrary code with the same OS identity. Credential lookup authorization, child environment construction, and runtime file-read permission remain separate questions.

## Models and BYOK

The normal [base composition](../../packages/bundle/base/cordis.patch.yml#L87) mounts one file settings provider, one local credential provider, and the DeepSeek/pi-ai adapter families. [`FileSettingsProvider` path resolution](../../packages/settings/settings-file/src/index.ts#L56) selects one document under the Harness home by default; explicit file paths are configurable. That document stores every settings namespace. [`LlmRuntime`](../../packages/llm/llm/src/index.ts#L330) keeps its live adapter and configurable-provider maps in memory, keyed by provider route, rebuilt from composition/settings. [`SettingsProvider.register()`](../../packages/settings/settings/src/index.ts#L419) rejects duplicate namespaces within that service. Neither map is indexed by repository identity.

The existing storage and UI scopes differ:

| Mechanism | Current scope and persistence | Consequence for Kishi |
| --- | --- | --- |
| `llm-deepseek`, `llm-pi-ai.providers` settings | Plugin namespaces in the configured host settings document; live adapter updates | Multiple providers/routes are supported, not an administrator-owned model policy per connected repository |
| Credential references and plugin/provider records | Configured credential provider/file plus launch fallbacks | A route-specific key name is an address, not repository access enforcement |
| [`agent-default-model`](../../packages/core/agent-default-model/src/index.ts#L21) | Host settings default for future Agents; explicit session selection is separate | Choosing a different model for one Agent does not select a private credential store or enforce a repository model allowlist |
| [Models page store](../../packages/client/ui-settings-models/src/client/store.ts#L149) | Client-memory projection of host provider, settings, and credential metadata | The view is not a durable browser-local BYOK database |
| [Client settings persistence selection](../../packages/client/ui-settings/src/client/index.ts#L58) | Loopback uses host persistence; non-loopback uses memory mode | Remote-browser preference memory is not repository-scoped server persistence |

In non-loopback memory mode, [`SettingsDescribeMirror`](../../packages/client/ui-settings/src/client/settings-mirror.ts#L89) is terminally unavailable and never reads the host settings document; its [focused test](../../packages/client/ui-settings/tests/settings-mirror.client.spec.ts) passed. [`ModelsSettingsStore.load()`](../../packages/client/ui-settings-models/src/client/store.ts#L178) needs that mirror's view and reports an unavailable-settings error when absent. This is a gap for a remote Droplet admin/read-only-member experience, not evidence that remote members already receive a repository-authorized settings view. No browser session against a Droplet was exercised.

[`ProviderEditor`](../../packages/client/ui-settings-models/src/client/ProviderEditor.tsx#L161) keeps a newly typed key in React state. [`createModelsOperations()`](../../packages/client/ui-settings-models/src/client/operations.ts#L82) sends the literal through `remote.credentials.set(ref, value)` and provider fields through `remote.settings.mutate`. The [credential remote](../../packages/api/settings-controller/src/credentials.ts#L67) returns only configured/source/writable facts, never a read-back value. The [settings remote](../../packages/api/settings-controller/src/index.ts#L117) redacts schema-declared secrets. Their existing [credential projection/write tests](../../packages/api/settings-controller/tests/credentials-controller.host.spec.ts) and [settings projection/write tests](../../packages/api/settings-controller/tests/settings-controller.host.spec.ts) passed. Key entry therefore crosses from the configuring client to the host; it is not an opaque browser-held token that the host cannot read.

The remote methods address references and namespaces, with no repository or member-role parameter. Provider `writable` state and UI `readOnly` flags describe storage capability or disable controls, not Kishi administrator authorization. The [Connection request fence](../../packages/client/connection/src/rpc-host.ts#L97) separately checks trusted Host/Origin and browser authentication. That authentication is not a repository-role check in these controller methods; hiding controls or relying on non-loopback UI behavior cannot replace server-side authorization.

### Key use and rotation

[`llm-deepseek.resolveApiKey`](../../packages/llm/llm-deepseek/src/index.ts#L430) resolves the configured `apiKeyEnv` through `ctx.credentials` for each operation; without that service it uses the launch snapshot. The [adapter](../../packages/llm/llm-deepseek/src/adapter.ts#L471) obtains the raw string and [sets the HTTP Bearer header](../../packages/llm/llm-deepseek/src/adapter.ts#L532). [`llm-pi-ai`](../../packages/llm/llm-pi-ai/src/index.ts#L169) similarly resolves a named reference and [passes the literal to provider options](../../packages/llm/llm-pi-ai/src/adapter.ts#L375). References avoid placing a key in configuration responses; they do not avoid raw-key use by the selected provider transport.

The [DeepSeek](../../packages/llm/llm-deepseek/tests/dynamic-config.spec.ts#L136) and [pi-ai](../../packages/llm/llm-pi-ai/tests/dynamic-config.spec.ts#L146) focused tests passed with synthetic keys and temporary loopback mock servers: a managed key change reaches the next request. DeepSeek also pairs the key reference with the accepted endpoint/configuration snapshot. A running stream uses its captured request inputs; rotation is not retroactive cancellation. These tests do not contact a real model provider or verify cloud TLS, billing attribution, or revocation.

A pi-ai profile with an explicit but missing `apiKeyEnv` fails instead of silently using another ambient key. Omitting the reference deliberately permits provider-native authentication. [`credentialStoreFrom()`](../../packages/llm/llm-pi-ai/src/auth.ts#L141) bridges plugin/provider records, while [`authContextFrom()`](../../packages/llm/llm-pi-ai/src/auth.ts#L203) supplies credential references, launch-snapshot values, and host credential-file existence checks using direct Node filesystem access rather than `ctx.fs`. Kishi must control these fallback paths and endpoint selection as well as its explicit model keys. Adding a repository field only to the Models form would not constrain the actual provider lookup.

## Configuration scoping

Separate files are useful for organization and composition, but do not establish isolation. The [supported application launch](../architecture.md#application-launch) is `dsh` with a profile; [profile boot](../../apps/cli/src/profile-boot.ts#L262) installs one launch-environment snapshot before plugins mount. [Ordered profile layers](../../packages/boot/app-boot/src/profile.ts) combine bundle patches, profile/user patches, and requested overlays. Reusing the default Harness home still reuses its settings and credential documents unless the composition deliberately selects other paths/providers.

Cordis [`isolate`](../../vendor/loader/src/config/isolate.ts#L26) maps service names to JavaScript symbols. `true` creates an entry-local realm; matching string labels share a named realm. [`createScope()`](../../packages/core/scope/src/index.ts#L137) owns registrations and event routing. Neither primitive changes `process.env`, UID, filesystem read permissions, process visibility, or daemon access. Consumers must resolve the intended service realm; merely mounting another credentials file does not redirect an adapter that still captures the host context.

The [preset mount guard](../../packages/preset/agent-presets/src/mount.ts#L202) rejects services leaking into the root realm. The [standing preset implementation](../../packages/preset/agent-presets/src/index.ts#L747) shares one mounted generation among joined Agents. The [realm-private service test](../../packages/preset/agent-presets/tests/mount.spec.ts#L298) passed and explicitly asserts that two Agents sharing a preset receive the same service instance. Per-Agent registrations, per-preset services, and per-repository data are therefore different scopes. In particular, multiple model adapters sharing the host settings service can collide on their fixed namespace, even when a developer separates some other service instances.

Configuration/key changes have different lifetimes:

- Accepted managed settings/key writes affect subsequent adapter operations; credential-file watching publishes external managed-file changes when enabled.
- Invocation/home dotenv data is a launch snapshot, not a per-repository watcher.
- [Profile patch reload](../../packages/boot/app-boot/src/profile.ts#L110) is live for the shipped web profile, startup-only for shipped headless/SDK/ACP profiles. The [boot watcher wiring](../../apps/cli/src/profile-boot.ts#L283) does not imply that an existing shell's environment is replaced.
- A changed preset file produces a new standing generation for later joins; already joined Agents keep their generation. A terminal retains its captured backend/session until the appropriate owner closes it. Reloading terminal backend registration alone is not revocation.

## Linux sandbox and Docker

The [owned local provider](../../packages/sandbox/sandbox-local/src/index.ts#L160) chooses Linux bubblewrap before Landlock, with functional selection probes. Unavailable confinement fails closed; Landlock on an older supported ABI can report partial enforcement. A `full` result refers to the implemented file-effect policy, not multi-tenant secrecy.

The [exact profile builders](../../packages/sandbox/sandbox-local/src/profiles.ts#L16) and their [executed argument tests](../../packages/sandbox/sandbox-local/tests/local.spec.ts#L74) establish the following source-level limits:

| Linux backend | Reads, writes, and processes | Not established |
| --- | --- | --- |
| bubblewrap | Read-only bind of `/`; fresh `/dev`; private PID namespace and `/proc`; workspace-write additionally binds the workspace writable and provides ephemeral `/tmp` | Private credential-file reads: read-only still permits reading underlying OS-accessible files. No network-namespace flag or repository daemon-access policy is present in this builder |
| Landlock | `--ro /`; `--rw /dev/null`; workspace-write also grants host `/tmp` and the workspace | Per-repository read isolation, private temp storage, PID namespace, or network/IPC isolation |

The [owned C launcher](../../native/landlock-run/packages/entry/src/main.c#L58) declares only `handled_access_fs`, negotiates filesystem bits through `MAX_ABI = 5`, grants read/execute beneath each `--ro` root, sets `no_new_privs`, and restricts itself before executing the command. It does not install network or scoped IPC rules. Current [kernel documentation](https://docs.kernel.org/userspace-api/landlock.html#inheritance) describes inherited restrictions and [additional IPC controls](https://docs.kernel.org/userspace-api/landlock.html#ipc-scoping); those capabilities must not be attributed to this launcher merely because newer kernels offer them. Underlying DAC/other OS controls still apply; a `/` read grant does not grant reads forbidden by those controls.

The in-process [`SandboxedFileSystem`](../../packages/fs/fs-sandbox/src/index.ts#L1) likewise fences mutations and passes reads through. Credential providers and provider-native authentication also use direct host filesystem APIs. Separate cwd/worktrees, write confinement, `0600` files owned by the same runtime UID, and per-repository dotenv files do not prove that repository code or model-facing reads cannot obtain Kishi's secrets. The report makes no claim that every process can read every other process: bubblewrap's PID namespace, Landlock ptrace restrictions, OS identity, and deployment policy differ and require target-host verification.

### Docker socket authority

Docker applications remain subject to human policy. [Docker's daemon security documentation](https://docs.docker.com/engine/security/#docker-daemon-attack-surface) states that daemon control can create containers with host filesystem mounts; the usual rootful daemon therefore gives its controller powerful host access. A sandboxed Docker CLI talks to an already running daemon outside that client's child process restrictions. Read-only mounts or Landlock file-write limits on the CLI do not constrain the daemon's requested mounts and workloads.

Neither inspected Linux builder expresses a repository-specific Docker socket/API authorization rule; the owned Landlock launcher has no Unix-socket connection restriction. Actual reachability still depends on socket paths, mount visibility, permissions, and deployment controls, none exercised here. Docker Compose project names distinguish resources, not which daemon operations a caller is authorized to request. Kishi cannot claim cross-repository secret isolation while relying on a shared privileged daemon socket being harmless. Rootless Docker would change daemon authority, but is not selected here and is not automatically cross-repository authorization either.

## Reusable primitives and gaps

The minimum reusable mechanisms are the supported profile/patch launcher, Cordis service realms and Agent-owned effects, persistent terminal registry/backend/tool, subprocess environment scrub plus explicit overlays, credential reference/record service, managed file providers, live model registry, and redacted settings remotes. They are parts for integration, not an already complete multi-repository environment feature.

| Required Kishi integration | Existing owner to reuse | Missing behavior or later verification |
| --- | --- | --- |
| Repository identity and terminal lifecycle | [Persistent shell cache](../../packages/shell/tool-bash-persistent/src/index.ts#L219), [terminal registry](../../packages/terminal/terminal/src/index.ts#L148) | Bind connected repository/worktree, authorized member, Agent, and reuse/reset rules; reject cross-repository terminal access and prevent stale-key reuse after revocation |
| Administrator-owned model/BYOK configuration | [Settings provider](../../packages/settings/settings/src/index.ts#L419), [model adapters](../../packages/llm/llm-pi-ai/src/index.ts#L169), [credential provider](../../packages/credentials/credentials-local/src/index.ts#L617) | Repository-scoped durable addresses, provider/endpoint/model restrictions, admin-only mutations, member read-only metadata, no member-supplied keys or unintended launch/project/native-auth fallback |
| Repository application/test credentials | [Shell explicit environment](../../packages/shell/bash-local/src/index.ts#L159), [subprocess merge](../../packages/subprocess/subprocess-local/src/spawn.ts#L46) | Select only administrator-approved credentials for that repository; define an allowed runtime base and enforce it for every enabled execution path. Terminal requests/config currently expose no general environment map |
| Secret read and process protection | [Sandbox profile construction](../../packages/sandbox/sandbox-local/src/profiles.ts), [filesystem read/write behavior](../../packages/fs/fs-sandbox/src/index.ts) | Enforce and demonstrate protection for Kishi's own keys, other repositories' secrets, files, inherited descriptors, process interfaces, and permitted daemon APIs while keeping the DSH sandbox enabled |
| Remote administration and read-only settings | [Models operations](../../packages/client/ui-settings-models/src/client/operations.ts), [redacted controllers](../../packages/api/settings-controller/src/index.ts), [remote memory-mode mirror](../../packages/client/ui-settings/src/client/settings-mirror.ts) | An authenticated repository/role-aware server API and usable remote admin/member views; existing loopback/memory behavior is not that feature |

Later integration evidence must include repository A/B synthetic-key tests, allow/deny assertions for ordinary commands and persistent shells, file and process read attempts under the selected Linux deployment identity, key rotation/removal with already running children, member mutation rejection through direct APIs, and provider dispatch selecting only the authorized repository credential and endpoint. Exercise the actual `dsh` profile/systemd launch and available sandbox backend on the intended Droplet, including negative failures and any permitted Docker path. These are outstanding checks, not a selected isolation architecture or approved access policy.

## Evidence

Inspection is pinned to published `origin/master` commit `4aaf23b47b442be9069538d2718185ee85d03a8f`, in branch `research/kishi-v2-repository-environments`, on 2026-09-08. The isolated worktree started clean. No product source is changed.

The [English-only documentation policy](../agents/documentation-policy.md) is enabled in [the policy configuration](../../scripts/doc-policy.json). This report has no Chinese counterpart or pairing sidecar.

VS Code `runTests` reported no registered tests for the exact service-test path. `pnpm install --offline --frozen-lockfile --ignore-scripts` succeeded in this worktree without a shared dependency directory. The install warned about Linux-only packages on macOS and absent built CLI bins. Native install scripts were not run; the later lint command built Host artifacts as its prerequisite, without launching a product application.

Executed commands from this worktree:

| Command | Result | Evidence limit |
| --- | --- | --- |
| Focused Node Markdown link/anchor and final-LF assertion | Passed immediately after report edits | This report only; final AST-based command below |
| `pnpm exec vitest run packages/subprocess/subprocess/tests/service.spec.ts` | 3 passed | Synthetic scrubber and service tests |
| `pnpm exec vitest run packages/credentials/credentials-local/tests/local.spec.ts -t 'layering and reads\|layer ladder\|adds a missing key\|patches one entry'` | 15 passed, 40 filtered out | Temporary synthetic stores; POSIX permissions on macOS |
| `pnpm exec vitest run packages/util/launch-environment/tests/launch-environment.spec.ts` | 7 passed | Immutable synthetic layers, not a production launch |
| `pnpm exec vitest run packages/terminal/terminal-bash/tests/index.spec.ts -t 'wraps confined argv\|resolves session mode and root\|rejects a confined spawn\|rejects a sandbox mode change'` | 3 passed, 15 filtered out | Mocked allocation; no kernel confinement or mode-fence execution |
| `pnpm exec vitest run packages/subprocess/subprocess-local/tests/spawn.spec.ts -t 'merges ordinary extra env\|explicit tombstone\|extra env entry overrides'` | 3 passed, 85 filtered out | Real short-lived local child commands with synthetic values, not sandbox enforcement |
| `pnpm exec vitest run packages/terminal/terminal/tests/service.spec.ts -t 'publishes only after spawn\|rejects unknown backends\|awaits owner cleanup\|kills idempotently'` | 4 passed, 19 filtered out | Mocked sessions, exact-Agent API ownership and teardown |
| `pnpm exec vitest run packages/boot/app-boot/tests/app-boot.spec.ts -t 'loadLayeredEnv'` | 19 passed, 38 filtered out | Temporary synthetic dotenv files, bootstrap rejection, and precedence |
| `pnpm exec vitest run packages/llm/llm-deepseek/tests/dynamic-config.spec.ts -t 'routes the next request\|starts keyless\|keeps the whole last-good snapshot'` | 3 passed, 6 filtered out | Temporary synthetic credentials and loopback mock HTTP servers |
| `pnpm exec vitest run packages/llm/llm-pi-ai/tests/dynamic-config.spec.ts -t 'rotates the per-request credential\|mounts bare and dormant\|adds a provider route'` | 3 passed, 6 filtered out | Temporary synthetic credentials and loopback mock HTTP servers |
| `pnpm exec vitest run packages/sandbox/sandbox-local/tests/local.spec.ts -t 'profile dialects\|linux probes bwrap first\|linux falls back to the launcher\|the unavailable verdict is cached'` | 10 passed, 28 filtered out | Argument construction and injected probe verdicts, not real Linux confinement |
| `pnpm exec vitest run packages/api/settings-controller/tests/credentials-controller.host.spec.ts packages/api/settings-controller/tests/settings-controller.host.spec.ts -t 'describes a batch\|answers only the fields\|stores and removes\|reports a refused write\|describes every namespace redacted\|reports a read-only provider\|applies path-addressed edits'` | 8 passed, 28 filtered out | Synthetic service calls, not deployed member authorization |
| `pnpm exec vitest run packages/client/ui-settings/tests/settings-mirror.client.spec.ts -t 'memory persistence'` | 1 passed, 12 filtered out | Non-loopback mirror mode, no real browser |
| `pnpm exec vitest run packages/preset/agent-presets/tests/mount.spec.ts -t 'gives each session only\|lets two sessions share\|isolated service\|root realm'` | 2 passed, 48 filtered out | Per-preset tool visibility and two-session sharing; unmatched alternatives prove nothing |
| `pnpm exec vitest run packages/preset/agent-presets/tests/mount.spec.ts -t 'rejects a row that publishes\|accepts the same provider\|addresses the standing instance\|starts a new generation for later sessions'` | 4 passed, 46 filtered out | Root service leak rejection, realm-private sharing, and generation behavior |
| `pnpm exec vitest run packages/shell/tool-bash-persistent/tests/tools.spec.ts -t 'registers a configurable schema and reuses one owner shell'` | 1 passed, 17 filtered out | Synthetic backend, one shell per Agent |
| `pnpm run test:docs` | 15 checks passed, 0 failed, 0 skipped | Quick docs only, English-only policy respected |
| `pnpm run lint` | Passed | Host build plus full lint; no product launch or deployed isolation check |
| `pnpm run doc-sync` | 33 checks passed, 0 failed, 0 skipped | Full documentation checks; no target-host execution |
| `git diff --check` | Passed | Tracked-change whitespace; this untracked report also has the explicit content check below |

The report-specific check below passed using the repository's Markdown AST/link checker and an exact final-LF assertion. Editor diagnostics reported no errors. Git reported only this new research report as an authored change. Build output included dependency-bundling and plugin-timing notices; npm also warned about its inherited package-manager configuration. None failed lint or the documentation checks.

```sh
cd /tmp/kishi-v2-wayfinder-20260908-7a897a36/repository-environments && pnpm exec tsx -e 'import assert from "node:assert/strict"; import { readFileSync } from "node:fs"; import { resolve } from "node:path"; import { anchorCache, findViolations } from "./scripts/verify-md-links.ts"; const report = resolve("docs/research/2026-09-08-kishi-v2-repository-environments.md"); assert.deepEqual(findViolations(report, anchorCache()), []); assert.match(readFileSync(report, "utf8"), /[^\n]\n$/u); console.log("PASS report links/anchors and exactly one final LF");'
```

The external Docker and Linux kernel documents were fetched on 2026-09-08 as primary explanatory sources; they are not evidence that the target Droplet enforces any particular policy. No cloud service, Docker workload, real repository application, Firebase account, real credential, model-provider request, Linux confinement run, or long-lived process was provisioned or exercised. The [Linux Landlock integration test](../../packages/sandbox/sandbox-local/tests/landlock.e2e.ts) and [native launcher tests](../../native/landlock-run/test/launcher.test.js) remain unexecuted. The real-shell fixture is also unexecuted; sandboxing was not disabled to obtain terminal evidence.

## Dev Note

Non-authoritative research findings for the specified published commit. No repository-isolation or deployment architecture is selected. The human-owned access decision remains open. Source facts can guide later specification, but only deployed negative isolation checks can support the requested cross-repository secret guarantees.
