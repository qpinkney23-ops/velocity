import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { getFirestore } from "firebase-admin/firestore";
import type { ServerAuthContextV1 } from "../../contracts/serverAuth";
import { defaultAdminApp } from "../auth/firebaseAdminAuthAdapter";
import { APPLICATION_ACTION_POLICIES } from "../authorization/applicationActionPolicies";
import { authorizeApplicationAction } from "../authorization/applicationAuthorizationOrchestrator";
import { permissionsForRole } from "../authorization/permissionPolicy";
import {DEFAULT_APPROVAL_POLICY,evaluateApprovalAuthority} from "../../governance/enterpriseGovernance";
import {AUTHORITY_REFRESH_MESSAGE,auditAuthorityRejection,enforceAuthorityInTransaction,readAuthoritySnapshot} from "../identity/identityAuthorityEnforcement";

export const DECISION_COMMAND_POLICY = Object.freeze({ schemaVersion: "application-decision-command-policy.v1", producerVersion: "application-decision-command.v1", status: "provisional_product_review_required", actions: Object.freeze(["approve", "deny"]), justificationByAction: Object.freeze({ approve: Object.freeze(["analysis_and_conditions_satisfied"]), deny: Object.freeze(["policy_requirements_not_met", "unresolved_material_evidence", "unacceptable_risk", "documentation_incomplete", "other"]) }), maximumNoteLength: 500 });
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const HASH = /^[a-f0-9]{64}$/;
const db = () => getFirestore(defaultAdminApp());
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const fail = (code: string, status: number, auth: ServerAuthContextV1) => ({ ok: false as const, status, error: { code, message: code.includes("AUTHORITY")||code.includes("MEMBERSHIP")?AUTHORITY_REFRESH_MESSAGE:"The final decision could not be completed.", ...(code.includes("AUTHORITY")||code.includes("MEMBERSHIP")?{refreshRequired:true,recoverable:true}: {}) }, requestId: auth.requestId, correlationId: auth.correlationId });
type Input = Readonly<{ auth: ServerAuthContextV1; applicationId: string; body: unknown; injectSuccessAuditFailure?: boolean; injectDenialAuditFailure?: boolean }>;

function parse(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return;
  const raw = body as Record<string, any>, allowed = ["action", "justificationCode", "note", "expectedWorkflowVersion", "expectedDecisionVersion", "expectedAnalysisId", "expectedAnalysisVersion", "expectedAnalysisOutputFingerprint", "expectedEvidenceAggregationFingerprint", "expectedMembershipVersion", "expectedAuthorizationVersion", "expectedApprovalAuthorityVersion", "idempotencyKey"];
  if (Object.keys(raw).some(key => !allowed.includes(key)) || !DECISION_COMMAND_POLICY.actions.includes(raw.action) || !SAFE_ID.test(raw.idempotencyKey || "") || !SAFE_ID.test(raw.expectedWorkflowVersion || "") || !Number.isInteger(raw.expectedDecisionVersion) || raw.expectedDecisionVersion < 0 || !SAFE_ID.test(raw.expectedAnalysisId || "") || !SAFE_ID.test(raw.expectedAnalysisVersion || "") || !HASH.test(raw.expectedAnalysisOutputFingerprint || "") || !HASH.test(raw.expectedEvidenceAggregationFingerprint || "")) return;
  if (!Number.isSafeInteger(raw.expectedMembershipVersion)||raw.expectedMembershipVersion<0||!SAFE_ID.test(raw.expectedAuthorizationVersion||"")||!SAFE_ID.test(raw.expectedApprovalAuthorityVersion||"")) return;
  if (typeof raw.justificationCode !== "string" || !(DECISION_COMMAND_POLICY.justificationByAction as any)[raw.action].includes(raw.justificationCode)) return;
  if (raw.note !== undefined && (typeof raw.note !== "string" || raw.note.trim().length > DECISION_COMMAND_POLICY.maximumNoteLength)) return;
  return { ...raw, note: typeof raw.note === "string" ? raw.note.trim() : undefined } as Record<string, any>;
}

async function authorize(auth: ServerAuthContextV1, applicationId: string) {
  return authorizeApplicationAction({ authentication: auth, applicationId, permission: "application.read", policy: APPLICATION_ACTION_POLICIES.read, evaluatedAt: new Date().toISOString() });
}

async function denial(input: Input, tenantId: string, reasonCode: string, action: string, permission: string) {
  if (input.injectDenialAuditFailure) return fail("AUDIT_REQUIRED", 500, input.auth);
  try {
    const eventId = `decision_denial_${randomUUID().replace(/-/g, "")}`;
    await db().doc(`tenants/${tenantId}/applications/${input.applicationId}/decisionDenialAuditEvents/${eventId}`).create({ schemaVersion: "application-decision-denial-audit.v1", classification: "accountable_decision_denied", reasonCode, action, permission, applicationId: input.applicationId, requestId: input.auth.requestId, correlationId: input.auth.correlationId, piiPresent: false, createdAt: new Date() });
    const status = reasonCode === "FORBIDDEN" ? 403 : reasonCode.includes("NOT_AVAILABLE") ? 404 : reasonCode.includes("REQUIRED") || reasonCode.includes("BLOCKING") || reasonCode.includes("STALE") || reasonCode.includes("CONFLICT") || reasonCode.includes("TRANSITION") ? 409 : 400;
    return fail(reasonCode, status, input.auth);
  } catch { return fail("AUDIT_REQUIRED", 500, input.auth); }
}

async function analysisFacts(tenantId: string, applicationId: string) {
  const state = await db().doc(`tenants/${tenantId}/applications/${applicationId}/analysisState/current`).get();
  if (!state.exists) return;
  const data = state.data()!, commands = await db().collection(`tenants/${tenantId}/applications/${applicationId}/analysisCommands`).where("commandId", "==", data.commandId).limit(1).get();
  if (commands.empty) return;
  const command = commands.docs[0].data(), response = command.response;
  if (command.status !== "completed" || !response?.ok || response.applicationId !== applicationId || response.analysisVersion !== data.analysisVersion || response.evidenceAggregationFingerprint !== data.evidenceAggregationFingerprint) return;
  return { state: data, commandRef: commands.docs[0].ref, response, outputFingerprint: hash(response.analysis) };
}

export async function readApplicationDecisionContext(input: { auth: ServerAuthContextV1; applicationId: string }) {
  if (!SAFE_ID.test(input.applicationId)) return fail("RESOURCE_NOT_AVAILABLE", 404, input.auth);
  const allowed = await authorize(input.auth, input.applicationId); if (!allowed.ok) return fail(allowed.publicError.code, allowed.publicError.status, input.auth);
  const userId=allowed.context.authentication.principalId;
  const [app, analysis, decision,authority] = await Promise.all([db().doc(`applications/${input.applicationId}`).get(), analysisFacts(allowed.context.tenantId, input.applicationId), db().doc(`tenants/${allowed.context.tenantId}/applications/${input.applicationId}/decisionState/current`).get(),readAuthoritySnapshot(allowed.context.tenantId,userId)]);
  if (!app.exists || !analysis) return fail("ANALYSIS_NOT_AVAILABLE", 409, input.auth);if(!authority||authority.membershipStatus!=="active")return fail("MEMBERSHIP_INACTIVE",403,input.auth);
  return { ok: true as const, status: 200, expectedWorkflowVersion: app.data()?.workflowVersion || app.data()?.authorizationVersion, expectedDecisionVersion: decision.exists ? Number(decision.data()?.decisionVersion) : 0, expectedAnalysisId: analysis.state.commandId, expectedAnalysisVersion: analysis.state.analysisVersion, expectedAnalysisOutputFingerprint: analysis.outputFingerprint, expectedEvidenceAggregationFingerprint: analysis.state.evidenceAggregationFingerprint, expectedMembershipVersion:authority.membershipVersion,expectedAuthorizationVersion:authority.authorizationVersion,approvalAuthorityVersions:authority.approvalAuthorityVersions, requestId: input.auth.requestId, correlationId: input.auth.correlationId };
}

export async function executeApplicationDecisionCommand(input: Input) {
  if (!SAFE_ID.test(input.applicationId)) return fail("RESOURCE_NOT_AVAILABLE", 404, input.auth);
  const allowed = await authorize(input.auth, input.applicationId); if (!allowed.ok) return fail(allowed.publicError.code, allowed.publicError.status, input.auth);
  const raw=input.body as any;if(!raw||!Number.isSafeInteger(raw.expectedMembershipVersion)||typeof raw.expectedAuthorizationVersion!=="string"||typeof raw.expectedApprovalAuthorityVersion!=="string"){await auditAuthorityRejection({auth:input.auth,tenantId:allowed.context.tenantId,commandType:"decision.invalid",code:"AUTHORITY_VERSION_REQUIRED",applicationId:input.applicationId});return denial(input,allowed.context.tenantId,"AUTHORITY_VERSION_REQUIRED","invalid_request","decision.approve")}
  const body = parse(input.body); if (!body) return denial(input, allowed.context.tenantId, "JUSTIFICATION_INVALID", "invalid_request", "application.read");
  const permission = body.action === "approve" ? "decision.approve" : "decision.deny";
  const authority=evaluateApprovalAuthority({role:allowed.context.role,action:body.action,policy:DEFAULT_APPROVAL_POLICY});if(!authority.allowed)return denial(input,allowed.context.tenantId,authority.reason,body.action,permission);
  if (!permissionsForRole(allowed.context.role).includes(permission as any)) return denial(input, allowed.context.tenantId, "FORBIDDEN", body.action, permission);
  const analysis = await analysisFacts(allowed.context.tenantId, input.applicationId); if (!analysis) return denial(input, allowed.context.tenantId, "ANALYSIS_NOT_AVAILABLE", body.action, permission);
  const fingerprint = hash({ tenantId: allowed.context.tenantId, applicationId: input.applicationId, action: body.action, justificationCode: body.justificationCode, noteHash: body.note ? hash(body.note) : null, reviewer: allowed.context.authentication.principalId, permission, expectedWorkflowVersion: body.expectedWorkflowVersion, expectedDecisionVersion: body.expectedDecisionVersion, expectedAnalysisId: body.expectedAnalysisId, expectedAnalysisVersion: body.expectedAnalysisVersion, expectedAnalysisOutputFingerprint: body.expectedAnalysisOutputFingerprint, expectedEvidenceAggregationFingerprint: body.expectedEvidenceAggregationFingerprint, policyVersion: DECISION_COMMAND_POLICY.schemaVersion });
  const commandRef = db().doc(`tenants/${allowed.context.tenantId}/applications/${input.applicationId}/decisionCommands/${body.idempotencyKey}`), appRef = db().doc(`applications/${input.applicationId}`), stateRef = db().doc(`tenants/${allowed.context.tenantId}/applications/${input.applicationId}/decisionState/current`);
  try {
    const result: any = await db().runTransaction(async tx => {
      const [command, app, state, analysisState, analysisCommand,actorAuthority] = await Promise.all([tx.get(commandRef), tx.get(appRef), tx.get(stateRef), tx.get(db().doc(`tenants/${allowed.context.tenantId}/applications/${input.applicationId}/analysisState/current`)), tx.get(analysis.commandRef),enforceAuthorityInTransaction(tx,{tenantId:allowed.context.tenantId,userId:allowed.context.authentication.principalId,expected:{expectedMembershipVersion:body.expectedMembershipVersion,expectedAuthorizationVersion:body.expectedAuthorizationVersion,expectedApprovalAuthorityVersion:body.expectedApprovalAuthorityVersion},action:body.action})]);
      if(!actorAuthority.ok)return {kind:"deny",code:actorAuthority.code,authority:true};
      if (command.exists) return command.data()?.fingerprint === fingerprint ? { kind: "retry", receipt: command.data()?.receipt } : { kind: "deny", code: "COMMAND_CONFLICT" };
      if (!app.exists || app.data()?.tenantId !== allowed.context.tenantId) return { kind: "deny", code: "RESOURCE_NOT_AVAILABLE" };
      const appData = app.data()!, workflowVersion = appData.workflowVersion || appData.authorizationVersion, decisionVersion = state.exists ? Number(state.data()?.decisionVersion) : 0;
      if (workflowVersion !== body.expectedWorkflowVersion || decisionVersion !== body.expectedDecisionVersion) return { kind: "deny", code: "DECISION_STALE" };
      if (state.exists && ["approved", "denied"].includes(state.data()?.status)) return { kind: "deny", code: "DECISION_TRANSITION_INVALID" };
      const analysisStateData = analysisState.data()!, ac = analysisCommand.data(), response = ac?.response, outputFingerprint = hash(response?.analysis);
      if (!analysisState.exists || !analysisCommand.exists || ac?.status !== "completed" || !response?.ok) return { kind: "deny", code: "ANALYSIS_NOT_AVAILABLE" };
      if (analysisStateData.commandId !== body.expectedAnalysisId || analysisStateData.analysisVersion !== body.expectedAnalysisVersion || outputFingerprint !== body.expectedAnalysisOutputFingerprint || analysisStateData.evidenceAggregationFingerprint !== body.expectedEvidenceAggregationFingerprint || analysisStateData.applicationAuthorizationVersion !== appData.authorizationVersion) return { kind: "deny", code: "ANALYSIS_STALE" };
      const analysisOutput = response.analysis || {}, conflicts = Array.isArray(analysisOutput.conflicts) ? analysisOutput.conflicts : Object.values(analysisOutput.conflicts || {}).flat().filter(Boolean), conditions = Array.isArray(appData.uwConditions) ? appData.uwConditions : [];
      if (body.action === "approve" && conflicts.length) return { kind: "deny", code: "EVIDENCE_REVIEW_REQUIRED" };
      if (body.action === "approve" && (conditions.some((condition: any) => condition?.status === "open") || Number(analysisOutput.readiness?.unresolvedBlockingConditions || 0) > 0 || analysisOutput.readiness?.readinessLabel === "not_ready")) return { kind: "deny", code: "CONDITIONS_BLOCKING" };
      const decisionId = `decision_${randomUUID().replace(/-/g, "")}`, newDecisionVersion = decisionVersion + 1, newWorkflowVersion = `workflow-${hash([workflowVersion, fingerprint]).slice(0, 24)}`, decidedAt = new Date(), status = body.action === "approve" ? "approved" : "denied";
      const core = { schemaVersion: "application-decision-record.v1", decisionId, tenantId: allowed.context.tenantId, applicationId: input.applicationId, action: body.action, resultingStatus: status, reviewerPrincipalReference: allowed.context.authentication.principalId, reviewerMembershipVersion: allowed.context.membershipVersion, permissionUsed: permission, analysisId: analysisStateData.commandId, analysisVersion: analysisStateData.analysisVersion, analysisOutputFingerprint: outputFingerprint, evidenceAggregationFingerprint: analysisStateData.evidenceAggregationFingerprint, priorWorkflowVersion: workflowVersion, newWorkflowVersion, priorDecisionVersion: decisionVersion, newDecisionVersion, readinessPolicyVersion: DECISION_COMMAND_POLICY.schemaVersion, justificationCode: body.justificationCode, ...(body.note ? { note: body.note } : {}), decidedAt, requestId: input.auth.requestId, correlationId: input.auth.correlationId, producerVersion: DECISION_COMMAND_POLICY.producerVersion, safeWarnings: [], provenance: { analysisSource: "persisted_completed_analysis", conditionSource: "application_current", humanDecision: true } };
      const record = { ...core, integrityFingerprint: hash(core) }, receipt = { schemaVersion: "application-decision-command-receipt.v1", commandId: `decision_command_${randomUUID().replace(/-/g, "")}`, decisionId, applicationId: input.applicationId, status, priorDecisionVersion: decisionVersion, newDecisionVersion, priorWorkflowVersion: workflowVersion, newWorkflowVersion, analysisId: analysisStateData.commandId, evidenceAggregationFingerprint: analysisStateData.evidenceAggregationFingerprint, requestId: input.auth.requestId, correlationId: input.auth.correlationId };
      if (input.injectSuccessAuditFailure) throw new Error("injected_decision_audit_failure");
      tx.create(db().doc(`tenants/${allowed.context.tenantId}/applications/${input.applicationId}/decisionHistory/${decisionId}`), record);
      tx.set(stateRef, { schemaVersion: "application-decision-state.v1", currentDecisionId: decisionId, status, decisionVersion: newDecisionVersion, workflowVersion: newWorkflowVersion, analysisId: analysisStateData.commandId, analysisVersion: analysisStateData.analysisVersion, evidenceAggregationFingerprint: analysisStateData.evidenceAggregationFingerprint, updatedAt: decidedAt, producerVersion: DECISION_COMMAND_POLICY.producerVersion });
      tx.update(appRef, { status: body.action === "approve" ? "Approved" : "Denied", workflowVersion: newWorkflowVersion, updatedAt: decidedAt });
      tx.create(commandRef, { schemaVersion: "application-decision-command.v1", fingerprint, receipt, createdAt: decidedAt });
      tx.create(db().doc(`tenants/${allowed.context.tenantId}/applications/${input.applicationId}/decisionAuditEvents/${decisionId}`), { schemaVersion: "application-decision-audit.v1", action: body.action, decisionId, permission, analysisId: analysisStateData.commandId, priorDecisionVersion: decisionVersion, newDecisionVersion, requestId: input.auth.requestId, correlationId: input.auth.correlationId, piiPresent: false, createdAt: decidedAt });
      return { kind: "success", receipt };
    });
    if (result.kind === "retry") return { ok: true as const, status: 200, ...result.receipt, writeResult: "already_exists_identical" };
    if (result.kind === "deny"){if(result.authority)await auditAuthorityRejection({auth:input.auth,tenantId:allowed.context.tenantId,commandType:`decision.${body.action}`,code:result.code,applicationId:input.applicationId});return denial(input, allowed.context.tenantId, result.code, body.action, permission);}
    return { ok: true as const, status: 201, ...result.receipt, writeResult: "created" };
  } catch { return fail("DECISION_FAILED", 500, input.auth); }
}
