import { SERVER_AUTH_CONTEXT_SCHEMA_VERSION } from "../../contracts/serverAuth";
import { TENANT_MEMBERSHIP_SCHEMA_VERSION, TENANT_SCHEMA_VERSION } from "../../contracts/tenantSystem";

const freeze = <T>(value: T): Readonly<T> => Object.freeze(value);
const now = "2026-07-11T20:00:00.000Z";
const compatibility = freeze({ migrationStatus: "not_required", warnings: freeze([]), legacyFieldNames: freeze([]), adapterVersion: "tenant-contract-adapter.v1" });
export const resolverAuth = (userId: string) => freeze({ schemaVersion: SERVER_AUTH_CONTEXT_SCHEMA_VERSION, principal: freeze({ kind: "firebase_user", uid: userId, authenticationMethod: "session_cookie", tokenIssuedAt: now, authenticatedAt: now, emailVerified: true }), verifiedAt: now, revocationCheckedAt: now, requestId: "req_resolver_fixture", correlationId: "corr_resolver_fixture" });
export const resolverTenant = (tenantId: string, status = "active") => freeze({ schemaVersion: TENANT_SCHEMA_VERSION, tenantId, displayName: `Synthetic ${tenantId}`, status, createdAt: now, createdBy: "platform_fixture", updatedAt: now, compatibility });
export const resolverMembership = (tenantId: string, userId: string, role = "processor", membershipStatus = "active") => freeze({ schemaVersion: TENANT_MEMBERSHIP_SCHEMA_VERSION, tenantId, userId, role, membershipStatus, createdAt: now, createdBy: "platform_fixture", updatedAt: now, branchIds: freeze(["branch_fixture"]), teamIds: freeze(["team_fixture"]), compatibility });
export const tenantAuthorizationResolverFixtures = freeze({ now, users: freeze({ single: "single_user", multi: "multi_user", missing: "missing_user", wrongUid: "wrong_uid_user", invited: "invited_user", suspended: "suspended_user", disabled: "disabled_user", unknown: "unknown_role_user" }), tenants: freeze({ alpha: "tenant_alpha", beta: "tenant_beta", suspended: "tenant_suspended", disabled: "tenant_disabled", invalidDiscovery: "tenant_missing" }) });
