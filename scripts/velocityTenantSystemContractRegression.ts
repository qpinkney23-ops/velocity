import fs from "fs";
import path from "path";
import {
  createAuthorizationContext, createBranchReference, createTeamReference,
  parseLegacyOwnership, parseTenant, parseTenantMembership,
  tenantAuthorizationCaseFixtures, tenantSystemFixtures, validateBranchId, validateTeamId,
  type BranchId, type TeamId, type TenantId, type UserId,
} from "../lib/contracts";

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
function tenant(name: "activeTenant" | "suspendedTenant" | "unknownTenantStatus") { const result = parseTenant(tenantSystemFixtures[name]); assert(result.ok, `${name} parses`); return result.value; }
function membership(name: "activeOwnerMembership" | "activeProcessorMembership" | "invitedMembership" | "suspendedMembership" | "disabledMembership" | "unknownMembershipStatus" | "unknownRole" | "serviceAccountMembership") { const result = parseTenantMembership(tenantSystemFixtures[name]); assert(result.ok, `${name} parses`); return result.value; }

function tenantsDeterministic() {
  for (const name of ["activeTenant", "suspendedTenant", "unknownTenantStatus"] as const) {
    const fixture = tenantSystemFixtures[name]; const before = JSON.stringify(fixture);
    assert(JSON.stringify(tenant(name)) === JSON.stringify(tenant(name)), `${name} deterministic`);
    assert(JSON.stringify(fixture) === before, `${name} unchanged`); assert(Object.isFrozen(tenant(name)), `${name} output frozen`);
  }
  assert(tenant("unknownTenantStatus").status === "unknown", "unknown tenant status is conservative");
}

function membershipsDeterministic() {
  for (const name of ["activeOwnerMembership", "activeProcessorMembership", "invitedMembership", "suspendedMembership", "disabledMembership", "unknownMembershipStatus", "unknownRole", "serviceAccountMembership"] as const) {
    const fixture = tenantSystemFixtures[name]; const before = JSON.stringify(fixture);
    assert(JSON.stringify(membership(name)) === JSON.stringify(membership(name)), `${name} deterministic`);
    assert(JSON.stringify(fixture) === before, `${name} unchanged`); assert(Object.isFrozen(membership(name)), `${name} output frozen`);
  }
  assert(membership("unknownMembershipStatus").membershipStatus === "unknown", "unknown membership status is conservative");
  assert(membership("unknownRole").role === "unknown", "unknown role has no authority identity");
  assert(membership("serviceAccountMembership").role === "service_account", "service account role retained without permissions");
}

function authorizationRules() {
  const activeTenant = tenant("activeTenant"); const owner = membership("activeOwnerMembership");
  const valid = createAuthorizationContext({ authenticatedUserId: tenantAuthorizationCaseFixtures.validAuthorizationContext.authenticatedUserId, tenant: activeTenant, membership: owner, authenticationSource: "firebase_auth", authorizationSource: "tenant_membership", evaluatedAt: tenantSystemFixtures.authorizationShape.evaluatedAt });
  assert(valid.ok && valid.value.role === "owner", "valid active authorization context"); assert(Object.isFrozen(valid.value), "authorization context frozen");
  const attempts = [
    createAuthorizationContext({ authenticatedUserId: tenantAuthorizationCaseFixtures.missingTenant.authenticatedUserId, membership: owner, authenticationSource: "firebase_auth", authorizationSource: "tenant_membership", evaluatedAt: tenantSystemFixtures.authorizationShape.evaluatedAt }),
    createAuthorizationContext({ authenticatedUserId: tenantAuthorizationCaseFixtures.missingMembership.authenticatedUserId, tenant: activeTenant, authenticationSource: "firebase_auth", authorizationSource: "tenant_membership", evaluatedAt: tenantSystemFixtures.authorizationShape.evaluatedAt }),
    ...(["invitedMembership", "suspendedMembership", "disabledMembership", "unknownMembershipStatus", "unknownRole"] as const).map((name) => createAuthorizationContext({ authenticatedUserId: membership(name).userId, tenant: activeTenant, membership: membership(name), authenticationSource: "firebase_auth", authorizationSource: "tenant_membership", evaluatedAt: tenantSystemFixtures.authorizationShape.evaluatedAt })),
    createAuthorizationContext({ authenticatedUserId: owner.userId, tenant: tenant("suspendedTenant"), membership: owner, authenticationSource: "firebase_auth", authorizationSource: "tenant_membership", evaluatedAt: tenantSystemFixtures.authorizationShape.evaluatedAt }),
    createAuthorizationContext({ authenticatedUserId: "", tenant: activeTenant, membership: owner, authenticationSource: "firebase_auth", authorizationSource: "tenant_membership", evaluatedAt: tenantSystemFixtures.authorizationShape.evaluatedAt }),
  ];
  assert(attempts.every((attempt) => !attempt.ok && attempt.code === "inactive_authorization"), "missing/inactive/unknown authorization fails closed");
}

function identifiersAndReferences() {
  const branch = validateBranchId("branch_fixture-001"); const team = validateTeamId("team_fixture-001"); assert(branch.ok && team.ok, "dedicated branch/team IDs");
  const branchId: BranchId = branch.value; const teamId: TeamId = team.value; void branchId; void teamId;
  // @ts-expect-error BranchId and TeamId are distinct.
  const invalidTeam: TeamId = branch.value; void invalidTeam;
  const owner = membership("activeOwnerMembership"); const tenantId: TenantId = owner.tenantId; const userId: UserId = owner.userId; void tenantId; void userId;
  // @ts-expect-error TenantId and UserId remain distinct.
  const invalidUser: UserId = owner.tenantId; void invalidUser;
  const branchRef = createBranchReference(tenantSystemFixtures.branchReference.branchId, tenantSystemFixtures.branchReference.displayName);
  const teamRef = createTeamReference(tenantSystemFixtures.teamReference.teamId, tenantSystemFixtures.teamReference.displayName);
  assert(branchRef.ok && teamRef.ok && !("tenantId" in branchRef.value) && !("tenantId" in teamRef.value), "references do not imply tenant ownership");
}

function legacyOwnershipRules() {
  const unresolved = parseLegacyOwnership(tenantSystemFixtures.unresolvedLegacyOwnership); const pending = parseLegacyOwnership(tenantSystemFixtures.migrationPendingOwnership);
  assert(unresolved.ok && unresolved.value.state === "unresolved_legacy" && unresolved.value.tenantId === undefined, "legacy ownership remains unresolved");
  assert(pending.ok && pending.value.state === "migration_pending" && pending.value.tenantId === undefined, "pending ownership has no invented tenant");
  const forged = parseLegacyOwnership({ ...tenantSystemFixtures.unresolvedLegacyOwnership, tenantId: "tenant_fixture-001" }); assert(!forged.ok, "unresolved ownership cannot carry tenant ID");
}

function malformedInputsAreSafe() {
  const results = [parseTenant(tenantSystemFixtures.malformedTenantId), parseTenantMembership(tenantSystemFixtures.malformedUserIdMembership), parseTenant(tenantSystemFixtures.malformedTimestampTenant)];
  assert(results.every((result) => !result.ok), "malformed IDs and timestamps rejected");
  const errors = results.map((result) => result.ok ? "" : result.message).join(" ");
  assert(!errors.includes("Fixture Person") && !errors.includes("example.invalid"), "errors do not echo PII");
  const source = fs.readFileSync("lib/contracts/tenantSystem.ts", "utf8");
  assert(!/Date\.now\(|new Date\(|randomUUID\(|Math\.random\(/.test(source), "contracts invent no identity or time");
}

const TENANT_IMPORT_POLICY_VERSION = "sec-002-tenant-import-policy.v1";
const APPROVED_TENANT_CONSUMERS = Object.freeze([
  "lib/server/authorization/applicationAuthorizationOrchestratorCore.ts",
  "lib/server/authorization/applicationDocumentAuthorizationOrchestratorCore.ts",
  "lib/server/authorization/authorizationDecisionCore.ts",
  "lib/server/authorization/permissionPolicy.ts",
  "lib/server/authorization/tenantAuthorizationResolverCore.ts",
] as const);
const TENANT_CONTRACT_BINDINGS = new Set(["TenantV1", "TenantMembershipV1", "TenantRole", "AuthorizationContextV1", "AnyAuthorizationContextV1", "createAuthorizationContext", "parseTenant", "parseTenantMembership", "parseLegacyOwnership"]);
type SourceRecord = Readonly<{ file: string; source: string }>;

function staticImports(source: string) {
  const imports: Array<Readonly<{ specifier: string; bindings: readonly string[] }>> = [];
  const expression = /import\s+(?:type\s+)?([\s\S]*?)\s+from\s+["']([^"']+)["']/g;
  for (const match of source.matchAll(expression)) {
    const named = match[1].match(/\{([\s\S]*?)\}/)?.[1] ?? "";
    const bindings = named.split(",").map(value => value.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0]).filter(Boolean);
    imports.push(Object.freeze({ specifier: match[2], bindings: Object.freeze(bindings) }));
  }
  return Object.freeze(imports);
}

function tenantImportViolations(records: readonly SourceRecord[]) {
  const approved = new Set<string>(APPROVED_TENANT_CONSUMERS);
  return records.flatMap(record => {
    const consumesTenantAuthority = staticImports(record.source).some(entry =>
      /(?:^|\/)contracts(?:\/tenantSystem|\/authorization)?$/.test(entry.specifier) && entry.bindings.some(binding => TENANT_CONTRACT_BINDINGS.has(binding))
    );
    return consumesTenantAuthority && !approved.has(record.file.replace(/\\/g, "/")) ? [record.file.replace(/\\/g, "/")] : [];
  });
}

function noProductionImports() {
  const records: SourceRecord[] = [];
  const visit = (relative: string) => { for (const entry of fs.readdirSync(relative, { withFileTypes: true })) { const child = path.join(relative, entry.name); if (entry.isDirectory()) { if (child.replace(/\\/g, "/") !== "lib/contracts") visit(child); } else if (/\.(ts|tsx)$/.test(entry.name)) records.push({ file: child.replace(/\\/g, "/"), source: fs.readFileSync(child, "utf8") }); } };
  ["app", "components", "lib"].forEach(visit);
  const actualViolations = tenantImportViolations(records); assert(actualViolations.length === 0, `${TENANT_IMPORT_POLICY_VERSION} unapproved tenant-contract imports: ${actualViolations.join(", ")}`);
  const approvedRecords = APPROVED_TENANT_CONSUMERS.map(file => ({ file, source: fs.readFileSync(file, "utf8") }));
  assert(approvedRecords.every(record => staticImports(record.source).some(entry => entry.bindings.some(binding => TENANT_CONTRACT_BINDINGS.has(binding)))), "all approved consumers retain an explicit tenant-authority import");
  assert(tenantImportViolations(approvedRecords).length === 0, "five versioned authorization cores are approved");
  const negativeControls = [
    { file: "components/SyntheticClient.tsx", source: '"use client"; import type { TenantRole } from "../lib/contracts/tenantSystem";' },
    { file: "app/synthetic/page.tsx", source: 'import type { AuthorizationContextV1 } from "../../lib/contracts/authorization";' },
    { file: "app/api/unrelated/route.ts", source: 'import { parseTenantMembership } from "../../../lib/contracts/tenantSystem";' },
    { file: "lib/server/unapprovedTenantConsumer.ts", source: 'import type { TenantV1 } from "../contracts/tenantSystem";' },
  ];
  assert(tenantImportViolations(negativeControls).sort().join("|") === negativeControls.map(control => control.file).sort().join("|"), "client, page, unrelated API, and unapproved server controls are rejected");
}

const tests = [
  ["tenant fixtures validate deterministically", tenantsDeterministic], ["membership fixtures validate deterministically", membershipsDeterministic],
  ["authorization context fails closed", authorizationRules], ["dedicated identifiers and optional references", identifiersAndReferences],
  ["legacy ownership never migrates implicitly", legacyOwnershipRules], ["malformed inputs fail safely", malformedInputsAreSafe],
  ["only versioned approved production modules import tenant authority contracts", noProductionImports],
] as const;
let passed = 0; const failures: string[] = [];
for (const [name, test] of tests) { try { test(); passed++; console.log(`PASS: ${name}`); } catch (error: any) { const message = error?.message || String(error); failures.push(`${name}: ${message}`); console.error(`FAIL: ${name}\n  ${message}`); } }
console.log(`\nTenant system contract regression result: ${passed}/${tests.length} passed`);
if (failures.length) { failures.forEach((failure) => console.log(`- ${failure}`)); process.exitCode = 1; }
