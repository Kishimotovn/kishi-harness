# Kishi v2: Invite-Only Authentication Research

English | [中文](2026-09-08-kishi-v2-auth.zh.md)

Findings dated 2026-09-08 for [Research invite-only Firebase authentication and repo authorization](https://github.com/Kishimotovn/kishi-harness/issues/3). This reference is research, not a specification or approved decision.

## Summary

Firebase documents [administrator-created accounts](https://firebase.google.com/docs/auth/admin/manage-users), [password recovery emails](https://firebase.google.com/docs/auth/admin/email-action-links), and [server-verifiable identities](https://firebase.google.com/docs/auth/admin/verify-id-tokens). Identity Platform documents [disabling end-user signup](https://docs.cloud.google.com/identity-platform/docs/reference/rest/v2/Config) through its APIs. These controls do not establish invited application membership or repository assignments. The inspected [DSH browser authentication](#dsh-authorization-limits) grants deployment access without identifying individual users.

Scope: one private invited team, email/password login, no public signup, and Kishimotovn administering connected repositories and assignments. Global settings plus repository overrides are required. Hosting and worker topology remain undecided.

## Table of Contents

- [Account onboarding](#account-onboarding)
- [Signup restriction](#signup-restriction)
- [Server identity and freshness](#server-identity-and-freshness)
- [Credentials and role authority](#credentials-and-role-authority)
- [DSH authorization limits](#dsh-authorization-limits)
- [Dev Note](#dev-note)

<a id="account-onboarding"></a>

## Account Onboarding

Account creation and email delivery are separate operations. Firebase's [user guide](https://firebase.google.com/docs/auth/web/manage-users) documents creating password-authenticated users in the console's Users tab and sending password-reset emails from the console. The reviewed guide does not document an Invite button or an automatic invitation email upon creation. Neither behavior was observed in a live console.

The [Admin SDK user-management API](https://firebase.google.com/docs/auth/admin/manage-users) supports `createUser`, including an optional password, `disabled`, and `emailVerified`. Email verification defaults to false. Administrative creation therefore does not prove mailbox ownership or record acceptance of an application invitation.

[`generatePasswordResetLink`](https://firebase.google.com/docs/auth/admin/email-action-links) requires an existing user's email and returns an action link; the application supplies its own email delivery service. Alternatively, `sendPasswordResetEmail` uses Google's template-based delivery. Continue URLs require an authorized domain. Email-link sign-in is a distinct flow that can create accounts, not the requested password login.

<a id="signup-restriction"></a>

## Signup Restriction

Hiding a form does not disable the documented [`accounts:signUp` REST endpoint](https://docs.cloud.google.com/identity-platform/docs/reference/rest/v1/accounts/signUp). The [configuration reference](https://docs.cloud.google.com/identity-platform/docs/reference/rest/v2/Config) defines `client.permissions.disabledUserSignup`: when true, end users cannot create accounts through any API method. `disabledUserDeletion` is an independent control.

The [Identity Platform user self-service guide](https://docs.cloud.google.com/identity-platform/docs/concepts-manage-users) explicitly permits administrator creation through the Admin SDK or Google Cloud console while end-user actions are disabled. It documents `auth/admin-restricted-operation` for refused Web operations. Administrative configuration uses [`projects.updateConfig`](https://docs.cloud.google.com/identity-platform/docs/reference/rest/v2/projects/updateConfig), an authenticated PATCH with `updateMask`; the required IAM permission is [`firebaseauth.configs.update`](https://docs.cloud.google.com/identity-platform/docs/access-control).

This is documented Identity Platform behavior. [Firebase Authentication with Identity Platform](https://firebase.google.com/docs/auth) is an optional product upgrade. Although Config enumerates both `FIREBASE_AUTH` and `IDENTITY_PLATFORM`, that enumeration alone does not establish availability of every setting on an unupgraded project. Project subtype, console availability, persisted configuration, and actual signup rejection were not inspected or tested.

An alternative is [blocking functions](https://firebase.google.com/docs/auth/extend-with-blocking-functions): `beforeUserCreated` or `beforeUserSignedIn` can reject requests. They require the Identity Platform upgrade; deploying Firebase functions requires [Blaze](https://firebase.google.com/docs/functions/get-started). They must respond within seven seconds, and anonymous/custom authentication does not trigger them. A valid Firebase identity still needs application membership; denying application access alone is not a prohibition on identity registration.

<a id="server-identity-and-freshness"></a>

## Server Identity and Freshness

For a custom backend, Firebase documents HTTPS transmission of an ID token followed by [`verifyIdToken`](https://firebase.google.com/docs/auth/admin/verify-id-tokens), checking signature, expiry, project audience, and issuer before trusting `uid`. A raw client-supplied UID, decoded-but-unverified JWT, or Admin SDK custom token is not that proof. Normal ID-token verification does not check revocation.

[ID tokens last one hour](https://firebase.google.com/docs/auth/admin/manage-sessions). Refresh tokens cease to be usable after deletion, disabling, or major account changes; `revokeRefreshTokens` supports administrative revocation, and password resets revoke automatically. `verifyIdToken(token, true)` checks revocation with an additional backend network request. Without that check, a signed JWT can remain acceptable until expiry even when refresh is blocked.

[Session cookies](https://firebase.google.com/docs/auth/admin/manage-cookies) exchange an ID token for a server-created cookie lasting five minutes to two weeks. Firebase documents CSRF protection, `httpOnly`/`secure` attributes, recent `auth_time` checks, and `verifySessionCookie(cookie, true)` to detect revocation and deleted/disabled users. Cookies retain the source token's claims and cannot authenticate directly to other Firebase services. Clearing one browser's cookie does not invalidate a stolen copy; revocation affects the user's other sessions too.

<a id="credentials-and-role-authority"></a>

## Credentials and Role Authority

The [Admin setup guide](https://firebase.google.com/docs/admin/setup) requires a trusted server environment and project configuration. It recommends Application Default Credentials (ADC) on Google-managed runtimes; exported service-account keys are a documented non-Google option, not an unavoidable requirement on Google infrastructure. Ordinary `gcloud` end-user ADC credentials have a Firebase Authentication limitation; its documented workaround uses a developer-owned OAuth client and explicit project ID.

[IAM](https://docs.cloud.google.com/identity-platform/docs/access-control) distinguishes user creation, lookup, updates, email actions, and cookie creation through `firebaseauth.users.create`, `get`, `update`, `sendEmail`, and `createSession`. Configuration modification is separate. A [Firebase browser API key](https://docs.cloud.google.com/identity-platform/docs/reference/rest/v1/accounts/signUp) identifies the project; it is not these administrative credentials.

[Custom claims](https://firebase.google.com/docs/auth/admin/custom-claims) are set from privileged Admin SDK code, limited to 1000 bytes, and overwritten by `setCustomUserClaims`. Updated values propagate in newly issued tokens, not retroactively in existing JWTs. Client-provided role fields are untrusted. A verified role claim is distinct from a current repository assignment; token refresh or revocation policy matters when roles change.

<a id="dsh-authorization-limits"></a>

## DSH Authorization Limits

Source inspection used base `c389f96bf3a9b6807cb71ed6bdad5849be0df6d8`, without running the application. [BrowserCookiePayload](../../packages/client/connection/src/browser-auth.ts#L27) contains version, authority, and timestamps, not UID or role. [BrowserAuth.authorizeIndex](../../packages/client/connection/src/browser-auth.ts#L240) exchanges a process launch token for a signed cookie. [Connection construction](../../packages/client/connection/src/index.ts#L117) installs this concrete implementation. This is shared deployment capability authentication, not individual email/password authentication.

[HostConnectionService.requestRejection](../../packages/client/connection/src/rpc-host.ts#L97) checks Host/Origin and the cookie. [RPC dispatch](../../packages/client/connection/src/rpc-host.ts#L247) passes endpoint, payload, and cancellation signal, not an authenticated caller. The [Gateway WebSocket upgrade](../../packages/api/gateway/src/index.ts#L214) uses the same rejection check. These inspected entry paths do not establish an invited user's repository permissions.

[WorkspaceFiles.confine](../../packages/api/workspace-files/src/index.ts#L341) checks filesystem containment. [SessionCommandController.attachment](../../packages/api/session-controller/src/commands.ts#L368) checks whether a Session log references an image. Neither check associates the requesting human with a repository. [SettingsController.write](../../packages/api/settings-controller/src/index.ts#L260) writes a namespace through its provider without a caller or repository parameter. Workspace filtering, agent scope, and secret redaction are not evidence of repository ACL enforcement.

[Firestore Security Rules](https://firebase.google.com/docs/firestore/security/rules-conditions) can authorize Firebase client data requests; server libraries bypass those rules and use IAM. They do not wrap DSH's HTTP handlers or worker execution. Authentication, database rules, and backend repository authorization therefore remain separate responsibilities, irrespective of the eventual membership database.

<a id="dev-note"></a>

## Dev Note

Recommendations below are unapproved. Prefer the documented signup-disable control over deploying blocking functions solely to reject all registrations. Keep a server-owned membership record keyed by verified UID and repository ACLs outside token claims. Bootstrap Kishimotovn's administrator authority explicitly; never infer it from a display name, claimed email, or first login.

- Same-origin option: Firebase password login plus revocation-checked session cookies, a Host authentication plugin, and explicit caller propagation into authorization checks. Connection needs adaptation; this is not an existing drop-in Firebase configuration.
- Separate-client option: verified ID tokens with explicit refresh and transport handling. Both options require current membership and repository checks before data/history reads, streams, files/uploads, exports, settings, and execution. Global settings and repository overrides need separately authorized read/write operations; override values cannot grant membership.

Administrator setup, if approved: select a project/product, enable email/password, disable other unwanted providers and client signup, configure authorized domains and reset-email delivery, and provision least-privilege server credentials. Create invited accounts, establish UID membership and assignments, and send reset actions separately. Optional-password creation plus a reset action avoids distributing a chosen password, but that complete initial-password flow requires live verification. No secret values are needed in research artifacts.

Unresolved choices include membership storage, invitation expiry/resending, mailbox verification, role freshness, offboarding and active-stream/job termination, session sharing, administrator recovery, and repository/global settings write policy. Backend/worker topology remains open. Membership and session-sharing decisions belong to the human decision ticket, not this report.

Not executed: project/console inspection or provisioning; IAM/ADC setup; account creation, signup attempts, blocking-function deployment, action-link generation/delivery/redemption, password changes, token/cookie verification, revocation/disabled-user checks, claim assignment, or cross-repository authorization tests. No application launch, model API calls, builds, full tests, benchmarks, workload sizing, or budget modeling occurred. No credentials were requested or collected. Documentation checks cannot establish deployed security.
