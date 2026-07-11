import { AUTHORIZATION_CONTEXT_V1, AUTHORIZATION_PERMISSION_VERSION, parseAuthorizationContext, type AuthorizationContextV1 } from "../../contracts/authorization";
import { parseServerAuthContext, type CorrelationId, type RequestId, type ServerAuthContextV1 } from "../../contracts/serverAuth";
import { parseTenant, parseTenantMembership } from "../../contracts/tenantSystem";
import { validateTenantId } from "../../contracts/primitives";

export const TENANT_AUTHORIZATION_ERROR_CODES = ["TENANT_REQUIRED", "TENANT_NOT_FOUND", "TENANT_INACTIVE", "MEMBERSHIP_NOT_FOUND", "MEMBERSHIP_INACTIVE", "ROLE_UNKNOWN", "TENANT_SELECTION_REQUIRED", "AUTH_INVALID", "INTERNAL_ERROR"] as const;
export type TenantAuthorizationErrorCode = typeof TENANT_AUTHORIZATION_ERROR_CODES[number];
export type TenantAuthorizationError = Readonly<{ code: TenantAuthorizationErrorCode; status: 401 | 403 | 500; message: string; requestId?: RequestId; correlationId?: CorrelationId }>;
export type TenantAuthorizationResolverResult = Readonly<{ ok: true; context: AuthorizationContextV1 }> | Readonly<{ ok: false; error: TenantAuthorizationError }>;
export type TenantAuthorizationRepository = Readonly<{ listDiscoveredTenantIds(userId: string): Promise<readonly string[]>; getTenant(tenantId: string): Promise<unknown | undefined>; getMembership(tenantId: string, userId: string): Promise<unknown | undefined> }>;
export type ResolveTenantAuthorizationInput = Readonly<{ authentication: unknown; requestedTenantId?: unknown }>;

const definitions: Record<TenantAuthorizationErrorCode, readonly [401 | 403 | 500, string]> = {
  TENANT_REQUIRED: [403, "Tenant context is required."], TENANT_NOT_FOUND: [403, "Tenant access is unavailable."], TENANT_INACTIVE: [403, "Tenant access is unavailable."], MEMBERSHIP_NOT_FOUND: [403, "Tenant access is unavailable."], MEMBERSHIP_INACTIVE: [403, "Tenant access is unavailable."], ROLE_UNKNOWN: [403, "Tenant access is unavailable."], TENANT_SELECTION_REQUIRED: [403, "Tenant selection is required."], AUTH_INVALID: [401, "Authentication is invalid."], INTERNAL_ERROR: [500, "Authorization could not be completed."],
};
function failure(code: TenantAuthorizationErrorCode, authentication?: ServerAuthContextV1): TenantAuthorizationResolverResult { const [status, message] = definitions[code]; return Object.freeze({ ok: false, error: Object.freeze({ code, status, message, ...(authentication ? { requestId: authentication.requestId, correlationId: authentication.correlationId } : {}) }) }); }

export async function resolveTenantAuthorizationContextCore(input: ResolveTenantAuthorizationInput, repository: TenantAuthorizationRepository, now: () => Date = () => new Date()): Promise<TenantAuthorizationResolverResult> {
  const parsedAuth = parseServerAuthContext(input.authentication); if (!parsedAuth.ok) return failure("AUTH_INVALID");
  const authentication = parsedAuth.value; if (authentication.principal.kind !== "firebase_user") return failure("AUTH_INVALID");
  const userId = authentication.principal.uid;
  let selectedTenantId: string;
  if (input.requestedTenantId !== undefined) { const requested = validateTenantId(input.requestedTenantId); if (!requested.ok) return failure("TENANT_REQUIRED", authentication); selectedTenantId = requested.value; }
  else {
    let discovered: readonly string[]; try { discovered = await repository.listDiscoveredTenantIds(userId); } catch { return failure("INTERNAL_ERROR", authentication); }
    const valid = [...new Set(discovered)].filter((value) => validateTenantId(value).ok);
    if (valid.length === 0) return failure("TENANT_REQUIRED", authentication); if (valid.length > 1) return failure("TENANT_SELECTION_REQUIRED", authentication); selectedTenantId = valid[0];
  }
  let tenantRaw: unknown | undefined, membershipRaw: unknown | undefined;
  try { tenantRaw = await repository.getTenant(selectedTenantId); membershipRaw = await repository.getMembership(selectedTenantId, userId); } catch { return failure("INTERNAL_ERROR", authentication); }
  const explicit = input.requestedTenantId !== undefined;
  if (!tenantRaw) return failure("TENANT_NOT_FOUND", authentication);
  if (!membershipRaw) return failure(explicit ? "TENANT_NOT_FOUND" : "MEMBERSHIP_NOT_FOUND", authentication);
  const tenant = parseTenant(tenantRaw); if (!tenant.ok || tenant.value.tenantId !== selectedTenantId) return failure("TENANT_NOT_FOUND", authentication);
  if (tenant.value.status !== "active") return failure("TENANT_INACTIVE", authentication);
  const membership = parseTenantMembership(membershipRaw); if (!membership.ok || membership.value.userId !== userId || membership.value.tenantId !== selectedTenantId) return failure(explicit ? "TENANT_NOT_FOUND" : "MEMBERSHIP_NOT_FOUND", authentication);
  if (membership.value.membershipStatus !== "active") return failure("MEMBERSHIP_INACTIVE", authentication);
  if (membership.value.role === "unknown" || membership.value.role === "service_account") return failure("ROLE_UNKNOWN", authentication);
  const evaluatedAt = now().toISOString();
  const built = parseAuthorizationContext({ schemaVersion: AUTHORIZATION_CONTEXT_V1, authentication: { principalKind: "firebase_user", principalId: userId, requestId: authentication.requestId, correlationId: authentication.correlationId }, tenantId: tenant.value.tenantId, membershipId: `membership:${tenant.value.tenantId}:${userId}`, membershipStatus: membership.value.membershipStatus, role: membership.value.role, permissionVersion: AUTHORIZATION_PERMISSION_VERSION, tenantStatus: tenant.value.status, branchIds: membership.value.branchIds, teamIds: membership.value.teamIds, authorizationSource: "tenant_membership", evaluatedAt, membershipUpdatedAt: membership.value.updatedAt, tenantUpdatedAt: tenant.value.updatedAt, membershipVersion: membership.value.updatedAt, tenantVersion: tenant.value.updatedAt, audit: { action: "tenant_authorization.resolve", outcome: "resolved", piiPresent: false } });
  return built.ok ? Object.freeze({ ok: true, context: built.value }) : failure("INTERNAL_ERROR", authentication);
}
