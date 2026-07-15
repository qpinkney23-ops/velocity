import { AUTHORIZATION_CONSTRAINTS, AUTHORIZATION_DECISION_V1, AUTHORIZATION_DENIAL_REASONS, AUTHORIZATION_PERMISSION_VERSION, AUTHORIZATION_PERMISSIONS, AUTHORIZATION_POLICY_VERSION, AUTHORIZATION_RESOURCE_TYPES, parseAuthorizationContext, parseAuthorizationDecision, type AnyAuthorizationContextV1, type AuthorizationConstraint, type AuthorizationDecisionV1, type AuthorizationDenialReason, type AuthorizationPermission, type AuthorizationResourceType, type ConstraintEvaluation } from "../../contracts/authorization";
import type { TenantRole } from "../../contracts/tenantSystem";

export const PROVISIONAL_ROLE_PERMISSION_MATRIX = Object.freeze({
  version: AUTHORIZATION_PERMISSION_VERSION,
  status: "provisional_product_review_required" as const,
  roles: Object.freeze({
    owner: Object.freeze(["evidence.read", "evidence.review", "evidence.verify", "evidence.dispute", "evidence.revoke", "application.read", "application.create", "application.update", "application.analyze", "application.delete", "document.read", "document.upload", "document.delete", "condition.read", "condition.manage", "condition.clear", "assignment.read", "assignment.manage", "decision.read", "report.generate", "report.read", "export.generate", "queue.read", "queue.manage", "tenant.read", "tenant.manage", "membership.read", "membership.invite", "membership.manage", "configuration.read", "configuration.manage", "billing.read", "billing.manage", "audit.read", "audit.export"] as const),
    admin: Object.freeze(["application.read", "application.create", "application.update", "application.analyze", "document.read", "document.upload", "document.delete", "condition.read", "condition.manage", "condition.clear", "assignment.read", "assignment.manage", "decision.read", "report.generate", "report.read", "export.generate", "queue.read", "queue.manage", "tenant.read", "membership.read", "membership.invite", "membership.manage", "configuration.read", "configuration.manage", "billing.read", "audit.read"] as const),
    underwriter: Object.freeze(["evidence.read", "evidence.review", "evidence.verify", "evidence.dispute", "evidence.revoke", "application.read", "application.analyze", "document.read", "condition.read", "condition.manage", "condition.clear", "assignment.read", "decision.read", "decision.recommend", "decision.approve", "decision.deny", "report.generate", "report.read", "queue.read"] as const),
    processor: Object.freeze(["evidence.read", "evidence.review", "evidence.dispute", "application.read", "application.create", "application.update", "application.analyze", "document.read", "document.upload", "document.delete", "condition.read", "condition.manage", "condition.clear", "assignment.read", "decision.read", "report.generate", "report.read", "queue.read"] as const),
    loan_officer: Object.freeze(["application.read", "application.create", "application.update", "document.read", "document.upload", "condition.read", "assignment.read", "decision.read", "report.read", "queue.read"] as const),
    viewer: Object.freeze(["application.read", "document.read", "condition.read", "assignment.read", "decision.read", "report.read", "queue.read", "tenant.read", "membership.read", "configuration.read", "billing.read", "audit.read"] as const),
    service_account: Object.freeze([] as const), unknown: Object.freeze([] as const),
  }),
});

export function permissionsForRole(role: TenantRole): readonly AuthorizationPermission[] { return Object.freeze([...(PROVISIONAL_ROLE_PERMISSION_MATRIX.roles[role] || [])]) as readonly AuthorizationPermission[]; }

export type AuthorizationPolicyV1 = Readonly<{ policyVersion: typeof AUTHORIZATION_POLICY_VERSION; permission: AuthorizationPermission; resourceType: AuthorizationResourceType; requiredConstraints: readonly AuthorizationConstraint[]; auditAction: string }>;
export type AuthorizationResourceFactsV1 = Readonly<{ tenantId?: string; ownershipState: "tenant_owned" | "unresolved_legacy" | "not_applicable"; branchId?: string; teamId?: string; assignedUserId?: string; assignedTeamId?: string; creatorId?: string }>;
export type EvaluateAuthorizationInput = Readonly<{ context?: unknown; policy?: unknown; resource?: unknown; evaluatedAt: string }>;
export type EvaluateAuthorizationResult = Readonly<{ ok: true; decision: AuthorizationDecisionV1 }> | Readonly<{ ok: false; code: "invalid_authorization_input" }>;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function validPolicy(input: unknown): input is AuthorizationPolicyV1 { if (!input || typeof input !== "object" || Array.isArray(input)) return false; const p = input as AuthorizationPolicyV1; return p.policyVersion === AUTHORIZATION_POLICY_VERSION && AUTHORIZATION_PERMISSIONS.includes(p.permission) && AUTHORIZATION_RESOURCE_TYPES.includes(p.resourceType) && Array.isArray(p.requiredConstraints) && new Set(p.requiredConstraints).size === p.requiredConstraints.length && p.requiredConstraints.every((item) => AUTHORIZATION_CONSTRAINTS.includes(item)) && SAFE_ID.test(p.auditAction || ""); }
function validResource(input: unknown): input is AuthorizationResourceFactsV1 { if (!input || typeof input !== "object" || Array.isArray(input)) return false; const r = input as Record<string, unknown>; const optionalIds = [r.tenantId, r.branchId, r.teamId, r.assignedUserId, r.assignedTeamId, r.creatorId]; return ["tenant_owned", "unresolved_legacy", "not_applicable"].includes(String(r.ownershipState)) && optionalIds.every((item) => item === undefined || (typeof item === "string" && SAFE_ID.test(item))); }
function serviceContext(input: unknown): AnyAuthorizationContextV1 | undefined { if (!input || typeof input !== "object" || Array.isArray(input)) return undefined; const c = input as any; if (c.authorizationSource !== "service_grant" || c.schemaVersion !== "authorization-context.v1" || c.authentication?.principalKind !== "service" || !SAFE_ID.test(c.authentication?.principalId || "") || !SAFE_ID.test(c.serviceGrantId || "") || c.permissionVersion !== AUTHORIZATION_PERMISSION_VERSION || c.tenantStatus !== "active" || !Array.isArray(c.servicePermissions) || c.servicePermissions.some((p: unknown) => !AUTHORIZATION_PERMISSIONS.includes(p as AuthorizationPermission)) || !Array.isArray(c.permittedTenantIds) || !c.permittedTenantIds.includes(c.tenantId)) return undefined; return c as AnyAuthorizationContextV1; }

export function evaluateAuthorization(input: EvaluateAuthorizationInput): EvaluateAuthorizationResult {
  if (!validPolicy(input.policy) || !validResource(input.resource)) return Object.freeze({ ok: false, code: "invalid_authorization_input" });
  const policy = input.policy, resource = input.resource; const parsedHuman = parseAuthorizationContext(input.context); const context = parsedHuman.ok ? parsedHuman.value : serviceContext(input.context);
  if (!context) return Object.freeze({ ok: false, code: "invalid_authorization_input" });
  const constraints: ConstraintEvaluation[] = []; let denial: AuthorizationDenialReason | undefined;
  const human = context.authorizationSource === "tenant_membership";
  const permissionAllowed = human ? permissionsForRole(context.role).includes(policy.permission) : context.servicePermissions.includes(policy.permission);
  if (human && context.membershipStatus !== "active") denial = "membership_inactive"; else if (context.tenantStatus !== "active") denial = "tenant_inactive"; else if (human && context.role === "unknown") denial = "role_unknown"; else if (!permissionAllowed) denial = context.authorizationSource === "service_grant" ? "service_scope_denied" : "permission_missing"; else if (resource.ownershipState === "unresolved_legacy") denial = "unresolved_legacy";
  for (const constraint of policy.requiredConstraints) {
    let pass = false;
    if (constraint === "active_tenant") pass = context.tenantStatus === "active";
    else if (constraint === "active_membership") pass = human && context.membershipStatus === "active";
    else if (constraint === "same_tenant" || constraint === "resource_tenant_match") pass = !!resource.tenantId && resource.tenantId === context.tenantId;
    else if (constraint === "unresolved_legacy_denied") pass = resource.ownershipState !== "unresolved_legacy";
    else if (constraint === "branch_match") pass = human && !!resource.branchId && !!context.branchIds?.includes(resource.branchId as any);
    else if (constraint === "team_match") pass = human && !!resource.teamId && !!context.teamIds?.includes(resource.teamId as any);
    else if (constraint === "assigned_to_user") pass = human && resource.assignedUserId === context.authentication.principalId;
    else if (constraint === "assigned_to_team") pass = human && !!resource.assignedTeamId && !!context.teamIds?.includes(resource.assignedTeamId as any);
    else if (constraint === "creator_match") pass = human && resource.creatorId === context.authentication.principalId;
    else if (constraint === "service_scope_match") pass = !human && context.permittedTenantIds.includes(context.tenantId) && resource.tenantId === context.tenantId;
    constraints.push(Object.freeze({ constraint, result: pass ? "pass" : "fail" }));
    if (!pass && !denial) denial = constraint === "branch_match" ? "branch_scope_denied" : constraint === "team_match" ? "team_scope_denied" : constraint === "assigned_to_user" || constraint === "assigned_to_team" ? "assignment_scope_denied" : constraint === "unresolved_legacy_denied" ? "unresolved_legacy" : constraint === "service_scope_match" ? "service_scope_denied" : "resource_tenant_mismatch";
  }
  const decision = { schemaVersion: AUTHORIZATION_DECISION_V1, decision: denial ? "deny" : "allow", permission: policy.permission, principalKind: context.authentication.principalKind, tenantId: context.tenantId, resourceType: policy.resourceType, reasonCode: denial || "authorized", policyVersion: policy.policyVersion, evaluatedAt: input.evaluatedAt, requestId: context.authentication.requestId, correlationId: context.authentication.correlationId, constraintsEvaluated: Object.freeze(constraints), audit: Object.freeze({ action: policy.auditAction, outcome: denial ? "denied" : "allowed", piiPresent: false as const }) };
  const parsed = parseAuthorizationDecision(decision); return parsed.ok ? Object.freeze({ ok: true, decision: parsed.value }) : Object.freeze({ ok: false, code: "invalid_authorization_input" });
}
