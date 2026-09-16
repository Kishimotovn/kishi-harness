# Agent Note: Linux and macOS CI for the Kishi fork

Status: implemented

## Problem

Kishi targets Linux and macOS, while upstream DSH also validates Windows and maintains private runner fleets. Running those extra jobs in the fork spends resources on an unsupported platform; deleting their definitions makes upstream synchronization harder.

## Decision

[PR CI](../../../../.github/workflows/ci.yml) schedules native Windows jobs only for `deepseek-ai/deepseek-harness`. Their job identifiers, build/test steps, failover selectors, and time budgets remain upstream-owned. Fork pull requests validate the packaged runtime on Linux x64, macOS ARM64, and macOS x64 through the existing reusable builder; upstream retains Linux/Windows x64 PR validation. Required Linux coverage, static checks, benchmarks, and artifact checks remain enabled.

[Master CI](../../../../.github/workflows/ci-master.yml) retains hosted Linux ARM64 and both macOS runtime checks. Wine, private Linux/Windows standby drills, and the upstream fleet benchmarks run only upstream. Manual release and standalone builder definitions retain their upstream target inventories; this policy changes automatic fork validation, not the release format or Windows source.

The required aggregate accepts `skipped` only for the two upstream-only Windows dependencies in a fork. Failure or cancellation still fails, as does a skipped required Linux or runtime-matrix job. Upstream accepts no skipped dependency. The verdict parses GitHub's dependency-result JSON instead of interpolating it into executable code.

Repository conditions and caller target selections are the fork-specific changes. Keep upstream job bodies instead of maintaining copies or deleting Windows packages. After an upstream merge, the workflow regressions must still distinguish upstream and fork scheduling and reject missing required results.

This is the platform exception to the [fork runner policy](2026-09-13-fork-pull-request-ci.md) and [upstream master-only platform schedule](2026-09-06-master-only-platform-ci.md). Their infrastructure ownership, artifact provenance, and failover decisions remain useful and active.

## Alternatives considered

**Repair every Windows failure in the fork.** Windows is outside Kishi's supported platforms. Cross-platform test fixes remain worthwhile, but a Windows-only investigation is not a fork delivery requirement.

**Delete Windows jobs and code.** This removes useful upstream structure and increases synchronization conflicts. Job-level repository conditions preserve that structure without scheduling Windows in normal fork CI.

**Accept any skipped job in the aggregate.** This can hide accidentally disabled Linux/macOS validation. Only the named, deliberately skipped Windows dependencies are exempt.

## Consequences

Fork CI provides no Windows execution evidence. macOS packaged-runtime failures block fork pull requests instead of waiting for a master push. Linux/macOS defects still require fixes; changing platform scope does not justify weaker assertions, coverage thresholds, or success claims.

[Workflow guards](../../../../scripts/ci-workflow.spec.ts) exercise both repository identities and run the actual aggregate verdict against successful, failed, cancelled, and skipped results. [Platform scheduling tests](../../../../scripts/tests/ci-master-platforms.spec.ts) preserve the upstream matrix, fork target selection, Wine scoping, and the full manual release inventory. These local checks validate routing, not hosted runner outcomes.
