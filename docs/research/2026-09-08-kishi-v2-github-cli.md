# Kishi v2 agent-managed GitHub CLI access

## Summary

Legacy Kishi uses `gh`; this DSH fork has no identified first-party gh-backed issue manager or GitHub App token setup. A GitHub App supplies identity and permissions; `gh` or an SDK calls the API. Agent-managed `gh` is feasible only with trusted, repository- and operation-scoped credential use, not `GH_TOKEN` in an ordinary repository shell.

Findings for [Research agent-managed GitHub CLI access](https://github.com/Kishimotovn/kishi-harness/issues/16), feeding [Decide GitHub synchronization and work-item ownership](https://github.com/Kishimotovn/kishi-harness/issues/8). API support below is documented, not an executed App-token integration guarantee.

## Contents

- [Existing implementations](#existing-implementations)
- [App authentication](#app-authentication)
- [Operation compatibility](#operation-compatibility)
- [Repository integration requirements](#repository-integration-requirements)
- [Executed checks](#executed-checks)
- [Unexecuted limitations](#unexecuted-limitations)
- [Dev Note](#dev-note)

## Existing implementations

DSH inspection is pinned to published `4aaf23b47b442be9069538d2718185ee85d03a8f`. The authorized research worktree started clean. Read-only sibling Kishi inspection is pinned to `01449124312de54e6afdea08a5116a83b78e2f1a`; its worktree was clean on `main`.

Rust's [label writer](https://github.com/Kishimotovn/kishi-sb/blob/01449124312de54e6afdea08a5116a83b78e2f1a/src/gh.rs#L24) uses `Command::new("gh")`. The [shell coordinator](https://github.com/Kishimotovn/kishi-sb/blob/01449124312de54e6afdea08a5116a83b78e2f1a/bin/tick.sh#L29) defaults `KISHI_GH` to `gh`; it creates issues, posts comments, changes labels, closes issues, and calls `gh api` for sub-issues/dependencies. [Model prompts forbid issue writes](https://github.com/Kishimotovn/kishi-sb/blob/01449124312de54e6afdea08a5116a83b78e2f1a/bin/tick.sh#L866); the [loop posts their output](https://github.com/Kishimotovn/kishi-sb/blob/01449124312de54e6afdea08a5116a83b78e2f1a/bin/tick.sh#L414). Separately, the [checkout helper](https://github.com/Kishimotovn/kishi-sb/blob/01449124312de54e6afdea08a5116a83b78e2f1a/src/checkout.rs#L92) invokes `git`. Git operations are not universally routed through `gh`.

[Authentication comments](https://github.com/Kishimotovn/kishi-sb/blob/01449124312de54e6afdea08a5116a83b78e2f1a/bin/kishi-lib.sh#L232) identify the operator's configured gh login. [Doctor](https://github.com/Kishimotovn/kishi-sb/blob/01449124312de54e6afdea08a5116a83b78e2f1a/bin/doctor.sh#L233) checks authentication; [bootstrap](https://github.com/Kishimotovn/kishi-sb/blob/01449124312de54e6afdea08a5116a83b78e2f1a/bin/bootstrap.sh#L13) leaves login to a human. Inspected executable/configuration sources contain no App provisioning, token minting, or renewal path. External authentication could change without changing those callers.

DSH's [GitHub webhook handler](../../packages/webhook/webhook-github/src/handler.ts#L84) verifies inbound signatures with `@octokit/webhooks`, then dispatches a delivery. Its [configuration](../../packages/webhook/webhook-github/src/index.ts#L17) contains a webhook-secret reference, not an App private key or installation-token setup. The [base Bash tool](../../packages/bundle/base/cordis.patch.yml#L246), [local executor](../../packages/shell/bash-local/src/index.ts#L218), and [optional persistent-terminal composition](../../packages/preset/agent-presets/presets/minimal/agent.cordis.yml#L30) provide generic execution, not GitHub-specific authorization.

## App authentication

The [CLI environment manual](https://cli.github.com/manual/gh_help_environment) specifies `GH_TOKEN`, then `GITHUB_TOKEN`, ahead of stored credentials for GitHub.com. These variables carry an already-issued token. They neither register an App nor mint or renew installation tokens.

[Manual login](https://cli.github.com/manual/gh_auth_login) documents browser authentication and PAT input, with credential-store persistence and possible plaintext fallback. In inspected CLI release `2.92.0`, [login](https://github.com/cli/cli/blob/6c470f60803784e1558b626022677c53dccb6016/pkg/cmd/auth/login/login.go#L205) resolves a login through [GraphQL `viewer.login`](https://github.com/cli/cli/blob/6c470f60803784e1558b626022677c53dccb6016/pkg/cmd/auth/shared/login_flow.go#L252); [scope validation](https://github.com/cli/cli/blob/6c470f60803784e1558b626022677c53dccb6016/pkg/cmd/auth/shared/oauth_scopes.go#L77) accepts an absent OAuth-scope header. These source reads do not establish installation-token compatibility for the complete login command. Persistent login does not supply installation-token lifecycle management.

GitHub [documents installation authentication](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/authenticating-as-a-github-app-installation) for permitted REST and GraphQL operations. [Minting](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app) requires an App-signed JWT and `POST /app/installations/{installation_id}/access_tokens`. Tokens expire after one hour. Explicit `repository_ids` and `permissions` narrow access; omission inherits the installation's grants. Trusted Kishi code must own minting, renewal, and failure handling, or use an SDK that manages that lifecycle. Member OAuth/PAT fallback is prohibited.

## Operation compatibility

GitHub's [App permission table](https://docs.github.com/en/rest/authentication/permissions-required-for-github-apps) explicitly lists installation access tokens for these operations. Permission levels are endpoint-specific, not a claim that every corresponding high-level CLI invocation succeeds.

| Skill operation | Documented permission requirement |
| --- | --- |
| Read issues; create, edit, close, label, assign | Issues read/write as appropriate; [issue endpoints](https://docs.github.com/en/rest/issues/issues) |
| Post issue or PR conversation summaries | Issues write or Pull requests write according to the [comment endpoint](https://docs.github.com/en/rest/issues/comments#create-an-issue-comment) |
| Attach children and blockers | Issues write; [sub-issues](https://docs.github.com/en/rest/issues/sub-issues#add-sub-issue) and [dependencies](https://docs.github.com/en/rest/issues/issue-dependencies#add-a-dependency-an-issue-is-blocked-by) use issue IDs, not issue numbers |
| Create/edit/review PRs | Pull requests write; reads need corresponding read permission |
| Git fetch/clone, push, REST PR merge | Contents read for reads, write for pushes/merge; repository rules remain a separate check |

Explicit REST endpoints through [gh api](https://cli.github.com/manual/gh_api) avoid unnecessary user-oriented discovery. High-level [issue creation](https://github.com/cli/cli/blob/6c470f60803784e1558b626022677c53dccb6016/pkg/cmd/issue/create/create.go#L180) resolves special assignees and metadata; [PR creation](https://github.com/cli/cli/blob/6c470f60803784e1558b626022677c53dccb6016/pkg/cmd/pr/create/create.go#L971) includes viewer-dependent fork discovery. Test exact versions, flags, GraphQL queries, and project/assignee lookups. `@me` must not stand for a Kishi member under App authentication. Installed PR help states that `--head` skips automatic pushing/forking and `--dry-run` may still push Git changes; dry-run is not a harmless compatibility probe.

## Repository integration requirements

Putting a known `gh` binary on `PATH` and exporting its token into a repository shell exposes the raw token to arbitrary commands and descendants. Read-only restrictions do not prevent environment inspection or API writes. DSH's [ambient scrub](../../packages/subprocess/subprocess/src/index.ts#L45) removes token-shaped names but preserves `HOME`/`PATH`; [explicit child environments](../../packages/subprocess/subprocess-local/src/spawn.ts#L46) merge afterward and can restore `GH_TOKEN`. Its [Linux profiles](../../packages/sandbox/sandbox-local/src/profiles.ts#L16) permit OS-accessible filesystem reads beneath `/`. Separate worktrees/configuration files and same-owner secret files do not establish cross-repository read isolation.

The smallest credible later integration must satisfy these requirements:

1. Bind each invocation to the connected repository, installation, authorized work item, and allowed operation. Use explicit `[HOST/]OWNER/REPO` targeting where supported and explicit repository paths for `gh api`; cwd and `GH_REPO` are selection mechanisms, not authorization. Validate related issue IDs too.
2. Use a trusted executable at a known absolute path/version and a fresh, controlled `GH_CONFIG_DIR` plus controlled home/environment. Exclude inherited aliases, extensions, editors, browsers, pagers, Git hooks, credential helpers, and debug/trace settings. Do not fall back to an ambient member login.
3. Keep App keys and short-lived token use inside trusted Kishi-controlled execution, outside arbitrary repository workloads. Prohibit raw secrets in model context, logs, browsers, command text, credential URLs, and remotes. Deployment verification must also address filesystem/process access; a PATH wrapper or token scope alone cannot prove secrecy.
4. Authorize the complete invocation, not merely the word `gh`: `gh api` accepts arbitrary API methods; [aliases execute shell expressions](https://cli.github.com/manual/gh_alias_set); [clone forwards Git flags](https://cli.github.com/manual/gh_repo_clone); [setup-git installs a credential helper](https://cli.github.com/manual/gh_auth_setup-git). Reject unapproved operations and file inputs.
5. Verify allowed results, renewal, revocation, missing credentials, and expected-denied access to another private repository. Public reads are not an isolation test. Reconcile ambiguous write outcomes before retries; never widen access silently.

## Executed checks

All terminal commands explicitly targeted the authorized worktree; none ran the sibling loop. `git status --short --branch`, `git rev-parse`, and `git merge-base` established the pins above; targeted `git grep` traced the cited owners.

`command -v gh` returned `/opt/homebrew/bin/gh`; `gh --version` returned `2.92.0 (2026-04-28)`. Executed help checks: `gh help environment`, `gh auth login --help`, `gh api --help`, `gh issue create --help`, and `gh pr create --help`.

Read-only `gh api` queries inspected the research issue and `cli/cli` release/source endpoints using existing authentication, not a GitHub App installation token. Official documentation was fetched on 2026-09-08. The English-only documentation policy was verified.

The report-specific Node assertion passed for exactly one final LF, LF-only text, and 15 local links/anchors, including source-line bounds. The repository's Markdown AST checker also passed for relative links, paragraph wrapping, trailing whitespace, and the final newline. External documentation retrieval and URL syntax checks do not verify authenticated API behavior.

`pnpm install --offline --frozen-lockfile --ignore-scripts` installed locked dependencies in the isolated worktree with no downloads or shared dependency directory. `pnpm run lint` passed, including its Host build. Native installation scripts and product applications were not run. Installation/build output included platform, missing pre-build CLI-bin, bundling, and package-manager notices; none failed these checks.

## Unexecuted limitations

No App token was minted or integration-tested. Issue/PR mutations, expiry/refresh, revocation, negative repository authorization, and Linux process/read isolation remain untested. No credentials were displayed, credential files inspected, connected workloads executed, cloud resources provisioned, real model API called, or sandbox disabled. Prior [Research DSH repository environments and model credentials](https://github.com/Kishimotovn/kishi-harness/issues/15) informed context; its test results are not this report's checks. Documentation and static checks do not establish deployed credential isolation.

## Dev Note

Non-authoritative research for later specification. Preserve [Decide repository access and credential ownership](https://github.com/Kishimotovn/kishi-harness/issues/7#issuecomment-5584595020): native `dsh`/systemd on the selected DigitalOcean Linux Droplet, existing sandbox enabled, no new isolation architecture selected here. Agents follow Wayfinder/grilling skills, manage issue content, summarize before closing, and return specs/tickets to the coordinating issue. Keep one coordinating run per work item, no automatic issue import, and all approvals in Kishi without GitHub magic phrases. Restricted invocation enforces policy; it does not replace agents with an issue-content synchronization engine.
