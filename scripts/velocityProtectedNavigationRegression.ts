import fs from "fs";
import path from "path";
import { SERVER_AUTH_CONTEXT_SCHEMA_VERSION, parseServerAuthContext, type ServerAuthErrorCode } from "../lib/contracts/serverAuth";
import { hasSafeSessionCookieShape, isProtectedNavigationPath, PROTECTED_NAVIGATION_ROOTS, safeNextDestination, verifyProtectedNavigationSession } from "../lib/auth/navigation";

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
const parsed = parseServerAuthContext({ schemaVersion: SERVER_AUTH_CONTEXT_SCHEMA_VERSION, principal: { kind: "firebase_user", uid: "synthetic_navigation_user", authenticationMethod: "session_cookie", tokenIssuedAt: "2026-07-11T20:00:00.000Z", authenticatedAt: "2026-07-11T20:00:00.000Z", emailVerified: true }, verifiedAt: "2026-07-11T20:01:00.000Z", revocationCheckedAt: "2026-07-11T20:01:00.000Z", requestId: "req_navigation_test", correlationId: "corr_navigation_test" });
assert(parsed.ok, "navigation fixture invalid");
const context = parsed.value;
const failure = (code: ServerAuthErrorCode) => async () => ({ ok: false as const, error: { schemaVersion: "server-auth-error.v1", code, status: 401, message: "Access is unavailable.", requestId: "req_navigation_test" } as any });

async function main() {
  for (const root of PROTECTED_NAVIGATION_ROOTS) assert(isProtectedNavigationPath(root) && isProtectedNavigationPath(`${root}/child`), `${root} is not protected`);
  assert(!isProtectedNavigationPath("/") && !isProtectedNavigationPath("/auth/login") && !isProtectedNavigationPath("/api/applications/x"), "public or API path became navigation-protected");
  assert(hasSafeSessionCookieShape("a".repeat(20)) && !hasSafeSessionCookieShape("short") && !hasSafeSessionCookieShape(`valid.${"a".repeat(4096)}`), "middleware cookie shape policy changed");

  assert(safeNextDestination("/applications/abc?tab=docs") === "/applications/abc?tab=docs", "safe query destination lost");
  for (const attack of ["https://attacker.test/x", "//attacker.test/x", "%2F%2Fattacker.test/x", "/auth/login?next=/dashboard", "%68%74%74%70%73%3A%2F%2Fattacker.test"]) assert(safeNextDestination(attack) === "/dashboard", `unsafe next accepted: ${attack}`);
  assert(safeNextDestination("/applications\n/evil") === "/dashboard", "control-character next accepted");

  assert(!(await verifyProtectedNavigationSession("bad", async () => ({ ok: true, context }))).ok, "malformed cookie reached authoritative verifier");
  for (const code of ["AUTH_INVALID", "AUTH_REVOKED", "ACCOUNT_DISABLED", "INTERNAL_ERROR"] as const) assert(!(await verifyProtectedNavigationSession("a".repeat(20), failure(code))).ok, `${code} did not fail closed`);
  assert(!(await verifyProtectedNavigationSession("a".repeat(20), async () => { throw new Error("raw Firebase stack"); })).ok, "internal verifier exception escaped");
  const valid = await verifyProtectedNavigationSession("a".repeat(20), async () => ({ ok: true, context })); assert(valid.ok && valid.context === context, "valid verified session rejected or context replaced");

  const middleware = fs.readFileSync("middleware.ts", "utf8");
  assert(!/verifyVelocitySessionCookie|firebase-admin|uid|email|tenant|role/.test(middleware), "middleware claims identity verification or authorization");
  const boundary = fs.readFileSync("lib/server/auth/protectedNavigation.ts", "utf8");
  assert(boundary.includes('import "server-only"') && boundary.includes("noStore()") && boundary.includes("verifyVelocitySessionCookie"), "authoritative no-store server boundary missing");
  assert(!/console\.|sessionCookie\)|error\.message|error\.stack/.test(boundary), "protected boundary may expose sensitive verification data");
  const layoutRoots = PROTECTED_NAVIGATION_ROOTS.map((root) => path.join("app", root.slice(1), "layout.tsx"));
  for (const file of layoutRoots) assert(fs.readFileSync(file, "utf8").includes("ProtectedNavigationLayout"), `${file} lacks authoritative boundary`);
  const authGuard = fs.readFileSync("components/auth/AuthGuard.tsx", "utf8"); assert(authGuard.includes("onAuthStateChanged") && !authGuard.includes('if (ok && pathname.startsWith("/auth"))'), "AuthGuard compatibility creates an auth redirect loop");
  const businessRoutes = [...fs.readdirSync("app/api", { recursive: true })].map(String).filter((entry) => /route\.ts$/.test(entry) && !entry.startsWith(`auth${path.sep}`));
  for (const entry of businessRoutes) { const source = fs.readFileSync(path.join("app/api", entry), "utf8"); assert(!/protectedNavigation|verifyVelocitySessionCookie/.test(source), `business API migrated: ${entry}`); }
  assert(!/tenant|membership|permission|role/.test(boundary), "navigation boundary introduced authorization");
  console.log("Protected navigation regression: PASS");
  console.log("PASS: route inventory, early gate, authoritative verification, failure closure, safe next, no-store, AuthGuard and scope isolation");
}
main().catch((error) => { console.error(error?.message || String(error)); process.exitCode = 1; });
