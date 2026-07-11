import "server-only";
import { getAuth } from "firebase-admin/auth";
import { classifyUserCredential } from "../../contracts/serverAuth";
import { defaultAdminApp } from "./firebaseAdminAuthAdapter";
import { defaultServerAuthVerifierDependencies, verifyFirebaseUserCredential } from "./firebaseAuthVerifierCore";
import { createFirebaseAdminAuthAdapter } from "./firebaseAdminAuthAdapter";
import { VELOCITY_SESSION_MAX_AGE_MILLISECONDS } from "./browserSessionPolicy";

export function createVelocitySessionCookie(idToken: string) { return getAuth(defaultAdminApp()).createSessionCookie(idToken, { expiresIn: VELOCITY_SESSION_MAX_AGE_MILLISECONDS }); }
export function verifyVelocitySessionCookie(sessionCookie: string, inboundCorrelationId?: unknown, trustedCorrelationCaller = false) {
  return verifyFirebaseUserCredential({ classification: classifyUserCredential({ sessionCookie }), sessionCookie, inboundCorrelationId, trustedCorrelationCaller }, defaultServerAuthVerifierDependencies(createFirebaseAdminAuthAdapter()));
}
