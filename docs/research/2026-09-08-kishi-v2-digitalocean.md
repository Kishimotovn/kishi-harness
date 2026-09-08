---
description: "DigitalOcean and Docker evidence for native Kishi hosting, persistent DSH state, repository execution, and administrator responsibilities."
---

# DigitalOcean Hosting and Repository Execution

## Summary

Droplets supply Linux VMs with persistent filesystems and support native applications as well as Docker workloads; administrators still operate the guest OS and application. App Platform manages infrastructure but uses its own deployment model and external persistence. Neither product establishes Kishi's requested crash-recovery behavior.

Scope and evidence date: 2026-09-08, for [Research DigitalOcean Compose hosting and operations](https://github.com/Kishimotovn/kishi-harness/issues/13). This reference concerns one private invited team, native Kishi hosting, connected-repository execution, and uninterrupted work when browsers close. The human-approved initial direction is a DigitalOcean Droplet running Kishi directly, with Docker available for connected repositories. Isolation and storage topology remain open. Here, provider means cloud deployment target, not DSH LLM provider. Firebase Auth remains neither selected nor discarded. Platform findings are documentation evidence, not deployed results.

## Table of Contents

- [Compute and Operations](#compute-and-operations)
- [Persistent State and Backups](#persistent-state-and-backups)
- [Restarts and Recovery](#restarts-and-recovery)
- [Repository Execution](#repository-execution)
- [Dev Note](#dev-note)

-----

## Compute and Operations

[Droplets](https://docs.digitalocean.com/products/droplets/) are Linux VMs. Their [policy](https://docs.digitalocean.com/products/droplets/details/policies/) calls them completely unmanaged: DigitalOcean supplies virtualized infrastructure, while the administrator owns guest-OS patching, Docker/application updates, supervision, security configuration, monitoring, and recovery. The [control panel](https://docs.digitalocean.com/products/droplets/getting-started/recommended-droplet-setup/) simplifies resource management; it does not take over those duties.

Docker documents [Engine and Compose installation on Ubuntu](https://docs.docker.com/engine/install/ubuntu/) and [Compose deployment on production servers](https://docs.docker.com/compose/production/). DigitalOcean's [Docker Marketplace image](https://docs.digitalocean.com/products/marketplace/catalog/docker/) preinstalls Engine and Compose. Production ports, secrets, persistent paths, and compatible toolchains still require administrator configuration; preinstallation is not ongoing management.

[App Platform](https://docs.digitalocean.com/products/app-platform/how-to/create-apps/) deploys source through buildpacks or Dockerfiles, or accepts container images. Its [app specification](https://docs.digitalocean.com/products/app-platform/reference/app-spec/) defines individual services, workers, and other components; it does not document consuming a multi-service Compose file unchanged. Its [limits](https://docs.digitalocean.com/products/app-platform/details/limits/) exclude Volumes and discard local files when containers are replaced. [Platform maintenance](https://docs.digitalocean.com/products/app-platform/details/maintenance/) can redeploy applications. Configurable [Inactivity Sleep](https://docs.digitalocean.com/products/app-platform/how-to/scale-to-zero/) is a private-preview web-service feature, incompatible with the requested no-sleep behavior if enabled.

-----

## Persistent State and Backups

CPU Droplet [boot disks](https://docs.digitalocean.com/products/droplets/details/features/) are persistent; ordinary stop/reboot does not delete them. [Volumes](https://docs.digitalocean.com/products/volumes/details/limits/) are separate block devices attached to one Droplet at a time. [Creation documentation](https://docs.digitalocean.com/products/volumes/how-to/create/) places them in the same region/datacenter as the Droplet and offers ext4 or XFS formatting. They are not a shared multi-host filesystem or automatic cross-region recovery.

[Spaces](https://docs.digitalocean.com/products/spaces/) stores S3-compatible objects. [Managed Databases](https://docs.digitalocean.com/products/databases/) offers managed engines including PostgreSQL, MySQL, and MongoDB, not hosted SQLite files. Neither is a drop-in replacement for DSH's file-backed state: its [JSONL write lease](../../packages/session/session-persistence-jsonl/src/lease.ts) uses inode-checked POSIX `flock`, and its [SQLite backend](../../packages/storage/storage-sqlite/README.md) opens a filesystem path with WAL by default.

[Git worktrees](https://git-scm.com/docs/git-worktree) depend on shared repository metadata and per-worktree administration as well as checked-out files. Retaining only working files does not preserve those relationships.

[Droplet backups](https://docs.digitalocean.com/products/backups/details/features/) are automated, crash-consistent disk images of running VMs and exclude attached Volumes. [Volume snapshots](https://docs.digitalocean.com/products/snapshots/how-to/snapshot-volumes/) separately capture disk contents but can include partial files and exclude cached writes. [Droplet snapshot guidance](https://docs.digitalocean.com/products/snapshots/how-to/snapshot-droplets/) recommends stopping writers or powering down for consistency. Neither snapshot type establishes coordinated recovery across Session logs, databases, and worktrees. [Unflushed memory/cache is absent from backups](https://docs.digitalocean.com/products/backups/details/limits/); unbacked writes can also be lost.

-----

## Restarts and Recovery

The documented [standalone Droplet model](https://docs.digitalocean.com/products/droplets/details/features/) has no inactivity-based scale-to-zero policy: browser closure is not a [shutdown action](https://docs.digitalocean.com/reference/doctl/reference/compute/droplet-action/shutdown/). This describes normal VM behavior, not guaranteed availability. Outages and operator stops/reboots interrupt processes and lose running memory. [Hard power-off](https://docs.digitalocean.com/reference/doctl/reference/compute/droplet-action/power-off/) risks data problems. [Destruction](https://docs.digitalocean.com/products/droplets/how-to/destroy/) permanently removes the Droplet; associated Volumes and snapshots are not deleted by default but can be selected for deletion.

[Docker restart policies](https://docs.docker.com/engine/containers/start-containers-automatically/) restart containers, not recover jobs or provide high availability. `on-failure` does not restart containers after daemon restart; `unless-stopped` respects deliberate stops. Neither policy reconstructs application checkpoints.

Kishi's requested behavior remains an application requirement: preserve recorded progress and recoverable worktrees, mark interrupted work, and require explicit human resume. The UI must distinguish the last actual application/worker restart from a browser reconnect. These integrations are not verified here.

-----

## Repository Execution

Native Kishi hosting and connected-repository Docker execution are separate choices. Docker's [Compose trust model](https://docs.docker.com/compose/trust-model/) applies requested privileges and host mounts as written. Access to the [root Docker daemon/socket](https://docs.docker.com/engine/security/) or [docker group](https://docs.docker.com/engine/install/linux-postinstall/) grants host-level control. Separate Compose project names or worktrees are not security sandboxes; arbitrary repository code must not receive the Kishi application's host root socket.

[Containers share their host kernel](https://docs.docker.com/build/building/multi-platform/). Linux containers cannot supply native macOS tooling or the macOS host required by [Xcode for iOS builds and simulators](https://developer.apple.com/support/xcode/).

-----

## Dev Note

<details>
<summary>Agreed direction, open choices, and verification limits</summary>

This section separates the agreed initial direction from unapproved implementation options. [Choose the hosting and execution model](https://github.com/Kishimotovn/kishi-harness/issues/6) owns the human decision and remains open until the remaining choices are resolved.

**Agreed initial direction:** run Kishi/DSH directly on a DigitalOcean Droplet, supervised by `systemd`, with Docker available for connected repositories that need it. Kishi's own deployment does not require a container or Compose stack. App Platform would require component remapping and external persistence. No VM count or storage topology is selected.

**Candidate separation, unapproved:** the trusted Kishi application retains administrator secrets and signing keys; a separate execution environment receives scoped repository access and worktrees. Repository Docker execution belongs to that environment's daemon, never a shared application-host socket. A separate execution VM is a candidate, not an approved requirement or kernel-security guarantee. Secret isolation is necessary policy; DSH integration is unproved.

**Unresolved:** execution isolation and access rules; permitted Docker privileges, mounts, and egress; signing authorization; state placement, retention, backup consistency and restore ownership; native Apple execution; authentication.

**Required smoke tests, not executed:** the supported `dsh` profile as a supervised native service, its installed addons/tools, and repository Docker access; [PTY and subprocess cleanup](../../packages/subprocess/subprocess-local/README.md), including unavailable user-systemd; competing-writer rejection and crash-released leases; SQLite WAL recovery; atomic rename/symlink behavior; retained Git metadata/worktrees; coordinated backup restoration; browser-disconnected continuation; crash interruption, human resume, and actual restart versus reconnect display. A separate execution environment also needs credential-access tests.

Evidence comprises primary-document retrieval and local inspection. No infrastructure, credentials, production configuration, Docker execution, model calls, dependency changes, workload sizing, benchmarks, or budget modeling were performed.

</details>
