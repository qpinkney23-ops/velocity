import assert from "node:assert/strict";
import { initializeTestEnvironment, assertFails } from "@firebase/rules-unit-testing";
import { doc, getDoc } from "firebase/firestore";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { resolverAuth, resolverMembership, resolverTenant } from "../lib/server/authorization/tenantAuthorizationResolverFixtures";

console.log("APPLICATION_READ_CUTOVER_EMULATOR_CHILD_STARTED");
async function main() {
  process.env.APPLICATION_READ_CURSOR_SECRET = "01234567890123456789012345678901";
  const projectId = process.env.GCLOUD_PROJECT || "demo-velocity-application-read-cutover";
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST!.split(":");
  const testEnv = await initializeTestEnvironment({ projectId, firestore: { host, port: Number(port) } });
  const app = initializeApp({ projectId });
  try {
    const db = getFirestore(app), at = "2026-07-16T12:00:00.000Z", uid = "processor_alpha", tenant = "tenant_alpha";
    await db.doc(`tenants/${tenant}`).set(resolverTenant(tenant, "active"));
    await db.doc(`userTenantMemberships/${uid}/tenants/${tenant}`).set({ tenantId: tenant });
    await db.doc(`tenants/${tenant}/members/${uid}`).set(resolverMembership(tenant, uid, "processor"));
    for (const [id, tenantId, name] of [["application_a", tenant, "Alpha"], ["application_b", tenant, "Beta"], ["application_cross", "tenant_beta", "Cross"]])
      await db.doc(`applications/${id}`).set({ tenantId, ownershipState: "tenant_owned", authorizationVersion: "auth-v1", workflowVersion: "workflow-v1", status: "New", borrowerName: name, email: `${name.toLowerCase()}@example.invalid`, loanAmount: 100000, createdAt: Timestamp.fromDate(new Date(at)), updatedAt: Timestamp.fromDate(new Date(at)), serverSecret: "not-projected" });
    const before = JSON.stringify((await db.doc("applications/application_a").get()).data());
    await assertFails(getDoc(doc(testEnv.authenticatedContext(uid).firestore(), "applications/application_a")));
    const { listApplicationProjection, detailApplicationProjection } = await import("../lib/server/applications/applicationReadProjection");
    const auth: any = resolverAuth(uid);
    const list = await listApplicationProjection({ auth, pageSize: "1" });
    assert(list.ok); assert.equal(list.applications.length, 1); assert(list.nextCursor); assert(!JSON.stringify(list).includes("serverSecret"));
    const next = await listApplicationProjection({ auth: { ...auth, requestId: "req_next" }, pageSize: "1", cursor: list.nextCursor });
    assert(next.ok); assert.equal(next.applications.length, 1);
    const detail = await detailApplicationProjection({ auth: { ...auth, requestId: "req_detail" }, applicationId: "application_a" });
    assert(detail.ok); assert.equal(detail.application.borrowerName, "Alpha"); assert(!("serverSecret" in detail.application));
    const cross = await detailApplicationProjection({ auth: { ...auth, requestId: "req_cross" }, applicationId: "application_cross" });
    assert(!cross.ok && cross.status === 404);
    assert.equal(JSON.stringify((await db.doc("applications/application_a").get()).data()), before);
    console.log("APPLICATION_READ_CUTOVER_EMULATOR_CHILD_COMPLETED");
    console.log("Application read cutover emulator regression: rules denial, tenant projections, pagination, cross-tenant denial, allowlist and rollback invariance passed");
  } finally { await testEnv.cleanup(); await deleteApp(app); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
