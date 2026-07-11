import { SERVER_AUTH_CONTEXT_SCHEMA_VERSION } from "./serverAuth";

const freeze = <T>(value: T): Readonly<T> => Object.freeze(value);
const base = freeze({ schemaVersion: SERVER_AUTH_CONTEXT_SCHEMA_VERSION, verifiedAt: "2026-07-11T16:00:00.000Z", requestId: "req_synthetic_001", correlationId: "corr_synthetic_001" });

export const serverAuthFixtures = freeze({
  firebaseSessionUser: freeze({ ...base, revocationCheckedAt: "2026-07-11T16:00:00.000Z", principal: freeze({ kind: "firebase_user", uid: "user_synthetic_001", authenticationMethod: "session_cookie", tokenIssuedAt: "2026-07-11T15:55:00.000Z", authenticatedAt: "2026-07-11T15:50:00.000Z", emailVerified: true }) }),
  firebaseBearerUser: freeze({ ...base, principal: freeze({ kind: "firebase_user", uid: "user_synthetic_002", authenticationMethod: "firebase_id_token", tokenIssuedAt: "2026-07-11T15:59:00.000Z", authenticatedAt: "2026-07-11T15:50:00.000Z", emailVerified: false }) }),
  service: freeze({ ...base, principal: freeze({ kind: "service", principalId: "service_files_worker", authenticationMethod: "service_credential", credentialVersion: "v1" }) }),
  cron: freeze({ ...base, principal: freeze({ kind: "cron", principalId: "cron_velocity_tick", authenticationMethod: "cron_bearer", credentialVersion: "v1" }) }),
  webhook: freeze({ ...base, principal: freeze({ kind: "external_webhook", principalId: "webhook_stripe", authenticationMethod: "provider_signature", credentialVersion: "v1" }) }),
  malformedUser: freeze({ ...base, principal: freeze({ kind: "firebase_user", uid: "invalid/user", authenticationMethod: "session_cookie", tokenIssuedAt: "2026-07-11T15:55:00.000Z", authenticatedAt: "2026-07-11T15:50:00.000Z", emailVerified: true }) }),
  mismatchedMachineMethod: freeze({ ...base, principal: freeze({ kind: "cron", principalId: "cron_velocity_tick", authenticationMethod: "service_credential" }) }),
  malformedTimestamp: freeze({ ...base, verifiedAt: "not-a-time", principal: freeze({ kind: "service", principalId: "service_test", authenticationMethod: "service_credential" }) }),
  malformedRequestId: freeze({ ...base, requestId: "request/id", principal: freeze({ kind: "service", principalId: "service_test", authenticationMethod: "service_credential" }) }),
  credentials: freeze({ none: freeze({}), cookie: freeze({ sessionCookie: "synthetic-cookie-secret" }), bearer: freeze({ authorizationHeader: "Bearer synthetic-token-secret" }), conflict: freeze({ sessionCookie: "synthetic-cookie-secret", authorizationHeader: "Bearer synthetic-token-secret" }), unsupported: freeze({ authorizationHeader: "Basic synthetic-secret" }) }),
});
