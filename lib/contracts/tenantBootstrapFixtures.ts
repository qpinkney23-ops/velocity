import { TENANT_BOOTSTRAP_REQUEST_SCHEMA_VERSION } from "./tenantBootstrap";

const freeze = <T>(value: T): Readonly<T> => Object.freeze(value);
const base = freeze({ schemaVersion: TENANT_BOOTSTRAP_REQUEST_SCHEMA_VERSION, requestedTenantDisplayName: "Synthetic Platform Tenant", initiatingAuthenticatedUserId: "bootstrap_admin", provisioningAuthorityType: "platform_admin", idempotencyKey: "bootstrap-alpha-001", requestedAt: "2026-07-11T12:00:00.000Z", compatibility: freeze({ source: "privileged_tenant_bootstrap", notes: freeze(["synthetic fixture"]) }) });

export const tenantBootstrapFixtures = freeze({
  tenantId: "tenant_bootstrap_alpha",
  platformAdmin: base,
  controlledMigration: freeze({ ...base, requestedTenantDisplayName: "Synthetic Migrated Tenant", initiatingAuthenticatedUserId: "migration_service", provisioningAuthorityType: "controlled_migration", idempotencyKey: "bootstrap-migration-001" }),
  identicalRetry: freeze({ ...base }),
  conflictingRetry: freeze({ ...base, requestedTenantDisplayName: "Conflicting Synthetic Tenant" }),
  duplicateTenant: freeze({ ...base, idempotencyKey: "bootstrap-duplicate-tenant" }),
  malformedTenantId: "tenant/invalid",
  malformedUser: freeze({ ...base, initiatingAuthenticatedUserId: "user/invalid" }),
  invalidAuthority: freeze({ ...base, provisioningAuthorityType: "ordinary_authenticated_user" }),
  missingIdempotency: freeze({ ...base, idempotencyKey: "" }),
  malformedTimestamp: freeze({ ...base, requestedAt: "not-a-timestamp" }),
  ordinaryUserAttempt: freeze({ verified: false, authorityType: "ordinary_authenticated_user", authenticatedUserId: "ordinary_user" }),
  partialWriteFailure: freeze({ ...base, idempotencyKey: "bootstrap-partial-failure" }),
  existingMembershipConflict: freeze({ ...base, idempotencyKey: "bootstrap-membership-conflict" }),
  auditEventCollision: freeze({ ...base, idempotencyKey: "bootstrap-audit-collision" }),
  unresolvedLegacyRecord: freeze({ applicationId: "legacy_tenantless", ownershipState: "unresolved_legacy" }),
});
