# SEC-002 Production Closeout Runbook

Status: Awaiting operator execution. This document is not production evidence.

## Access gate

Before any operation, an accountable operator must record the deployment identifier, authenticated operator identity, approved change/ticket reference, safe test-tenant identifiers, maintenance window, rollback contact, and independent observer. Verify authenticated access separately to Firebase project administration, Firestore, Storage, the deployed application, the approved secret manager, service-principal controls, and relevant provider consoles. If any required access or approval is missing, stop without mutation.

Never capture secret values in commands, tickets, Markdown, logs, screenshots, fixtures, receipts, or shell history. Inject credentials from the approved secret manager directly into the deployed runtime.

## External credential rotation inventory

Rotate and invalidate every credential represented by the formerly tracked environment file and any derivative credential:

- Firebase Admin service-account private key and identity binding.
- Firebase browser API key restrictions and associated web configuration review.
- Session and cursor-signing secrets.
- Files-worker, AI-worker, scheduler, and legacy-inventory credentials.
- Stripe secret key and configured billing identifiers where exposure or unauthorized change is possible.
- Any deployment-platform environment copy, CI secret, local clone, or backup containing the old values.

Rotation evidence contains only provider, credential category, new version identifier, operator, timestamp, old-version revocation status, validation result, and evidence reference.

## Service-principal provisioning

For each of `files_worker`, `ai_worker`, `scheduler`, and `legacy_inventory_service`:

1. Confirm the named owner and approved environment/project.
2. Create a unique principal and random credential in the approved identity/secret system.
3. Create an active, versioned grant containing only the exact scopes required by the existing contract and an explicit tenant allowlist. Never use wildcards.
4. Bind the principal ID, credential version, and secret-manager reference to the production runtime. Confirm no secret is stored in Firestore, source control, build output, logs, or client bundles.
5. Exercise one bounded authorized request against a synthetic production test tenant; verify immutable command, authorization audit, execution audit, and receipt records.
6. Exercise missing, malformed, wrong-environment, wrong-scope, wrong-tenant, and replayed requests; all must deny without work.
7. Record non-secret evidence using the template below.

Scheduled rotation creates a new version, deploys it, validates authorized success, revokes the old version, and proves old-version denial. Emergency revocation first disables the grant and secret version, then proves denial, inspects outstanding leases/commands, escalates the incident, and issues a replacement only through a new approved change.

## Read-only legacy inventory

1. Confirm the `legacy_inventory_service` owner, exact inventory scopes, production project/environment allowlists, and operational feature gate.
2. Select an approved bounded page size and immutable command identifier. Do not provide tenant ownership hints.
3. Invoke only `POST /api/platform/legacy-ownership/inventory` through an approved deployment job that receives its credential in memory from the secret manager.
4. Continue only with server-issued class-bound cursors. Do not modify application, document, analysis, report, workflow, decision, evidence, or Storage records.
5. Capture per-class counts and opaque controlled-review references, command/receipt identifiers, grant version, source-version evidence, and audit references.
6. Verify unresolved resources remain inaccessible through browser, user API, worker, report, and document paths.
7. Present disposition classes to the founder. Stop. Migration requires a separate approved task with per-class authority and rollback.

## Deployed validation and revocation drill

Use synthetic production test tenants and resources only. Record request/correlation IDs and audit references for:

- Cross-tenant denial.
- Revoked and inactive membership denial.
- Worker, scheduler, and legacy-inventory principal revocation denial.
- Malformed identity, missing tenant, missing resource, unresolved legacy ownership, and dependency-failure denial.
- Browser denial of authoritative application records and mortgage-document objects.
- Authorized worker and scheduler success before revocation.
- Immutable audit, command, lease, and receipt verification.

Do not induce dependency failure in a shared customer environment. Use an approved isolated production test dependency or controlled deny configuration.

## Evidence template

| Field | Required value |
| --- | --- |
| Status | `Production verified`, `Failed`, or `Blocked` |
| Environment/project | Non-secret deployment identifier |
| Change approval | Ticket or approval reference |
| Operator and observer | Accountable identities |
| Action | Exact bounded operation |
| Principal/grant version | Non-secret identifiers |
| Tenant/resource | Synthetic opaque references only |
| Started/completed | UTC timestamps |
| Request/correlation/receipt | Non-secret identifiers |
| Expected/actual result | Allow or deny; no payload data |
| Audit verification | Immutable record reference and result |
| Rollback/revocation | Status and evidence reference |
| Limitations/findings | PII-free summary |

Repository regression output, emulator output, or a blank template must never be labeled production evidence.
