import { classifyUserCredential, createStableServerAuthError, type CorrelationId, type RequestId, type ServerAuthContextV1, type StableServerAuthErrorV1 } from "../../contracts/serverAuth";
import { validateBrowserMutationSource, validateDoubleSubmitCsrf } from "./browserMutationSecurity";
import type { ServerAuthVerifierInput, ServerAuthVerifierResult } from "./firebaseAuthVerifierCore";
import { validateUserApiRoutePolicy, type UserApiRoutePolicy } from "./userApiAuthPolicy";

export type UserApiRequestLike = Readonly<{ method: string; headers: Pick<Headers, "get"> }>;
export type UserApiAuthDependencies = Readonly<{ verify(input: ServerAuthVerifierInput): Promise<ServerAuthVerifierResult>; ids(inbound: unknown, trusted: boolean): Readonly<{ requestId: RequestId; correlationId: CorrelationId }>; trustedOrigin: string; production: boolean; trustForwardedHost: boolean }>;
export type UserApiAuthResult =
  | Readonly<{ ok: true; state: "authenticated"; context: ServerAuthContextV1; authorization: Readonly<{ status: "not_required" }> }>
  | Readonly<{ ok: false; state: "authorization_required"; context: ServerAuthContextV1; authorization: Readonly<{ status: "not_resolved" }>; error: StableServerAuthErrorV1 }>
  | Readonly<{ ok: false; state: "authentication_failed"; correlationId: CorrelationId; error: StableServerAuthErrorV1 }>;

function cookieValue(header: string | null, name: string): string | undefined { if (!header) return undefined; for (const item of header.split(";")) { const index = item.indexOf("="); if (index > 0 && item.slice(0, index).trim() === name) return item.slice(index + 1).trim(); } return undefined; }
function failure(code: Parameters<typeof createStableServerAuthError>[0], ids: Readonly<{ requestId: RequestId; correlationId: CorrelationId }>): UserApiAuthResult { const built = createStableServerAuthError(code, ids.requestId); if (!built.ok) throw new Error("api_auth_error_contract_failure"); return Object.freeze({ ok: false, state: "authentication_failed", correlationId: ids.correlationId, error: built.value }); }

export async function authenticateUserApiRequest(request: UserApiRequestLike, policyInput: unknown, dependencies: UserApiAuthDependencies): Promise<UserApiAuthResult> {
  const validated = validateUserApiRoutePolicy(policyInput);
  const ids = dependencies.ids(request.headers.get("x-correlation-id"), validated.ok && validated.policy.trustIncomingCorrelationId);
  if (!validated.ok || !validated.policy.productionEnabled) return failure("INTERNAL_ERROR", ids);
  const policy: UserApiRoutePolicy = validated.policy;
  if (!policy.allowedMethods.includes(request.method.toUpperCase())) return failure("METHOD_NOT_ALLOWED", ids);
  const lengthHeader = request.headers.get("content-length"); if (lengthHeader !== null) { const length = Number(lengthHeader); if (!Number.isSafeInteger(length) || length < 0) return failure("PAYLOAD_INVALID", ids); if (policy.bodySizeLimit !== undefined && length > policy.bodySizeLimit) return failure("PAYLOAD_TOO_LARGE", ids); }

  const sessionName = dependencies.production ? "__Host-velocity_session" : "velocity_session";
  const sessionCookie = cookieValue(request.headers.get("cookie"), sessionName);
  const authorizationHeader = request.headers.get("authorization");
  if (authorizationHeader && !/^Bearer\s+\S+$/i.test(authorizationHeader.trim())) return failure("AUTH_INVALID", ids);
  const classification = classifyUserCredential({ sessionCookie, authorizationHeader });
  if (classification.kind === "session_cookie" && !policy.allowSessionCookie) return failure("AUTH_INVALID", ids);
  if (classification.kind === "firebase_id_token" && !policy.allowFirebaseBearer) return failure("AUTH_INVALID", ids);
  if (classification.kind === "conflicting_user_credentials" || classification.kind === "unsupported_authorization") return failure("AUTH_INVALID", ids);
  if (classification.kind === "none") return failure("AUTH_REQUIRED", ids);

  if (policy.originPolicy === "same-origin") { const source = validateBrowserMutationSource({ origin: request.headers.get("origin"), host: request.headers.get("host"), forwardedHost: request.headers.get("x-forwarded-host"), trustedOrigin: dependencies.trustedOrigin, trustForwardedHost: dependencies.trustForwardedHost }); if (!source.ok) return failure(source.code, ids); }
  if (classification.kind === "session_cookie" && policy.csrfMode === "double-submit") { const csrfCookie = cookieValue(request.headers.get("cookie"), "velocity_csrf"); if (!validateDoubleSubmitCsrf({ cookieToken: csrfCookie, headerToken: request.headers.get("x-velocity-csrf") })) return failure("CSRF_INVALID", ids); }

  const verified = await dependencies.verify({ classification, sessionCookie, authorizationHeader, inboundCorrelationId: request.headers.get("x-correlation-id"), trustedCorrelationCaller: policy.trustIncomingCorrelationId });
  if (!verified.ok) return Object.freeze({ ok: false, state: "authentication_failed", correlationId: ids.correlationId, error: verified.error });
  if (verified.context.principal.kind !== policy.allowedPrincipalKind || verified.context.principal.kind !== "firebase_user") return failure("AUTH_INVALID", { requestId: verified.context.requestId, correlationId: verified.context.correlationId });
  if (policy.requireAuthorizationContext) { const built = createStableServerAuthError("AUTHORIZATION_REQUIRED", verified.context.requestId); if (!built.ok) throw new Error("api_auth_authorization_contract_failure"); return Object.freeze({ ok: false, state: "authorization_required", context: verified.context, authorization: Object.freeze({ status: "not_resolved" }), error: built.value }); }
  return Object.freeze({ ok: true, state: "authenticated", context: verified.context, authorization: Object.freeze({ status: "not_required" }) });
}
