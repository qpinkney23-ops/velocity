import "server-only";
import { getFirestore } from "firebase-admin/firestore";
import { defaultAdminApp } from "../auth/firebaseAdminAuthAdapter";
import { resolveTenantAuthorizationContextCore, type ResolveTenantAuthorizationInput, type TenantAuthorizationRepository } from "./tenantAuthorizationResolverCore";

function firebaseTenantAuthorizationRepository(): TenantAuthorizationRepository {
  const db = getFirestore(defaultAdminApp());
  return Object.freeze({
    async listDiscoveredTenantIds(userId: string) { const snapshot = await db.collection("userTenantMemberships").doc(userId).collection("tenants").get(); return Object.freeze(snapshot.docs.map((doc) => doc.id)); },
    async getTenant(tenantId: string) { const snapshot = await db.doc(`tenants/${tenantId}`).get(); return snapshot.exists ? snapshot.data() : undefined; },
    async getMembership(tenantId: string, userId: string) { const snapshot = await db.doc(`tenants/${tenantId}/members/${userId}`).get(); return snapshot.exists ? snapshot.data() : undefined; },
  });
}

export function resolveTenantAuthorizationContext(input: ResolveTenantAuthorizationInput) { return resolveTenantAuthorizationContextCore(input, firebaseTenantAuthorizationRepository()); }
