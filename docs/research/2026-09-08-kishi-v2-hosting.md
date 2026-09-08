---
description: "Hosting feasibility evidence for Kishi V2: Firebase, Cloud Run, Compute Engine, E2B, durable DSH state, Git worktrees, and execution isolation."
---

# Kishi V2 Hosting, Worktrees, and Execution Isolation

English | [中文](2026-09-08-kishi-v2-hosting.zh.md)

## Summary

Firebase can supply identity, application data, and web hosting without owning Kishi's repository execution. App Hosting supports custom applications and prebuilt images; framework support is not the decisive obstacle. DSH's filesystem, persistence, and process requirements make storage semantics, restart recovery, and credential isolation the controlling questions. This reference supplies evidence for a human hosting decision, not an approved architecture.

Scope: [Research DSH hosting, worktree storage, and execution isolation](https://github.com/Kishimotovn/kishi-harness/issues/2), one private invited team, and a plugin-first DSH fork. Firebase is a preference. Evidence was retrieved on 2026-09-08; local source inspection used `c389f96bf3a9b6807cb71ed6bdad5849be0df6d8`. Platform statements below are documentation evidence, not executed deployment results. Benchmarks, sizing, and cost modeling are excluded.

## Table of Contents

- [Firebase Product Roles](#firebase-products)
- [DSH Requirements](#dsh-requirements)
- [App Hosting Feasibility](#app-hosting)
- [Worktrees and Storage](#worktrees-storage)
- [Lifetime and Isolation](#lifetime-isolation)
- [Compute Options](#compute-options)
- [Dev Note](#dev-note)

-----

<a id="firebase-products"></a>
## Firebase Product Roles

These products solve different problems. [Authentication](https://firebase.google.com/docs/auth) identifies users and integrates with custom backends; it does not allocate execution machines. [Firestore](https://firebase.google.com/docs/firestore) stores documents and collections. [Cloud Storage for Firebase](https://firebase.google.com/docs/storage) stores objects in Google Cloud Storage buckets, not executable POSIX worktrees.

[App Hosting](https://firebase.google.com/docs/app-hosting) builds with Cloud Build, stores images in Artifact Registry, serves through Cloud Run, and fronts requests with a load balancer and Cloud CDN. Its deployment-repository connection does not establish authorization for Kishi's administrator-connected working repositories. App Hosting requires a Blaze-enabled project; no price comparison is made here.

-----

<a id="dsh-requirements"></a>
## DSH Requirements

The inspected providers require more than a JavaScript web server:

- [The manifest](../../package.json) requires Node `^22.19.0 || >=24.0.0`. [The CLI](../../apps/cli/src/bin.ts) dispatches profiles; [profile boot](../../apps/cli/src/profile-boot.ts) writes profile configuration and mounts plugin layers. A writable harness home is relevant even before repository tools run.
- [Local filesystem](../../packages/fs/fs-local/src/index.ts) uses realpath identities and atomic writes through symlinks. [Local subprocesses](../../packages/subprocess/subprocess-local/src/index.ts) resolve executable files from PATH and allocate native PTYs. Installed `git`, `gh`, Node/npm/npx, native addons, and repository-specific toolchains must match the execution environment; a successful web build does not prove their presence.
- [JSONL persistence](../../packages/session/session-persistence-jsonl/src/index.ts) writes versioned Session artifacts beneath an explicit root. Its [write lease](../../packages/session/session-persistence-jsonl/src/lease.ts) uses inode-checked, nonblocking POSIX `flock` through `fs-ext`; readers do not acquire that lock.
- [SQLite storage](../../packages/storage/storage-sqlite/src/index.ts) requires a database path and defaults to WAL. [File settings](../../packages/settings/settings-file/src/index.ts) use a harness-home YAML/JSON document, cross-process locking, atomic replacement, and optional watching. These host-owned records are distinct from files accessed through `ctx.fs`.

-----

<a id="app-hosting"></a>
## App Hosting Feasibility

App Hosting is not limited to Next.js and Angular. Firebase [documents](https://firebase.google.com/docs/app-hosting/frameworks-tooling) output-bundle adapters for other frameworks and says Express applications with build/start scripts generally work, without guaranteed support. A lockfile is required; npm, Yarn, and pnpm are supported, and non-production dependencies are pruned.

[Configuration](https://firebase.google.com/docs/app-hosting/configure) permits `scripts.buildCommand`, `scripts.runCommand`, and retained output-file selection. A build-command override bypasses framework adapters and their optimizations. The [build process](https://firebase.google.com/docs/app-hosting/build) distinguishes the build environment from the published runtime image: installing something during a build does not establish that its executable or libraries ship.

Firebase also [documents prebuilt container deployment through Terraform](https://firebase.google.com/docs/app-hosting/alt-deploy). This provides a documented packaging route for custom executables and system dependencies; it is not necessary to assume a stock buildpack contains `gh` or compilers. No image or Terraform operation was executed.

The underlying [Cloud Run container contract](https://docs.cloud.google.com/run/docs/container-contract) requires Linux x86_64-compatible executables and an ingress server listening on `0.0.0.0:$PORT`. Runtime installation into writable user directories is different from packaging dependencies: it remains instance-local. `sudo`, privilege escalation, privileged containers, and host-kernel operations are restricted, so arbitrary repository dependencies cannot be promised universally.

-----

<a id="worktrees-storage"></a>
## Worktrees and Storage

[Git worktrees](https://git-scm.com/docs/git-worktree) share common repository data and retain per-worktree metadata and path links. Copying only checked-out files does not preserve that relationship. Git's [lockfile protocol](https://git-scm.com/docs/api-lockfile) depends on exclusive creation and atomic rename; a worktree is not a security sandbox.

[Cloud Storage FUSE](https://docs.cloud.google.com/storage/docs/cloud-storage-fuse/overview) is explicitly not POSIX-compliant, and [Cloud Run bucket mounts](https://docs.cloud.google.com/run/docs/configuring/services/cloud-storage-volume-mounts) do not supply file-locking concurrency control. Google's [detailed semantics](https://github.com/GoogleCloudPlatform/gcsfuse/blob/master/docs/semantics.md) do support symlinks and atomic folder renames for hierarchical namespaces; rejecting FUSE because it lacks all symlinks or all atomic renames would be wrong. However, inode identities are mount-local, permission changes are unsupported, and streaming-write `fsync` does not finalize an object. These differences do not meet the inspected DSH lease and publication assumptions.

Cloud Run's default writable filesystem [uses instance memory and disappears at shutdown](https://docs.cloud.google.com/run/docs/container-contract). Its separate [preview ephemeral disk](https://docs.cloud.google.com/run/docs/configuring/services/ephemeral-disk) is ext4, but also disappears on crashes, scaling, or revision changes. [NFS volumes](https://docs.cloud.google.com/run/docs/configuring/services/nfs-volume-mounts) provide external file storage but are mounted without NFS locking. [SQLite WAL](https://www.sqlite.org/wal.html) requires same-host shared memory; selecting rollback journaling does not repair missing filesystem locks. Buckets are not drop-in live Session/database/worktree storage.

-----

<a id="lifetime-isolation"></a>
## Lifetime and Isolation

Browser connection lifetime and execution ownership are separate. Cloud Run [HTTP request timeouts](https://docs.cloud.google.com/run/docs/configuring/request-timeout) default to five minutes and permit up to sixty minutes; HTTP event streams are still requests. [WebSockets](https://docs.cloud.google.com/run/docs/triggering/websockets) require reconnection and cannot rely on reconnecting to the same instance. A timed-out request does not necessarily stop its handler. App Hosting advertises streaming, but its complete ingress path was not exercised here.

[Instance-based billing](https://docs.cloud.google.com/run/docs/configuring/billing-settings) allocates CPU outside requests. It does not make a service a durable job owner: idle instances, including minimum instances, can terminate, with a ten-second shutdown grace period. Local subprocesses or an open stream cannot substitute for recorded ownership and restart recovery.

DSH's [local provider](../../packages/subprocess/subprocess-local/README.md) manages process lifetime, with weaker cleanup when user-systemd is unavailable; its environment-secret scrub is a name heuristic. A child process still needs a separate security policy. Cloud Run exposes [service-identity tokens through instance metadata](https://docs.cloud.google.com/run/docs/container-contract), so removing environment secrets alone is insufficient. Its [preview sandbox launcher](https://docs.cloud.google.com/run/docs/configuring/services/sandboxes) offers explicit untrusted-code isolation, but is a separate feature, not automatic isolation of ordinary subprocesses.

-----

<a id="compute-options"></a>
## Compute Options

Three candidates cover the relevant tradeoffs without a hosting catalog:

- **Compute Engine worker:** Linux [OS packages](https://docs.cloud.google.com/compute/docs/instances/artifact-registry-os-packages) and [persistent block disks](https://docs.cloud.google.com/compute/docs/disks/persistent-disks) align with local providers. Retained disks can outlive instances; [stopping a VM](https://docs.cloud.google.com/compute/docs/instances/stop-start-instance) does not retain running-process memory. This still needs supervision, recovery, backups, and execution isolation.
- **Separate Cloud Run execution:** custom images support packaged tools. [Jobs](https://docs.cloud.google.com/run/docs/configuring/task-timeout) have task timeouts up to seven days without GPUs and retries per attempt. [Worker pools](https://docs.cloud.google.com/run/docs/container-contract) supply continuously allocated CPU with manual scaling, but instances can still terminate. Neither automatically preserves worktrees or restores DSH task ownership.
- **E2B execution:** the platform provides [isolated Linux VMs](https://docs.e2b.dev/sandbox), [custom templates](https://docs.e2b.dev/sandbox-template), and [pause/resume persistence](https://docs.e2b.dev/sandbox/persistence), with continuous-runtime limits. DSH already has [filesystem](../../packages/e2b/fs-e2b/src/index.ts) and [subprocess](../../packages/e2b/subprocess-e2b/src/index.ts) adapters sharing one sandbox. However, its [owner](../../packages/e2b/e2b/src/index.ts) creates a fresh sandbox, defaults to a five-minute lifetime, and kills it on timeout/disposal; template selection and reconnect/pause retention are not exposed. [Host Session state and logs remain outside it](../../packages/e2b/e2b/README.md). This is an existing execution provider, not complete hosting.

-----

<a id="dev-note"></a>
## Dev Note

<details>
<summary>Unapproved recommendations, open decisions, and execution record</summary>

This section is non-authoritative. Hosting selection belongs to [Choose the hosting and execution model](https://github.com/Kishimotovn/kishi-harness/issues/6), which requires a human decision.

**Recommendation, unapproved:** retain Firebase as an optional identity/data/web layer and use a separately isolated VM worker with retained POSIX storage as the least-adaptation baseline. Cloud Run remains a candidate if disposable worktrees and explicit durable checkpoints/recovery are acceptable. E2B remains a candidate if lifecycle/template integration and durable host storage are accepted work. Arbitrary dependency execution warrants a worker container/VM with restricted filesystem access, egress, and credentials, not the application's administrator identity.

**Open decisions:** retained versus reconstructed worktrees; durable state owner and backup policy; interruption/retry semantics; isolation strength; allowed repository dependency classes; App Hosting ingress/reconnect behavior and exposure of lower-level Cloud Run settings. No candidate has passed a deployed DSH native-addon, PTY, locking, or restart smoke test.

**Administrator facts for later:** project/region, chosen runtime/image/profile, App Hosting application root and deployment branch, working-repository authorization, separate execution identity, persistent paths, and secret references. Firebase [requires project-owner participation for initial App Hosting setup](https://firebase.google.com/docs/app-hosting/configure); Cloud Run [documents deployer and service-identity roles](https://docs.cloud.google.com/run/docs/configuring/billing-settings). No credential values were collected.

**Executed:** local source/instruction reads, read-only Git inspection, and official-document retrieval. **Unexecuted:** every deployment, installation, template build, mount, runtime smoke test, restart, and model call discussed or linked here. No resources, accounts, secrets, or product code were changed. Benchmarks, sizing, and cost modeling remain expressly deferred; the user's budget cap was not recalculated.

</details>
