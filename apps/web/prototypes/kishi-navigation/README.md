# Kishi Navigation Prototype

## Summary

Compare three navigation layouts for repository work and main-session human responses. This disposable, static prototype belongs to [Prototype repository backlog and human-pending views](https://github.com/Kishimotovn/kishi-harness/issues/10). It does not change the shipped DSH application.

## Contents

- [Open the prototype](#open-the-prototype)
- [Native DSH prototype](#native-dsh-prototype)
- [Review scope](#review-scope)
- [Validation](#validation)
- [Limitations](#limitations)
- [Dev Note](#dev-note)

## Open the Prototype

Open [index.html](index.html) directly in a browser. No server, credentials, installation, or network access is needed. All actions change in-memory sample data; reloading resets it.

The bottom switcher selects `?variant=A`, `?variant=B`, or `?variant=C`. Left and right arrow keys switch layouts when no input or dialog has focus. The State button displays the current sample state.

| Variant | Navigation question |
| --- | --- |
| A: Repository first | Does a repository rail, parent/child backlog, and conversation pane preserve enough context? |
| B: Human attention first | Does a team-wide attention queue make human requests easier to find? |
| C: Conversation first | Does a full-width conversation with a work-item picker reduce distraction without hiding too much context? |

## Native DSH Prototype

[native-client.js](native-client.js) contributes sample navigation and settings sections through DSH creator tools while retaining the native conversation and composer. Its Users section includes one invitation form with an email field and repository assignments. Simulate email failure retains the sample account and assignments; Resend updates that account without duplicating it. All Kishi state is in memory, and no email or account operation reaches Firebase.

The native prototype keeps human responses and actions in the conversation without a separate Activity or audit popup. Verified author and recorded time belong beside each human response. Authenticated attribution is not wired in this prototype, and sample identities are never attached to real messages. Durable audit records and repository authorization remain production requirements.

[native-models.js](native-models.js) supplies the read-only Host half. Role selectors use the configured DSH provider/model catalog instead of a separate hardcoded list. Selections preserve both provider and model identity. The native Models page has sample repository-availability controls beside each configured provider; saving those controls filters the prototype selectors without changing real authorization or credentials. A selection that becomes unavailable remains marked unavailable, with no fallback. Global choices exclude repository-restricted configurations.

Global and repository settings keep separate pending drafts across settings navigation. Save changes applies only the current scope; Discard restores its saved values. Reset stages removal of a repository override until Save. Unsaved global edits do not affect inherited repository values. These saved values are sample state, not durable configuration or live model settings.

Reviewer selections use the repository-filtered model catalog. Enabled skills uses names from a complete Host-level skill catalog; repository and preset discovery are not wired to the sample repositories. Both lists replace inherited lists when saved as repository overrides. The workflow controls include final-closure acknowledgement, initially off, and the unsuccessful fix/review cycle limit, initially two. Save requires at least one reviewer and a positive whole-number cycle limit. It rejects unavailable selected models or skills and incomplete skill discovery.

## Review Scope

All variants share the same sample requests, child tickets, main-session Aggregator, audit, and settings. Progress and recovery are communicated in the conversation, without separate Subagents or Attempts views or custom Continue, Retry, Pause, and Cancel controls. The member preview has one assigned repository and read-only settings. The administrator preview also includes Users, pre-login assignments, invitation resend, and repository connections.

The Scenario selector exposes unavailable issues, external issue closure, an uncertain GitHub write, application restart, unavailable models, incomplete review, and pending cancellation. A submitted conversational response is recorded without a scripted interpretation or approval transition. Removing custom controls does not remove the requirements for explicit crash recovery, credential authorization, attributed history, or truthful process status.

Repository settings distinguish inherited values from explicit overrides. Reset removes an override. Reviewer and skill selections replace lists. Model configurations with the same model name but different credential labels remain distinct. The read-only next-call display reflects current sample model and skill settings; earlier displayed messages stay unchanged.

## Validation

From the repository root, with the existing Web app dependencies and Playwright Chromium installed:

```sh
node apps/web/prototypes/kishi-navigation/check.mjs
```

The check drives the static page, rejects unexpected network requests and browser errors, exercises the sample interactions, and captures all three layouts at desktop and phone widths. It creates a unique temporary screenshot directory and prints its path. The browser closes even if an assertion fails.

Check the native invitation, settings, and navigation components independently:

```sh
node apps/web/prototypes/kishi-navigation/native-invitation-check.mjs
```

This check exercises the Host catalog adapter with fake model and skill registries and renders the Client source with React using local slot and catalog stubs. It checks invitation failure/retry, settings Save/Discard and inheritance, reviewer/skill list replacement, workflow defaults and validation, incomplete skill discovery, provider/model identity, repository inclusion/exclusion, unavailable selections, and desktop/mobile width. It blocks browser network requests and captures screenshots in a temporary directory. It does not exercise DSH authorization, the real slot lifecycle, or native theme fidelity; those require the approved live package.

The checker loads DSH theme styles and rejects the separate Activity registration. Authenticated inline attribution requires separate integration and live verification.

## Limitations

The static page and isolated checks provide navigation evidence, not authentication, authorization, persistence, subprocess-isolation, GitHub App, or model-provider evidence. The native Host half reads model metadata and Host-level skill summaries without loading skill bodies. No Firebase emails, GitHub writes, inference requests, repository commands, or credential collection occur. The security controls are sample UI states, not an enforceable system. Role switching and the Scenario selector are prototype controls only.

The static conversation is a navigation placeholder, not DSH's native renderer. The implementation direction is to retain DSH's actual conversation, reasoning, tool and subagent presentation, and composer through its existing Client plugins. This static page is not mounted through DSH plugins or profiles and is not part of the application build. It has no production locale integration, no saved data, and no automatic workflow runner. Production implementation still requires the map, spec, and ticket approval checkpoints.

## Dev Note

The human accepted [Backlog as the default with Attention secondary](https://github.com/Kishimotovn/kishi-harness/issues/10#issuecomment-5613649196), [human-pending AFK visibility](https://github.com/Kishimotovn/kishi-harness/issues/10#issuecomment-5613743796), the [single invitation form](https://github.com/Kishimotovn/kishi-harness/issues/10#issuecomment-5614882932), [explicit settings Save](https://github.com/Kishimotovn/kishi-harness/issues/10#issuecomment-5615560239), and [inline author/time instead of an audit popup](https://github.com/Kishimotovn/kishi-harness/issues/10#issuecomment-5650464134). The older static reference predates the inline-only decision. Users/settings and complete native layout review remain open. The user requires DSH creator-mode skills and native conversation reuse. No prototype code is approved for production use.
