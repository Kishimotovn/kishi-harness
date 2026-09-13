# Agent Note: Fork pull-request CI without upstream infrastructure

Status: implemented

## Problem

Fork pull requests cannot validate code when their default runner labels name unavailable upstream pools. Upstream Project automation and Cloudflare previews also require credentials and service ownership that a fork does not inherit. Treating those integrations as code checks blocks development before the fork has a deployment.

## Decision

The primary Linux and native Windows jobs in [PR CI](../../../../.github/workflows/ci.yml) default to `ubuntu-24.04` and `windows-2025` outside `deepseek-ai/deepseek-harness`. Upstream retains its named larger runners. The existing [failover switches](2026-07-26-ci-failover-runbook.md) remain explicit operator selections, including their matching browser-install and cache behavior; a fork with no private runner pools leaves them unset.

Fork jobs use lower parallelism through the existing environment settings. Instrumented coverage uses two partitions without overlapping the exempt-heavy gate. Session replay concurrency is two and browser replay uses the existing serial mode. Test inventories, coverage thresholds, timeouts, native Windows execution, fail-fast behavior, and the blocking aggregate remain intact.

[Issue policy](../../../../.github/workflows/issue-policy.yml) and [Issue lifecycle](../../../../.github/workflows/issue-lifecycle.yml) run only in the upstream repository. Their App installation and Project configuration belong to upstream. This condition does not change branch protection or the independent weighted-review check. The [review-event policy](2026-08-10-event-directed-pr-review-status.md) remains authoritative for upstream Project transitions.

The [preview workflow](../../../../.github/workflows/build-preview-cloudflare.yml) builds the workspace and preview image in forks. Cloudflare upload, protected-URL verification, and URL comments run only upstream. The [preview runner sizing decision](2026-09-06-preview-hosted-runner-sizing.md) remains independent and active. A successful fork preview job proves a build, not a deployment.

## Alternatives considered

**Provision upstream-style runners and service credentials.** The fork needs code validation before deployment. Private runner pools, a Project App, and Cloudflare ownership are separate infrastructure decisions, not prerequisites for these code checks.

**Disable the affected workflows.** Disabling CI loses coverage and platform evidence. Disabling the preview workflow also removes its build signal; only its external side effects require upstream ownership.

**Use standard runners with enterprise parallelism.** The workflow permits many concurrent compiler, replay, and browser processes. Lower fork concurrency bounds that load without changing the work or weakening assertions, at the cost of longer execution.

## Consequences

Fork pull requests need no upstream App or Cloudflare credentials for these workflows. Upstream-only jobs are explicitly skipped, not treated as evidence that the integration works. Enabling a fork deployment or Project policy requires its own reviewed configuration. Master-push standbys and release publication are outside this PR-validation decision.

## Verification

[Workflow tests](../../../../scripts/ci-workflow.spec.ts) pin hosted fallbacks, explicit failover, fork parallelism, retained code checks, and Project job scoping. [Gate-construction tests](../../../../scripts/run-gates.spec.ts) verify the fork serial and upstream parallel browser modes. [Preview tests](../../../../scripts/preview-workflow.spec.ts) keep the build enabled and require all three deployment side effects to be upstream-only. The runner and concurrency assertions reject their pre-fix values. Hosted allocation and the complete Linux/Windows runs remain GitHub Actions evidence; local workflow assertions do not establish those outcomes.
