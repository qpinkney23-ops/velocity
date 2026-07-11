import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { resolveTenantAuthorizationContextCore, type TenantAuthorizationRepository } from "../lib/server/authorization/tenantAuthorizationResolverCore";
import { resolverAuth, resolverMembership, resolverTenant, tenantAuthorizationResolverFixtures as f } from "../lib/server/authorization/tenantAuthorizationResolverFixtures";

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
const projectId = "demo-velocity-authorization-resolver"; const [host, portText] = (process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8180").split(":");
const key = (tenantId: string, userId: string) => `tenants/${tenantId}/members/${userId}`;

async function main() {
  console.log("AUTHORIZATION_RESOLVER_EMULATOR_STARTED");
  const env = await initializeTestEnvironment({ projectId, firestore: { host, port: Number(portText) || 8180 } });
  try { await env.clearFirestore(); await env.withSecurityRulesDisabled(async (admin) => {
    const db = admin.firestore(); const writes: Promise<unknown>[] = [];
    for (const [tenantId, status] of [[f.tenants.alpha, "active"], [f.tenants.beta, "active"], [f.tenants.suspended, "suspended"], [f.tenants.disabled, "disabled"]] as const) writes.push(db.doc(`tenants/${tenantId}`).set(resolverTenant(tenantId, status)));
    const memberships = [
      [f.tenants.alpha, f.users.single, "processor", "active"], [f.tenants.alpha, f.users.multi, "processor", "active"], [f.tenants.beta, f.users.multi, "viewer", "active"],
      [f.tenants.alpha, f.users.wrongUid, "processor", "active", "different_user"], [f.tenants.alpha, f.users.invited, "processor", "invited"], [f.tenants.alpha, f.users.suspended, "processor", "suspended"], [f.tenants.alpha, f.users.disabled, "processor", "disabled"], [f.tenants.alpha, f.users.unknown, "unknown", "active"],
      [f.tenants.suspended, f.users.single, "processor", "active"], [f.tenants.disabled, f.users.single, "processor", "active"],
    ] as const;
    for (const [tenantId, pathUser, role, status, recordUser] of memberships) writes.push(db.doc(key(tenantId, pathUser)).set(resolverMembership(tenantId, recordUser || pathUser, role, status)));
    const discoveries: Array<readonly [string, string]> = [[f.users.single, f.tenants.alpha], [f.users.multi, f.tenants.alpha], [f.users.multi, f.tenants.beta], [f.users.missing, f.tenants.alpha], [f.users.wrongUid, f.tenants.alpha], [f.users.invited, f.tenants.alpha], [f.users.suspended, f.tenants.alpha], [f.users.disabled, f.tenants.alpha], [f.users.unknown, f.tenants.alpha]];
    for (const [userId, tenantId] of discoveries) writes.push(db.doc(`userTenantMemberships/${userId}/tenants/${tenantId}`).set({ tenantId, userId })); await Promise.all(writes);
    const repository: TenantAuthorizationRepository = { listDiscoveredTenantIds: async (userId) => (await db.collection(`userTenantMemberships/${userId}/tenants`).get()).docs.map((doc) => doc.id), getTenant: async (tenantId) => { const snap = await db.doc(`tenants/${tenantId}`).get(); return snap.exists ? snap.data() : undefined; }, getMembership: async (tenantId, userId) => { const snap = await db.doc(key(tenantId, userId)).get(); return snap.exists ? snap.data() : undefined; } };
    const resolve = (userId: string, requestedTenantId?: string) => resolveTenantAuthorizationContextCore({ authentication: resolverAuth(userId), ...(requestedTenantId ? { requestedTenantId } : {}) }, repository, () => new Date(f.now));
    const single = await resolve(f.users.single); assert(single.ok && single.context.tenantId === f.tenants.alpha, "single tenant failed");
    const ambiguous = await resolve(f.users.multi); assert(!ambiguous.ok && ambiguous.error.code === "TENANT_SELECTION_REQUIRED", "multi tenant not ambiguous");
    const explicit = await resolve(f.users.multi, f.tenants.beta); assert(explicit.ok && explicit.context.role === "viewer", "explicit selection failed");
    const wrong = await resolve(f.users.single, f.tenants.beta); assert(!wrong.ok && wrong.error.code === "TENANT_NOT_FOUND", "wrong selection leaked");
    const noDiscovery = await resolveTenantAuthorizationContextCore({ authentication: resolverAuth(f.users.single), requestedTenantId: f.tenants.alpha }, { ...repository, listDiscoveredTenantIds: async () => [] }, () => new Date(f.now)); assert(noDiscovery.ok, "discovery became authority");
    for (const [userId, code] of [[f.users.missing, "MEMBERSHIP_NOT_FOUND"], [f.users.wrongUid, "MEMBERSHIP_NOT_FOUND"], [f.users.invited, "MEMBERSHIP_INACTIVE"], [f.users.suspended, "MEMBERSHIP_INACTIVE"], [f.users.disabled, "MEMBERSHIP_INACTIVE"], [f.users.unknown, "ROLE_UNKNOWN"]] as const) { const result = await resolve(userId); assert(!result.ok && result.error.code === code, `${userId} did not fail ${code}`); }
    for (const tenantId of [f.tenants.suspended, f.tenants.disabled]) { const result = await resolve(f.users.single, tenantId); assert(!result.ok && result.error.code === "TENANT_INACTIVE", `${tenantId} accepted`); }
    const invalidDiscovery = await resolveTenantAuthorizationContextCore({ authentication: resolverAuth(f.users.single) }, { ...repository, listDiscoveredTenantIds: async () => [f.tenants.invalidDiscovery] }); assert(!invalidDiscovery.ok && invalidDiscovery.error.code === "TENANT_NOT_FOUND", "invalid discovery accepted");
    const dependency = await resolveTenantAuthorizationContextCore({ authentication: resolverAuth(f.users.single) }, { ...repository, getTenant: async () => { throw new Error("emulator dependency failure"); } }); assert(!dependency.ok && dependency.error.code === "INTERNAL_ERROR", "dependency failure escaped");
    const unauth = await resolveTenantAuthorizationContextCore({ authentication: {} }, repository); assert(!unauth.ok && unauth.error.code === "AUTH_INVALID", "unauthenticated accepted");
    console.log("Firebase Emulator tenant authorization resolver result: PASS");
    console.log("PASS: single/multi/explicit, authoritative reads, inactive/mismatch/unknown, discovery, dependency and unauthenticated coverage");
  }); } finally { await env.clearFirestore().catch(() => undefined); await env.cleanup(); console.log("AUTHORIZATION_RESOLVER_EMULATOR_FINISHED"); }
}
main().catch((error) => { console.error("AUTHORIZATION_RESOLVER_EMULATOR_FATAL:", error?.message || String(error)); process.exitCode = 1; });
