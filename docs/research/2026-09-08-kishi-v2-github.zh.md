# Kishi V2 GitHub 集成研究

[English](2026-09-08-kishi-v2-github.md) | 中文

## 概述

GitHub App 支持仓库自动化，无需共享个人访问令牌。安装凭据标识 App，而非发起工作的成员，也不会解除分支保护。本参考文档为 [Research GitHub App onboarding, credentials, and issue integration](https://github.com/Kishimotovn/kishi-harness/issues/4) 区分文档所述能力与只读证据；它不批准任何实现。来源：[安装身份认证](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/authenticating-as-a-github-app-installation)、[分支保护](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)。

## 目录

- [证据](#evidence)
- [安装与身份](#installation-and-identity)
- [操作与权限](#operations-and-permissions)
- [凭据与仓库代码](#credentials-and-repository-code)
- [工作项与同步](#work-items-and-synchronization)
- [受保护的合并](#protected-merges)
- [Webhook 与恢复](#webhooks-and-recovery)
- [开发备注](#dev-note)

-----

## 证据
<a id="evidence"></a>

2026-09-08 的只读 `gh api` 请求确认该仓库是已启用 Issues 的公开 fork。[Kishi V2: Chart the plugin-first DSH implementation 子议题列表端点](https://api.github.com/repos/Kishimotovn/kishi-harness/issues/1/sub_issues) 返回十个子议题。[Research GitHub App onboarding, credentials, and issue integration 父议题端点](https://api.github.com/repos/Kishimotovn/kishi-harness/issues/4/parent) 指向该路线图。[Decide GitHub synchronization and work-item ownership 阻塞项端点](https://api.github.com/repos/Kishimotovn/kishi-harness/issues/8/dependencies/blocked_by) 指向 GitHub 集成及 DSH 插件/设置研究工单。[GitHub 集成研究的依赖方端点](https://api.github.com/repos/Kishimotovn/kishi-harness/issues/4/dependencies/blocking) 指向仓库访问及同步决策。三个包含响应头的关系请求均返回 HTTP 200，并选择 API 版本 `2022-11-28`。

已安装的 CLI（命令行界面）报告版本为 `2.92.0`。这些读取使用现有 CLI 身份认证，而非 Kishi 安装令牌。下文其余 GitHub 能力均为仅依据文档的研究结论，不是已测试的安装、私有仓库、写操作或 webhook 保证。

## 安装与身份
<a id="installation-and-identity"></a>

安装会为某个账户及所选仓库授予请求的权限。组织所有者可以安装；仓库管理员可在文档规定的权限及组织策略限制内安装。其他人可以请求批准。私有 App 注册仅限其所属账户，因此仅限受邀成员的 Kishi 团队本身并不意味着必须采用私有 App 注册。来源：[安装要求](https://docs.github.com/en/apps/using-github-apps/installing-a-github-app-from-a-third-party)、[App 可见性](https://docs.github.com/en/apps/using-github-apps/installing-your-own-github-app)。

所选仓库限制安装的访问范围，但不隔离公开数据：GitHub 文档说明了公开读取权限，某些 REST 端点也允许未经身份认证的公开读取。私有访问和写入仍需满足安装、仓库选择及权限要求。新增权限请求需要安装所有者批准。来源：[安装选择](https://docs.github.com/en/apps/using-github-apps/installing-a-github-app-from-a-third-party)、[权限规则](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/choosing-permissions-for-a-github-app)。

`GET /installation/repositories` 列出可访问的仓库。相反，通过 `/user/installations/{installation_id}/repositories/{repository_id}` 添加或移除仓库需要仓库管理权限及经典 PAT。安装令牌不能扩展自身所选仓库。因此，不使用 PAT 的接入方式将仓库选择留在 GitHub 由管理员控制的安装流程中，而不使用这些 REST 写入端点。来源：[安装 API](https://docs.github.com/en/rest/apps/installations)。

安装身份发起的调用归属于 App。归属于用户的调用需要每位用户单独授权并提供用户访问令牌；访问范围是用户权限与 App 权限的交集。GitHub 建议代表用户执行操作时使用用户令牌。Firebase 登录或 Kishi 仓库分配不等于 GitHub 用户授权。采用团队所有的自动化还是用户委托操作，仍需人工决定。来源：[用户身份认证](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/authenticating-with-a-github-app-on-behalf-of-a-user)、[App 安全指南](https://docs.github.com/en/apps/creating-github-apps/about-creating-github-apps/best-practices-for-creating-a-github-app)。

## 操作与权限
<a id="operations-and-permissions"></a>

[GitHub App 权限索引](https://docs.github.com/en/rest/authentication/permissions-required-for-github-apps) 将下列 REST 操作标为兼容安装令牌。这些是各操作所需的仓库权限，并非要求一次性授予表中全部权限。

| 操作 | 此用途所需权限 |
| --- | --- |
| 读取仓库元数据或协作者权限 | Metadata：read |
| 读取议题、评论、父议题、子议题、依赖关系 | Issues：read |
| 创建或更新议题与议题评论；修改原生关系 | Issues：write |
| HTTPS 克隆或获取；推送普通代码 | 分别为 Contents：read；Contents：write（[Git 访问](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/choosing-permissions-for-a-github-app#choosing-permissions-for-git-access)） |
| 创建或更新 PR（Pull Request） | Pull requests：write |
| 通过 REST 合并 PR | Contents：write |
| 读取检查运行；读取提交状态 | 分别为 Checks：read；Commit statuses：read |

修改 `.github/workflows` 下的工作流文件需要单独的 Workflows 权限，其中修改需要写入权限；推送普通代码不能成为请求该权限的理由。查看 Actions 运行或日志使用 Actions：read。查看传统分支保护配置使用 Administration：read；遵守分支保护不需要 Administration：write。这些区别见 [Git 访问指南](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/choosing-permissions-for-a-github-app#choosing-permissions-for-git-access)及[权限索引](https://docs.github.com/en/rest/authentication/permissions-required-for-github-apps)。

## 凭据与仓库代码
<a id="credentials-and-repository-code"></a>

后端签署 App JWT 并将其交换为安装令牌。令牌一小时后过期；续期会创建新令牌，而非刷新用户令牌。显式 `repository_ids` 和 `permissions` 会收窄授权；省略时继承安装中相应的全部授权。令牌不能超出安装的访问范围，显式仓库列表最多包含 500 个仓库。Octokit 可以重新生成已过期令牌。来源：[令牌生成](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app)。

`GH_TOKEN` 为无头 `gh` 提供身份认证，并覆盖已存储的凭据。它不会使仅限用户的端点兼容安装令牌：例如，`/user/repos` 接受用户令牌，而不接受安装令牌。每条所需 CLI 命令仍须检查 App 令牌兼容性。来源：[CLI 环境](https://cli.github.com/manual/gh_help_environment)、[身份认证行为](https://cli.github.com/manual/gh_auth_login)、[权限索引](https://docs.github.com/en/rest/authentication/permissions-required-for-github-apps)。

Git 接受安装令牌作为 HTTPS 密码。[Git 凭据辅助程序与 `GIT_ASKPASS`](https://git-scm.com/docs/gitcredentials) 可将凭据与 URL 分开提供；辅助程序可能持久化凭据，HTTP 路径匹配默认关闭。[Worktree 共享仓库配置](https://git-scm.com/docs/git-worktree#_configuration_file)，因此不能隔离凭据。

仓库代码一旦获得令牌，就能在令牌过期或撤销前使用其获授权限。被窃取的 App 私钥可跨安装实例授权。私有仓库并不意味着构建脚本或依赖可信；GitHub 的[执行安全指南](https://docs.github.com/en/actions/reference/security/secure-use#hardening-for-self-hosted-runners) 说明了通过共享执行环境窃取凭据的风险。[App 安全指南](https://docs.github.com/en/apps/creating-github-apps/about-creating-github-apps/best-practices-for-creating-a-github-app) 要求保护凭据存储，并支持提前撤销令牌。

## 工作项与同步
<a id="work-items-and-synchronization"></a>

已商定的 Kishi 映射是每个请求或工单对应一个 GitHub 议题，同一工作项关联多个 DSH 会话、重试和 subagent。面向 GitHub 的商定输出是最终完成概述，而非每条对话消息。这些是产品要求，不是 GitHub 的会话语义。

[原生子议题](https://docs.github.com/en/rest/issues/sub-issues) 提供父议题查询、列表、添加、移除和排序操作；添加使用议题的 `sub_issue_id`，而非仓库内编号，并要求仓库所有者相同。`replace_parent` 显式允许变更父议题。GitHub 文档规定[最多 100 个子议题和八层嵌套](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/adding-sub-issues)。[依赖关系](https://docs.github.com/en/rest/issues/issue-dependencies) 单独提供 `blocked_by` 和 `blocking`；添加阻塞项使用 `issue_id`。两种关系都不代表 DSH 会话。

[议题创建与更新](https://docs.github.com/en/rest/issues/issues) 以及[评论创建与更新](https://docs.github.com/en/rest/issues/comments) 会返回标识符，供后续更新使用。这些端点定义未承诺提供客户端幂等键。因此，创建响应丢失可能掩盖已成功的写入，重试则可能产生重复内容。条件 GET 支持 ETag，但除非端点明确说明，否则不支持条件写操作。来源：[REST 最佳实践](https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api)。

## 受保护的合并
<a id="protected-merges"></a>

[合并 REST](https://docs.github.com/en/rest/pulls/pulls#merge-a-pull-request) 支持 `merge`、`squash` 和 `rebase`，以及可选的预期分支头 `sha`；不匹配时返回 409。获准推送的 App 仍须满足必需 PR 和检查通过的要求。仓库策略还可能要求评审、分支保持最新、签名或合并队列。来源：[受保护分支](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)。

[CLI 合并](https://cli.github.com/manual/gh_pr_merge) 支持预期分支头匹配、自动合并和参与队列。`--admin` 调用绕过权限；App 身份认证不会自动提供此权限。原生堆叠 PR 必须使用[异步合并](https://docs.github.com/en/rest/pulls/pulls#merge-a-pull-request-asynchronously)。接受请求不等于完成：其初始检查不包括分支保护，最终结果仍可能失败。议题依赖链接不能替代仓库合并规则。

## Webhook 与恢复
<a id="webhooks-and-recovery"></a>

GitHub 使用 webhook 密钥对原始载荷计算 HMAC-SHA256 签名，并置于 `X-Hub-Signature-256` 中。处理前须通过恒定时间比较验证未经修改的字节。HTTPS 和证书验证仍然必要。来源：[签名验证](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries)、[webhook 实践](https://docs.github.com/en/webhooks/using-webhooks/best-practices-for-using-webhooks)。

接收方必须在十秒内返回 2xx。GitHub 不会自动重试失败投递；[三天内可重新投递](https://docs.github.com/en/webhooks/testing-and-troubleshooting-webhooks/redelivering-webhooks)。重新投递保留 `X-GitHub-Delivery`。[App 投递列表与重新投递](https://docs.github.com/en/rest/apps/webhooks) 需要 App JWT，而非安装令牌。确认投递并不意味着业务效果恰好发生一次。来源：[投递失败处理](https://docs.github.com/en/webhooks/using-webhooks/handling-failed-webhook-deliveries)、[投递标识符](https://docs.github.com/en/webhooks/using-webhooks/best-practices-for-using-webhooks#use-the-x-github-delivery-header)。

GitHub 可能延迟或乱序投递事件。载荷时间戳而非到达顺序描述事件发生的时间。来源：[webhook 故障排查](https://docs.github.com/en/webhooks/testing-and-troubleshooting-webhooks/troubleshooting-webhooks#webhooks-deliveries-are-out-of-order)。

-----

## 开发备注
<a id="dev-note"></a>

<details>
<summary>未经批准的建议与验证缺口</summary>

候选方案：将受信任的 GitHub 服务置于仓库执行环境之外。在服务端验证安装、账户及仓库访问，并在每次操作时执行 Kishi 成员分配限制。在受保护的后端密钥存储中保存签名私钥及独立的 webhook 密钥；安装令牌保持短期有效，并禁止进入浏览器、模型上下文、日志、克隆 URL 或持久化远程地址。受信任的 Git 操作使用不含凭据的 URL 及不持久化的凭据提供方。不向恶意代码暴露令牌或不受限制的凭据服务。托管和存储仍未决定；Firebase 仍为偏好。

候选方案：持久化仓库与议题标识符、工作项与会话关联、完成评论标识符。按工作项串行写入，并在重试前核对结果不明的创建操作。确认投递前先持久化已验证投递，对已完成效果去重，保留处理失败记录供重试，并核对遗漏状态。遵守 `Retry-After` 和速率限制重置响应（[REST 重试指南](https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api#handle-rate-limit-errors-appropriately)）。

HITL 决策仍未确定：直接在 GitHub 编辑的所有权、冲突处理、关闭与重新打开、批准权限，以及团队自动化与用户归属的选择。保留全局默认值及仓库覆盖项，以配置合并工作流；两者都不能覆盖 GitHub 强制执行的规则。

管理员设置，尚未执行：选择 App 所有权与可见性，注册 App 并安装到所选仓库，批准按操作所需的权限，配置 HTTPS webhook 与受保护密钥，记录非秘密的 App、安装及仓库 ID，并在 Kishi 中分配受邀成员。归属于用户的操作还需要用户授权及受保护的用户令牌存储。经授权的集成测试必须验证被拒绝或未选中的私有仓库访问、令牌续期、具体 `gh` 命令、工作流文件修改、受保护合并、关系通知及重新投递。本研究未执行 App 设置、凭据签发或收集、GitHub 写入、资源配置、基准测试、成本分析或模型调用。

</details>
