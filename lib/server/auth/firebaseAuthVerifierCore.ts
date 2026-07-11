import { randomBytes } from "crypto";
import {
  SERVER_AUTH_CONTEXT_SCHEMA_VERSION,
  createStableServerAuthError,
  parseServerAuthContext,
  validateCorrelationId,
  validateRequestId,
  type CredentialClassification,
  type ServerAuthContextV1,
  type StableServerAuthErrorV1,
} from "../../contracts/serverAuth";

export type VerifiedFirebaseClaims = Readonly<{
  uid?: unknown;
  issuedAtSeconds?: unknown;
  authenticatedAtSeconds?: unknown;
  emailVerified?: unknown;
}>;

export type FirebaseAuthVerificationAdapter = Readonly<{
  verifyIdToken(token: string, checkRevoked: true): Promise<VerifiedFirebaseClaims>;
  verifySessionCookie(cookie: string, checkRevoked: true): Promise<VerifiedFirebaseClaims>;
  assertUserEnabled(uid: string): Promise<void>;
}>;

export type ServerAuthVerifierInput = Readonly<{
  classification: CredentialClassification;
  authorizationHeader?: unknown;
  sessionCookie?: unknown;
  inboundCorrelationId?: unknown;
  trustedCorrelationCaller: boolean;
}>;

export type ServerAuthVerifierDependencies = Readonly<{
  adapter: FirebaseAuthVerificationAdapter;
  now(): Date;
  generateOpaqueId(): string;
}>;

export type ServerAuthVerifierResult =
  | Readonly<{ ok: true; context: ServerAuthContextV1 }>
  | Readonly<{ ok: false; error: StableServerAuthErrorV1 }>;

type PublicAuthCode = "AUTH_REQUIRED" | "AUTH_INVALID" | "AUTH_REVOKED" | "ACCOUNT_DISABLED" | "INTERNAL_ERROR";

function defaultOpaqueId() { return randomBytes(24).toString("hex"); }
export const defaultServerAuthVerifierDependencies = (adapter: FirebaseAuthVerificationAdapter): ServerAuthVerifierDependencies => Object.freeze({ adapter, now: () => new Date(), generateOpaqueId: defaultOpaqueId });

function stableFailure(code: PublicAuthCode, requestId: string): ServerAuthVerifierResult {
  const built = createStableServerAuthError(code, requestId);
  if (!built.ok) throw new Error("server_auth_internal_contract_failure");
  return Object.freeze({ ok: false, error: built.value });
}

function publicCode(error: unknown): PublicAuthCode {
  const code = error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code || "") : "";
  if (code === "auth/id-token-revoked" || code === "auth/session-cookie-revoked") return "AUTH_REVOKED";
  if (code === "auth/user-disabled") return "ACCOUNT_DISABLED";
  if (code.startsWith("auth/")) return "AUTH_INVALID";
  return "INTERNAL_ERROR";
}

function secondsToIso(value: unknown): string | undefined {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) return undefined;
  const date = new Date(value * 1000);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function bearerToken(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const match = value.trim().match(/^Bearer\s+(\S+)$/i);
  return match?.[1];
}

function safeGeneratedId(prefix: "req" | "corr", dependencies: ServerAuthVerifierDependencies): string {
  const generated = dependencies.generateOpaqueId();
  const candidate = `${prefix}_${generated}`;
  const valid = prefix === "req" ? validateRequestId(candidate) : validateCorrelationId(candidate);
  if (!valid.ok) throw new Error("server_auth_id_generation_failure");
  return candidate;
}

/** Pure orchestration boundary. The adapter owns cryptographic Firebase verification. */
export async function verifyFirebaseUserCredential(input: ServerAuthVerifierInput, dependencies: ServerAuthVerifierDependencies): Promise<ServerAuthVerifierResult> {
  const requestId = safeGeneratedId("req", dependencies);
  const correlationId = input.trustedCorrelationCaller && validateCorrelationId(input.inboundCorrelationId).ok
    ? input.inboundCorrelationId as string
    : safeGeneratedId("corr", dependencies);
  if (input.classification.kind === "none") return stableFailure("AUTH_REQUIRED", requestId);
  if (input.classification.kind === "conflicting_user_credentials" || input.classification.kind === "unsupported_authorization") return stableFailure("AUTH_INVALID", requestId);

  const method = input.classification.kind;
  const credential = method === "firebase_id_token" ? bearerToken(input.authorizationHeader) : typeof input.sessionCookie === "string" && input.sessionCookie.trim() ? input.sessionCookie.trim() : undefined;
  if (!credential) return stableFailure("AUTH_INVALID", requestId);
  try {
    const claims = method === "firebase_id_token"
      ? await dependencies.adapter.verifyIdToken(credential, true)
      : await dependencies.adapter.verifySessionCookie(credential, true);
    if (typeof claims.uid !== "string" || !claims.uid) return stableFailure("AUTH_INVALID", requestId);
    const tokenIssuedAt = secondsToIso(claims.issuedAtSeconds), authenticatedAt = secondsToIso(claims.authenticatedAtSeconds);
    if (!tokenIssuedAt || !authenticatedAt || typeof claims.emailVerified !== "boolean") return stableFailure("AUTH_INVALID", requestId);
    await dependencies.adapter.assertUserEnabled(claims.uid);
    const verifiedAt = dependencies.now().toISOString();
    const parsed = parseServerAuthContext({ schemaVersion: SERVER_AUTH_CONTEXT_SCHEMA_VERSION, principal: { kind: "firebase_user", uid: claims.uid, authenticationMethod: method, tokenIssuedAt, authenticatedAt, emailVerified: claims.emailVerified }, verifiedAt, revocationCheckedAt: verifiedAt, requestId, correlationId });
    return parsed.ok ? Object.freeze({ ok: true, context: parsed.value }) : stableFailure("AUTH_INVALID", requestId);
  } catch (error) {
    return stableFailure(publicCode(error), requestId);
  }
}
