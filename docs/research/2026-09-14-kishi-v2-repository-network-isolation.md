---
description: "Research reference for repository network isolation and authorized previews on one shared Kishi/DSH Ubuntu Droplet."
---

# Kishi V2 Repository Network Isolation

## Summary

Per-repository UIDs do not separate localhost networking. The smallest maintained candidate identified here combines Linux network namespaces, iproute2, systemd lifecycle management, and host-owned nftables filtering around both native repository processes and rootless Docker. Authorized previews additionally need a trusted namespace-aware connector and separation from Kishi's trusted browser origin. This answers [Research repository network isolation and authorized preview access](https://github.com/Kishimotovn/kishi-harness/issues/21), not an approved arrangement or a working deployment recipe; Docker startup integration, complete launch-path confinement, and preview authorization remain unverified.

## Table of Contents

- [Verified Starting Point](#verified-starting-point)
- [Mechanism Comparison](#mechanism-comparison)
- [Integration Findings](#integration-findings)
- [Primary Sources](#primary-sources)
- [Dev Note](#dev-note)

## Verified Starting Point

The supplied [Linux proof record](https://github.com/Kishimotovn/kishi-harness/issues/12#issuecomment-5655055796) reports 37 top-level passes and two failures: each repository UID fetched the other's localhost HTTP service. File, symlink, PTY, other-daemon Unix-socket, container bind-read, and process-signalling denials passed, as did own writes and cancellation. The reboot check reports 12 passes. These were dummy repository applications, not separate Kishi instances or integrated DSH providers. The record reports all test cloud resources deleted; this session neither rechecked cloud state nor provisioned resources.

The fixed scope is one native Kishi/DSH Host and web UI on one Ubuntu 24.04 DigitalOcean Droplet. The accepted isolation candidate retains distinct unprivileged repository UIDs/private homes, a separate Host UID, rootless Docker per repository, and the sandbox. Approved surrounding requirements remain unchanged: Host-verified caller/repository authorization, file-backed DSH domains plus Session logs, GitHub App-authenticated direct REST/GraphQL Host tools rather than runtime `gh`, and a separate credentialed Git path. Models and enabled sets stay stable per Session; defaults affect new Sessions/subagents, while authorization is checked on every use. Administrative setup stays outside nontechnical users' chats.

## Mechanism Comparison

Documented mechanisms establish what Linux can enforce. Security inferences below explain their fit to this scope, not measured protection in Kishi.

### UID Firewall

The [nftables manual](https://netfilter.org/projects/nftables/manpage.html) defines `meta skuid` as the UID associated with the originating socket. Host-owned output rules can therefore restrict native sockets and rootless networking helpers whose sockets carry the repository UID. They do not automatically identify the destination listener's repository.

Security inference: UID rules could close the measured HTTP leak, but preserving arbitrary own-app localhost access requires trusted port allocation and binding controls in a shared port space. An allowed destination can otherwise belong to a different process. Forwarded packets need forwarding policy, not an assumed originating UID; Docker driver changes can change that path. A shared daemon running under the Host UID also erases repository attribution from socket ownership. Firewall-only isolation is a possible constrained alternative, not equivalent to private loopback and port namespaces.

### Repository Namespace

[network_namespaces(7)](https://man7.org/linux/man-pages/man7/network_namespaces.7.html) documents separate IPv4/IPv6 stacks, ports, routes, firewall rules, devices, and abstract Unix sockets. A veth pair connects namespaces. [ip-netns(8)](https://man7.org/linux/man-pages/man8/ip-netns.8.html) documents parent-to-child network-namespace inheritance.

Security inference: putting every repository execution path behind one repository namespace separates localhost without maintaining per-application port ownership across repositories. Native processes and the rootless launcher can share that outer network context; Docker's inner networks do not replace it. Controlled routing supplies package-download egress, while a trusted connector supplies preview access. This covers the requested execution classes with maintained OS components, subject to the integration gaps below.

### Containers Only

Container networks leave native terminals, PTYs, and background processes outside their protection. Docker's [current troubleshooting documentation](https://docs.docker.com/engine/security/rootless/troubleshoot/) also distinguishes versions: before Engine 29.5, rootless `--net=host` remained inside RootlessKit; from 29.5 it can share the host network namespace and bypass the user-mode stack. Rootless status alone is therefore no localhost-isolation guarantee.

For the proposed nesting, proof must establish that Docker's host-network target is the repository's outer namespace, never the Droplet's initial namespace. Port publishing and networking helpers need the same verification. Docker documents that inspected container IPs remain inside RootlessKit and that published-port source IP propagation depends on versions/settings; neither is repository identity.

## Integration Findings

These findings identify documented OS constraints and inspected source behavior. They are not live Cordis queries or product acceptance results.

### Launch Ownership

[systemd.exec](https://man7.org/linux/man-pages/man5/systemd.exec.5.html) documents `PrivateNetwork=` as creating only loopback. Alone, it cannot reach package registries: interfaces, routes, DNS, and filtering must be supplied separately. `NetworkNamespacePath=` joins an existing namespace whose handle must be valid when systemd forks the process; it overrides `PrivateNetwork=`. This is not documentation of a mutable per-exec repository selector in an existing user service.

The retrieved upstream manual permits these settings for system services and describes per-user support with implicit `PrivateUsers=` and unprivileged-user-namespace prerequisites. However, [setns(2)](https://man7.org/linux/man-pages/man2/setns.2.html) requires `CAP_SYS_ADMIN` in both the caller's user namespace and the user namespace owning the target network namespace. Security inference: private-user-namespace capabilities do not authorize an ordinary repository user manager to join a namespace owned by the initial user namespace. A trusted supervisor must enter it before dropping privileges. Namespace switching affects the calling thread, so it must not occur on the shared Node Host's execution thread.

Docker's [rootless tips](https://docs.docker.com/engine/security/rootless/tips/) recommend a per-user systemd service and explicitly reject a system-wide Docker service even with `User=`. Confining the repository's entire user-manager launch, with its Docker user service inheriting the namespace, is an integration candidate, not a verified configuration. All RootlessKit parent/port/egress helpers must inherit it too. The documented direct-launch alternative does not establish equivalent lifecycle/resource behavior; Docker resource flags require cgroup v2 and systemd. Ubuntu 24.04's AppArmor restrictions on unprivileged user namespaces also require validation without globally weakening the sandbox.

### DSH Providers

Source inspection is pinned to `086b6546384f9b41e8dc271f90b767126f7491a2` (rc.2). The [creator preset](../../packages/preset/agent-presets/presets/cordis/agent.cordis.yml) and [composition guidance](../../packages/preset/agent-presets/presets/cordis/skills/editing-cordis-compositions/SKILL.md) place shared registries, filesystem policy, sandbox, and providers on the Host. Repository isolation belongs in paired Service Providers and authorized Consumers, not an agent-loop workflow rewrite; terminology follows the [glossary](../glossary.md).

The [filesystem Service Definition](../../packages/fs/fs/src/index.ts) exposes one execution world; `resolve` accepts cwd/cancellation, while reads and listings accept targets, not a verified repository principal. Mutation-policy actors are not a universal read authorization input. The [local provider](../../packages/fs/fs-local/src/index.ts) treats cwd as resolution, not containment, and uses [Host Node filesystem operations](../../packages/fs/fs-local/src/fsio.ts). A shell-only UID switch cannot isolate these tool reads.

The [subprocess specs](../../packages/subprocess/subprocess/src/types.ts) carry argv, cwd, environment, stdio/terminal dimensions, grace, and cancellation, but no UID, namespace, or verified repository identity. The [Linux launcher](../../packages/subprocess/subprocess-local/src/linux-scope.ts) uses current-user `systemd-run --user --scope`; the [local provider](../../packages/subprocess/subprocess-local/src/index.ts) can fall back to weaker process-tree containment. Neither establishes repository network isolation.

Required integration remains: bind Host-verified repository identity consistently across filesystem resolution/I/O, executable lookup, ordinary spawn, and terminal spawn; preserve target identity, atomic edits, streams, and cancellation; route background/LSP/container ownership accordingly. Existing [subprocess handles](../../packages/subprocess/subprocess/src/index.ts) distinguish command completion from managed-range quiescence, but a Docker-created workload is not automatically in the CLI command's range. Isolation failure must block repository admission rather than inherit the local fallback.

### Browser and Preview Controls

[MDN's same-origin policy](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Same-origin_policy) defines an origin by scheme, host, and port, not path. Serving repository JavaScript under a different path on Kishi's origin does not isolate it from the trusted application. [Cookie rules](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie) are different: cookies do not isolate ports, and a `Domain` attribute can include subdomains. `HttpOnly` prevents script reads but does not prevent requests from carrying the cookie. [OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html) explains that sibling subdomains remain same-site, so SameSite alone is insufficient against an untrusted sibling preview.

Security inference: keep preview pages off Kishi's origin and preferably off its registrable domain. Use host-bound authorization cookies, no parent-domain authentication cookies, strict request-origin checks where applicable, and no blanket credentialed CORS for preview domains. A separate hostname for each preview avoids shared DOM/storage/service-worker authority between previews, but sibling previews still need CSRF protection. New tabs avoid relying on third-party iframe cookies; an embedded experience requires separate browser compatibility evidence. Neither arrangement makes repository-authored pages trusted.

[OWASP's SSRF guidance](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html) warns against accepting complete destination URLs and covers redirects, DNS, and IPv4/IPv6 validation. Preview routing must resolve a Host-owned repository/namespace/port registration, not a caller-supplied upstream. [Caddy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy) supplies reverse proxying, authentication pre-checks, and WebSocket tunnels, but passes most incoming headers upstream by default. Strip gateway/Host authorization material before the app receives a request, reserve authentication-cookie names, and constrain application response headers. These are integration obligations, not guarantees obtained by installing a proxy.

[OWASP's WebSocket guidance](https://cheatsheetseries.owasp.org/cheatsheets/WebSocket_Security_Cheat_Sheet.html) requires handshake-origin validation and active connection closure on logout or session invalidation. A one-time authentication pre-check cannot revoke an existing WebSocket or long HTTP stream. The trusted preview owner must track current membership, preview lifetime, and open connections; cached authorization and reconnects cannot preserve revoked access. Delivered bytes and browser-cached content cannot be retracted. Repository code with public egress can still reach a public preview hostname, so its gateway must reject requests lacking authorized member access.

## Primary Sources

Sixteen primary documents were fetched on 2026-09-14. Systemd entries are upstream-authored manuals mirrored by man7, identifying themselves as `262~devel`; they are not Ubuntu 24.04 version verification.

1. [network_namespaces(7)](https://man7.org/linux/man-pages/man7/network_namespaces.7.html): isolated resources and veth.
2. [namespaces(7)](https://man7.org/linux/man-pages/man7/namespaces.7.html): namespace handles and lifetime.
3. [setns(2)](https://man7.org/linux/man-pages/man2/setns.2.html): thread entry and privileges.
4. [ip-netns(8)](https://man7.org/linux/man-pages/man8/ip-netns.8.html): inheritance, naming, configuration, deletion.
5. [systemd.exec(5)](https://man7.org/linux/man-pages/man5/systemd.exec.5.html): namespace and execution settings.
6. [systemd.resource-control(5)](https://man7.org/linux/man-pages/man5/systemd.resource-control.5.html): cgroups, delegation, network controls.
7. [Docker rootless tips](https://docs.docker.com/engine/security/rootless/tips/): daemon lifecycle and cgroups.
8. [Docker rootless troubleshooting](https://docs.docker.com/engine/security/rootless/troubleshoot/): Ubuntu restrictions and networking/version limitations.
9. [nftables manual](https://netfilter.org/projects/nftables/manpage.html): socket identity, hooks, filtering, NAT.
10. [DigitalOcean metadata documentation](https://docs.digitalocean.com/products/droplets/how-to/retrieve-droplet-metadata/): metadata address and exposed fields.
11. [MDN same-origin policy](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Same-origin_policy): scheme/host/port separation.
12. [MDN Set-Cookie](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie): Domain, HttpOnly, SameSite, and cookie prefixes.
13. [OWASP CSRF prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html): same-site and cross-origin distinctions.
14. [OWASP SSRF prevention](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html): destination, redirect, and DNS validation.
15. [OWASP WebSocket security](https://cheatsheetseries.owasp.org/cheatsheets/WebSocket_Security_Cheat_Sheet.html): origin checks and connection authorization lifetime.
16. [Caddy reverse proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy): proxying, authentication pre-checks, header forwarding, and WebSockets.

## Dev Note

The following proposal, product questions, and proof requirements are non-authoritative. No candidate approval or implementation follows from this report.

### Proposed Arrangement

Retain one Host/web UI. A narrowly authorized, operator-owned supervisor maps trusted repository IDs to fixed UIDs, homes, namespace handles, and lifecycle owners. It accepts no repository-supplied root command, UID, namespace path, or host Docker socket selection. Privileged setup joins the namespace before executing repository-controlled code as its unprivileged UID; unnecessary capabilities and inherited descriptors are removed. Rootless UID-mapping helpers must remain compatible with the retained sandbox, not receive blanket exemptions.

Give each repository a distinct routed veth path, not a shared unrestricted bridge. Keep authorization filtering in the host namespace, outside repository-controlled Docker namespaces. Bind rules to trusted ingress interfaces and validated source addresses; cover host-local input and forwarded traffic. Deny other repositories, Host management/private services, VPC/private/link-local destinations, and the Droplet's public-address return paths unless explicitly required. [DigitalOcean documents](https://docs.digitalocean.com/products/droplets/how-to/retrieve-droplet-metadata/) metadata at `169.254.169.254`, including user-data: deny it. Supply controlled DNS and selected public egress. Filter IPv6 equally or block it explicitly. NAT provides address translation, not authorization.

### Bypass Risks

UID alone does not force namespace membership. SSH sessions, cron/at, user-manager activation, D-Bus services, or another daemon can spawn outside a confined caller's ancestry. Disable repository-account alternate entry paths or demonstrably route each through the same trusted launcher. Confining only DSH's immediate children is insufficient.

Network namespaces do not hide filesystem Unix sockets; systemd also warns that read-only paths do not prevent socket communication. Protect Host/other-repository daemon and manager sockets, broker IPC, namespace handles, and inherited connected sockets. Host-side fetch/credentialed tools need independent repository/destination checks or they become bypass proxies.

[Cgroup delegation](https://man7.org/linux/man-pages/man5/systemd.resource-control.5.html) assigns only a subtree to the delegatee; keep the containing owner and limits outside repository control. Kernel namespaces share the kernel and do not protect against Host/root compromise. Arbitrary public HTTPS egress permits exfiltration and external relays between cooperating workloads; private-address denial is not complete information-flow isolation.

### Preview Integration

Proposed: authorize the current caller against the current repository on HTTP requests and WebSocket upgrades. Bind each preview to a server-owned repository, namespace generation, approved port, and protocol; never accept an arbitrary URL or namespace selector. A trusted connector opens the application connection inside that namespace, including repository-local loopback, without globally publishing the port.

Use separate, non-recycled preview hostnames on a registrable domain distinct from trusted Kishi, with top-level authenticated launch as the first candidate. Do not pass Kishi/Firebase tokens or gateway authorization cookies to the app. A scoped browser launch exchange, app-cookie handling, CSRF/origin policy, and authentication-cache behavior need explicit design and tests; no working protocol is claimed here. Track HTTP streams and WebSockets so revocation, repository closure, expiry, and namespace replacement terminate access, not merely new handshakes. There remains one shared Kishi application, not one application instance per repository. Preview apps may visually imitate a login page; separation cannot prevent phishing or retract already delivered data.

### Product Choices

- Public egress breadth: arbitrary package registries/CDNs or an administered destination policy, including DNS and private-registry exceptions?
- IPv6: supported with equivalent controls initially, or explicitly unavailable?
- Preview access: private assigned members only or another audience; new tabs or embedded views; permission to require a separate preview domain?
- Preview lifetime: which authorized members can publish, which ports/protocols qualify, and does availability outlive a Session or work item? Which app-cookie and service-worker behavior is required?
- Recovery: when may repository applications restart, and what closure/revocation deadline must terminate existing connections and work?

### Future Linux Proof

A future disposable proof requires separate authorization for its resources, cost, lifetime, and cleanup. Record exact Ubuntu/kernel/systemd/Docker/RootlessKit versions and drivers. Require these observable results:

- Two repository UIDs can use the same localhost port independently; neither native nor container workloads reach the other's service, Host listeners, metadata, private networks, or denied IPv6 destinations. Own package/image downloads and own-app access succeed.
- Pipes, PTYs, background work, user services, rootless helpers, port publishing, and Engine 29.5+ host networking remain confined. Exercise alternate launch paths, forged broker selections, inherited sockets, and the retained file/symlink/signalling denials through integrated DSH providers.
- Reboot recreates namespace/routing/firewall state before repository admission and Docker startup. [Namespace handles](https://man7.org/linux/man-pages/man7/namespaces.7.html) pin live kernel objects, not reboot-persistent configuration. Recheck current authorization before reopening previews.
- Closure denies new work, closes HTTP/WebSockets, stops the repository manager/daemon/workloads, awaits empty owned ranges, then releases handles and networking. [Deleting a namespace name](https://man7.org/linux/man-pages/man8/ip-netns.8.html) does not kill surviving processes. Verify crash/restart, port/name reuse, and bounded cancellation without affecting the other repository.
- Browser and direct-HTTP tests deny cross-repository previews, reject forged upstreams and authentication cookies, and keep Kishi credentials out of app requests. Exercise Origin/CSRF rules, redirects, DNS rebinding, namespace-generation reuse, revoked WebSockets/reconnects, and app storage/cookie behavior on the chosen preview domain.
- Negative controls demonstrate that the proof detects missing isolation/filtering. Pin upgrade-sensitive Docker behavior; a successful synthetic run is not comprehensive security assurance.

### Verification Limits

Research evidence comprises repository-source inspection and primary documentation. Freedesktop's latest and version-255 manual URLs returned HTTP 418; upstream-authored man7 mirrors supplied the systemd evidence. Ubuntu's exact manager behavior, nested rootless startup, complete egress enforcement, and browser isolation remain unverified. Repository documentation/build checks validate the report and its source references, not the proposed isolation mechanism. No new VM, container, cloud resource, application model call, isolation experiment, or preview integration test was run for this research. The research issue records the final validation commands and published report revision.
