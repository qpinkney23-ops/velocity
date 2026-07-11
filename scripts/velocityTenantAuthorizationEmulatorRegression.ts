import fs from "fs";
import {
  assertFails, assertSucceeds, initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where,
} from "firebase/firestore";
import {
  getBytes, ref, uploadBytes,
} from "firebase/storage";
import { tenantAuthorizationFixtures as f } from "../tests/tenant-authorization/fixtures";

type AsyncTest = readonly [string, () => Promise<void>];
const tests: AsyncTest[] = [];
const test = (name: string, run: () => Promise<void>) => tests.push([name, run] as const);
const bytes = new Uint8Array([86, 69, 76, 79, 67, 73, 84, 89]);
const projectId = "demo-velocity-tenant-auth";
const firestoreRules = fs.readFileSync("tests/tenant-authorization/firestore.test.rules", "utf8");
const storageRules = fs.readFileSync("tests/tenant-authorization/storage.test.rules", "utf8");

function parseHost(value: string | undefined, fallbackPort: number) {
  const [host, rawPort] = (value || `127.0.0.1:${fallbackPort}`).split(":");
  return { host, port: Number(rawPort) || fallbackPort };
}
const firestoreEmulator = parseHost(process.env.FIRESTORE_EMULATOR_HOST, 8180);
const storageEmulator = parseHost(process.env.FIREBASE_STORAGE_EMULATOR_HOST, 9299);

function ctx(env: RulesTestEnvironment, uid: string) { return env.authenticatedContext(uid); }
function appPath(id: string) { return `applications/${id}`; }
function filePath(tenantId: string, applicationId: string, documentId: string, name = "fixture.pdf") {
  return `tenants/${tenantId}/applications/${applicationId}/documents/${documentId}/${name}`;
}
function metadata(tenantId: string, applicationId: string, documentId: string) {
  return { contentType: "application/pdf", customMetadata: { tenantId, applicationId, documentId } };
}

async function seed(env: RulesTestEnvironment) {
  await env.withSecurityRulesDisabled(async (admin) => {
    const db = admin.firestore();
    for (const tenant of Object.values(f.tenants)) await setDoc(doc(db, `tenants/${tenant.tenantId}`), tenant);
    for (const member of Object.values(f.memberships)) await setDoc(doc(db, `tenants/${member.tenantId}/members/${member.userId}`), member);
    for (const user of Object.values(f.users)) await setDoc(doc(db, `users/${user.userId}`), { ...user, role: user.userId.includes("owner") ? "owner" : "processor" });
    for (const application of Object.values(f.applications)) {
      const target = application.ownershipState === "unresolved_legacy" ? `legacyApplications/${application.applicationId}` : appPath(application.applicationId);
      await setDoc(doc(db, target), application);
    }
    await uploadBytes(ref(admin.storage(), filePath("tenant_alpha", "application_alpha", "document_alpha")), bytes, metadata("tenant_alpha", "application_alpha", "document_alpha"));
    await uploadBytes(ref(admin.storage(), filePath("tenant_beta", "application_beta", "document_beta")), bytes, metadata("tenant_beta", "application_beta", "document_beta"));
  });
}

async function main() {
  console.log("EMULATOR_TEST_EXECUTION_STARTED");
  console.log(`EMULATOR: Firestore connected at ${firestoreEmulator.host}:${firestoreEmulator.port}`);
  console.log(`EMULATOR: Storage connected at ${storageEmulator.host}:${storageEmulator.port}`);
  console.log("EMULATOR: loading isolated Firestore and Storage test rules");
  const env = await initializeTestEnvironment({
    projectId,
    firestore: { ...firestoreEmulator, rules: firestoreRules },
    storage: { ...storageEmulator, rules: storageRules },
  });
  try {
    await env.clearFirestore(); await env.clearStorage(); await seed(env);
    console.log("EMULATOR: synthetic tenant fixtures seeded with rules disabled");

    test("01 active member reads own tenant", () => assertSucceeds(getDoc(doc(ctx(env, "owner_alpha").firestore(), "tenants/tenant_alpha"))).then(() => undefined));
    test("02 active member reads own membership", () => assertSucceeds(getDoc(doc(ctx(env, "processor_alpha").firestore(), "tenants/tenant_alpha/members/processor_alpha"))).then(() => undefined));
    test("03 cross-tenant membership denied", () => assertFails(getDoc(doc(ctx(env, "owner_alpha").firestore(), "tenants/tenant_beta/members/owner_beta"))).then(() => undefined));
    test("04 active member reads own application", () => assertSucceeds(getDoc(doc(ctx(env, "processor_alpha").firestore(), appPath("application_alpha")))).then(() => undefined));
    test("05 cross-tenant application denied", () => assertFails(getDoc(doc(ctx(env, "owner_alpha").firestore(), appPath("application_beta")))).then(() => undefined));
    test("06 direct cross-tenant document ID denied", () => assertFails(getDoc(doc(ctx(env, "processor_alpha").firestore(), appPath("application_beta")))).then(() => undefined));
    test("07 suspended membership denied", () => assertFails(getDoc(doc(ctx(env, "suspended_alpha").firestore(), appPath("application_alpha")))).then(() => undefined));
    test("08 disabled membership denied", () => assertFails(getDoc(doc(ctx(env, "disabled_alpha").firestore(), appPath("application_alpha")))).then(() => undefined));
    test("09 unknown role denied", () => assertFails(getDoc(doc(ctx(env, "unknown_alpha").firestore(), appPath("application_alpha")))).then(() => undefined));
    test("10 missing membership denied", () => assertFails(getDoc(doc(ctx(env, "outsider_user").firestore(), appPath("application_alpha")))).then(() => undefined));
    test("11 forged tenant on create denied", () => assertFails(setDoc(doc(ctx(env, "processor_alpha").firestore(), appPath("application_forged_tenant")), { ...f.applications.application_beta, applicationId: "application_forged_tenant", createdBy: "processor_alpha" })).then(() => undefined));
    test("12 forged creator denied", () => assertFails(setDoc(doc(ctx(env, "processor_alpha").firestore(), appPath("application_forged_creator")), { ...f.applications.application_alpha, applicationId: "application_forged_creator", createdBy: "owner_alpha" })).then(() => undefined));
    test("13 tenant and creator ownership immutable", async () => {
      await assertFails(updateDoc(doc(ctx(env, "processor_alpha").firestore(), appPath("application_alpha")), { tenantId: "tenant_beta" }));
      await assertFails(updateDoc(doc(ctx(env, "processor_alpha").firestore(), appPath("application_alpha")), { createdBy: "processor_alpha" }));
    });
    test("14 user cannot modify own role", () => assertFails(updateDoc(doc(ctx(env, "processor_alpha").firestore(), "users/processor_alpha"), { role: "owner" })).then(() => undefined));
    test("15 user cannot create or activate own membership", async () => {
      await assertFails(setDoc(doc(ctx(env, "outsider_user").firestore(), "tenants/tenant_alpha/members/outsider_user"), { tenantId: "tenant_alpha", userId: "outsider_user", role: "owner", membershipStatus: "active" }));
      await assertFails(updateDoc(doc(ctx(env, "suspended_alpha").firestore(), "tenants/tenant_alpha/members/suspended_alpha"), { membershipStatus: "active" }));
    });
    test("16 viewer cannot write", () => assertFails(updateDoc(doc(ctx(env, "viewer_alpha").firestore(), appPath("application_alpha")), { borrowerLabel: "Synthetic Viewer Update" })).then(() => undefined));
    test("17 processor and underwriter remain conservative", async () => {
      await assertSucceeds(updateDoc(doc(ctx(env, "processor_alpha").firestore(), appPath("application_alpha")), { borrowerLabel: "Synthetic Processor Update" }));
      await assertFails(updateDoc(doc(ctx(env, "underwriter_alpha").firestore(), appPath("application_alpha")), { borrowerLabel: "Synthetic Underwriter Update" }));
    });
    test("18 service-account behavior not granted through client rules", () => assertFails(getDoc(doc(ctx(env, "service_alpha").firestore(), appPath("application_alpha")))).then(() => undefined));
    test("19 unresolved legacy application fails closed", () => assertFails(getDoc(doc(ctx(env, "owner_alpha").firestore(), "legacyApplications/application_legacy"))).then(() => undefined));
    test("20 global collection reads cannot bypass tenant isolation", async () => {
      await assertFails(getDocs(collection(ctx(env, "owner_alpha").firestore(), "applications")));
      const scoped = await assertSucceeds(getDocs(query(collection(ctx(env, "owner_alpha").firestore(), "applications"), where("tenantId", "==", "tenant_alpha"), where("ownershipState", "==", "tenant_owned"))));
      if (scoped.size !== 1) throw new Error("tenant-scoped query did not return exactly one application");
    });
    test("21 Storage alpha cannot reach beta paths", () => assertFails(getBytes(ref(ctx(env, "owner_alpha").storage(), filePath("tenant_beta", "application_beta", "document_beta")))).then(() => undefined));
    test("22 Storage writes require active membership", () => assertFails(uploadBytes(ref(ctx(env, "suspended_alpha").storage(), filePath("tenant_alpha", "application_alpha", "document_suspended", "suspended.pdf")), bytes, metadata("tenant_alpha", "application_alpha", "document_suspended"))).then(() => undefined));
    test("23 Storage path tenant must match membership", () => assertFails(uploadBytes(ref(ctx(env, "processor_alpha").storage(), filePath("tenant_beta", "application_beta", "document_wrong_tenant", "wrong.pdf")), bytes, metadata("tenant_beta", "application_beta", "document_wrong_tenant"))).then(() => undefined));
    test("24 file metadata cannot forge ownership", () => assertFails(uploadBytes(ref(ctx(env, "processor_alpha").storage(), filePath("tenant_alpha", "application_alpha", "document_forged", "forged.pdf")), bytes, metadata("tenant_beta", "application_alpha", "document_forged"))).then(() => undefined));
    test("25 unauthenticated access denied", async () => {
      await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), "tenants/tenant_alpha")));
      await assertFails(getBytes(ref(env.unauthenticatedContext().storage(), filePath("tenant_alpha", "application_alpha", "document_alpha"))));
      await assertFails(uploadBytes(ref(env.unauthenticatedContext().storage(), filePath("tenant_alpha", "application_alpha", "document_anonymous", "anonymous.pdf")), bytes, metadata("tenant_alpha", "application_alpha", "document_anonymous")));
    });
    test("26 same-tenant conservative Storage behavior", async () => {
      await assertSucceeds(getBytes(ref(ctx(env, "viewer_alpha").storage(), filePath("tenant_alpha", "application_alpha", "document_alpha"))));
      await assertFails(uploadBytes(ref(ctx(env, "viewer_alpha").storage(), filePath("tenant_alpha", "application_alpha", "document_viewer", "viewer.pdf")), bytes, metadata("tenant_alpha", "application_alpha", "document_viewer")));
      await assertSucceeds(uploadBytes(ref(ctx(env, "processor_alpha").storage(), filePath("tenant_alpha", "application_alpha", "document_processor", "processor.pdf")), bytes, metadata("tenant_alpha", "application_alpha", "document_processor")));
    });
    test("27 isolated rules and production separation", async () => {
      if (!firestoreRules.includes("TEST ONLY") || !storageRules.includes("TEST ONLY")) throw new Error("test-only rule labels missing");
      if (fs.readFileSync("firestore.rules", "utf8").includes("tenant_alpha") || fs.readFileSync("storage.rules", "utf8").includes("tenant_alpha")) throw new Error("synthetic tenant leaked into production rules");
    });
    test("28 fixtures remain PII-free", async () => {
      const serialized = JSON.stringify(f); if (/@|ssn|social security|date of birth/i.test(serialized)) throw new Error("fixture contains PII-like data");
    });

    let passed = 0; const failures: string[] = [];
    for (const [name, run] of tests) {
      try { await run(); passed++; console.log(`PASS: ${name}`); }
      catch (error: any) { const message = error?.message || String(error); failures.push(`${name}: ${message}`); console.error(`FAIL: ${name}\n  ${message}`); }
    }
    console.log(`\nFirebase Emulator tenant authorization result: ${passed}/${tests.length} passed`);
    if (failures.length) { failures.forEach((failure) => console.log(`- ${failure}`)); process.exitCode = 1; }
  } finally {
    console.log("EMULATOR: cleaning test data and closing rules test environment");
    await env.clearFirestore().catch(() => undefined); await env.clearStorage().catch(() => undefined); await env.cleanup();
    console.log("EMULATOR_TEST_EXECUTION_FINISHED");
  }
}

main().catch((error) => { console.error("EMULATOR_TEST_FATAL:", error?.message || String(error)); process.exitCode = 1; });

