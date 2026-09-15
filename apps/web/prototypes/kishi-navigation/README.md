# Kishi Navigation Prototype

## Summary

Review repository navigation, administrator settings, and member preferences around DSH's native conversation. This disposable prototype belongs to [Prototype repository backlog and human-pending views](https://github.com/Kishimotovn/kishi-harness/issues/10). It does not change the shipped DSH application; the static variants are comparison material.

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

[native-client.js](native-client.js) contributes Backlog and Attention views and the Global, Repositories, and Users settings sections through DSH creator tools. New request invokes the native New Session flow in the current real DSH Workspace; the sample repositories are not bound to real Workspaces. The native conversation and composer remain in place. Its Users section combines email and repository assignments in one invitation form. Simulate email failure retains the sample account and assignments; Resend updates that account without duplication. Existing assignments use Save changes and Discard. Confirmed Disable access retains the sample account and assignments, and Re-enable access restores its sample enabled state. No email or account operation reaches Firebase.

The creator package includes a labelled presentation sample: member name and recorded time below a sample human response, followed by a plain conversation preview link. The isolated browser check renders this sample for review; it is registered for the latest eligible creator Run card. Sample identities are never attached to real messages, and there is no separate Activity view. The link uses a reserved `.test` address with no deployed application. Authenticated attribution, private-preview routing, revocation, and durable audit records remain production requirements.

Both roles use DSH's native settings popup. Language is hidden for both roles; Kishi supports English only. Member mode keeps the native Appearance and Text size controls and permits read-only access to saved settings for assigned sample repositories, including inherited values but excluding administrator drafts. Global configuration, Users, model/provider setup, plugins, and presets remain administrator-only; their prototype sections display an access-required message. Member mode hides the permission and configuration-file actions. Reversible slot registrations restore administrator controls when the sample role changes. The prototype supplies no per-member preference storage or server authorization; repository, account, and model-setting data remain in memory.

[native-models.js](native-models.js) supplies the read-only Host half. Role selectors use the configured DSH provider/model catalog instead of a separate hardcoded list. Selections preserve both provider and model identity. The native Models page has sample repository-availability controls beside each configured provider; saving those controls filters the prototype selectors without changing real authorization or credentials. A selection that becomes unavailable remains marked unavailable, with no fallback. Global choices exclude repository-restricted configurations.

Global and repository settings keep separate pending drafts across settings navigation. Repositories includes a selector inside the settings dialog; switching repositories retains each one's pending draft. Save changes applies only the selected scope; Discard restores its saved values. Reset stages removal of a repository override until Save. Unsaved global edits do not affect inherited repository values. The New Session defaults heading identifies the model and skill defaults. These are sample values, not durable Session selections or live model settings.

Reviewer selections use the repository-filtered model catalog. Enabled skills uses names from a complete Host-level skill catalog; repository and preset discovery are not wired to the sample repositories. Both lists replace inherited lists when saved as repository overrides. The workflow controls include final-closure acknowledgement, initially off, and the unsuccessful fix/review cycle limit, initially two. Save requires at least one reviewer and a positive whole-number cycle limit. It rejects unavailable selected models or skills and incomplete skill discovery.

## Review Scope

The native review covers assigned repositories, backlog requests and child tickets, human-pending work, Users, and separate global/repository settings. Progress and recovery remain in the native conversation, without separate Subagents or Attempts views or custom Continue, Retry, Pause, and Cancel controls. Member mode has one sample assigned repository, native display preferences, and read-only repository settings; administrator mode also exposes account and repository configuration.

The static comparison's Scenario selector exposes unavailable issues, external issue closure, an uncertain GitHub write, application restart, unavailable models, incomplete review, and pending cancellation. A submitted sample response has no scripted interpretation or approval transition. Explicit crash recovery, credential authorization, attributed history, and truthful process status remain product requirements.

Repository settings distinguish inherited values from explicit overrides. Reviewer and skill selections replace lists. Model configurations with the same model name but different credential labels remain distinct. The approved product rule applies saved model and enabled-skill defaults to new Sessions and newly spawned subagents; existing Sessions retain their selections. The sample does not implement Session selection persistence or change live model routes.

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

This check renders the Client source with React and local slot and catalog stubs. It checks account controls, independent repository drafts, model filtering, member read-only saved values, Language removal for both roles, native preference retention, and administrator restoration. It checks the attribution footer at desktop/mobile widths and opens the sample link in a new tab using an intercepted response, without an opener or referrer. No request reaches a real preview server. Screenshots are written to a temporary directory. DSH authorization, the real slot lifecycle, and native theme fidelity require separate live verification.

The checker loads DSH theme styles and rejects the separate Activity registration. Authenticated inline attribution requires separate integration and live verification.

## Limitations

The static page and isolated checks provide navigation evidence, not authentication, authorization, persistence, subprocess-isolation, GitHub App, or model-provider evidence. The native Host half reads model metadata and Host-level skill summaries without loading skill bodies. No Firebase emails, GitHub writes, inference requests, repository commands, or credential collection occur. The security controls are sample UI states, not an enforceable system. Role switching and the Scenario selector are prototype controls only.

The static conversation is a navigation placeholder, not DSH's native renderer. The implementation direction is to retain DSH's actual conversation, reasoning, tool and subagent presentation, and composer through its existing Client plugins. This static page is not mounted through DSH plugins or profiles and is not part of the application build. It has no production locale integration, no saved data, and no automatic workflow runner. Production implementation still requires the map, spec, and ticket approval checkpoints.

## Dev Note

The human approved the reviewed UX on 2026-09-15 and authorized this evidence checkpoint. The ticket records the approved [Users interactions](https://github.com/Kishimotovn/kishi-harness/issues/10#issuecomment-5660227731), [navigation names](https://github.com/Kishimotovn/kishi-harness/issues/10#issuecomment-5660790501), [administrator settings](https://github.com/Kishimotovn/kishi-harness/issues/10#issuecomment-5660962145), and [English-only member read access](https://github.com/Kishimotovn/kishi-harness/issues/10#issuecomment-5666562550). The response footer and preview link were reviewed as labelled samples, not authenticated live output. The static reference's Activity view and next-call settings display are not the selected design; use the [inline-only decision](https://github.com/Kishimotovn/kishi-harness/issues/10#issuecomment-5650464134) and [Session settings revision](https://github.com/Kishimotovn/kishi-harness/issues/9#issuecomment-5654860105).

The [native settings duplicate-row fix](https://github.com/Kishimotovn/kishi-harness/issues/10#issuecomment-5668118385) is separate from this prototype checkpoint. The running preview has a backed-up generated-module patch; rebuilding without integrating its source fix replaces that patch. Creator tooling and fork CI remain open delivery prerequisites. Native global New Session shortcuts, real repository bindings, blank-session setup controls, authenticated attribution, and preview routing still require product integration. The user requires creator-mode skills and native conversation reuse. UX approval is a basis for the spec, not approval of role-preset design, production code, or deployment.
