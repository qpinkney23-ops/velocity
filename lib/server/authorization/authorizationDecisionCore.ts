import { AUTHORIZATION_CONSTRAINTS, AUTHORIZATION_DECISION_V1, AUTHORIZATION_PERMISSION_VERSION, AUTHORIZATION_PERMISSIONS, AUTHORIZATION_POLICY_VERSION, parseAuthorizationContext, parseAuthorizationDecision, parseAuthorizationRequest, parseResolvedResourceFacts, type AnyAuthorizationContextV1, type AuthorizationConstraint, type AuthorizationDecisionV1, type AuthorizationDenialReason, type AuthorizationRequestV1, type ConstraintEvaluation, type ResolvedResourceFactsV1 } from "../../contracts/authorization";
import { PROVISIONAL_ROLE_PERMISSION_MATRIX, permissionsForRole } from "./permissionPolicy";

export type AuthorizationDecisionInput = Readonly<{ context?: unknown; request: unknown; resourceFacts?: unknown; evaluatedAt: string }>;
export type AuthorizationDecisionResult = Readonly<{ ok: true; decision: AuthorizationDecisionV1 }> | Readonly<{ ok: false; code: "invalid_authorization_request" }>;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function serviceContext(input: unknown): AnyAuthorizationContextV1 | undefined { if (!input || typeof input !== "object" || Array.isArray(input)) return undefined; const c = input as any; if (c.schemaVersion !== "authorization-context.v1" || c.authorizationSource !== "service_grant" || c.authentication?.principalKind !== "service" || !SAFE_ID.test(c.authentication?.principalId || "") || !SAFE_ID.test(c.authentication?.requestId || "") || !SAFE_ID.test(c.authentication?.correlationId || "") || c.permissionVersion !== AUTHORIZATION_PERMISSION_VERSION || !Array.isArray(c.servicePermissions) || c.servicePermissions.some((p: unknown) => !AUTHORIZATION_PERMISSIONS.includes(p as any)) || !Array.isArray(c.permittedTenantIds)) return undefined; return c as AnyAuthorizationContextV1; }
function decision(request: AuthorizationRequestV1, evaluatedAt: string, effect: "allow" | "deny", reason: "authorized" | AuthorizationDenialReason, principalKind: "firebase_user" | "service", tenantId: any, constraints: readonly ConstraintEvaluation[]): AuthorizationDecisionResult {
  const parsed = parseAuthorizationDecision({ schemaVersion: AUTHORIZATION_DECISION_V1, decision: effect, permission: request.permission, principalKind, ...(tenantId ? { tenantId } : {}), resourceType: request.resourceType, resourceId: request.resourceId, reasonCode: reason, policyVersion: AUTHORIZATION_POLICY_VERSION, evaluatedAt, requestId: request.requestId, correlationId: request.correlationId, constraintsEvaluated: constraints, audit: { action: request.action.auditAction, outcome: effect === "allow" ? "allowed" : "denied", piiPresent: false } });
  return parsed.ok ? Object.freeze({ ok: true, decision: parsed.value }) : Object.freeze({ ok: false, code: "invalid_authorization_request" });
}
function denialFor(constraint: AuthorizationConstraint): AuthorizationDenialReason { if (constraint === "branch_match") return "branch_scope_denied"; if (constraint === "team_match") return "team_scope_denied"; if (constraint === "assigned_to_user" || constraint === "assigned_to_team") return "assignment_scope_denied"; if (constraint === "unresolved_legacy_denied") return "unresolved_legacy"; if (constraint === "service_scope_match") return "service_scope_denied"; return "resource_tenant_mismatch"; }

export function evaluateAuthorizationDecisionCore(input: AuthorizationDecisionInput): AuthorizationDecisionResult {
  const requestResult = parseAuthorizationRequest(input.request); if (!requestResult.ok) return Object.freeze({ ok: false, code: "invalid_authorization_request" }); const request = requestResult.value;
  const parsedHuman = parseAuthorizationContext(input.context); const context = parsedHuman.ok ? parsedHuman.value : serviceContext(input.context);
  if (!context) return decision(request, input.evaluatedAt, "deny", "authentication_required", "firebase_user", undefined, Object.freeze([]));
  const human = context.authorizationSource === "tenant_membership", principalKind = human ? "firebase_user" as const : "service" as const;
  if (request.requestId !== context.authentication.requestId || request.correlationId !== context.authentication.correlationId) return decision(request, input.evaluatedAt, "deny", "policy_invalid", principalKind, context.tenantId, Object.freeze([]));
  if (context.tenantStatus !== "active") return decision(request, input.evaluatedAt, "deny", "tenant_inactive", principalKind, context.tenantId, Object.freeze([]));
  if (human && context.membershipStatus !== "active") return decision(request, input.evaluatedAt, "deny", "membership_inactive", principalKind, context.tenantId, Object.freeze([]));
  if (human && context.role === "unknown") return decision(request, input.evaluatedAt, "deny", "role_unknown", principalKind, context.tenantId, Object.freeze([]));
  if (request.policyVersion !== AUTHORIZATION_POLICY_VERSION) return decision(request, input.evaluatedAt, "deny", "policy_invalid", principalKind, context.tenantId, Object.freeze([]));
  const permissionAllowed = human ? permissionsForRole(context.role).includes(request.permission) : context.servicePermissions.includes(request.permission);
  if (!permissionAllowed) return decision(request, input.evaluatedAt, "deny", human ? "permission_missing" : "service_scope_denied", principalKind, context.tenantId, Object.freeze([]));
  if (input.resourceFacts === undefined) return decision(request, input.evaluatedAt, "deny", "resource_not_found", principalKind, context.tenantId, Object.freeze([]));
  const factsResult = parseResolvedResourceFacts(input.resourceFacts); if (!factsResult.ok) return decision(request, input.evaluatedAt, "deny", "internal_error", principalKind, context.tenantId, Object.freeze([])); const facts = factsResult.value;
  if (facts.resourceType !== request.resourceType || facts.resourceId !== request.resourceId) return decision(request, input.evaluatedAt, "deny", "resource_not_found", principalKind, context.tenantId, Object.freeze([]));
  if (!facts.tenantId || facts.tenantId !== context.tenantId) return decision(request, input.evaluatedAt, "deny", "resource_tenant_mismatch", principalKind, context.tenantId, Object.freeze([]));
  const constraints: ConstraintEvaluation[] = [];
  for (const constraint of request.action.requiredConstraints) {
    let pass = false;
    if (constraint === "active_tenant") pass = context.tenantStatus === "active";
    else if (constraint === "active_membership") pass = human && context.membershipStatus === "active";
    else if (constraint === "same_tenant" || constraint === "resource_tenant_match") pass = facts.tenantId === context.tenantId;
    else if (constraint === "application_document_relationship_match") pass = facts.resourceType === "application_document" && facts.applicationDocumentRelationshipVerified === true;
    else if (constraint === "branch_match") pass = human && !!facts.branchId && !!context.branchIds?.includes(facts.branchId);
    else if (constraint === "team_match") pass = human && facts.teamIds.some((id) => context.teamIds?.includes(id));
    else if (constraint === "assigned_to_user") pass = human && facts.assignedUserIds.includes(context.authentication.principalId as any);
    else if (constraint === "assigned_to_team") pass = human && facts.assignedTeamIds.some((id) => context.teamIds?.includes(id));
    else if (constraint === "creator_match") pass = human && facts.creatorId === context.authentication.principalId;
    else if (constraint === "unresolved_legacy_denied") pass = facts.legacyState === "tenant_owned" || facts.legacyState === "not_applicable";
    else if (constraint === "service_scope_match") pass = !human && context.permittedTenantIds.includes(context.tenantId) && facts.tenantId === context.tenantId;
    const evaluation = Object.freeze({ constraint, result: pass ? "pass" as const : "fail" as const }); constraints.push(evaluation);
    if (!pass) return decision(request, input.evaluatedAt, "deny", denialFor(constraint), principalKind, context.tenantId, Object.freeze(constraints));
  }
  if (facts.legacyState !== "tenant_owned" && facts.legacyState !== "not_applicable") return decision(request, input.evaluatedAt, "deny", "unresolved_legacy", principalKind, context.tenantId, Object.freeze(constraints));
  return decision(request, input.evaluatedAt, "allow", "authorized", principalKind, context.tenantId, Object.freeze(constraints));
}

export const AUTHORIZATION_DECISION_POLICY_METADATA = Object.freeze({ policyVersion: AUTHORIZATION_POLICY_VERSION, permissionVersion: AUTHORIZATION_PERMISSION_VERSION, matrixStatus: PROVISIONAL_ROLE_PERMISSION_MATRIX.status, constraints: AUTHORIZATION_CONSTRAINTS });
