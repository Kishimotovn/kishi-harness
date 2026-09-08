# Domain Docs

Single-context: one optional root `CONTEXT.md`; decisions stay in the existing Agent Notes.

- Before exploring, read the [architecture](../architecture.md), [glossary](../glossary.md), and active [Agent Notes](../../.agents/notes/README.md) relevant to the topic.
- Read root `CONTEXT.md` and relevant `docs/adr/` records if present. If `CONTEXT-MAP.md` exists, follow it to the relevant context files.
- If optional context or ADR files are missing, proceed silently. Do not propose placeholders; `/domain-modeling` adds material when terminology or decisions are resolved.
- Use the glossary's terms in issues, specifications, hypotheses, and tests. Context documents link to shared definitions instead of duplicating them.
- Record new decisions through the [Agent Note workflow](../../.agents/notes/README.md). Do not introduce a parallel ADR record. Archived notes are not current authority.
- Flag any conflict with an existing decision explicitly before proposing to reopen it.
