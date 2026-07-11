import fs from "fs";
import path from "path";
import { SERVER_AUTH_CONTEXT_SCHEMA_VERSION, createStableServerAuthError, parseServerAuthContext, type CorrelationId, type ServerAuthContextV1 } from "../lib/contracts/serverAuth";
import { authenticateUserApiRequest, type UserApiAuthDependencies } from "../lib/server/auth/userApiAuthCore";
import { defineUserApiRoutePolicy } from "../lib/server/auth/userApiAuthPolicy";

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
const csrf = "c".repeat(32);
function request(input: Record<string, string> = {}, method = "POST") { const values = new Map(Object.entries(input).map(([k, v]) => [k.toLowerCase(), v])); return { method, headers: { get: (name: string) => values.get(name.toLowerCase()) ?? null } }; }
function context(method: "session_cookie" | "firebase_id_token" = "session_cookie", correlationId = "corr_generated") { const parsed = parseServerAuthContext({ schemaVersion: SERVER_AUTH_CONTEXT_SCHEMA_VERSION, principal: { kind: "firebase_user", uid: "synthetic_api_user", authenticationMethod: method, tokenIssuedAt: "2026-07-11T20:00:00.000Z", authenticatedAt: "2026-07-11T20:00:00.000Z", emailVerified: true }, verifiedAt: "2026-07-11T20:01:00.000Z", revocationCheckedAt: "2026-07-11T20:01:00.000Z", requestId: "req_api_test", correlationId }); assert(parsed.ok, "user fixture invalid"); return parsed.value; }
const basePolicy = defineUserApiRoutePolicy({ routeId: "test.user.command", allowedPrincipalKind: "firebase_user", allowSessionCookie: true, allowFirebaseBearer: false, requireAuthorizationContext: false, allowedMethods: ["POST"], bodySizeLimit: 1024, csrfMode: "double-submit", originPolicy: "same-origin", auditAction: "test.user.command", productionEnabled: true, trustIncomingCorrelationId: false });
function dependencies(verify?: UserApiAuthDependencies["verify"]): UserApiAuthDependencies { return { verify: verify || (async (input) => ({ ok: true, context: context(input.classification.kind === "firebase_id_token" ? "firebase_id_token" : "session_cookie", input.trustedCorrelationCaller && input.inboundCorrelationId === "corr_trusted" ? "corr_trusted" : "corr_generated") })), ids: (inbound, trusted) => ({ requestId: "req_boundary_test" as any, correlationId: (trusted && inbound === "corr_trusted" ? "corr_trusted" : "corr_boundary_generated") as any }), trustedOrigin: "https://velocity.example.test", production: false, trustForwardedHost: false }; }
const cookieHeaders = { cookie: `velocity_session=${"s".repeat(64)}; velocity_csrf=${csrf}`, origin: "https://velocity.example.test", host: "velocity.example.test", "x-velocity-csrf": csrf };

async function main() {
  const valid = await authenticateUserApiRequest(request(cookieHeaders), basePolicy, dependencies()); assert(valid.ok && valid.context.principal.kind === "firebase_user" && valid.context.principal.authenticationMethod === "session_cookie", "valid session cookie rejected");
  const bearerPolicy = defineUserApiRoutePolicy({ ...basePolicy, allowSessionCookie: false, allowFirebaseBearer: true, csrfMode: "none", originPolicy: "none" });
  const bearer = await authenticateUserApiRequest(request({ authorization: "Bearer synthetic-token" }), bearerPolicy, dependencies()); assert(bearer.ok && bearer.context.principal.kind === "firebase_user" && bearer.context.principal.authenticationMethod === "firebase_id_token", "explicit bearer rejected");
  assert(!(await authenticateUserApiRequest(request({ authorization: "Bearer synthetic-token" }), basePolicy, dependencies())).ok, "disallowed bearer accepted");
  assert(!(await authenticateUserApiRequest(request({ ...cookieHeaders, authorization: "Bearer synthetic-token" }), basePolicy, dependencies())).ok, "conflicting credentials accepted");
  assert(!(await authenticateUserApiRequest(request({ origin: cookieHeaders.origin, host: cookieHeaders.host }), basePolicy, dependencies())).ok, "missing credentials accepted");
  assert(!(await authenticateUserApiRequest(request({ ...cookieHeaders, authorization: "Basic secret" }), basePolicy, dependencies())).ok, "malformed credential accepted");

  for (const code of ["AUTH_REVOKED", "ACCOUNT_DISABLED", "AUTH_INVALID"] as const) { const built = createStableServerAuthError(code, "req_api_test"); assert(built.ok, "error fixture invalid"); const result = await authenticateUserApiRequest(request(cookieHeaders), basePolicy, dependencies(async () => ({ ok: false, error: built.value }))); assert(!result.ok && result.error.code === code, `${code} not preserved`); }
  const serviceContext = { ...context(), principal: { kind: "service", principalId: "synthetic_service", authenticationMethod: "service_credential" } } as unknown as ServerAuthContextV1;
  assert(!(await authenticateUserApiRequest(request(cookieHeaders), basePolicy, dependencies(async () => ({ ok: true, context: serviceContext })))).ok, "unsupported principal accepted");
  assert(!(await authenticateUserApiRequest(request(cookieHeaders), undefined, dependencies())).ok, "missing policy accepted");
  assert(!(await authenticateUserApiRequest(request(cookieHeaders), { ...basePolicy, allowSessionCookie: false, allowFirebaseBearer: false }, dependencies())).ok, "contradictory policy accepted");
  assert((await authenticateUserApiRequest(request(cookieHeaders, "GET"), basePolicy, dependencies())).state === "authentication_failed", "wrong method accepted");
  assert((await authenticateUserApiRequest(request({ ...cookieHeaders, origin: "" }), basePolicy, dependencies())).state === "authentication_failed", "missing origin accepted");
  assert((await authenticateUserApiRequest(request({ ...cookieHeaders, origin: "https://attacker.test" }), basePolicy, dependencies())).state === "authentication_failed", "invalid origin accepted");
  assert((await authenticateUserApiRequest(request({ ...cookieHeaders, "x-velocity-csrf": "wrong" }), basePolicy, dependencies())).state === "authentication_failed", "invalid CSRF accepted");
  let handlerRuns = 0; const oversized = await authenticateUserApiRequest(request({ ...cookieHeaders, "content-length": "1025" }), basePolicy, dependencies()); if (oversized.ok) handlerRuns += 1; assert(!oversized.ok && oversized.error.code === "PAYLOAD_TOO_LARGE" && handlerRuns === 0, "oversized request reached handler");

  const trustedPolicy = defineUserApiRoutePolicy({ ...basePolicy, trustIncomingCorrelationId: true });
  const trusted = await authenticateUserApiRequest(request({ ...cookieHeaders, "x-correlation-id": "corr_trusted" }), trustedPolicy, dependencies()); assert(trusted.ok && trusted.context.correlationId === "corr_trusted" as CorrelationId, "trusted correlation not propagated");
  const untrusted = await authenticateUserApiRequest(request({ ...cookieHeaders, "x-correlation-id": "corr_attacker" }), basePolicy, dependencies()); assert(untrusted.ok && untrusted.context.correlationId !== "corr_attacker", "untrusted correlation selected by caller");
  const authorizationPolicy = defineUserApiRoutePolicy({ ...basePolicy, requireAuthorizationContext: true }); const unresolved = await authenticateUserApiRequest(request(cookieHeaders), authorizationPolicy, dependencies()); assert(!unresolved.ok && unresolved.state === "authorization_required" && unresolved.authorization.status === "not_resolved" && unresolved.error.code === "AUTHORIZATION_REQUIRED", "authentication incorrectly satisfied authorization");

  for (const file of ["lib/server/auth/userApiAuth.ts", "lib/server/auth/userApiAuthCore.ts", "lib/server/auth/userApiAuthPolicy.ts"]) { const source = fs.readFileSync(file, "utf8"); assert(!/console\.|error\.message|error\.stack/.test(source), `${file} exposes internal errors`); }
  const productionRoutes = [...fs.readdirSync("app/api", { recursive: true })].map(String).filter((entry) => /route\.ts$/.test(entry)); for (const entry of productionRoutes) { const source = fs.readFileSync(path.join("app/api", entry), "utf8"); assert(!/userApiAuth|requireAuthenticatedUserRequest/.test(source), `production route migrated: ${entry}`); }
  const guard = fs.readFileSync("lib/server/auth/userApiAuth.ts", "utf8"); assert(guard.includes('import "server-only"'), "canonical API guard is not server-only");
  const publicErrors = [oversized, unresolved].map((result) => JSON.stringify(result.error)); assert(publicErrors.every((text) => !/synthetic_api_user|synthetic-token|velocity_session|Firebase|stack/i.test(text)), "public error exposed sensitive data");
  console.log("User API authentication boundary regression: PASS");
  console.log("PASS: policy, cookie/bearer precedence, verifier failures, origin/CSRF/size, correlation, authorization handoff and production isolation");
}
main().catch((error) => { console.error(error?.message || String(error)); process.exitCode = 1; });
