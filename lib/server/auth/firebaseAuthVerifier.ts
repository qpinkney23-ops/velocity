import "server-only";
import { createFirebaseAdminAuthAdapter } from "./firebaseAdminAuthAdapter";
import { defaultServerAuthVerifierDependencies, verifyFirebaseUserCredential, type ServerAuthVerifierInput } from "./firebaseAuthVerifierCore";

/** Unexposed server-only verifier. Production routes are migrated in later slices. */
export function verifyFirebaseUserWithAdmin(input: ServerAuthVerifierInput) {
  return verifyFirebaseUserCredential(input, defaultServerAuthVerifierDependencies(createFirebaseAdminAuthAdapter()));
}
