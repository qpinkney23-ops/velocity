import { createHash } from "node:crypto";
import { AUTHORIZATION_PERMISSION_VERSION, AUTHORIZATION_POLICY_VERSION, type AuthorizationContextV1, type AuthorizationDecisionV1 } from "../../contracts/authorization";
import type { ServerAuthContextV1 } from "../../contracts/serverAuth";

export const BILLING_POLICY = Object.freeze({
  version: "stripe-billing-policy.v1",
  permissionVersion: AUTHORIZATION_PERMISSION_VERSION,
  authorizationPolicyVersion: AUTHORIZATION_POLICY_VERSION,
  status: "provisional_product_review_required" as const,
  checkoutPath: "/admin?checkout=success",
  cancelPath: "/admin?checkout=cancelled",
  portalPath: "/admin",
});

export type BillingAction = "checkout" | "portal";
export type BillingErrorCode = "AUTH_REQUIRED" | "AUTH_INVALID" | "TENANT_SELECTION_REQUIRED" | "FORBIDDEN" | "AUDIT_REQUIRED" | "BILLING_CONFIGURATION_REQUIRED" | "BILLING_CUSTOMER_NOT_AVAILABLE" | "BILLING_COMMAND_CONFLICT" | "BILLING_ALREADY_RUNNING" | "BILLING_PROVIDER_FAILED" | "INTERNAL_ERROR";
export type BillingResponse = Readonly<{ ok: true; redirectUrl: string; commandId: string; requestId: string; correlationId: string }> | Readonly<{ ok: false; error: Readonly<{ code: BillingErrorCode; message: string }>; requestId: string; correlationId: string }>;
export type BillingConfiguration = Readonly<{ tenantId: string; customerId: string; mappingVersion: string; checkoutPriceId: string }>;

export interface BillingProviderGateway {
  createCheckoutSession(input: Readonly<{ customerId: string; priceId: string; successUrl: string; cancelUrl: string; providerIdempotencyKey: string }>): Promise<Readonly<{ redirectUrl: string; providerReference: string }>>;
  createPortalSession(input: Readonly<{ customerId: string; returnUrl: string; providerIdempotencyKey: string }>): Promise<Readonly<{ redirectUrl: string; providerReference: string }>>;
}
export interface BillingConfigurationRepository { getForTenant(tenantId: string): Promise<BillingConfiguration | undefined>; }
export type CommandReceipt = Readonly<{ redirectUrl: string; commandId: string }>;
export interface BillingCommandRepository {
  reserve(input: Readonly<{ tenantId: string; action: BillingAction; idempotencyKey: string; fingerprint: string; commandId: string; createdAt: string }>): Promise<Readonly<{ status: "started" } | { status: "completed"; receipt: CommandReceipt } | { status: "conflict" } | { status: "running" }>>;
  complete(input: Readonly<{ tenantId: string; action: BillingAction; idempotencyKey: string; fingerprint: string; receipt: CommandReceipt; completedAt: string }>): Promise<boolean>;
  abandon(input: Readonly<{ tenantId: string; action: BillingAction; idempotencyKey: string; fingerprint: string }>): Promise<void>;
}
export interface BillingAuditGateway {
  persistAuthorization(decision: AuthorizationDecisionV1, context: AuthorizationContextV1): Promise<boolean>;
  persistOperation(input: Readonly<{ tenantId: string; principalId: string; action: BillingAction; commandId: string; outcome: "succeeded" | "provider_failed"; requestId: string; correlationId: string; occurredAt: string }>): Promise<boolean>;
}

export interface ExecuteBillingInput { auth: ServerAuthContextV1; context: AuthorizationContextV1; decision: AuthorizationDecisionV1; action: BillingAction; idempotencyKey: string; appOrigin: string; }
export interface BillingDependencies { provider: BillingProviderGateway; configuration: BillingConfigurationRepository; commands: BillingCommandRepository; audit: BillingAuditGateway; now: () => Date; }

const SAFE_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const SAFE_MAPPING_VERSION = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SAFE_CUSTOMER = /^cus_[A-Za-z0-9]{3,}$/;
const SAFE_PRICE = /^price_[A-Za-z0-9]{3,}$/;
const safeError = (code: BillingErrorCode, auth: Pick<ServerAuthContextV1, "requestId" | "correlationId">): BillingResponse => Object.freeze({ ok: false, error: Object.freeze({ code, message: ({ AUTH_REQUIRED: "Authentication required", AUTH_INVALID: "Authentication is invalid", TENANT_SELECTION_REQUIRED: "Tenant selection required", FORBIDDEN: "Billing operation is not permitted", AUDIT_REQUIRED: "Required audit could not be persisted", BILLING_CONFIGURATION_REQUIRED: "Billing configuration is unavailable", BILLING_CUSTOMER_NOT_AVAILABLE: "Billing customer is unavailable", BILLING_COMMAND_CONFLICT: "Billing command conflicts with a prior request", BILLING_ALREADY_RUNNING: "Billing command is already running", BILLING_PROVIDER_FAILED: "Billing provider operation failed", INTERNAL_ERROR: "Billing operation failed" } as const)[code] }), requestId: auth.requestId, correlationId: auth.correlationId });
function trustedUrl(origin: string, path: string): string | undefined { try { const parsed = new URL(origin); if (!/^https?:$/.test(parsed.protocol) || parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) return; return new URL(path, parsed.origin).toString(); } catch { return; } }
const fingerprint = (input: object) => createHash("sha256").update(JSON.stringify(input)).digest("hex");

export async function executeBillingCommand(input: ExecuteBillingInput, d: BillingDependencies): Promise<BillingResponse> {
  const { auth, context, decision, action } = input;
  if (auth.principal.kind !== "firebase_user" || context.authentication.principalId !== auth.principal.uid) return safeError("AUTH_INVALID", auth);
  if (decision.decision !== "allow" || decision.permission !== "billing.manage" || decision.tenantId !== context.tenantId || decision.requestId !== auth.requestId || decision.correlationId !== auth.correlationId) return safeError("FORBIDDEN", auth);
  if (!SAFE_KEY.test(input.idempotencyKey)) return safeError("BILLING_COMMAND_CONFLICT", auth);
  if (!await d.audit.persistAuthorization(decision, context).catch(() => false)) return safeError("AUDIT_REQUIRED", auth);
  const configuration = await d.configuration.getForTenant(context.tenantId).catch(() => undefined);
  if (!configuration || configuration.tenantId !== context.tenantId) return safeError("BILLING_CUSTOMER_NOT_AVAILABLE", auth);
  if (!SAFE_CUSTOMER.test(configuration.customerId) || !SAFE_MAPPING_VERSION.test(configuration.mappingVersion)) return safeError("BILLING_CUSTOMER_NOT_AVAILABLE", auth);
  if (!SAFE_PRICE.test(configuration.checkoutPriceId)) return safeError("BILLING_CONFIGURATION_REQUIRED", auth);
  const successUrl = trustedUrl(input.appOrigin, BILLING_POLICY.checkoutPath), cancelUrl = trustedUrl(input.appOrigin, BILLING_POLICY.cancelPath), returnUrl = trustedUrl(input.appOrigin, BILLING_POLICY.portalPath);
  if (!successUrl || !cancelUrl || !returnUrl) return safeError("BILLING_CONFIGURATION_REQUIRED", auth);
  const materialFingerprint = fingerprint({ tenantId: context.tenantId, principalId: context.authentication.principalId, action, priceId: action === "checkout" ? configuration.checkoutPriceId : undefined, mappingVersion: configuration.mappingVersion, policyVersion: BILLING_POLICY.version });
  const commandId = `billing_${materialFingerprint.slice(0, 24)}`;
  const reservation = await d.commands.reserve({ tenantId: context.tenantId, action, idempotencyKey: input.idempotencyKey, fingerprint: materialFingerprint, commandId, createdAt: d.now().toISOString() }).catch(() => undefined);
  if (!reservation) return safeError("INTERNAL_ERROR", auth);
  if (reservation.status === "completed") return Object.freeze({ ok: true, ...reservation.receipt, requestId: auth.requestId, correlationId: auth.correlationId });
  if (reservation.status === "conflict") return safeError("BILLING_COMMAND_CONFLICT", auth);
  if (reservation.status === "running") return safeError("BILLING_ALREADY_RUNNING", auth);
  try {
    const providerIdempotencyKey = `${context.tenantId}:${action}:${input.idempotencyKey}`;
    const result = action === "checkout"
      ? await d.provider.createCheckoutSession({ customerId: configuration.customerId, priceId: configuration.checkoutPriceId, successUrl, cancelUrl, providerIdempotencyKey })
      : await d.provider.createPortalSession({ customerId: configuration.customerId, returnUrl, providerIdempotencyKey });
    const redirect = new URL(result.redirectUrl); if (redirect.protocol !== "https:") throw new Error("unsafe provider redirect");
    const operationAudit = { tenantId: context.tenantId, principalId: context.authentication.principalId, action, commandId, outcome: "succeeded" as const, requestId: auth.requestId, correlationId: auth.correlationId, occurredAt: d.now().toISOString() };
    if (!await d.audit.persistOperation(operationAudit).catch(() => false)) return safeError("AUDIT_REQUIRED", auth);
    const receipt = Object.freeze({ redirectUrl: redirect.toString(), commandId });
    if (!await d.commands.complete({ tenantId: context.tenantId, action, idempotencyKey: input.idempotencyKey, fingerprint: materialFingerprint, receipt, completedAt: d.now().toISOString() }).catch(() => false)) return safeError("INTERNAL_ERROR", auth);
    return Object.freeze({ ok: true, ...receipt, requestId: auth.requestId, correlationId: auth.correlationId });
  } catch {
    await d.audit.persistOperation({ tenantId: context.tenantId, principalId: context.authentication.principalId, action, commandId, outcome: "provider_failed", requestId: auth.requestId, correlationId: auth.correlationId, occurredAt: d.now().toISOString() }).catch(() => false);
    await d.commands.abandon({ tenantId: context.tenantId, action, idempotencyKey: input.idempotencyKey, fingerprint: materialFingerprint }).catch(() => undefined);
    return safeError("BILLING_PROVIDER_FAILED", auth);
  }
}

export class InMemoryBillingCommandRepository implements BillingCommandRepository {
  private values = new Map<string, { fingerprint: string; receipt?: CommandReceipt }>();
  private key(i: { tenantId: string; action: BillingAction; idempotencyKey: string }) { return `${i.tenantId}:${i.action}:${i.idempotencyKey}`; }
  async reserve(i: Parameters<BillingCommandRepository["reserve"]>[0]) { const key = this.key(i), current = this.values.get(key); if (!current) { this.values.set(key, { fingerprint: i.fingerprint }); return { status: "started" as const }; } if (current.fingerprint !== i.fingerprint) return { status: "conflict" as const }; return current.receipt ? { status: "completed" as const, receipt: current.receipt } : { status: "running" as const }; }
  async complete(i: Parameters<BillingCommandRepository["complete"]>[0]) { const current = this.values.get(this.key(i)); if (!current || current.fingerprint !== i.fingerprint || current.receipt) return false; current.receipt = i.receipt; return true; }
  async abandon(i: Parameters<BillingCommandRepository["abandon"]>[0]) { const key = this.key(i), current = this.values.get(key); if (current?.fingerprint === i.fingerprint && !current.receipt) this.values.delete(key); }
}
