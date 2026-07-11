import {
  validateIsoTimestamp,
  validateSchemaVersion,
  validateUserId,
  type IsoTimestamp,
  type SchemaVersion,
  type UserId,
} from "./primitives";

declare const serverAuthBrand: unique symbol;
type ServerAuthId<Name extends string> = string & { readonly [serverAuthBrand]: Name };

export type RequestId = ServerAuthId<"RequestId">;
export type CorrelationId = ServerAuthId<"CorrelationId">;
export type ServerPrincipalId = ServerAuthId<"ServerPrincipalId">;

export const SERVER_AUTH_CONTEXT_SCHEMA_VERSION = "server-auth-context.v1" as SchemaVersion;
export const SERVER_AUTH_ERROR_SCHEMA_VERSION = "server-auth-error.v1" as SchemaVersion;
export const SERVER_AUTH_CONTRACT_PARSER_VERSION = "server-auth-contract-parser.v1";

export const SERVER_PRINCIPAL_KINDS = ["firebase_user", "service", "cron", "external_webhook"] as const;
export type ServerPrincipalKind = typeof SERVER_PRINCIPAL_KINDS[number];

export const AUTHENTICATION_METHODS = [
  "session_cookie",
  "firebase_id_token",
  "service_credential",
  "cron_bearer",
  "provider_signature",
] as const;
export type AuthenticationMethod = typeof AUTHENTICATION_METHODS[number];

export type FirebaseUserPrincipalV1 = Readonly<{
  kind: "firebase_user";
  uid: UserId;
  authenticationMethod: "session_cookie" | "firebase_id_token";
  tokenIssuedAt: IsoTimestamp;
  authenticatedAt: IsoTimestamp;
  emailVerified: boolean;
}>;

export type MachinePrincipalV1 = Readonly<{
  kind: "service" | "cron" | "external_webhook";
  principalId: ServerPrincipalId;
  authenticationMethod: "service_credential" | "cron_bearer" | "provider_signature";
  credentialVersion?: string;
}>;

export type ServerAuthPrincipalV1 = FirebaseUserPrincipalV1 | MachinePrincipalV1;

export type ServerAuthContextV1 = Readonly<{
  schemaVersion: typeof SERVER_AUTH_CONTEXT_SCHEMA_VERSION;
  principal: ServerAuthPrincipalV1;
  verifiedAt: IsoTimestamp;
  revocationCheckedAt?: IsoTimestamp;
  requestId: RequestId;
  correlationId: CorrelationId;
}>;

export const SERVER_AUTH_ERROR_CODES = [
  "AUTH_REQUIRED", "AUTH_INVALID", "AUTH_REVOKED", "ACCOUNT_DISABLED",
  "TENANT_CONTEXT_REQUIRED", "MEMBERSHIP_INACTIVE", "FORBIDDEN",
  "CSRF_INVALID", "RATE_LIMITED", "INTERNAL_ERROR",
  "REAUTH_REQUIRED", "ORIGIN_INVALID", "HOST_INVALID", "METHOD_NOT_ALLOWED", "PAYLOAD_INVALID",
] as const;
export type ServerAuthErrorCode = typeof SERVER_AUTH_ERROR_CODES[number];

export type StableServerAuthErrorV1 = Readonly<{
  schemaVersion: typeof SERVER_AUTH_ERROR_SCHEMA_VERSION;
  code: ServerAuthErrorCode;
  status: 400 | 401 | 403 | 405 | 429 | 500;
  message: string;
  requestId: RequestId;
}>;

export type CredentialClassification =
  | Readonly<{ kind: "none" }>
  | Readonly<{ kind: "session_cookie" }>
  | Readonly<{ kind: "firebase_id_token" }>
  | Readonly<{ kind: "conflicting_user_credentials" }>
  | Readonly<{ kind: "unsupported_authorization" }>;

export type ServerAuthValidationResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; code: "invalid_server_auth_contract"; message: string }>;

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SAFE_VERSION = /^[A-Za-z0-9][A-Za-z0-9._:+-]{0,63}$/;
const fail = <T>(message: string): ServerAuthValidationResult<T> => Object.freeze({ ok: false, code: "invalid_server_auth_contract", message });
const parseSafeId = <T>(value: unknown, label: string): ServerAuthValidationResult<T> =>
  typeof value === "string" && SAFE_ID.test(value)
    ? Object.freeze({ ok: true, value: value as T })
    : fail(`${label} must be a valid safe identifier.`);
const parseTime = (value: unknown, label: string): ServerAuthValidationResult<IsoTimestamp> => {
  const parsed = validateIsoTimestamp(value);
  return parsed.ok ? Object.freeze({ ok: true, value: parsed.value }) : fail(`${label} must be a valid UTC timestamp.`);
};

export const validateRequestId = (value: unknown) => parseSafeId<RequestId>(value, "Request ID");
export const validateCorrelationId = (value: unknown) => parseSafeId<CorrelationId>(value, "Correlation ID");
export const validateServerPrincipalId = (value: unknown) => parseSafeId<ServerPrincipalId>(value, "Server principal ID");

/** Classifies presence and scheme only. Credential values are never returned. */
export function classifyUserCredential(input: Readonly<{ authorizationHeader?: unknown; sessionCookie?: unknown }>): CredentialClassification {
  const cookiePresent = typeof input.sessionCookie === "string" && input.sessionCookie.trim().length > 0;
  const header = typeof input.authorizationHeader === "string" ? input.authorizationHeader.trim() : "";
  const bearer = /^Bearer\s+\S+$/i.test(header);
  if (cookiePresent && bearer) return Object.freeze({ kind: "conflicting_user_credentials" });
  if (cookiePresent) return Object.freeze({ kind: "session_cookie" });
  if (bearer) return Object.freeze({ kind: "firebase_id_token" });
  if (header) return Object.freeze({ kind: "unsupported_authorization" });
  return Object.freeze({ kind: "none" });
}

function parsePrincipal(value: unknown): ServerAuthValidationResult<ServerAuthPrincipalV1> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail("Server authentication principal must be an object.");
  const raw = value as Record<string, unknown>;
  if (raw.kind === "firebase_user") {
    const uid = validateUserId(raw.uid); if (!uid.ok) return fail("Firebase user identity is invalid.");
    if (raw.authenticationMethod !== "session_cookie" && raw.authenticationMethod !== "firebase_id_token") return fail("Firebase user authentication method is invalid.");
    const tokenIssuedAt = parseTime(raw.tokenIssuedAt, "Token issuedAt"); if (!tokenIssuedAt.ok) return tokenIssuedAt;
    const authenticatedAt = parseTime(raw.authenticatedAt, "Authentication time"); if (!authenticatedAt.ok) return authenticatedAt;
    if (typeof raw.emailVerified !== "boolean") return fail("Email verification state must be boolean.");
    return Object.freeze({ ok: true, value: Object.freeze({ kind: "firebase_user", uid: uid.value, authenticationMethod: raw.authenticationMethod, tokenIssuedAt: tokenIssuedAt.value, authenticatedAt: authenticatedAt.value, emailVerified: raw.emailVerified }) });
  }
  if (raw.kind !== "service" && raw.kind !== "cron" && raw.kind !== "external_webhook") return fail("Server principal kind is invalid.");
  const principalId = validateServerPrincipalId(raw.principalId); if (!principalId.ok) return principalId;
  const requiredMethod = raw.kind === "service" ? "service_credential" : raw.kind === "cron" ? "cron_bearer" : "provider_signature";
  if (raw.authenticationMethod !== requiredMethod) return fail("Machine principal authentication method does not match its kind.");
  if (raw.credentialVersion !== undefined && (typeof raw.credentialVersion !== "string" || !SAFE_VERSION.test(raw.credentialVersion))) return fail("Credential version is invalid.");
  return Object.freeze({ ok: true, value: Object.freeze({ kind: raw.kind, principalId: principalId.value, authenticationMethod: requiredMethod, ...(raw.credentialVersion ? { credentialVersion: raw.credentialVersion as string } : {}) }) });
}

/** Validates already-verified data only; it performs no credential verification or I/O. */
export function parseServerAuthContext(input: unknown): ServerAuthValidationResult<ServerAuthContextV1> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return fail("Server authentication context must be an object.");
  const raw = input as Record<string, unknown>;
  if (!validateSchemaVersion(raw.schemaVersion).ok || raw.schemaVersion !== SERVER_AUTH_CONTEXT_SCHEMA_VERSION) return fail("Server authentication schema version is invalid.");
  const principal = parsePrincipal(raw.principal); if (!principal.ok) return principal;
  const verifiedAt = parseTime(raw.verifiedAt, "Verification time"); if (!verifiedAt.ok) return verifiedAt;
  const revocationCheckedAt = raw.revocationCheckedAt === undefined ? undefined : parseTime(raw.revocationCheckedAt, "Revocation check time");
  if (revocationCheckedAt && !revocationCheckedAt.ok) return revocationCheckedAt;
  const requestId = validateRequestId(raw.requestId); if (!requestId.ok) return requestId;
  const correlationId = validateCorrelationId(raw.correlationId); if (!correlationId.ok) return correlationId;
  return Object.freeze({ ok: true, value: Object.freeze({ schemaVersion: SERVER_AUTH_CONTEXT_SCHEMA_VERSION, principal: principal.value, verifiedAt: verifiedAt.value, ...(revocationCheckedAt?.value ? { revocationCheckedAt: revocationCheckedAt.value } : {}), requestId: requestId.value, correlationId: correlationId.value }) });
}

const ERROR_DEFINITIONS: Readonly<Record<ServerAuthErrorCode, Readonly<{ status: 400 | 401 | 403 | 405 | 429 | 500; message: string }>>> = Object.freeze({
  AUTH_REQUIRED: Object.freeze({ status: 401, message: "Authentication is required." }),
  AUTH_INVALID: Object.freeze({ status: 401, message: "Authentication is invalid." }),
  AUTH_REVOKED: Object.freeze({ status: 401, message: "Authentication is no longer valid." }),
  ACCOUNT_DISABLED: Object.freeze({ status: 403, message: "Access is unavailable." }),
  TENANT_CONTEXT_REQUIRED: Object.freeze({ status: 403, message: "Tenant context is required." }),
  MEMBERSHIP_INACTIVE: Object.freeze({ status: 403, message: "Access is unavailable." }),
  FORBIDDEN: Object.freeze({ status: 403, message: "This action is not permitted." }),
  CSRF_INVALID: Object.freeze({ status: 403, message: "Request validation failed." }),
  RATE_LIMITED: Object.freeze({ status: 429, message: "Too many requests." }),
  INTERNAL_ERROR: Object.freeze({ status: 500, message: "The request could not be completed." }),
  REAUTH_REQUIRED: Object.freeze({ status: 401, message: "Recent authentication is required." }),
  ORIGIN_INVALID: Object.freeze({ status: 403, message: "Request origin is not allowed." }),
  HOST_INVALID: Object.freeze({ status: 403, message: "Request host is not allowed." }),
  METHOD_NOT_ALLOWED: Object.freeze({ status: 405, message: "Request method is not allowed." }),
  PAYLOAD_INVALID: Object.freeze({ status: 400, message: "Request payload is invalid." }),
});

export function createStableServerAuthError(code: unknown, requestId: unknown): ServerAuthValidationResult<StableServerAuthErrorV1> {
  if (typeof code !== "string" || !SERVER_AUTH_ERROR_CODES.includes(code as ServerAuthErrorCode)) return fail("Server authentication error code is invalid.");
  const parsedRequestId = validateRequestId(requestId); if (!parsedRequestId.ok) return parsedRequestId;
  const definition = ERROR_DEFINITIONS[code as ServerAuthErrorCode];
  return Object.freeze({ ok: true, value: Object.freeze({ schemaVersion: SERVER_AUTH_ERROR_SCHEMA_VERSION, code: code as ServerAuthErrorCode, status: definition.status, message: definition.message, requestId: parsedRequestId.value }) });
}
