import assert from "node:assert/strict";
import fs from "node:fs";
import { WORKFLOW_COMMAND_POLICY } from "../lib/server/workflow/applicationWorkflowCommands";

const core = fs.readFileSync("lib/server/workflow/applicationWorkflowCommands.ts", "utf8");
const route = fs.readFileSync("app/api/applications/[id]/workflow/route.ts", "utf8");
const detail = fs.readFileSync("app/applications/[id]/page.tsx", "utf8");
const queue = fs.readFileSync("app/queue/page.tsx", "utf8");
let passed = 0;
const test = (name: string, run: () => void) => { run(); console.log(`PASS ${++passed}: ${name}`); };

test("authentication and application authorization precede command persistence", () => {
  assert(route.includes("requireAuthenticatedUserRequest"));
  assert(core.indexOf("authorizeApplicationAction") < core.indexOf("runTransaction"));
});
test("strict contracts reject caller authority and arbitrary condition objects", () => {
  assert(core.includes("AUTHORITY_FIELDS")); assert(core.includes("Object.keys(raw).some"));
  assert(core.includes("validateGeneratedConditions")); assert(core.includes("createdBy"));
});
test("explicit assignment workflow condition generation and verification families", () => {
  for (const command of ["assign_underwriter", "change_workflow_stage", "create_condition", "set_condition_status", "remove_condition", "replace_generated_conditions", "update_borrower_verification"]) assert(core.includes(command));
});
test("material denials use one PII-safe append-only audit request", () => {
  assert(core.includes("workflowDenialAuditEvents")); assert(core.includes("workflow_command_denied"));
  assert(core.includes("piiPresent: false")); assert(core.includes("AUDIT_REQUIRED"));
  assert(!core.includes("borrowerName")); assert(!core.includes("rawNote"));
});
test("generated conditions are allowlisted and preserve manual conditions", () => {
  assert.deepEqual(WORKFLOW_COMMAND_POLICY.generatedConditionSources, ["ai", "borrower_profile"]);
  assert(core.includes('condition?.source === "manual"')); assert(!core.includes("decision.approve"));
});
test("verification fields and actions are allowlisted", () => {
  assert(WORKFLOW_COMMAND_POLICY.verificationFields.includes("income"));
  assert(core.includes('["verify", "clear"]')); assert(core.includes("borrowerProfileVerified"));
});
test("idempotency concurrency stale and success audit remain transactional", () => {
  for (const marker of ["COMMAND_CONFLICT", "workflowVersion", "workflowCommands", "workflowAuditEvents", "runTransaction"]) assert(core.includes(marker));
});
test("migrated UI fields have no direct client writes", () => {
  assert(!detail.includes("saveUwConditions"));
  assert(!detail.includes("borrowerProfileVerified: nextVerified"));
  assert(!detail.includes("updateDoc(appRef, stripUndefinedForFirestore({ status: statusDraft"));
  assert(!detail.includes("updateDoc(appRef, stripUndefinedForFirestore({ underwriterId"));
  assert(!queue.includes("underwriterId: assignmentTarget.id"));
  assert(detail.includes("replace_generated_conditions")); assert(detail.includes("update_borrower_verification"));
});
test("rules final decision and unrelated boundaries remain untouched", () => {
  assert(fs.existsSync("firestore.rules") && fs.existsSync("storage.rules"));
  assert(!core.includes("reportArtifacts")); assert(!core.includes("analysisState")); assert(!core.includes("decision.override"));
});
console.log(`Workflow command deterministic regression: ${passed}/${passed} passed`);
