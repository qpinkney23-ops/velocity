import "server-only";
import type { TenantBootstrapPlanV1, ProvisioningAuthorityType } from "../../contracts/tenantBootstrap";

export type VerifiedTenantBootstrapAuthorization = Readonly<{
  verified: true;
  authenticatedUserId: string;
  authorityType: ProvisioningAuthorityType;
  verificationSource: "sec-001-server-auth" | "controlled-migration-service";
}>;

export type BootstrapDocumentSnapshot = Readonly<{ exists(): boolean; data(): unknown }>;
export type BootstrapTransaction = {
  get(reference: unknown): Promise<BootstrapDocumentSnapshot>;
  create(reference: unknown, value: unknown): void;
};
export type BootstrapFirestore = {
  doc(path: string): unknown;
  runTransaction<T>(operation: (transaction: BootstrapTransaction) => Promise<T>): Promise<T>;
};

export type TenantBootstrapExecutionResult = Readonly<{ status: "created" | "already_completed"; plan: TenantBootstrapPlanV1 }>;

/**
 * Server-only transaction boundary. Callers must supply authorization already
 * verified by SEC-001/SEC-002; raw client role/custom claims are never accepted.
 */
export async function executeTenantBootstrapPlan(
  firestore: BootstrapFirestore,
  authorization: VerifiedTenantBootstrapAuthorization,
  plan: TenantBootstrapPlanV1,
  options: Readonly<{ simulateFailureAfterCreates?: boolean }> = {},
): Promise<TenantBootstrapExecutionResult> {
  if (!authorization?.verified || authorization.authenticatedUserId !== plan.firstOwnerMembership.userId || authorization.authorityType !== plan.auditEvent.authorityType)
    throw new Error("bootstrap_authorization_invalid");
  const paths = plan.persistencePaths;
  return firestore.runTransaction(async (transaction) => {
    const refs = { tenant: firestore.doc(paths.tenant), membership: firestore.doc(paths.ownerMembership), discovery: firestore.doc(paths.userDiscovery), audit: firestore.doc(paths.auditEvent), idempotency: firestore.doc(paths.idempotency) };
    const existing = { tenant: await transaction.get(refs.tenant), membership: await transaction.get(refs.membership), discovery: await transaction.get(refs.discovery), audit: await transaction.get(refs.audit), idempotency: await transaction.get(refs.idempotency) };
    if (existing.idempotency.exists()) {
      const value = existing.idempotency.data() as { requestFingerprint?: unknown; tenantId?: unknown };
      if (value.requestFingerprint === plan.idempotency.requestFingerprint && value.tenantId === plan.tenantId && existing.tenant.exists() && existing.membership.exists() && existing.discovery.exists() && existing.audit.exists()) return Object.freeze({ status: "already_completed" as const, plan });
      throw new Error("bootstrap_idempotency_conflict");
    }
    if (existing.tenant.exists() || existing.membership.exists() || existing.discovery.exists() || existing.audit.exists()) throw new Error("bootstrap_existing_record_conflict");
    transaction.create(refs.tenant, plan.tenant);
    transaction.create(refs.membership, plan.firstOwnerMembership);
    transaction.create(refs.discovery, plan.userDiscovery);
    transaction.create(refs.audit, plan.auditEvent);
    transaction.create(refs.idempotency, plan.idempotency);
    if (options.simulateFailureAfterCreates) throw new Error("bootstrap_simulated_failure");
    return Object.freeze({ status: "created" as const, plan });
  });
}
