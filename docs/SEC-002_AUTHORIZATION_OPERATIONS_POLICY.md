# SEC-002 Authorization Operations Policy

Status: locked for supported SEC-002 production surfaces

Policy version: `authorization-policy.v1`

Permission version: `authorization-permissions.v1`

## Authority model

Authorization is deny-by-default. A Firebase user must have a canonical authenticated identity, an explicitly selected active tenant, an active membership in that tenant, a recognized role, the required permission, and a resource whose canonical tenant ownership matches the selected tenant. Missing, inactive, revoked, malformed, unresolved legacy, or dependency-failure state denies access.

The locked role policy is:

- `owner`: tenant-wide operational authority represented by the canonical matrix, including membership, configuration, billing management, audit export, and all supported application/document/workflow operations.
- `admin`: tenant administration, membership/configuration management, and supported application/document/workflow operations; no billing management or audit export.
- `underwriter`: supported application/document/evidence operations and explicit approve/deny authority.
- `loan_officer` and `processor`: supported application/document/evidence/workflow operations without approve/deny authority.
- `viewer`: supported read-only tenant/application/document/decision/report/queue/configuration/billing/audit access.
- `service_account`: no human-role permissions. Authority comes only from a named, active, versioned service grant.
- `unknown`: no permissions.

Permission vocabulary does not itself expose an operation. Unsupported membership, billing, audit, or tenant mutations remain unavailable until a separately governed production surface exists.

## Scope and high-risk operations

Current supported user operations are tenant-wide within the selected tenant. Assignment, branch, and team constraints are explicitly non-applicable; they are never inferred from claims or client input. A future branch/team-scoped surface must define authoritative scope resolution and fail closed when that scope is missing before it can be enabled.

Approve/deny, membership invite/manage, tenant/configuration/billing management, audit export, ownership migration, permission management, document deletion, and service execution are high-risk. They require authoritative reads, explicit permission or named service scope, resource checks, immutable audit, and transaction-time rechecks where a write can race with authority or resource state.

## Operational cache decision

Authorization decisions and resolved authority are not cached in production. Every request re-reads authoritative tenant, membership, service-grant, and resource state. This deliberately favors immediate revocation and correctness over latency. Versioned cache-key primitives remain non-production infrastructure only; enabling any cache requires a new reviewed policy and complete invalidation proof.

## Admin SDK privilege-boundary audit

Every production Admin SDK consumer was reviewed. The logical least-privilege boundary is enforced in application code because the Firebase Admin SDK itself bypasses client security rules.

| Boundary | Production modules | Required controls / disposition |
| --- | --- | --- |
| Admin initialization | `lib/firebase-admin.ts` | Server-only singleton; no route-level authority. |
| Authentication | `firebaseAdminAuthAdapter.ts`, `firebaseSessionCookie.ts` | Intentional exception: Admin Auth verifies identity/session before tenant context exists; tenant/resource authority is not granted here. |
| Canonical authority and audit | tenant/application/document resolvers; authorization audit persistence | Authoritative uncached reads, active-state checks, ownership matching, fail-closed dependencies, immutable audit writes. These are internal dependencies, not request entry points. |
| Application read/create/analyze/workflow/decision | application production adapters, projections, workflow and decision commands | Canonical user authentication precedes tenant/permission/resource authorization. Writes use transactions or fresh rechecks and required audit/receipt records. |
| Documents/evidence/reports | authorized document bytes, document cutover, evidence repository, report orchestrator | Parent application and tenant relationship checks, canonical storage prefixes, bounded operations, immutable provenance/audit. |
| Governance/billing | governance audit and Stripe billing adapters | Explicit tenant authority and billing/audit permissions; idempotency, immutable audit, and no client-supplied ownership authority. |
| Scheduler/workers | scheduler and worker service authorization plus worker routes | Named service principals, active versioned grants, tenant allowlists, signed/replay-resistant requests, bounded targets, leases, fresh resource checks, and audit/receipts. Intentional route-level Admin SDK exception: worker execution is colocated with the handler after service authorization; it grants no user access and is constrained to the authorized tenant set. |
| Legacy ownership | inventory and platform command modules | Named platform service scope only; read-only inventory by default; automatic migration remains prohibited and unresolved ownership denies ordinary access. |

No public diagnostic route is an intentional Admin SDK exception. Production readiness/dummy GET handlers on scheduler and worker execution routes are absent; those endpoints accept only authorized POST commands.

## Remaining product decisions

Branch/team segmentation is not required by any currently supported surface and remains a future, separately reviewed product decision. Executable legacy ownership adjudication remains prohibited pending customer-specific evidence and governed migration authorization. Neither gap permits access today.
