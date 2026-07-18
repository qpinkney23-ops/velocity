import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { AUTHORIZATION_PERMISSION_VERSION, AUTHORIZATION_POLICY_VERSION } from "../lib/contracts/authorization";
import { authorizationCachePolicy, AUTHORIZATION_VERSION_INVALIDATION_MODEL } from "../lib/server/authorization/authorizationCachePolicy";
import { ROLE_PERMISSION_MATRIX } from "../lib/server/authorization/permissionPolicy";

const absent = [
  "app/api/ai-scan/route.ts", "app/api/ai/scan/route.ts", "app/api/debug/run/route.ts",
  "app/api/debug/overlay/from-storage/route.ts", "app/debug/page.tsx", "app/firebase-test/page.tsx",
  "app/upload/page.tsx", "lib/server/diagnostics/diagnosticWorkerRunCore.ts",
];
for (const file of absent) assert(!fs.existsSync(file), `${file} diagnostic surface remains`);

for (const file of ["app/api/cron/tick/route.ts", "app/api/worker/files/process/route.ts", "app/api/worker/ai/process/route.ts"]) {
  const source = fs.readFileSync(file, "utf8");
  assert(!/export\s+async\s+function\s+GET\s*\(/.test(source), `${file} exposes unauthenticated readiness GET`);
  assert(/export\s+async\s+function\s+POST\s*\(/.test(source), `${file} lost its authorized command handler`);
}

const routes = [...fs.readdirSync("app/api", { recursive: true })].map(String).filter((entry) => entry.endsWith("route.ts"));
for (const entry of routes) assert(!/(^|[\\/])(debug|firebase-test|upload|ai-scan)([\\/]|$)/i.test(entry), `diagnostic production route remains: ${entry}`);

assert.equal(AUTHORIZATION_POLICY_VERSION, "authorization-policy.v1");
assert.equal(AUTHORIZATION_PERMISSION_VERSION, "authorization-permissions.v1");
assert.equal(ROLE_PERMISSION_MATRIX.status, "locked_for_supported_sec_002_surfaces");
for (const role of ["owner", "admin", "underwriter", "loan_officer", "processor", "viewer", "service_account", "unknown"]) assert(role in ROLE_PERMISSION_MATRIX.roles, `role missing: ${role}`);
for (const action of ["application.read", "document.read", "decision.approve", "membership.manage", "audit.export"] as const) {
  const result = authorizationCachePolicy({ action, decision: "allow", resourceStable: true });
  assert.equal(result.allowed, false, `${action} authorization became cacheable`);
}
assert.equal(AUTHORIZATION_VERSION_INVALIDATION_MODEL.status, "not_deployed_authoritative_reads_required");

const middleware = fs.readFileSync(path.join("middleware.ts"), "utf8");
assert(!/firebase-test|\/debug|\/upload/.test(middleware), "diagnostic page remains in middleware matcher");
console.log("Authorization operations closeout regression: PASS");
console.log("PASS: diagnostics absent, command readiness closed, locked policy, complete role vocabulary, authoritative uncached authorization");
