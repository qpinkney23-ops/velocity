# CORE-002 Tenant System Design

Task: `CORE-002-PREP-RETRY`  
Branch inspected: `enterprise-v1-lock`  
Status: design audit only; no production migration, rule change, configuration change, or capability-status change.

## Scope and evidence boundary

This design is based only on the governing documents and the allowed authentication, application, administration, settings, API, Firebase, role, rule, and middleware locations. Facts not established there are marked **UNKNOWN**. Existing tenant-like names are not treated as proof of ownership.

The current implementation establishes these facts:

- Firebase Authentication supplies a stable user UID.
- Registration writes `/users/{uid}` with email, name, a default `processor` role, and timestamps.
- The active root tree uses a client `AuthGuard`, not the available `AuthProvider` hook.
- Firestore rules allow any signed-in user to create, read, and update any application.
- Storage rules allow any signed-in user to read or write any application object.
- Application reads are global collection queries and application writes contain no tenant or creator ownership.
- Middleware contains a placeholder `isLoggedIn = true` and allows all `/api` paths through.
- Firebase Admin workers claim applications globally and bypass Firestore rules.
- Stripe checkout has no tenant/customer binding; the portal uses one environment-configured test customer.
- `companyProfileId` selects rule configuration in the AI worker. It is not a proven tenant identifier.
- The settings `workspaceName` is browser-local presentation data. It is not identity.
- A supported invitation, tenant-provisioning, branch, team, service-account, or tenant-billing lifecycle is **UNKNOWN/not found** in the inspected locations.

## A. Current-state risk map

| Surface | Current state | Risk | Required disposition |
|---|---|---|---|
| User identity | Firebase UID exists; pages rely on client auth state | Client navigation is not server authorization | Verify Firebase ID token/session at server boundaries |
| User profile and role | `/users/{uid}.role`; user can update own profile | Self-role escalation to `admin` | Remove role authority from user-writable profile; membership role is server-managed |
| Application creation | Direct client `addDoc` to global `/applications` | Any signed-in user creates globally visible records; no creator/tenant attribution | Server-authoritative create command with derived tenant and creator |
| Application reads | Global `/applications` listeners on list/detail/admin views | Every signed-in user can enumerate borrower data | Tenant-bound queries plus rules; direct-document reads verify membership |
| Application updates | Any signed-in user can update any application | Cross-customer tampering, assignment and decision corruption | Tenant/role/action authorization and immutable ownership fields |
| Application deletion | Global admin role may delete; role can self-escalate | Destructive cross-tenant access | Server-controlled lifecycle; tenant-scoped owner/admin policy; audit |
| Underwriters | Global `/underwriters` directory, not linked to `/users` | Cross-tenant assignment and ambiguous identity | Derive eligible assignees from active tenant memberships |
| Assignment | Application `underwriterId` written from client | No tenant, actor, reason, history, or eligibility check | Server command validates same-tenant membership and writes event/history |
| Storage | `applications/{applicationId}/...`; any signed-in access | Cross-tenant document disclosure/overwrite | Tenant-prefixed path, metadata linkage, membership rules, controlled migration |
| Analyze/report APIs | No consistent authenticated tenant guard found | Caller may submit another application's ID/URLs/data | Server auth, tenant lookup, role/action check, canonical application read |
| Workers | Admin SDK globally queries `/applications` by stage | Rules bypass; no tenant/config consistency validation | Service identity, explicit tenant authorization, tenant-aware claim/re-read |
| Cron | Shared secret triggers global workers | Secret compromise exposes broad privileged processing | Rotatable service credentials, least privilege, audit/correlation |
| Middleware | Placeholder auth and blanket API pass-through | False sense of server protection | SEC-001 server session enforcement; route catalog |
| Settings | `workspaceName` in localStorage | User-editable label could be mistaken for tenant | Keep presentation-only and never use for authorization |
| Company configuration | `companyProfileId`, programs, overlays, rule packs | Configuration can be mistaken for ownership or crossed between tenants | Independent tenant ownership plus tenant-scoped/config-authorized references |
| Stripe | Checkout metadata only names product/plan; portal uses fixed test customer | Billing session may not belong to requesting organization | Server-owned one-to-one Stripe customer-to-tenant mapping |
| Legacy records | Existing applications and Storage objects lack tenant | Ownership cannot be safely inferred | Mark unresolved; adjudicate explicitly; never auto-assign |
| Audit | No immutable tenant security/action ledger found | Ownership and privileged changes are not defensible | Server-written immutable tenant audit events |

## B. Recommended canonical model

### Definition of a Velocity tenant

A Velocity tenant is the permanent security, data-ownership, configuration, billing, and operational boundary for one subscribing customer organization. It is not an email domain, browser workspace label, branch, team, Firebase user, rule profile, Stripe customer, or application.

A tenant owns or governs:

- memberships and role grants;
- applications and their documents;
- assignments and operational configuration;
- tenant-specific rule/program/overlay selections;
- reports, exports, audit events, integrations, and billing relationship.

One Firebase user may belong to zero, one, or multiple tenants. Authorization is evaluated against the selected tenant membership for every action. A user identity alone grants no tenant data access.

### Why applications remain top-level initially

Use top-level `/applications/{applicationId}` with an immutable `tenantId` rather than immediately moving every application to `/tenants/{tenantId}/applications/{applicationId}`.

This is the safer incremental choice because every current page, worker, API, assignment action, and document link already addresses the top-level collection. Tenant nesting would require an all-at-once reference and query rewrite. Top-level applications remain secure when all of the following are simultaneously true:

1. `tenantId` is server-derived and immutable.
2. Rules require an active membership at `/tenants/{tenantId}/members/{request.auth.uid}`.
3. Client queries explicitly filter on the selected `tenantId`.
4. Server APIs re-read the application and authorize its tenant.
5. Admin SDK workers perform equivalent checks in code.

Nesting tenant-owned administrative resources under the tenant is preferred because those resources are new and have no migration cost. Storage should also adopt a tenant-prefixed path because its object path is the principal rules boundary.

### Relationship model

- **Firebase user:** global authentication identity; immutable UID.
- **User profile:** non-authoritative global display/contact record. It does not grant tenant role or access.
- **Tenant:** customer ownership and security boundary.
- **Membership:** authoritative link between a Firebase UID and one tenant; owns role and status.
- **Role:** tenant-local permission bundle stored only on server-managed membership.
- **Branch/team:** optional tenant-local organizational grouping, not a replacement for membership or tenant ownership.
- **Application:** globally unique record with one immutable tenant owner and optional branch/team references.
- **Document:** tenant-owned application child metadata plus tenant-prefixed Storage object.
- **Assignment:** tenant-owned, attributable link from an application to an eligible active membership.
- **Rule pack/program/overlay:** governed configuration owned by or explicitly published to a tenant; never evidence of application ownership.
- **Billing account:** server-owned relationship between exactly one tenant and Stripe customer/subscription identifiers.

## C. Canonical collections and paths

```text
users/{userId}

tenants/{tenantId}
tenants/{tenantId}/members/{userId}
tenants/{tenantId}/invitations/{invitationId}
tenants/{tenantId}/branches/{branchId}
tenants/{tenantId}/teams/{teamId}
tenants/{tenantId}/companyProfiles/{companyProfileId}
tenants/{tenantId}/programs/{programId}
tenants/{tenantId}/overlays/{overlayId}
tenants/{tenantId}/rulePacks/{rulePackId}
tenants/{tenantId}/billing/account
tenants/{tenantId}/auditEvents/{auditEventId}

users/{userId}/tenantMemberships/{tenantId}       # server-maintained discovery index only

applications/{applicationId}
applications/{applicationId}/documents/{documentId}
applications/{applicationId}/assignments/{assignmentId}
applications/{applicationId}/reportArtifacts/{reportArtifactId}
applications/{applicationId}/exportArtifacts/{exportArtifactId}

legacyApplications/{legacyRecordId}               # optional migration manifest, not copied borrower payload
tenantProvisioningRequests/{requestId}             # privileged bootstrap workflow
stripeCustomers/{stripeCustomerId}                 # server-only reverse lookup to tenantId
servicePrincipals/{servicePrincipalId}              # server-only metadata/permissions
```

Storage target:

```text
tenants/{tenantId}/applications/{applicationId}/documents/{documentId}/{objectVersionId}__{safeName}
tenants/{tenantId}/applications/{applicationId}/reports/{reportArtifactId}.pdf
tenants/{tenantId}/applications/{applicationId}/exports/{exportArtifactId}/{safeName}
```

The authoritative membership is `/tenants/{tenantId}/members/{userId}`. The user-side membership index exists only to discover selectable tenants and must be written transactionally by trusted server code. It cannot override the authoritative membership.

## D. Tenant schema

```ts
type TenantV1 = {
  schemaVersion: "tenant.v1";
  tenantId: TenantId;                    // same as document ID; immutable
  legalName: string;
  displayName: string;
  status: "provisioning" | "active" | "suspended" | "closed";
  defaultCurrency: string;               // approved configuration, not mortgage policy
  createdAt: ServerTimestamp;            // immutable
  createdBy: UserId | ServicePrincipalId;// immutable, attributable
  updatedAt: ServerTimestamp;
  version: number;                       // optimistic concurrency
};
```

Required server-generated or server-derived fields:

- `tenantId`, schema version, status initialization, timestamps, creator, and concurrency version.
- Billing identifiers, entitlement state, and provisioning outcome.
- Any security-sensitive default or verified-domain state if introduced later.

Allowed client proposals, subject to server validation:

- legal/display name and approved presentation preferences.
- A requested plan or onboarding input; the client never writes final entitlements.

Immutable identifiers:

- `tenantId`, Firebase `userId`, `applicationId`, `documentId`, assignment ID, audit event ID, report/export artifact ID, Stripe customer mapping ID, and published configuration version IDs.
- Application `tenantId`, `createdBy`, and original `createdAt` after creation.
- Membership `tenantId` and `userId`; role changes create audited updates rather than new identity.

## E. Membership schema

```ts
type TenantMembershipV1 = {
  schemaVersion: "tenant-membership.v1";
  tenantId: TenantId;                    // immutable; matches parent path
  userId: UserId;                        // immutable; matches document ID
  role: TenantRole;
  status: "invited" | "active" | "suspended" | "revoked";
  branchIds: BranchId[];
  teamIds: TeamId[];
  invitedBy?: UserId;
  invitationId?: InvitationId;
  activatedAt?: ServerTimestamp;
  createdAt: ServerTimestamp;
  updatedAt: ServerTimestamp;
  updatedBy: UserId | ServicePrincipalId;
  version: number;
};
```

Membership rules:

- A user cannot create or update their own authoritative membership.
- Email address is not the membership key; Firebase UID is.
- Role/status/branch/team grants are server-controlled and audited.
- Revocation fails closed immediately for new requests; session/custom-claim caching cannot be the only authority.
- Custom claims may optimize coarse authorization but Firestore membership remains authoritative and claims must be versioned/revocable.
- `/users/{uid}` may contain display name/email, but never an authoritative tenant role.

### Invitation flow

1. An authorized tenant owner/admin requests an invitation through an authenticated server endpoint.
2. Server validates inviter membership and requested role, creates a random high-entropy token, stores only its hash, expiry, intended email (if used), role, tenant, inviter, and status, then emits `membership.invited`.
3. Recipient authenticates with Firebase and submits the token to the server.
4. Server verifies hash, expiry, status, intended identity policy, and tenant state.
5. A transaction creates/activates the authoritative membership and user discovery index, consumes the invitation once, and emits `membership.accepted`.
6. Client cannot select a different tenant or role during acceptance.

Invitation delivery channel, expiry, email matching, resend behavior, and whether existing users may accept invitations sent to an alternate verified email are **UNKNOWN product decisions**.

### First owner bootstrap

The first owner must be created through a privileged provisioning operation, never normal self-registration. A platform administrator or controlled onboarding service verifies the customer and authenticated Firebase user, then atomically creates:

1. tenant in `provisioning` state;
2. owner membership for the verified UID;
3. user membership discovery index;
4. billing/onboarding placeholder without Stripe authority;
5. immutable bootstrap audit events;
6. tenant activation only after required checks succeed.

There is no current platform-administrator identity model; its implementation is a dependency and the exact approval authority is **UNKNOWN**.

## F. Role and authorization model

Canonical tenant roles:

- `owner`: tenant governance, owner succession, billing authority, and all admin permissions.
- `admin`: membership/operations administration except protected owner and billing actions unless explicitly granted.
- `underwriter`: assigned-file underwriting work and authorized decision actions.
- `processor`: intake, documents, profile completion, conditions, and operational work.
- `loan_officer`: create/view permitted files and borrower-facing workflow within approved scope.
- `viewer`: read-only permitted tenant data, excluding especially sensitive artifacts if policy requires.
- `service_account`: non-human principal with explicit capabilities, tenant scope, expiry/rotation, and no UI role inheritance.

The role names define application permissions, not mortgage authority. Exact approval, denial, waiver, exception, and condition-clearance authority remains governed elsewhere and must not be inferred here.

| Action | Owner | Admin | Underwriter | Processor | Loan officer | Viewer | Service account |
|---|---:|---:|---:|---:|---:|---:|---:|
| Read tenant profile | Yes | Yes | Yes | Yes | Yes | Yes | Scoped |
| Update tenant display/config | Yes | Yes | No | No | No | No | Explicit only |
| Manage billing | Yes | No by default | No | No | No | No | Billing service only |
| Invite standard members | Yes | Yes | No | No | No | No | Provisioning service only |
| Grant/change owner | Yes, protected | No | No | No | No | No | Bootstrap service only |
| Change non-owner roles | Yes | Yes with limits | No | No | No | No | Provisioning service only |
| Suspend/revoke members | Yes | Yes with limits | No | No | No | No | Provisioning service only |
| Create application | Yes | Yes | Configurable | Yes | Yes | No | Explicit capability |
| Read applications | Yes | Yes | Tenant/assignment policy | Tenant policy | Tenant policy | Read-only policy | Explicit capability |
| Update operational fields | Yes | Yes | Role/action scoped | Role/action scoped | Role/action scoped | No | Explicit capability |
| Assign underwriter | Yes | Yes | No by default | Configurable | No | No | Assignment service only |
| Upload/read documents | Yes | Yes | Scoped | Scoped | Scoped | Read policy only | Explicit capability |
| Issue decision/report | Governed | Governed | Governed underwriter action | No | No | No | Report service only; no human decision |
| Delete/close application | Protected policy | Protected policy | No by default | No | No | No | Retention service only |
| Read audit events | Yes | Yes | Limited | Limited | Limited | No by default | Audit export service |

Every `Configurable`, `Scoped`, `Tenant policy`, or `Governed` cell requires an approved permission definition before implementation. It is not permission to guess behavior.

Role escalation prevention:

- Deny client writes to membership role/status and tenant ownership.
- Move role authority out of `/users/{uid}`.
- Require server reauthentication/authorization for privileged changes.
- Prevent an admin from granting `owner`, modifying owners, or exceeding their own grant set.
- Require at least one active owner unless an approved break-glass process applies.
- Use transaction/version checks to prevent stale concurrent grants.
- Emit immutable before/after audit events.

## G. Existing-data migration strategy

Existing applications and Storage objects are `legacy_unresolved`, not members of any tenant.

1. Freeze representative fixtures and inventory every legacy application ID, object path, creator clues, configuration references, and integrity checksum without assigning ownership.
2. Add compatibility readers that distinguish `tenant_owned` from `legacy_unresolved`.
3. Create an access-controlled migration manifest containing record ID, current paths, evidence considered, adjudication status, actor, reason, and timestamps. Do not duplicate borrower PII into the manifest.
4. Require an authorized migration reviewer to assign a tenant using external/customer-approved evidence. `companyProfileId`, email domain, workspace name, underwriter, and Stripe test customer are insufficient by themselves.
5. Validate that referenced configuration and assignees are valid for the chosen tenant; unresolved conflicts block migration.
6. Transactionally write immutable `tenantId`, migration metadata/version, and audit event. Preserve unknown original creator as unknown; do not fabricate `createdBy`.
7. Copy and verify Storage objects as described below.
8. Run tenant-read parity and cross-tenant negative tests.
9. Mark migration verified only after Firestore and Storage integrity agree.
10. Retire legacy access only after an approved rollback window; delete legacy bytes only under retention policy.

Compatibility rules:

- Current production behavior remains unchanged until a separately approved cutover.
- New tenant-aware paths fail closed on unresolved records.
- A privileged, audited remediation surface may access unresolved records; ordinary tenant users may not.
- Do not dual-write indefinitely. Use bounded compatibility phases with metrics and exit criteria.
- Do not silently default missing tenant, creator, membership, role, or configuration.

Adding `tenantId` is structurally tolerated by most current `any`/spread readers, but current global queries and rules would still leak data. Field addition alone is not a tenant migration.

## H. Firestore rules migration strategy

Target helper behavior:

```text
isSignedIn()
membership(tenantId) = get(/tenants/{tenantId}/members/{request.auth.uid})
isActiveMember(tenantId)
hasRole(tenantId, allowedRoles)
ownershipUnchanged() = request.resource.data.tenantId == resource.data.tenantId
creatorMatchesAuth() = request.resource.data.createdBy == request.auth.uid
```

Target enforcement:

- Deny all client writes to authoritative membership roles/status and tenant provisioning.
- Tenant reads require active membership.
- Application create requires an active membership, allowed create role, server-approved schema, immutable tenant ID, and creator equal to authenticated UID. Prefer a server create endpoint; rules remain defense in depth.
- Application reads/updates require active membership in `resource.data.tenantId` plus action permission.
- Application updates cannot change tenant ID, creator, schema lineage, or protected audit fields.
- Assignment writes validate same-tenant active target membership and eligible role, preferably through a server command.
- Child document/report/export rules derive ownership from the parent application and verify duplicated tenant IDs when used.
- User profiles allow only an explicit safe field allowlist; no role, tenant, entitlement, or privileged status writes.
- Tenantless legacy applications are denied to ordinary clients after cutover.

Phased rule rollout:

1. Build emulator fixtures and authorization matrix before modifying deployed rules.
2. Add new tenant collections with deny-by-default rules while existing application rules remain unchanged.
3. Provision test tenant/members through trusted server code.
4. Introduce tenant-aware repositories/queries behind a controlled migration flag.
5. Verify every page/API/worker and direct-document path against emulator tests.
6. Cut over application create/read/update rules together with compatible clients and server APIs.
7. Remove broad legacy access after migration evidence and rollback readiness.

Required negative tests include anonymous access, nonmember, suspended/revoked member, wrong tenant, forged tenant/creator, self-role change, cross-tenant assignment, stale membership version, legacy unresolved record, and direct document ID access.

## I. Storage path migration strategy

Current paths `applications/{applicationId}/...` have no tenant boundary. Target paths must be tenant-prefixed and use stable document IDs.

Migration algorithm:

1. Resolve application tenant through approved Firestore migration; unresolved applications are not copied into a tenant path.
2. Enumerate each legacy object server-side and record source path, size, content type, checksum/generation, and application metadata reference.
3. Allocate stable `documentId` and target object/version path server-side.
4. Copy bytes server-side without borrower-device round trip.
5. Verify checksum, byte count, metadata, application ID, tenant ID, and target generation.
6. Create canonical document metadata referencing both target and temporary legacy source lineage.
7. Switch reads to target only after verification; writes go only to target after cutover.
8. Keep legacy object read-only during the rollback window.
9. Record migration and access events; delete old bytes only after approved retention/rollback criteria.

Target Storage rules must require active tenant membership from the path tenant, validate that application metadata has the same tenant, restrict write types/sizes/actions, and prohibit tenant/path changes. Download URLs are bearer-like access and must not be treated as authorization; issuance and logging require review.

## J. Worker/Admin SDK authorization strategy

Firebase Admin bypasses Firestore and Storage rules. Every privileged process therefore requires an application-layer authorization contract.

- Give each worker a named service principal with explicit tenant/action capabilities, credential rotation, status, and audit identity.
- Replace one undifferentiated global authorization assumption with `ServiceAuthorizationContext` containing principal ID, allowed tenants or approved global scheduler scope, capabilities, request correlation, and credential version.
- Jobs/applications must contain immutable `tenantId`. Workers reject `legacy_unresolved` records on tenant-aware paths.
- Claims may remain top-level for incremental compatibility, but the query/result must include tenant ID and the transaction must re-read the application, active tenant, service permission, job stage, and lease.
- Configuration references must resolve to the same tenant or an explicitly published platform configuration. A matching `companyProfileId` does not authorize access.
- Storage object paths must start with the claimed tenant/application prefix and match canonical document metadata before download.
- Writes must preserve tenant ID and use idempotency/version checks.
- Logs/errors contain tenant/application opaque IDs and correlation IDs where needed, never borrower PII or extracted document text by default.
- Cron scheduling may be global, but each claimed unit is authorized and audited independently.
- Service-account access, failed authorization, cross-tenant reference, claim, completion, retry, and override events are recorded.

The exact cloud IAM/service-account implementation is **UNKNOWN** from the inspected repository and requires SEC/OPS design.

### Minimum audit-event catalog

Audit events are immutable, server-generated, tenant-owned records containing event ID, tenant ID, actor user/service principal, action, target type/ID, request correlation, reason where required, safe before/after references or hashes, source, server timestamp, and schema version. They must not duplicate borrower PII unnecessarily.

Required event families:

- tenant provisioning, activation, suspension, closure, and protected setting changes;
- first-owner creation, invitation issue/resend/revoke/expire/accept, membership activation/suspension/revocation, role/branch/team changes, and owner transfer;
- authentication/session denial relevant to tenant access, tenant-context selection/change, and authorization denial;
- application creation, ownership adjudication/migration, attempted ownership change, assignment/reassignment/unassignment, protected workflow action, and deletion/closure request;
- document upload, migration, checksum verification, access/download where required, replacement, quarantine, and deletion;
- worker/service claim, authorization, completion, retry, dead letter, cross-tenant/config mismatch, and manual requeue/override;
- configuration create/review/publish/activate/rollback/retire and application configuration binding;
- report/export generation, download/access, supersession, integrity failure, and deletion/retention action;
- Stripe customer mapping, checkout/portal creation, webhook receipt/deduplication/reconciliation, subscription/entitlement change, and billing mapping failure;
- migration adjudication, rollback, verification, unresolved-record access, and legacy-access retirement;
- service-principal creation, scope/credential rotation, suspension/revocation, and privileged use.

High-volume read events may use an approved security-access log rather than one Firestore event per read, but the retention, integrity, tenant scope, and audit-export behavior is **UNKNOWN** pending compliance and operations approval.

### Reports and exports

Every report/export artifact must contain or reference immutable:

- tenant ID, application ID, artifact ID, decision-package ID/version, report/export schema version;
- generator service/user, generation time, source package checksum, artifact checksum;
- access/redaction profile and supersession lineage.

The artifact metadata lives under the application and bytes live under its tenant-prefixed Storage path. Server generation re-reads application ownership and membership/service authorization. No caller-supplied tenant ID is trusted, and reports cannot cross-reference another tenant's package or configuration.

## K. Stripe ownership strategy

Stripe is a billing provider, not tenant identity authority.

Canonical relationship:

```text
tenants/{tenantId}/billing/account
  tenantId
  stripeCustomerId
  subscriptionIds
  status
  entitlementVersion
  createdAt / updatedAt

stripeCustomers/{stripeCustomerId}
  tenantId
  environment
  createdAt
```

Requirements:

- Only authenticated, authorized server endpoints create checkout/portal sessions.
- Server derives tenant from membership/session; client never supplies authoritative tenant or Stripe customer IDs.
- Create/reuse exactly one approved Stripe customer mapping per tenant per environment.
- Checkout, subscription, and webhook metadata carry opaque tenant ID plus environment and correlation identifiers.
- Signed webhooks are the source for billing state; events are idempotent, ordered/reconciled, tenant-mapped, and audited.
- Portal uses the requesting tenant's mapped Stripe customer, never a fixed environment customer.
- Billing status and entitlements are server-managed and do not grant Firestore membership.
- Test and production mappings are strictly separated.

Whether one tenant may have multiple billing accounts, parent/child billing, reseller billing, and which roles may manage billing are **UNKNOWN product decisions**.

### Configuration ownership

`companyProfiles`, `programs`, `overlays`, and rule packs must be related to a tenant without becoming its identity:

- Move/adapt tenant-specific configuration beneath `/tenants/{tenantId}/...`.
- Applications retain independent immutable `tenantId` plus explicit versioned configuration references.
- A configuration reference must resolve within the same tenant unless it points to an immutable, platform-published global template with explicit visibility.
- `companyProfileId` remains a configuration/profile reference and is never aliased to `tenantId`.
- Publishing, activation, rollback, and effective dating are server-authorized and audited.
- Migration from current top-level configuration requires an explicit ownership decision; ownership is **UNKNOWN** and cannot be inferred from IDs.

## L. Proposed CORE-002 implementation slices

Dependency order is exact; later slices do not begin until the preceding acceptance evidence exists.

1. **CORE-002-01 — Tenant contract and authorization fixtures.** Add compile-time/runtime tenant, membership, role, branch/team reference, authorization-context, and legacy-unresolved contracts plus synthetic fixtures. No production imports or persistence changes.
2. **CORE-002-02 — Emulator authorization harness.** Add Firebase emulator configuration/tests for target membership, tenant, application, and user-profile rules. Do not deploy restrictive rules yet.
3. **CORE-002-03 — Privileged tenant bootstrap service.** Implement server-authenticated provisioning transaction, first-owner membership, discovery index, audit events, idempotency, and tests. No self-service tenant creation.
4. **CORE-002-04 — Tenant session/context resolution.** Implement SEC-001-backed server session verification, active membership resolution, tenant selection for multi-tenant users, revocation/version behavior, and client read-only context.
5. **CORE-002-05 — Membership and invitation lifecycle.** Add privileged invite/accept/revoke/role-change commands, protected owner rules, audit, and negative tests.
6. **CORE-002-06 — Tenant-aware application repository and read adapters.** Introduce bounded repositories/queries for top-level applications filtered by immutable tenant ID; keep production screens on legacy paths until parity is proven.
7. **CORE-002-07 — New application ownership cutover.** Resume CORE-001-SLICE-03B through a server-authoritative create command using verified tenant and Firebase UID; deploy matching rules and parity tests together.
8. **CORE-002-08 — Existing application ownership adjudication.** Build migration manifest/tooling, explicit assignment workflow, unresolved quarantine, audit, rollback, and per-record verification.
9. **CORE-002-09 — Tenant-aware application consumer migration.** Move list, dashboard, borrower, queue, admin, detail, assignment, analyze, and report paths one at a time with cross-tenant tests.
10. **CORE-002-10 — Document metadata and Storage migration.** Introduce canonical document IDs/metadata, tenant paths, server copy/checksum verification, dual-read window, and Storage rule cutover.
11. **CORE-002-11 — Worker/service authorization.** Add service principals, tenant-aware claims/config/storage validation, idempotency, audit, and unresolved-record rejection.
12. **CORE-002-12 — Configuration tenancy.** Migrate/adapt company profiles, programs, overlays, and rule packs under explicit tenant ownership without changing mortgage logic.
13. **CORE-002-13 — Stripe tenant ownership.** Add server tenant/customer mapping, authenticated checkout/portal, signed idempotent webhooks, entitlements, environment separation, and audit.
14. **CORE-002-14 — Legacy access retirement and evidence review.** Remove broad rules/queries/paths only after migration reconciliation, emulator/browser/API/worker tests, rollback drill, and security approval.

No slice marks CORE-002 locked. Each production slice needs its own approved scope and rollback evidence.

## M. Dependencies on SEC-001 and SEC-002

### SEC-001 — server-side authentication

Required before privileged tenant production behavior:

- verified Firebase ID token or governed server session on every nonpublic API;
- expiry/revocation handling and consistent non-sensitive errors;
- protected bootstrap, invitation, application, report, Stripe, and admin endpoints;
- separate authenticated service-principal handling for workers/cron;
- removal of placeholder middleware assumptions.

CORE-002 may define contracts and emulator fixtures before SEC-001 is complete. It must not trust client UID/tenant claims in production.

### SEC-002 — tenant isolation and least privilege

Required for production cutover:

- authoritative membership and permission enforcement;
- Firestore and Storage cross-tenant denial;
- immutable tenant/creator ownership;
- self-role escalation prevention;
- same-tenant assignment and configuration validation;
- Admin SDK/service authorization and security review;
- tenant-aware APIs, reports, exports, billing, and audit;
- negative emulator/API/browser/worker tests.

CORE-002 owns the tenant data model and migration. SEC-002 owns proof that every access path enforces it. The capabilities must be implemented together at production boundaries.

## N. Recommended first coding slice

Implement **CORE-002-01 only**:

- New contract-only modules under `lib/contracts/` for `TenantV1`, `TenantMembershipV1`, tenant roles, branch/team references, service authorization context, and `LegacyTenantOwnership = unresolved | adjudicated | migrated`.
- Dedicated runtime validators with PII-safe errors.
- Synthetic tenant/membership/authorization fixtures.
- Compile-time and runtime regressions proving immutable identifier types, no client role mutation API, same-tenant reference validation, unresolved legacy representation, and no production imports.
- A field/permission matrix fixture that later emulator tests can consume.

Do not modify pages, APIs, Firebase initialization, Firestore/Storage rules, persistence, middleware, workers, Stripe, current records, or `ApplicationCreateV1` in this slice.

This is the smallest safe slice because it fixes vocabulary and failure semantics without creating a fake tenant, changing access, or asserting ownership of legacy data.

### Gate before CORE-001-SLICE-03B resumes

All of the following must be true:

1. A real tenant has been provisioned through the approved bootstrap path.
2. The authenticated creator has an active authoritative membership.
3. Server-side auth derives Firebase UID; it is not accepted from request data.
4. Server-side tenant context derives from membership/selection; it is not generated or inferred by the client.
5. Application-create authorization and same-tenant invariants pass emulator/API tests.
6. Firestore rules bind `tenantId` and `createdBy` to authenticated authority and make them immutable.
7. The create command and current readers have an approved compatibility/cutover plan.
8. Cross-tenant, creator-spoofing, revoked-member, and unresolved-legacy tests pass.
9. Audit events record application creation and ownership.
10. Rollback behavior is tested without orphaning or exposing records.

Until then, the 03A builder remains isolated and the production create page remains unchanged.

## O. Open product decisions requiring Quinton approval

1. Whether a Firebase user may belong to multiple tenants and how active tenant selection works.
2. Who acts as platform provisioning authority and what evidence approves the first owner.
3. Whether owners may transfer ownership, how many owners are required, and the break-glass process.
4. Final permission matrix for application visibility, creation, assignment, document access, reports, and administrative actions.
5. Whether underwriters see all tenant files or only assigned/pooled files.
6. Whether branches/teams restrict access or are organizational filters only.
7. Invitation expiry, delivery channel, verified-email matching, resend, and acceptance policy.
8. Whether `viewer` may access borrower PII, documents, reports, or audit history.
9. Service-account scope model, credential lifetime, and customer-managed integration principals.
10. Who may adjudicate legacy ownership and what evidence is sufficient.
11. Retention and rollback window for legacy Firestore references and Storage objects.
12. Whether any current `companyProfiles`, programs, overlays, or rule packs belong to a real customer; ownership is currently UNKNOWN.
13. Whether platform-published shared rule packs are allowed and how tenant overlays reference them.
14. Billing authority, one-versus-many Stripe accounts, parent/reseller billing, suspension, and entitlement behavior.
15. Required audit retention, export access, and legal-hold behavior.
16. Whether top-level applications with immutable tenant ID is approved for Enterprise V1 or a later nested-path migration is required.

## Recommended canonical model

Use Firebase UID as global identity; `/tenants/{tenantId}/members/{uid}` as authoritative tenant-local role/status; top-level `/applications/{applicationId}` with immutable server-derived `tenantId` and `createdBy`; tenant-prefixed Storage; tenant-owned configuration, billing, and audit subcollections; and explicit service-principal authorization for Admin SDK work. Treat every current tenantless record as unresolved until individually adjudicated.

## Critical security decisions

- Membership—not user profile, email domain, localStorage, or `companyProfileId`—grants tenant access.
- Clients cannot write tenant ownership, creator identity, membership role/status, billing authority, or entitlements.
- Server APIs derive user and tenant context and rules independently enforce them.
- Admin SDK processes reproduce tenant authorization explicitly.
- No unresolved legacy record enters normal tenant workflows.

## Exact files likely involved

The following are likely implementation locations, not authorization to change them in this task:

- `lib/contracts/primitives.ts`, `lib/contracts/index.ts`, and new tenant contract/fixture modules.
- `lib/firebase.ts`, `lib/firebase-admin.ts`, `lib/roles.ts`.
- `components/auth/AuthGuard.tsx`, `components/auth/AuthProvider.tsx`.
- `app/auth/register/page.tsx`, `app/auth/login/page.tsx`.
- `app/applications/new/page.tsx`, `app/applications/page.tsx`, `app/applications/[id]/page.tsx`.
- `app/admin/page.tsx`, `app/settings/page.tsx`.
- Application analyze/report APIs; worker, cron, Stripe, and configuration/debug APIs under `app/api/`.
- `firestore.rules`, `storage.rules`, `middleware.ts`.
- New server auth, tenant repository, membership, invitation, audit, migration, Storage, service-authorization, and billing modules/routes.
- New contract, emulator, API, worker, Storage, migration, and browser regression fixtures/tests.
