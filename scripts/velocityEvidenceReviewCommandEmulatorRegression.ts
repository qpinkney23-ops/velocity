import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { deleteApp, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { resolverAuth } from "../lib/server/authorization/tenantAuthorizationResolverFixtures";
import { aggregateApplicationEvidence, APPLICATION_EVIDENCE_AGGREGATION_POLICY } from "../lib/server/evidence/applicationEvidence";
import { extractDocumentEvidence } from "../lib/server/evidence/documentEvidence";
import { evidenceReviewTargetFingerprint } from "../lib/server/evidence/evidenceReview";
import { executeEvidenceReviewCommand, EVIDENCE_REVIEW_COMMAND_POLICY, EvidenceReviewCommandError } from "../lib/server/evidence/evidenceReviewCommand";
import { firebaseEvidenceReviewCommandRepository, type EvidenceReviewTransactionFailureStage } from "../lib/server/evidence/firebaseEvidenceReviewCommandRepository";
import { AUTHORIZED_DOCUMENT_PROCESSING_V1, DOCUMENT_NORMALIZATION_VERSION, DOCUMENT_PROCESSING_POLICY_VERSION } from "../lib/server/documents/authorizedDocumentProcessing";
import { DOCUMENT_RETRIEVAL_POLICY_VERSION } from "../lib/server/documents/authorizedDocumentBytes";

console.log("EVIDENCE_REVIEW_COMMAND_EMULATOR_CHILD_STARTED");
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const projectId = "demo-velocity-evidence-review-command";
const tenantId = "tenant_alpha", applicationId = "application_alpha", userId = "reviewer_alpha";
const base = `tenants/${tenantId}/applications/${applicationId}`;
const testAuthorization = Object.freeze({ tenantId, tenantVersion: "tenant_v1", membershipVersion: "member_v1", role: "underwriter" as const });

const document = extractDocumentEvidence(Object.freeze({
  schemaVersion: AUTHORIZED_DOCUMENT_PROCESSING_V1, tenantId, applicationId, documentId: "document_alpha", documentAuthorizationVersion: "auth_v1",
  sourceContentHash: hash("source"), sourceSizeBytes: 10, sourceContentType: "application/pdf", processingStatus: "completed" as const, processingStage: "completed" as const,
  engine: Object.freeze({ id: "synthetic", version: "1" }), processingPolicyVersion: DOCUMENT_PROCESSING_POLICY_VERSION, normalizationVersion: DOCUMENT_NORMALIZATION_VERSION,
  startedAt: "2026-01-01T00:00:00.000Z", completedAt: "2026-01-01T00:00:00.000Z", requestId: "request_doc", correlationId: "correlation_doc", pageCount: 1,
  normalizedText: "Income: $100", pages: Object.freeze([Object.freeze({ schemaVersion: AUTHORIZED_DOCUMENT_PROCESSING_V1, documentId: "document_alpha", pageNumber: 1, method: "native_text" as const, text: "Income: $100", warnings: Object.freeze([]), sourceContentHash: hash("source"), processingFingerprint: hash("processing"), assumption: false as const })]),
  warnings: Object.freeze([]), diagnostics: Object.freeze([]), provenance: Object.freeze({ source: "authorized_document_bytes" as const, retrievalPolicyVersion: DOCUMENT_RETRIEVAL_POLICY_VERSION, authorizationVersion: "auth_v1" }), stages: Object.freeze([]), processingFingerprint: hash("processing")
}));
const aggregation = aggregateApplicationEvidence([document], APPLICATION_EVIDENCE_AGGREGATION_POLICY, { aggregatedAt: "2026-01-01T00:00:00.000Z", requestId: "request_agg", correlationId: "correlation_agg" });
const targetId = aggregation.candidates[0].evidenceId;
const targetFingerprint = evidenceReviewTargetFingerprint(aggregation, "candidate", targetId)!;
const auth = resolverAuth(userId);
const repository = (failureStage?: EvidenceReviewTransactionFailureStage) => firebaseEvidenceReviewCommandRepository({ failureStage, testAuthorization });
let sequence = 0;
function command(action: "acknowledge" | "verify" | "dispute" | "revoke" | "supersede", expectedStateVersion: number, priorReviewId?: string, overrides: any = {}) {
  const suffix = `${action}_${++sequence}`;
  return { authentication: { ...auth, requestId: `request_${suffix}`, correlationId: `correlation_${suffix}` }, requestedTenantId: tenantId, applicationId, aggregationId: "aggregation_alpha", aggregationFingerprint: aggregation.aggregationFingerprint, aggregationPolicyVersion: aggregation.aggregationPolicyVersion, evidenceEngineVersion: aggregation.evidenceEngineVersion, expectedStateVersion, idempotencyKey: `key_${suffix}`, action: { reviewId: `review_${suffix}`, targetType: "candidate" as const, targetId, targetEvidenceFingerprint: targetFingerprint, action, ...(priorReviewId ? { priorReviewId } : {}), justificationCode: action === "revoke" ? "reviewer_error" as const : action === "supersede" ? "corrected_source_received" as const : action === "dispute" ? "value_mismatch" as const : "source_document_reviewed" as const, reviewedAt: "2026-01-02T00:00:00.000Z", effectiveAt: "2026-01-02T00:00:00.000Z" }, policy: EVIDENCE_REVIEW_COMMAND_POLICY, persistedAt: "2026-01-02T00:00:00.000Z", repository: repository(), ...overrides };
}
async function counts(db: ReturnType<typeof getFirestore>) { return { reviews: (await db.collection(`${base}/evidenceReviewRecords`).get()).size, audits: (await db.collection(`${base}/evidenceReviewAuditEvents`).get()).size, commands: (await db.collection(`${base}/evidenceReviewCommands`).get()).size, state: (await db.doc(`${base}/evidenceReviewState/current`).get()).data()?.stateVersion ?? 0 }; }
async function clearMutable(db: ReturnType<typeof getFirestore>) { for (const path of ["evidenceReviewRecords", "evidenceReviewAuditEvents", "evidenceReviewCommands"]) await db.recursiveDelete(db.collection(`${base}/${path}`)); await db.recursiveDelete(db.doc(`${base}/evidenceReviewState/current`)); }
async function invariantSnapshot(db: ReturnType<typeof getFirestore>) { return { counts: await counts(db), aggregation: JSON.stringify((await db.doc(`${base}/evidenceAggregations/aggregation_alpha`).get()).data()), applicationEvidence: JSON.stringify((await db.doc("applicationDocuments/document_alpha").get()).data()), documentEvidence: JSON.stringify((await db.doc("documents/document_alpha").get()).data()) }; }
async function proveDenial(db: ReturnType<typeof getFirestore>, name: string, input: any, code: string) { const before = await invariantSnapshot(db); await assert.rejects(executeEvidenceReviewCommand(input), (error: any) => error instanceof EvidenceReviewCommandError && error.code === code, name); const after = await invariantSnapshot(db); assert.equal(after.counts.audits, before.counts.audits + 1, `${name}: exactly one denial audit`); assert.equal(after.counts.reviews, before.counts.reviews, `${name}: no review`); assert.equal(after.counts.state, before.counts.state, `${name}: state unchanged`); assert.equal(after.counts.commands, before.counts.commands, `${name}: no receipt`); assert.equal(after.aggregation, before.aggregation, `${name}: application evidence unchanged`); assert.equal(after.applicationEvidence, before.applicationEvidence, `${name}: application evidence document unchanged`); assert.equal(after.documentEvidence, before.documentEvidence, `${name}: document evidence unchanged`); }
async function main() {
  const app = initializeApp({ projectId }), db = getFirestore(app);
  await db.doc(`applications/${applicationId}`).set({ ownershipState: "tenant_owned", tenantId, authorizationVersion: "auth-v1", status: "New" });
  await db.doc(`applicationDocuments/document_alpha`).set({ marker: "unchanged" }); await db.doc(`documents/document_alpha`).set({ marker: "unchanged" });
  await db.doc(`${base}/evidenceAggregations/aggregation_alpha`).set(aggregation as any);
  const originalAggregation = JSON.stringify((await db.doc(`${base}/evidenceAggregations/aggregation_alpha`).get()).data());

  const acknowledged = await executeEvidenceReviewCommand(command("acknowledge", 0));
  const retryInput = command("verify", 1, acknowledged.reviewId); const verified = await executeEvidenceReviewCommand(retryInput); const retry = await executeEvidenceReviewCommand(retryInput); assert.equal(retry.writeResult, "already_exists_identical");
  const revoked = await executeEvidenceReviewCommand(command("revoke", 2, verified.reviewId)); assert.equal(revoked.resultingStatus, "revoked");

  // Establish a separate disputed latest record, then race two valid supersessions from the same version and prior review.
  await db.recursiveDelete(db.doc(`${base}/evidenceReviewRecords/${acknowledged.reviewId}`));
  await db.recursiveDelete(db.doc(`${base}/evidenceReviewRecords/${verified.reviewId}`));
  await db.recursiveDelete(db.doc(`${base}/evidenceReviewRecords/${revoked.reviewId}`));
  await db.recursiveDelete(db.doc(`${base}/evidenceReviewState/current`)); await db.recursiveDelete(db.collection(`${base}/evidenceReviewCommands`)); await db.recursiveDelete(db.collection(`${base}/evidenceReviewAuditEvents`));
  const disputed = await executeEvidenceReviewCommand(command("dispute", 0)); const priorSnapshot = JSON.stringify((await db.doc(`${base}/evidenceReviewRecords/${disputed.reviewId}`).get()).data()); const beforeRace = await counts(db);
  const raceA = command("supersede", 1, disputed.reviewId), raceB = command("supersede", 1, disputed.reviewId);
  const race = await Promise.allSettled([executeEvidenceReviewCommand(raceA), executeEvidenceReviewCommand(raceB)]);
  assert.equal(race.filter(result => result.status === "fulfilled").length, 1); const loser = race.find(result => result.status === "rejected") as PromiseRejectedResult; assert(loser.reason instanceof EvidenceReviewCommandError); assert(["EVIDENCE_REVIEW_STALE", "EVIDENCE_REVIEW_CONFLICT"].includes(loser.reason.code));
  const afterRace = await counts(db); assert.deepEqual(afterRace, { reviews: beforeRace.reviews + 1, audits: beforeRace.audits + 2, commands: beforeRace.commands + 1, state: 2 }); assert.equal(JSON.stringify((await db.doc(`${base}/evidenceReviewRecords/${disputed.reviewId}`).get()).data()), priorSnapshot);

  await clearMutable(db);
  for (const stage of ["review_record_write", "review_state_write", "audit_write", "idempotency_write", "receipt_creation"] as const) { const before = await invariantSnapshot(db), rollback = command("acknowledge", 0, undefined, { repository: repository(stage) }); await assert.rejects(executeEvidenceReviewCommand(rollback), (error: any) => error.code === "EVIDENCE_REVIEW_WRITE_FAILED", stage); assert.deepEqual(await invariantSnapshot(db), before, `${stage}: complete rollback`); }

  await proveDenial(db, "permission denied", command("acknowledge", 0, undefined, { repository: firebaseEvidenceReviewCommandRepository({ testAuthorization: { ...testAuthorization, role: "viewer" } }) }), "EVIDENCE_REVIEW_PERMISSION_DENIED");
  await proveDenial(db, "stale aggregation", command("acknowledge", 0, undefined, { aggregationFingerprint: hash("stale") }), "EVIDENCE_AGGREGATION_STALE");
  await proveDenial(db, "stale review state", command("acknowledge", 1), "EVIDENCE_REVIEW_STALE");
  await proveDenial(db, "invalid target", command("acknowledge", 0, undefined, { action: { ...command("acknowledge", 0).action, targetId: "missing_target" } }), "EVIDENCE_REVIEW_TARGET_NOT_FOUND");
  const seedReview = await executeEvidenceReviewCommand(command("acknowledge", 0));
  await proveDenial(db, "duplicate review ID", command("acknowledge", 1, undefined, { action: { ...command("acknowledge", 1).action, reviewId: seedReview.reviewId } }), "EVIDENCE_REVIEW_ALREADY_COMPLETED");
  await clearMutable(db); const duplicateKey = `key_duplicate_${++sequence}`; await executeEvidenceReviewCommand(command("dispute", 0, undefined, { idempotencyKey: duplicateKey }));
  await proveDenial(db, "duplicate idempotency key", command("acknowledge", 1, undefined, { idempotencyKey: duplicateKey }), "EVIDENCE_REVIEW_CONFLICT");
  await proveDenial(db, "invalid authorization version", command("acknowledge", 1, undefined, { aggregationPolicyVersion: "invalid-authorization-version" }), "EVIDENCE_AGGREGATION_STALE");
  await proveDenial(db, "invalid aggregation fingerprint", command("acknowledge", 1, undefined, { aggregationFingerprint: "invalid" }), "EVIDENCE_AGGREGATION_STALE");
  await proveDenial(db, "invalid target fingerprint", command("acknowledge", 1, undefined, { action: { ...command("acknowledge", 1).action, targetEvidenceFingerprint: "invalid" } }), "EVIDENCE_REVIEW_TARGET_STALE");
  const auditPayload = JSON.stringify((await db.collection(`${base}/evidenceReviewAuditEvents`).get()).docs.map(doc => doc.data())); for (const forbidden of ["Income: $100", "normalizedValue", "review note", "borrower"]) assert(!auditPayload.includes(forbidden));
  assert.equal(JSON.stringify((await db.doc(`${base}/evidenceAggregations/aggregation_alpha`).get()).data()), originalAggregation); assert.equal((await db.doc("applicationDocuments/document_alpha").get()).data()?.marker, "unchanged"); assert.equal((await db.doc("documents/document_alpha").get()).data()?.marker, "unchanged");
  await deleteApp(app); console.log("EVIDENCE_REVIEW_COMMAND_EMULATOR_CHILD_COMPLETED"); console.log("Evidence review command emulator regression: denial and rollback matrix passed");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
