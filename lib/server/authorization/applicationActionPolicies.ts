import { AUTHORIZATION_POLICY_VERSION, type AuthorizationConstraint, type AuthorizationPermission } from "../../contracts/authorization";

export type ApplicationActionPolicyV1 = Readonly<{
  policyVersion: typeof AUTHORIZATION_POLICY_VERSION;
  permission: Extract<AuthorizationPermission, "application.read" | "application.update" | "application.analyze" | "application.delete">;
  resourceType: "application";
  acceptedPrincipalKind: "firebase_user";
  requiredConstraints: readonly AuthorizationConstraint[];
  constraintApplicability: Readonly<{ assignment: false; branch: false; team: false; creator: false }>;
  auditAction: string;
  cacheEligibility: "not_eligible";
  status: "locked_for_supported_sec_002_surfaces";
}>;

const constraints = Object.freeze(["active_tenant", "active_membership", "resource_tenant_match", "unresolved_legacy_denied"] as const);
const applicability = Object.freeze({ assignment: false, branch: false, team: false, creator: false } as const);
const policy = (permission: ApplicationActionPolicyV1["permission"]): ApplicationActionPolicyV1 => Object.freeze({ policyVersion: AUTHORIZATION_POLICY_VERSION, permission, resourceType: "application", acceptedPrincipalKind: "firebase_user", requiredConstraints: constraints, constraintApplicability: applicability, auditAction: permission, cacheEligibility: "not_eligible", status: "locked_for_supported_sec_002_surfaces" });

export const APPLICATION_ACTION_POLICIES = Object.freeze({
  read: policy("application.read"),
  update: policy("application.update"),
  analyze: policy("application.analyze"),
  delete: policy("application.delete"),
});

export function applicationPolicyForPermission(permission: unknown): ApplicationActionPolicyV1 | undefined {
  return Object.values(APPLICATION_ACTION_POLICIES).find((candidate) => candidate.permission === permission);
}
