---
description: "Source-based research on Kishi V2 agent presets, role selection, and the skill-guided workflow."
---

# Kishi V2 Agent Presets and Workflow

## Summary

DSH supplies agent compositions, coding tools, scoped skill discovery, fresh or forked subagents, and durable continuation. It does not supply a ready-made Kishi role system: stock in-process children inherit their parent's preset, and preset display metadata does not select models or enabled skills. The concrete integration gaps are role-aware child creation/recovery and Session-stable skill selection. [Preset API], [Child composition], [Preset metadata], [Skill API].

Kishi V2 already assigns aggregation and human interaction to a persistent main Session, with one active coordinator per work item and independent build, review, and QA workers directed by prompts and skills. This is not an automatic port of Kishi V1's Bash phase runner. The proposed mapping below is research, not an approved design or implemented preset. [Ownership approval], [Ownership detail], [Workflow decision].

The [role-preset research ticket](https://github.com/Kishimotovn/kishi-harness/issues/22) owns the findings walkthrough and decision handoff.

## Contents

- [Findings](#findings)
- [Workflow and Provenance](#workflow-and-provenance)
- [Constraints](#constraints)
- [Source References](#source-references)
- [Verification Limitations](#verification-limitations)
- [Dev Note](#dev-note)

## Findings

This section describes shipped source at the pinned revision. Approved Kishi behavior is labelled separately; no statement here is live runtime proof.

### Preset Discovery and Authoring

A preset is a directory containing `agent.cordis.yml`, optionally `preset.yml` and resources such as `skills/`. `preset.yml` parses only display `name`, `description`, and `order`; the directory supplies identity and the discovery root supplies trust. It is not a model, role, permission, or enabled-skill configuration schema. [Preset metadata], [Preset API].

`AgentPresets.list()` and `resolve(id)` discover shipped, configured, and user roots in that precedence order, with first-root-wins duplicate ids. The derived user root is `<dshHome>/.agent-presets`; derived roots can be disabled. `read(id)` reads composition text. `copy(from, id, name?)` copies the whole directory into the first writable user root, refuses an existing/invalid id, and preserves supporting assets. Its actual return type is `Promise<void>`: obtain the resulting path through `resolve(id)`, not an assumed copy result. Copies do not receive later shipped-preset updates. [Preset API], [Preset authoring], [Preset README].

`mount(agentCtx, id)` joins a scoped Agent to a standing composition during unpublished `agents.create({ setup })`. The source mounts once per preset generation, not a fresh plugin tree per Session; plugin state still needs Session ownership. `standingKeyFor(id)` performs the real mount/audit without creating an Agent or making a model request. It activates plugins and retains a successful standing mount, so it is not a read-only inspection. Discovery's `broken` status is not proof of successful activation. [Preset API], [Preset mount].

The normal API Session controller resolves a requested `presetId`, records it as `meta.agentPreset`, and mounts it in `setup`. Resume uses the `agentPreset` projection, which includes later `agent-preset/selected` events. Public `select()` refuses a Session whose turn has started; it is not a mechanism for changing planner into builder mid-conversation. A persisted id is not an immutable composition archive: generations are keyed by the composition file's stamp, and a restarted Host resolves available files again. [Session controller], [Preset API], [Preset projection].

### Reusable Tools and Presets

| Shipped item | What it actually supplies | Relevance to Kishi |
| --- | --- | --- |
| `standard` preset | Persona, repository instructions, Bash/PowerShell, file tools/search, jobs, skill discovery/loading, goals, plan mode, compaction, delegation, workflow/Ralph tools, user questions, todos, web tools, file presentation. | Reusable full coding baseline; Kishi policy and role instructions are additional concerns. [Standard] |
| `cordis` preset | Full coding composition plus `tool-cordis`, authoring persona, and preset-local composition/development skills. | Authoring/research capability, not an ordinary worker requirement; it can modify the running harness. [Cordis] |
| `minimal` preset | Complete fixed persona, runtime-context suppression, and one platform-specific persistent shell; no skill or delegation row. | Not a drop-in skill-driven builder/coordinator. Its composition owns this inventory. [Minimal] |
| `ptc` preset | Coding composition with `agent-tool-presentation` in `ptc` mode; `run_code` presentation replaces the general `workflow` tool, which is disabled. | Alternative tool presentation requiring a Host code runtime, not a planner or builder provider. [PTC] |
| `subagent` / `subagent_fork` tools | Instances of `dsh-tool-subagent`, consuming a configured Host provider. | A tool launches work; it is neither a preset nor a model. [Delegation tool] |
| `spawn` / `fork` providers | `subagent-spawn-in-process` / `subagent-fork-in-process` registered in the Host subagent service. | Both create DSH child Agents; spawn has fresh conversation, fork copies completed turns. [Spawn], [Fork]. |

The full presets contain disabled Codex/Claude Code delegation templates, but their optional Host bundles are not installed by the production base. Enabling a tool row alone cannot supply its provider. Kishi's approved direction is DSH model/provider routes, not reinstating V1's multiple substrates. None of the inspected standard rows is a browser-QA adapter; QA still needs the repository's actual browser runner or an explicitly supplied adapter. DSH plan mode is also distinct from Kishi's planner role and ordinary human checkpoints: its prompt requires `exit_plan_mode`, so it must not silently replace the approved conversational workflow. [Standard], [Workflow decision], [Kishi QA].

### Subagent Selection and Recovery

`SubagentStartRequest` accepts `parent`, `prompt`, optional `agentOptions`, `persona`, `toolFilter`, depth limit, and structured-output schema. It has no `role`, `presetId`, or `agentPreset` selection. The ordinary tool exposes description/prompt/background and, when enabled, provider/model/effort; persona and tool filtering come from tool-instance configuration, not those call arguments. [Subagent request], [Delegation tool].

`childSessionMeta()` records the parent's live preset id. `applyChildComposition()` always calls `composeFrom(childCtx, parent.ctx)`, joining that exact generation, then applies persona and tool restriction. Consequently `spawn` means fresh history, not a fresh role composition. `fork` includes the parent's completed-turn prefix and omits the currently incomplete turn. Merely adding a different preset id to metadata would not change this setup path. [Child composition], [Spawn], [Fork].

The shipped spawn tool defaults to continuable background work: it returns a durable child id, retains conversation, and supports later `send_message` delivery and result notices. A foreground one-shot is collected and disposed instead. The continuation descriptor records provider, label, selected child provider/model/effort, persona, and tool filter, but no role, selected skill names, or independently chosen preset. Cold resume reconstructs those options from the descriptor, requires the exact live direct parent, and again uses `applyChildComposition`; it does not rerun the spawn/fork provider. [Delegation tool], [Descriptor], [Continuation], [Activation].

The generic API Session controller explicitly refuses to adopt a subagent-owned Session. A future role-preset path must preserve the existing continuation owner rather than bypass it through generic resume. Named worker presets would need aligned creation, durable identity, and cold-resume handling across the relevant one-shot/continuable paths. [Session controller], [Continuation], [Activation].

### Models and Session Selections

`AgentOptions` and request-time selection supply models, not preset display metadata. `resolveChildAgentOptions()` merges requested child overrides over the parent's latest request route, falling back to parent creation options; a route change clears an inherited reasoning effort when no replacement was requested. Thus omission inherits, it does not look up Kishi's current planning/build/review/QA default. [Child composition], [Preset metadata].

`modelSelectionSettings: true` controls whether a Session may choose advertised child routes. The tool samples the Host `subagent-model-selection` policy for new top-level Sessions, records it, and inherits it into children. This saved allowed-route policy is distinct from the actual child model and from repository/credential authorization. It is not a Kishi role resolver; an older parent's policy can also differ from newly saved defaults. [Delegation tool], [Model-selection state].

For ordinary API Sessions, `selectionFor()` reads a pending `model/selection` projection, otherwise the last durable request header, otherwise the current default model. `selectForNextRequest()` logs an explicit selection; `installModelSelection()` couples prompt variables to request routing. This is useful persistence machinery, but a blank Session without a recorded selection/request still reads the current default. Passing creation `agentOptions` alone does not establish Kishi's durable role/configuration choice. [Session controller], [Model selection].

**Approved Kishi behavior:** resolve the selected model configuration and enabled-skill set when each Session is created. Existing Sessions keep them across calls, same-Session retries, and resume; new Sessions and newly spawned workers use current role-specific global/repository defaults, even under an older parent. Keep provider/configuration identity sufficient to distinguish two owners' credentials for the same model. The Work/settings Host owns this resolution and durable record; current authorization and credential availability apply on every use, with visible blocking and no silent fallback. Exact record fields remain specification work. [Settings amendment], [Workflow decision], [Ownership detail].

### Skill Discovery, Loading, and Scope

At this revision the provider is `dsh-skill-filesystem`, not an assumed `skill-local` package. With default roots enabled, `roots(cwd)` supplies project `.dsh/skills`, project `.agents/skills`, explicit custom roots, user DSH/agent roots, then an optional bundled root. The `cordis` preset explicitly adds its own `skills/` via `baseUrl`; a neighboring skills directory is not discovered merely because it belongs to a preset. [Skill filesystem], [Cordis].

`SkillRegistry.snapshot({ cwd, scope })` merges the viewing Agent's scope chain with global contributions. An unscoped `snapshot()` sees only the global layer; it cannot establish a repository/preset's full selectable catalog. Within a layer, lower-ranked roots win duplicate names; across layers, the nearest contribution wins. `list/get/snapshot` expose no enabled-name allowlist, and provider lookup options contain cwd/signal, not a Kishi role or repository grant. [Skill API]

`tool-skill` uses the Agent's cwd and scope for both catalog and body lookup. It publishes durable catalog context, updates it after a complete changed observation, retains the last complete catalog during incomplete discovery, and loads bodies on demand. Hiding a settings checkbox or omitting names from displayed prose alone does not prevent direct name loading. Session-stable selection needs consistent catalog, loader, and explicit-invocation filtering, while preserving loaded history. Watching files does not implement that selection, and stable selected names do not imply frozen bodies. [Skill tool], [Skill filesystem], [Settings amendment].

An additional blocker is invocation policy: installed `wayfinder`, `kishi-wayfinder`, `grill-with-docs`, `to-spec`, `to-tickets`, `implement`, and `wait-what` declare `disable-model-invocation: true`. DSH excludes them from model catalogs and rejects `skill(name)` for them; its user-explicit invocation path injects user-invocable bodies from user-message gestures. A supported composition/wrapper strategy needs an explicit decision; it cannot make a model-generated answer count as the human's approval. [Matt wayfinder], [Kishi wrapper], [Matt grill], [Matt spec], [Matt tickets], [Matt implement], [Matt style], [Skill tool], [Workflow decision].

## Workflow and Provenance

The inspected Kishi lock identifies `mattpocock/skills` and each upstream path, plus a `computedHash`; that hash is not an upstream Git commit SHA. Read-only byte comparisons verified twelve installed `SKILL.md` entry files against official `v1.2.3`, commit `6acc160e4e0cd062dbbbd7a1b26ae92855edf07e`: wayfinder, grill-with-docs, to-spec, to-tickets, implement, tdd, code-review, grilling, domain-modeling, wait-what, research, prototype. Supporting files were not exhaustively compared. A comparison with upstream `3cca18b368ae95cdbdebbff572ccafa662551015` matched only implement; no upgrade was taken. [Kishi lock], [Matt release], [Matt current].

`kishi-wayfinder` is Kishi-authored, absent from the lock, and loads Matt's base by reference before adding the visual-design ticket type and its human render checkpoints. `kishi_skill_for()` prefers a `kishi-<skill>` wrapper when present. Kishi's QA evidence/healer rules and Aggregator instructions live in its own prompts; neither is a dedicated Matt entry in the inspected lock. `ponytail-review` is a separate complexity-review addition referenced by Kishi, not provenance established by that Matt lock. [Kishi wrapper], [Kishi dispatch], [Kishi QA], [Kishi lock].

The required workflow retains these responsibilities and human checkpoints; V2's approved conversational interpretation replaces V1's keyword-driven state transitions, not the checkpoints themselves. [Kishi process], [Kishi context], [Workflow decision], [Settings amendment].

1. **Discover requirements:** main human conversation uses Wayfinder for unresolved large efforts, or grill-with-docs for bounded work. Matt's grill-with-docs invokes grilling plus domain-modeling; facts can be delegated, but human decisions cannot. Research/prototype instructions support the relevant investigation tickets. [Matt wayfinder], [Matt grill], [Matt grilling], [Matt domain], [Matt research], [Matt prototype].
2. **Spec:** retain explicit human ACK at the `/to-spec` handoff before ticketing. The skill synthesizes agreed decisions and confirms proposed test interfaces with the human; it is not permission to invent missing product choices or start implementation. [Kishi process], [Matt spec], [Decision map].
3. **Tickets:** propose vertical slices and dependency edges, discuss granularity, and wait for explicit human `APPROVE TICKETS` before publishing implementation tickets/building. In V2 this remains an attributed main-conversation confirmation, not a GitHub comment command, artifact-version approval record, or approval FSM. [Matt tickets], [Kishi process], [Workflow decision].
4. **Build:** implement the approved slice using TDD at pre-agreed interfaces, with one failing behavior check followed by the minimum passing change. Respect the connected repository's checks and documentation requirements. Builder self-review does not replace independent review. [Matt implement], [Matt TDD], [Workflow decision].
5. **Review and aggregate:** retain Standards and Spec as separate axes over a pinned base/head and spec. The main Aggregator sends fixes to the builder or asks for a human ruling; it cannot self-certify away unresolved objections. Missing reviewer/QA results are not passes. Two unsuccessful fix/review cycles trigger human escalation by default, configurable through approved settings and applied through prompts/skills, not a phase counter. [Matt review], [Workflow decision].
6. **QA:** independently exercise acceptance criteria against the actual revision. Kishi's web prompt requests real recordings and permits a Healer to change tests only, never application code; non-web QA reports actual commands/results. Do not carry V1's missing-result shortcuts into V2's explicit missing-results rule. [Kishi QA], [Workflow decision].
7. **Merge and roll up:** use current Host merge policy and repository rules; write the final feature/bug record when the original effort resolves, with required code-adjacent docs updated earlier. Preserve Kishi's durable feature-record intent and wait-what summaries without restoring per-message GitHub mirroring. Auto-merge defaults on and final-closure acknowledgement defaults off, both administrator-configurable; earlier human checkpoints remain. [Kishi process], [Kishi context], [Matt style], [Workflow decision], [Decision map].

The upstream skills mostly delegate tracker details to the repository's issue-tracker instructions. The inspected tracker docs and V1 review/aggregation prompts name `gh`, while the approved V2 amendment requires GitHub App-authenticated Host REST/GraphQL tools. Future Kishi-owned wrappers/tracker guidance must redirect reads, writes, dependency links, review retrieval, and uncertain-write reconciliation to those tools without copying or editing locked upstream skills. Agents still choose operations and write content; the Host enforces access/token lifecycle, not a deterministic second issue writer. Credentialed `git` remains separate. [Kishi tracker], [Kishi dispatch], [GitHub amendment], [Ownership detail].

## Constraints

These are existing source limits or approved product constraints, not settings changed by this report.

- Shared registries, storage, access, settings, credentials, subagent providers, and repository execution remain Host-owned. Presets contribute scoped personas, tools, prompts, and skill providers. A shared standing preset is not a per-repository security container; `isolate` creates Cordis service namespaces, not OS confinement. [Architecture], [Preset API], [Ownership detail].
- Kishi requires one shared Host/UI through supported `dsh` profiles and an installable bundle, with one active main coordinator per work item. Preserve native conversation, thinking/tool/subagent display, and composer; no replacement Subagents/Attempts views or custom workflow-control buttons. [Architecture], [Decision map], [Ownership approval].
- `toolFilter` removes names from schemas and rejects their execution, but does not turn an allowed shell into read-only execution. Delegated children inherit explicit sandbox overrides and receive approval policy `never` when that capability is composed; extra access returns to the parent/authorized human path. Current cross-repository, process, network, credential, and merge controls remain Host obligations on every use. [Child composition], [Hosting decision], [Ownership detail].
- Enabled skills are configuration, not security grants. Repository/user skill roots and same-name precedence cannot authorize model configurations, GitHub operations, files, or secrets. Never use shell tokens, personal credentials, preset changes, or optional product providers as fallback authorization. [Settings amendment], [Skill API], [GitHub amendment].
- DSH APIs are pre-stable. A new durable subagent field must account for descriptor versioning and all consumers; adding an unchecked YAML key is not a migration strategy. Public Session-generation files remain governed by the repository's released-data rules. [DSH rules], [Descriptor].

## Source References

DSH links below pin `086b6546384f9b41e8dc271f90b767126f7491a2` (`0.1.5-rc.2`). Kishi V1 links pin `01449124312de54e6afdea08a5116a83b78e2f1a`. Official Matt skill links pin verified `v1.2.3` commit `6acc160e4e0cd062dbbbd7a1b26ae92855edf07e`. Named symbols in the findings identify the owning implementation. Issue comments are primary decision records, not immutable Git snapshots; the cited amendments supersede only their named earlier choices.

The required creator guidance was read from the pinned [cordis composition][Cordis], [editing-cordis-compositions][Composition guidance], and [cordis-plugin-development][Creator guidance]. Source was used instead of Creator MCP/runtime queries. The [ownership resolution][Ownership approval] approves [the consolidated owner review][Ownership detail] in full, satisfying that review's historical pending-confirmation text.

[Architecture]: https://github.com/Kishimotovn/kishi-harness/blob/086b6546384f9b41e8dc271f90b767126f7491a2/docs/architecture.md
[DSH rules]: https://github.com/Kishimotovn/kishi-harness/blob/086b6546384f9b41e8dc271f90b767126f7491a2/AGENTS.md
[Preset API]: https://github.com/Kishimotovn/kishi-harness/blob/086b6546384f9b41e8dc271f90b767126f7491a2/packages/preset/agent-presets/src/index.ts
[Preset authoring]: https://github.com/Kishimotovn/kishi-harness/blob/086b6546384f9b41e8dc271f90b767126f7491a2/packages/preset/agent-presets/src/authoring.ts
[Preset metadata]: https://github.com/Kishimotovn/kishi-harness/blob/086b6546384f9b41e8dc271f90b767126f7491a2/packages/preset/agent-presets/src/metadata.ts
[Preset mount]: https://github.com/Kishimotovn/kishi-harness/blob/086b6546384f9b41e8dc271f90b767126f7491a2/packages/preset/agent-presets/src/mount.ts
[Preset projection]: https://github.com/Kishimotovn/kishi-harness/blob/086b6546384f9b41e8dc271f90b767126f7491a2/packages/preset/agent-presets/src/session.ts
[Preset README]: https://github.com/Kishimotovn/kishi-harness/blob/086b6546384f9b41e8dc271f90b767126f7491a2/packages/preset/agent-presets/README.md
[Session controller]: https://github.com/Kishimotovn/kishi-harness/blob/086b6546384f9b41e8dc271f90b767126f7491a2/packages/api/session-controller/src/agent.ts
[Model selection]: https://github.com/Kishimotovn/kishi-harness/blob/086b6546384f9b41e8dc271f90b767126f7491a2/packages/core/agent/src/model-selection.ts
[Standard]: https://github.com/Kishimotovn/kishi-harness/blob/086b6546384f9b41e8dc271f90b767126f7491a2/packages/preset/agent-presets/presets/standard/agent.cordis.yml
[Cordis]: https://github.com/Kishimotovn/kishi-harness/blob/086b6546384f9b41e8dc271f90b767126f7491a2/packages/preset/agent-presets/presets/cordis/agent.cordis.yml
[Minimal]: https://github.com/Kishimotovn/kishi-harness/blob/086b6546384f9b41e8dc271f90b767126f7491a2/packages/preset/agent-presets/presets/minimal/agent.cordis.yml
[PTC]: https://github.com/Kishimotovn/kishi-harness/blob/086b6546384f9b41e8dc271f90b767126f7491a2/packages/preset/agent-presets/presets/ptc/agent.cordis.yml
[Composition guidance]: https://github.com/Kishimotovn/kishi-harness/blob/086b6546384f9b41e8dc271f90b767126f7491a2/packages/preset/agent-presets/presets/cordis/skills/editing-cordis-compositions/SKILL.md
[Creator guidance]: https://github.com/Kishimotovn/kishi-harness/blob/086b6546384f9b41e8dc271f90b767126f7491a2/packages/preset/agent-presets/presets/cordis/skills/cordis-plugin-development/SKILL.md
[Delegation tool]: https://github.com/Kishimotovn/kishi-harness/blob/086b6546384f9b41e8dc271f90b767126f7491a2/packages/subagent/tool-subagent/src/index.ts
[Model-selection state]: https://github.com/Kishimotovn/kishi-harness/blob/086b6546384f9b41e8dc271f90b767126f7491a2/packages/subagent/tool-subagent/src/model-selection-state.ts
[Subagent request]: https://github.com/Kishimotovn/kishi-harness/blob/086b6546384f9b41e8dc271f90b767126f7491a2/packages/subagent/subagent/src/types.ts
[Child composition]: https://github.com/Kishimotovn/kishi-harness/blob/086b6546384f9b41e8dc271f90b767126f7491a2/packages/subagent/subagent/src/child-agent.ts
[Spawn]: https://github.com/Kishimotovn/kishi-harness/blob/086b6546384f9b41e8dc271f90b767126f7491a2/packages/subagent/subagent-spawn-in-process/src/index.ts
[Fork]: https://github.com/Kishimotovn/kishi-harness/blob/086b6546384f9b41e8dc271f90b767126f7491a2/packages/subagent/subagent-fork-in-process/src/index.ts
[Descriptor]: https://github.com/Kishimotovn/kishi-harness/blob/086b6546384f9b41e8dc271f90b767126f7491a2/packages/subagent/subagent/src/descriptor.ts
[Continuation]: https://github.com/Kishimotovn/kishi-harness/blob/086b6546384f9b41e8dc271f90b767126f7491a2/packages/subagent/subagent/src/continuation.ts
[Activation]: https://github.com/Kishimotovn/kishi-harness/blob/086b6546384f9b41e8dc271f90b767126f7491a2/packages/subagent/subagent/src/continuation-activation.ts
[Skill API]: https://github.com/Kishimotovn/kishi-harness/blob/086b6546384f9b41e8dc271f90b767126f7491a2/packages/skill/skill/src/index.ts
[Skill filesystem]: https://github.com/Kishimotovn/kishi-harness/blob/086b6546384f9b41e8dc271f90b767126f7491a2/packages/skill/skill-filesystem/src/index.ts
[Skill tool]: https://github.com/Kishimotovn/kishi-harness/blob/086b6546384f9b41e8dc271f90b767126f7491a2/packages/skill/tool-skill/src/index.ts
[Kishi process]: https://github.com/Kishimotovn/kishi-sb/blob/01449124312de54e6afdea08a5116a83b78e2f1a/AGENTS.md
[Kishi context]: https://github.com/Kishimotovn/kishi-sb/blob/01449124312de54e6afdea08a5116a83b78e2f1a/CONTEXT.md
[Kishi lock]: https://github.com/Kishimotovn/kishi-sb/blob/01449124312de54e6afdea08a5116a83b78e2f1a/skills-lock.json
[Kishi wrapper]: https://github.com/Kishimotovn/kishi-sb/blob/01449124312de54e6afdea08a5116a83b78e2f1a/.agents/skills/kishi-wayfinder/SKILL.md
[Kishi dispatch]: https://github.com/Kishimotovn/kishi-sb/blob/01449124312de54e6afdea08a5116a83b78e2f1a/bin/kishi-lib.sh
[Kishi QA]: https://github.com/Kishimotovn/kishi-sb/blob/01449124312de54e6afdea08a5116a83b78e2f1a/bin/tick.sh#L1791
[Kishi tracker]: https://github.com/Kishimotovn/kishi-sb/blob/01449124312de54e6afdea08a5116a83b78e2f1a/docs/agents/issue-tracker.md
[Matt release]: https://github.com/mattpocock/skills/tree/6acc160e4e0cd062dbbbd7a1b26ae92855edf07e/skills
[Matt current]: https://github.com/mattpocock/skills/tree/3cca18b368ae95cdbdebbff572ccafa662551015/skills
[Matt wayfinder]: https://github.com/mattpocock/skills/blob/6acc160e4e0cd062dbbbd7a1b26ae92855edf07e/skills/engineering/wayfinder/SKILL.md
[Matt grill]: https://github.com/mattpocock/skills/blob/6acc160e4e0cd062dbbbd7a1b26ae92855edf07e/skills/engineering/grill-with-docs/SKILL.md
[Matt spec]: https://github.com/mattpocock/skills/blob/6acc160e4e0cd062dbbbd7a1b26ae92855edf07e/skills/engineering/to-spec/SKILL.md
[Matt tickets]: https://github.com/mattpocock/skills/blob/6acc160e4e0cd062dbbbd7a1b26ae92855edf07e/skills/engineering/to-tickets/SKILL.md
[Matt implement]: https://github.com/mattpocock/skills/blob/6acc160e4e0cd062dbbbd7a1b26ae92855edf07e/skills/engineering/implement/SKILL.md
[Matt TDD]: https://github.com/mattpocock/skills/blob/6acc160e4e0cd062dbbbd7a1b26ae92855edf07e/skills/engineering/tdd/SKILL.md
[Matt review]: https://github.com/mattpocock/skills/blob/6acc160e4e0cd062dbbbd7a1b26ae92855edf07e/skills/engineering/code-review/SKILL.md
[Matt grilling]: https://github.com/mattpocock/skills/blob/6acc160e4e0cd062dbbbd7a1b26ae92855edf07e/skills/productivity/grilling/SKILL.md
[Matt domain]: https://github.com/mattpocock/skills/blob/6acc160e4e0cd062dbbbd7a1b26ae92855edf07e/skills/engineering/domain-modeling/SKILL.md
[Matt style]: https://github.com/mattpocock/skills/blob/6acc160e4e0cd062dbbbd7a1b26ae92855edf07e/skills/productivity/wait-what/SKILL.md
[Matt research]: https://github.com/mattpocock/skills/blob/6acc160e4e0cd062dbbbd7a1b26ae92855edf07e/skills/engineering/research/SKILL.md
[Matt prototype]: https://github.com/mattpocock/skills/blob/6acc160e4e0cd062dbbbd7a1b26ae92855edf07e/skills/engineering/prototype/SKILL.md
[Decision map]: https://github.com/Kishimotovn/kishi-harness/issues/1
[Hosting decision]: https://github.com/Kishimotovn/kishi-harness/issues/6#issuecomment-5581551252
[GitHub amendment]: https://github.com/Kishimotovn/kishi-harness/issues/8#issuecomment-5654552905
[Workflow decision]: https://github.com/Kishimotovn/kishi-harness/issues/9#issuecomment-5604406428
[Settings amendment]: https://github.com/Kishimotovn/kishi-harness/issues/9#issuecomment-5654860105
[Ownership detail]: https://github.com/Kishimotovn/kishi-harness/issues/12#issuecomment-5658246002
[Ownership approval]: https://github.com/Kishimotovn/kishi-harness/issues/12#issuecomment-5659737756

## Verification Limitations

Executed: read-only Git revision/remotes/status inspection; read-only `gh issue view` and `gh api` of primary decisions and skill sources; Node byte comparisons of twelve skill entry files against both immutable upstream revisions; report structure/newline/line-budget/reference checks; existence checks for 37 immutable local source targets; exact one-file edit-scope assertion; `git diff --check` and `git diff --no-index --check /dev/null` for the report; editor diagnostics (none). These are document/source checks, not DSH behavior tests.

Repository validation uses this report's separate research worktree and its own dependencies: frozen-lockfile installation, `change-scope --base origin/master`, `test:docs`, `doc-sync`, and lint completed successfully. Lint includes the repository Host build. These commands validate the document and existing source tree, not a role-preset implementation; no DSH behavioral or model-driven role tests were run.

The investigation performed no Creator MCP query, application boot, mount validation, model call, cloud experiment, or credential/private-auth-file read. It created no production preset and changed no locked skill or Chinese documentation. Prototype UI work and GitHub decision bookkeeping are separate from this source-only research; neither supplies runtime evidence for its proposed role mapping.

## Dev Note

The following proposals and questions are non-authoritative. They add no approved role names, tool schemas, defaults, permissions, or implementation tickets. Production implementation still waits for the map's spec acknowledgement and ticket approval. [Decision map], [Ownership approval].

### Proposed Role Mapping

The minimal candidate uses role configuration over reusable DSH mechanisms, not a new runtime/provider per role. The names below describe responsibilities, not preset ids that exist. Separate named presets are useful only where their prompt/tool/skill contributions actually differ. [Architecture], [Standard], [Subagent request].

| Role | Minimal candidate composition | Skills and responsibilities | Model/Session question |
| --- | --- | --- | --- |
| Main coordinator / Aggregator | Copy of `standard` with coordinator instructions, scoped Host GitHub tools and native delegation; no creator self-modification requirement. | Wayfinding/grilling handoff, to-spec/to-tickets checkpoints, review aggregation, human rulings, merge/rollup; reuse Matt review/domain/style guidance plus Kishi workflow wrappers. | Approved main identity, not another aggregation subagent; keep its selected model. [Ownership detail], [Matt review], [Kishi dispatch]. |
| Planner | Main-conversation planning responsibility; a separate read-focused planning worker/preset only where a distinct planning model needs execution. | Matt wayfinder or grill-with-docs, grilling/domain-modeling, to-spec, to-tickets; research/prototype helpers as relevant. Human exchange remains in main. | Decide how planning and main/Aggregator model settings coexist without switching an existing main Session's model. [Matt wayfinder], [Matt spec], [Settings amendment]. |
| Builder | Reuse `standard` coding capabilities with an approved-task prompt; copy only if tool/skill policy differs. | Matt implement + TDD; repository domain/docs/checks and self-review; return to independent review. | Host supplies current saved build model at new-child creation. The stock child tool cannot choose `standard` by id. [Standard], [Child composition], [Matt implement]. |
| Reviewer workers | One reusable review composition with configured persona/tool restrictions; prefer fresh spawn contexts over builder-history forks. | Matt code-review's Standards and Spec axes, same pinned base/head/spec; Kishi complexity guidance is supplementary. | One or more configured reviewer models, each durably identified. Decide axis-to-worker mapping without recursively duplicating an entire panel. [Matt review], [Fork], [Workflow decision]. |
| QA worker | Reuse coding/shell primitives with an acceptance-testing persona and actual browser/command adapter. | Kishi QA/evidence/test-only Healer instructions, approved acceptance criteria, relevant TDD principles and wait-what output; not an invented Matt QA-runner skill. | Separate selected QA model and independent result; failures go to main/builder, not silent application fixes. [Kishi QA], [Matt TDD], [Workflow decision]. |

### Open Decisions

1. **Planner identity:** a planning worker, a distinct planning Session associated with the work item, or work done directly by main? Specify how the existing planning and Aggregator settings apply without changing approved Session-stable selection or human-interaction ownership. [Settings amendment], [Ownership detail].
2. **Worker composition selection:** are shared `standard` capabilities plus per-child persona/filter sufficient, or are independently selected named presets required? The latter needs an explicit supported create/resume extension; choose its API and persistence together, not an ignored `presetId` argument. [Child composition], [Subagent request], [Activation].
3. **Durable selections:** choose the role, configured-model identity, selected preset, and enabled-name records, plus missing/deleted-preset behavior. Distinguish new worker creation from resuming the same worker; do not freeze credentials or silently select current defaults during recovery. [Descriptor], [Session controller], [Settings amendment].
4. **Skill policy:** define the approved catalog across workspace/preset/Host roots, consistent body/invocation filtering, wrapper dependency loading, model-disabled workflow invocation, and treatment of removed/updated skill bodies. The amendment freezes selection, not every body or package version. [Skill API], [Skill tool], [Settings amendment].
5. **Review and QA independence:** select fresh-context inputs, revision identity, Standards/Spec versus model-panel layout, result attribution, and QA tool availability. Keep both review axes, unresolved objections, missing-result handling, and human rulings visible. Different models or a persona alone do not establish independence. [Matt review], [Workflow decision], [Kishi QA].
6. **Wrapper integration:** select Host GitHub tool schemas and Kishi-owned instruction location. Preserve explicit human ACK and `APPROVE TICKETS`, but do not port Bash keyword dispatch, issue-writing ownership, auto-retry shortcuts, or Host credentials into presets. Reconcile Matt Wayfinder's decision-ticket-per-Session guidance with a persistent coordinator before automating it. [Matt wayfinder], [GitHub amendment], [Ownership detail].

### Cheapest Next Prototype

After separate authorization, use the existing focused fixture owners below for an in-process, model-free composition/selection prototype. Create no production preset or new service owner merely to demonstrate a persona. `standingKeyFor()` and prompt/tool assembly can test composition without requesting inference; actual provider calls, OS confinement, and model compliance remain later acceptance. [Preset API], [Preset tests].

1. Mount two disposable role compositions; inspect assembled tools/prompts/skill catalogs and disposal. Include missing-service and process-global-service failures. [Preset tests]
2. Resolve synthetic role settings, create parent/child without driving a model, change saved defaults, and assert old Session selections stay fixed while a new child receives current role defaults. Repeat cold resume, including missing selected resources and distinct configured routes with identical model names. [Session controller], [Continuation], [Settings amendment].
3. Test cwd plus scope across two repositories/presets. A disabled name must disappear from the catalog and fail direct body loading and disallowed invocation; model-disabled upstream skills must remain unavailable until an explicitly approved wrapper/invocation path exists. [Skill tests], [Skill tool].
4. Use synthetic review/QA messages to check distinct axis/model attribution, unresolved-objection and missing-result states, human-only answers, and prompt-carried cycle-limit guidance. Check current authorization denial separately from stable selections; such fixtures cannot prove that a real model follows the workflow. [Workflow decision], [Ownership detail].

[Preset tests]: https://github.com/Kishimotovn/kishi-harness/blob/086b6546384f9b41e8dc271f90b767126f7491a2/packages/preset/agent-presets/tests/mount.spec.ts
[Skill tests]: https://github.com/Kishimotovn/kishi-harness/blob/086b6546384f9b41e8dc271f90b767126f7491a2/packages/skill/tool-skill/tests/tool-skill.spec.ts
