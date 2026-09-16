# Documentation maintenance

Kishi maintains English documentation only when [scripts/doc-policy.json](../../scripts/doc-policy.json) sets `englishOnly` to `true`. This policy overrides translation and local documentation-check requirements in upstream documentation and agent skills. All other documentation standards remain in force.

## Authoring

- Update English documentation, package READMEs, and active Agent Notes with the code. New documents need no Chinese counterpart, language switcher, or pairing record.
- Keep upstream Chinese files and their pairing records tracked. Do not translate, delete, or re-record them to accompany Kishi changes. They describe upstream DSH and may differ from this fork.
- Leave frozen [archived Agent Notes](../../.agents/notes/archived/AGENTS.md) unchanged. Their integrity checks remain enabled.
- Keep application UI localization unchanged; this setting controls repository documentation only.

## Verification

CI owns repository-wide documentation checks and full lint in this fork. Run `pnpm run test:docs`, `pnpm run doc-sync`, `pnpm run lint`, or their documentation validators locally only when the user explicitly requests them, including for CI failure diagnosis. Local edits, task completion, commits, pushes, and PR preparation do not trigger these commands. This overrides local verification requirements in upstream instructions and skills, including [dsh-doc](../../.agents/skills/dsh-doc/SKILL.md#workflow) and [dsh-pre-push-checks](../../.agents/skills/dsh-pre-push-checks/SKILL.md#select-relevant-evidence).

Keep documentation current and leave CI workflows and normal Git hooks enabled. Focused behavior tests, editor diagnostics, and whitespace checks remain local. Report CI validation as pending until its results are available.

English links, code examples, copied types, diagrams, README requirements, and generated catalogs remain checked in CI. Chinese files are excluded from source documentation checks.

The pairing command reports the English-only opt-out. Its `--write` operation refuses to reconfirm translations. Commit-time `--cached` checks read the policy from the Git index, not unstaged changes. Catalog generation leaves Chinese files and pairing records unchanged.

The documentation website publishes English pages under `/en/`, with `/` redirecting there. Search, raw Markdown, and `llms.txt` use the English publication. Retained Chinese pages are not published as Kishi documentation.

## Upstream updates

Keep the fork policy and its integration changes when merging DSH updates. Review new upstream documentation checks and generators for language assumptions. Do not resolve conflicts by deleting the upstream translation tree or disabling unrelated checks.

An absent policy file or `englishOnly: false` restores DSH's bilingual behavior. Before switching back, reconcile missing or stale counterparts and pairing records; the bilingual checks enforce that work. Invalid settings fail rather than silently disabling checks.

The [decision record](../../.agents/notes/implemented/process/2026-09-08-english-only-fork-documentation.md) explains the trade-offs.
