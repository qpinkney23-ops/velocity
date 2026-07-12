import assert from "node:assert/strict";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { applicationResourceFixtures as f } from "../lib/contracts/applicationResourceFixtures";
import { resolveApplicationResourceFactsCore } from "../lib/server/authorization/applicationResourceResolverCore";

console.log("EMULATOR_APPLICATION_RESOURCE_TEST_EXECUTION_STARTED");
async function main() {
const app = initializeApp({ projectId: process.env.GCLOUD_PROJECT || "demo-velocity-application-resource" }, `application-resource-${Date.now()}`); const db = getFirestore(app); const collection = db.collection("applications");
const before: Record<string, unknown> = {}; for (const record of [f.tenantOwned, f.crossTenant, f.unresolved, f.pending, f.rejected, f.contradictory]) { const data = { ...record } as any; delete data.applicationId; if (data.updatedAt) data.updatedAt = Timestamp.fromDate(new Date(data.updatedAt)); await collection.doc(record.applicationId).set(data); before[record.applicationId] = (await collection.doc(record.applicationId).get()).data(); }
const dependency = { getApplicationById: async (id: string) => { const snap = await collection.doc(id).get(); return snap.exists ? { exists: true, data: snap.data() } : { exists: false }; } };
const now = () => new Date("2026-01-01T00:00:00.000Z"); const resolve = (id: string) => resolveApplicationResourceFactsCore({ applicationId: id, provenanceSource: "firestore_admin" }, dependency, now);
const valid = await resolve("application_alpha"); assert(valid.ok && valid.facts.tenantId === "tenant_alpha" && valid.facts.applicationId === "application_alpha"); assert(!JSON.stringify(valid).match(/borrower|email|loanAmount/i));
assert(!(await resolve("application_missing")).ok); const legacy = await resolve("application_legacy"), pending = await resolve("application_pending"), rejected = await resolve("application_rejected"), malformed = await resolve("application_contradictory"); assert(legacy.ok && legacy.facts.ownershipState === "unresolved_legacy"); assert(pending.ok && pending.facts.ownershipState === "migration_pending"); assert(!rejected.ok && rejected.error.code === "APPLICATION_OWNERSHIP_REJECTED"); assert(!malformed.ok);
const callerTenant = "tenant_beta"; assert(valid.ok && valid.facts.tenantId !== callerTenant); const creatorOnly = await resolveApplicationResourceFactsCore({ applicationId: "creator_only" }, { getApplicationById: async () => ({ exists: true, data: { createdBy: "creator_alpha", companyProfileId: "tenant_alpha", email: "synthetic@example.invalid", loanNumber: "SYNTHETIC" } }) }, now); assert(creatorOnly.ok && creatorOnly.facts.ownershipState === "unresolved_legacy" && !creatorOnly.facts.tenantId);
const failed = await resolveApplicationResourceFactsCore({ applicationId: "application_alpha" }, { getApplicationById: async () => { throw new Error("raw dependency failure"); } }, now); assert(!failed.ok && failed.error.code === "DEPENDENCY_FAILURE");
for (const id of Object.keys(before)) assert.deepEqual((await collection.doc(id).get()).data(), before[id]);
await deleteApp(app); console.log("EMULATOR_APPLICATION_RESOURCE_TEST_EXECUTION_COMPLETED"); console.log("Application resource resolver emulator regression: 13/13 passed");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
