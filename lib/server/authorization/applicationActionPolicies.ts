import { AUTHORIZATION_POLICY_VERSION, type AuthorizationConstraint, type AuthorizationPermission } from "../../contracts/authorization";

export type ApplicationActionPolicyV1 = Readonly<{
  policyVersion: typeof AUTHORIZATION_POLICY_VERSION;
  permission: Extract<AuthorizationPermission, "application.read" | "application.update" | "application.analyze" | "application.delete">;
  resourceType: "application";
  acceptedPrincipalKind: "firebase_user";
  requiredConstraints: readonly AuthorizationConstraint[];
  constraintApplicability: Readonly<{ assignment: false; branch: false; team: false; creator: false }>;
  auditAction: string;
  cacheEligibility: "not_eligible" | "provisional_version_bound";
  status: "provisional_product_review_required";
}>;

const constraints = Object.freeze(["active_tenant", "active_membership", "resource_tenant_match", "unresolved_legacy_denied"] as const);
const applicability = Object.freeze({ assignment: false, branch: false, team: false, creator: false } as const);
const policy = (permission: ApplicationActionPolicyV1["permission"], cacheEligibility: ApplicationActionPolicyV1["cacheEligibility"]): ApplicationActionPolicyV1 => Object.freeze({ policyVersion: AUTHORIZATION_POLICY_VERSION, permission, resourceType: "application", acceptedPrincipalKind: "firebase_user", requiredConstraints: constraints, constraintApplicability: applicability, auditAction: permission, cacheEligibility, status: "provisional_product_review_required" });

export const APPLICATION_ACTION_POLICIES = Object.freeze({
  read: policy("application.read", "provisional_version_bound"),
  update: policy("application.update", "not_eligible"),
  analyze: policy("application.analyze", "not_eligible"),
  delete: policy("application.delete", "not_eligible"),
});

export function applicationPolicyForPermission(permission: unknown): ApplicationActionPolicyV1 | undefined {
  return Object.values(APPLICATION_ACTION_POLICIES).find((candidate) => candidate.permission === permission);
}
