import fs from "fs";
import path from "path";
import { AUTHORIZATION_AUDIT_CLASSIFICATIONS, createAuthorizationAuditEvent, createAuthorizationCacheKey, parseAuthorizationAuditEvent } from "../lib/contracts/authorizationAudit";
import { authorizationAuditFixtures as f } from "../lib/contracts/authorizationAuditFixtures";
import { AUTHORIZATION_VERSION_INVALIDATION_MODEL, authorizationCachePolicy } from "../lib/server/authorization/authorizationCachePolicy";

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
function main() {
  for (const event of Object.values(f.events)) { const parsed = parseAuthorizationAuditEvent(event); assert(parsed.ok, `valid ${event.classification} event rejected`); }
  assert(!parseAuthorizationAuditEvent({}).ok && !parseAuthorizationAuditEvent(f.malformedEvent).ok, "malformed or PII event accepted");
  const builtAllow = createAuthorizationAuditEvent({ eventId: "event_built_allow", principalReference: "user_fixture", decision: f.decisions.allowed as any, membershipVersion: "membership.v1", tenantVersion: "tenant.v1", permissionVersion: "authorization-permissions.provisional.v1", resourceAuthorizationVersion: "application.v1", classification: "access_allowed" }); assert(builtAllow.ok && Object.isFrozen(builtAllow.value) && Object.isFrozen(builtAllow.value.constraintsEvaluated), "allow audit event invalid or mutable");
  const builtDeny = createAuthorizationAuditEvent({ eventId: "event_built_deny", principalReference: "user_fixture", decision: f.decisions.denied as any, membershipVersion: "membership.v1", tenantVersion: "tenant.v1", permissionVersion: "authorization-permissions.provisional.v1", classification: "permission_denied" }); assert(builtDeny.ok && builtDeny.value.denialReason === "permission_missing", "deny audit reason missing");
  assert(AUTHORIZATION_AUDIT_CLASSIFICATIONS.includes("policy_failure") && AUTHORIZATION_AUDIT_CLASSIFICATIONS.includes("security_event"), "security classifications incomplete");
  const base = createAuthorizationCacheKey(f.cacheInput as any); assert(base.ok, "base cache key invalid"); const repeat = createAuthorizationCacheKey({ ...f.cacheInput } as any); assert(repeat.ok && repeat.value.key === base.value.key, "cache key nondeterministic");
  for (const [field, value] of [["membershipVersion", "membership.v2"], ["tenantVersion", "tenant.v2"], ["permissionVersion", "permissions.v2"], ["policyVersion", "policy.v2"], ["resourceAuthorizationVersion", "application.v2"]] as const) { const changed = createAuthorizationCacheKey({ ...f.cacheInput, [field]: value } as any); assert(changed.ok && changed.value.key !== base.value.key, `${field} did not invalidate key`); }
  const serviceA = createAuthorizationCacheKey({ ...f.cacheInput, membershipVersion: undefined, serviceGrantVersion: "grant.v1" } as any), serviceB = createAuthorizationCacheKey({ ...f.cacheInput, membershipVersion: undefined, serviceGrantVersion: "grant.v2" } as any); assert(serviceA.ok && serviceB.ok && serviceA.value.key !== serviceB.value.key, "service grant version did not invalidate key");
  for (const action of ["decision.approve", "decision.override", "membership.manage", "billing.manage", "audit.export", "ownership.migrate", "permission.manage"] as const) assert(!authorizationCachePolicy({ action, decision: "allow", resourceStable: true }).allowed, `${action} became cacheable`);
  for (const action of ["application.read", "document.read", "membership.read"] as const) assert(authorizationCachePolicy({ action, decision: "allow", resourceStable: true }).allowed, `${action} stable read not cacheable`);
  assert(!authorizationCachePolicy({ action: "application.read", decision: "deny", resourceStable: true }).allowed && !authorizationCachePolicy({ action: "application.read", decision: "allow", resourceStable: false }).allowed, "deny or unstable result cacheable");
  assert(AUTHORIZATION_VERSION_INVALIDATION_MODEL.status === "provisional" && AUTHORIZATION_VERSION_INVALIDATION_MODEL.domains.length === 5, "version invalidation model changed");
  const before = JSON.stringify(f), result = createAuthorizationCacheKey(f.cacheInput as any); assert(result.ok && Object.isFrozen(result.value) && JSON.stringify(f) === before && Object.isFrozen(f), "inputs mutated or cache output mutable");
  for (const event of Object.values(f.events)) assert(!/borrower|email|loanAmount|credit|documentText|income|ssn/i.test(JSON.stringify(event)), "audit fixture contains PII");
  const production = ["app", "components", "middleware.ts"].flatMap((root) => !fs.existsSync(root) ? [] : fs.statSync(root).isFile() ? [root] : [...fs.readdirSync(root, { recursive: true })].map(String).map((entry) => path.join(root, entry)).filter((file) => fs.statSync(file).isFile() && /\.(ts|tsx)$/.test(file))); assert(production.every((file) => !/authorizationAudit|authorizationCachePolicy/.test(fs.readFileSync(file, "utf8"))), "production imports audit/cache slice");
  console.log("Authorization audit and cache policy regression: PASS");
  console.log("PASS: audit parsing/classification/PII exclusion, deterministic version invalidation, provisional cache policy, immutability and production isolation");
}
try { main(); } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
