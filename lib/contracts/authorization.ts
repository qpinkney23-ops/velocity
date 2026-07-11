import { validateIsoTimestamp, validateSchemaVersion, validateTenantId, validateUserId, type IsoTimestamp, type SchemaVersion, type TenantId, type UserId } from "./primitives";
import { validateCorrelationId, validateRequestId, type CorrelationId, type RequestId, type ServerPrincipalKind } from "./serverAuth";
import { MEMBERSHIP_STATUSES, TENANT_ROLES, TENANT_STATUSES, validateBranchId, validateTeamId, type BranchId, type MembershipStatus, type TeamId, type TenantRole, type TenantStatus } from "./tenantSystem";

export const AUTHORIZATION_CONTEXT_V1 = "authorization-context.v1" as SchemaVersion;
export const AUTHORIZATION_DECISION_V1 = "authorization-decision.v1" as SchemaVersion;
export const AUTHORIZATION_POLICY_VERSION = "authorization-policy.provisional.v1";
export const AUTHORIZATION_PERMISSION_VERSION = "authorization-permissions.provisional.v1";

export const AUTHORIZATION_PERMISSIONS = [
  "application.read", "application.create", "application.update", "application.analyze", "application.delete",
  "document.read", "document.upload", "document.delete", "condition.read", "condition.manage", "condition.clear",
  "assignment.read", "assignment.manage", "decision.read", "decision.recommend", "decision.approve", "decision.deny", "decision.override",
  "report.generate", "report.read", "export.generate", "queue.read", "queue.manage", "tenant.read", "tenant.manage",
  "membership.read", "membership.invite", "membership.manage", "configuration.read", "configuration.manage",
  "billing.read", "billing.manage", "audit.read", "audit.export", "service.files.process", "service.ai.process", "service.scheduler.run",
] as const;
export type AuthorizationPermission = typeof AUTHORIZATION_PERMISSIONS[number];

export const AUTHORIZATION_CONSTRAINTS = ["same_tenant", "active_tenant", "active_membership", "resource_tenant_match", "branch_match", "team_match", "assigned_to_user", "assigned_to_team", "creator_match", "unresolved_legacy_denied", "service_scope_match"] as const;
export type AuthorizationConstraint = typeof AUTHORIZATION_CONSTRAINTS[number];
export type ConstraintEvaluation = Readonly<{ constraint: AuthorizationConstraint; result: "pass" | "fail" | "not_applicable" }>;

export const AUTHORIZATION_DENIAL_REASONS = ["authentication_required", "tenant_required", "tenant_inactive", "membership_missing", "membership_inactive", "role_unknown", "permission_missing", "resource_not_found", "resource_tenant_mismatch", "branch_scope_denied", "team_scope_denied", "assignment_scope_denied", "unresolved_legacy", "service_scope_denied", "policy_invalid", "internal_error"] as const;
export type AuthorizationDenialReason = typeof AUTHORIZATION_DENIAL_REASONS[number];
export type AuthorizationReason = "authorized" | AuthorizationDenialReason;
export const AUTHORIZATION_RESOURCE_TYPES = ["application", "document", "condition", "assignment", "decision", "report", "export", "queue", "tenant", "membership", "configuration", "billing", "audit", "service_job"] as const;
export type AuthorizationResourceType = typeof AUTHORIZATION_RESOURCE_TYPES[number];

export type SafeAuthenticationProjectionV1 = Readonly<{ principalKind: ServerPrincipalKind; principalId: string; requestId: RequestId; correlationId: CorrelationId }>;
export type AuthorizationContextV1 = Readonly<{
  schemaVersion: typeof AUTHORIZATION_CONTEXT_V1; authentication: SafeAuthenticationProjectionV1; tenantId: TenantId;
  membershipId: string; membershipStatus: MembershipStatus; role: TenantRole; permissionVersion: string; tenantStatus: TenantStatus;
  branchIds?: readonly BranchId[]; teamIds?: readonly TeamId[]; authorizationSource: "tenant_membership"; evaluatedAt: IsoTimestamp;
  membershipUpdatedAt: IsoTimestamp; tenantUpdatedAt: IsoTimestamp; membershipVersion: string; tenantVersion: string;
  audit: Readonly<{ action: "tenant_authorization.resolve"; outcome: "resolved"; piiPresent: false }>;
}>;
export type ServiceAuthorizationContextV1 = Readonly<{
  schemaVersion: typeof AUTHORIZATION_CONTEXT_V1; authentication: SafeAuthenticationProjectionV1; tenantId: TenantId;
  serviceGrantId: string; servicePermissions: readonly AuthorizationPermission[]; permittedTenantIds: readonly TenantId[];
  permissionVersion: string; tenantStatus: TenantStatus; authorizationSource: "service_grant"; evaluatedAt: IsoTimestamp; grantVersion: string; tenantUpdatedAt: IsoTimestamp;
}>;
export type AnyAuthorizationContextV1 = AuthorizationContextV1 | ServiceAuthorizationContextV1;

export type AuthorizationDecisionV1 = Readonly<{
  schemaVersion: typeof AUTHORIZATION_DECISION_V1; decision: "allow" | "deny"; permission: AuthorizationPermission;
  principalKind: ServerPrincipalKind; tenantId?: TenantId; resourceType: AuthorizationResourceType; resourceId?: string;
  reasonCode: AuthorizationReason; policyVersion: string; evaluatedAt: IsoTimestamp; requestId: RequestId; correlationId: CorrelationId;
  constraintsEvaluated: readonly ConstraintEvaluation[];
  audit: Readonly<{ action: string; outcome: "allowed" | "denied"; piiPresent: false }>;
}>;

export type AuthorizationContractResult<T> = Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; code: "invalid_authorization_contract" }>;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const fail = <T>(): AuthorizationContractResult<T> => Object.freeze({ ok: false, code: "invalid_authorization_contract" });
const time = (value: unknown) => { const parsed = validateIsoTimestamp(value); return parsed.ok ? parsed.value : undefined; };
const uniqueIds = <T>(value: unknown, validate: (item: unknown) => { ok: boolean; value?: T }): readonly T[] | undefined => { if (value === undefined) return Object.freeze([]); if (!Array.isArray(value)) return undefined; const result: T[] = []; for (const item of value) { const parsed = validate(item); if (!parsed.ok || parsed.value === undefined) return undefined; result.push(parsed.value); } return new Set(result).size === result.length ? Object.freeze(result) : undefined; };

export function parseAuthorizationContext(input: unknown): AuthorizationContractResult<AuthorizationContextV1> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return fail(); const raw = input as Record<string, any>;
  if (!validateSchemaVersion(raw.schemaVersion).ok || raw.schemaVersion !== AUTHORIZATION_CONTEXT_V1 || raw.authorizationSource !== "tenant_membership") return fail();
  const tenantId = validateTenantId(raw.tenantId), userId = validateUserId(raw.authentication?.principalId), requestId = validateRequestId(raw.authentication?.requestId), correlationId = validateCorrelationId(raw.authentication?.correlationId);
  const branchIds = uniqueIds(raw.branchIds, validateBranchId), teamIds = uniqueIds(raw.teamIds, validateTeamId); const evaluatedAt = time(raw.evaluatedAt), membershipUpdatedAt = time(raw.membershipUpdatedAt), tenantUpdatedAt = time(raw.tenantUpdatedAt);
  if (!tenantId.ok || !userId.ok || raw.authentication?.principalKind !== "firebase_user" || !requestId.ok || !correlationId.ok || !SAFE_ID.test(raw.membershipId || "") || !MEMBERSHIP_STATUSES.includes(raw.membershipStatus) || !TENANT_ROLES.includes(raw.role) || !TENANT_STATUSES.includes(raw.tenantStatus) || raw.permissionVersion !== AUTHORIZATION_PERMISSION_VERSION || !branchIds || !teamIds || !evaluatedAt || !membershipUpdatedAt || !tenantUpdatedAt || !SAFE_ID.test(raw.membershipVersion || "") || !SAFE_ID.test(raw.tenantVersion || "") || raw.audit?.action !== "tenant_authorization.resolve" || raw.audit?.outcome !== "resolved" || raw.audit?.piiPresent !== false) return fail();
  return Object.freeze({ ok: true, value: Object.freeze({ schemaVersion: AUTHORIZATION_CONTEXT_V1, authentication: Object.freeze({ principalKind: "firebase_user", principalId: userId.value, requestId: requestId.value, correlationId: correlationId.value }), tenantId: tenantId.value, membershipId: raw.membershipId, membershipStatus: raw.membershipStatus, role: raw.role, permissionVersion: raw.permissionVersion, tenantStatus: raw.tenantStatus, ...(branchIds.length ? { branchIds } : {}), ...(teamIds.length ? { teamIds } : {}), authorizationSource: "tenant_membership", evaluatedAt, membershipUpdatedAt, tenantUpdatedAt, membershipVersion: raw.membershipVersion, tenantVersion: raw.tenantVersion, audit: Object.freeze({ action: "tenant_authorization.resolve", outcome: "resolved", piiPresent: false }) }) });
}

export function parseAuthorizationDecision(input: unknown): AuthorizationContractResult<AuthorizationDecisionV1> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return fail(); const raw = input as Record<string, any>;
  const requestId = validateRequestId(raw.requestId), correlationId = validateCorrelationId(raw.correlationId), evaluatedAt = time(raw.evaluatedAt); const tenantId = raw.tenantId === undefined ? undefined : validateTenantId(raw.tenantId); const constraints = raw.constraintsEvaluated;
  if (raw.schemaVersion !== AUTHORIZATION_DECISION_V1 || !["allow", "deny"].includes(raw.decision) || !AUTHORIZATION_PERMISSIONS.includes(raw.permission) || !["firebase_user", "service", "cron", "external_webhook"].includes(raw.principalKind) || (tenantId && !tenantId.ok) || !AUTHORIZATION_RESOURCE_TYPES.includes(raw.resourceType) || (raw.resourceId !== undefined && !SAFE_ID.test(raw.resourceId)) || !["authorized", ...AUTHORIZATION_DENIAL_REASONS].includes(raw.reasonCode) || raw.policyVersion !== AUTHORIZATION_POLICY_VERSION || !evaluatedAt || !requestId.ok || !correlationId.ok || !Array.isArray(constraints) || constraints.some((item: any) => !item || !AUTHORIZATION_CONSTRAINTS.includes(item.constraint) || !["pass", "fail", "not_applicable"].includes(item.result)) || !raw.audit || !SAFE_ID.test(raw.audit.action || "") || raw.audit.piiPresent !== false || raw.audit.outcome !== (raw.decision === "allow" ? "allowed" : "denied")) return fail();
  const frozenConstraints = Object.freeze(constraints.map((item: ConstraintEvaluation) => Object.freeze({ ...item })));
  return Object.freeze({ ok: true, value: Object.freeze({ schemaVersion: AUTHORIZATION_DECISION_V1, decision: raw.decision, permission: raw.permission, principalKind: raw.principalKind, ...(tenantId?.ok ? { tenantId: tenantId.value } : {}), resourceType: raw.resourceType, ...(raw.resourceId ? { resourceId: raw.resourceId } : {}), reasonCode: raw.reasonCode, policyVersion: raw.policyVersion, evaluatedAt, requestId: requestId.value, correlationId: correlationId.value, constraintsEvaluated: frozenConstraints, audit: Object.freeze({ action: raw.audit.action, outcome: raw.audit.outcome, piiPresent: false }) }) });
}
