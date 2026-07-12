import { createHash } from "node:crypto";
import { APPLICATION_RESOURCE_FACTS_V1, APPLICATION_RESOURCE_RESOLVER_VERSION, parseResolvedApplicationResourceFacts, type ResolvedApplicationResourceFactsV1 } from "../../contracts/applicationResourceFacts";
import { validateApplicationId, validateIsoTimestamp, validateTenantId, validateUserId } from "../../contracts/primitives";
import { validateBranchId, validateTeamId } from "../../contracts/tenantSystem";
import type { CorrelationId, RequestId } from "../../contracts/serverAuth";

export const APPLICATION_RESOURCE_RESOLUTION_ERROR_CODES = ["APPLICATION_ID_INVALID", "APPLICATION_NOT_FOUND", "APPLICATION_MALFORMED", "APPLICATION_OWNERSHIP_UNRESOLVED", "APPLICATION_OWNERSHIP_REJECTED", "APPLICATION_TENANT_INVALID", "APPLICATION_VERSION_INVALID", "DEPENDENCY_FAILURE", "INTERNAL_ERROR"] as const;
export type ApplicationResourceResolutionErrorCode = typeof APPLICATION_RESOURCE_RESOLUTION_ERROR_CODES[number];
export type ApplicationResourceResolutionError = Readonly<{ code: ApplicationResourceResolutionErrorCode; message: string; requestId?: RequestId; correlationId?: CorrelationId }>;
export type ApplicationResourceResolutionResult = Readonly<{ ok: true; facts: ResolvedApplicationResourceFactsV1 }> | Readonly<{ ok: false; error: ApplicationResourceResolutionError }>;
export type ApplicationResourceResolverDependencies = Readonly<{ getApplicationById(applicationId: string): Promise<Readonly<{ exists: boolean; data?: unknown }>> }>;
export type ResolveApplicationResourceFactsInput = Readonly<{ applicationId: unknown; requestId?: RequestId; correlationId?: CorrelationId; provenanceSource?: "firestore_admin" | "dependency_injected" }>;

const messages: Record<ApplicationResourceResolutionErrorCode, string> = { APPLICATION_ID_INVALID: "Application reference is invalid.", APPLICATION_NOT_FOUND: "Application resource is unavailable.", APPLICATION_MALFORMED: "Application resource is unavailable.", APPLICATION_OWNERSHIP_UNRESOLVED: "Application ownership is unresolved.", APPLICATION_OWNERSHIP_REJECTED: "Application resource is unavailable.", APPLICATION_TENANT_INVALID: "Application resource is unavailable.", APPLICATION_VERSION_INVALID: "Application resource is unavailable.", DEPENDENCY_FAILURE: "Application resource could not be resolved.", INTERNAL_ERROR: "Application resource could not be resolved." };
const failure = (code: ApplicationResourceResolutionErrorCode, input: ResolveApplicationResourceFactsInput): ApplicationResourceResolutionResult => Object.freeze({ ok: false, error: Object.freeze({ code, message: messages[code], ...(input.requestId ? { requestId: input.requestId } : {}), ...(input.correlationId ? { correlationId: input.correlationId } : {}) }) });
const safeOptionalId = <T>(value: unknown, validate: (v: unknown) => { ok: boolean; value?: T }): T | undefined | null => { if (value === undefined || value === null || value === "") return undefined; const parsed = validate(value); return parsed.ok ? parsed.value : null; };

export async function resolveApplicationResourceFactsCore(input: ResolveApplicationResourceFactsInput, dependencies: ApplicationResourceResolverDependencies, now: () => Date = () => new Date()): Promise<ApplicationResourceResolutionResult> {
  const id = validateApplicationId(input.applicationId); if (!id.ok) return failure("APPLICATION_ID_INVALID", input);
  let found: Readonly<{ exists: boolean; data?: unknown }>; try { found = await dependencies.getApplicationById(id.value); } catch { return failure("DEPENDENCY_FAILURE", input); }
  if (!found || found.exists !== true) return failure("APPLICATION_NOT_FOUND", input);
  if (!found.data || typeof found.data !== "object" || Array.isArray(found.data)) return failure("APPLICATION_MALFORMED", input);
  const raw = found.data as Record<string, unknown>;
  if (raw.applicationId !== undefined && raw.applicationId !== id.value) return failure("APPLICATION_MALFORMED", input);
  const ownership = raw.ownershipState === undefined ? "unresolved_legacy" : raw.ownershipState;
  if (!(["tenant_owned", "unresolved_legacy", "migration_pending", "migration_rejected"] as unknown[]).includes(ownership)) return failure("APPLICATION_MALFORMED", input);
  const tenant = safeOptionalId(raw.tenantId, validateTenantId); if (tenant === null) return failure("APPLICATION_TENANT_INVALID", input);
  if (ownership === "tenant_owned" && !tenant) return failure("APPLICATION_MALFORMED", input);
  if (ownership !== "tenant_owned" && tenant) return failure("APPLICATION_MALFORMED", input);
  if (ownership === "migration_rejected") return failure("APPLICATION_OWNERSHIP_REJECTED", input);
  const createdBy = safeOptionalId(raw.createdBy, validateUserId), underwriter = safeOptionalId(raw.assignedUnderwriterId ?? raw.underwriterId, validateUserId), processor = safeOptionalId(raw.assignedProcessorId ?? raw.processorId, validateUserId), branch = safeOptionalId(raw.branchId, validateBranchId);
  if ([createdBy, underwriter, processor, branch].includes(null)) return failure("APPLICATION_MALFORMED", input);
  const rawTeams = raw.teamIds ?? []; if (!Array.isArray(rawTeams)) return failure("APPLICATION_MALFORMED", input);
  const teams: string[] = []; for (const item of rawTeams) { const parsed = validateTeamId(item); if (!parsed.ok) return failure("APPLICATION_MALFORMED", input); teams.push(parsed.value); }
  const normalizedTeams = [...new Set(teams)].sort();
  const warnings: string[] = []; if (raw.ownershipState === undefined) warnings.push("legacy_ownership_missing"); if (normalizedTeams.length !== teams.length) warnings.push("duplicate_team_ids_normalized");
  const status = typeof raw.status === "string" && /^[A-Za-z0-9][A-Za-z0-9 _.-]{0,63}$/.test(raw.status) ? raw.status.trim().replace(/\s+/g, "_").toLowerCase() : "unknown"; if (status === "unknown") warnings.push("application_status_unknown");
  let sourceRecordVersion: { kind: "authorization_version" | "updated_at_compatibility" | "legacy_unversioned"; value: string };
  if (raw.authorizationVersion !== undefined) { if (typeof raw.authorizationVersion !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:+-]{0,127}$/.test(raw.authorizationVersion)) return failure("APPLICATION_VERSION_INVALID", input); sourceRecordVersion = { kind: "authorization_version", value: raw.authorizationVersion }; }
  else if (raw.updatedAt !== undefined) { const timestamp = validateIsoTimestamp(raw.updatedAt); if (!timestamp.ok) return failure("APPLICATION_VERSION_INVALID", input); sourceRecordVersion = { kind: "updated_at_compatibility", value: timestamp.value.replace(/[-.]/g, "").replace("Z", "Z") }; warnings.push("updated_at_used_as_compatibility_version"); }
  else { sourceRecordVersion = { kind: "legacy_unversioned", value: "legacy-v0" }; warnings.push("authorization_version_missing"); }
  const createdAt = raw.createdAt === undefined ? undefined : validateIsoTimestamp(raw.createdAt), updatedAt = raw.updatedAt === undefined ? undefined : validateIsoTimestamp(raw.updatedAt); if ((createdAt && !createdAt.ok) || (updatedAt && !updatedAt.ok)) return failure("APPLICATION_MALFORMED", input);
  const versionBasis = JSON.stringify({ id: id.value, ownership, tenant: tenant ?? null, createdBy: createdBy ?? null, underwriter: underwriter ?? null, processor: processor ?? null, branch: branch ?? null, teams: normalizedTeams, status, sourceRecordVersion });
  const resourceAuthorizationVersion = `rav1-${createHash("sha256").update(versionBasis).digest("hex").slice(0, 24)}`;
  const candidate = { schemaVersion: APPLICATION_RESOURCE_FACTS_V1, resourceType: "application", applicationId: id.value, ownershipState: ownership, ...(tenant ? { tenantId: tenant } : {}), resourceAuthorizationVersion, applicationStatus: status, ...(createdAt?.ok ? { createdAt: createdAt.value } : {}), ...(updatedAt?.ok ? { updatedAt: updatedAt.value } : {}), ...(createdBy ? { createdBy } : {}), ...(underwriter ? { assignedUnderwriterId: underwriter } : {}), ...(processor ? { assignedProcessorId: processor } : {}), ...(branch ? { branchId: branch } : {}), teamIds: normalizedTeams, sourceRecordVersion, warnings, resolvedAt: now().toISOString(), resolverVersion: APPLICATION_RESOURCE_RESOLVER_VERSION, provenance: { source: input.provenanceSource ?? "dependency_injected", collection: "applications", lookup: "document_id", authoritativeFieldsOnly: true, piiPresent: false } };
  const parsed = parseResolvedApplicationResourceFacts(candidate); return parsed.ok ? Object.freeze({ ok: true, facts: parsed.value }) : failure("INTERNAL_ERROR", input);
}
