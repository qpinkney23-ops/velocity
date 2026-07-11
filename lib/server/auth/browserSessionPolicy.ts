import { randomBytes } from "crypto";
import { createStableServerAuthError, validateCorrelationId, validateRequestId, type ServerAuthErrorCode, type StableServerAuthErrorV1 } from "../../contracts/serverAuth";

export const VELOCITY_SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;
export const VELOCITY_SESSION_MAX_AGE_MILLISECONDS = VELOCITY_SESSION_MAX_AGE_SECONDS * 1000;
export const VELOCITY_RECENT_AUTH_MAX_AGE_SECONDS = 5 * 60;
export const VELOCITY_AUTH_BODY_MAX_BYTES = 8 * 1024;

export type BrowserSessionCookiePolicy = Readonly<{ name: string; httpOnly: true; secure: boolean; sameSite: "lax"; path: "/"; maxAge: number }>;
export const browserSessionCookiePolicy = (production: boolean): BrowserSessionCookiePolicy => Object.freeze({ name: production ? "__Host-velocity_session" : "velocity_session", httpOnly: true, secure: production, sameSite: "lax", path: "/", maxAge: VELOCITY_SESSION_MAX_AGE_SECONDS });
export const browserSessionCookieDeletionPolicy = (production: boolean) => Object.freeze({ ...browserSessionCookiePolicy(production), maxAge: 0 });

export function isRecentAuthentication(authenticatedAt: string, now: Date): boolean {
  const time = new Date(authenticatedAt).getTime(), age = now.getTime() - time;
  return Number.isFinite(time) && age >= -60_000 && age <= VELOCITY_RECENT_AUTH_MAX_AGE_SECONDS * 1000;
}

export function generateSessionBoundaryId(prefix: "req" | "corr") { return `${prefix}_${randomBytes(24).toString("hex")}`; }

export function boundaryIds(inboundCorrelationId: unknown, trusted: boolean) {
  const requestId = generateSessionBoundaryId("req");
  const correlationId = trusted && validateCorrelationId(inboundCorrelationId).ok ? inboundCorrelationId as string : generateSessionBoundaryId("corr");
  if (!validateRequestId(requestId).ok || !validateCorrelationId(correlationId).ok) throw new Error("session_boundary_id_failure");
  return Object.freeze({ requestId, correlationId });
}

export function boundaryError(code: ServerAuthErrorCode, requestId: string): StableServerAuthErrorV1 {
  const result = createStableServerAuthError(code, requestId); if (!result.ok) throw new Error("session_boundary_error_failure"); return result.value;
}
