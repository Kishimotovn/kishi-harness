# Kishi v2：仅限受邀用户的身份验证研究

[English](2026-09-08-kishi-v2-auth.md) | 中文

本报告记录 2026-09-08 针对 [Research invite-only Firebase authentication and repo authorization](https://github.com/Kishimotovn/kishi-harness/issues/3) 的研究结果。本文是参考性研究，不是规格说明或已批准的决策。

## 概述

Firebase 文档说明了[管理员创建账号](https://firebase.google.com/docs/auth/admin/manage-users)、[密码找回邮件](https://firebase.google.com/docs/auth/admin/email-action-links)以及[可由服务器验证的身份](https://firebase.google.com/docs/auth/admin/verify-id-tokens)。Identity Platform 文档说明了通过 API [禁止终端用户注册](https://docs.cloud.google.com/identity-platform/docs/reference/rest/v2/Config)的设置。这些控制措施并不确立受邀应用成员资格或仓库分配关系。所检查的 [DSH 浏览器身份验证机制](#dsh-authorization-limits)授予部署访问权限，但不识别个人用户。

范围：一个仅限受邀成员的私有团队，采用电子邮件和密码登录，不开放公开注册，由 Kishimotovn 管理已连接的仓库及其分配。全局设置和仓库覆盖设置均为必需项。托管方式与工作进程拓扑尚未确定。

## 目录

- [账号开通](#account-onboarding)
- [注册限制](#signup-restriction)
- [服务器身份验证与有效状态](#server-identity-and-freshness)
- [凭据与角色管理权限](#credentials-and-role-authority)
- [DSH 授权限制](#dsh-authorization-limits)
- [开发者备注](#dev-note)

<a id="account-onboarding"></a>

## 账号开通

创建账号和发送邮件是两项独立操作。Firebase 的[用户指南](https://firebase.google.com/docs/auth/web/manage-users)说明，可在控制台的 Users 标签页创建密码验证用户，也可从控制台发送密码重置邮件。所查阅的指南未说明存在 Invite 按钮，也未说明创建账号会自动发送邀请邮件。本次未在实际控制台中观察这两种行为。

[Admin SDK 用户管理 API](https://firebase.google.com/docs/auth/admin/manage-users) 支持 `createUser`，其参数包括可选的密码、`disabled` 和 `emailVerified`。电子邮件验证状态默认为 false。因此，管理员创建账号并不证明收件人拥有该邮箱，也不记录其接受应用邀请的事实。

[`generatePasswordResetLink`](https://firebase.google.com/docs/auth/admin/email-action-links) 要求电子邮件地址属于现有用户，并返回操作链接；应用需自行提供邮件发送服务。另一种方式是使用 `sendPasswordResetEmail`，由 Google 按模板发送邮件。继续操作网址要求使用已授权的网域。电子邮件链接登录是另一种可创建账号的流程，并非本次要求的密码登录。

<a id="signup-restriction"></a>

## 注册限制

隐藏表单并不会禁用文档所述的 [`accounts:signUp` REST 端点](https://docs.cloud.google.com/identity-platform/docs/reference/rest/v1/accounts/signUp)。[配置参考](https://docs.cloud.google.com/identity-platform/docs/reference/rest/v2/Config)定义了 `client.permissions.disabledUserSignup`：设为 true 时，终端用户无法通过任何 API 方法创建账号。`disabledUserDeletion` 是独立的控制项。

[Identity Platform 用户自助服务指南](https://docs.cloud.google.com/identity-platform/docs/concepts-manage-users)明确说明，禁用终端用户操作后，管理员仍可通过 Admin SDK 或 Google Cloud 控制台创建账号。指南将 `auth/admin-restricted-operation` 列为 Web 操作遭拒时的错误。管理员通过带有身份验证和 `updateMask` 的 PATCH 请求调用 [`projects.updateConfig`](https://docs.cloud.google.com/identity-platform/docs/reference/rest/v2/projects/updateConfig) 修改配置；所需 IAM 权限为 [`firebaseauth.configs.update`](https://docs.cloud.google.com/identity-platform/docs/access-control)。

以上是 Identity Platform 文档规定的行为。[Firebase Authentication with Identity Platform](https://firebase.google.com/docs/auth) 是可选的产品升级。虽然 Config 枚举了 `FIREBASE_AUTH` 和 `IDENTITY_PLATFORM`，但仅凭该枚举不能确认未升级项目可使用每项设置。本次未检查项目子类型、控制台可用选项或已持久化的配置，也未测试实际注册拒绝行为。

另一种方式是使用[屏蔽函数](https://firebase.google.com/docs/auth/extend-with-blocking-functions)：`beforeUserCreated` 或 `beforeUserSignedIn` 可以拒绝请求。这些函数要求升级至 Identity Platform；部署 Firebase 函数还要求使用 [Blaze](https://firebase.google.com/docs/functions/get-started)。函数必须在七秒内响应，匿名身份验证和自定义身份验证不会触发这些函数。有效的 Firebase 身份仍需具备应用成员资格；仅拒绝应用访问并不等于禁止身份注册。

<a id="server-identity-and-freshness"></a>

## 服务器身份验证与有效状态

对于自定义后端，Firebase 文档要求通过 HTTPS 传输 ID 令牌，再调用 [`verifyIdToken`](https://firebase.google.com/docs/auth/admin/verify-id-tokens)，检查签名、有效期、项目受众和颁发者后才能信任 `uid`。客户端直接提交的 UID、仅解码而未验证的 JWT 或 Admin SDK 自定义令牌均不能作为此类证明。常规 ID 令牌验证不检查撤消状态。

[ID 令牌的有效期为一小时](https://firebase.google.com/docs/auth/admin/manage-sessions)。删除或停用用户以及重大账号变更会使刷新令牌无法继续使用；管理员可通过 `revokeRefreshTokens` 执行撤消，密码重置则会自动撤消。`verifyIdToken(token, true)` 检查撤消状态，并增加一次后端网络请求。若不执行该检查，即使刷新已被阻止，签名 JWT 在到期之前仍可能被接受。

[会话 Cookie](https://firebase.google.com/docs/auth/admin/manage-cookies) 通过 ID 令牌换取服务器创建的 Cookie，有效期可设为五分钟至两周。Firebase 文档说明了 CSRF 防护、`httpOnly`/`secure` 属性、近期 `auth_time` 检查，以及通过 `verifySessionCookie(cookie, true)` 检测撤消和用户被删除或停用的情况。Cookie 保留源令牌的声明，不能直接用于其他 Firebase 服务的身份验证。清除某个浏览器的 Cookie 不会使被窃取的副本失效；撤消也会影响该用户的其他会话。

<a id="credentials-and-role-authority"></a>

## 凭据与角色管理权限

[Admin 设置指南](https://firebase.google.com/docs/admin/setup)要求可信的服务器环境和项目配置。指南建议在 Google 托管运行时使用应用默认凭据（ADC）；导出的服务账号密钥是文档列出的非 Google 环境选项，并非 Google 基础设施上的必需项。常规 `gcloud` 终端用户 ADC 凭据在 Firebase Authentication 中存在限制；文档给出的解决方式是使用开发者自有的 OAuth 客户端并显式设置项目 ID。

[IAM](https://docs.cloud.google.com/identity-platform/docs/access-control) 通过 `firebaseauth.users.create`、`get`、`update`、`sendEmail` 和 `createSession` 区分用户创建、查询、更新、邮件操作及 Cookie 创建权限。修改配置的权限另行控制。[Firebase 浏览器 API 密钥](https://docs.cloud.google.com/identity-platform/docs/reference/rest/v1/accounts/signUp)用于标识项目，不是这些管理凭据。

[自定义声明](https://firebase.google.com/docs/auth/admin/custom-claims)由具备特权的 Admin SDK 代码设置，大小上限为 1000 字节，且 `setCustomUserClaims` 会覆盖已有声明。更新后的值通过新签发的令牌传播，不会追溯修改已有 JWT。客户端提交的角色字段不可信。经验证的角色声明不同于当前仓库分配关系；角色变更时必须考虑令牌刷新或撤消策略。

<a id="dsh-authorization-limits"></a>

## DSH 授权限制

源码检查基于 `c389f96bf3a9b6807cb71ed6bdad5849be0df6d8`，未运行应用。[BrowserCookiePayload](../../packages/client/connection/src/browser-auth.ts#L27) 包含版本、访问主机及时间戳，不包含 UID 或角色。[BrowserAuth.authorizeIndex](../../packages/client/connection/src/browser-auth.ts#L240) 将进程启动令牌换成签名 Cookie。[Connection 的构造代码](../../packages/client/connection/src/index.ts#L117)安装了这个具体实现。这是以共享部署访问能力为依据的身份验证，并非个人电子邮件和密码身份验证。

[HostConnectionService.requestRejection](../../packages/client/connection/src/rpc-host.ts#L97) 检查 Host/Origin 及 Cookie。[RPC 分派代码](../../packages/client/connection/src/rpc-host.ts#L247)传递端点、载荷和取消信号，不传递经过身份验证的调用方。[Gateway WebSocket 升级处理](../../packages/api/gateway/src/index.ts#L214)使用相同的拒绝检查。这些已检查的入口并未确立受邀用户的仓库权限。

[WorkspaceFiles.confine](../../packages/api/workspace-files/src/index.ts#L341) 检查文件系统路径是否位于指定范围内。[SessionCommandController.attachment](../../packages/api/session-controller/src/commands.ts#L368) 检查会话日志是否引用某张图片。这两项检查均未关联发起请求的人员与仓库。[SettingsController.write](../../packages/api/settings-controller/src/index.ts#L260) 通过提供方写入命名空间，不带调用方或仓库参数。工作区筛选、agent（智能体）作用域和机密信息脱敏均不能证明已执行仓库 ACL 检查。

[Firestore Security Rules](https://firebase.google.com/docs/firestore/security/rules-conditions) 可授权 Firebase 客户端的数据请求；服务器库绕过这些规则并使用 IAM。它们不会包裹 DSH 的 HTTP 处理函数或工作进程执行。因此，无论最终选择何种成员数据库，身份验证、数据库规则和后端仓库授权仍是独立职责。

<a id="dev-note"></a>

## 开发者备注

以下建议尚未批准。与仅为拒绝所有注册而部署屏蔽函数相比，优先考虑文档规定的禁用注册设置。按经验证的 UID 保存由服务器管理的成员记录，并将仓库 ACL 保存在令牌声明之外。显式初始化 Kishimotovn 的管理员权限；绝不根据显示名称、自行声称的电子邮件地址或首次登录推断管理员身份。

- 同源方案：Firebase 密码登录、检查撤消状态的会话 Cookie、Host 身份验证插件，以及向授权检查显式传递调用方。Connection 需要适配；这不是已有的即插即用 Firebase 配置。
- 独立客户端方案：验证 ID 令牌，并显式处理刷新和传输。两种方案均需在数据及历史读取、流、文件及上传、导出、设置和执行操作之前检查当前成员资格及仓库权限。全局设置与仓库覆盖设置需要分别授权读写；覆盖值不能授予成员资格。

若获批准，管理员需完成以下设置：选择项目及产品，启用电子邮件和密码登录，禁用其他不需要的提供方及客户端注册，配置已授权网域与重置邮件发送方式，并提供最小权限的服务器凭据。创建受邀账号、建立 UID 成员资格及分配关系，并单独发送重置操作邮件。不指定可选密码而使用重置操作，可避免分发预先选定的密码，但完整的初始密码流程仍需实际验证。研究产物不需要包含任何机密值。

尚未决定的事项包括成员数据存储、邀请到期及重发、邮箱验证、角色状态更新时效、成员离开后的处理及活动流或任务终止、会话共享、管理员恢复，以及仓库及全局设置的写入策略。后端与工作进程拓扑仍待确定。成员资格和会话共享决策属于需人工决定的工单，不由本报告裁定。

未执行的操作：项目或控制台检查及资源配置；IAM/ADC 设置；账号创建、注册尝试、屏蔽函数部署、操作链接生成及发送和使用、密码变更、令牌及 Cookie 验证、撤消及停用用户检查、声明分配，以及跨仓库授权测试。本次未启动应用、调用模型 API、构建、运行完整测试、进行基准测试、估算工作负载或建立预算模型。未请求或收集凭据。文档检查不能证明已部署的安全策略有效。
