import {
  AUTHORIZATION_CONTEXT_SCHEMA_VERSION,
  LEGACY_OWNERSHIP_SCHEMA_VERSION,
  TENANT_CONTRACT_ADAPTER_VERSION,
  TENANT_MEMBERSHIP_SCHEMA_VERSION,
  TENANT_SCHEMA_VERSION,
} from "./tenantSystem";

const compatibility = Object.freeze({
  sourceSchemaVersion: "synthetic.v1", migrationStatus: "not_required" as const,
  warnings: Object.freeze([]), legacyFieldNames: Object.freeze([]), adapterVersion: TENANT_CONTRACT_ADAPTER_VERSION,
});
const legacyCompatibility = (migrationStatus: "not_started" | "pending") => Object.freeze({
  sourceSchemaVersion: "unversioned", migrationStatus,
  warnings: Object.freeze([{ code: "unresolved_tenant", field: "tenantId", message: "Legacy ownership has not been established." }]),
  legacyFieldNames: Object.freeze(["companyProfileId"]), adapterVersion: TENANT_CONTRACT_ADAPTER_VERSION,
});
const createdAt = "2026-01-01T00:00:00.000Z";
const updatedAt = "2026-01-02T00:00:00.000Z";

export const tenantSystemFixtures = Object.freeze({
  activeTenant: Object.freeze({ schemaVersion: TENANT_SCHEMA_VERSION, tenantId: "tenant_fixture-001", displayName: "Fixture Tenant", legalName: "Fixture Tenant LLC", status: "active", createdAt, createdBy: "user_owner-001", updatedAt, billingAccountId: "billing_fixture-001", defaultCompanyProfileId: "profile_fixture-001", configurationReferences: Object.freeze({ companyProfileId: "profile_fixture-001", rulePackId: "rulepack_fixture-001", programIds: Object.freeze(["program_fixture-001"]), overlayIds: Object.freeze(["overlay_fixture-001"]) }), compatibility }),
  suspendedTenant: Object.freeze({ schemaVersion: TENANT_SCHEMA_VERSION, tenantId: "tenant_fixture-002", displayName: "Suspended Fixture", status: "suspended", createdAt, createdBy: "user_owner-001", updatedAt, compatibility }),
  unknownTenantStatus: Object.freeze({ schemaVersion: TENANT_SCHEMA_VERSION, tenantId: "tenant_fixture-003", displayName: "Unknown Fixture", status: "future_status", createdAt, createdBy: "user_owner-001", updatedAt, compatibility }),
  activeOwnerMembership: Object.freeze({ schemaVersion: TENANT_MEMBERSHIP_SCHEMA_VERSION, tenantId: "tenant_fixture-001", userId: "user_owner-001", role: "owner", membershipStatus: "active", createdAt, createdBy: "user_owner-001", updatedAt, acceptedAt: updatedAt, branchIds: Object.freeze(["branch_fixture-001"]), teamIds: Object.freeze(["team_fixture-001"]), compatibility }),
  activeProcessorMembership: Object.freeze({ schemaVersion: TENANT_MEMBERSHIP_SCHEMA_VERSION, tenantId: "tenant_fixture-001", userId: "user_processor-001", role: "processor", membershipStatus: "active", createdAt, createdBy: "user_owner-001", updatedAt, compatibility }),
  invitedMembership: Object.freeze({ schemaVersion: TENANT_MEMBERSHIP_SCHEMA_VERSION, tenantId: "tenant_fixture-001", userId: "user_invited-001", role: "viewer", membershipStatus: "invited", createdAt, createdBy: "user_owner-001", updatedAt, invitedBy: "user_owner-001", compatibility }),
  suspendedMembership: Object.freeze({ schemaVersion: TENANT_MEMBERSHIP_SCHEMA_VERSION, tenantId: "tenant_fixture-001", userId: "user_suspended-001", role: "processor", membershipStatus: "suspended", createdAt, createdBy: "user_owner-001", updatedAt, compatibility }),
  disabledMembership: Object.freeze({ schemaVersion: TENANT_MEMBERSHIP_SCHEMA_VERSION, tenantId: "tenant_fixture-001", userId: "user_disabled-001", role: "processor", membershipStatus: "disabled", createdAt, createdBy: "user_owner-001", updatedAt, disabledAt: updatedAt, compatibility }),
  unknownMembershipStatus: Object.freeze({ schemaVersion: TENANT_MEMBERSHIP_SCHEMA_VERSION, tenantId: "tenant_fixture-001", userId: "user_unknown-status-001", role: "processor", membershipStatus: "future_status", createdAt, createdBy: "user_owner-001", updatedAt, compatibility }),
  unknownRole: Object.freeze({ schemaVersion: TENANT_MEMBERSHIP_SCHEMA_VERSION, tenantId: "tenant_fixture-001", userId: "user_unknown-role-001", role: "future_role", membershipStatus: "active", createdAt, createdBy: "user_owner-001", updatedAt, compatibility }),
  serviceAccountMembership: Object.freeze({ schemaVersion: TENANT_MEMBERSHIP_SCHEMA_VERSION, tenantId: "tenant_fixture-001", userId: "service_worker-001", role: "service_account", membershipStatus: "active", createdAt, createdBy: "user_owner-001", updatedAt, compatibility }),
  unresolvedLegacyOwnership: Object.freeze({ schemaVersion: LEGACY_OWNERSHIP_SCHEMA_VERSION, state: "unresolved_legacy", compatibility: legacyCompatibility("not_started") }),
  migrationPendingOwnership: Object.freeze({ schemaVersion: LEGACY_OWNERSHIP_SCHEMA_VERSION, state: "migration_pending", compatibility: legacyCompatibility("pending") }),
  branchReference: Object.freeze({ branchId: "branch_fixture-001", displayName: "Fixture Branch" }),
  teamReference: Object.freeze({ teamId: "team_fixture-001", displayName: "Fixture Team" }),
  malformedTenantId: Object.freeze({ schemaVersion: TENANT_SCHEMA_VERSION, tenantId: "Fixture Person@example.invalid", displayName: "Sensitive Fixture", status: "active", createdAt, createdBy: "user_owner-001", updatedAt, compatibility }),
  malformedUserIdMembership: Object.freeze({ schemaVersion: TENANT_MEMBERSHIP_SCHEMA_VERSION, tenantId: "tenant_fixture-001", userId: "Fixture Person@example.invalid", role: "owner", membershipStatus: "active", createdAt, createdBy: "user_owner-001", updatedAt, compatibility }),
  malformedTimestampTenant: Object.freeze({ schemaVersion: TENANT_SCHEMA_VERSION, tenantId: "tenant_fixture-004", displayName: "Time Fixture", status: "active", createdAt: "2026-99-99", createdBy: "user_owner-001", updatedAt, compatibility }),
  authorizationShape: Object.freeze({ schemaVersion: AUTHORIZATION_CONTEXT_SCHEMA_VERSION, authenticationSource: "firebase_auth", authorizationSource: "tenant_membership", evaluatedAt: updatedAt }),
});

export const tenantAuthorizationCaseFixtures = Object.freeze({
  validAuthorizationContext: Object.freeze({ authenticatedUserId: "user_owner-001", tenantFixture: "activeTenant", membershipFixture: "activeOwnerMembership" }),
  missingTenant: Object.freeze({ authenticatedUserId: "user_owner-001", membershipFixture: "activeOwnerMembership" }),
  missingMembership: Object.freeze({ authenticatedUserId: "user_owner-001", tenantFixture: "activeTenant" }),
  inactiveMembership: Object.freeze({ authenticatedUserId: "user_invited-001", tenantFixture: "activeTenant", membershipFixture: "invitedMembership" }),
});
