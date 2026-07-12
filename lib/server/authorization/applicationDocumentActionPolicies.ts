import { AUTHORIZATION_POLICY_VERSION, type AuthorizationConstraint, type AuthorizationPermission } from "../../contracts/authorization";

export type ApplicationDocumentActionPolicyV1 = Readonly<{
  policyVersion: typeof AUTHORIZATION_POLICY_VERSION;
  permission: Extract<AuthorizationPermission, "document.read" | "document.upload" | "document.delete">;
  parentApplicationPermission: Extract<AuthorizationPermission, "application.read" | "application.update">;
  resourceType: "application_document";
  acceptedPrincipalKind: "firebase_user";
  requiredConstraints: readonly AuthorizationConstraint[];
  constraintApplicability: Readonly<{ assignment: boolean; branch: boolean; team: boolean; creatorUploader: boolean; applicationRelationship: true }>;
  auditAction: string;
  cacheEligibility: "not_eligible" | "provisional_version_bound";
  provisional_product_review_required: true;
}>;

const base = Object.freeze(["active_tenant", "active_membership", "same_tenant", "resource_tenant_match", "unresolved_legacy_denied", "application_document_relationship_match"] as const);
const make = (permission: ApplicationDocumentActionPolicyV1["permission"], parentApplicationPermission: ApplicationDocumentActionPolicyV1["parentApplicationPermission"], cacheEligibility: ApplicationDocumentActionPolicyV1["cacheEligibility"]): ApplicationDocumentActionPolicyV1 => Object.freeze({ policyVersion: AUTHORIZATION_POLICY_VERSION, permission, parentApplicationPermission, resourceType: "application_document", acceptedPrincipalKind: "firebase_user", requiredConstraints: base, constraintApplicability: Object.freeze({ assignment: false, branch: false, team: false, creatorUploader: false, applicationRelationship: true }), auditAction: permission, cacheEligibility, provisional_product_review_required: true });

export const APPLICATION_DOCUMENT_ACTION_POLICIES = Object.freeze({
  read: make("document.read", "application.read", "provisional_version_bound"),
  upload: make("document.upload", "application.update", "not_eligible"),
  delete: make("document.delete", "application.update", "not_eligible"),
});

export function applicationDocumentPolicyForPermission(permission: unknown) { return Object.values(APPLICATION_DOCUMENT_ACTION_POLICIES).find((p) => p.permission === permission); }

