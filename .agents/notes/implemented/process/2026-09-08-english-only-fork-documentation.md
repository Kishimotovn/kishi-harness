# Agent Note: English-only Kishi documentation maintenance

Status: implemented

## Problem

Kishi does not maintain a Chinese translation of its repository documentation. DSH requires bilingual updates, while Kishi needs to retain upstream files so future DSH merges do not repeatedly conflict with a deleted translation tree.

## Decision

The fork opts into English-only documentation through [doc-policy.json](../../../../scripts/doc-policy.json). The [maintenance policy](../../../../docs/agents/documentation-policy.md) owns authoring and verification rules. An absent setting preserves DSH's bilingual behavior; malformed configuration fails.

The [upstream bilingual decision](2026-07-02-bilingual-docs-and-pairing-gate.md) remains active for bilingual mode. This record owns the fork-specific exception, not a replacement for DSH's translation mechanism. Existing translations, pairing records, and frozen archive seals remain tracked and unchanged.

Documentation checks select maintained English files. Pairing checks honor the same setting in local commands and CI, and commit checks read its staged bytes. Pairing writes are refused in English-only mode, including automatic catalog re-recording. The website selects English pages from the unchanged bilingual publication manifest and preserves the `/en/` URLs.

## Alternatives considered

**Delete the Chinese documentation.** Upstream edits would create recurring modify/delete conflicts and remove useful upstream material. Preserving files avoids that conflict source without promising current Kishi translations.

**Disable only the commit hook.** CI, documentation examples, and website publication also consume bilingual files. An explicit shared policy covers those consumers without bypassing English documentation checks.

**Refresh hashes without translating.** Pairing records certify a reviewed equivalence. Rewriting their hashes without maintaining that equivalence would make an unsupported claim.

## Consequences

Kishi can update or add English documentation without changing Chinese files. Retained translations can be stale for Kishi, so the website does not publish them. Application UI locales and archived-file integrity remain independent of documentation maintenance.

The fork maintains a small integration patch and must check new upstream documentation consumers when updating. Restoring bilingual mode requires reconciling translations and records; the opt-out does not erase that work.

## Verification

[Policy tests](../../../../scripts/doc-policy.spec.ts) cover defaults, invalid settings, staged-policy selection, retained Chinese files, and rejection of broken English links. [Catalog tests](../../../../scripts/gen-cordis-catalog-record.spec.ts) protect upstream pairing records. [Website tests](../../../../scripts/project-doc-site.spec.ts) cover both publication modes, the English root redirect, raw Markdown, and the English-only index. The standard documentation checks and website build remain required.
