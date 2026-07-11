# SEC-001 Server Authentication Design

Task: `SEC-001-PREP`  
Branch inspected: `enterprise-v1-lock`  
Status: read-only security audit and design; no application, middleware, route, rule, package, environment, deployment, or capability-status change.

## Scope and evidence boundary

This audit inspected the governing documents, `middleware.ts`, both auth components, active layouts, login and registration pages, Firebase client/Admin initialization, every `app/api/**/route.ts`, Stripe/worker/report/analyze/debug/cron paths, environment variable names, Vercel cron configuration, tenant-bootstrap boundary, and production Firestore/Storage rules. Facts not evidenced in the repository are marked **UNKNOWN**. Secret values were not copied into this document.

The root layout wraps all rendered pages in the client `AuthGuard`. The middleware matcher covers dashboard, applications, borrowers, underwriters, settings, and admin, but its authentication condition is hard-coded `true`; all `/api` paths are explicitly passed through. Therefore protected pages currently depend on post-hydration Firebase client state, and API routes receive no identity from either guard or middleware.

## A. Current authentication risk map

| Surface | Current state | Risk | Minimum disposition |
|---|---|---|---|
| Browser pages | Root layout client `AuthGuard` observes Firebase Auth and redirects after hydration | Direct navigation reaches the server without verified identity; guard is UX, not server enforcement | Establish an HttpOnly Firebase session cookie; use middleware only as an early presence/shape gate and verify in server boundaries |
| Middleware | API bypass; `isLoggedIn = true`; public paths refer to `/login` and `/register` while actual paths are `/auth/...` | False security boundary and inconsistent route model | Replace incrementally after session exchange exists; never make middleware authoritative |
| APIs | No route verifies Firebase ID token or session cookie | UI bypass gives direct anonymous access to user operations | Central `requireUserAuth()` on every user route |
| Firebase Admin | Worker and debug routes use Admin SDK, which bypasses rules | A route-auth defect becomes unrestricted database/storage authority | Central server-only Admin initialization and verified user/service boundary before Admin access |
| Worker secret | Shared `x-worker-secret`; AI worker fails if missing, files worker does not | Files worker accepts an absent header when its configured secret is also absent | Fail closed on missing secret; replace shared secret with named service authentication and constant-time comparison/managed credentials |
| Debug runner | Public GET uses server-held worker secret to call worker/debug endpoints | Anonymous caller can trigger privileged processing | Disable in production; authenticated platform diagnostic only in non-production if retained |
| Debug overlay | Demo token or worker secret protects Admin writes | Demo credential and worker credential are conflated with configuration authority | Disable in production; separate internal diagnostic/service principal and explicit configuration capability |
| Cron | Bearer secret plus query-string fallback | Query secrets leak through URLs/logs/history; shared secret has broad replay scope | Bearer-only Vercel cron verification, no query fallback, rotation and audit |
| Stripe checkout/portal | Public POST; portal uses one environment customer | Anyone can create sessions; portal can expose/manage the configured customer's billing | Require user session, tenant billing permission, and server-owned tenant/customer mapping |
| Analyze | Public POST accepts arbitrary remote URL and processes document bytes | Anonymous SSRF/resource abuse and PII processing; caller-supplied application ID is untrusted | User auth, tenant/application authorization, canonical Storage reference, URL allowlist/removal |
| Report | Public POST accepts caller payload and renders PDF | Anonymous compute/PII exposure; no application ownership proof | User auth, tenant/application permission, canonical persisted package |
| Client Firebase rules | Signed-in global application/storage access; user may update own role field | Authentication does not provide tenant isolation; self-role escalation | SEC-002 rule and data-model cutover; do not weaken current rules meanwhile |
| Registration | Public Firebase Auth registration creates default processor profile; UI suggests later role change | Public account creation and user-writable role do not establish authorized tenant membership | Product approval needed for registration disposition; membership remains server-controlled |
| Session/revocation | No cookie exchange, token verification, or revocation check found | Disabled/revoked users can reach APIs because APIs do not authenticate | Central verification with revocation checks and server membership/status checks |
| Tenant bootstrap | Server-only executor accepts a pre-verified authorization object but has no production caller | Correctly not public, but prerequisite verifier/authority source is absent | Keep unreachable until SEC-001/SEC-002 gates pass |

Routes depending only on client-side `AuthGuard` are all non-public rendered routes under the root layout, including `/dashboard`, `/applications`, `/applications/[id]`, `/applications/new`, `/borrowers`, `/queue`, `/underwriters`, `/settings`, `/admin`, `/upload`, `/firebase-test`, and `/debug`. The root `/` and `/auth/**` are considered public by the guard. Exact intended disposition of `/upload`, `/firebase-test`, and page `/debug` is **UNKNOWN**.

## B. API route inventory

| Path | Purpose / class | Current authentication | Required authentication | Tenant requirement | Role/service requirement | Current risk | Recommended action |
|---|---|---|---|---|---|---|---|
| `POST /api/ai-scan` | Dummy scan; debug/placeholder | None | None only if deleted; otherwise non-production diagnostic auth | None established | Platform diagnostic | Public dummy favorable mortgage-like output | Delete or return production-disabled response; do not expose as product behavior |
| `POST /api/ai/scan` | Duplicate dummy scan; debug/placeholder | None | Same as above | None established | Platform diagnostic | Same, plus competing route | Delete/isolate with `/api/ai-scan` disposition |
| `POST /api/applications/{id}/analyze` | User-initiated document analysis | None | Verified user session/bearer | Derive application tenant from database; active membership; reject unresolved legacy | Approved application-analysis permission; exact role matrix **UNKNOWN** | Critical anonymous URL fetch, OCR, PII and resource access | Authenticate first, authorize canonical application, accept canonical object reference rather than arbitrary URL |
| `POST /api/applications/{id}/report` | User-initiated PDF report | None | Verified user session/bearer | Same-tenant application and persisted decision package | Approved report-generation permission; exact roles **UNKNOWN** | Anonymous PII/compute; trusts request payload | Authenticate/authorize and generate from canonical persisted package |
| `GET, POST /api/cron/tick` | Cron-only orchestrator | `CRON_SECRET` bearer or query parameter; then sends worker secret | Named cron principal; Vercel bearer signature/secret at minimum | Global scheduling allowed, but each unit must be tenant-authorized by worker | `cron.tick` capability only | Query secret leakage and broad shared-secret chaining | Remove query fallback; bearer-only; correlation and audit; workers re-authorize each claim |
| `GET /api/debug/run` | Debug-only orchestration | None | Disabled in production; otherwise verified platform diagnostic principal | No tenant scope implemented | Narrow diagnostic capability | Critical: anonymous caller causes server to use worker secret | Disable immediately in production; never expose worker credential through a public trigger |
| `GET, POST /api/debug/overlay/from-storage` | Debug configuration read/write using Admin | `DEMO_TOKEN` query or worker secret header | Disabled in production; otherwise named internal service/platform admin | Configuration tenant ownership required; currently absent | Explicit config-debug capability | Admin SDK write path protected by demo/shared secret; tenant ambiguity | Disable in production; migrate only if governed configuration operation is approved |
| `POST /api/stripe/checkout` | User-initiated billing checkout | None | Verified user | Server-derived active tenant | Tenant billing-management permission; exact role **UNKNOWN** | Public session creation; no customer/tenant binding | Require user, membership, permission and server billing mapping |
| `POST /api/stripe/portal` | User-initiated billing portal | None | Verified user | Server-derived active tenant and its Stripe customer | Tenant billing-management permission | Critical fixed test customer portal | Keep unavailable until tenant/customer mapping exists; never accept customer ID from client |
| `GET /api/worker/files/process` | Worker status/description; currently ambiguous | None | Remove or non-sensitive authenticated health endpoint | None currently | Operations health capability | Publicly reveals worker shape; GET and POST share path semantics | Remove or move to authenticated operations health surface |
| `POST /api/worker/files/process` | Internal files worker; Admin Firestore/Storage | Shared worker header; missing configured secret can authenticate missing header | Named internal service identity | Each claimed application's immutable tenant; unresolved legacy rejected | `worker.files.process` and scoped tenant/global scheduler authority | Critical empty-secret fail-open plus Admin bypass | Fix fail-closed first; later use service principal/managed credential and per-job authorization |
| `POST /api/worker/ai/process` | Internal rules worker; Admin Firestore | Shared worker header; correctly fails when secret missing | Named internal service identity | Each claimed application's immutable tenant/config match | `worker.ai.process` | Shared replayable credential and global scans; errors expose details | Named service auth, constant-time verification, per-job tenant/config authorization, safe errors |

No Stripe webhook route exists. No Encompass webhook route exists. Their current implementation and provider verification details are **UNKNOWN**.

Every API route except cron, worker POSTs, and debug overlay currently has no server-verified identity. Routes using Firebase Admin are both worker POSTs and debug overlay; none authenticates a Firebase user. Workers use a shared secret, and debug overlay uses a demo/worker secret. The tenant-bootstrap executor is server-only but not exposed by a route.

## C. Recommended browser authentication model

Use Firebase Authentication as the identity provider and an HttpOnly, `Secure`, `SameSite=Lax`, host-only session cookie as the canonical browser-navigation credential. After Firebase client login or registration, the browser sends a fresh Firebase ID token to a narrowly scoped session-exchange endpoint over HTTPS. The endpoint verifies the ID token with revocation checking, applies account eligibility policy, creates a bounded Firebase session cookie, and returns no token. Logout clears the cookie server-side and should revoke sessions when policy requires.

The client SDK may remain for direct Firebase access during incremental migration, but its local state is presentation state only. It never establishes server identity, tenant, role, or authority. Protected server-rendered navigation verifies the session cookie before returning protected data. The client guard may remain temporarily for loading/redirect UX.

Session lifetime, idle timeout, absolute timeout, reauthentication requirements, MFA policy, multi-device policy, and public-registration policy require Quinton approval. Recommended initial maximum session duration is bounded and materially shorter for privileged administration, but the exact duration is a policy decision and is therefore **UNKNOWN**.

## D. Recommended API authentication model

Use both Firebase session cookies and Firebase ID-token bearer authentication behind one canonical verifier:

1. Same-origin browser API requests use the session cookie by default, plus CSRF protection for state-changing requests.
2. Transitional browser clients may send `Authorization: Bearer <Firebase ID token>` until session exchange is universally wired.
3. The verifier accepts exactly one credential class, rejects conflicting cookie/bearer identities, verifies signature/audience/issuer/expiry and revocation, and produces `ServerAuthContext`.
4. User routes then resolve tenant membership and permission separately. Authentication success never implies authorization.
5. Internal service, cron, and webhook routes use distinct authenticators and principal kinds; they never masquerade as Firebase users.

CSRF defense should combine `SameSite=Lax`, Origin/Host validation, and an unpredictable CSRF token for cookie-authenticated mutations. Bearer-authenticated requests are not exempt from Origin/input controls when invoked from browsers.

## E. Recommended Firebase Admin verification boundary

Create server-only modules with no client exports:

- Admin app initialization and credential validation;
- Firebase ID-token verification;
- Firebase session-cookie creation/verification/revocation;
- `requireUserAuth`, `requireServiceAuth`, `requireCronAuth`, and webhook verifiers;
- tenant membership/authorization resolution;
- audit and safe error mapping.

No route may call `initAdmin()` or use Admin Firestore/Storage before its required authenticator succeeds. Admin initialization must not log credentials and should use platform-provided application-default credentials where supported; explicit service-account variables remain a bounded fallback. Import-graph regression tests must prove these modules are unreachable from client components.

## F. Session-cookie and bearer-token strategy

The canonical bounded approach is **both**, with strict purpose separation:

| Caller | Credential | Reason |
|---|---|---|
| Browser navigation/server components | Firebase session cookie | HttpOnly credential supports server rendering and cannot be read by injected JavaScript |
| Same-origin browser API | Session cookie + CSRF; bearer temporarily supported | Consistent server session; incremental compatibility |
| Native/approved API client | Firebase ID token bearer if explicitly supported | No browser cookie dependency; token remains short-lived |
| Internal worker | Named service credential or platform workload identity | User tokens must not represent machines |
| Vercel cron | Dedicated bearer secret initially; managed scheduler identity when available | Narrow scheduler principal and capability |
| Stripe webhook | Stripe signature over raw body | Provider authenticity, timestamp tolerance and replay control |
| Future Encompass webhook | Provider-supported signature/mTLS/OAuth client identity | Exact mechanism is **UNKNOWN** pending Encompass contract |

Revocation: call Firebase Admin verification with revocation checking for session creation, every privileged request, and every request after a short bounded verification cache. A cache may only cache successful `(uid, token/session issue time, auth-time, revocation/version)` results briefly and must be invalidated by user disablement, token revocation, membership revocation/version, tenant suspension, or security incident. High-risk actions should bypass the cache. Firebase user `disabled` state and token `tokensValidAfterTime` must fail closed. Membership and tenant status are checked on every authorized operation or via a separately bounded versioned cache.

## G. Internal worker and cron authentication strategy

Define service principals independently from tenant members. Each context contains principal ID, credential/version, capabilities, allowed tenants or approved global-scheduler scope, request/correlation ID, and verification source. Workers may scan globally only when explicitly granted scheduler scope; each claim transaction must re-read application tenant, tenant status, service permission, stage, lease, configuration ownership, and Storage path.

Immediate incremental hardening:

- make both workers fail closed when the expected secret is missing;
- use constant-time comparison;
- remove alternate legacy secret names after migration;
- never put secrets in query strings;
- give cron and each worker different secrets;
- rotate/version credentials and audit use;
- restrict GET health output;
- propagate one correlation ID from cron to worker calls.

Longer term, prefer hosting-provider workload identity or signed short-lived service tokens over permanent shared strings. Exact Vercel-supported workload identity in the target deployment is **UNKNOWN**.

## H. Stripe and external webhook authentication strategy

Checkout and portal are user-initiated commands: verify user session, resolve tenant membership, require billing permission, and derive Stripe customer/price entitlement server-side. Stripe publishable keys are public configuration; secret keys remain server-only.

Stripe webhooks, when added, must read the unmodified raw request body, verify `Stripe-Signature` using an environment-specific webhook secret and tolerance, deduplicate event IDs, map the Stripe customer to exactly one tenant, enforce test/live separation, persist a safe audit record, and process retries idempotently. A webhook is never authenticated by browser session or tenant ID in payload alone.

Future Encompass webhooks require an approved provider contract covering signature algorithm or mTLS/OAuth, timestamp/replay rules, source/environment binding, tenant/integration mapping, secret rotation, idempotency, retention, and audit. Until specified, the route must not exist publicly.

## I. Canonical `ServerAuthContext` contract

```ts
type ServerAuthContextV1 = Readonly<{
  schemaVersion: "server-auth-context.v1";
  principal:
    | Readonly<{
        kind: "firebase_user";
        uid: UserId;
        authenticationMethod: "session_cookie" | "id_token";
        tokenIssuedAt: IsoTimestamp;
        authenticatedAt: IsoTimestamp;
        emailVerified: boolean;
      }>
    | Readonly<{
        kind: "service" | "cron" | "external_webhook";
        principalId: string;
        authenticationMethod: string;
        credentialVersion?: string;
      }>;
  verifiedAt: IsoTimestamp;
  revocationCheckedAt?: IsoTimestamp;
  requestId: string;
  correlationId: string;
}>;
```

This contract contains authenticated identity only. It contains no client-supplied role or tenant. A separate `AuthorizationContextV1` is produced after resolving the authoritative active tenant and membership. For users it binds Firebase UID to `/tenants/{tenantId}/members/{uid}`, status, role and permitted scope. For services it binds the service principal to explicit capabilities and tenant/global scope. Material successes and denials emit immutable, PII-minimized audit events referencing opaque user/service, tenant, action, target and correlation IDs.

Whether email verification is mandatory for all Velocity access is **UNKNOWN** and requires approval. Email is not authorization and should generally not be copied into auth logs/context unless required.

## J. Error and correlation-ID model

Return stable JSON envelopes, for example:

```json
{"ok":false,"error":{"code":"AUTH_REQUIRED","message":"Authentication is required.","requestId":"req_..."}}
```

Use stable codes: `AUTH_REQUIRED` (401), `AUTH_INVALID` (401), `AUTH_REVOKED` (401), `ACCOUNT_DISABLED` (403), `TENANT_CONTEXT_REQUIRED` (403), `MEMBERSHIP_INACTIVE` (403), `FORBIDDEN` (403), `CSRF_INVALID` (403), `RATE_LIMITED` (429), and `INTERNAL_ERROR` (500). Do not reveal whether another tenant, application, membership, customer, or email exists. Do not return stacks, Firebase/Stripe raw errors, token fragments, document text, or secret configuration state.

Accept a syntactically valid inbound `x-correlation-id` only from trusted internal callers; otherwise generate a cryptographically random request ID and correlation ID. Echo request ID in response headers/body. Propagate correlation ID through cron, worker, Stripe, report and audit operations. IDs are opaque, bounded, log-safe, and never derived from PII. External callers cannot choose audit identity by choosing an ID.

## K. Environment and secret requirements

Required categories, separated by environment:

- Firebase client public configuration: existing `NEXT_PUBLIC_FIREBASE_*` values;
- Firebase Admin: project ID, storage bucket, and application-default credential or existing server-only client email/private key;
- session: canonical cookie name, allowed origins/base URL, CSRF signing/randomness policy, and session duration policy;
- services: distinct versioned credentials for cron, files worker, AI worker, and any diagnostic service until workload identity replaces them;
- Stripe: secret API key, publishable key, approved price identifiers, and future webhook signing secret;
- external integrations: one environment-specific secret/certificate/client credential per integration;
- operational: environment name, trusted origins/hosts, log redaction mode, and optional key/version identifiers.

Production secrets must be stored in the deployment secret manager, never `NEXT_PUBLIC_*`, source control, client bundles, URLs, logs or error bodies. The repository contains local environment files with credential-shaped values; whether any are active, committed historically, or already rotated is **UNKNOWN**. Quinton/security operations must verify source-control history and rotate any exposed live credential.

## L. Debug/placeholder route disposition

| Route/surface | Disposition |
|---|---|
| `/api/ai-scan`, `/api/ai/scan` | Delete or compile-time disable in production; they return fabricated favorable findings and are not an approved diagnostic contract |
| `/api/debug/run` | Disable in production immediately; public invocation of server-held worker credentials is unacceptable |
| `/api/debug/overlay/from-storage` | Disable in production; retain only behind explicit non-production flag plus named diagnostic principal if still required |
| `/debug` page | Intended use **UNKNOWN**; remove from production navigation/exposure or require platform diagnostic authorization |
| `/firebase-test` page | Intended use **UNKNOWN**; disable in production unless approved operational purpose exists |
| files-worker GET | Remove or replace with a minimal authenticated health endpoint |
| missing `/api/worker/watchdog` called by cron | Route not found; remove call or implement only in a separately approved worker slice |

## M. Regression and integration test strategy

1. Pure contract tests for credential classification, conflicting credentials, safe errors and immutable context.
2. Firebase Auth Emulator tests for valid/expired/malformed/revoked/disabled ID tokens and session lifecycle where emulator support permits; document emulator gaps.
3. Session exchange tests: secure cookie attributes, CSRF, Origin, expiry, logout and fixation prevention.
4. One integration test per route proving anonymous denial, wrong credential class denial, valid authentication, and that handler/Admin work does not run before verification.
5. Tenant authorization tests for missing/suspended/disabled/revoked membership, wrong tenant, direct object ID, unresolved legacy and role denial.
6. Service tests for absent/malformed/wrong/rotated secret, distinct principals, capability mismatch, replay and per-job tenant reauthorization.
7. Cron tests for bearer-only behavior and rejection of query secrets.
8. Stripe webhook signature/raw-body/replay/environment tests and checkout/portal tenant mapping tests before exposure.
9. Import-boundary tests proving Firebase Admin/auth/session/service modules never enter client bundles.
10. Browser tests bypassing UI navigation and calling protected pages/APIs directly.
11. PII-safe error/log snapshots and correlation propagation tests.
12. Preserve all existing contract, emulator authorization, application, DTI, workflow, report, OCR, aggregate and production-build gates.

## N. Exact SEC-001 implementation slices

1. **SEC-001-01 — Server-auth contracts and pure credential parser.** Add `ServerAuthContextV1`, principal kinds, stable errors, request/correlation IDs, server-only import boundaries and pure regressions. No route behavior change.
2. **SEC-001-02 — Firebase Admin auth verifier.** Centralize server-only Admin Auth initialization; verify ID tokens/session cookies with revocation and disabled-user handling; emulator/unit regressions. No production route migration.
3. **SEC-001-03 — Browser session exchange.** Add narrowly scoped login-session/logout endpoints, secure cookie and CSRF/origin behavior; retain client Firebase login and guard for compatibility.
4. **SEC-001-04 — Protected navigation and middleware early gate.** Add server verification to protected layouts/pages incrementally; middleware checks cookie presence/shape and redirects but is not authoritative.
5. **SEC-001-05 — High-risk user API migration.** Protect analyze/report first, then Stripe checkout/portal; add tenant/permission calls as SEC-002 dependencies become available.
6. **SEC-001-06 — Internal service and cron authentication.** Fix empty-secret fail-open, separate named worker/cron principals, remove query secret, add correlation/audit and per-claim authorization contract.
7. **SEC-001-07 — Debug/placeholder retirement.** Disable/delete dummy AI and production debug triggers; resolve diagnostic pages and worker GET.
8. **SEC-001-08 — Remaining route enforcement and direct-access proof.** Catalog enforcement middleware/wrappers per route, negative browser/API tests, revocation/disable drills and safe-error review.
9. **SEC-001-09 — External webhook boundary.** Add reusable raw-body signature/replay/idempotency boundary only when Stripe/Encompass implementation slices are approved.
10. **SEC-001-10 — Security evidence and operational handoff.** Credential rotation evidence, environment matrix, monitoring, audit retention, incident/runbook and rollback review. Do not mark locked without SEC-002 proof.

## O. Dependencies on SEC-002 and CORE-002

SEC-001 proves who/what made the request. SEC-002 decides whether that principal may perform the action. CORE-002 supplies tenant, membership, discovery and bootstrap contracts. None can substitute for another.

User authorization requires server-authenticated Firebase UID, authoritative tenant selection, active tenant, active membership, role/permission, same-tenant target and audit. Service authorization requires a named service principal and scoped capability. Existing `/users/{uid}.role`, email, localStorage workspace, `companyProfileId`, client UID/tenant input and Firebase custom claims not backed by an approved lifecycle are not tenant authority.

Before CORE-002-SLICE-04B may expose bootstrap, all must be true:

1. Central server-only Firebase verification is implemented and tested with revocation/disabled-user behavior.
2. Provisioning authority source and eligible principals are approved; no ordinary user or self-asserted claim can qualify.
3. Tenant IDs, audit IDs and timestamps have approved server ownership.
4. Bootstrap accepts only `ServerAuthContext` plus separately resolved provisioning authorization.
5. CSRF/origin/rate-limit controls exist for any browser-callable command; preferred exposure is internal-only.
6. Idempotent transaction, conflicting retry, collision, rollback and immutable audit tests pass through the real Admin boundary/emulator.
7. Stable PII-safe errors, correlation IDs and security audit events exist.
8. Production Admin credentials and service secrets are managed, separated and rotated.
9. No production route/page/client import exposes the executor, and production Firebase rules remain fail-closed for clients.
10. SEC-002 approves first-owner membership authority and confirms no self-role escalation.

## P. Recommended first coding slice

Implement **SEC-001-01 only**: contract and pure parsing/error/correlation modules plus server/client import regressions. It should define user, service, cron and webhook principal shapes without verifying real credentials or changing route behavior. This creates one vocabulary and fail-closed result model before cookie, Admin, middleware or route work begins.

## Highest-risk unauthenticated routes

- `/api/debug/run`: anonymous invocation causes the server to exercise privileged worker credentials.
- `POST /api/worker/files/process`: absent configured secret and absent header compare equal, permitting Admin Firestore/Storage execution.
- `/api/applications/{id}/analyze`: anonymous arbitrary URL fetch, document processing and PII/resource exposure.
- `/api/applications/{id}/report`: anonymous report generation from caller-provided payload.
- `/api/stripe/portal`: anonymous access to a fixed environment customer's billing portal session.
- `/api/stripe/checkout`: anonymous Stripe Checkout session creation.
- `/api/debug/overlay/from-storage`: Admin configuration writes behind demo/shared secrets rather than governed authority.

## Recommended canonical auth model

Firebase session cookies for browser navigation and same-origin APIs, Firebase ID-token bearer support as a bounded transitional/API-client path, one central revocation-aware server verifier, separate tenant authorization, named service/cron principals, and provider-signature authentication for webhooks. Middleware provides early redirects only; every route/server data boundary verifies independently.

## Proposed SEC-001 slices

`SEC-001-01` contracts; `02` Admin verifier; `03` browser session exchange; `04` protected navigation; `05` high-risk user APIs; `06` workers/cron; `07` debug retirement; `08` complete route/direct-access enforcement; `09` external webhooks when approved; `10` operational evidence.

## Recommended first coding slice

`SEC-001-01 — Server-auth contracts and pure credential parser`, with no production behavior change.

## Blockers requiring Quinton approval

- Public registration disposition and whether verified email/MFA is mandatory.
- Session absolute/idle lifetimes, reauthentication and multi-device/logout policy.
- Multi-tenant selection behavior and final role/permission matrix.
- Provisioning authority identities and whether tenant bootstrap is internal-service-only.
- Billing-management roles and Stripe tenant/customer ownership policy.
- Worker/service principal model, managed identity availability and credential rotation ownership.
- Production disposition of dummy AI, debug, Firebase-test and worker-health surfaces.
- Encompass webhook authentication contract.
- Audit retention/export and security-log access policy.
- Whether credential-shaped local environment values were ever exposed or active and require rotation.

## Exact file created

`docs/SEC-001_SERVER_AUTH_DESIGN.md`
