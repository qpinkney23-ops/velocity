import {
  validateIsoTimestamp,
  validateTenantId,
  validateUserId,
  type IsoTimestamp,
  type SchemaVersion,
  type TenantId,
  type UserId,
} from "./primitives";
import {
  TENANT_MEMBERSHIP_SCHEMA_VERSION,
  TENANT_SCHEMA_VERSION,
  type TenantCompatibilityMetadata,
  type TenantConfigurationReferences,
  type TenantMembershipV1,
  type TenantV1,
} from "./tenantSystem";

export const TENANT_BOOTSTRAP_REQUEST_SCHEMA_VERSION = "tenant-bootstrap-request.v1" as SchemaVersion;
export const TENANT_BOOTSTRAP_PLAN_SCHEMA_VERSION = "tenant-bootstrap-plan.v1" as SchemaVersion;
export const TENANT_BOOTSTRAP_PRODUCER_VERSION = "tenant-bootstrap-plan-builder.v1";
export const TENANT_DISCOVERY_SCHEMA_VERSION = "user-tenant-discovery.v1" as SchemaVersion;
export const TENANT_BOOTSTRAP_AUDIT_SCHEMA_VERSION = "tenant-audit-event.v1" as SchemaVersion;
export const TENANT_BOOTSTRAP_IDEMPOTENCY_SCHEMA_VERSION = "tenant-bootstrap-idempotency.v1" as SchemaVersion;

export const PROVISIONING_AUTHORITIES = ["platform_admin", "approved_internal_service", "controlled_migration"] as const;
export type ProvisioningAuthorityType = typeof PROVISIONING_AUTHORITIES[number];

export type TenantBootstrapCompatibilityMetadata = Readonly<{
  source: "privileged_tenant_bootstrap";
  sourceSchemaVersion?: string;
  notes: readonly string[];
}>;

export type TenantBootstrapRequestV1 = Readonly<{
  schemaVersion: typeof TENANT_BOOTSTRAP_REQUEST_SCHEMA_VERSION;
  requestedTenantDisplayName: string;
  legalName?: string;
  initiatingAuthenticatedUserId: UserId;
  provisioningAuthorityType: ProvisioningAuthorityType;
  idempotencyKey: string;
  requestedAt: IsoTimestamp;
  approvedConfigurationReferences?: TenantConfigurationReferences;
  compatibility: TenantBootstrapCompatibilityMetadata;
}>;

export type TenantDiscoveryRecordV1 = Readonly<{
  schemaVersion: typeof TENANT_DISCOVERY_SCHEMA_VERSION;
  tenantId: TenantId;
  userId: UserId;
  membershipPath: string;
  role: "owner";
  membershipStatus: "active";
  createdAt: IsoTimestamp;
}>;

export type TenantBootstrapAuditEventV1 = Readonly<{
  schemaVersion: typeof TENANT_BOOTSTRAP_AUDIT_SCHEMA_VERSION;
  eventId: string;
  eventType: "tenant_bootstrapped";
  tenantId: TenantId;
  actorUserId: UserId;
  authorityType: ProvisioningAuthorityType;
  occurredAt: IsoTimestamp;
  idempotencyKey: string;
  immutable: true;
}>;

export type TenantBootstrapIdempotencyRecordV1 = Readonly<{
  schemaVersion: typeof TENANT_BOOTSTRAP_IDEMPOTENCY_SCHEMA_VERSION;
  idempotencyKey: string;
  tenantId: TenantId;
  requestFingerprint: string;
  completedAt: IsoTimestamp;
  status: "completed";
}>;

export type TenantBootstrapPersistencePathsV1 = Readonly<{
  tenant: string;
  ownerMembership: string;
  userDiscovery: string;
  idempotency: string;
  auditEvent: string;
}>;

export type TenantBootstrapPlanV1 = Readonly<{
  schemaVersion: typeof TENANT_BOOTSTRAP_PLAN_SCHEMA_VERSION;
  producerVersion: typeof TENANT_BOOTSTRAP_PRODUCER_VERSION;
  tenantId: TenantId;
  tenant: TenantV1;
  firstOwnerMembership: TenantMembershipV1 & Readonly<{ role: "owner"; membershipStatus: "active" }>;
  userDiscovery: TenantDiscoveryRecordV1;
  auditEvent: TenantBootstrapAuditEventV1;
  idempotency: TenantBootstrapIdempotencyRecordV1;
  persistencePaths: TenantBootstrapPersistencePathsV1;
  warnings: readonly string[];
  assumptions: readonly string[];
}>;

export type TenantBootstrapBuildResult =
  | Readonly<{ ok: true; value: TenantBootstrapPlanV1 }>
  | Readonly<{ ok: false; code: "invalid_bootstrap_request" | "unapproved_authority"; message: string }>;

const SAFE_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SAFE_REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._:+-]{0,127}$/;
const text = (value: unknown, max = 256) => typeof value === "string" && value.trim() && value.trim().length <= max ? value.trim() : undefined;
const fail = (code: "invalid_bootstrap_request" | "unapproved_authority", message: string): TenantBootstrapBuildResult => Object.freeze({ ok: false, code, message });
const compatibility: TenantCompatibilityMetadata = Object.freeze({ migrationStatus: "not_required", warnings: Object.freeze([]), legacyFieldNames: Object.freeze([]), adapterVersion: TENANT_BOOTSTRAP_PRODUCER_VERSION });

function references(value: unknown): TenantConfigurationReferences | undefined | false {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const raw = value as Record<string, unknown>;
  const single = (item: unknown) => item === undefined ? undefined : typeof item === "string" && SAFE_REFERENCE.test(item) ? item : false;
  const list = (item: unknown) => item === undefined ? undefined : Array.isArray(item) && item.every((v) => typeof v === "string" && SAFE_REFERENCE.test(v)) && new Set(item).size === item.length ? Object.freeze([...(item as string[])]) : false;
  const companyProfileId = single(raw.companyProfileId), rulePackId = single(raw.rulePackId), programIds = list(raw.programIds), overlayIds = list(raw.overlayIds);
  if ([companyProfileId, rulePackId, programIds, overlayIds].includes(false)) return false;
  return Object.freeze({ ...(companyProfileId ? { companyProfileId } : {}), ...(rulePackId ? { rulePackId } : {}), ...(programIds ? { programIds } : {}), ...(overlayIds ? { overlayIds } : {}) });
}

function stableFingerprint(input: TenantBootstrapRequestV1, tenantId: TenantId): string {
  const refs = input.approvedConfigurationReferences;
  return JSON.stringify({ schemaVersion: input.schemaVersion, tenantId, requestedTenantDisplayName: input.requestedTenantDisplayName, legalName: input.legalName ?? null, initiatingAuthenticatedUserId: input.initiatingAuthenticatedUserId, provisioningAuthorityType: input.provisioningAuthorityType, idempotencyKey: input.idempotencyKey, requestedAt: input.requestedAt, approvedConfigurationReferences: refs ? { companyProfileId: refs.companyProfileId ?? null, rulePackId: refs.rulePackId ?? null, programIds: refs.programIds ?? [], overlayIds: refs.overlayIds ?? [] } : null, compatibility: input.compatibility });
}

/** Pure boundary: performs no I/O and creates no identity or time values. */
export function buildTenantBootstrapPlan(input: unknown, suppliedTenantId: unknown): TenantBootstrapBuildResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) return fail("invalid_bootstrap_request", "Bootstrap request must be an object.");
  const raw = input as Record<string, unknown>;
  if (raw.schemaVersion !== TENANT_BOOTSTRAP_REQUEST_SCHEMA_VERSION) return fail("invalid_bootstrap_request", "Bootstrap request schema version is invalid.");
  const tenantId = validateTenantId(suppliedTenantId); if (!tenantId.ok) return fail("invalid_bootstrap_request", "Supplied tenant identity is invalid.");
  const userId = validateUserId(raw.initiatingAuthenticatedUserId); if (!userId.ok) return fail("invalid_bootstrap_request", "Authenticated initiator is required.");
  if (typeof raw.provisioningAuthorityType !== "string" || !PROVISIONING_AUTHORITIES.includes(raw.provisioningAuthorityType as ProvisioningAuthorityType)) return fail("unapproved_authority", "Provisioning authority is not approved.");
  const displayName = text(raw.requestedTenantDisplayName); if (!displayName) return fail("invalid_bootstrap_request", "Tenant display name is required.");
  const legalName = raw.legalName === undefined ? undefined : text(raw.legalName); if (raw.legalName !== undefined && !legalName) return fail("invalid_bootstrap_request", "Tenant legal name is invalid.");
  if (typeof raw.idempotencyKey !== "string" || !SAFE_KEY.test(raw.idempotencyKey)) return fail("invalid_bootstrap_request", "Idempotency key is required and must be a safe identifier.");
  const requestedAt = validateIsoTimestamp(raw.requestedAt); if (!requestedAt.ok) return fail("invalid_bootstrap_request", "Request timestamp must be a valid UTC timestamp.");
  const refs = references(raw.approvedConfigurationReferences); if (refs === false) return fail("invalid_bootstrap_request", "Approved configuration references are malformed.");
  if (!raw.compatibility || typeof raw.compatibility !== "object" || Array.isArray(raw.compatibility)) return fail("invalid_bootstrap_request", "Compatibility metadata is required.");
  const c = raw.compatibility as Record<string, unknown>;
  if (c.source !== "privileged_tenant_bootstrap" || !Array.isArray(c.notes) || c.notes.some((n) => !text(n, 256))) return fail("invalid_bootstrap_request", "Compatibility metadata is invalid.");
  const request = Object.freeze({ schemaVersion: TENANT_BOOTSTRAP_REQUEST_SCHEMA_VERSION, requestedTenantDisplayName: displayName, ...(legalName ? { legalName } : {}), initiatingAuthenticatedUserId: userId.value, provisioningAuthorityType: raw.provisioningAuthorityType as ProvisioningAuthorityType, idempotencyKey: raw.idempotencyKey, requestedAt: requestedAt.value, ...(refs ? { approvedConfigurationReferences: refs } : {}), compatibility: Object.freeze({ source: "privileged_tenant_bootstrap" as const, ...(text(c.sourceSchemaVersion, 64) ? { sourceSchemaVersion: text(c.sourceSchemaVersion, 64) } : {}), notes: Object.freeze([...(c.notes as string[])]) }) });
  const paths = Object.freeze({ tenant: `tenants/${tenantId.value}`, ownerMembership: `tenants/${tenantId.value}/members/${userId.value}`, userDiscovery: `userTenantMemberships/${userId.value}/tenants/${tenantId.value}`, idempotency: `tenantBootstrapRequests/${raw.idempotencyKey}`, auditEvent: `tenants/${tenantId.value}/auditEvents/bootstrap:${raw.idempotencyKey}` });
  const tenant = Object.freeze({ schemaVersion: TENANT_SCHEMA_VERSION, tenantId: tenantId.value, displayName, ...(legalName ? { legalName } : {}), status: "active" as const, createdAt: requestedAt.value, createdBy: userId.value, updatedAt: requestedAt.value, ...(refs ? { configurationReferences: refs } : {}), compatibility });
  const owner = Object.freeze({ schemaVersion: TENANT_MEMBERSHIP_SCHEMA_VERSION, tenantId: tenantId.value, userId: userId.value, role: "owner" as const, membershipStatus: "active" as const, createdAt: requestedAt.value, createdBy: userId.value, updatedAt: requestedAt.value, acceptedAt: requestedAt.value, compatibility });
  const fingerprint = stableFingerprint(request, tenantId.value);
  return Object.freeze({ ok: true, value: Object.freeze({ schemaVersion: TENANT_BOOTSTRAP_PLAN_SCHEMA_VERSION, producerVersion: TENANT_BOOTSTRAP_PRODUCER_VERSION, tenantId: tenantId.value, tenant, firstOwnerMembership: owner, userDiscovery: Object.freeze({ schemaVersion: TENANT_DISCOVERY_SCHEMA_VERSION, tenantId: tenantId.value, userId: userId.value, membershipPath: paths.ownerMembership, role: "owner", membershipStatus: "active", createdAt: requestedAt.value }), auditEvent: Object.freeze({ schemaVersion: TENANT_BOOTSTRAP_AUDIT_SCHEMA_VERSION, eventId: `bootstrap:${raw.idempotencyKey}`, eventType: "tenant_bootstrapped", tenantId: tenantId.value, actorUserId: userId.value, authorityType: raw.provisioningAuthorityType as ProvisioningAuthorityType, occurredAt: requestedAt.value, idempotencyKey: raw.idempotencyKey, immutable: true }), idempotency: Object.freeze({ schemaVersion: TENANT_BOOTSTRAP_IDEMPOTENCY_SCHEMA_VERSION, idempotencyKey: raw.idempotencyKey, tenantId: tenantId.value, requestFingerprint: fingerprint, completedAt: requestedAt.value, status: "completed" }), persistencePaths: paths, warnings: Object.freeze([]), assumptions: Object.freeze(["Caller supplied tenant identity and timestamp.", "SEC-001/SEC-002 authentication enforcement is required before production execution."]) }) });
}
