import assert from "node:assert/strict";
import fs from "node:fs";

const admin = fs.readFileSync("app/admin/page.tsx", "utf8");
const rules = fs.readFileSync("firestore.rules", "utf8");
const storageRules = fs.readFileSync("storage.rules", "utf8");
const workflow = fs.readFileSync("lib/server/workflow/applicationWorkflowCommands.ts", "utf8");
const create = fs.readFileSync("lib/server/applications/applicationCreateProduction.ts", "utf8");
let passed = 0;
const test = (name: string, run: () => void) => { run(); console.log(`PASS ${++passed}: ${name}`); };

test("obsolete global scan-derived repair is removed", () => {
  for (const marker of ["backfillFromScan", "Run Backfill", "Backfilling...", "scan?.extracted", "getDocs("])
    assert(!admin.includes(marker));
});
test("admin page has no application mutation primitive or global mutation loop", () => {
  for (const marker of ["updateDoc", "serverTimestamp", 'doc(db, "applications"']) assert(!admin.includes(marker));
});
test("unrelated admin reads, underwriter display, and billing controls remain", () => {
  for (const marker of ['collection(db, "applications")', 'collection(db, "underwriters")', "/api/stripe/checkout", "/api/stripe/portal"])
    assert(admin.includes(marker));
});
test("retirement does not create a generic or privileged backfill API", () => {
  assert(!fs.existsSync("app/api/admin/application-backfill/route.ts"));
  assert(!fs.existsSync("lib/server/admin/applicationBackfill.ts"));
});
test("production application update rule is server-authoritative", () => {
  const applicationRule = rules.slice(rules.indexOf("match /applications/{id}"), rules.indexOf("// Default deny"));
  assert(applicationRule.includes("allow read: if isSignedIn()"));
  assert(applicationRule.includes("allow create: if false"));
  assert(applicationRule.includes("allow update: if false"));
  assert(applicationRule.includes("allow delete: if isAdmin()"));
});
test("no unrelated production rule changes are encoded by this slice", () => {
  assert(rules.includes("match /users/{uid}"));
  assert(rules.includes("match /underwriters/{id}"));
  assert(storageRules.length > 0);
});
test("legitimate application creation remains server transactional", () => {
  assert(create.includes("runTransaction"));
  assert(create.includes("applicationCreateAuditEvents"));
});
test("legitimate application updates remain authenticated authorized commands", () => {
  assert(workflow.includes("authorizeApplicationAction"));
  assert(workflow.includes('permission: "application.update"'));
  assert(workflow.includes("workflowAuditEvents"));
  assert(workflow.includes("workflowCommands"));
});
test("retirement introduces no borrower transformation or guessing", () => {
  assert(!admin.includes("scanBorrower"));
  assert(!admin.includes("scanEmail"));
  assert(!admin.includes("patch.borrowerName"));
  assert(!admin.includes("patch.email"));
});

console.log(`Admin backfill cutover deterministic regression: ${passed}/${passed} passed`);
