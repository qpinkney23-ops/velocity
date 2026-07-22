import {
  validateIsoTimestamp,
  validateSchemaVersion,
  validateTenantId,
  validateUserId,
  type IsoTimestamp,
  type SchemaVersion,
  type TenantId,
  type UserId,
} from "./primitives";

declare const tenantSystemBrand: unique symbol;
type TenantSystemId<Name extends string> = string & { readonly [tenantSystemBrand]: Name };

export type BranchId = TenantSystemId<"BranchId">;
export type TeamId = TenantSystemId<"TeamId">;

export const TENANT_SCHEMA_VERSION = "tenant.v1" as SchemaVersion;
export const TENANT_MEMBERSHIP_SCHEMA_VERSION = "tenant-membership.v1" as SchemaVersion;
export const AUTHORIZATION_CONTEXT_SCHEMA_VERSION = "authorization-context.v1" as SchemaVersion;
export const LEGACY_OWNERSHIP_SCHEMA_VERSION = "legacy-ownership.v1" as SchemaVersion;
export const TENANT_CONTRACT_ADAPTER_VERSION = "tenant-contract-adapter.v1";

export const TENANT_STATUSES = ["active", "suspended", "disabled", "unknown"] as const;
export type TenantStatus = typeof TENANT_STATUSES[number];
export const MEMBERSHIP_STATUSES = ["invited", "pending", "active", "suspended", "disabled", "expired", "archived", "unknown"] as const;
export type MembershipStatus = typeof MEMBERSHIP_STATUSES[number];
export const TENANT_ROLES = ["owner", "admin", "underwriter", "processor", "loan_officer", "viewer", "service_account", "unknown"] as const;
export type TenantRole = typeof TENANT_ROLES[number];
export const LEGACY_OWNERSHIP_STATES = ["tenant_owned", "unresolved_legacy", "migration_pending", "migration_rejected"] as const;
export type LegacyOwnershipState = typeof LEGACY_OWNERSHIP_STATES[number];
export type MigrationStatus = "not_started" | "not_required" | "pending" | "completed" | "rejected" | "unknown";

export type TenantContractWarning = Readonly<{ code: string; field?: string; message: string }>;
export type TenantCompatibilityMetadata = Readonly<{
  sourceSchemaVersion?: string;
  migrationStatus: MigrationStatus;
  warnings: readonly TenantContractWarning[];
  legacyFieldNames: readonly string[];
  adapterVersion: string;
}>;

export type BranchReference = Readonly<{ branchId: BranchId; displayName?: string }>;
export type TeamReference = Readonly<{ teamId: TeamId; displayName?: string }>;

export type TenantConfigurationReferences = Readonly<{
  companyProfileId?: string;
  rulePackId?: string;
  programIds?: readonly string[];
  overlayIds?: readonly string[];
}>;

export type TenantV1 = Readonly<{
  schemaVersion: typeof TENANT_SCHEMA_VERSION;
  tenantId: TenantId;
  displayName: string;
  legalName?: string;
  status: TenantStatus;
  createdAt: IsoTimestamp;
  createdBy: UserId;
  updatedAt: IsoTimestamp;
  billingAccountId?: string;
  defaultCompanyProfileId?: string;
  configurationReferences?: TenantConfigurationReferences;
  compatibility: TenantCompatibilityMetadata;
}>;

export type TenantMembershipV1 = Readonly<{
  schemaVersion: typeof TENANT_MEMBERSHIP_SCHEMA_VERSION;
  tenantId: TenantId;
  userId: UserId;
  role: TenantRole;
  membershipStatus: MembershipStatus;
  createdAt: IsoTimestamp;
  createdBy: UserId;
  updatedAt: IsoTimestamp;
  invitedBy?: UserId;
  acceptedAt?: IsoTimestamp;
  disabledAt?: IsoTimestamp;
  branchIds?: readonly BranchId[];
  teamIds?: readonly TeamId[];
  compatibility: TenantCompatibilityMetadata;
}>;

export type AuthenticationSource = "firebase_auth" | "service_account";
export type AuthorizationSource = "tenant_membership";
export type ResolvedTenantMembershipContextV1 = Readonly<{
  schemaVersion: typeof AUTHORIZATION_CONTEXT_SCHEMA_VERSION;
  authenticatedUserId: UserId;
  tenantId: TenantId;
  membershipStatus: "active";
  role: Exclude<TenantRole, "unknown">;
  branchIds?: readonly BranchId[];
  teamIds?: readonly TeamId[];
  authenticationSource: AuthenticationSource;
  authorizationSource: AuthorizationSource;
  evaluatedAt: IsoTimestamp;
}>;

export type LegacyOwnershipV1 = Readonly<{
  schemaVersion: typeof LEGACY_OWNERSHIP_SCHEMA_VERSION;
  state: LegacyOwnershipState;
  tenantId?: TenantId;
  compatibility: TenantCompatibilityMetadata;
}>;

export type TenantContractResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; code: "invalid_tenant_contract" | "inactive_authorization"; message: string }>;

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SAFE_REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._:+-]{0,127}$/;
const MIGRATION_STATUSES: readonly MigrationStatus[] = ["not_started", "not_required", "pending", "completed", "rejected", "unknown"];

function fail<T>(code: "invalid_tenant_contract" | "inactive_authorization", message: string): TenantContractResult<T> {
  return Object.freeze({ ok: false, code, message });
}

function dedicatedId<T>(value: unknown, label: string): TenantContractResult<T> {
  return typeof value === "string" && ID.test(value)
    ? Object.freeze({ ok: true, value: value as T })
    : fail("invalid_tenant_contract", `${label} must be a valid safe identifier.`);
}

export const validateBranchId = (value: unknown) => dedicatedId<BranchId>(value, "Branch ID");
export const validateTeamId = (value: unknown) => dedicatedId<TeamId>(value, "Team ID");

export function validateTenantRole(value: unknown): TenantRole {
  return typeof value === "string" && TENANT_ROLES.includes(value as TenantRole) ? value as TenantRole : "unknown";
}
export function validateTenantStatus(value: unknown): TenantStatus {
  return typeof value === "string" && TENANT_STATUSES.includes(value as TenantStatus) ? value as TenantStatus : "unknown";
}
export function validateMembershipStatus(value: unknown): MembershipStatus {
  return typeof value === "string" && MEMBERSHIP_STATUSES.includes(value as MembershipStatus) ? value as MembershipStatus : "unknown";
}

function nonempty(value: unknown, maximum = 256): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= maximum ? trimmed : undefined;
}

function parseTimestamp(value: unknown, field: string): TenantContractResult<IsoTimestamp> {
  const result = validateIsoTimestamp(value);
  return result.ok ? result : fail("invalid_tenant_contract", `${field} must be a valid UTC timestamp.`);
}

function parseUserId(value: unknown, field: string): TenantContractResult<UserId> {
  const result = validateUserId(value);
  return result.ok ? result : fail("invalid_tenant_contract", `${field} must be a valid user identifier.`);
}

function parseCompatibility(value: unknown): TenantContractResult<TenantCompatibilityMetadata> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return fail("invalid_tenant_contract", "Compatibility metadata is required.");
  const raw = value as Record<string, unknown>;
  const migrationStatus = typeof raw.migrationStatus === "string" && MIGRATION_STATUSES.includes(raw.migrationStatus as MigrationStatus)
    ? raw.migrationStatus as MigrationStatus : "unknown";
  if (!Array.isArray(raw.warnings) || !Array.isArray(raw.legacyFieldNames))
    return fail("invalid_tenant_contract", "Compatibility warnings and legacy field names must be arrays.");
  const warnings: TenantContractWarning[] = [];
  for (const item of raw.warnings) {
    if (!item || typeof item !== "object" || Array.isArray(item))
      return fail("invalid_tenant_contract", "Compatibility warning is malformed.");
    const warning = item as Record<string, unknown>;
    const code = nonempty(warning.code, 64); const message = nonempty(warning.message, 256);
    if (!code || !message) return fail("invalid_tenant_contract", "Compatibility warning is malformed.");
    warnings.push(Object.freeze({ code, ...(nonempty(warning.field, 64) ? { field: nonempty(warning.field, 64) } : {}), message }));
  }
  const legacyFieldNames = raw.legacyFieldNames.map((item) => nonempty(item, 64));
  if (legacyFieldNames.some((item) => !item)) return fail("invalid_tenant_contract", "Legacy field name is malformed.");
  const adapterVersion = nonempty(raw.adapterVersion, 64);
  if (!adapterVersion) return fail("invalid_tenant_contract", "Compatibility adapter version is required.");
  return Object.freeze({ ok: true, value: Object.freeze({
    ...(nonempty(raw.sourceSchemaVersion, 64) ? { sourceSchemaVersion: nonempty(raw.sourceSchemaVersion, 64) } : {}),
    migrationStatus, warnings: Object.freeze(warnings),
    legacyFieldNames: Object.freeze(legacyFieldNames as string[]), adapterVersion,
  }) });
}

function parseOptionalIds<T>(value: unknown, validator: (item: unknown) => TenantContractResult<T>, field: string): TenantContractResult<readonly T[] | undefined> {
  if (value === undefined) return Object.freeze({ ok: true, value: undefined });
  if (!Array.isArray(value)) return fail("invalid_tenant_contract", `${field} must be an array when present.`);
  const parsed: T[] = [];
  for (const item of value) {
    const result = validator(item); if (!result.ok) return result; parsed.push(result.value);
  }
  if (new Set(parsed as unknown[]).size !== parsed.length) return fail("invalid_tenant_contract", `${field} must not contain duplicates.`);
  return Object.freeze({ ok: true, value: Object.freeze(parsed) });
}

function parseSafeReferences(value: unknown): TenantContractResult<readonly string[] | undefined> {
  if (value === undefined) return Object.freeze({ ok: true, value: undefined });
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !SAFE_REFERENCE.test(item)))
    return fail("invalid_tenant_contract", "Configuration reference list is malformed.");
  return Object.freeze({ ok: true, value: Object.freeze([...new Set(value as string[])]) });
}

export function parseTenant(input: unknown): TenantContractResult<TenantV1> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return fail("invalid_tenant_contract", "Tenant contract must be an object.");
  const raw = input as Record<string, unknown>;
  if (!validateSchemaVersion(raw.schemaVersion).ok || raw.schemaVersion !== TENANT_SCHEMA_VERSION)
    return fail("invalid_tenant_contract", "Tenant schema version is invalid.");
  const tenantId = validateTenantId(raw.tenantId); if (!tenantId.ok) return fail("invalid_tenant_contract", "Tenant identity is invalid.");
  const displayName = nonempty(raw.displayName); if (!displayName) return fail("invalid_tenant_contract", "Tenant display name is required.");
  const createdBy = parseUserId(raw.createdBy, "Tenant creator"); if (!createdBy.ok) return createdBy;
  const createdAt = parseTimestamp(raw.createdAt, "Tenant createdAt"); if (!createdAt.ok) return createdAt;
  const updatedAt = parseTimestamp(raw.updatedAt, "Tenant updatedAt"); if (!updatedAt.ok) return updatedAt;
  const compatibility = parseCompatibility(raw.compatibility); if (!compatibility.ok) return compatibility;
  let configurationReferences: TenantConfigurationReferences | undefined;
  if (raw.configurationReferences !== undefined) {
    if (!raw.configurationReferences || typeof raw.configurationReferences !== "object" || Array.isArray(raw.configurationReferences))
      return fail("invalid_tenant_contract", "Tenant configuration references are malformed.");
    const refs = raw.configurationReferences as Record<string, unknown>;
    const programIds = parseSafeReferences(refs.programIds); if (!programIds.ok) return programIds;
    const overlayIds = parseSafeReferences(refs.overlayIds); if (!overlayIds.ok) return overlayIds;
    configurationReferences = Object.freeze({
      ...(nonempty(refs.companyProfileId, 128) ? { companyProfileId: nonempty(refs.companyProfileId, 128) } : {}),
      ...(nonempty(refs.rulePackId, 128) ? { rulePackId: nonempty(refs.rulePackId, 128) } : {}),
      ...(programIds.value ? { programIds: programIds.value } : {}), ...(overlayIds.value ? { overlayIds: overlayIds.value } : {}),
    });
  }
  return Object.freeze({ ok: true, value: Object.freeze({
    schemaVersion: TENANT_SCHEMA_VERSION, tenantId: tenantId.value, displayName,
    ...(nonempty(raw.legalName) ? { legalName: nonempty(raw.legalName) } : {}), status: validateTenantStatus(raw.status),
    createdAt: createdAt.value, createdBy: createdBy.value, updatedAt: updatedAt.value,
    ...(nonempty(raw.billingAccountId, 128) ? { billingAccountId: nonempty(raw.billingAccountId, 128) } : {}),
    ...(nonempty(raw.defaultCompanyProfileId, 128) ? { defaultCompanyProfileId: nonempty(raw.defaultCompanyProfileId, 128) } : {}),
    ...(configurationReferences ? { configurationReferences } : {}), compatibility: compatibility.value,
  }) });
}

export function parseTenantMembership(input: unknown): TenantContractResult<TenantMembershipV1> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return fail("invalid_tenant_contract", "Membership contract must be an object.");
  const raw = input as Record<string, unknown>;
  if (raw.schemaVersion !== TENANT_MEMBERSHIP_SCHEMA_VERSION) return fail("invalid_tenant_contract", "Membership schema version is invalid.");
  const tenantId = validateTenantId(raw.tenantId); if (!tenantId.ok) return fail("invalid_tenant_contract", "Membership tenant identity is invalid.");
  const userId = parseUserId(raw.userId, "Membership user"); if (!userId.ok) return userId;
  const createdBy = parseUserId(raw.createdBy, "Membership creator"); if (!createdBy.ok) return createdBy;
  const createdAt = parseTimestamp(raw.createdAt, "Membership createdAt"); if (!createdAt.ok) return createdAt;
  const updatedAt = parseTimestamp(raw.updatedAt, "Membership updatedAt"); if (!updatedAt.ok) return updatedAt;
  const compatibility = parseCompatibility(raw.compatibility); if (!compatibility.ok) return compatibility;
  const branchIds = parseOptionalIds(raw.branchIds, validateBranchId, "Membership branch IDs"); if (!branchIds.ok) return branchIds;
  const teamIds = parseOptionalIds(raw.teamIds, validateTeamId, "Membership team IDs"); if (!teamIds.ok) return teamIds;
  const optionalUser = (value: unknown, field: string) => value === undefined ? Object.freeze({ ok: true, value: undefined }) as TenantContractResult<UserId | undefined> : parseUserId(value, field);
  const invitedBy = optionalUser(raw.invitedBy, "Membership inviter"); if (!invitedBy.ok) return invitedBy;
  const optionalTime = (value: unknown, field: string) => value === undefined ? Object.freeze({ ok: true, value: undefined }) as TenantContractResult<IsoTimestamp | undefined> : parseTimestamp(value, field);
  const acceptedAt = optionalTime(raw.acceptedAt, "Membership acceptedAt"); if (!acceptedAt.ok) return acceptedAt;
  const disabledAt = optionalTime(raw.disabledAt, "Membership disabledAt"); if (!disabledAt.ok) return disabledAt;
  return Object.freeze({ ok: true, value: Object.freeze({
    schemaVersion: TENANT_MEMBERSHIP_SCHEMA_VERSION, tenantId: tenantId.value, userId: userId.value,
    role: validateTenantRole(raw.role), membershipStatus: validateMembershipStatus(raw.membershipStatus),
    createdAt: createdAt.value, createdBy: createdBy.value, updatedAt: updatedAt.value,
    ...(invitedBy.value ? { invitedBy: invitedBy.value } : {}), ...(acceptedAt.value ? { acceptedAt: acceptedAt.value } : {}),
    ...(disabledAt.value ? { disabledAt: disabledAt.value } : {}), ...(branchIds.value ? { branchIds: branchIds.value } : {}),
    ...(teamIds.value ? { teamIds: teamIds.value } : {}), compatibility: compatibility.value,
  }) });
}

export function createAuthorizationContext(input: Readonly<{
  authenticatedUserId: unknown; tenant?: TenantV1; membership?: TenantMembershipV1;
  authenticationSource: unknown; authorizationSource: unknown; evaluatedAt: unknown;
}>): TenantContractResult<ResolvedTenantMembershipContextV1> {
  const userId = validateUserId(input.authenticatedUserId);
  if (!userId.ok) return fail("inactive_authorization", "Active authorization requires an authenticated user.");
  if (!input.tenant) return fail("inactive_authorization", "Active authorization requires a tenant.");
  if (!input.membership) return fail("inactive_authorization", "Active authorization requires a membership.");
  if (input.tenant.status !== "active") return fail("inactive_authorization", "Active authorization requires an active tenant.");
  if (input.membership.membershipStatus !== "active") return fail("inactive_authorization", "Active authorization requires an active membership.");
  if (input.membership.role === "unknown") return fail("inactive_authorization", "Active authorization requires a known role.");
  if (input.membership.userId !== userId.value || input.membership.tenantId !== input.tenant.tenantId)
    return fail("inactive_authorization", "Authorization identities do not match the tenant membership.");
  if (input.authenticationSource !== "firebase_auth" && input.authenticationSource !== "service_account")
    return fail("inactive_authorization", "Authentication source is not authoritative.");
  if (input.authorizationSource !== "tenant_membership") return fail("inactive_authorization", "Authorization source is not authoritative.");
  const evaluatedAt = parseTimestamp(input.evaluatedAt, "Authorization evaluatedAt"); if (!evaluatedAt.ok) return evaluatedAt;
  return Object.freeze({ ok: true, value: Object.freeze({
    schemaVersion: AUTHORIZATION_CONTEXT_SCHEMA_VERSION, authenticatedUserId: userId.value,
    tenantId: input.tenant.tenantId, membershipStatus: "active", role: input.membership.role,
    ...(input.membership.branchIds ? { branchIds: input.membership.branchIds } : {}),
    ...(input.membership.teamIds ? { teamIds: input.membership.teamIds } : {}),
    authenticationSource: input.authenticationSource, authorizationSource: "tenant_membership", evaluatedAt: evaluatedAt.value,
  }) });
}

export function parseLegacyOwnership(input: unknown): TenantContractResult<LegacyOwnershipV1> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return fail("invalid_tenant_contract", "Legacy ownership contract must be an object.");
  const raw = input as Record<string, unknown>;
  if (raw.schemaVersion !== LEGACY_OWNERSHIP_SCHEMA_VERSION || typeof raw.state !== "string" || !LEGACY_OWNERSHIP_STATES.includes(raw.state as LegacyOwnershipState))
    return fail("invalid_tenant_contract", "Legacy ownership state is invalid.");
  const compatibility = parseCompatibility(raw.compatibility); if (!compatibility.ok) return compatibility;
  if (raw.state === "tenant_owned") {
    const tenantId = validateTenantId(raw.tenantId); if (!tenantId.ok) return fail("invalid_tenant_contract", "Tenant-owned state requires a valid tenant identity.");
    return Object.freeze({ ok: true, value: Object.freeze({ schemaVersion: LEGACY_OWNERSHIP_SCHEMA_VERSION, state: "tenant_owned", tenantId: tenantId.value, compatibility: compatibility.value }) });
  }
  if (raw.tenantId !== undefined) return fail("invalid_tenant_contract", "Unresolved or rejected ownership cannot carry tenant identity.");
  return Object.freeze({ ok: true, value: Object.freeze({ schemaVersion: LEGACY_OWNERSHIP_SCHEMA_VERSION, state: raw.state as Exclude<LegacyOwnershipState, "tenant_owned">, compatibility: compatibility.value }) });
}

export function createBranchReference(branchId: unknown, displayName?: unknown): TenantContractResult<BranchReference> {
  const parsed = validateBranchId(branchId); if (!parsed.ok) return parsed;
  return Object.freeze({ ok: true, value: Object.freeze({ branchId: parsed.value, ...(nonempty(displayName) ? { displayName: nonempty(displayName) } : {}) }) });
}
export function createTeamReference(teamId: unknown, displayName?: unknown): TenantContractResult<TeamReference> {
  const parsed = validateTeamId(teamId); if (!parsed.ok) return parsed;
  return Object.freeze({ ok: true, value: Object.freeze({ teamId: parsed.value, ...(nonempty(displayName) ? { displayName: nonempty(displayName) } : {}) }) });
}
