import { AUTHORIZATION_CONTEXT_V1, AUTHORIZATION_PERMISSION_VERSION, AUTHORIZATION_POLICY_VERSION } from "./authorization";

const freeze = <T>(value: T): Readonly<T> => Object.freeze(value);
const now = "2026-07-11T20:00:00.000Z";
const authentication = (principalId: string, principalKind: "firebase_user" | "service" = "firebase_user") => freeze({ principalKind, principalId, requestId: "req_authorization_fixture", correlationId: "corr_authorization_fixture" });
const human = (role: string, membershipStatus = "active", tenantStatus = "active", extra: Record<string, unknown> = {}) => freeze({ schemaVersion: AUTHORIZATION_CONTEXT_V1, authentication: authentication(`${role}_user`), tenantId: "tenant_alpha", membershipId: `membership_${role}`, membershipStatus, role, permissionVersion: AUTHORIZATION_PERMISSION_VERSION, tenantStatus, branchIds: freeze(["branch_alpha"]), teamIds: freeze(["team_alpha"]), authorizationSource: "tenant_membership", evaluatedAt: now, membershipUpdatedAt: now, tenantUpdatedAt: now, ...extra });
const resource = (tenantId: string | undefined, ownershipState: "tenant_owned" | "unresolved_legacy", extra: Record<string, unknown> = {}) => freeze({ ...(tenantId ? { tenantId } : {}), ownershipState, ...extra });

export const authorizationFixtures = freeze({
  contexts: freeze({
    activeOwner: human("owner"), activeAdmin: human("admin"), activeUnderwriter: human("underwriter"), activeProcessor: human("processor"),
    activeLoanOfficer: human("loan_officer"), activeViewer: human("viewer"), unknownRole: human("unknown"), invitedMembership: human("viewer", "invited"),
    suspendedMembership: human("viewer", "suspended"), disabledMembership: human("viewer", "disabled"), suspendedTenant: human("owner", "active", "suspended"),
    missingTenant: freeze({ ...human("owner"), tenantId: undefined }),
    validServiceGrant: freeze({ schemaVersion: AUTHORIZATION_CONTEXT_V1, authentication: authentication("files_service", "service"), tenantId: "tenant_alpha", serviceGrantId: "grant_files_alpha", servicePermissions: freeze(["service.files.process"]), permittedTenantIds: freeze(["tenant_alpha"]), permissionVersion: AUTHORIZATION_PERMISSION_VERSION, tenantStatus: "active", authorizationSource: "service_grant", evaluatedAt: now, grantVersion: "grant.v1", tenantUpdatedAt: now }),
    invalidServiceScope: freeze({ schemaVersion: AUTHORIZATION_CONTEXT_V1, authentication: authentication("files_service", "service"), tenantId: "tenant_alpha", serviceGrantId: "grant_files_beta", servicePermissions: freeze(["service.files.process"]), permittedTenantIds: freeze(["tenant_beta"]), permissionVersion: AUTHORIZATION_PERMISSION_VERSION, tenantStatus: "active", authorizationSource: "service_grant", evaluatedAt: now, grantVersion: "grant.v1", tenantUpdatedAt: now }),
  }),
  resources: freeze({
    sameTenantApplication: resource("tenant_alpha", "tenant_owned", { branchId: "branch_alpha", teamId: "team_alpha", assignedUserId: "underwriter_user", creatorId: "processor_user" }),
    crossTenantApplication: resource("tenant_beta", "tenant_owned"), unresolvedLegacyApplication: resource(undefined, "unresolved_legacy"),
    matchingBranch: resource("tenant_alpha", "tenant_owned", { branchId: "branch_alpha" }), mismatchedBranch: resource("tenant_alpha", "tenant_owned", { branchId: "branch_beta" }),
    assignedUser: resource("tenant_alpha", "tenant_owned", { assignedUserId: "underwriter_user" }), unassignedUser: resource("tenant_alpha", "tenant_owned"),
  }),
  policies: freeze({
    applicationRead: freeze({ policyVersion: AUTHORIZATION_POLICY_VERSION, permission: "application.read", resourceType: "application", requiredConstraints: freeze(["active_tenant", "active_membership", "resource_tenant_match", "unresolved_legacy_denied"]), auditAction: "application.read" }),
    applicationUpdate: freeze({ policyVersion: AUTHORIZATION_POLICY_VERSION, permission: "application.update", resourceType: "application", requiredConstraints: freeze(["active_tenant", "active_membership", "resource_tenant_match", "unresolved_legacy_denied"]), auditAction: "application.update" }),
    decisionApprove: freeze({ policyVersion: AUTHORIZATION_POLICY_VERSION, permission: "decision.approve", resourceType: "decision", requiredConstraints: freeze(["active_tenant", "active_membership", "resource_tenant_match", "assigned_to_user", "unresolved_legacy_denied"]), auditAction: "decision.approve" }),
    decisionDeny: freeze({ policyVersion: AUTHORIZATION_POLICY_VERSION, permission: "decision.deny", resourceType: "decision", requiredConstraints: freeze(["active_tenant", "active_membership", "resource_tenant_match", "assigned_to_user", "unresolved_legacy_denied"]), auditAction: "decision.deny" }),
    branchRead: freeze({ policyVersion: AUTHORIZATION_POLICY_VERSION, permission: "application.read", resourceType: "application", requiredConstraints: freeze(["active_tenant", "active_membership", "resource_tenant_match", "branch_match"]), auditAction: "application.branch_read" }),
    serviceFiles: freeze({ policyVersion: AUTHORIZATION_POLICY_VERSION, permission: "service.files.process", resourceType: "service_job", requiredConstraints: freeze(["active_tenant", "service_scope_match"]), auditAction: "service.files.process" }),
    malformedPolicy: freeze({ policyVersion: "wrong", permission: "*", resourceType: "application", requiredConstraints: freeze([]), auditAction: "bad policy" }), missingPolicy: undefined, missingPermission: freeze({ policyVersion: AUTHORIZATION_POLICY_VERSION, resourceType: "application", requiredConstraints: freeze([]), auditAction: "application.missing" }),
  }),
  evaluatedAt: now,
});
