import { classifyUserCredential, type ServerAuthContextV1, type StableServerAuthErrorV1 } from "../../contracts/serverAuth";
import { boundaryError, isRecentAuthentication, VELOCITY_AUTH_BODY_MAX_BYTES } from "./browserSessionPolicy";
import type { ServerAuthVerifierResult } from "./firebaseAuthVerifierCore";

export type SessionEndpointDependencies = Readonly<{ verifyIdToken(authorizationHeader: string, correlationId: string): Promise<ServerAuthVerifierResult>; createSessionCookie(idToken: string): Promise<string>; now(): Date }>;
export type SessionExchangeResult = Readonly<{ ok: true; context: ServerAuthContextV1; sessionCookie: string }> | Readonly<{ ok: false; error: StableServerAuthErrorV1 }>;

export function parseSessionExchangePayload(text: string, authorizationHeader: string | null, requestId: string): Readonly<{ ok: true; idToken: string; authorizationHeader: string }> | Readonly<{ ok: false; error: StableServerAuthErrorV1 }> {
  if (Buffer.byteLength(text, "utf8") > VELOCITY_AUTH_BODY_MAX_BYTES) return Object.freeze({ ok: false, error: boundaryError("PAYLOAD_INVALID", requestId) });
  let body: unknown = {}; try { body = text ? JSON.parse(text) : {}; } catch { return Object.freeze({ ok: false, error: boundaryError("PAYLOAD_INVALID", requestId) }); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return Object.freeze({ ok: false, error: boundaryError("PAYLOAD_INVALID", requestId) });
  const raw = body as Record<string, unknown>; const bodyToken = typeof raw.idToken === "string" && raw.idToken.trim() ? raw.idToken.trim() : undefined;
  const headerClassification = classifyUserCredential({ authorizationHeader });
  if (bodyToken && headerClassification.kind !== "none") return Object.freeze({ ok: false, error: boundaryError("AUTH_INVALID", requestId) });
  if (Object.keys(raw).some((key) => key !== "idToken")) return Object.freeze({ ok: false, error: boundaryError("PAYLOAD_INVALID", requestId) });
  const effectiveHeader = bodyToken ? `Bearer ${bodyToken}` : authorizationHeader || ""; const classified = classifyUserCredential({ authorizationHeader: effectiveHeader });
  if (classified.kind === "none") return Object.freeze({ ok: false, error: boundaryError("AUTH_REQUIRED", requestId) });
  if (classified.kind !== "firebase_id_token") return Object.freeze({ ok: false, error: boundaryError("AUTH_INVALID", requestId) });
  return Object.freeze({ ok: true, idToken: bodyToken || effectiveHeader.replace(/^Bearer\s+/i, ""), authorizationHeader: effectiveHeader });
}

export async function exchangeSession(payload: Readonly<{ idToken: string; authorizationHeader: string }>, requestId: string, correlationId: string, dependencies: SessionEndpointDependencies): Promise<SessionExchangeResult> {
  const verified = await dependencies.verifyIdToken(payload.authorizationHeader, correlationId); if (!verified.ok) return verified;
  if (verified.context.principal.kind !== "firebase_user" || verified.context.principal.authenticationMethod !== "firebase_id_token") return Object.freeze({ ok: false, error: boundaryError("AUTH_INVALID", requestId) });
  if (!isRecentAuthentication(verified.context.principal.authenticatedAt, dependencies.now())) return Object.freeze({ ok: false, error: boundaryError("REAUTH_REQUIRED", requestId) });
  try { const sessionCookie = await dependencies.createSessionCookie(payload.idToken); return Object.freeze({ ok: true, context: verified.context, sessionCookie }); }
  catch { return Object.freeze({ ok: false, error: boundaryError("INTERNAL_ERROR", requestId) }); }
}
