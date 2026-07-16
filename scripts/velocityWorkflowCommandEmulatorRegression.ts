import assert from "node:assert/strict";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { resolverAuth, resolverMembership, resolverTenant } from "../lib/server/authorization/tenantAuthorizationResolverFixtures";
import { executeApplicationWorkflowCommand } from "../lib/server/workflow/applicationWorkflowCommands";

console.log("WORKFLOW_COMMAND_EMULATOR_CHILD_STARTED");

async function main() {
  if (!getApps().length) initializeApp({ projectId: process.env.GCLOUD_PROJECT || "demo-velocity-workflow-command", storageBucket: "demo-velocity-workflow-command.appspot.com" });
  const db = getFirestore();
  const authForUser = (uid: string, suffix: string) => ({ ...resolverAuth(uid), requestId: `req_${suffix}`, correlationId: `corr_${suffix}` }) as any;
  const authFor = (suffix: string) => authForUser("admin_user", suffix);
  for (const tenant of ["tenant_alpha", "tenant_beta"]) await db.doc(`tenants/${tenant}`).set(resolverTenant(tenant, "active"));
  for (const [uid, tenant, role, status] of [
    ["admin_user", "tenant_alpha", "admin", "active"],
    ["processor_user", "tenant_alpha", "processor", "active"],
    ["loan_officer_user", "tenant_alpha", "loan_officer", "active"],
    ["underwriter_user", "tenant_alpha", "underwriter", "active"],
    ["inactive_uw", "tenant_alpha", "underwriter", "disabled"],
    ["cross_uw", "tenant_beta", "underwriter", "active"],
  ]) {
    await db.doc(`userTenantMemberships/${uid}/tenants/${tenant}`).set({ tenantId: tenant });
    await db.doc(`tenants/${tenant}/members/${uid}`).set(resolverMembership(tenant, uid, role, status));
  }
  await db.doc("applications/application_alpha").set({ tenantId: "tenant_alpha", ownershipState: "tenant_owned", authorizationVersion: "auth-v1", workflowVersion: "workflow-v1", status: "New", createdAt: "2026-07-15T20:00:00.000Z", updatedAt: "2026-07-15T20:00:00.000Z", borrowerName: "Synthetic Borrower", loanAmount: 250000 });
  await db.doc("applicationDocuments/document_unchanged").set({ applicationId: "application_alpha", tenantId: "tenant_alpha", marker: "unchanged" });
  await db.doc("reportArtifacts/report_unchanged").set({ applicationId: "application_alpha", marker: "unchanged" });
  const version = async () => (await db.doc("applications/application_alpha").get()).data()?.workflowVersion;
  let passed = 0;
  const test = async (name: string, run: () => Promise<void>) => { await run(); console.log(`PASS ${++passed}: ${name}`); };

  await test("authorized assignment and identical retry", async () => {
    const body = { commandType: "assign_underwriter", assigneeId: "underwriter_user", expectedVersion: "workflow-v1", idempotencyKey: "assign_key" };
    const first = await executeApplicationWorkflowCommand({ auth: authFor("assign"), applicationId: "application_alpha", body });
    if (!first.ok) console.error("ASSIGNMENT_FAILURE", first);
    assert(first.ok);
    const retry = await executeApplicationWorkflowCommand({ auth: authFor("assign_retry"), applicationId: "application_alpha", body });
    assert(retry.ok && retry.writeResult === "already_exists_identical");
  });
  await test("inactive and cross-tenant assignees deny", async () => {
    for (const [assigneeId, idempotencyKey] of [["inactive_uw", "inactive"], ["cross_uw", "cross"]]) assert(!(await executeApplicationWorkflowCommand({ auth: authFor(idempotencyKey), applicationId: "application_alpha", body: { commandType: "assign_underwriter", assigneeId, expectedVersion: await version(), idempotencyKey } })).ok);
  });
  await test("workflow transitions validate", async () => {
    assert((await executeApplicationWorkflowCommand({ auth: authFor("stage"), applicationId: "application_alpha", body: { commandType: "change_workflow_stage", targetStage: "UW Review", expectedVersion: await version(), idempotencyKey: "stage_key" } })).ok);
    assert(!(await executeApplicationWorkflowCommand({ auth: authFor("invalid"), applicationId: "application_alpha", body: { commandType: "change_workflow_stage", targetStage: "Approved", expectedVersion: await version(), idempotencyKey: "invalid_key" } })).ok);
  });
  let conditionId = "";
  await test("condition create resolve reopen and remove", async () => {
    const created = await executeApplicationWorkflowCommand({ auth: authFor("create"), applicationId: "application_alpha", body: { commandType: "create_condition", label: "Synthetic verification condition", severity: "med", expectedVersion: await version(), idempotencyKey: "condition_key" } });
    assert(created.ok); conditionId = (created as any).targetId;
    for (const targetStatus of ["done", "open"]) assert((await executeApplicationWorkflowCommand({ auth: authFor(targetStatus), applicationId: "application_alpha", body: { commandType: "set_condition_status", conditionId, targetStatus, expectedVersion: await version(), idempotencyKey: `condition_${targetStatus}` } })).ok);
    assert((await executeApplicationWorkflowCommand({ auth: authFor("remove"), applicationId: "application_alpha", body: { commandType: "remove_condition", conditionId, expectedVersion: await version(), idempotencyKey: "condition_remove" } })).ok);
  });
  await test("each material denial persists exactly one safe denial audit", async () => {
    const denials = db.collection("tenants/tenant_alpha/applications/application_alpha/workflowDenialAuditEvents");
    const denialTarget = await executeApplicationWorkflowCommand({ auth: authFor("denial_target"), applicationId: "application_alpha", body: { commandType: "create_condition", label: "Denial target", severity: "low", expectedVersion: await version(), idempotencyKey: "denial_target" } });
    assert(denialTarget.ok);
    const versionValue = await version();
    const cases = [
      () => executeApplicationWorkflowCommand({ auth: authForUser("loan_officer_user", "permission"), applicationId: "application_alpha", body: { commandType: "create_condition", label: "Denied", severity: "low", expectedVersion: versionValue, idempotencyKey: "deny_permission" } }),
      () => executeApplicationWorkflowCommand({ auth: authFor("invalid_transition_audit"), applicationId: "application_alpha", body: { commandType: "change_workflow_stage", targetStage: "Approved", expectedVersion: versionValue, idempotencyKey: "deny_transition" } }),
      () => executeApplicationWorkflowCommand({ auth: authFor("stale_audit"), applicationId: "application_alpha", body: { commandType: "change_workflow_stage", targetStage: "Conditions", expectedVersion: "workflow-v1", idempotencyKey: "deny_stale" } }),
      () => executeApplicationWorkflowCommand({ auth: authFor("missing_condition"), applicationId: "application_alpha", body: { commandType: "set_condition_status", conditionId: "condition_from_other_application", targetStatus: "done", expectedVersion: versionValue, idempotencyKey: "deny_missing" } }),
      () => executeApplicationWorkflowCommand({ auth: authFor("invalid_condition"), applicationId: "application_alpha", body: { commandType: "set_condition_status", conditionId: (denialTarget as any).targetId, targetStatus: "waived", expectedVersion: versionValue, idempotencyKey: "deny_condition_transition" } }),
      () => executeApplicationWorkflowCommand({ auth: authFor("conflicting_key"), applicationId: "application_alpha", body: { commandType: "assign_underwriter", assigneeId: "inactive_uw", expectedVersion: "workflow-v1", idempotencyKey: "assign_key" } }),
      () => executeApplicationWorkflowCommand({ auth: authFor("authority_field"), applicationId: "application_alpha", body: { commandType: "change_workflow_stage", targetStage: "Conditions", tenantId: "tenant_beta", expectedVersion: versionValue, idempotencyKey: "deny_authority" } }),
    ];
    for (const run of cases) { const before = (await denials.get()).size; assert(!(await run()).ok); assert.equal((await denials.get()).size, before + 1); assert.equal(await version(), versionValue); }
    const serialized = JSON.stringify((await denials.get()).docs.map(doc => doc.data()));
    assert(!serialized.includes("Synthetic Borrower")); assert(!serialized.includes("loanAmount")); assert(!serialized.includes("role"));
  });
  await test("denial audit failure fails closed without mutation", async () => {
    const before = JSON.stringify((await db.doc("applications/application_alpha").get()).data());
    const result = await executeApplicationWorkflowCommand({ auth: authFor("deny_audit_failure"), applicationId: "application_alpha", body: { commandType: "change_workflow_stage", targetStage: "Approved", expectedVersion: await version(), idempotencyKey: "deny_audit_failure" }, injectDenialAuditFailure: true });
    assert(!result.ok && result.error.code === "AUDIT_REQUIRED");
    assert.equal(JSON.stringify((await db.doc("applications/application_alpha").get()).data()), before);
  });
  await test("generated replacement and verification are transactional and preserve manual conditions", async () => {
    const manual = await executeApplicationWorkflowCommand({ auth: authFor("manual_preserve"), applicationId: "application_alpha", body: { commandType: "create_condition", label: "Manual remains", severity: "low", expectedVersion: await version(), idempotencyKey: "manual_preserve" } });
    assert(manual.ok);
    const generatedConditions = [{ id: "generated_income", label: "Verify generated income", severity: "med", status: "open", source: "borrower_profile" }];
    const body = { commandType: "replace_generated_conditions", generatedConditions, expectedVersion: await version(), idempotencyKey: "generated_replace" };
    const replaced = await executeApplicationWorkflowCommand({ auth: authFor("generated"), applicationId: "application_alpha", body }); assert(replaced.ok);
    const retry = await executeApplicationWorkflowCommand({ auth: authFor("generated_retry"), applicationId: "application_alpha", body }); assert(retry.ok && retry.writeResult === "already_exists_identical");
    let app = (await db.doc("applications/application_alpha").get()).data()!;
    assert(app.uwConditions.some((condition: any) => condition.id === (manual as any).targetId)); assert(app.uwConditions.some((condition: any) => condition.id === "generated_income"));
    const verified = await executeApplicationWorkflowCommand({ auth: authForUser("processor_user", "verify"), applicationId: "application_alpha", body: { commandType: "update_borrower_verification", field: "income", action: "verify", generatedConditions, expectedVersion: await version(), idempotencyKey: "verification_update" } });
    assert(verified.ok); app = (await db.doc("applications/application_alpha").get()).data()!; assert.equal(app.borrowerProfileVerified.income, true);
    assert(!(await executeApplicationWorkflowCommand({ auth: authFor("invalid_generated"), applicationId: "application_alpha", body: { commandType: "replace_generated_conditions", generatedConditions: [{ ...generatedConditions[0], createdBy: "caller" }], expectedVersion: await version(), idempotencyKey: "invalid_generated" } })).ok);
  });
  await test("stale conflict concurrency and audit rollback", async () => {
    assert(!(await executeApplicationWorkflowCommand({ auth: authFor("stale"), applicationId: "application_alpha", body: { commandType: "change_workflow_stage", targetStage: "Conditions", expectedVersion: "workflow-v1", idempotencyKey: "stale_key" } })).ok);
    const prior = await version();
    const [a, b] = await Promise.all(["race_a", "race_b"].map(idempotencyKey => executeApplicationWorkflowCommand({ auth: authFor(idempotencyKey), applicationId: "application_alpha", body: { commandType: "change_workflow_stage", targetStage: "Conditions", expectedVersion: prior, idempotencyKey } })));
    assert.equal(Number(a.ok) + Number(b.ok), 1);
    const rollbackVersion = await version();
    assert(!(await executeApplicationWorkflowCommand({ auth: authFor("rollback"), applicationId: "application_alpha", body: { commandType: "change_workflow_stage", targetStage: "UW Review", expectedVersion: rollbackVersion, idempotencyKey: "rollback_key" }, injectAuditFailure: true })).ok);
    assert.equal(await version(), rollbackVersion);
    assert(!(await db.doc("tenants/tenant_alpha/applications/application_alpha/workflowCommands/rollback_key").get()).exists);
  });
  await test("notes and reset business-state commands are authorized atomic and PII-safe", async () => {
    await db.doc("applications/application_business").set({ tenantId:"tenant_alpha", ownershipState:"tenant_owned", createdBy:"admin_user", authorizationVersion:"auth-business-v1", workflowVersion:"workflow-business-v1", status:"New", notes:"old", scan:{marker:"raw"}, borrowerProfile:{fullName:"Synthetic Borrower"}, borrowerName:"Synthetic Borrower", email:"synthetic@example.test", loanAmount:300000, decisionHistory:[{marker:"preserve"}] });
    const notesBody={commandType:"update_notes",notes:"  bounded synthetic note  ",expectedVersion:"workflow-business-v1",idempotencyKey:"notes_business_001"};const notes=await executeApplicationWorkflowCommand({auth:authFor("notes_business"),applicationId:"application_business",body:notesBody});assert(notes.ok);const retry=await executeApplicationWorkflowCommand({auth:authFor("notes_retry"),applicationId:"application_business",body:notesBody});assert(retry.ok&&retry.writeResult==="already_exists_identical");let business=(await db.doc("applications/application_business").get()).data()!;assert.equal(business.notes,"bounded synthetic note");assert.equal(business.notesUpdatedBy,"admin_user");
    const conflict=await executeApplicationWorkflowCommand({auth:authFor("notes_conflict"),applicationId:"application_business",body:{...notesBody,notes:"different"}});assert(!conflict.ok);const stale=await executeApplicationWorkflowCommand({auth:authFor("notes_stale"),applicationId:"application_business",body:{...notesBody,idempotencyKey:"notes_stale_001",expectedVersion:"workflow-business-v1"}});assert(!stale.ok);
    await db.doc("applicationDocuments/business_document").set({applicationId:"application_business",tenantId:"tenant_alpha"});const blocked=await executeApplicationWorkflowCommand({auth:authFor("reset_blocked"),applicationId:"application_business",body:{commandType:"reset_after_documents_deleted",expectedVersion:business.workflowVersion,idempotencyKey:"reset_blocked_001"}});assert(!blocked.ok);await db.doc("applicationDocuments/business_document").delete();business=(await db.doc("applications/application_business").get()).data()!;const reset=await executeApplicationWorkflowCommand({auth:authFor("reset_success"),applicationId:"application_business",body:{commandType:"reset_after_documents_deleted",expectedVersion:business.workflowVersion,idempotencyKey:"reset_success_001"}});assert(reset.ok);business=(await db.doc("applications/application_business").get()).data()!;assert.equal(business.tenantId,"tenant_alpha");assert.equal(business.createdBy,"admin_user");assert.deepEqual(business.decisionHistory,[{marker:"preserve"}]);assert.equal(business.scan,undefined);assert.deepEqual(business.conditions,[]);
    const auditText=JSON.stringify((await db.collection("tenants/tenant_alpha/applications/application_business/workflowAuditEvents").get()).docs.map(x=>x.data()));assert(!auditText.includes("bounded synthetic note"));assert(!auditText.includes("Synthetic Borrower"));
  });
  await test("audit is PII-safe and ownership immutable", async () => {
    const app = (await db.doc("applications/application_alpha").get()).data()!;
    assert.equal(app.tenantId, "tenant_alpha");
    const audits = await db.collection("tenants/tenant_alpha/applications/application_alpha/workflowAuditEvents").get();
    const serialized = JSON.stringify(audits.docs.map(d => d.data()));
    assert(audits.size > 0); assert(!serialized.includes("Synthetic Borrower")); assert(!serialized.includes("loanAmount"));
    assert.equal((await db.doc("applicationDocuments/document_unchanged").get()).data()?.marker, "unchanged");
    assert.equal((await db.doc("reportArtifacts/report_unchanged").get()).data()?.marker, "unchanged");
  });
  console.log("WORKFLOW_COMMAND_EMULATOR_CHILD_COMPLETED");
  console.log(`Workflow command emulator regression: ${passed}/${passed} passed`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
