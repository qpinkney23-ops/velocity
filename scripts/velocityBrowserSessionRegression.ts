import fs from "fs";
import path from "path";
import { SERVER_AUTH_CONTEXT_SCHEMA_VERSION, classifyUserCredential, parseServerAuthContext } from "../lib/contracts/serverAuth";
import { browserSessionCookieDeletionPolicy, browserSessionCookiePolicy, isRecentAuthentication, VELOCITY_AUTH_BODY_MAX_BYTES, VELOCITY_RECENT_AUTH_MAX_AGE_SECONDS, VELOCITY_SESSION_MAX_AGE_SECONDS } from "../lib/server/auth/browserSessionPolicy";
import { validateBrowserMutationSource, validateDoubleSubmitCsrf } from "../lib/server/auth/browserMutationSecurity";
import { exchangeSession, parseSessionExchangePayload } from "../lib/server/auth/sessionEndpointService";
import { verifyFirebaseUserCredential } from "../lib/server/auth/firebaseAuthVerifierCore";

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
const now = new Date("2026-07-11T18:30:00.000Z");
const context = (method: "firebase_id_token" | "session_cookie" = "firebase_id_token", authenticatedAt = "2026-07-11T18:27:00.000Z") => { const parsed = parseServerAuthContext({ schemaVersion: SERVER_AUTH_CONTEXT_SCHEMA_VERSION, principal: { kind: "firebase_user", uid: "user_session_test", authenticationMethod: method, tokenIssuedAt: "2026-07-11T18:26:00.000Z", authenticatedAt, emailVerified: true }, verifiedAt: now.toISOString(), revocationCheckedAt: now.toISOString(), requestId: "req_session_test", correlationId: "corr_session_test" }); assert(parsed.ok, "fixture context invalid"); return parsed.value; };
const successVerifier = async () => ({ ok: true as const, context: context() });
const failureVerifier = (code: "AUTH_REVOKED" | "ACCOUNT_DISABLED" | "AUTH_INVALID") => async () => ({ ok: false as const, error: { schemaVersion: "server-auth-error.v1" as any, code, status: code === "ACCOUNT_DISABLED" ? 403 as const : 401 as const, message: "Access is unavailable.", requestId: "req_session_test" as any } });
const payload = { idToken: "synthetic-id-token", authorizationHeader: "Bearer synthetic-id-token" };

async function main() {
  assert(VELOCITY_SESSION_MAX_AGE_SECONDS === 43200 && VELOCITY_RECENT_AUTH_MAX_AGE_SECONDS === 300, "session/recent-auth policy changed");
  const dev = browserSessionCookiePolicy(false), prod = browserSessionCookiePolicy(true), deleted = browserSessionCookieDeletionPolicy(true);
  assert(dev.name === "velocity_session" && !dev.secure && dev.httpOnly && dev.sameSite === "lax" && dev.path === "/" && dev.maxAge === 43200 && !("domain" in dev), "development cookie policy invalid");
  assert(prod.name === "__Host-velocity_session" && prod.secure && !("domain" in prod), "production host-only cookie policy invalid");
  assert(deleted.name === prod.name && deleted.path === prod.path && deleted.sameSite === prod.sameSite && deleted.secure === prod.secure && deleted.maxAge === 0, "deletion cookie policy mismatch");

  const goodSource = { origin: "https://velocity.example.test", host: "velocity.example.test", forwardedHost: "attacker.test", trustedOrigin: "https://velocity.example.test", trustForwardedHost: false };
  assert(validateBrowserMutationSource(goodSource).ok, "same origin rejected");
  assert(!validateBrowserMutationSource({ ...goodSource, origin: "https://attacker.test" }).ok, "mismatched origin accepted");
  assert(!validateBrowserMutationSource({ ...goodSource, host: "attacker.test" }).ok, "mismatched host accepted");
  assert(!validateBrowserMutationSource({ ...goodSource, trustForwardedHost: true }).ok, "untrusted forwarded host accepted");
  assert(validateDoubleSubmitCsrf({ cookieToken: "a".repeat(32), headerToken: "a".repeat(32) }) && !validateDoubleSubmitCsrf({ cookieToken: "a".repeat(32), headerToken: "b".repeat(32) }), "reusable CSRF helper invalid");

  const parsedBody = parseSessionExchangePayload(JSON.stringify({ idToken: payload.idToken }), null, "req_session_test"); assert(parsedBody.ok, "valid JSON body token rejected");
  assert(!parseSessionExchangePayload("{", null, "req_session_test").ok, "malformed JSON accepted");
  assert(!parseSessionExchangePayload(JSON.stringify({ idToken: "x".repeat(VELOCITY_AUTH_BODY_MAX_BYTES) }), null, "req_session_test").ok, "oversized JSON accepted");
  assert(!parseSessionExchangePayload(JSON.stringify({ idToken: payload.idToken, uid: "forged" }), null, "req_session_test").ok, "client UID accepted");
  assert(!parseSessionExchangePayload(JSON.stringify({ idToken: payload.idToken }), payload.authorizationHeader, "req_session_test").ok, "conflicting body/header accepted");
  assert(!parseSessionExchangePayload("{}", null, "req_session_test").ok, "missing token accepted");

  const exchanged = await exchangeSession(payload, "req_session_test", "corr_session_test", { verifyIdToken: successVerifier, createSessionCookie: async () => "synthetic-session-cookie-secret", now: () => new Date(now) });
  assert(exchanged.ok && exchanged.sessionCookie === "synthetic-session-cookie-secret", "valid exchange failed");
  const stale = await exchangeSession(payload, "req_session_test", "corr_session_test", { verifyIdToken: async () => ({ ok: true, context: context("firebase_id_token", "2026-07-11T18:24:59.000Z") }), createSessionCookie: async () => "never", now: () => new Date(now) }); assert(!stale.ok && stale.error.code === "REAUTH_REQUIRED", "stale authentication accepted");
  assert(isRecentAuthentication("2026-07-11T18:25:00.000Z", now) && !isRecentAuthentication("2026-07-11T18:24:59.000Z", now), "recent-auth boundary changed");
  for (const code of ["AUTH_REVOKED", "ACCOUNT_DISABLED", "AUTH_INVALID"] as const) { const result = await exchangeSession(payload, "req_session_test", "corr_session_test", { verifyIdToken: failureVerifier(code), createSessionCookie: async () => "never", now: () => new Date(now) }); assert(!result.ok && result.error.code === code, `${code} not preserved`); }

  const adapter = { verifyIdToken: async () => ({}), verifySessionCookie: async () => ({ uid: "user_session_test", issuedAtSeconds: 1783794300, authenticatedAtSeconds: 1783794120, emailVerified: true }), assertUserEnabled: async () => undefined };
  const verifiedCookie = await verifyFirebaseUserCredential({ classification: classifyUserCredential({ sessionCookie: "synthetic-session-cookie-secret" }), sessionCookie: "synthetic-session-cookie-secret", trustedCorrelationCaller: false }, { adapter, now: () => new Date(now), generateOpaqueId: () => "sessionopaque001" });
  assert(verifiedCookie.ok && verifiedCookie.context.principal.kind === "firebase_user" && verifiedCookie.context.principal.authenticationMethod === "session_cookie", "session-cookie verification context invalid");

  for (const route of ["app/api/auth/session/route.ts", "app/api/auth/logout/route.ts"]) { const source = fs.readFileSync(route, "utf8"); assert(!/console\.|email|tenantId|role|authority/.test(source), `${route} exposes or trusts sensitive identity`); assert(!source.includes("sessionCookie: result.sessionCookie"), "cookie emitted in JSON"); }
  const business = [...fs.readdirSync("app/api", { recursive: true })].map(String).filter((entry) => /route\.ts$/.test(entry) && !entry.startsWith(`auth${path.sep}`)); for (const entry of business) { const file = path.join("app/api", entry); assert(!/verifyVelocitySessionCookie|firebaseSessionCookie|sessionEndpointService/.test(fs.readFileSync(file, "utf8")), "business API migrated to session auth"); }
  const protectedRoots = ["app/dashboard", "app/applications", "app/borrowers", "app/admin", "middleware.ts"]; for (const root of protectedRoots) { if (!fs.existsSync(root)) continue; const files = fs.statSync(root).isFile() ? [root] : fs.readdirSync(root, { recursive: true }).map(String).map((entry) => path.join(root, entry)).filter((file) => fs.statSync(file).isFile()); for (const file of files) assert(!/verifyVelocitySessionCookie|firebaseSessionCookie/.test(fs.readFileSync(file, "utf8")), "protected production surface migrated"); }
  console.log("Browser session boundary regression: PASS");
  console.log("PASS: cookie/origin/host/CSRF/recent-auth/payload/logout isolation/session verification policies");
}
main().catch((error) => { console.error(error?.message || String(error)); process.exitCode = 1; });
