---
description: "Kishi V2 的托管可行性证据：Firebase、Cloud Run、Compute Engine、E2B、DSH 状态持久化、Git worktree 与执行隔离。"
---

# Kishi V2 托管、worktree 与执行隔离

[English](2026-09-08-kishi-v2-hosting.md) | 中文

## 概述

Firebase 可以提供身份验证、应用数据和 Web 托管，而不承担 Kishi 的仓库执行工作。App Hosting 支持自定义应用和预构建镜像，因此框架支持并不是决定性障碍。DSH 对文件系统、持久化和进程的要求，使存储语义、重启恢复与凭据隔离成为关键问题。本参考报告为人工托管决策提供证据，不代表已批准的架构。

范围：[Research DSH hosting, worktree storage, and execution isolation](https://github.com/Kishimotovn/kishi-harness/issues/2)、一个受邀加入的私有团队，以及插件优先的 DSH fork。Firebase 仅为偏好。证据检索日期为 2026-09-08；本地源码检查基于 `c389f96bf3a9b6807cb71ed6bdad5849be0df6d8`。下文的平台陈述属于文档证据，不是实际部署结果。基准测试、容量规划与成本建模均不在范围内。

## 目录

- [Firebase 产品职责](#firebase-products)
- [DSH 要求](#dsh-requirements)
- [App Hosting 可行性](#app-hosting)
- [worktree 与存储](#worktrees-storage)
- [生命周期与隔离](#lifetime-isolation)
- [计算服务选项](#compute-options)
- [开发备注](#dev-note)

-----

<a id="firebase-products"></a>
## Firebase 产品职责

这些产品解决的问题不同。[Authentication](https://firebase.google.com/docs/auth) 识别用户并与自定义后端集成，但不分配执行机器。[Firestore](https://firebase.google.com/docs/firestore) 存储文档和集合。[Cloud Storage for Firebase](https://firebase.google.com/docs/storage) 将对象存储在 Google Cloud Storage 存储桶中，而不是提供可执行的 POSIX worktree。

[App Hosting](https://firebase.google.com/docs/app-hosting) 使用 Cloud Build 构建，在 Artifact Registry 存储镜像，通过 Cloud Run 提供服务，并由负载均衡器和 Cloud CDN 接收请求。其部署仓库连接不等于 Kishi 管理员所连接工作仓库的访问授权。App Hosting 要求项目启用 Blaze 方案；此处不比较价格。

-----

<a id="dsh-requirements"></a>
## DSH 要求

已检查的提供方需要的不只是 JavaScript Web 服务器：

- [包 manifest（元数据清单）](../../package.json) 要求 Node `^22.19.0 || >=24.0.0`。[CLI（命令行界面）](../../apps/cli/src/bin.ts) 分派配置档；[配置档启动代码](../../apps/cli/src/profile-boot.ts) 写入配置档配置并挂载插件层。因此，在仓库工具运行之前，就需要考虑可写的 harness 主目录。
- [本地文件系统](../../packages/fs/fs-local/src/index.ts) 使用 realpath 标识，并通过符号链接执行原子写入。[本地子进程](../../packages/subprocess/subprocess-local/src/index.ts) 从 PATH 解析可执行文件并分配原生 PTY。已安装的 `git`、`gh`、Node/npm/npx、原生扩展和仓库专用工具链必须匹配执行环境；Web 构建成功不能证明这些依赖存在。
- [JSONL 持久化](../../packages/session/session-persistence-jsonl/src/index.ts) 在显式指定的根目录下写入带版本的会话产物。其[写入租约](../../packages/session/session-persistence-jsonl/src/lease.ts) 通过 `fs-ext` 使用检查 inode 的非阻塞 POSIX `flock`；读取方不获取该锁。
- [SQLite 存储](../../packages/storage/storage-sqlite/src/index.ts) 要求数据库路径，默认使用 WAL。[文件设置](../../packages/settings/settings-file/src/index.ts) 使用 harness 主目录中的 YAML/JSON 文档、跨进程锁、原子替换和可选的文件监视。这些由宿主拥有的记录不同于通过 `ctx.fs` 访问的文件。

-----

<a id="app-hosting"></a>
## App Hosting 可行性

App Hosting 不限于 Next.js 和 Angular。Firebase [文档](https://firebase.google.com/docs/app-hosting/frameworks-tooling) 说明其他框架可使用输出包适配器，并表示配置了构建与启动脚本的 Express 应用通常可以工作，但不保证支持。应用必须提供依赖锁定文件；支持 npm、Yarn 和 pnpm，非生产依赖会被裁剪。

[配置文档](https://firebase.google.com/docs/app-hosting/configure) 允许指定 `scripts.buildCommand`、`scripts.runCommand` 和保留的输出文件。覆盖构建命令会绕过框架适配器及其优化。[构建流程](https://firebase.google.com/docs/app-hosting/build) 区分构建环境与发布的运行时镜像：在构建期间安装某项依赖，不能证明其可执行文件或库会随镜像发布。

Firebase 还[明确记录了通过 Terraform 部署预构建容器镜像的方式](https://firebase.google.com/docs/app-hosting/alt-deploy)。这为自定义可执行文件和系统依赖提供了有文档依据的打包方式，无需假设默认 buildpack 包含 `gh` 或编译器。未执行任何镜像或 Terraform 操作。

底层 [Cloud Run 容器运行约定](https://docs.cloud.google.com/run/docs/container-contract) 要求可执行文件兼容 Linux x86_64，入口服务器监听 `0.0.0.0:$PORT`。在运行时向可写用户目录安装依赖不同于打包依赖：安装结果仍仅属于当前实例。`sudo`、权限提升、特权容器和宿主内核操作均受限制，因此不能普遍保证任意仓库依赖都能运行。

-----

<a id="worktrees-storage"></a>
## worktree 与存储

[Git worktree](https://git-scm.com/docs/git-worktree) 共享仓库公共数据，同时保留各自的元数据和路径链接。仅复制检出的文件不能保留这种关系。Git 的[锁文件协议](https://git-scm.com/docs/api-lockfile) 依赖独占创建与原子重命名；worktree 不是安全沙箱。

[Cloud Storage FUSE](https://docs.cloud.google.com/storage/docs/cloud-storage-fuse/overview) 明确不符合 POSIX 标准，[Cloud Run 存储桶挂载](https://docs.cloud.google.com/run/docs/configuring/services/cloud-storage-volume-mounts) 也不提供文件锁并发控制。Google 的[详细语义文档](https://github.com/GoogleCloudPlatform/gcsfuse/blob/master/docs/semantics.md) 确实支持符号链接，并支持分层命名空间中的原子文件夹重命名；以完全不支持符号链接或任何原子重命名为由排除 FUSE 是错误的。不过，inode 标识仅在单次挂载内有效，不支持权限修改，流式写入的 `fsync` 也不会完成对象发布。这些差异不能满足已检查的 DSH 租约和文件发布假设。

Cloud Run 的默认可写文件系统[占用实例内存，并在关闭时消失](https://docs.cloud.google.com/run/docs/container-contract)。其独立的[预览版临时磁盘](https://docs.cloud.google.com/run/docs/configuring/services/ephemeral-disk) 使用 ext4，但也会在崩溃、伸缩或修订版本切换时消失。[NFS 卷](https://docs.cloud.google.com/run/docs/configuring/services/nfs-volume-mounts) 提供外部文件存储，但挂载时禁用 NFS 锁。[SQLite WAL](https://www.sqlite.org/wal.html) 要求同一宿主上的共享内存；改用回滚日志也无法补齐缺失的文件系统锁。存储桶不能直接替代活跃会话、数据库或 worktree 的存储。

-----

<a id="lifetime-isolation"></a>
## 生命周期与隔离

浏览器连接生命周期与执行所有权是不同的问题。Cloud Run 的 [HTTP 请求超时](https://docs.cloud.google.com/run/docs/configuring/request-timeout) 默认为五分钟，最多可配置为六十分钟；HTTP 事件流仍然属于请求。[WebSocket](https://docs.cloud.google.com/run/docs/triggering/websockets) 需要支持重连，且不能依赖重连到同一实例。请求超时不一定会停止其处理程序。App Hosting 宣称支持流式传输，但本次未实际验证其完整入口路径。

[按实例计费](https://docs.cloud.google.com/run/docs/configuring/billing-settings) 会在请求之外分配 CPU，但不会让服务成为持久的任务所有者：空闲实例可能终止，包括为最小实例数保留的实例，关闭宽限期为十秒。本地子进程或保持打开的流不能替代已记录的所有权与重启恢复机制。

DSH 的[本地提供方](../../packages/subprocess/subprocess-local/README.zh.md) 管理进程生命周期；user-systemd 不可用时，清理保证较弱；其环境变量秘密清除机制依赖名称启发式规则。子进程仍需独立的安全策略。Cloud Run 通过[实例元数据提供服务身份 token](https://docs.cloud.google.com/run/docs/container-contract)，因此仅删除环境变量中的秘密并不足够。其[预览版沙箱启动器](https://docs.cloud.google.com/run/docs/configuring/services/sandboxes) 提供显式的不可信代码隔离，但这是独立功能，不会自动隔离普通子进程。

-----

<a id="compute-options"></a>
## 计算服务选项

以下三个候选方案覆盖相关取舍，无需罗列大量托管产品：

- **Compute Engine 执行器：** Linux [系统软件包](https://docs.cloud.google.com/compute/docs/instances/artifact-registry-os-packages) 和[持久块磁盘](https://docs.cloud.google.com/compute/docs/disks/persistent-disks) 与本地提供方的要求相符。保留的磁盘可以在实例删除后继续存在；[停止 VM](https://docs.cloud.google.com/compute/docs/instances/stop-start-instance) 不会保留运行进程的内存。仍然需要进程监管、恢复、备份和执行隔离。
- **独立的 Cloud Run 执行：** 自定义镜像支持打包工具。[Job](https://docs.cloud.google.com/run/docs/configuring/task-timeout) 在不使用 GPU 时，单次任务超时最长为七天，重试按每次尝试计算。[Worker pool](https://docs.cloud.google.com/run/docs/container-contract) 提供持续分配的 CPU，并采用手动伸缩，但实例仍可能终止。两者都不会自动保留 worktree 或恢复 DSH 任务所有权。
- **E2B 执行：** 平台提供[隔离的 Linux VM](https://docs.e2b.dev/sandbox)、[自定义模板](https://docs.e2b.dev/sandbox-template) 和[暂停/恢复持久化](https://docs.e2b.dev/sandbox/persistence)，但存在连续运行时长限制。DSH 已有共享同一沙箱的[文件系统](../../packages/e2b/fs-e2b/src/index.ts)与[子进程](../../packages/e2b/subprocess-e2b/src/index.ts)适配器。不过，其[所有者](../../packages/e2b/e2b/src/index.ts) 会创建新沙箱，生命周期默认为五分钟，并在超时或 dispose（资源释放）时删除沙箱；未开放模板选择、重连或暂停保留配置。[宿主会话状态与日志仍在沙箱之外](../../packages/e2b/e2b/README.zh.md)。这是现有的执行提供方，不是完整的托管方案。

-----

<a id="dev-note"></a>
## 开发备注

<details>
<summary>未批准的建议、待定事项与执行记录</summary>

本节不具权威性。托管选型属于 [Choose the hosting and execution model](https://github.com/Kishimotovn/kishi-harness/issues/6)，需要人工决定。

**未批准的建议：** 将 Firebase 保留为可选的身份、数据和 Web 层，并以独立隔离、配有保留式 POSIX 存储的 VM 执行器作为改动最少的基准方案。如果可以接受可丢弃的 worktree，以及显式的持久检查点和恢复机制，Cloud Run 仍是候选。如果可以接受生命周期/模板集成以及宿主持久存储的工作，E2B 仍是候选。任意依赖执行应使用限制文件系统访问、出站网络和凭据的执行容器/VM，而不是应用的管理员身份。

**待定事项：** 保留还是重建 worktree；持久状态所有者与备份策略；中断/重试语义；隔离强度；允许的仓库依赖类别；App Hosting 的入口/重连行为，以及能否配置底层 Cloud Run 设置。尚无候选方案通过已部署环境中的 DSH 原生扩展、PTY、锁或重启冒烟测试。

**管理员稍后需要确认的事实：** 项目/区域、选定的运行时/镜像/配置档、App Hosting 应用根目录与部署分支、工作仓库授权、独立执行身份、持久路径及秘密引用。Firebase [要求项目所有者参与首次 App Hosting 设置](https://firebase.google.com/docs/app-hosting/configure)；Cloud Run [记录了部署者和服务身份所需的角色](https://docs.cloud.google.com/run/docs/configuring/billing-settings)。未收集任何凭据值。

**已执行：** 本地源码与指令读取、只读 Git 检查，以及官方文档检索。**未执行：** 此处讨论或链接的所有部署、安装、模板构建、挂载、运行时冒烟测试、重启和模型调用。未更改任何资源、账号、秘密或产品代码。基准测试、容量规划与成本建模仍明确延期；未重新计算用户的预算上限。

</details>
