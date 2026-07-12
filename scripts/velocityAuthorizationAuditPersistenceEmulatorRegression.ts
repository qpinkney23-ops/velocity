import assert from "node:assert/strict";
import { deleteApp, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { authorizationAuditFixtures as f } from "../lib/contracts/authorizationAuditFixtures";
import { fingerprintAuthorizationAuditEvent, persistAuthorizationAuditEventCore, type AuthorizationAuditPersistenceRepository } from "../lib/server/authorization/authorizationAuditPersistenceCore";

console.log("EMULATOR_AUTHORIZATION_AUDIT_PERSISTENCE_STARTED");
async function main() {
  const app = initializeApp({ projectId: process.env.GCLOUD_PROJECT || "demo-velocity-authorization-audit-persistence" }, `audit-persistence-${Date.now()}`), db = getFirestore(app), at = "2026-07-12T04:00:00.000Z";
  await db.doc("tenants/tenant_alpha").set({ marker: "business-record-unchanged" }); await db.doc("applications/application_alpha").set({ marker: "application-record-unchanged" }); const businessBefore = JSON.stringify([(await db.doc("tenants/tenant_alpha").get()).data(), (await db.doc("applications/application_alpha").get()).data()]);
  const repository: AuthorizationAuditPersistenceRepository = { createOrRead: async (path, document) => db.runTransaction(async (transaction) => { const ref = db.doc(path), snap = await transaction.get(ref); if (snap.exists) return { result: "existing", document: snap.data() }; transaction.create(ref, document); return { result: "created" }; }) };
  const context = { scope: "tenant" as const, tenantId: "tenant_alpha", persistedAt: at }; const allow = await persistAuthorizationAuditEventCore(f.events.allowed, context, repository), deny = await persistAuthorizationAuditEventCore(f.events.denied, context, repository); assert(allow.ok && deny.ok && allow.receipt.writeResult === "created" && deny.receipt.writeResult === "created");
  const allowRef = db.doc(`tenants/tenant_alpha/authorizationAuditEvents/${f.events.allowed.eventId}`), stored = (await allowRef.get()).data()!; assert.equal(stored.integrityFingerprint, fingerprintAuthorizationAuditEvent(f.events.allowed as any)); assert(!JSON.stringify(stored).match(/borrower|email|loanAmount|Synthetic Borrower/i));
  const retry = await persistAuthorizationAuditEventCore(f.events.allowed, { ...context, persistedAt: "2026-07-12T05:00:00.000Z" }, repository); assert(retry.ok && retry.receipt.writeResult === "already_exists_identical"); const conflict = await persistAuthorizationAuditEventCore({ ...f.events.allowed, classification: "security_event" }, context, repository); assert(!conflict.ok && conflict.error.code === "AUDIT_EVENT_CONFLICT");
  const moved = await persistAuthorizationAuditEventCore(f.events.allowed, { ...context, tenantId: "tenant_beta" }, repository); assert(!moved.ok && moved.error.code === "AUDIT_TENANT_MISMATCH" && !(await db.doc(`tenants/tenant_beta/authorizationAuditEvents/${f.events.allowed.eventId}`).get()).exists);
  const malformed = await persistAuthorizationAuditEventCore({ ...f.events.allowed, borrowerName: "Synthetic Borrower" }, context, repository); assert(!malformed.ok); const failed = await persistAuthorizationAuditEventCore(f.events.crossTenant, context, { createOrRead: async () => { throw new Error("raw firestore"); } }); assert(!failed.ok && failed.error.code === "AUDIT_DEPENDENCY_FAILURE");
  assert.deepEqual(Object.keys(repository), ["createOrRead"]); assert((await allowRef.get()).exists); const businessAfter = JSON.stringify([(await db.doc("tenants/tenant_alpha").get()).data(), (await db.doc("applications/application_alpha").get()).data()]); assert.equal(businessAfter, businessBefore);
  await deleteApp(app); console.log("EMULATOR_AUTHORIZATION_AUDIT_PERSISTENCE_FINISHED"); console.log("Authorization audit persistence emulator regression: 16/16 passed");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
