# Kishi V2 GitHub Integration Research

English | [中文](2026-09-08-kishi-v2-github.zh.md)

## Summary

GitHub Apps support repository automation without a shared personal access token. An installation credential identifies the App, not the member requesting work, and does not remove branch protections. This reference separates documented capabilities from read-only evidence for [Research GitHub App onboarding, credentials, and issue integration](https://github.com/Kishimotovn/kishi-harness/issues/4); it does not approve an implementation. Sources: [installation authentication](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/authenticating-as-a-github-app-installation), [branch protections](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches).

## Table of Contents

- [Evidence](#evidence)
- [Installation and identity](#installation-and-identity)
- [Operations and permissions](#operations-and-permissions)
- [Credentials and repository code](#credentials-and-repository-code)
- [Work items and synchronization](#work-items-and-synchronization)
- [Protected merges](#protected-merges)
- [Webhooks and recovery](#webhooks-and-recovery)
- [Dev Note](#dev-note)

-----

## Evidence
<a id="evidence"></a>

Read-only `gh api` requests on 2026-09-08 observed a public fork with Issues enabled. The [Kishi V2: Chart the plugin-first DSH implementation child-list endpoint](https://api.github.com/repos/Kishimotovn/kishi-harness/issues/1/sub_issues) returned ten children. The [Research GitHub App onboarding, credentials, and issue integration parent endpoint](https://api.github.com/repos/Kishimotovn/kishi-harness/issues/4/parent) identified that map. The [Decide GitHub synchronization and work-item ownership blocker endpoint](https://api.github.com/repos/Kishimotovn/kishi-harness/issues/8/dependencies/blocked_by) identified the GitHub integration and DSH plugin/settings research tickets. The [GitHub integration research dependent endpoint](https://api.github.com/repos/Kishimotovn/kishi-harness/issues/4/dependencies/blocking) identified the repository-access and synchronization decisions. The three relationship requests with headers returned HTTP 200 and selected API version `2022-11-28`.

The installed CLI reported `2.92.0`. These reads used existing CLI authentication, not a Kishi installation token. The remaining GitHub capabilities are documentation-only findings, not tested installation, private-repository, mutation, or webhook guarantees.

## Installation and identity
<a id="installation-and-identity"></a>

Installation grants requested permissions on an account and selected repositories. Organization owners can install; repository administrators can install within documented permission and organization-policy restrictions. Others can request approval. A private App registration is restricted to its owning account, so an invite-only Kishi team does not by itself imply a private App registration. Sources: [installation requirements](https://docs.github.com/en/apps/using-github-apps/installing-a-github-app-from-a-third-party), [App visibility](https://docs.github.com/en/apps/using-github-apps/installing-your-own-github-app).

Selected repositories constrain installation access, but do not isolate public data: GitHub documents public read access, and some REST endpoints allow unauthenticated public reads. Private access and writes still require the appropriate installation, repository selection, and permissions. New requested permissions require installation-owner approval. Sources: [installation selection](https://docs.github.com/en/apps/using-github-apps/installing-a-github-app-from-a-third-party), [permission rules](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/choosing-permissions-for-a-github-app).

`GET /installation/repositories` lists accessible repositories. In contrast, adding/removing repositories through `/user/installations/{installation_id}/repositories/{repository_id}` requires repository administration and a classic PAT. Installation tokens cannot expand their own selection. PAT-free onboarding therefore leaves selection with GitHub's administrator-controlled installation process, not those REST mutation endpoints. Source: [installation API](https://docs.github.com/en/rest/apps/installations).

Installation calls are attributed to the App. User-attributed calls require each user's separate authorization and a user access token; access is the intersection of user and App access. GitHub recommends user tokens for operations on a user's behalf. A Firebase login or Kishi repository assignment is not GitHub user consent. The choice between team-owned automation and user-delegated actions remains a human decision. Sources: [user authentication](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/authenticating-with-a-github-app-on-behalf-of-a-user), [App security guidance](https://docs.github.com/en/apps/creating-github-apps/about-creating-github-apps/best-practices-for-creating-a-github-app).

## Operations and permissions
<a id="operations-and-permissions"></a>

The [GitHub App permission index](https://docs.github.com/en/rest/authentication/permissions-required-for-github-apps) marks the following REST operations as installation-token compatible. These are operation-specific repository permissions, not a request to grant every row.

| Operation | Required permission for this use |
| --- | --- |
| Read repository metadata or collaborator permission | Metadata: read |
| Read issues, comments, parents, sub-issues, dependencies | Issues: read |
| Create/update issues and issue comments; change native relationships | Issues: write |
| HTTPS clone/fetch; push ordinary code | Contents: read; Contents: write respectively ([Git access](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/choosing-permissions-for-a-github-app#choosing-permissions-for-git-access)) |
| Create/update PRs | Pull requests: write |
| Merge a PR through REST | Contents: write |
| Read check runs; read commit statuses | Checks: read; Commit statuses: read respectively |

Workflow-file changes under `.github/workflows` need the separate Workflows permission, including write access for changes; ordinary code pushes do not justify it. Actions run/log inspection uses Actions: read. Inspecting legacy branch-protection configuration uses Administration: read; respecting protection does not require Administration: write. These distinctions come from the [Git access guidance](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/choosing-permissions-for-a-github-app#choosing-permissions-for-git-access) and [permission index](https://docs.github.com/en/rest/authentication/permissions-required-for-github-apps).

## Credentials and repository code
<a id="credentials-and-repository-code"></a>

The backend signs an App JWT and exchanges it for an installation token. Tokens expire after one hour; renewal creates another token, not a user-token refresh. Explicit `repository_ids` and `permissions` narrow the grant; omission inherits the installation's full corresponding grant. A token cannot exceed installation access, and explicit repository lists have a 500-repository limit. Octokit can regenerate expired tokens. Source: [token generation](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app).

`GH_TOKEN` supplies headless `gh` authentication and overrides stored credentials. It does not make user-only endpoints installation-compatible: `/user/repos`, for example, accepts user tokens, not installation tokens. Each required CLI command still needs an App-token compatibility check. Sources: [CLI environment](https://cli.github.com/manual/gh_help_environment), [authentication behavior](https://cli.github.com/manual/gh_auth_login), [permission index](https://docs.github.com/en/rest/authentication/permissions-required-for-github-apps).

Git accepts installation tokens as HTTPS passwords. [Git credential helpers and `GIT_ASKPASS`](https://git-scm.com/docs/gitcredentials) provide credentials separately from URLs; helpers can persist them, and HTTP path matching is disabled by default. [Worktrees share repository configuration](https://git-scm.com/docs/git-worktree#_configuration_file), so they are not credential isolation.

Repository code that obtains a token can exercise its granted permissions until expiry or revocation. A stolen App private key can authorize across installations. Private repositories do not make build scripts or dependencies trustworthy; GitHub's [execution-security guidance](https://docs.github.com/en/actions/reference/security/secure-use#hardening-for-self-hosted-runners) documents credential theft through shared execution environments. [App security guidance](https://docs.github.com/en/apps/creating-github-apps/about-creating-github-apps/best-practices-for-creating-a-github-app) requires protected credential storage and supports early token revocation.

## Work items and synchronization
<a id="work-items-and-synchronization"></a>

The agreed Kishi mapping is one GitHub issue per request or ticket, with multiple DSH sessions, retries, and subagents attached to that work item. The final completion summary, not each conversation message, is the agreed GitHub-facing output. These are product requirements, not GitHub session semantics.

[Native sub-issues](https://docs.github.com/en/rest/issues/sub-issues) have parent/list/add/remove/reorder operations; add uses the issue's `sub_issue_id`, not its repository-local number, and requires the same repository owner. `replace_parent` explicitly permits reparenting. GitHub documents [100 children and eight nesting levels](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/adding-sub-issues). [Dependencies](https://docs.github.com/en/rest/issues/issue-dependencies) separately expose `blocked_by` and `blocking`; adding a blocker uses `issue_id`. Neither relationship represents a DSH session.

[Issue creation/update](https://docs.github.com/en/rest/issues/issues) and [comment creation/update](https://docs.github.com/en/rest/issues/comments) return identifiers for later updates. These endpoint definitions do not promise a client idempotency key. A lost create response can therefore leave a successful write whose retry duplicates content. Conditional GET supports ETags, but conditional mutations are unsupported unless an endpoint explicitly documents them. Source: [REST best practices](https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api).

## Protected merges
<a id="protected-merges"></a>

[Merge REST](https://docs.github.com/en/rest/pulls/pulls#merge-a-pull-request) supports `merge`, `squash`, and `rebase`, with optional expected head `sha`; a mismatch returns 409. An App allowed to push still needs required PRs and passing checks. Repository policies can also require reviews, current branches, signatures, or a merge queue. Source: [protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches).

[CLI merge](https://cli.github.com/manual/gh_pr_merge) supports expected-head matching, auto-merge, and queue participation. `--admin` invokes bypass privileges; App authentication supplies none automatically. For native stacked PRs, [asynchronous merge](https://docs.github.com/en/rest/pulls/pulls#merge-a-pull-request-asynchronously) is required. Acceptance is not completion: its initial checks exclude branch protections, and the eventual result can fail. Issue dependency links do not replace repository merge rules.

## Webhooks and recovery
<a id="webhooks-and-recovery"></a>

GitHub signs the original payload with the webhook secret using HMAC-SHA256 in `X-Hub-Signature-256`. Verify unmodified bytes with a constant-time comparison before processing. HTTPS and certificate verification remain necessary. Sources: [signature validation](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries), [webhook practices](https://docs.github.com/en/webhooks/using-webhooks/best-practices-for-using-webhooks).

The receiver must return 2xx within ten seconds. GitHub does not automatically retry failed deliveries; [redelivery is available for three days](https://docs.github.com/en/webhooks/testing-and-troubleshooting-webhooks/redelivering-webhooks). Redelivery retains `X-GitHub-Delivery`. [App delivery listing/redelivery](https://docs.github.com/en/rest/apps/webhooks) requires an App JWT, not an installation token. No exactly-once business effect follows from delivery acknowledgement. Sources: [delivery failure handling](https://docs.github.com/en/webhooks/using-webhooks/handling-failed-webhook-deliveries), [delivery identifiers](https://docs.github.com/en/webhooks/using-webhooks/best-practices-for-using-webhooks#use-the-x-github-delivery-header).

GitHub can deliver events late and out of order. Payload timestamps, not arrival order, describe event timing. Source: [webhook troubleshooting](https://docs.github.com/en/webhooks/testing-and-troubleshooting-webhooks/troubleshooting-webhooks#webhooks-deliveries-are-out-of-order).

-----

## Dev Note
<a id="dev-note"></a>

<details>
<summary>Unapproved recommendations and verification gaps</summary>

Candidate: keep a trusted GitHub service outside repository execution. Verify installation/account/repository access server-side and enforce Kishi member assignments on every operation. Store the signing key and independent webhook secret in protected backend secret storage; keep installation tokens short-lived and out of browsers, model context, logs, clone URLs, and persisted remotes. Give trusted Git operations credential-free URLs and a non-persisting credential provider. Do not expose a token or unrestricted credential service to hostile code. Hosting and storage remain undecided; Firebase remains a preference.

Candidate: persist repository/issue identifiers, work-item-to-session links, and completion-comment identifiers. Serialize writes per work item and reconcile uncertain creates before retrying. Persist verified deliveries before acknowledgement, deduplicate completed effects, retain failed processing for retry, and reconcile missed state. Respect `Retry-After` and rate-limit reset responses ([REST retry guidance](https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api#handle-rate-limit-errors-appropriately)).

HITL decisions remain open: direct-GitHub edit ownership, conflict handling, closure/reopening, approval authority, and team automation versus user attribution. Preserve global defaults and repository overrides for configurable merge workflow; neither can override GitHub-enforced rules.

Administrator setup, not executed: choose App ownership/visibility, register and install the App on selected repositories, approve operation-specific permissions, configure HTTPS webhooks and protected secrets, record nonsecret App/installation/repository IDs, and assign invited members in Kishi. User-attributed operation would additionally require user consent and protected user-token storage. An authorized integration test must verify denied/unselected private access, token renewal, exact `gh` commands, workflow edits, protected merges, relationship notifications, and redelivery. No App setup, credential minting or collection, GitHub writes, provisioning, benchmarks, cost analysis, or model calls were performed.

</details>
