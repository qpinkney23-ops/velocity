"use client";

export type VelocitySessionErrorCode = "NETWORK" | "AUTH_REQUIRED" | "AUTH_INVALID" | "AUTH_REVOKED" | "ACCOUNT_DISABLED" | "REAUTH_REQUIRED" | "ORIGIN_INVALID" | "HOST_INVALID" | "PAYLOAD_INVALID" | "UNKNOWN";
export class VelocitySessionError extends Error { constructor(readonly code: VelocitySessionErrorCode, message: string) { super(message); this.name = "VelocitySessionError"; } }
type TokenSource = Readonly<{ getIdToken(forceRefresh: true): Promise<string> }>;
type Request = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const MESSAGES: Readonly<Record<VelocitySessionErrorCode, string>> = Object.freeze({
  NETWORK: "Unable to start a secure session. Check your connection and try again.", AUTH_REQUIRED: "Sign-in is required to continue.", AUTH_INVALID: "Your sign-in could not be verified. Please sign in again.", AUTH_REVOKED: "Your sign-in is no longer valid. Please sign in again.", ACCOUNT_DISABLED: "This account is unavailable. Contact your administrator.", REAUTH_REQUIRED: "Please sign in again to continue.", ORIGIN_INVALID: "The secure session request was rejected. Please reload and try again.", HOST_INVALID: "The secure session request was rejected. Please reload and try again.", PAYLOAD_INVALID: "The secure session request was rejected. Please try again.", UNKNOWN: "Unable to start a secure session. Please try again.",
});
let exchangeInFlight: Promise<void> | null = null;
let clearInFlight: Promise<void> | null = null;
function supportedCode(value: unknown): VelocitySessionErrorCode { return typeof value === "string" && value in MESSAGES ? value as VelocitySessionErrorCode : "UNKNOWN"; }
async function responseCode(response: Response): Promise<VelocitySessionErrorCode> { try { const body: unknown = await response.json(); if (body && typeof body === "object" && "error" in body) { const error = (body as { error?: unknown }).error; if (error && typeof error === "object" && "code" in error) return supportedCode((error as { code?: unknown }).code); } } catch {} return "UNKNOWN"; }
export function sessionErrorMessage(error: unknown): string { return error instanceof VelocitySessionError ? error.message : MESSAGES.UNKNOWN; }

export function exchangeSession(user: TokenSource, request: Request = fetch): Promise<void> {
  if (exchangeInFlight) return exchangeInFlight;
  exchangeInFlight = (async () => {
    let idToken: string;
    try { idToken = await user.getIdToken(true); } catch { throw new VelocitySessionError("AUTH_INVALID", MESSAGES.AUTH_INVALID); }
    let response: Response;
    try { response = await request("/api/auth/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ idToken }), cache: "no-store", credentials: "same-origin" }); }
    catch { throw new VelocitySessionError("NETWORK", MESSAGES.NETWORK); }
    finally { idToken = ""; }
    if (!response.ok) { const code = await responseCode(response); throw new VelocitySessionError(code, MESSAGES[code]); }
  })().finally(() => { exchangeInFlight = null; });
  return exchangeInFlight;
}

export function clearSession(firebaseSignOut: () => Promise<void>, request: Request = fetch): Promise<void> {
  if (clearInFlight) return clearInFlight;
  clearInFlight = (async () => {
    const results = await Promise.allSettled([request("/api/auth/logout", { method: "POST", cache: "no-store", credentials: "same-origin" }), firebaseSignOut()]);
    if (!(results[0].status === "fulfilled" && results[0].value.ok) || results[1].status !== "fulfilled") throw new VelocitySessionError("UNKNOWN", "Sign-out completed with limited confirmation.");
  })().finally(() => { clearInFlight = null; });
  return clearInFlight;
}
