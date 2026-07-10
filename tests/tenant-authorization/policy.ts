import type { SyntheticApplication, SyntheticFileMetadata, SyntheticMembership, SyntheticRole } from "./fixtures";

/**
 * Test-only conservative permission assumptions. This is not the final product
 * permission matrix and is not imported by production code.
 */
const CLIENT_ROLES: readonly SyntheticRole[] = ["owner", "processor", "underwriter", "viewer"];
const APPLICATION_CREATE_ROLES: readonly SyntheticRole[] = ["owner", "processor"];
const APPLICATION_UPDATE_ROLES: readonly SyntheticRole[] = ["owner", "processor"];
const STORAGE_WRITE_ROLES: readonly SyntheticRole[] = ["owner", "processor"];

export type SyntheticAuth = Readonly<{ uid: string } | { uid: null }>;
export type SyntheticState = Readonly<{
  memberships: readonly SyntheticMembership[];
  applications: readonly SyntheticApplication[];
}>;

function membership(state: SyntheticState, tenantId: string, uid: string | null): SyntheticMembership | undefined {
  return uid ? state.memberships.find((item) => item.tenantId === tenantId && item.userId === uid) : undefined;
}

function activeClientMembership(state: SyntheticState, tenantId: string, auth: SyntheticAuth): SyntheticMembership | undefined {
  const found = membership(state, tenantId, auth.uid);
  return found?.membershipStatus === "active" && CLIENT_ROLES.includes(found.role) ? found : undefined;
}

export const firestoreTestPolicy = Object.freeze({
  readTenant(state: SyntheticState, auth: SyntheticAuth, tenantId: string) {
    return !!activeClientMembership(state, tenantId, auth);
  },
  readMembership(state: SyntheticState, auth: SyntheticAuth, tenantId: string, userId: string) {
    return auth.uid === userId && !!activeClientMembership(state, tenantId, auth);
  },
  writeMembership() { return false; },
  readUserProfile(auth: SyntheticAuth, userId: string) { return auth.uid === userId; },
  writeUserProfile() { return false; },
  readApplication(state: SyntheticState, auth: SyntheticAuth, application: SyntheticApplication) {
    return application.ownershipState === "tenant_owned" && !!application.tenantId && !!activeClientMembership(state, application.tenantId, auth);
  },
  createApplication(state: SyntheticState, auth: SyntheticAuth, application: SyntheticApplication) {
    if (!auth.uid || !application.tenantId || application.ownershipState !== "tenant_owned") return false;
    const member = activeClientMembership(state, application.tenantId, auth);
    return !!member && APPLICATION_CREATE_ROLES.includes(member.role) && application.createdBy === auth.uid;
  },
  updateApplication(state: SyntheticState, auth: SyntheticAuth, before: SyntheticApplication, after: SyntheticApplication) {
    if (!before.tenantId || before.ownershipState !== "tenant_owned") return false;
    const member = activeClientMembership(state, before.tenantId, auth);
    return !!member && APPLICATION_UPDATE_ROLES.includes(member.role) &&
      after.tenantId === before.tenantId && after.createdBy === before.createdBy && after.ownershipState === before.ownershipState;
  },
  listApplications(state: SyntheticState, auth: SyntheticAuth, requestedTenantId?: string) {
    if (!requestedTenantId || !activeClientMembership(state, requestedTenantId, auth)) return [] as readonly SyntheticApplication[];
    return state.applications.filter((application) => application.tenantId === requestedTenantId && application.ownershipState === "tenant_owned");
  },
});

export const storageTestPolicy = Object.freeze({
  read(state: SyntheticState, auth: SyntheticAuth, pathTenantId: string, pathApplicationId: string, metadata: SyntheticFileMetadata) {
    const application = state.applications.find((item) => item.applicationId === pathApplicationId);
    return !!activeClientMembership(state, pathTenantId, auth) && !!application && application.tenantId === pathTenantId &&
      application.ownershipState === "tenant_owned" && metadata.tenantId === pathTenantId && metadata.applicationId === pathApplicationId;
  },
  write(state: SyntheticState, auth: SyntheticAuth, pathTenantId: string, pathApplicationId: string, metadata: SyntheticFileMetadata) {
    const member = activeClientMembership(state, pathTenantId, auth);
    const application = state.applications.find((item) => item.applicationId === pathApplicationId);
    return !!member && STORAGE_WRITE_ROLES.includes(member.role) && !!application && application.tenantId === pathTenantId &&
      application.ownershipState === "tenant_owned" && metadata.tenantId === pathTenantId && metadata.applicationId === pathApplicationId;
  },
});

