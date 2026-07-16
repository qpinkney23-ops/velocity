import { AUTHORIZATION_POLICY_VERSION, AUTHORIZATION_REQUEST_V1, RESOLVED_RESOURCE_FACTS_V1, parseAuthorizationRequest, type AuthorizationContextV1 } from "../../contracts/authorization";
import type { ServerAuthContextV1 } from "../../contracts/serverAuth";
import { defineUserApiRoutePolicy } from "../auth/userApiAuthPolicy";
import { evaluateAuthorizationDecisionCore } from "../authorization/authorizationDecisionCore";
import { executeBillingCommand, type BillingAction, type BillingDependencies, type BillingResponse } from "./stripeBillingService";

const policy = (routeId: string, auditAction: string) => defineUserApiRoutePolicy({ routeId, allowedPrincipalKind: "firebase_user", allowSessionCookie: true, allowFirebaseBearer: true, requireAuthorizationContext: false, allowedMethods: ["POST"], bodySizeLimit: 1024, csrfMode: "none", originPolicy: "same-origin", auditAction, productionEnabled: true, trustIncomingCorrelationId: false });
export const STRIPE_CHECKOUT_ROUTE_POLICY = policy("stripe.checkout", "billing.checkout");
export const STRIPE_PORTAL_ROUTE_POLICY = policy("stripe.portal", "billing.portal");
type AuthenticationResult = Readonly<{ ok: true; context: ServerAuthContextV1 }> | Readonly<{ ok: false; requestId?: string; correlationId?: string; error?: { code?: string } }>;
export interface BillingRouteDependencies extends BillingDependencies { authenticate(request: Request, policy: typeof STRIPE_CHECKOUT_ROUTE_POLICY): Promise<AuthenticationResult>; resolveTenant(auth: ServerAuthContextV1): Promise<Readonly<{ ok: true; context: AuthorizationContextV1 }> | Readonly<{ ok: false; code: string }>>; appOrigin: string; }
const error = (code: "AUTH_REQUIRED" | "AUTH_INVALID" | "TENANT_SELECTION_REQUIRED" | "FORBIDDEN" | "INTERNAL_ERROR", requestId = "request_unknown", correlationId = "correlation_unknown"): BillingResponse => Object.freeze({ ok: false, error: Object.freeze({ code, message: code === "AUTH_REQUIRED" ? "Authentication required" : code === "AUTH_INVALID" ? "Authentication is invalid" : code === "TENANT_SELECTION_REQUIRED" ? "Tenant selection required" : code === "FORBIDDEN" ? "Billing operation is not permitted" : "Billing operation failed" }), requestId, correlationId });
function bodyKey(body: unknown): string | undefined { if (!body || typeof body !== "object" || Array.isArray(body)) return; const raw = body as Record<string, unknown>; if (Object.keys(raw).length !== 1 || typeof raw.idempotencyKey !== "string") return; return raw.idempotencyKey; }

export async function executeStripeBillingRoute(action: BillingAction, request: Request, body: unknown, d: BillingRouteDependencies): Promise<BillingResponse> {
  if (request.method !== "POST") return error("INTERNAL_ERROR");
  const idempotencyKey = bodyKey(body); if (!idempotencyKey) return error("INTERNAL_ERROR");
  const auth = await d.authenticate(request, action === "checkout" ? STRIPE_CHECKOUT_ROUTE_POLICY : STRIPE_PORTAL_ROUTE_POLICY).catch(() => undefined);
  if (!auth?.ok) return error(auth?.error?.code === "AUTH_INVALID" ? "AUTH_INVALID" : "AUTH_REQUIRED", auth?.requestId, auth?.correlationId);
  const resolved = await d.resolveTenant(auth.context).catch(() => undefined);
  if (!resolved?.ok) return error("TENANT_SELECTION_REQUIRED", auth.context.requestId, auth.context.correlationId);
  const context = resolved.context;
  const requestContract = parseAuthorizationRequest({ schemaVersion: AUTHORIZATION_REQUEST_V1, permission: "billing.manage", resourceType: "billing", resourceId: `billing:${context.tenantId}`, action: { auditAction: `billing.${action}`, requiredConstraints: ["active_tenant", "active_membership", "same_tenant"] }, requestId: auth.context.requestId, correlationId: auth.context.correlationId, policyVersion: AUTHORIZATION_POLICY_VERSION });
  if (!requestContract.ok) return error("INTERNAL_ERROR", auth.context.requestId, auth.context.correlationId);
  const evaluated = evaluateAuthorizationDecisionCore({ context, request: requestContract.value, resourceFacts: { schemaVersion: RESOLVED_RESOURCE_FACTS_V1, resourceType: "billing", resourceId: `billing:${context.tenantId}`, tenantId: context.tenantId, teamIds: [], assignedUserIds: [], assignedTeamIds: [], legacyState: "not_applicable", resourceStatus: "active" }, evaluatedAt: d.now().toISOString() });
  if (!evaluated.ok) return error("INTERNAL_ERROR", auth.context.requestId, auth.context.correlationId);
  if (evaluated.decision.decision !== "allow") { await d.audit.persistAuthorization(evaluated.decision, context).catch(() => false); return error("FORBIDDEN", auth.context.requestId, auth.context.correlationId); }
  return executeBillingCommand({ auth: auth.context, context, decision: evaluated.decision, action, idempotencyKey, appOrigin: d.appOrigin }, d);
}
export const executeStripeCheckoutRoute = (request: Request, body: unknown, d: BillingRouteDependencies) => executeStripeBillingRoute("checkout", request, body, d);
export const executeStripePortalRoute = (request: Request, body: unknown, d: BillingRouteDependencies) => executeStripeBillingRoute("portal", request, body, d);
