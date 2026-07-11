import fs from "fs";
import { tenantAuthorizationFixtures as f } from "../tests/tenant-authorization/fixtures";
import { firestoreTestPolicy as db, storageTestPolicy as storage } from "../tests/tenant-authorization/policy";

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
const memberships = Object.values(f.memberships);
const applications = Object.values(f.applications);
const state = Object.freeze({ memberships, applications });
const auth = (uid: string | null) => Object.freeze({ uid });
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

const cases: Array<readonly [string, () => void]> = [];
const test = (name: string, run: () => void) => cases.push([name, run] as const);

test("01 active member reads own tenant", () => assert(db.readTenant(state, auth("owner_alpha"), "tenant_alpha"), "same-tenant read denied"));
test("02 active member reads own membership", () => assert(db.readMembership(state, auth("processor_alpha"), "tenant_alpha", "processor_alpha"), "own membership denied"));
test("03 cross-tenant membership read denied", () => assert(!db.readMembership(state, auth("owner_alpha"), "tenant_beta", "owner_beta"), "cross-tenant membership allowed"));
test("04 active member reads own application", () => assert(db.readApplication(state, auth("processor_alpha"), f.applications.application_alpha), "same-tenant application denied"));
test("05 cross-tenant application denied", () => assert(!db.readApplication(state, auth("owner_alpha"), f.applications.application_beta), "cross-tenant application allowed"));
test("06 direct cross-tenant document ID denied", () => assert(!db.readApplication(state, auth("processor_alpha"), f.applications.application_beta), "direct ID bypass allowed"));
test("07 suspended membership denied", () => assert(!db.readApplication(state, auth("suspended_alpha"), f.applications.application_alpha), "suspended member allowed"));
test("08 disabled membership denied", () => assert(!db.readApplication(state, auth("disabled_alpha"), f.applications.application_alpha), "disabled member allowed"));
test("09 unknown role denied", () => assert(!db.readApplication(state, auth("unknown_alpha"), f.applications.application_alpha), "unknown role allowed"));
test("10 missing membership denied", () => assert(!db.readApplication(state, auth("outsider_user"), f.applications.application_alpha), "missing membership allowed"));
test("11 forged tenant on create denied", () => assert(!db.createApplication(state, auth("processor_alpha"), { ...f.applications.application_beta, createdBy: "processor_alpha" }), "forged tenant allowed"));
test("12 forged creator denied", () => assert(!db.createApplication(state, auth("processor_alpha"), { ...f.applications.application_alpha, createdBy: "owner_alpha" }), "forged creator allowed"));
test("13 tenant and creator immutable", () => {
  assert(!db.updateApplication(state, auth("processor_alpha"), f.applications.application_alpha, { ...f.applications.application_alpha, tenantId: "tenant_beta" }), "tenant changed");
  assert(!db.updateApplication(state, auth("processor_alpha"), f.applications.application_alpha, { ...f.applications.application_alpha, createdBy: "processor_alpha" }), "creator changed");
});
test("14 own role cannot be modified", () => assert(!db.writeUserProfile(), "profile role write allowed"));
test("15 own membership cannot be created or activated", () => assert(!db.writeMembership(), "membership write allowed"));
test("16 viewer cannot write", () => assert(!db.updateApplication(state, auth("viewer_alpha"), f.applications.application_alpha, f.applications.application_alpha), "viewer write allowed"));
test("17 processor and underwriter remain conservative", () => {
  assert(db.updateApplication(state, auth("processor_alpha"), f.applications.application_alpha, clone(f.applications.application_alpha)), "explicit processor update denied");
  assert(!db.updateApplication(state, auth("underwriter_alpha"), f.applications.application_alpha, clone(f.applications.application_alpha)), "untested underwriter write granted");
});
test("18 service-account client role denied", () => assert(!db.readApplication(state, auth("service_alpha"), f.applications.application_alpha), "client service-account role allowed"));
test("19 unresolved legacy fails closed", () => assert(!db.readApplication(state, auth("owner_alpha"), f.applications.unresolved_legacy), "legacy record allowed"));
test("20 global collection read cannot bypass tenant isolation", () => {
  assert(db.listApplications(state, auth("owner_alpha")).length === 0, "unscoped global query returned records");
  const alpha = db.listApplications(state, auth("owner_alpha"), "tenant_alpha"); assert(alpha.length === 1 && alpha[0].tenantId === "tenant_alpha", "scoped query leaked or omitted records");
});
test("21 Storage alpha cannot reach beta", () => assert(!storage.read(state, auth("owner_alpha"), "tenant_beta", "application_beta", f.fileMetadata.beta), "cross-tenant Storage read allowed"));
test("22 Storage writes require active membership", () => assert(!storage.write(state, auth("suspended_alpha"), "tenant_alpha", "application_alpha", f.fileMetadata.alpha), "inactive Storage write allowed"));
test("23 Storage path tenant must match membership", () => assert(!storage.write(state, auth("processor_alpha"), "tenant_beta", "application_beta", f.fileMetadata.beta), "wrong-tenant Storage write allowed"));
test("24 file metadata cannot forge ownership", () => assert(!storage.write(state, auth("processor_alpha"), "tenant_alpha", "application_alpha", { ...f.fileMetadata.alpha, tenantId: "tenant_beta" }), "forged file metadata allowed"));
test("25 unauthenticated Firestore and Storage denied", () => {
  assert(!db.readTenant(state, auth(null), "tenant_alpha") && !db.readApplication(state, auth(null), f.applications.application_alpha), "anonymous Firestore allowed");
  assert(!storage.read(state, auth(null), "tenant_alpha", "application_alpha", f.fileMetadata.alpha) && !storage.write(state, auth(null), "tenant_alpha", "application_alpha", f.fileMetadata.alpha), "anonymous Storage allowed");
});
test("26 same-tenant conservative Storage behavior", () => {
  assert(storage.read(state, auth("viewer_alpha"), "tenant_alpha", "application_alpha", f.fileMetadata.alpha), "viewer same-tenant read denied");
  assert(!storage.write(state, auth("viewer_alpha"), "tenant_alpha", "application_alpha", f.fileMetadata.alpha), "viewer Storage write allowed");
  assert(storage.write(state, auth("processor_alpha"), "tenant_alpha", "application_alpha", f.fileMetadata.alpha), "processor Storage write denied");
});
test("27 harness remains isolated and test-only", () => {
  const productionFirestore = fs.readFileSync("firestore.rules", "utf8"); const productionStorage = fs.readFileSync("storage.rules", "utf8");
  const testFirestore = fs.readFileSync("tests/tenant-authorization/firestore.test.rules", "utf8"); const testStorage = fs.readFileSync("tests/tenant-authorization/storage.test.rules", "utf8");
  assert(testFirestore.includes("TEST ONLY") && testStorage.includes("TEST ONLY"), "test rules not labeled");
  assert(!productionFirestore.includes("tenant_alpha") && !productionStorage.includes("tenant_alpha"), "synthetic rules leaked into production rules");
  const config = fs.readFileSync("firebase.tenant-auth.test.json", "utf8");
  assert(config.includes("tests/tenant-authorization/firestore.test.rules") && config.includes("tests/tenant-authorization/storage.test.rules"), "test config is not isolated to test rules");
});
test("28 fixtures are deterministic, immutable, and PII-free", () => {
  assert(Object.isFrozen(f) && Object.isFrozen(f.memberships) && Object.isFrozen(f.applications), "fixtures not frozen");
  const serialized = JSON.stringify(f); assert(!/@|ssn|social security|date of birth/i.test(serialized), "fixture contains PII-like data");
});

let passed = 0; const failures: string[] = [];
for (const [name, run] of cases) { try { run(); passed++; console.log(`PASS: ${name}`); } catch (error: any) { const message = error?.message || String(error); failures.push(`${name}: ${message}`); console.error(`FAIL: ${name}\n  ${message}`); } }
console.log(`\nTenant authorization regression result: ${passed}/${cases.length} passed`);
console.log("Result source: deterministic fallback (Firebase Emulator unavailable).");
if (failures.length) { failures.forEach((failure) => console.log(`- ${failure}`)); process.exitCode = 1; }
