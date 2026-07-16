import "server-only";

export const APPLICATION_DELETE_POLICY = Object.freeze({
  schemaVersion: "application-delete-policy.v1" as const,
  policyVersion: "application-delete-policy.provisional.v1" as const,
  status: "provisional_product_review_required" as const,
  deletionMode: "disabled" as const,
  eligibleHumanRoles: Object.freeze([] as const),
  eligiblePermissions: Object.freeze([] as const),
  acceptedReasonCodes: Object.freeze([
    "duplicate_application",
    "test_or_demo_record",
    "created_in_error",
    "customer_request_pending_retention_review",
    "administrative_cleanup",
    "other",
  ] as const),
  hardDeleteAllowed: false as const,
  archiveAllowed: false as const,
  tombstoneAllowed: false as const,
  documentsMustBeAbsent: true as const,
  completedAnalysisBlocksDeletion: true as const,
  decisionHistoryBlocksDeletion: true as const,
  reportArtifactsBlockDeletion: true as const,
  evidenceHistoryBlocksDeletion: true as const,
  activeOperationsBlockDeletion: true as const,
  unresolvedOwnershipBlocksDeletion: true as const,
  immutableHistoryMustBePreserved: true as const,
  storageMutationAllowed: false as const,
  unresolvedRequirements: Object.freeze([
    "approved_retention_schedule",
    "legal_hold_policy",
    "privacy_deletion_policy",
    "archive_lifecycle_contract",
    "tombstone_visibility_contract",
    "child_resource_disposition",
    "report_and_evidence_retention",
  ] as const),
});

export type ApplicationDeletePolicyResult = Readonly<{
  ok: false;
  status: 409;
  error: Readonly<{ code: "DELETE_NOT_ALLOWED"; message: "Application deletion is not available." }>;
  policyVersion: typeof APPLICATION_DELETE_POLICY.policyVersion;
}>;

/**
 * Deliberately has no mutation dependency. Until product, legal, privacy, and
 * retention policy are approved, every application-record deletion request
 * resolves to the same safe denial.
 */
export function evaluateApplicationDeletePolicy(): ApplicationDeletePolicyResult {
  return Object.freeze({
    ok: false,
    status: 409,
    error: Object.freeze({ code: "DELETE_NOT_ALLOWED", message: "Application deletion is not available." }),
    policyVersion: APPLICATION_DELETE_POLICY.policyVersion,
  });
}
