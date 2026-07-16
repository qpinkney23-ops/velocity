// @ts-nocheck -- emulator assertions intentionally exercise dynamic rule and command responses.
import assert from "node:assert/strict";
import { deleteApp, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { assertFails, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { createProductionApplicationForUser } from "../lib/server/applications/applicationCreateProduction";
import { detailApplicationProjection } from "../lib/server/applications/applicationReadProjection";
import { resolverAuth, resolverMembership, resolverTenant } from "../lib/server/authorization/tenantAuthorizationResolverFixtures";

const project = "demo-velocity-admin-backfill-cutover";
const now = "2026-07-16T17:00:00.000Z";
const auth = (uid: string, requestId: string) => ({ ...resolverAuth(uid), requestId, correlationId: `correlation_${requestId}` });

async function main() {
  const [host, portText] = (process.env.FIRESTORE_EMULATOR_HOST || "").split(":");
  if (!host || process.env.GCLOUD_PROJECT !== project) throw Error("DEMO_FIRESTORE_EMULATOR_REQUIRED");
  console.log("ADMIN_BACKFILL_CUTOVER_EMULATOR_CHILD_STARTED");
  Object.assign(process.env, { NODE_ENV: "test", FIREBASE_PROJECT_ID: project, FIREBASE_CLIENT_EMAIL: "synthetic@example.test", FIREBASE_PRIVATE_KEY: "unused-emulator-key" });
  const app = initializeApp({ projectId: project });
  const db = getFirestore(app);
  const env = await initializeTestEnvironment({ projectId: project, firestore: { host, port: Number(portText) } });
  try {
    await env.clearFirestore();
    await db.doc("tenants/tenant_alpha").set(resolverTenant("tenant_alpha", "active"));
    await db.doc("tenants/tenant_alpha/members/admin_user").set(resolverMembership("tenant_alpha", "admin_user", "admin", "active"));
    await db.doc("userTenantMemberships/admin_user/tenants/tenant_alpha").set({ tenantId: "tenant_alpha", userId: "admin_user" });
    await db.doc("users/admin_user").set({ role: "admin" });
    await db.doc("applications/application_alpha").set({ tenantId: "tenant_alpha", ownershipState: "tenant_owned", createdBy: "admin_user", borrowerName: "Existing Borrower", email: "existing@example.test", scan: { extracted: { borrower: "Conflicting Scan", email: "conflict@example.test" } }, authorizationVersion: "auth-v1", workflowVersion: "workflow-v1", status: "New", createdAt: now, updatedAt: now, notes: "before" });
    await db.doc("applications/application_beta").set({ tenantId: "tenant_beta", ownershipState: "tenant_owned", createdBy: "other_user", borrowerName: "Other Tenant", authorizationVersion: "beta-v1", workflowVersion: "beta-v1", status: "New", createdAt: now, updatedAt: now });
    await db.doc("applications/application_delete_control").set({ tenantId: "tenant_alpha", ownershipState: "tenant_owned", createdBy: "admin_user" });

    const client = env.authenticatedContext("admin_user").firestore();
    const crossTenantClient = env.authenticatedContext("other_user").firestore();
    const alphaBefore = JSON.stringify((await db.doc("applications/application_alpha").get()).data());
    const deleteBefore = JSON.stringify((await db.doc("applications/application_delete_control").get()).data());
    await assertFails(client.doc("applications/application_alpha").get());
    await assertFails(client.doc("applications/application_alpha").update({ notes: "browser mutation" }));
    await assertFails(client.doc("applications/browser_created").set({ tenantId: "tenant_alpha", borrowerName: "Browser Borrower" }));
    await assertFails(client.doc("applications/application_delete_control").delete());
    await assertFails(crossTenantClient.doc("applications/application_alpha").get());
    assert.equal(JSON.stringify((await db.doc("applications/application_alpha").get()).data()), alphaBefore);
    assert.equal(JSON.stringify((await db.doc("applications/application_delete_control").get()).data()), deleteBefore);
    assert(!(await db.doc("applications/browser_created").get()).exists);

    const created = await createProductionApplicationForUser(auth("admin_user", "request_create_001"), { borrowerName: "Created Borrower", email: "created@example.test", loanAmount: 300000, idempotencyKey: "admin_cutover_create_001" });
    assert(created.ok);
    const canonicalRead = await detailApplicationProjection({ auth: auth("admin_user", "request_read_001"), applicationId: created.applicationId });
    assert(canonicalRead.ok);
    assert.equal(canonicalRead.application.borrowerName, "Created Borrower");
    const alpha = (await db.doc("applications/application_alpha").get()).data()!;
    const beta = (await db.doc("applications/application_beta").get()).data()!;
    assert.equal(alpha.borrowerName, "Existing Borrower");
    assert.equal(alpha.email, "existing@example.test");
    assert.equal(alpha.notes, "before");
    assert.equal(beta.borrowerName, "Other Tenant");
    const audits = await db.collection("tenants/tenant_alpha/applicationCreateAuditEvents").get();
    assert(!audits.empty);
    assert(!/Existing Borrower|existing@example|Conflicting Scan|conflict@example/.test(JSON.stringify(audits.docs.map(document => document.data()))));
    console.log("ROLLBACK_EVIDENCE: direct browser create, read, update, and delete are denied; Admin setup and canonical server reads remain functional");
    console.log("ADMIN_BACKFILL_CUTOVER_EMULATOR_CHILD_COMPLETED");
  } finally {
    await env.cleanup();
    await deleteApp(app);
  }
}
main().catch(error => { console.error(error); process.exit(1); });
