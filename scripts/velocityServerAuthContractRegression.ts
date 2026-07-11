import fs from "fs";
import path from "path";
import { classifyUserCredential, createStableServerAuthError, parseServerAuthContext } from "../lib/contracts/serverAuth";
import { serverAuthFixtures as f } from "../lib/contracts/serverAuthFixtures";

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const cases: Array<readonly [string, () => void]> = [];
const test = (name: string, run: () => void) => cases.push([name, run] as const);

test("all principal fixtures parse deterministically without mutation", () => {
  for (const fixture of [f.firebaseSessionUser, f.firebaseBearerUser, f.service, f.cron, f.webhook]) {
    const before = JSON.stringify(fixture); const a = parseServerAuthContext(clone(fixture)); const b = parseServerAuthContext(clone(fixture));
    assert(a.ok && b.ok && JSON.stringify(a.value) === JSON.stringify(b.value), "principal parsing is not deterministic");
    assert(JSON.stringify(fixture) === before && Object.isFrozen(a.value) && Object.isFrozen(a.value.principal), "principal parsing mutated input or returned mutable output");
  }
});
test("credential classification is deterministic and secret-free", () => {
  const expected = [[f.credentials.none, "none"], [f.credentials.cookie, "session_cookie"], [f.credentials.bearer, "firebase_id_token"], [f.credentials.conflict, "conflicting_user_credentials"], [f.credentials.unsupported, "unsupported_authorization"]] as const;
  for (const [input, kind] of expected) { const result = classifyUserCredential(input); assert(result.kind === kind, `wrong credential classification: ${kind}`); assert(!JSON.stringify(result).includes("synthetic"), "credential value leaked from classifier"); }
});
test("malformed contexts fail closed with PII-safe errors", () => {
  for (const fixture of [f.malformedUser, f.mismatchedMachineMethod, f.malformedTimestamp, f.malformedRequestId]) { const result = parseServerAuthContext(fixture); assert(!result.ok, "malformed context accepted"); assert(!JSON.stringify(result).includes("invalid/user") && !JSON.stringify(result).includes("synthetic"), "validation error leaked input"); }
});
test("stable error vocabulary maps status and never accepts caller messages", () => {
  const required = createStableServerAuthError("AUTH_REQUIRED", "req_synthetic_001"); const forbidden = createStableServerAuthError("FORBIDDEN", "req_synthetic_001");
  assert(required.ok && required.value.status === 401 && required.value.message === "Authentication is required.", "AUTH_REQUIRED mapping changed");
  assert(forbidden.ok && forbidden.value.status === 403 && forbidden.value.message === "This action is not permitted.", "FORBIDDEN mapping changed");
  assert(!createStableServerAuthError("CALLER_SUPPLIED", "req_synthetic_001").ok, "arbitrary error accepted");
});
test("server boundary is marked server-only and performs no verification", () => {
  const boundary = fs.readFileSync("lib/server/auth/serverAuthBoundary.ts", "utf8");
  assert(boundary.includes('import "server-only"'), "server-only marker missing");
  assert(!/firebase-admin|verifyIdToken|verifySessionCookie|cookie\s*\(/.test(boundary), "Slice 01 boundary performs authentication");
});
test("no production file imports server-auth contracts or boundary", () => {
  const roots = ["app", "components", "middleware.ts", "lib/firebase.ts", "lib/firebase-admin.ts"];
  const files: string[] = [];
  for (const root of roots) { if (!fs.existsSync(root)) continue; const stat = fs.statSync(root); if (stat.isFile()) files.push(root); else for (const entry of fs.readdirSync(root, { recursive: true })) { const target = path.join(root, String(entry)); if (fs.statSync(target).isFile() && /\.(ts|tsx|js|jsx)$/.test(target)) files.push(target); } }
  const approved = new Set([path.normalize("app/api/auth/session/route.ts"), path.normalize("app/api/auth/logout/route.ts")]);
  assert(files.every((file) => approved.has(path.normalize(file)) || !/serverAuth|server-auth-contract|serverAuthBoundary/.test(fs.readFileSync(file, "utf8"))), "unapproved production file imports Slice 01 server auth");
});

let passed = 0; const failures: string[] = [];
for (const [name, run] of cases) { try { run(); passed++; console.log(`PASS: ${name}`); } catch (error: any) { failures.push(`${name}: ${error?.message || String(error)}`); console.error(`FAIL: ${name}`); } }
console.log(`\nServer authentication contract regression result: ${passed}/${cases.length} passed`);
if (failures.length) { failures.forEach((failure) => console.log(`- ${failure}`)); process.exitCode = 1; }
