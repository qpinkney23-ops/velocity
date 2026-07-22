import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import type { ServerAuthContextV1 } from "../../contracts/serverAuth";
import { defaultAdminApp } from "../auth/firebaseAdminAuthAdapter";
import { APPLICATION_ACTION_POLICIES } from "../authorization/applicationActionPolicies";
import { authorizeApplicationAction } from "../authorization/applicationAuthorizationOrchestrator";
import { permissionsForRole } from "../authorization/permissionPolicy";
import {deriveEnterpriseWorkflow,PRIORITIES,TRANSITIONS,WORKFLOW_TRANSITION_VERSION} from "../../workflow/enterprisePipeline";

export const WORKFLOW_COMMAND_POLICY = Object.freeze({
  schemaVersion: "workflow-command-policy.v1",
  status: "provisional_product_review_required",
  workflowStates: Object.freeze(["New", "UW Review", "Conditions"]),
  conditionStatuses: Object.freeze(["open", "done"]),
  conditionSeverities: Object.freeze(["low", "med", "high"]),
  generatedConditionSources: Object.freeze(["ai", "borrower_profile"]),
  verificationFields: Object.freeze(["fullName", "email", "dob", "ssnLast4", "loanNumber", "income", "creditScore", "address", "employerAddress", "loanAmount", "propertyValue", "debts", "dti", "ltv"]),
  maximumNotesLength: 4000,
});

type Failure = Readonly<{ ok: false; status: number; error: Readonly<{ code: string; message: string }>; requestId: string; correlationId: string }>;
type CommandInput = Readonly<{ auth: ServerAuthContextV1; applicationId: string; body: unknown; injectAuditFailure?: boolean; injectDenialAuditFailure?: boolean }>;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const AUTHORITY_FIELDS = new Set(["tenantId", "role", "permission", "ownership", "createdBy", "updatedBy", "auditId", "path", "serverTimestamp"]);
const db = () => getFirestore(defaultAdminApp());
const fail = (code: string, status: number, auth: ServerAuthContextV1): Failure => Object.freeze({ ok: false, status, error: Object.freeze({ code, message: "The workflow command could not be completed." }), requestId: auth.requestId, correlationId: auth.correlationId });

function parseCommand(body: unknown): Record<string, any> | undefined {
  if (!body || typeof body !== "object" || Array.isArray(body)) return;
  const raw = body as Record<string, any>;
  const common = ["commandType", "idempotencyKey", "expectedVersion"];
  const fields: Record<string, readonly string[]> = {
    assign_underwriter: ["assigneeId"], change_workflow_stage: ["targetStage"], create_condition: ["label", "severity", "note"],
    set_condition_status: ["conditionId", "targetStatus"], remove_condition: ["conditionId"], replace_generated_conditions: ["generatedConditions"],
    update_borrower_verification: ["field", "action", "generatedConditions"], update_notes: ["notes"], reset_after_documents_deleted: [], set_priority:["priority"], add_workflow_note:["note"], transition_workflow:["transitionId","reason"],
  };
  const allowed = fields[raw.commandType];
  if (!allowed || Object.keys(raw).some(key => AUTHORITY_FIELDS.has(key) || ![...common, ...allowed].includes(key))) return;
  if (!SAFE_ID.test(raw.idempotencyKey || "") || !SAFE_ID.test(raw.expectedVersion || "")) return;
  return raw;
}

function validateGeneratedConditions(value: unknown) {
  if (!Array.isArray(value) || value.length > 100) return;
  const result: any[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return;
    const item = raw as Record<string, unknown>;
    if (Object.keys(item).some(key => !["id", "label", "severity", "status", "source", "evidence"].includes(key))) return;
    if (!SAFE_ID.test(String(item.id || "")) || typeof item.label !== "string" || !item.label.trim() || item.label.length > 160) return;
    if (!WORKFLOW_COMMAND_POLICY.conditionSeverities.includes(item.severity as any) || !WORKFLOW_COMMAND_POLICY.conditionStatuses.includes(item.status as any) || !WORKFLOW_COMMAND_POLICY.generatedConditionSources.includes(item.source as any)) return;
    if (item.evidence !== undefined && (typeof item.evidence !== "string" || item.evidence.length > 500)) return;
    result.push({ id: item.id, label: item.label.trim(), severity: item.severity, status: item.status, source: item.source, evidence: item.evidence || "" });
  }
  return result;
}

const permissionFor = (type: string) => type === "assign_underwriter" ? "assignment.manage" : type === "change_workflow_stage" || type === "transition_workflow" || type === "set_priority" || type === "add_workflow_note" ? "queue.manage" : type === "update_borrower_verification" ? "evidence.review" : type === "update_notes" || type === "reset_after_documents_deleted" ? "application.update" : "condition.manage";

async function persistDenial(input: CommandInput, tenantId: string, reasonCode: string, commandType: string, permission: string, targetId?: string): Promise<Failure> {
  if (input.injectDenialAuditFailure) return fail("AUDIT_REQUIRED", 500, input.auth);
  const auditId = `workflow_denial_${randomUUID().replace(/-/g, "")}`;
  try {
    await db().doc(`tenants/${tenantId}/applications/${input.applicationId}/workflowDenialAuditEvents/${auditId}`).create({
      schemaVersion: "workflow-denial-audit.v1", classification: "workflow_command_denied", reasonCode, commandType, permission,
      applicationId: input.applicationId, ...(targetId ? { targetId } : {}), requestId: input.auth.requestId,
      correlationId: input.auth.correlationId, piiPresent: false, createdAt: new Date(),
    });
    return fail(reasonCode, reasonCode === "COMMAND_FAILED" ? 400 : reasonCode.includes("STALE") || reasonCode.includes("CONFLICT") || reasonCode.includes("TRANSITION") ? 409 : reasonCode === "FORBIDDEN" ? 403 : 404, input.auth);
  } catch { return fail("AUDIT_REQUIRED", 500, input.auth); }
}

export async function executeApplicationWorkflowCommand(input: CommandInput) {
  if (!SAFE_ID.test(input.applicationId)) return fail("COMMAND_FAILED", 400, input.auth);
  const authorized = await authorizeApplicationAction({ authentication: input.auth, applicationId: input.applicationId, permission: "application.update", policy: APPLICATION_ACTION_POLICIES.update, evaluatedAt: new Date().toISOString() });
  if (!authorized.ok) return fail(authorized.publicError.code, authorized.publicError.status, input.auth);
  const body = parseCommand(input.body);
  if (!body) return persistDenial(input, authorized.context.tenantId, "COMMAND_FAILED", "invalid_request", "application.update");
  const permission = permissionFor(body.commandType);
  if (!permissionsForRole(authorized.context.role).includes(permission as any)) return persistDenial(input, authorized.context.tenantId, "FORBIDDEN", body.commandType, permission);

  const fingerprint = createHash("sha256").update(JSON.stringify({ tenantId: authorized.context.tenantId, applicationId: input.applicationId, type: body.commandType, payload: body, principal: authorized.context.authentication.principalId, permission, expectedVersion: body.expectedVersion, policy: WORKFLOW_COMMAND_POLICY.schemaVersion })).digest("hex");
  const commandRef = db().doc(`tenants/${authorized.context.tenantId}/applications/${input.applicationId}/workflowCommands/${body.idempotencyKey}`);
  const appRef = db().doc(`applications/${input.applicationId}`);
  try {
    const result: any = await db().runTransaction(async tx => {
      const [command, app] = await Promise.all([tx.get(commandRef), tx.get(appRef)]);
      if (command.exists) return command.data()?.fingerprint === fingerprint ? { kind: "retry", receipt: command.data()?.receipt } : { kind: "deny", code: "COMMAND_CONFLICT" };
      if (!app.exists || app.data()?.tenantId !== authorized.context.tenantId) return { kind: "deny", code: "RESOURCE_NOT_AVAILABLE" };
      const current = app.data()!;
      const version = current.workflowVersion || current.authorizationVersion;
      if (version !== body.expectedVersion) return { kind: "deny", code: body.commandType === "assign_underwriter" ? "ASSIGNMENT_STALE" : body.commandType.includes("condition") || body.commandType.includes("verification") ? "CONDITION_STALE" : "WORKFLOW_STALE" };
      const nextVersion = `workflow-${createHash("sha256").update(`${version}:${fingerprint}`).digest("hex").slice(0, 24)}`;
      const update: any = { workflowVersion: nextVersion, updatedAt: new Date() };
      let targetId: string | undefined;

      if (body.commandType === "update_notes") {
        if (typeof body.notes !== "string" || body.notes.length > WORKFLOW_COMMAND_POLICY.maximumNotesLength) return { kind: "deny", code: "NOTE_INVALID" };
        update.notes = body.notes.replace(/\r\n/g, "\n").trim(); update.notesUpdatedBy = authorized.context.authentication.principalId;
      } else if (body.commandType === "reset_after_documents_deleted") {
        const documents = await tx.get(db().collection("applicationDocuments").where("applicationId", "==", input.applicationId).limit(1));
        if (!documents.empty) return { kind: "deny", code: "RESET_NOT_ALLOWED" };
        for (const field of ["scan", "borrowerProfile", "borrowerProfileVerified", "borrowerName", "email", "loanAmount", "loanNumber"]) update[field] = FieldValue.delete();
        update.uwConditions = []; update.conditions = [];
      } else if (body.commandType === "assign_underwriter") {
        if (!SAFE_ID.test(body.assigneeId || "")) return { kind: "deny", code: "ASSIGNEE_NOT_AVAILABLE" };
        const member = await tx.get(db().doc(`tenants/${authorized.context.tenantId}/members/${body.assigneeId}`));
        if (!member.exists || member.data()?.membershipStatus !== "active" || member.data()?.role !== "underwriter") return { kind: "deny", code: "ASSIGNEE_NOT_AVAILABLE", targetId: body.assigneeId };
        update.underwriterId = body.assigneeId; update.underwriterName = ""; update.assignment={kind:"user",userId:body.assigneeId,displayName:null,role:"underwriter",assignedAt:new Date().toISOString(),assignedBy:authorized.context.authentication.principalId,source:"manual"};
      } else if (body.commandType === "set_priority") {
        if (!PRIORITIES.includes(body.priority)) return {kind:"deny",code:"PRIORITY_INVALID"}; update.priority=body.priority;
      } else if (body.commandType === "add_workflow_note") {
        if(typeof body.note!=="string"||!body.note.trim()||body.note.length>1000)return{kind:"deny",code:"NOTE_INVALID"};update.lastWorkflowNote=body.note.replace(/\r\n/g,"\n").trim();update.lastWorkflowNoteBy=authorized.context.authentication.principalId;
      } else if (body.commandType === "transition_workflow") {
        const transition=TRANSITIONS.find(t=>t.id===body.transitionId);if(!transition)return{kind:"deny",code:"WORKFLOW_TRANSITION_INVALID"};const documents=await tx.get(db().collection("applicationDocuments").where("applicationId","==",input.applicationId));const derived=deriveEnterpriseWorkflow({...current,id:input.applicationId,tenantId:authorized.context.tenantId,documentCount:documents.size});if(!derived.allowedTransitions.includes(transition.id))return{kind:"deny",code:"WORKFLOW_BLOCKED"};if(transition.reasonRequired&&(typeof body.reason!=="string"||!body.reason.trim()||body.reason.length>500))return{kind:"deny",code:"WORKFLOW_REASON_REQUIRED"};if(transition.assignmentRequired&&!current.underwriterId)return{kind:"deny",code:"ASSIGNMENT_REQUIRED"};update.enterpriseWorkflow={schemaVersion:"enterprise-loan-workflow.v1",lifecycleStage:transition.destination,enteredStageAt:new Date().toISOString(),transitionVersion:WORKFLOW_TRANSITION_VERSION};update.status=transition.destination;targetId=transition.id;
      } else if (body.commandType === "change_workflow_stage") {
        if (!WORKFLOW_COMMAND_POLICY.workflowStates.includes(body.targetStage)) return { kind: "deny", code: "WORKFLOW_TRANSITION_INVALID" };
        const prior = current.status || "New"; const allowed: any = { New: ["UW Review"], "UW Review": ["New", "Conditions"], Conditions: ["UW Review"] };
        if (prior !== body.targetStage && !allowed[prior]?.includes(body.targetStage)) return { kind: "deny", code: "WORKFLOW_TRANSITION_INVALID" };
        update.status = body.targetStage;
      } else if (body.commandType === "replace_generated_conditions" || body.commandType === "update_borrower_verification") {
        const generated = validateGeneratedConditions(body.generatedConditions);
        if (!generated) return { kind: "deny", code: "CONDITION_TRANSITION_INVALID" };
        const existingConditions = Array.isArray(current.uwConditions) ? current.uwConditions : [];
        const manual = existingConditions.filter((condition: any) => condition?.source === "manual");
        const now = Date.now();
        const canonicalGenerated = generated.map(condition => { const existing = existingConditions.find((candidate: any) => candidate?.id === condition.id && candidate?.source === condition.source); return { ...condition, createdAtMs: typeof existing?.createdAtMs === "number" ? existing.createdAtMs : now, updatedAtMs: now }; });
        update.uwConditions = [...canonicalGenerated, ...manual]; update.conditions = [...canonicalGenerated, ...manual];
        if (body.commandType === "update_borrower_verification") {
          if (!WORKFLOW_COMMAND_POLICY.verificationFields.includes(body.field) || !["verify", "clear"].includes(body.action)) return { kind: "deny", code: "CONDITION_TRANSITION_INVALID" };
          const verified = { ...(current.borrowerProfileVerified || {}) };
          if (body.action === "verify") verified[body.field] = true; else delete verified[body.field];
          update.borrowerProfileVerified = verified; targetId = body.field;
        }
      } else {
        const conditions = Array.isArray(current.uwConditions) ? [...current.uwConditions] : [];
        if (body.commandType === "create_condition") {
          if (typeof body.label !== "string" || !body.label.trim() || body.label.length > 160 || !WORKFLOW_COMMAND_POLICY.conditionSeverities.includes(body.severity) || body.note !== undefined && (typeof body.note !== "string" || body.note.length > 500)) return { kind: "deny", code: "COMMAND_FAILED" };
          targetId = `manual_${randomUUID().replace(/-/g, "")}`; const now = Date.now();
          conditions.push({ id: targetId, label: body.label.trim(), severity: body.severity, status: "open", source: "manual", evidence: body.note || "", createdAtMs: now, updatedAtMs: now });
        } else {
          const index = conditions.findIndex((condition: any) => condition?.id === body.conditionId);
          if (index < 0) return { kind: "deny", code: "CONDITION_NOT_AVAILABLE", targetId: SAFE_ID.test(body.conditionId || "") ? body.conditionId : undefined };
          targetId = body.conditionId;
          if (body.commandType === "remove_condition") { if (conditions[index]?.source !== "manual") return { kind: "deny", code: "CONDITION_TRANSITION_INVALID", targetId }; conditions.splice(index, 1); }
          else { if (!WORKFLOW_COMMAND_POLICY.conditionStatuses.includes(body.targetStatus)) return { kind: "deny", code: "CONDITION_TRANSITION_INVALID", targetId }; conditions[index] = { ...conditions[index], status: body.targetStatus, updatedAtMs: Date.now() }; }
        }
        update.uwConditions = conditions; update.conditions = conditions;
      }

      if (input.injectAuditFailure) throw new Error("injected_success_audit_failure");
      const receipt = { commandId: `workflow_${randomUUID().replace(/-/g, "")}`, commandType: body.commandType, applicationId: input.applicationId, previousVersion: version, newVersion: nextVersion, ...(targetId ? { targetId } : {}), requestId: input.auth.requestId, correlationId: input.auth.correlationId };
      tx.update(appRef, update);
      tx.create(commandRef, { schemaVersion: "workflow-command.v1", fingerprint, status: "completed", receipt });
      tx.create(db().doc(`tenants/${authorized.context.tenantId}/applications/${input.applicationId}/workflowAuditEvents/${receipt.commandId}`), { action: body.commandType, applicationId: input.applicationId, previousVersion: version, newVersion: nextVersion, targetId: targetId || null, requestId: input.auth.requestId, correlationId: input.auth.correlationId, piiPresent: false, createdAt: new Date() });
      tx.create(db().doc(`tenants/${authorized.context.tenantId}/applications/${input.applicationId}/workflowEvents/${receipt.commandId}`), {schemaVersion:"enterprise-workflow-event.v1",eventId:receipt.commandId,applicationId:input.applicationId,tenantId:authorized.context.tenantId,eventType:body.commandType,previousVersion:version,nextVersion,actorId:authorized.context.authentication.principalId,actorType:"firebase_user",reason:typeof body.reason==="string"?body.reason.trim():null,note:body.commandType==="add_workflow_note"?update.lastWorkflowNote:null,relatedConditionIds:[],relatedReviewFindingIds:[],idempotencyKey:body.idempotencyKey,workflowVersion:"enterprise-loan-workflow.v1",piiPresent:false,createdAt:new Date()});
      return { kind: "success", receipt };
    });
    if (result.kind === "retry") return { ok: true as const, status: 200, ...result.receipt, writeResult: "already_exists_identical" };
    if (result.kind === "deny") return persistDenial(input, authorized.context.tenantId, result.code, body.commandType, permission, result.targetId);
    return { ok: true as const, status: 200, ...result.receipt, writeResult: "created" };
  } catch { return fail("COMMAND_FAILED", 500, input.auth); }
}
