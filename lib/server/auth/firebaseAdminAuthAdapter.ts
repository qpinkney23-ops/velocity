import "server-only";
import { cert, getApp, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import type { FirebaseAuthVerificationAdapter, VerifiedFirebaseClaims } from "./firebaseAuthVerifierCore";

export function defaultAdminApp(): App {
  if (getApps().length) return getApp();
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  const storageBucket = process.env.FIREBASE_STORAGE_BUCKET;
  if (!projectId || !clientEmail || !privateKey) throw new Error("firebase_admin_configuration_invalid");
  return initializeApp({ credential: cert({ projectId, clientEmail, privateKey: privateKey.replace(/\\n/g, "\n") }), storageBucket });
}

const claims = (decoded: Readonly<Record<string, unknown>>): VerifiedFirebaseClaims => Object.freeze({ uid: decoded.uid ?? decoded.sub, issuedAtSeconds: decoded.iat, authenticatedAtSeconds: decoded.auth_time, emailVerified: decoded.email_verified === true });

export function createFirebaseAdminAuthAdapter(): FirebaseAuthVerificationAdapter {
  const auth = getAuth(defaultAdminApp());
  return Object.freeze({
    async verifyIdToken(token: string, checkRevoked: true) { return claims(await auth.verifyIdToken(token, checkRevoked)); },
    async verifySessionCookie(cookie: string, checkRevoked: true) { return claims(await auth.verifySessionCookie(cookie, checkRevoked)); },
    async assertUserEnabled(uid: string) { const user = await auth.getUser(uid); if (user.disabled) throw Object.assign(new Error("disabled"), { code: "auth/user-disabled" }); },
  });
}
