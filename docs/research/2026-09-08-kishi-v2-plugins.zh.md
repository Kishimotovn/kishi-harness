---
description: "Kishi 工作流插件、仓库控制及全局设置与仓库覆盖值的源码依据。"
---

# Kishi V2 插件与两级设置

[English](2026-09-08-kishi-v2-plugins.md) | 中文

## 概述

Kishi 可以复用 DSH 的持久化宿主/客户端插件组合、会话控制器、模型与 skill（技能）注册表、人工交互和事件投影。仓库分配、待办请求、调查/构建工单、跨会话执行尝试，以及团队全局设置与仓库覆盖值，仍是待补充的 Kishi 行为。已检查的扩展点不构成修改 agent loop（智能体循环）的理由。

本文支持 [Research DSH plugins and Kishi two-tier workflow settings](https://github.com/Kishimotovn/kishi-harness/issues/5)，依据 DSH `c389f96bf3a9b6807cb71ed6bdad5849be0df6d8` 和固定版本的 Kishi-sb 源码。已批准的顺序是仅决策路线图、`/to-spec`、`/to-tickets`，然后按分阶段需求开展获批实现。约束包括一个受邀团队、邮箱/密码访问、仅使用 DSH 执行底座、独立的全局/仓库设置页面，以及每个工作项而非每个会话对应一个 GitHub issue。Firebase 仍是偏好，不是托管决策。本文检查源码和测试，不认证部署或运行时行为。

## 目录

- [依据](#section-evidence)
- [两级配置](#section-configuration)
- [工作流与 Worktree](#section-workflow)
- [开发备注](#section-dev-note)

<a id="section-evidence"></a>

## 依据

下表区分可复用操作与尚未确认 Kishi 负责人的需求。引用测试表示已检查断言，不表示已执行测试。

| 需求 | 决策负责人和相邻依据 | 已有能力与所需行为 |
|---|---|---|
| 持久化宿主/客户端插件 | [配置方案组合](../../packages/boot/app-boot/src/profile.ts#L839) 按顺序应用补丁层。[客户端模块发现](../../packages/client/modules/src/index.ts#L743) 要求 `dsh.client.platform: web` 和 `./client` 导出；[Web 组合](../../packages/bundle/web-app/cordis.patch.yml#L237) 挂载具体 UI 包。 | 已有：通过配置方案/组合包和浏览器产物分发的编写型插件。新增：Kishi 的持久化组合。安装任意代码或使用 Creator 模式定义，并不能证明所需的生产行为已经存在。 |
| 仓库/待办导航与设置页面 | [Workspace 注册](../../packages/client/ui-workspace/src/client/index.ts#L144) 占用 `sidebar.workspaces`；[测试](../../packages/client/ui-workspace/tests/apply.client.spec.ts#L97) 覆盖延迟声明、操作和资源释放。[设置外壳](../../packages/client/ui-settings-general/src/client/index.ts#L102) 根据 `settings.section` 注册生成导航。 | 已有：可替换的浏览区域、可扩展设置分区，以及归属于语言字典的文案。新增：已分配仓库浏览、请求/工单导航、AFK 可见性、等待人工标记，以及独立的全局/仓库编辑器。当前导航打开会话，而非工作项。 |
| 宿主身份验证与仓库授权 | [Connection 请求检查](../../packages/client/connection/src/rpc-host.ts#L97) 结合 Host/Origin 信任和浏览器身份验证；[Cookie 测试](../../packages/client/connection/tests/browser-auth.host.spec.ts#L94) 断言启动令牌交换和重启后保留。[Workspace 命令](../../packages/api/workspace-controller/src/commands.ts#L39) 通过注册表解析目录。 | 已有：进程令牌/签名 Cookie 信任机制。新增：受邀成员身份、管理员检查、仓库分配，以及读取、流、修改和执行的授权。隐藏侧栏条目不等于授权。在这些控制器中未找到已验证的逐请求成员主体传递机制。 |
| 每个工作项拥有多个会话和执行尝试 | [会话创建](../../packages/api/session-controller/src/commands.ts#L79) 接收显式标识、Workspace 或 cwd，以及预设。[Agent 接管](../../packages/api/session-controller/src/agent.ts#L233) 检查 cwd/预设归属；[创建测试](../../packages/api/session-controller/tests/commands-create-fork.host.spec.ts#L43) 覆盖目标与失败规则。 | 已有：创建/接管/恢复，以及会话与目录的关联。新增：请求/工单标识、执行尝试历史和稳定的 GitHub issue 关联。仅靠会话列表或 fork 来源关系，无法提供已批准的待办层级。 |
| 持久化工作项决策与投影 | [投影注册](../../packages/session/session-projection/src/index.ts#L217) 折叠已提交事件并可提供客户端视图。[计划回放测试](../../packages/plan/plan-mode/tests/projection.spec.ts#L162) 从日志恢复待处理状态。[存储事件验证](../../packages/session/session-persistence/src/storage-contract.ts#L69) 拒绝未知的必需类型。 | 已有：单会话回放和派生视图。新增：跨会话工作项状态和已记录的检查点决策。必需的 Kishi 事件声明必须进入该 fork 生成的事件目录；将必要审批标记为 `ignorable` 并不能建立安全回放。 |
| 不匹配关键词的人工检查点 | [审批请求](../../packages/interaction/user-approval/src/index.ts#L207) 在打开的轮次内追加 asked/decided 记录；[测试](../../packages/interaction/user-approval/tests/approval.spec.ts#L48) 断言空闲时拒绝请求和失败时拒绝授权。[用户提问](../../packages/interaction/user-questions/src/index.ts#L86) 拒绝被委派的调用者。[计划模式](../../packages/plan/plan-mode/src/index.ts#L194) 使用 pre-step、命令、提示词和工具注册。 | 已有：实时人工回答渠道、带审计记录的操作审批，以及已记录的计划状态。新增：绑定适用工作项和产物版本的已认证人工决策，由状态转换/执行负责人强制执行。提示词引导阶段；模型文字或 agent 提供的审批标志不能授予批准。 |
| 阶段模型选择 | [LLM（大语言模型）解析](../../packages/llm/llm/src/index.ts#L846) 验证精确的提供方/模型和支持的推理强度。[会话选择](../../packages/api/session-controller/src/commands.ts#L124) 安装选择，并通过 [AgentDefaultModel](../../packages/core/agent-default-model/src/index.ts#L100) 保存它。 | 已有：已注册提供方路由、会话级选择和一个 harness 默认值。新增：阶段/仓库解析。直接复用标准选择器可能更新 harness 默认值，而非仓库覆盖值。 |
| 阶段 skill 加载 | [文件系统发现](../../packages/skill/skill-filesystem/src/index.ts#L243) 选择项目/自定义/用户根目录；[优先级测试](../../packages/skill/skill-filesystem/tests/skill-filesystem.spec.ts#L183) 确定胜出条目。[Skill 工具](../../packages/skill/tool-skill/src/index.ts#L123) 使用 cwd 和 agent 作用域、检查调用权限，并发布记录在日志中的目录/调用上下文。 | 已有：发现、加载，以及模型/用户调用控制。新增：管理员管理的可用范围、阶段分配、安装/更新策略和 Kishi 包装层分派。发现不会安装依赖，也不会强制执行工作流检查点。 |
| Agent 预设 | [预设挂载](../../packages/preset/agent-presets/src/index.ts#L414) 加入常驻组合；[会话设置](../../packages/api/session-controller/src/agent.ts#L374) 在发布前挂载。[挂载测试](../../packages/preset/agent-presets/tests/mount.spec.ts#L119) 覆盖不同工具、共享预设和独立资源释放。 | 已有：可复用的面向模型的插件集合和作用域可见性。新增：阶段到预设的策略，以及执行尝试配置的归属。预设/agent 注册作用域不是安全边界。 |
| 文件系统与子进程执行 | [本地文件系统解析](../../packages/fs/fs-local/src/index.ts#L107) 接收基于 cwd 的路径；[子进程 spawn](../../packages/subprocess/subprocess-local/src/index.ts#L164) 拥有受管理进程；[Bash 调用方](../../packages/shell/bash-local/src/index.ts#L228) 将执行委托给它。 | 已有：文件操作和进程生命周期基础能力。新增：仓库克隆、执行尝试 worktree 分配、凭证使用、恢复和清理归属。`cwd` 不等于限制访问范围。部署必须提供兼容的文件系统/进程提供方及所需可执行程序；本文未确认 Firebase 支持。 |

<a id="section-configuration"></a>

## 两级配置

Kishi-sb 的[实际合并](https://github.com/Kishimotovn/kishi-sb/blob/01449124312de54e6afdea08a5116a83b78e2f1a/bin/kishi-config.sh#L10) 读取 `KISHI_DEFAULTS` 或已提交的默认配置，再通过 `yq` 乘法深度合并仓库的 `.agent.yml`：仓库字段优先，嵌套映射保留未指定字段，数组整体替换。[测试](https://github.com/Kishimotovn/kishi-sb/blob/01449124312de54e6afdea08a5116a83b78e2f1a/test/tick-check.sh#L1254) 覆盖覆盖值/继承。项目注册表列出被监视的仓库，不是第三层行为设置合并。`KISHI_AGENT_YML` 是显式文件覆盖选项。

[模型解析](https://github.com/Kishimotovn/kishi-sb/blob/01449124312de54e6afdea08a5116a83b78e2f1a/bin/kishi-config.sh#L29) 在合并后的角色具有 provider 时使用 `models.plan`、`models.build` 或 `models.qa`，否则使用 `models.default`。[默认配置](https://github.com/Kishimotovn/kishi-sb/blob/01449124312de54e6afdea08a5116a83b78e2f1a/config/defaults.yml#L1) 默认选择 DSH `deepseek-v4-pro`，构建选择 `deepseek-v4-flash`。评审使用 `review.reviewers`，而非 `models.review`；`review.aggregator` 回退到 plan，再回退到 default。[汇总器断言](https://github.com/Kishimotovn/kishi-sb/blob/01449124312de54e6afdea08a5116a83b78e2f1a/test/tick-check.sh#L226) 固定了这条回退链。

Kishi 的[提供方分派器](https://github.com/Kishimotovn/kishi-sb/blob/01449124312de54e6afdea08a5116a83b78e2f1a/bin/tick.sh#L451) 还选择执行底座：`copilot` 表示托管 Copilot，`dsh` 表示经过目录/配置方案/主目录检查的 DSH，`local` 进入 Copilot BYOK。因此，默认评审组的 `local` 条目并不选择 DSH 构建模型。这些选择器及 [issue 故障切换](https://github.com/Kishimotovn/kishi-sb/blob/01449124312de54e6afdea08a5116a83b78e2f1a/bin/tick.sh#L492) 不同于 DSH LLM 提供方路由；V2 仅使用 DSH 的决策排除了执行底座故障切换。

DSH 的[设置写入](../../packages/settings/settings/src/index.ts#L668) 在发布解析值前验证并持久化原始用户分区。Schema 默认值、组合 base 和用户覆盖值分层叠加；[测试](../../packages/settings/settings/tests/settings.spec.ts#L222) 确认对象递归合并和数组替换。[文件持久化](../../packages/settings/settings-file/src/index.ts#L185) 将命名空间分区存入一个 YAML/JSON 文档。版本、unset 和整体替换支持编辑，但不隐含仓库标识或跨命名空间继承。Kishi 仍需明确的全局/仓库解析与重置语义，且不能将解析后的默认值复制进覆盖值。

需要注意两个问题。[标准客户端绑定](../../packages/client/ui-settings/src/client/index.ts#L58) 在非回环页面选择内存模式；[测试](../../packages/client/ui-settings/tests/settings-scope.client.spec.ts#L438) 确认不执行宿主读写。这不是授权机制。另外，Kishi 的[读取器](https://github.com/Kishimotovn/kishi-sb/blob/01449124312de54e6afdea08a5116a83b78e2f1a/bin/kishi-config.sh#L20) 通过 `// empty` 丢弃布尔值 `false`；[合并调用方](https://github.com/Kishimotovn/kishi-sb/blob/01449124312de54e6afdea08a5116a83b78e2f1a/bin/tick.sh#L1925) 提供回退值 `true`。因此 YAML `auto_merge: false` 无法可靠地传递到 HOLD 策略。应保留可配置自动合并的意图，而非这个缺陷。

<a id="section-workflow"></a>

## 工作流与 Worktree

Kishi 的[规格阶段](https://github.com/Kishimotovn/kishi-sb/blob/01449124312de54e6afdea08a5116a83b78e2f1a/bin/tick.sh#L1246) 通过提示词区分讨论和人工许可，然后解析 `SPEC READY`。[工单创建](https://github.com/Kishimotovn/kishi-sb/blob/01449124312de54e6afdea08a5116a83b78e2f1a/bin/tick.sh#L1325) 在批准后执行，并创建原生 GitHub 子 issue/依赖。[HITL 完成](https://github.com/Kishimotovn/kishi-sb/blob/01449124312de54e6afdea08a5116a83b78e2f1a/bin/kishi-lib.sh#L563) 还要求人工回复。V2 保留这些人工决策，不保留关键词匹配。[合并策略](https://github.com/Kishimotovn/kishi-sb/blob/01449124312de54e6afdea08a5116a83b78e2f1a/bin/tick.sh#L1919) 在 QA 后执行，并根据 PR（Pull Request）最新提交重新检查跳过 QA 的批准；因此审批失效不仅关系到最初接受时刻。

[路由辅助函数](https://github.com/Kishimotovn/kishi-sb/blob/01449124312de54e6afdea08a5116a83b78e2f1a/bin/kishi-lib.sh#L495) 在 `routing: grill` 时选择 grilling，否则选择 Wayfinding；默认使用 `routing: wayfinder` 和 `adopt: needs-triage`。[评审处理](https://github.com/Kishimotovn/kishi-sb/blob/01449124312de54e6afdea08a5116a83b78e2f1a/bin/tick.sh#L1547) 可在评审回答数量不足时升级给操作人员。[汇总收尾](https://github.com/Kishimotovn/kishi-sb/blob/01449124312de54e6afdea08a5116a83b78e2f1a/bin/tick.sh#L1973) 读取默认值为 `false` 的 `final_close_ack`，启用后会等待人工再最终关闭。AFK/HITL 分类仍与运行状态和等待人工状态分开。

[包装层分派](https://github.com/Kishimotovn/kishi-sb/blob/01449124312de54e6afdea08a5116a83b78e2f1a/bin/kishi-lib.sh#L505) 优先使用存在的 `kishi-<skill>` 文件，否则使用锁定的基础 skill。[依赖阶段映射](https://github.com/Kishimotovn/kishi-sb/blob/01449124312de54e6afdea08a5116a83b78e2f1a/config/deps.yml#L1) 引用原生固定版本记录，而不重写它们。[检出路由](https://github.com/Kishimotovn/kishi-sb/blob/01449124312de54e6afdea08a5116a83b78e2f1a/bin/tick.sh#L1430) 选择仓库检出目录/配置；[Wayfinder 执行](https://github.com/Kishimotovn/kishi-sb/blob/01449124312de54e6afdea08a5116a83b78e2f1a/bin/tick.sh#L1146) 使用分离 HEAD 的 worktree，并将产物保留在工单分支。[连续性断言](https://github.com/Kishimotovn/kishi-sb/blob/01449124312de54e6afdea08a5116a83b78e2f1a/test/tick-check.sh#L2912) 覆盖协调器保持干净和产物跨后续执行保留。DSH 会话的 cwd 关联不能替代这项归属策略。

<a id="section-dev-note"></a>

## 开发备注

模块归属尚未获批。最小候选划分是：由 Kishi 工作项/工作流负责人管理已记录决策和阶段解析；由仓库集成/执行负责人管理分配、GitHub 关联和 worktree；由客户端插件提供待办导航和两个设置页面。持久化配置方案组合与 agent 预设是可复用的组装机制，不是实现规格。

待决事项包括：早于会话存在或跨会话的工作项存储；人工身份和授权传递；审批版本绑定、撤销、重复提交和重启恢复；重新呈现被中断的问题；设置更改是否影响正在执行的尝试；以及部分失败后 GitHub/本地状态的协调。现有计划回放不能解决这些义务。

对其他工单的影响：托管研究必须考虑持久化执行宿主和原生工具，而不只是静态客户端产物。身份验证研究必须替换/扩展启动令牌信任，并处理非回环设置绑定。GitHub 研究需要跨执行尝试保持每个请求/工单对应一个 issue、原生层级和幂等完成摘要，而非逐消息镜像。不需要 Discord 集成。[Kishi 的运行时风格 loader](https://github.com/Kishimotovn/kishi-sb/blob/01449124312de54e6afdea08a5116a83b78e2f1a/bin/kishi-lib.sh#L15) 为面向用户的输出提供 `wait-what`；V2 完成摘要保留这项要求。

依据限制：未执行部署、提供方/模型调用或完整测试。只读 `yq` 和 `jq` 探针确认了嵌套映射/数组合并行为及布尔 false 的合并处理。托管选型、规模规划、预算和基准测试均不在本次研究范围内。
