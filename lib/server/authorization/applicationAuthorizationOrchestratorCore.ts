import { AUTHORIZATION_DECISION_V1, AUTHORIZATION_PERMISSION_VERSION, AUTHORIZATION_POLICY_VERSION, AUTHORIZATION_REQUEST_V1, parseAuthorizationDecision, parseAuthorizationRequest, type AuthorizationContextV1, type AuthorizationDecisionV1, type AuthorizationPermission, type AuthorizationDenialReason } from "../../contracts/authorization";
import { createAuthorizationAuditEvent, type AuthorizationAuditClassification, type AuthorizationAuditEventV1 } from "../../contracts/authorizationAudit";
import { toResolvedResourceFacts, type ResolvedApplicationResourceFactsV1 } from "../../contracts/applicationResourceFacts";
import { parseServerAuthContext, type ServerAuthContextV1 } from "../../contracts/serverAuth";
import type { ApplicationResourceResolutionResult } from "./applicationResourceResolverCore";
import { applicationPolicyForPermission, type ApplicationActionPolicyV1 } from "./applicationActionPolicies";
import type { AuthorizationDecisionResult } from "./authorizationDecisionCore";
import type { TenantAuthorizationResolverResult } from "./tenantAuthorizationResolverCore";

export const APPLICATION_AUTHORIZATION_PUBLIC_CODES = ["RESOURCE_NOT_AVAILABLE", "FORBIDDEN", "AUTHORIZATION_REQUIRED", "INTERNAL_ERROR"] as const;
export type ApplicationAuthorizationPublicCode = typeof APPLICATION_AUTHORIZATION_PUBLIC_CODES[number];
export type ApplicationAuthorizationFailureCode = "AUTH_INVALID" | "POLICY_INVALID" | "TENANT_RESOLUTION_FAILED" | "APPLICATION_RESOLUTION_FAILED" | "RESOURCE_FACTS_INVALID" | "DECISION_INVALID" | "DECISION_DENIED" | "AUDIT_PLAN_INVALID" | "INTERNAL_ERROR";
export type ApplicationAuthorizationSuccess = Readonly<{ ok: true; context: AuthorizationContextV1; applicationFacts: ResolvedApplicationResourceFactsV1; decision: AuthorizationDecisionV1 & Readonly<{ decision: "allow" }>; auditPlan: AuthorizationAuditEventV1 }>;
export type ApplicationAuthorizationFailure = Readonly<{ ok: false; code: ApplicationAuthorizationFailureCode; internalReason: string; publicError: Readonly<{ code: ApplicationAuthorizationPublicCode; status: 401 | 403 | 404 | 500; message: string }>; auditPlan?: AuthorizationAuditEventV1 }>;
export type ApplicationAuthorizationResult = ApplicationAuthorizationSuccess | ApplicationAuthorizationFailure;
export type AuthorizeApplicationActionInput = Readonly<{ authentication: unknown; requestedTenantId?: unknown; applicationId: unknown; permission: unknown; policy: unknown; evaluatedAt: string }>;
export type ApplicationAuthorizationDependencies = Readonly<{
  resolveTenant(input: Readonly<{ authentication: unknown; requestedTenantId?: unknown }>): Promise<TenantAuthorizationResolverResult>;
  resolveApplication(input: Readonly<{ applicationId: unknown; requestId?: any; correlationId?: any }>): Promise<ApplicationResourceResolutionResult>;
  evaluateDecision(input: Readonly<{ context: unknown; request: unknown; resourceFacts: unknown; evaluatedAt: string }>): AuthorizationDecisionResult;
  onStep?: (step: string) => void;
}>;

const PUBLIC = Object.freeze({
  AUTHORIZATION_REQUIRED: Object.freeze({ code: "AUTHORIZATION_REQUIRED" as const, status: 401 as const, message: "Authentication is required." }),
  FORBIDDEN: Object.freeze({ code: "FORBIDDEN" as const, status: 403 as const, message: "The requested action is not available." }),
  RESOURCE_NOT_AVAILABLE: Object.freeze({ code: "RESOURCE_NOT_AVAILABLE" as const, status: 404 as const, message: "The requested resource is not available." }),
  INTERNAL_ERROR: Object.freeze({ code: "INTERNAL_ERROR" as const, status: 500 as const, message: "Authorization could not be completed." }),
});
const fail = (code: ApplicationAuthorizationFailureCode, internalReason: string, publicCode: keyof typeof PUBLIC, auditPlan?: AuthorizationAuditEventV1): ApplicationAuthorizationFailure => Object.freeze({ ok: false, code, internalReason, publicError: PUBLIC[publicCode], ...(auditPlan ? { auditPlan } : {}) });
export function normalizeApplicationAuthorizationError(result: ApplicationAuthorizationFailure): ApplicationAuthorizationFailure["publicError"] { return result.publicError; }
const classification = (reason: string): AuthorizationAuditClassification => reason === "permission_missing" ? "permission_denied" : reason.includes("tenant") || reason.includes("membership") ? "tenant_denied" : reason === "policy_invalid" || reason === "internal_error" ? "policy_failure" : "resource_denied";

function auditFromDecision(context: AuthorizationContextV1, decision: AuthorizationDecisionV1, resourceAuthorizationVersion?: string): AuthorizationAuditEventV1 | undefined {
  const built = createAuthorizationAuditEvent({ eventId: `appauth:${decision.requestId}:${decision.permission.replace(".", ":")}`, principalReference: context.authentication.principalId, decision, membershipVersion: context.membershipVersion, tenantVersion: context.tenantVersion, permissionVersion: context.permissionVersion, ...(resourceAuthorizationVersion ? { resourceAuthorizationVersion } : {}), classification: decision.decision === "allow" ? "access_allowed" : classification(decision.reasonCode) });
  return built.ok ? built.value : undefined;
}

function earlyDenyAudit(authentication: ServerAuthContextV1, permission: AuthorizationPermission, applicationId: unknown, evaluatedAt: string, reason: AuthorizationDenialReason, context?: AuthorizationContextV1): AuthorizationAuditEventV1 | undefined {
  const resourceId = typeof applicationId === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(applicationId) ? applicationId : undefined;
  const parsed = parseAuthorizationDecision({ schemaVersion: AUTHORIZATION_DECISION_V1, decision: "deny", permission, principalKind: "firebase_user", ...(context ? { tenantId: context.tenantId } : {}), resourceType: "application", ...(resourceId ? { resourceId } : {}), reasonCode: reason, policyVersion: AUTHORIZATION_POLICY_VERSION, evaluatedAt, requestId: authentication.requestId, correlationId: authentication.correlationId, constraintsEvaluated: [], audit: { action: permission, outcome: "denied", piiPresent: false } });
  if (!parsed.ok) return undefined;
  const built = createAuthorizationAuditEvent({ eventId: `appauth:${authentication.requestId}:${permission.replace(".", ":")}`, principalReference: authentication.principal.kind === "firebase_user" ? authentication.principal.uid : "invalid_principal", decision: parsed.value, ...(context ? { membershipVersion: context.membershipVersion, tenantVersion: context.tenantVersion, permissionVersion: context.permissionVersion } : { permissionVersion: AUTHORIZATION_PERMISSION_VERSION }), classification: classification(reason) });
  return built.ok ? built.value : undefined;
}

export async function authorizeApplicationActionCore(input: AuthorizeApplicationActionInput, dependencies: ApplicationAuthorizationDependencies): Promise<ApplicationAuthorizationResult> {
  dependencies.onStep?.("validate_authentication"); const auth = parseServerAuthContext(input.authentication); if (!auth.ok || auth.value.principal.kind !== "firebase_user") return fail("AUTH_INVALID", "authentication_required", "AUTHORIZATION_REQUIRED");
  const policy = input.policy as ApplicationActionPolicyV1; const canonicalPolicy = applicationPolicyForPermission(input.permission);
  if (!canonicalPolicy || !policy || policy.permission !== canonicalPolicy.permission || policy.resourceType !== "application" || policy.policyVersion !== AUTHORIZATION_POLICY_VERSION || policy.acceptedPrincipalKind !== "firebase_user" || policy.status !== "provisional_product_review_required" || !Array.isArray(policy.requiredConstraints)) return fail("POLICY_INVALID", "policy_invalid", "FORBIDDEN");
  dependencies.onStep?.("resolve_tenant"); const tenant = await dependencies.resolveTenant({ authentication: auth.value, ...(input.requestedTenantId !== undefined ? { requestedTenantId: input.requestedTenantId } : {}) });
  if (!tenant.ok) { const reason: AuthorizationDenialReason = tenant.error.code === "INTERNAL_ERROR" ? "internal_error" : tenant.error.code.includes("MEMBERSHIP") ? "membership_missing" : tenant.error.code.includes("INACTIVE") ? "tenant_inactive" : tenant.error.code === "ROLE_UNKNOWN" ? "role_unknown" : "tenant_required"; return fail("TENANT_RESOLUTION_FAILED", tenant.error.code, tenant.error.code === "AUTH_INVALID" ? "AUTHORIZATION_REQUIRED" : tenant.error.code === "INTERNAL_ERROR" ? "INTERNAL_ERROR" : "FORBIDDEN", earlyDenyAudit(auth.value, policy.permission, input.applicationId, input.evaluatedAt, reason)); }
  const context = tenant.context;
  dependencies.onStep?.("resolve_application"); const application = await dependencies.resolveApplication({ applicationId: input.applicationId, requestId: auth.value.requestId, correlationId: auth.value.correlationId });
  if (!application.ok) {
    const unavailable = ["APPLICATION_NOT_FOUND", "APPLICATION_MALFORMED", "APPLICATION_OWNERSHIP_UNRESOLVED", "APPLICATION_OWNERSHIP_REJECTED", "APPLICATION_TENANT_INVALID", "APPLICATION_VERSION_INVALID"].includes(application.error.code);
    const reason: AuthorizationDenialReason = unavailable ? (application.error.code.includes("OWNERSHIP") ? "unresolved_legacy" : "resource_not_found") : "internal_error";
    return fail("APPLICATION_RESOLUTION_FAILED", application.error.code, unavailable ? "RESOURCE_NOT_AVAILABLE" : "INTERNAL_ERROR", earlyDenyAudit(auth.value, policy.permission, input.applicationId, input.evaluatedAt, reason, context));
  }
  dependencies.onStep?.("convert_resource_facts"); let resourceFacts; try { resourceFacts = toResolvedResourceFacts(application.facts); } catch { return fail("RESOURCE_FACTS_INVALID", "internal_error", "INTERNAL_ERROR"); }
  dependencies.onStep?.("build_request"); const request = parseAuthorizationRequest({ schemaVersion: AUTHORIZATION_REQUEST_V1, permission: policy.permission, resourceType: "application", resourceId: application.facts.applicationId, action: { auditAction: policy.auditAction, requiredConstraints: policy.requiredConstraints }, requestId: auth.value.requestId, correlationId: auth.value.correlationId, policyVersion: AUTHORIZATION_POLICY_VERSION });
  if (!request.ok) return fail("POLICY_INVALID", "policy_invalid", "INTERNAL_ERROR");
  dependencies.onStep?.("evaluate_decision"); const evaluated = dependencies.evaluateDecision({ context, request: request.value, resourceFacts, evaluatedAt: input.evaluatedAt }); if (!evaluated.ok) return fail("DECISION_INVALID", "internal_error", "INTERNAL_ERROR");
  dependencies.onStep?.("build_audit_plan"); const auditPlan = auditFromDecision(context, evaluated.decision, application.facts.resourceAuthorizationVersion); if (!auditPlan) return fail("AUDIT_PLAN_INVALID", "internal_error", "INTERNAL_ERROR");
  if (evaluated.decision.decision !== "allow") return fail("DECISION_DENIED", evaluated.decision.reasonCode, evaluated.decision.reasonCode === "resource_tenant_mismatch" || evaluated.decision.reasonCode === "unresolved_legacy" ? "RESOURCE_NOT_AVAILABLE" : "FORBIDDEN", auditPlan);
  return Object.freeze({ ok: true, context, applicationFacts: application.facts, decision: evaluated.decision as AuthorizationDecisionV1 & { decision: "allow" }, auditPlan });
}
