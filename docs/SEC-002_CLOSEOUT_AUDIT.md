# SEC-002 Closeout Audit

Date: 2026-07-15  
Branch: `enterprise-v1-lock`  
Audit mode: read-only repository evidence plus executed regressions  
Decision: **partially complete**

## 2026-07-16 enforcement refresh

This refresh supersedes stale production-state statements later in this historical audit. The application and mortgage-document surfaces have materially advanced: production browser Firestore access to `applications` is denied for create, read, update, and delete; production browser Storage access is denied for legacy and canonical mortgage paths; application list/detail, create, workflow/business-state, analyze, decisions, document lifecycle/bytes, reports, Stripe, worker, and scheduler operations now have authenticated server boundaries with tenant/resource authorization and dedicated regressions. The admin-backfill emulator was reconciled to this full-deny posture without changing either production rules file.

The complete deterministic matrix and the real Auth, Firestore, and Storage emulator/integration matrix passed on 2026-07-16. One application-create emulator invocation transiently failed its audit-PII assertion during the long aggregate run; an immediate isolated rerun passed with mandatory child markers and clean shutdown without a code change. The admin-backfill reconciliation and production Storage cutover focused suites were independently green.

SEC-002 is nevertheless **not complete** and is classified **partially complete**, rather than implementation-complete, because repository inspection still identifies material authorization work:

- tenantless legacy application/document/object ownership has no operational inventory, adjudication, migration, or rollback execution;
- `/underwriters` still performs direct browser Firestore administration and registration still creates the legacy `/users/{uid}` profile, whose self-update rule remains unsuitable as authorization authority;
- there is no governed audit-read or audit-export production boundary;
- authorization caching remains a contract/policy only, without deployed cache, invalidation channel, revocation drill, or operational monitoring;
- worker and scheduler service-grant enforcement exists, but production service-principal/grant provisioning and rotation remain operational dependencies;
- `/firebase-test`, `/debug`, `/upload`, `/api/debug/run`, and `/api/debug/overlay/from-storage` still require explicit production removal or governed disposition;
- Admin SDK use is widespread and mostly sits behind the new canonical boundaries, but the remaining diagnostic Admin routes require removal/disposition and a final route-by-route bypass audit;
- the provisional role/permission matrix, active-tenant selection, user/membership administration, and underwriter administration still require production governance.

`CAPABILITY_REGISTRY.md` remains unchanged. Browser Firestore and Storage lockout is necessary evidence, but it does not satisfy SEC-002 acceptance across administration, audit access/export, operational provisioning, cache invalidation, diagnostics, and legacy ownership.

## 1. Executive decision

SEC-002 is **not complete**. The repository contains strong, tested server-only foundations for authentication handoff, tenant/membership resolution, RBAC+ABAC decisions, application and document resource resolution, immutable authorization audits, bounded document retrieval/processing, evidence aggregation/review, denial auditing, concurrency, idempotency, rollback, and isolated emulator execution. Only `GET /api/applications/[id]` currently composes the canonical SEC-001 authentication boundary with SEC-002 application authorization and immutable audit persistence in production.

The architecture completion criteria are not met because production analyze, report, Stripe, worker, cron, workflow, administration, document upload/download, and evidence-review entry points have not migrated; production Firestore and Storage rules remain broadly signed-in rather than tenant-scoped; service grants, active-tenant UX, deployed authorization caching/invalidation, legacy adjudication, and complete route/rule parity are absent. Passing isolated boundaries and test-only rules are therefore not treated as proof of production protection.

**Estimated SEC-002 completion: 38%.** This is a repository-evidence estimate, not a capability-status update. It weights the twelve design slices: 01-03 substantially complete; 04 complete as contracts/audit persistence but not deployed cache invalidation; 05 complete for canonical read resolution but incomplete for production create/update; 06, 08, 10-12 not migrated; 07 has complete isolated document boundaries but no production upload/path/rule cutover; and 09 has a complete governed evidence-review command but not the broader queue/assignment/condition/decision migration.

`CAPABILITY_REGISTRY.md` should remain unchanged: `SEC-002` correctly remains `Planned`. No lock or completion evidence exists for every access path.

## 2. Design requirement comparison

| Design requirement | Repository evidence | Status |
|---|---|---|
| Server-derived authentication context | SEC-001 verifier, session cookie, protected navigation, and user API guard exist and pass | Complete boundary; limited production adoption |
| Active tenant and membership resolution | Canonical resolver reads tenant/membership, rejects ambiguity/inactive/unknown, emulator-backed | Complete boundary; no active-tenant UX |
| Versioned authorization contracts and conservative permission registry | Immutable context/request/decision/resource contracts and provisional role matrix | Implemented; mappings remain provisional |
| RBAC plus ABAC default-deny decision | Tenant/resource/legacy/branch/team/assignment constraints covered | Implemented boundary |
| Application ownership resolution | Exact Admin lookup, tenant ownership states, safe errors, application-read integration | Read integration only; create/update/client access not migrated |
| Document ownership and canonical Storage reference | Exact application/document resolver, canonical tenant path, metadata-only proof | Test/server boundary only; production paths and rules not migrated |
| User authorization flow on every business route | Full composition exists only for application GET | Incomplete |
| Service/worker authorization | Workers use a shared header secret; no named principal or service grant | Missing |
| Legacy unresolved-record strategy | Resolvers deny unresolved states and contracts model migration states | No inventory/adjudication/cutover; live counts unknown |
| Safe denial/error behavior | Canonical boundaries normalize errors and evidence-review denials audit safely | Implemented only where boundaries are used |
| Immutable authorization audit | Tenant/platform sink, idempotency, conflicts, emulator persistence; application GET uses it | Most production actions unaudited |
| Cache and revocation | Versioned cache-key/policy contracts and deterministic invalidation tests | No production cache or invalidation deployment |
| Firestore/Storage alignment | Strong isolated test rules and cross-tenant emulator matrix | Production rules are not aligned |
| Full enforcement and operational drills | Dedicated emulator suites pass | No browser/API/worker/report/rule cutover matrix for all production paths |

## 3. Completed capability inventory

The following are genuinely implemented and regression-backed, but are not all production-integrated:

- SEC-001 Firebase Admin verification, session exchange/logout, protected-navigation verification, and user API guard.
- Immutable authorization permission/resource/reason/context/decision contracts.
- Exact tenant and active membership resolver with multi-tenant ambiguity denial.
- Pure default-deny RBAC+ABAC decision engine.
- PII-safe authorization audit contracts, immutable persistence, idempotency, and cache-key policy.
- Exact application resource resolution and production application-read orchestration.
- Exact application-document resolution with canonical tenant Storage-path validation.
- Application-document authorization orchestration.
- Bounded authorized document-byte retrieval with TOCTOU checks.
- Deterministic authorized document processing and real PDF/image processing regressions.
- Deterministic document evidence extraction and application evidence aggregation.
- Governed evidence-review reducer and transactional command repository.
- Evidence-review safe denial auditing, optimistic concurrency, idempotency, race handling, and rollback at every transaction stage.
- Repository-local, demo-only, marker-enforced Firestore Emulator runners.

## 4. Production route authorization matrix

The classification column uses exactly one requested category. “Canonical” means actual composition with SEC-001/SEC-002, not merely a protected page shell.

### API routes

| Route | Classification | Current authentication | Current authorization | Caller-controlled input/authority | Audit | Severity / dependency / recommended slice |
|---|---|---|---|---|---|---|
| `POST /api/ai-scan` | diagnostic/debug route | None | None | Entire JSON payload | None | High: public dummy business output; CORE-003 diagnostic isolation |
| `POST /api/ai/scan` | diagnostic/debug route | None | None | Entire JSON payload | None | High: duplicate public dummy output; CORE-003 |
| `GET /api/applications/[id]` | authenticated and authorized | Canonical SEC-001 user API guard | Canonical `application.read`, tenant resolver, application resolver, ABAC, immutable audit | Opaque application ID is locator only; tenant/role/permission server-derived | Allow/deny persisted | Migrated and complete for read |
| `POST /api/applications/[id]/analyze` | unsecured | None | None | Application ID, `documentUrl`, stored-document URLs, analysis payload; server fetches selected URL | None | **Critical:** anonymous SSRF/PII/compute; SEC-002-06 |
| `POST /api/applications/[id]/report` | unsecured | None | None | Application ID and caller-supplied extracted, AI, report, workflow and borrower data | None; raw stack may be returned | **Critical:** anonymous report/PII generation; SEC-002-08 |
| `POST /api/auth/session` | public by design | Firebase ID token verified by SEC-001 | Session issuance policy only; no tenant resource | Credential and bounded correlation inputs; not treated as authority | Authentication boundary evidence only | Appropriate authentication endpoint |
| `POST /api/auth/logout` | public by design | Cookie deletion does not require a valid session | Origin/host mutation-source validation | No tenant/resource authority | No SEC-002 audit required | Appropriate logout endpoint |
| `GET/POST /api/cron/tick` | incomplete | Shared `CRON_SECRET`; query-string secret fallback | No service grant, tenant scope, action scope, or audit | Query secret and request origin select internal dispatch target origin | None | **Critical:** service authorization missing; SEC-002-11 |
| `GET /api/debug/run` | diagnostic/debug route | None | None; server injects worker secret | Host/forwarded-host builds internal base URL; mode and demo tag caller-controlled | None | **Critical:** unauthenticated privileged worker trigger; CORE-003 then SEC-002-11 |
| `GET/POST /api/debug/overlay/from-storage` | diagnostic/debug route | Demo token or shared worker secret | No tenant/configuration authorization | Query token, company profile, program key, object path, overlay name, force flag | None; returns stack/details | **Critical:** Admin configuration mutation; SEC-002-10 plus CORE-003 |
| `POST /api/stripe/checkout` | unsecured | None | None | Fixed environment price; no tenant/customer authority binding | None | **Critical:** anonymous billable operation; SEC-002-10 |
| `POST /api/stripe/portal` | unsecured | None | None | Fixed environment customer ID; no authenticated tenant binding | None | **Critical:** cross-customer billing exposure; SEC-002-10 |
| `GET /api/worker/files/process` | diagnostic/debug route | None | None | Reveals route readiness only | None | Medium diagnostic exposure; SEC-002-11/CORE-003 |
| `POST /api/worker/files/process` | incomplete | Shared worker secret; fails open when the secret is unset | No named service grant or tenant/job authorization | Claimed global job and persisted `objectPath` control Admin Storage read | None | **Critical:** Firebase Admin bypass/global job claim; SEC-002-11 |
| `POST /api/worker/ai/process` | incomplete | Shared worker secret, fail closed if unset | No named service grant or tenant/job authorization | Global job claim; application `companyProfileId` selects rules/config | None | **Critical:** unaudited Admin processing; SEC-002-11 |

There is no webhook route with explicit provider verification. Referenced `/api/upload`, `/api/applications/create`, `/api/worker/watchdog`, `/api/debug/seed/strict`, `/api/debug/requeue`, and `/api/debug/share` routes do not exist in the route tree; links to them are incomplete behavior, not protected capabilities.

### Page routes

| Route(s) | Classification | Evidence and gap |
|---|---|---|
| `/`, `/auth/login`, `/auth/register` | public by design | Landing/authentication entry points. Registration client-writes `/users/{uid}` with role `processor`; production rules permit self-update, so this is not authorization authority that SEC-002 can trust. |
| `/applications`, `/applications/[id]`, `/applications/new` | authenticated but not resource-authorized | Server layout validates session, but pages read/write Firestore directly under broad signed-in rules. Detail updates status, notes, assignment, workflow, decisions and related fields without SEC-002 commands. |
| `/dashboard`, `/borrowers`, `/queue` | authenticated but not resource-authorized | Session verified; global client application/underwriter queries and queue writes are not tenant/permission constrained. |
| `/underwriters`, `/admin`, `/settings` | authenticated but not resource-authorized | Session verified; hardcoded admin navigation and client Firestore/admin/billing operations lack canonical authorization. |
| `/upload` | diagnostic/debug route | Session verified, but uses demo token and calls missing create/upload/debug endpoints. |
| `/firebase-test`, `/debug` | diagnostic/debug route | Session verified but intentionally diagnostic; production disposition is unresolved. |

Middleware checks only cookie shape as an early redirect optimization. Protected page layouts perform authoritative SEC-001 session verification. Neither mechanism provides resource authorization.

## 5. Production capability coverage

| Capability | Production migration state |
|---|---|
| Applications | Read API migrated; client list/create/update/detail mutations are not |
| Documents | Resolver/orchestrator boundaries exist; no production route consumes them |
| Document downloads | Authorized byte boundary exists; production UI continues to use client download URLs |
| Document uploads | Client Storage helper uses caller application ID and `applications/{applicationId}` path; upload API is missing |
| Evidence review | Full transactional server boundary exists; no production route/UI invokes it |
| Conditions | Client application document updates; no authorized server command |
| Assignments | Client queue/detail updates and underwriter collection; no authorized command |
| Decisions | Client/worker writes; no accountable `decision.*` production authorization |
| Reports | Public caller-supplied report route; not migrated |
| Exports | No canonical authorized export boundary |
| Queues | Client global queries/writes; not migrated |
| Tenant administration | Tenant bootstrap boundary exists; production admin UX not migrated |
| Membership administration | No canonical production command; `/users` legacy role remains |
| Configuration | Debug Admin overlay mutation and worker `companyProfileId`; not migrated |
| Billing | Public fixed Stripe customer/price routes; not migrated |
| Audit access | Audit write boundary exists; no `audit.read` production surface |
| Audit export | Missing |
| Workers | Shared secret and global Admin claims; no service grants |
| Cron jobs | Shared/query secret dispatch; no scheduler grant |
| Schedulers | No canonical named scheduler authorization |
| Background services | No scoped service-grant resolution or tenant-local authorization |

Explicit migration checks: analyze **no**; reports **no**; exports **no**; document upload **no**; document download **no**; queues **no**; workflow **no**; conditions **no**; assignments **no**; decisions **no**; Stripe **no**; workers **no**; cron **no**; schedulers **no**.

## 6. Remaining gaps, ordered by severity and dependency

### Critical

1. **Public analyze SSRF and PII processing.** `/api/applications/[id]/analyze` accepts and fetches caller URLs. Dependency: active tenant policy, canonical application/document authorization, audit and production rule migration. Slice: SEC-002-06.
2. **Public report generation.** `/api/applications/[id]/report` trusts caller mortgage/report content and returns raw stack information. Dependency: canonical decision package and report authorization. Slice: SEC-002-08.
3. **Production Firestore/Storage rules permit broad signed-in access.** Firestore allows every signed-in user to read/create/update every application; Storage allows every signed-in user to read/write every `applications/{applicationId}/...` object. Dependency: tenant ownership migration and client/server cutover. Slices: SEC-002-07 and SEC-002-12.
4. **Shared-secret Admin workers and scheduler.** No named principal, service grant, tenant scope, action scope, or immutable audit. The files worker fails open when `WORKER_SECRET` is unset. Slice: SEC-002-11.
5. **Unauthenticated Stripe checkout/portal.** Fixed price/customer environment values are not bound to an authenticated tenant. Slice: SEC-002-10.
6. **Diagnostic Admin mutation and worker dispatch.** `/api/debug/run` is unauthenticated; overlay mutation accepts demo/shared secrets and caller configuration identifiers. Dependency: CORE-003 disposition plus SEC-002-10/11.

### High

7. **Client Firestore business mutations bypass server authorization.** Application creation, status, notes, assignment, workflow, conditions, decisions, admin and queue operations write directly. Slices: SEC-002-05 and SEC-002-09.
8. **Caller-controlled Storage authority.** `lib/storage.ts` builds `applications/${applicationId}` from caller input and produces download URLs. The files worker trusts persisted `objectPath`. Slice: SEC-002-07.
9. **Evidence-review production entry point missing.** Its command is complete but unreachable through an authenticated/authorized production route. A later route/UI migration must preserve the proven command boundary.
10. **Legacy ownership is unresolved operationally.** Contracts deny unresolved records, but there is no dry-run inventory, adjudication authority, migration execution, rollback, or live repository count. Current numbers of tenantless applications/documents are unknown without authorized production data access. Slice: SEC-002-12.

### Medium

11. **Permission mappings remain provisional.** Owner/admin/underwriter/processor decisions still require product approval; hardcoded sidebar role is not authority but misrepresents UX.
12. **No active-tenant UX/server selection contract.** Local storage workspace display exists, but cannot be authorization authority; multi-tenant selection remains a product decision.
13. **Authorization cache is contract-only.** No production cache, authorization counters, invalidation channel, revocation drill, or high-risk bypass deployment exists.
14. **Denial auditing is route-limited.** Application GET and evidence-review command persist denials; most privileged production paths emit no canonical audit.
15. **No audit-read/export enforcement.** Permissions exist in vocabulary but no production access boundary exists.

## 7. Caller-controlled and bypass inventory

- **Storage paths:** client `applicationId` in `lib/storage.ts`; persisted worker `objectPath`; debug `objectPath` metadata.
- **URLs:** analyze `documentUrl` and stored document URLs; request-derived origin/forwarded host for cron/debug internal fetch; Stripe return base from environment rather than caller.
- **Authority/role:** legacy `/users/{uid}.role`, self-writable user documents, hardcoded sidebar admin role, shared worker/demo/cron secrets.
- **Tenant:** application/create/update client records and global queries are not bound by production rules; `companyProfileId` selects configuration but is not ownership.
- **Permission:** no migrated route accepts a permission value as authority; the larger issue is routes that perform actions without any canonical permission decision.
- **Ownership:** client application writes can set/update fields under current rules; production rules do not make tenant/creator/ownership immutable.
- **Tenantless legacy:** modeled and denied by new resolvers, but production inventory is unknown and legacy client routes still read the broad collection.
- **Firebase Admin bypass:** analyze/debug/workers/Stripe-adjacent administration do not reproduce full rule-equivalent authorization; Admin workers query globally.
- **Unaudited privileged operations:** analyze, report, Stripe, cron, workers, overlay configuration, client admin/assignment/condition/decision writes.

## 8. Blockers preventing completion

- Product approval of active-tenant selection, branch/team absence semantics, full permission matrix, approval authority, billing/audit powers, service-grant policy and diagnostic disposition.
- Canonical tenant-owned production application and document migration with immutable ownership/version fields.
- Production Firestore and Storage rule cutover with API/UI compatibility and negative parity evidence.
- Migration of every business API and client mutation to authenticated, resource-authorized, audited server commands.
- Named service principals and scoped service grants for workers/cron/schedulers.
- Legacy inventory/adjudication and complete unresolved-record isolation.
- Production authorization version counters, invalidation and revocation drills.
- Complete cross-tenant browser/API/Storage/worker/report/export matrix.

## 9. Exact next implementation slice

**SEC-002-06 — Application analyze migration** is the next security-critical implementation slice. It should retain the SEC-001 user API guard, authorize `application.analyze`, resolve the application and document from canonical server repositories, eliminate all caller-controlled URLs, use the authorized document-byte/processing boundaries, persist PII-safe allow/deny audits, recheck mutable state before writes, and add direct negative tests. If the required active-tenant or permission decisions are not approved, the slice is blocked and those decisions must be resolved before code migration.

The immediately following dependency sequence should be SEC-002-07 production document/Storage cutover, SEC-002-08 report/export migration, SEC-002-09 workflow commands, SEC-002-10 tenant/configuration/billing, SEC-002-11 services, then SEC-002-12 legacy/full enforcement.

## 10. Verification evidence

Executed on 2026-07-15:

- Registered SEC-001 matrix: passed, including server-auth contracts/verifier/real Auth Emulator smoke, browser session, client session, protected navigation and user API authentication.
- Registered SEC-002 matrix: passed, including tenant rules 28/28, authorization contracts 17/17, resolvers, decision engine, audit/cache, application/document orchestration, immutable audit persistence, application read, authorized bytes/processing, evidence extraction/aggregation/review and evidence-review command 9/9.
- Genuine emulator child markers were observed for tenant authorization, authorization resolver, application/document resources and orchestration, audit persistence, application read, authorized document bytes and evidence-review command; all emulators shut down.
- The isolated tenant Firestore/Storage rule suite is test evidence only and was not counted as production rule deployment.
- TypeScript (`tsc --noEmit`): passed.
- Production build (`next build`): passed, 29/29 static pages generated; existing metadata/Browserslist/cache warnings were non-fatal.
- `git diff --check`: passed.
- Production `firestore.rules` / `storage.rules` diff: empty.

## 11. Capability registry decision

Keep `CAPABILITY_REGISTRY.md` unchanged. SEC-002 lacks its stated acceptance evidence that unauthorized operations fail through **every** access path and that the permitted matrix succeeds across API, UI, Storage, Firestore, workers, reports, exports and billing. Updating status would contradict both the registry and the architecture.

## 12. 2026-07-16 closeout refresh

This section supersedes the stale implementation-status statements above while preserving the original audit history. Subsequent accepted slices have migrated application create/read/update/delete posture, analyze, documents and production Storage, reports/exports, workflow, decisions, Stripe, workers, schedulers, and evidence review behind authenticated and authorized server boundaries. Production browser access to application records and mortgage Storage objects remains denied. The registered deterministic and real-emulator matrices were rerun for this refresh and passed, including the platform legacy inventory capability described below.

### Platform legacy inventory decision

The bounded dry-run implementation is accepted as code and emulator evidence. It uses a named `legacy_inventory_service`, signed requests, replay protection, an authoritative exact-scope grant, immutable command/receipt/audit persistence, class-bound opaque cursors, bounded class-filtered discovery, safely attributable denial audits, and no ownership or Storage mutation. Its fixed classes are `applications`, `application_documents`, `legacy_application_metadata`, `analysis`, `reports`, `workflow`, `decisions`, `evidence`, `legacy_storage_metadata`, and `canonical_storage_metadata`. Excluded classes have zero class dependency calls in the instrumented emulator proof.

The full operational capability is **not** accepted or complete. No production credential or grant was provisioned, no production inventory was run, no ownership adjudication was authorized, and no Storage object was moved. The provisioning/rotation model and readiness projection are contracts only. A production operation requires a separately approved runbook, real secret-manager/environment provisioning, accountable operator authorization, rollback/incident criteria, and evidence review of the resulting PII-free receipt.

### Remaining SEC-002 bundles

1. **SEC-002-GOVERNANCE-ADMIN-AUDIT-CLOSEOUT-BUNDLE-01** — finalize the permission matrix and active-tenant selection/governance; replace or retire legacy user, membership, and underwriter administration; add authorized audit read/export. This is first because the remaining operator and administrative powers cannot safely depend on provisional role or tenant semantics.
2. **SEC-002-AUTHORIZATION-OPERATIONS-CLOSEOUT-BUNDLE-01** — deploy the authorization cache only after defining invalidation, revocation, high-risk bypass, version counters, telemetry, and drills; close diagnostic pages/routes and review every remaining direct Admin SDK bypass against the canonical authorization/audit pattern.
3. **SEC-002-SERVICE-PRINCIPAL-AND-LEGACY-OPERATIONS-CLOSEOUT-BUNDLE-01** — approve and execute service-principal provisioning/rotation, a controlled production dry-run inventory, receipt review, and the separate adjudication/migration/rollback design. Inventory execution must remain distinct from adjudication authority and Storage movement.

### Refreshed completion decision

SEC-002 remains incomplete. The capability registry remains unchanged. The exact next task is **SEC-002-GOVERNANCE-ADMIN-AUDIT-CLOSEOUT-BUNDLE-01**. SEC-003 must not begin until these SEC-002 bundles and the constitution's cross-path acceptance criteria are genuinely complete.
