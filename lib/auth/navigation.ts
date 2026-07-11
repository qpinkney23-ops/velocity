import type { ServerAuthContextV1 } from "../contracts/serverAuth";

export const PROTECTED_NAVIGATION_ROOTS = Object.freeze([
  "/dashboard", "/applications", "/borrowers", "/queue", "/underwriters", "/settings", "/admin", "/upload", "/firebase-test", "/debug",
] as const);

export const VELOCITY_SESSION_COOKIE_MAX_LENGTH = 4096;

export function isProtectedNavigationPath(pathname: string): boolean {
  return PROTECTED_NAVIGATION_ROOTS.some((root) => pathname === root || pathname.startsWith(`${root}/`));
}

export function hasSafeSessionCookieShape(value: unknown): value is string {
  return typeof value === "string" && value.length >= 20 && value.length <= VELOCITY_SESSION_COOKIE_MAX_LENGTH && /^[A-Za-z0-9._~-]+$/.test(value);
}

export function safeNextDestination(value: unknown, fallback = "/dashboard"): string {
  if (typeof value !== "string" || !value || value.length > 2048 || /[\u0000-\u001f\u007f]/.test(value)) return fallback;
  let candidate: string;
  try { candidate = decodeURIComponent(value); } catch { return fallback; }
  if (!candidate.startsWith("/") || candidate.startsWith("//") || candidate.includes("\\") || /[\u0000-\u001f\u007f]/.test(candidate)) return fallback;
  let parsed: URL;
  try { parsed = new URL(candidate, "https://velocity.invalid"); } catch { return fallback; }
  if (parsed.origin !== "https://velocity.invalid" || parsed.pathname === "/auth" || parsed.pathname.startsWith("/auth/")) return fallback;
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

type NavigationVerification = Readonly<{ ok: true; context: ServerAuthContextV1 }> | Readonly<{ ok: false; error?: unknown }>;
export async function verifyProtectedNavigationSession(cookieValue: unknown, verify: (cookie: string) => Promise<NavigationVerification>): Promise<Readonly<{ ok: true; context: ServerAuthContextV1 }> | Readonly<{ ok: false }>> {
  if (!hasSafeSessionCookieShape(cookieValue)) return Object.freeze({ ok: false });
  try { const result = await verify(cookieValue); return result.ok ? Object.freeze({ ok: true, context: result.context }) : Object.freeze({ ok: false }); }
  catch { return Object.freeze({ ok: false }); }
}
