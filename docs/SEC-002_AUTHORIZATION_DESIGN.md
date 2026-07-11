# SEC-002 Server Authorization Design

Status: read-only authorization audit and design. This document changes no application behavior, route, middleware, Firebase rule, package, configuration, capability status, or existing document.

## Scope and governing invariants

SEC-001 authenticates a principal and produces `ServerAuthContextV1`; it does not authorize tenant, application, document, configuration, billing, workflow, or mortgage decisions. SEC-002 must derive authorization exclusively from server-read authoritative records. Client-supplied tenant IDs are resource selectors at most, never authority. Email domain, `/users/{uid}.role`, localStorage workspace state, `companyProfileId`, route visibility, and Firebase authentication alone never grant access.

The repository already defines `TenantV1`, `TenantMembershipV1`, an initial `AuthorizationContextV1`, unresolved legacy ownership states, tenant bootstrap plans, and isolated emulator rules. Those are useful foundations, but the production Firestore and Storage rules have not adopted them. Unknown roles, inactive memberships, inactive tenants, unresolved ownership, missing scope, malformed records, and unavailable dependencies fail closed.

## A. Current authorization risk map

| Surface | Current fact | Risk | Required authority |
| --- | --- | --- | --- |
| Authentication boundary | `ServerAuthContextV1` and the user API guard exist; no business API uses the guard | Business routes remain unauthenticated and unauthorized | SEC-001 authentication followed by SEC-002 authorization |
| `/users/{uid}` | Production rules read `role` from the user profile and allow a user to update their own profile | Self-role escalation; global role is not tenant authority | `/tenants/{tenantId}/members/{uid}` only |
| Applications | Production rules allow every signed-in user to read/create/update every application | Cross-tenant disclosure and mutation; object-ID guessing | Active tenant + active membership + permission + owned resource |
| Storage | Production paths are `applications/{applicationId}/...`; every signed-in user can read/write | Cross-tenant document access; no tenant path binding | `tenants/{tenantId}/applications/{applicationId}/documents/...` plus metadata checks |
| Existing application records | Current records are not uniformly proven to have immutable `tenantId`, `createdBy`, and `ownershipState` | Silent ownership inference could misassign borrower data | `tenant_owned` only; all others unresolved and denied |
| Application creation | UI writes directly to top-level `applications`; current code does not derive tenant authority server-side | Forged ownership and creator fields | Server create service derives `tenantId` and `createdBy` |
| Analyze route | Public POST accepts route ID and caller-provided remote document URL/payload | Anonymous compute, SSRF, PII processing, no ownership proof | Authenticate, authorize application analyze, resolve canonical document server-side |
| Report route | Public POST accepts caller-provided report data | Anonymous PII/compute and noncanonical reporting | Authorize application/report and load persisted decision package |
| Application pages | Protected navigation authenticates but does not authorize | Any authenticated user can reach page shell and client Firebase reads | Server authorization plus aligned Firebase rules/repositories |
| Queue and assignment | Client queries and writes global applications/underwriters | Cross-tenant queue visibility and assignment | Tenant-scoped query plus `assignment.manage` and branch/team constraints |
| Conditions and decisions | Application detail performs client-side mutations | Role hiding is bypassable; no canonical permission enforcement | Explicit condition/decision permissions, server commands, aligned rules |
| Admin/settings | `PAGE_ACCESS` is client-oriented and omits tenant membership authority | UI visibility can be mistaken for authorization | Tenant administration/configuration permissions |
| Tenant bootstrap | Executor requires a separate verified authorization object but is not exposed | Good isolation, but production authority source is not yet implemented | Named platform/service authority, audit, idempotency |
| Workers | Shared worker secret and Admin SDK operate across global collections | Secret grants broad authority; jobs lack explicit tenant scope | Named service principal + allowed action + tenant/resource scope |
| Cron | Global scheduler invokes worker endpoints | Scheduler could become data authority or widen worker scope | Scheduler may dispatch only; workers independently authorize each claim |
| Stripe | Checkout is public; portal uses a fixed environment customer | Billing takeover or wrong-customer access | Active tenant + `billing.manage` + server-owned Stripe mapping |
| Configuration | `companyProfiles`, `programs`, `overlays`, and `rulePacks` are loaded by global IDs | `companyProfileId` can be confused with ownership; cross-tenant config use | Tenant-owned references and `configuration.*` permissions |
| Isolated test rules | Conservative tenant rules pass emulator tests but are not production rules | Test behavior may be mistaken for deployed enforcement | Controlled production migration with parity/API/rules evidence |

## B. Canonical AuthorizationContextV1 design

The existing context should be evolved without changing its central meaning. It represents resolved authority for one principal in one active tenant, not a list of all memberships and not a permission decision.

```ts
type AuthorizationContextV1 = Readonly<{
  schemaVersion: "authorization-context.v1";
  authentication: ServerAuthContextV1;
  subject:
    | Readonly<{ kind: "user"; userId: UserId }>
    | Readonly<{ kind: "service"; servicePrincipalId: ServerPrincipalId }>;
  tenant: Readonly<{
    tenantId: TenantId;
    status: "active";
    authorizationVersion: number;
  }>;
  membership?: Readonly<{
    membershipId: string; // canonical path identity or immutable ID
    status: "active";
    role: Exclude<TenantRole, "unknown" | "service_account">;
    branchIds: readonly BranchId[];
    teamIds: readonly TeamId[];
    authorizationVersion: number;
  }>;
  serviceGrant?: Readonly<{
    grantId: string;
    allowedActions: readonly Permission[];
    tenantScope: "single_tenant" | "bounded_tenant_set";
    tenantIds: readonly TenantId[];
    resourceConstraints?: Readonly<Record<string, string>>;
    authorizationVersion: number;
    expiresAt?: IsoTimestamp;
  }>;
  permissionSetVersion: string;
  resolvedAt: IsoTimestamp;
  source: "tenant_membership" | "service_grant";
}>;
```

For users, Firebase UID resolves to the membership document at `/tenants/{tenantId}/members/{uid}` after tenant selection. The context must include the original `ServerAuthContextV1` so request/correlation identity and authentication evidence remain attributable. A user context cannot contain a service grant; a service context cannot contain a human membership.

The existing contract lacks explicit version counters, embedded authentication context, service scope, and permission-set version. Adding those requires a versioned contract slice and compatibility decision; until then, no production authorization resolver should pretend the current context fully covers revocation/cache semantics.

## C. Canonical AuthorizationDecisionV1 design

Every protected operation receives one immutable decision. The decision is about one action and one resolved resource; it is not a reusable blanket approval.

```ts
type AuthorizationDecisionV1 = Readonly<{
  schemaVersion: "authorization-decision.v1";
  decisionId: string;
  effect: "allow" | "deny";
  permission: Permission;
  subject: Readonly<{ kind: "user" | "service"; id: string }>;
  tenantId?: TenantId; // absent only when denial occurs before safe tenant resolution
  resource: Readonly<{
    kind: ResourceKind;
    id?: string;       // safe opaque ID; never borrower data
    ownershipState: "tenant_owned" | "unresolved" | "not_applicable";
  }>;
  constraints: Readonly<{
    branchRequired?: BranchId;
    teamRequired?: TeamId;
    assignmentRequired?: boolean;
    creatorRequired?: boolean;
  }>;
  reasonCode: AuthorizationReasonCode;
  policyVersion: string;
  membershipVersion?: number;
  tenantAuthorizationVersion?: number;
  resourceVersion?: string;
  evaluatedAt: IsoTimestamp;
  requestId: RequestId;
  correlationId: CorrelationId;
}>;
```

An allow requires all applicable checks: authenticated principal, active tenant, active membership or service grant, known role, permission mapping, tenant-owned resource, matching tenant, branch/team/assignment attributes when the permission declares them, and current versions. A deny is the default. Callers branch only on `effect`; they must not reconstruct authorization from reason codes or roles.

Recommended public denial codes are `AUTHORIZATION_REQUIRED`, `TENANT_CONTEXT_REQUIRED`, `MEMBERSHIP_INACTIVE`, and `FORBIDDEN`. Internally, more specific safe reason codes may include `tenant_inactive`, `membership_missing`, `membership_inactive`, `role_unknown`, `permission_missing`, `resource_not_found_or_forbidden`, `ownership_unresolved`, `tenant_mismatch`, `branch_scope_mismatch`, `team_scope_mismatch`, `assignment_required`, `service_scope_mismatch`, and `authorization_dependency_unavailable`.

## D. Permission vocabulary

Permissions are stable action identifiers, not page names and not mortgage policy. Initial families:

- `application.read`, `application.create`, `application.update`, `application.analyze`
- `document.read`, `document.upload`, `document.delete`
- `condition.read`, `condition.manage`
- `assignment.read`, `assignment.manage`
- `decision.read`, `decision.recommend`, `decision.approve`
- `report.read`, `report.generate`, `report.export`
- `queue.read`
- `tenant.read`, `tenant.manage_profile`, `tenant.manage_memberships`
- `configuration.read`, `configuration.manage`
- `billing.read`, `billing.manage`
- `audit.read`, `audit.export`
- `service.job_claim`, `service.job_process`, `service.scheduler_dispatch`

`decision.approve` authorizes the accountable human action; it does not define approval criteria or permit weakening hard stops. `owner` and `admin` receive only enumerated permissions. Unknown permissions and unknown roles deny.

## E. Initial conservative role-to-permission matrix

This matrix is a proposed starting point requiring product approval. A check mark remains subject to tenant/resource/branch/team/assignment constraints.

| Permission | owner | admin | loan_officer | processor | underwriter | viewer |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `application.read` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `application.create` | ✓ | ✓ | ✓ | ✓ | — | — |
| `application.update` | ✓ | ✓ | ✓ | ✓ | limited/UNKNOWN | — |
| `application.analyze` | ✓ | ✓ | ✓ | ✓ | UNKNOWN | — |
| `report.generate` | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| `document.read` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `document.upload` | ✓ | ✓ | ✓ | ✓ | UNKNOWN | — |
| `document.delete` | ✓ | ✓ | UNKNOWN | ✓ | — | — |
| `condition.manage` | ✓ | ✓ | UNKNOWN | ✓ | ✓ | — |
| `assignment.manage` | ✓ | ✓ | — | UNKNOWN | UNKNOWN | — |
| `decision.approve` | — | — | — | — | ✓ | — |
| `tenant.manage_profile` | ✓ | ✓ | — | — | — | — |
| `tenant.manage_memberships` | ✓ | ✓ | — | — | — | — |
| `billing.manage` | ✓ | UNKNOWN | — | — | — | — |
| `audit.export` | ✓ | UNKNOWN | — | — | — | — |

No role is unrestricted. `service_account` is not a human-role shortcut and must not be accepted from a client membership; services use named service grants. The exact limited underwriter update actions, deletion policy, processor assignment authority, admin billing/audit authority, and loan-officer condition authority are UNKNOWN.

## F. Tenant membership resolution

1. Require a validated user `ServerAuthContextV1` and take UID only from its `firebase_user` principal.
2. Discover candidate memberships through `/userTenantMemberships/{uid}/tenants/{tenantId}`. Discovery documents are indexes, not authority.
3. For a selected tenant, read `/tenants/{tenantId}` and `/tenants/{tenantId}/members/{uid}` in a consistent server operation.
4. Parse both canonical contracts; require exact tenant/user identity agreement.
5. Require tenant status `active`, membership status `active`, and a known human role.
6. Build `AuthorizationContextV1` from those authoritative records, not from the discovery index or `/users` profile.

One user can belong to multiple tenants without redesign because membership authority is already tenant-local and bootstrap writes a user discovery index. The resolver must never merge permissions across tenants. Each authorization context selects exactly one tenant and one membership.

Tenant suspension or disablement denies every tenant operation except separately approved platform recovery actions. Membership invitation, suspension, disablement, unknown status, missing record, or parse failure denies.

## G. Active tenant selection strategy

The server must not read localStorage workspace state as authority. Selection options:

- A tenant-scoped resource can determine the candidate tenant after a server lookup by opaque resource ID; authorization then validates membership in that tenant.
- A tenant-scoped route may include a tenant ID in its path. The ID selects a candidate only; membership still establishes authority.
- A user with exactly one active membership may default to that tenant if product policy approves.
- A user with multiple active memberships must select one through a server-validated tenant-selection operation. A bounded, signed/HttpOnly selection cookie or server session reference may remember the choice, but every operation revalidates membership and tenant status.

No membership means deny. Multiple memberships with no unambiguous selection means `TENANT_CONTEXT_REQUIRED`. The current product has no approved active-tenant selection UX or server contract; this is UNKNOWN and requires Quinton approval.

## H. Application and document ownership resolution

Application authorization must load the application server-side from the canonical repository before business processing. It must require:

- a valid canonical application ID;
- `ownershipState === "tenant_owned"`;
- a valid immutable `tenantId`;
- a valid immutable server-derived `createdBy` where applicable;
- application tenant equal to authorization tenant;
- permission and attribute constraints.

The client route parameter is only an object locator. Return the same public not-found/forbidden response for a missing ID, another tenant's ID, and an unresolved record so object-ID guessing reveals no existence.

Documents require canonical document metadata containing `documentId`, `applicationId`, `tenantId`, immutable storage object reference, content metadata, uploader, checksum/status where available, and ownership state. The metadata tenant and application must match the loaded application. Storage paths must become `tenants/{tenantId}/applications/{applicationId}/documents/{documentId}/{safeFileName}`. Signed/download URLs are created only after authorization and should be short-lived.

`companyProfileId`, program, overlay, or rule-pack references do not establish application ownership. They must independently resolve to approved tenant-owned or explicitly platform-shared configuration.

## I. Branch and team scoping strategy

Membership `branchIds` and `teamIds` are existing optional scopes. Resource records that require subtenant restriction need canonical immutable or governed fields such as `branchId`, `teamId`, and assignment references. Absence semantics must be explicit:

- An empty/absent membership scope must not silently mean global access. Whether it means tenant-wide or no scoped access is a product decision.
- A resource with a branch/team must match an allowed membership scope unless the permission explicitly grants tenant-wide scope.
- Assignment constraints are ABAC checks layered after permission checks; assignment never changes tenant ownership.
- Cross-branch reassignment requires `assignment.manage` plus authority over both source and destination scopes.

The current application shape does not provide a verified complete branch/team model. Exact resource fields, tenant-wide scope semantics, and assignment pool behavior are UNKNOWN.

## J. User authorization flow

1. Route policy invokes the SEC-001 API guard.
2. Authentication must succeed; a route requiring authorization cannot proceed on authentication alone.
3. Validate method, origin, CSRF, and body bounds before expensive work.
4. Resolve candidate tenant without trusting it as authority.
5. Resolve active tenant and active canonical membership from Firestore.
6. Build one `AuthorizationContextV1`.
7. Load the target resource through a server repository where required.
8. Resolve role to an immutable versioned permission set.
9. Apply ABAC constraints: resource tenant, ownership state, branch/team, assignment, creator, resource status, and action-specific preconditions.
10. Emit `AuthorizationDecisionV1` and a safe audit event.
11. Only an `allow` decision enters the handler/service. Re-read or transactionally guard mutable authoritative state for writes.

Velocity should use both RBAC and ABAC. RBAC provides a conservative permission baseline; ABAC binds that permission to the tenant, resource ownership, branch/team, assignment, creator, status, and action. Role checks alone are too broad; attributes alone without governed permission vocabulary are difficult to audit.

## K. Service/worker authorization flow

Human membership roles never authorize workers. A service principal needs a named, rotated credential resolved by SEC-001 and a server-owned `ServiceAuthorizationGrantV1` containing allowed actions, tenant scope, resource/job constraints, version, expiry, and status.

Worker flow:

1. Authenticate named service principal; shared anonymous secrets are transitional risk.
2. Resolve an active service grant.
3. Query only jobs whose tenant is inside the grant and whose action/stage is allowed.
4. Transactionally claim one job, preserving tenant/application identity in the lease.
5. Re-read application, tenant status, ownership state, job stage, and referenced document/configuration.
6. Produce an action-specific authorization decision before Admin SDK reads/writes.
7. Persist correlated audit evidence and release/expire the lease safely.

The global scheduler is dispatch-only. It may hold `service.scheduler_dispatch`, but it cannot read borrower records or grant worker authority. Each worker independently authenticates and authorizes every claimed job. Cross-tenant batch operations must iterate bounded tenant-scoped work and never create a global data permission.

## L. Legacy unresolved-record strategy

Every current application lacking proven canonical ownership is represented as `unresolved_legacy`, `migration_pending`, or `migration_rejected`. New tenant-aware APIs, pages, workers, reports, documents, and exports deny those records. There is no fallback to creator email, user profile role, `companyProfileId`, current viewer, document path, or first tenant.

Migration requires a controlled, audited adjudication process with evidence, approved authority, idempotency, conflict detection, dry-run inventory, rollback/exception handling, and immutable before/after references. Only an individually adjudicated record becomes `tenant_owned`. Normal users cannot adjudicate ownership through an ordinary update.

## M. Authorization denial/error model

Public responses use stable PII-safe errors. Authentication errors remain SEC-001 errors. Authorization recommends:

- `TENANT_CONTEXT_REQUIRED`: tenant selection is absent or ambiguous;
- `MEMBERSHIP_INACTIVE`: safe generic membership failure where disclosure is acceptable;
- `AUTHORIZATION_REQUIRED`: the route reached authentication but no authorization decision exists;
- `FORBIDDEN`: permission/scope/resource authorization denied;
- `INTERNAL_ERROR`: authoritative dependency or contract failure.

For object lookup, prefer a generic `404`-equivalent `RESOURCE_NOT_FOUND` contract if added, identical for missing and inaccessible resources; otherwise use a generic `FORBIDDEN` without confirming existence. Exact public status choice requires API-contract approval. Never return role, membership status, tenant identifier, owner, borrower data, raw Firebase error, rule expression, or stack.

## N. Audit-event requirements

Every sensitive allow and material deny should emit a PII-safe event containing:

- event/schema/policy version and opaque event ID;
- request and correlation IDs;
- actor kind and opaque actor ID;
- tenant ID only in tenant-protected audit storage;
- permission/action and resource kind;
- opaque resource ID or keyed hash where appropriate;
- allow/deny and internal safe reason code;
- membership/service-grant, tenant-authorization, and resource versions;
- evaluated time, route ID, source category, and environment;
- branch/team/assignment constraint result without names or borrower content.

Logs must never contain token/cookie values, email, borrower identity, document text, report content, raw payload, or stack. Denial-rate telemetry should aggregate safe reason codes. Audit records are immutable, tenant-isolated, retention-governed, and inaccessible without `audit.read`/`audit.export`.

## O. Cache and revocation strategy

Authorization correctness should initially use uncached authoritative reads. Later bounded caches may cache only successful parsed tenant, membership, permission-set, or service-grant records using keys that include tenant ID, subject ID, and explicit authorization versions.

Required version sources:

- tenant `authorizationVersion`, incremented on status/security changes;
- membership `authorizationVersion`, incremented on role/status/branch/team changes;
- permission-set version, changed with the role matrix;
- service-grant version/status;
- resource version or ownership revision for action-specific decisions.

Membership/role/status changes must take effect immediately by transactional version increment and cache invalidation. High-risk operations (`decision.approve`, billing, membership management, audit export, ownership migration) bypass caches. Deny results should not be broadly cached. Cache failures fail closed. Pub/Sub/event invalidation may improve speed, but short TTL is not a substitute for version checking.

The current tenant/membership contracts have timestamps but no explicit authorization counters. Exact counter storage and invalidation infrastructure are UNKNOWN and must precede production caching.

## P. Firestore and Storage rules alignment

Server authorization and Firebase rules must enforce the same ownership invariants independently. The existing isolated rules are conservative test evidence, not production deployment configuration.

Firestore alignment:

- membership authority at `/tenants/{tenantId}/members/{uid}`;
- client reads require active membership and tenant-owned resource;
- creates bind `tenantId` and `createdBy` to server/authenticated authority;
- `tenantId`, `createdBy`, and `ownershipState` are immutable;
- membership roles/status are not self-writable;
- queries are tenant constrained; global collection reads cannot bypass rules;
- role permissions in rules remain conservative and mirror only client-supported operations;
- complex privileged commands move behind authorized server routes.

Storage alignment:

- tenant-prefixed paths;
- active membership and application tenant equality;
- metadata tenant/application/document identity equality;
- immutable ownership metadata;
- role/action checks for upload/delete;
- size/type restrictions and canonical document lifecycle;
- unresolved legacy paths denied or isolated.

Admin SDK bypasses rules, so server repositories must reproduce all applicable checks and emit decisions/audit evidence. Rules are defense in depth, not a substitute for the server resolver.

## Q. Exact SEC-002 implementation slices

1. **SEC-002-01 — Authorization contracts and permission registry.** Add versioned context/decision/reason/resource/permission contracts, conservative role matrix fixtures, parsers, immutability and no-production-import regressions.
2. **SEC-002-02 — Tenant and membership resolver.** Server-only repository resolves UID discovery, selected tenant, active tenant/membership, known role, branch/team scope, and version evidence using emulator tests.
3. **SEC-002-03 — Authorization decision engine.** Pure RBAC+ABAC evaluation for permissions, tenant/resource equality, legacy denial, branch/team/assignment constraints, and PII-safe decisions.
4. **SEC-002-04 — Authorization audit boundary and cache policy.** Immutable safe audit contract/sink boundary, version counters, invalidation behavior, high-risk cache bypass, and failure tests; no business migration.
5. **SEC-002-05 — Application repository and create ownership.** Canonical server lookup/create/update boundary, immutable `tenantId`/`createdBy`/ownership, unresolved denial, and API/emulator parity tests.
6. **SEC-002-06 — Application analyze migration.** Authenticate, authorize `application.analyze`, resolve canonical application/document, remove arbitrary URL trust, apply bounds, and prove direct-access negatives.
7. **SEC-002-07 — Document metadata/Storage migration.** Canonical document records, tenant paths, copy/checksum migration, upload/read/delete permissions, and production rule cutover.
8. **SEC-002-08 — Report and export authorization.** Authorize persisted application/decision package, reproducible report generation, immutable artifact access, export and audit controls.
9. **SEC-002-09 — Queue, assignment, conditions, and decision actions.** Server commands, branch/team/assignment ABAC, accountable approval, and UI/Firebase rule migration.
10. **SEC-002-10 — Tenant administration/configuration/billing.** Membership, profile, company/program/overlay/rule-pack ownership, Stripe mapping, explicit permissions, and audits.
11. **SEC-002-11 — Service, worker, and scheduler authorization.** Named principals, scoped service grants, tenant-local claims, global dispatch constraints, and Admin SDK parity.
12. **SEC-002-12 — Legacy adjudication and complete enforcement.** Controlled migration, unresolved isolation, route/rule matrix, cross-tenant browser/API/worker/report tests, operational revocation drills.

## R. Recommended first coding slice

Implement **SEC-002-01 only**. Define canonical immutable `AuthorizationContextV1` evolution, `AuthorizationDecisionV1`, permission/resource/reason vocabulary, explicit role-to-permission registry, safe parsers, synthetic fixtures, and regressions. Do not read Firestore, migrate routes, change rules, or mark any role matrix row approved beyond clearly labeled conservative provisional behavior.

This slice fixes vocabulary and makes authentication/authorization separation compile-time visible before repository I/O or production behavior changes.

## S. Prerequisites for application-analysis route migration

All of the following are required before `/api/applications/{id}/analyze` migrates:

1. SEC-001 user API authentication guard is retained with an explicit analyze route policy, bounded body handling, Origin/Host and CSRF behavior.
2. `AuthorizationContextV1`, `AuthorizationDecisionV1`, `application.analyze`, resource types, reason codes, policy version, and parsers are implemented and tested.
3. Active-tenant selection is approved and server-validated; multi-tenant ambiguity fails closed.
4. Tenant and membership resolver reads canonical records, requires active statuses/known role, and has emulator negative tests.
5. Approved role/permission mapping explicitly grants `application.analyze`; UNKNOWN roles/rows deny.
6. Canonical application repository loads by opaque ID, requires `tenant_owned`, validates immutable tenant ownership, and returns indistinguishable missing/cross-tenant failures.
7. Branch/team/assignment constraints for analyze are decided and implemented, or explicitly not applicable by approved policy.
8. Canonical document metadata and server-owned Storage reference exist for the selected document.
9. The route no longer fetches an arbitrary caller-supplied URL; downloads use an authorized canonical Storage object with type/size/time limits.
10. Configuration references used during analysis are tenant-owned or approved platform-shared and do not imply ownership.
11. Authorization is rechecked before material persistence; writes preserve tenant/creator/ownership and canonical application version.
12. PII-safe allow/deny audit events and correlated errors exist.
13. Direct-access tests cover missing, malformed, expired, revoked, disabled, missing membership, inactive membership, inactive tenant, unknown role, missing permission, cross-tenant ID, unresolved legacy, branch/team mismatch, missing document, forged URL/reference, oversized payload, CSRF, and internal failure.
14. Server/API checks and production Firestore/Storage rule behavior have an approved migration/parity plan. Client compatibility must not create a bypass.
15. Existing OCR, application, DTI, workflow, report, tenant, auth, build, and aggregate regressions pass.

## T. Product decisions requiring Quinton approval

- Whether a user with one active membership auto-selects it and how multi-tenant selection is persisted.
- Whether absent membership branch/team scopes mean tenant-wide access or no scoped access.
- The complete role-to-permission matrix, especially owner/admin limits.
- Underwriter application update/analyze/upload authority and assignment-only visibility.
- Loan-officer and processor condition, document deletion, assignment, and report permissions.
- Who may perform accountable `decision.approve`; whether additional separation-of-duties or recent-authentication rules apply.
- Whether tenant admin may manage billing and export audits, and whether owner actions require dual control.
- Branch/team resource fields, pooled assignment behavior, and cross-branch reassignment authority.
- Public error status for missing versus inaccessible resources.
- Authorization version-counter schema, acceptable cache TTLs, and high-risk no-cache operations.
- Which rule packs/configuration may be platform-shared versus tenant-owned.
- Legacy ownership adjudicators, evidence standard, exception workflow, and migration approval.
- Document deletion/retention/legal-hold policy.
- Service-principal issuance, rotation, allowed tenant scopes, and emergency revocation policy.
- Whether `/upload`, `/firebase-test`, and `/debug` remain, are retired, or require platform-only authorization.
- Whether public registration remains permitted and how an authenticated account obtains its first membership.

## Final recommendation

- **Recommended authorization model:** versioned RBAC permission baselines plus ABAC tenant/resource/branch/team/assignment constraints; one active tenant context per decision; separate named service grants; default deny.
- **Initial permission families:** application, document, condition, assignment, decision, report/export, queue, tenant/membership, configuration, billing, audit, and service/scheduler.
- **Proposed SEC-002 slices:** contracts; membership resolver; decision engine; audit/cache; application repository/create; analyze migration; document/Storage; reports/exports; workflow actions; administration/configuration/billing; services/workers; legacy/full enforcement.
- **Recommended first coding slice:** SEC-002-01 authorization contracts and permission registry only, with synthetic fixtures and no production imports.
- **Prerequisites for analyze-route migration:** approved active-tenant and permission policy, active membership resolver, tenant-owned application/document repositories, ABAC decision, no arbitrary URL, safe audit/errors, rule migration plan, and full negative/regression evidence.
- **Decisions requiring Quinton approval:** active-tenant UX, full permission matrix, owner/admin limits, branch/team semantics, approval authority, billing/audit powers, cache/version policy, shared configuration, legacy adjudication, service grants, diagnostic disposition, and registration-to-membership policy.
- **Exact file created:** `docs/SEC-002_AUTHORIZATION_DESIGN.md`
