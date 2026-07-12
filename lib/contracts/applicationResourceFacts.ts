import { parseResolvedResourceFacts, RESOLVED_RESOURCE_FACTS_V1, type ResolvedResourceFactsV1 } from "./authorization";
import { validateApplicationId, validateIsoTimestamp, validateSchemaVersion, validateTenantId, validateUserId, type ApplicationId, type IsoTimestamp, type SchemaVersion, type TenantId, type UserId } from "./primitives";
import { validateBranchId, validateTeamId, type BranchId, type TeamId } from "./tenantSystem";

export const APPLICATION_RESOURCE_FACTS_V1 = "application-resource-facts.v1" as SchemaVersion;
export const APPLICATION_RESOURCE_RESOLVER_VERSION = "application-resource-resolver.v1";
export const APPLICATION_OWNERSHIP_STATES = ["tenant_owned", "unresolved_legacy", "migration_pending", "migration_rejected"] as const;
export type ApplicationOwnershipState = typeof APPLICATION_OWNERSHIP_STATES[number];

export type ResolvedApplicationResourceFactsV1 = Readonly<{
  schemaVersion: typeof APPLICATION_RESOURCE_FACTS_V1;
  resourceType: "application";
  applicationId: ApplicationId;
  ownershipState: ApplicationOwnershipState;
  tenantId?: TenantId;
  resourceAuthorizationVersion: string;
  applicationStatus: string;
  createdBy?: UserId;
  assignedUnderwriterId?: UserId;
  assignedProcessorId?: UserId;
  branchId?: BranchId;
  teamIds: readonly TeamId[];
  sourceRecordVersion: Readonly<{ kind: "authorization_version" | "updated_at_compatibility" | "legacy_unversioned"; value: string }>;
  warnings: readonly string[];
  resolvedAt: IsoTimestamp;
  resolverVersion: typeof APPLICATION_RESOURCE_RESOLVER_VERSION;
  provenance: Readonly<{ source: "firestore_admin" | "dependency_injected"; collection: "applications"; lookup: "document_id"; authoritativeFieldsOnly: true; piiPresent: false }>;
}>;

export type ApplicationResourceContractResult = Readonly<{ ok: true; value: ResolvedApplicationResourceFactsV1 }> | Readonly<{ ok: false; code: "invalid_application_resource_contract" }>;
const VERSION = /^[A-Za-z0-9][A-Za-z0-9._:+-]{0,127}$/;
const STATUS = /^[A-Za-z0-9][A-Za-z0-9 _.-]{0,63}$/;
const unique = <T>(input: unknown, validator: (v: unknown) => { ok: boolean; value?: T }): readonly T[] | undefined => {
  if (!Array.isArray(input)) return undefined;
  const values: T[] = [];
  for (const item of input) { const parsed = validator(item); if (!parsed.ok || parsed.value === undefined) return undefined; values.push(parsed.value); }
  return new Set(values).size === values.length ? Object.freeze(values) : undefined;
};

export function parseResolvedApplicationResourceFacts(input: unknown): ApplicationResourceContractResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) return Object.freeze({ ok: false, code: "invalid_application_resource_contract" });
  const raw = input as Record<string, any>;
  const applicationId = validateApplicationId(raw.applicationId), tenantId = raw.tenantId === undefined ? undefined : validateTenantId(raw.tenantId);
  const createdBy = raw.createdBy === undefined ? undefined : validateUserId(raw.createdBy), underwriter = raw.assignedUnderwriterId === undefined ? undefined : validateUserId(raw.assignedUnderwriterId), processor = raw.assignedProcessorId === undefined ? undefined : validateUserId(raw.assignedProcessorId);
  const branch = raw.branchId === undefined ? undefined : validateBranchId(raw.branchId), teams = unique(raw.teamIds, validateTeamId), resolvedAt = validateIsoTimestamp(raw.resolvedAt);
  const source = raw.sourceRecordVersion;
  const valid = validateSchemaVersion(raw.schemaVersion).ok && raw.schemaVersion === APPLICATION_RESOURCE_FACTS_V1 && raw.resourceType === "application" && applicationId.ok && APPLICATION_OWNERSHIP_STATES.includes(raw.ownershipState) && (!tenantId || tenantId.ok) && (raw.ownershipState === "tenant_owned" ? !!tenantId?.ok : tenantId === undefined) && VERSION.test(raw.resourceAuthorizationVersion || "") && STATUS.test(raw.applicationStatus || "") && (!createdBy || createdBy.ok) && (!underwriter || underwriter.ok) && (!processor || processor.ok) && (!branch || branch.ok) && !!teams && source && ["authorization_version", "updated_at_compatibility", "legacy_unversioned"].includes(source.kind) && VERSION.test(source.value || "") && Array.isArray(raw.warnings) && raw.warnings.every((w: unknown) => typeof w === "string" && w.length > 0 && w.length <= 128) && resolvedAt.ok && raw.resolverVersion === APPLICATION_RESOURCE_RESOLVER_VERSION && ["firestore_admin", "dependency_injected"].includes(raw.provenance?.source) && raw.provenance?.collection === "applications" && raw.provenance?.lookup === "document_id" && raw.provenance?.authoritativeFieldsOnly === true && raw.provenance?.piiPresent === false;
  if (!valid) return Object.freeze({ ok: false, code: "invalid_application_resource_contract" });
  return Object.freeze({ ok: true, value: deepFreeze({ ...raw, applicationId: applicationId.value, ...(tenantId?.ok ? { tenantId: tenantId.value } : {}), teamIds: teams, resolvedAt: resolvedAt.value }) as ResolvedApplicationResourceFactsV1 });
}

export function toResolvedResourceFacts(facts: ResolvedApplicationResourceFactsV1): ResolvedResourceFactsV1 {
  const parsed = parseResolvedResourceFacts({ schemaVersion: RESOLVED_RESOURCE_FACTS_V1, resourceType: "application", resourceId: facts.applicationId, ...(facts.tenantId ? { tenantId: facts.tenantId } : {}), ...(facts.branchId ? { branchId: facts.branchId } : {}), teamIds: facts.teamIds, assignedUserIds: [facts.assignedUnderwriterId, facts.assignedProcessorId].filter(Boolean), assignedTeamIds: [], ...(facts.createdBy ? { creatorId: facts.createdBy } : {}), legacyState: facts.ownershipState, resourceStatus: facts.applicationStatus });
  if (!parsed.ok) throw new Error("Validated application facts were incompatible with ResolvedResourceFactsV1.");
  return parsed.value;
}

function deepFreeze<T>(value: T): T { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const nested of Object.values(value as any)) deepFreeze(nested); } return value; }
