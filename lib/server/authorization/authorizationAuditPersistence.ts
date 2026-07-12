import "server-only";
import { getFirestore } from "firebase-admin/firestore";
import { defaultAdminApp } from "../auth/firebaseAdminAuthAdapter";
import { persistAuthorizationAuditEventCore, type AuthorizationAuditPersistenceContext, type AuthorizationAuditPersistenceRepository } from "./authorizationAuditPersistenceCore";

function firestoreAuthorizationAuditRepository(): AuthorizationAuditPersistenceRepository {
  const db = getFirestore(defaultAdminApp());
  return Object.freeze({ createOrRead: async (path, document) => db.runTransaction(async (transaction) => { const reference = db.doc(path), snapshot = await transaction.get(reference); if (snapshot.exists) return Object.freeze({ result: "existing" as const, document: snapshot.data() }); transaction.create(reference, document); return Object.freeze({ result: "created" as const }); }) });
}

export function persistAuthorizationAuditEvent(event: unknown, context: AuthorizationAuditPersistenceContext) { return persistAuthorizationAuditEventCore(event, context, firestoreAuthorizationAuditRepository()); }
