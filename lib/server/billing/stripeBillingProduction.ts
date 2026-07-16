import "server-only";
import { createAuthorizationAuditEvent } from "../../contracts/authorizationAudit";
import { getFirestore } from "firebase-admin/firestore";
import { defaultAdminApp } from "../auth/firebaseAdminAuthAdapter";
import { persistAuthorizationAuditEvent } from "../authorization/authorizationAuditPersistence";
import { FirestoreBillingCommandRepository, FirestoreBillingConfigurationRepository, ProductionStripeGateway } from "./stripeBillingAdapter";
import { BILLING_POLICY, type BillingAuditGateway, type BillingResponse } from "./stripeBillingService";
import type { AuthorizationContextV1, AuthorizationDecisionV1 } from "../../contracts/authorization";

const audit: BillingAuditGateway = Object.freeze({
  persistAuthorization: async (decision: AuthorizationDecisionV1, context: AuthorizationContextV1) => { const built = createAuthorizationAuditEvent({ eventId: `billingauth:${decision.requestId}:${decision.permission.replace(".", ":")}`, principalReference: context.authentication.principalId, decision, membershipVersion: context.membershipVersion, tenantVersion: context.tenantVersion, permissionVersion: context.permissionVersion, classification: decision.decision === "allow" ? "access_allowed" : "permission_denied" }); if (!built.ok) return false; const result = await persistAuthorizationAuditEvent(built.value, { scope: "tenant", tenantId: context.tenantId, persistedAt: new Date().toISOString() }); return result.ok; },
  persistOperation: async (input: Parameters<BillingAuditGateway["persistOperation"]>[0]) => { const ref = getFirestore(defaultAdminApp()).doc(`tenants/${input.tenantId}/billingOperationAudit/${input.commandId}:${input.outcome}`); try { await ref.create({ schemaVersion: "billing-operation-audit.v1", action: input.action, commandId: input.commandId, outcome: input.outcome, principalReference: input.principalId, requestId: input.requestId, correlationId: input.correlationId, occurredAt: input.occurredAt, piiPresent: false, policyVersion: BILLING_POLICY.version }); return true; } catch (e: any) { return e?.code === 6 || e?.code === "already-exists"; } },
});
export function billingProductionDependencies() { return { provider: new ProductionStripeGateway(), configuration: new FirestoreBillingConfigurationRepository(), commands: new FirestoreBillingCommandRepository(), audit, now: () => new Date(), appOrigin: process.env.NEXT_PUBLIC_APP_URL || "" }; }
export function statusForBillingResponse(result: BillingResponse) { if (result.ok) return 200; if (result.error.code === "AUTH_REQUIRED" || result.error.code === "AUTH_INVALID") return 401; if (result.error.code === "FORBIDDEN") return 403; if (["BILLING_COMMAND_CONFLICT", "BILLING_ALREADY_RUNNING"].includes(result.error.code)) return 409; if (["BILLING_CONFIGURATION_REQUIRED", "BILLING_CUSTOMER_NOT_AVAILABLE"].includes(result.error.code)) return 503; return 500; }
