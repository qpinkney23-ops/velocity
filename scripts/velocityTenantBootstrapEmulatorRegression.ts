import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { buildTenantBootstrapPlan, type TenantBootstrapPlanV1 } from "../lib/contracts/tenantBootstrap";
import { tenantBootstrapFixtures as f } from "../lib/contracts/tenantBootstrapFixtures";

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
const projectId = "demo-velocity-tenant-bootstrap";
const [host, portText] = (process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8180").split(":");

async function execute(db: any, verified: Readonly<{ verified: boolean; authenticatedUserId: string; authorityType: string }>, plan: TenantBootstrapPlanV1, fail = false) {
  if (!verified.verified || verified.authenticatedUserId !== plan.firstOwnerMembership.userId || verified.authorityType !== plan.auditEvent.authorityType) throw new Error("bootstrap_authorization_invalid");
  return db.runTransaction(async (tx: any) => {
    const refs = Object.fromEntries(Object.entries(plan.persistencePaths).map(([key, path]) => [key, db.doc(path)]));
    const tenant = await tx.get(refs.tenant), membership = await tx.get(refs.ownerMembership), discovery = await tx.get(refs.userDiscovery), audit = await tx.get(refs.auditEvent), idem = await tx.get(refs.idempotency);
    if (idem.exists) {
      const existing = idem.data();
      if (existing.requestFingerprint === plan.idempotency.requestFingerprint && existing.tenantId === plan.tenantId && tenant.exists && membership.exists && discovery.exists && audit.exists) return "already_completed";
      throw new Error("bootstrap_idempotency_conflict");
    }
    if (tenant.exists || membership.exists || discovery.exists || audit.exists) throw new Error("bootstrap_existing_record_conflict");
    tx.set(refs.tenant, plan.tenant); tx.set(refs.ownerMembership, plan.firstOwnerMembership); tx.set(refs.userDiscovery, plan.userDiscovery); tx.set(refs.auditEvent, plan.auditEvent); tx.set(refs.idempotency, plan.idempotency);
    if (fail) throw new Error("bootstrap_simulated_failure");
    return "created";
  });
}

async function expectFailure(work: () => Promise<unknown>, code: string) { try { await work(); throw new Error(`expected ${code}`); } catch (error: any) { if (!String(error?.message).includes(code)) throw error; } }

async function main() {
 const env = await initializeTestEnvironment({ projectId, firestore: { host, port: Number(portText) || 8180 } });
 try {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (admin) => {
  const adminDb = admin.firestore();
  const planResult = buildTenantBootstrapPlan(f.platformAdmin, f.tenantId); assert(planResult.ok, "platform plan invalid"); const plan = planResult.value;
  const auth = { verified: true, authenticatedUserId: f.platformAdmin.initiatingAuthenticatedUserId, authorityType: f.platformAdmin.provisioningAuthorityType };
  assert(await execute(adminDb, auth, plan) === "created", "bootstrap not created");
  assert(await execute(adminDb, auth, plan) === "already_completed", "identical retry not idempotent");
  for (const path of Object.values(plan.persistencePaths)) assert((await adminDb.doc(path).get()).exists, `missing atomic record ${path}`);
  const conflictResult = buildTenantBootstrapPlan(f.conflictingRetry, f.tenantId); assert(conflictResult.ok, "conflict plan invalid");
  await expectFailure(() => execute(adminDb, auth, conflictResult.value), "bootstrap_idempotency_conflict");
  const duplicateResult = buildTenantBootstrapPlan(f.duplicateTenant, f.tenantId); assert(duplicateResult.ok, "duplicate plan invalid");
  await expectFailure(() => execute(adminDb, auth, duplicateResult.value), "bootstrap_existing_record_conflict");
  await expectFailure(() => execute(adminDb, { verified: false, authenticatedUserId: "ordinary_user", authorityType: "platform_admin" }, plan), "bootstrap_authorization_invalid");
  const partialResult = buildTenantBootstrapPlan(f.partialWriteFailure, "tenant_partial_failure"); assert(partialResult.ok, "partial plan invalid");
  await expectFailure(() => execute(adminDb, auth, partialResult.value, true), "bootstrap_simulated_failure");
  for (const path of Object.values(partialResult.value.persistencePaths)) assert(!(await adminDb.doc(path).get()).exists, "partial transaction became visible");
  const membershipConflict = buildTenantBootstrapPlan(f.existingMembershipConflict, "tenant_membership_conflict"); assert(membershipConflict.ok, "membership conflict plan invalid");
  await adminDb.doc(membershipConflict.value.persistencePaths.ownerMembership).set({ tenantId: "different_owner_tenant", userId: "different_owner", role: "owner" });
  await expectFailure(() => execute(adminDb, auth, membershipConflict.value), "bootstrap_existing_record_conflict");
  const auditCollision = buildTenantBootstrapPlan(f.auditEventCollision, "tenant_audit_collision"); assert(auditCollision.ok, "audit collision plan invalid");
  await adminDb.doc(auditCollision.value.persistencePaths.auditEvent).set({ eventType: "different_event", immutable: true });
  await expectFailure(() => execute(adminDb, auth, auditCollision.value), "bootstrap_existing_record_conflict");
  const legacy = adminDb.doc(`applications/${f.unresolvedLegacyRecord.applicationId}`); await legacy.set(f.unresolvedLegacyRecord);
  assert((await legacy.get()).data()?.ownershipState === "unresolved_legacy", "legacy tenantless record changed");
  console.log("Firebase Emulator tenant bootstrap transaction result: PASS");
  console.log("PASS: atomic create, identical retry, conflicts, authorization, rollback, legacy untouched");
  });
 } finally { await env.clearFirestore().catch(() => undefined); await env.cleanup(); }
}

main().catch((error) => { console.error("TENANT_BOOTSTRAP_EMULATOR_FATAL:", error?.message || String(error)); process.exitCode = 1; });
