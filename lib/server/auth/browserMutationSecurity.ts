export type BrowserMutationValidation = Readonly<{ ok: true }> | Readonly<{ ok: false; code: "ORIGIN_INVALID" | "HOST_INVALID" | "INTERNAL_ERROR" }>;

export function validateBrowserMutationSource(input: Readonly<{ origin: string | null; host: string | null; forwardedHost: string | null; trustedOrigin: string; trustForwardedHost: boolean }>): BrowserMutationValidation {
  let approved: URL; try { approved = new URL(input.trustedOrigin); } catch { return Object.freeze({ ok: false, code: "INTERNAL_ERROR" }); }
  if (!input.origin) return Object.freeze({ ok: false, code: "ORIGIN_INVALID" });
  let origin: URL; try { origin = new URL(input.origin); } catch { return Object.freeze({ ok: false, code: "ORIGIN_INVALID" }); }
  if (origin.origin !== approved.origin) return Object.freeze({ ok: false, code: "ORIGIN_INVALID" });
  const effectiveHost = input.trustForwardedHost ? input.forwardedHost : input.host;
  if (!effectiveHost || effectiveHost.toLowerCase() !== approved.host.toLowerCase()) return Object.freeze({ ok: false, code: "HOST_INVALID" });
  return Object.freeze({ ok: true });
}

/** Reusable future CSRF check; no existing business API uses it in this slice. */
export function validateDoubleSubmitCsrf(input: Readonly<{ cookieToken?: unknown; headerToken?: unknown }>): boolean {
  return typeof input.cookieToken === "string" && input.cookieToken.length >= 32 && input.cookieToken.length <= 128 && input.cookieToken === input.headerToken && /^[A-Za-z0-9._~-]+$/.test(input.cookieToken);
}
