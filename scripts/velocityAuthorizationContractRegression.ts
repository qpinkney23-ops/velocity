import fs from "fs";
import path from "path";
import { AUTHORIZATION_PERMISSIONS, parseAuthorizationContext, parseAuthorizationDecision } from "../lib/contracts/authorization";
import { authorizationFixtures as f } from "../lib/contracts/authorizationFixtures";
import { PROVISIONAL_ROLE_PERMISSION_MATRIX, evaluateAuthorization, permissionsForRole } from "../lib/server/authorization/permissionPolicy";

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
const tests: Array<readonly [string, () => void]> = [];
const test = (name: string, run: () => void) => tests.push([name, run]);
const evaluate = (context: unknown, policy: unknown, resource: unknown) => evaluateAuthorization({ context, policy, resource, evaluatedAt: f.evaluatedAt });
const denied = (context: unknown, policy: unknown, resource: unknown, reason?: string) => { const result = evaluate(context, policy, resource); return result.ok && result.decision.decision === "deny" && (!reason || result.decision.reasonCode === reason); };

test("default deny and missing policy", () => { assert(!evaluate(f.contexts.activeOwner, f.policies.missingPolicy, f.resources.sameTenantApplication).ok, "missing policy accepted"); assert(!evaluate(f.contexts.activeOwner, f.policies.malformedPolicy, f.resources.sameTenantApplication).ok, "malformed policy accepted"); });
test("unknown role denied", () => assert(denied(f.contexts.unknownRole, f.policies.applicationRead, f.resources.sameTenantApplication, "role_unknown"), "unknown role allowed"));
test("inactive memberships denied", () => { for (const context of [f.contexts.invitedMembership, f.contexts.suspendedMembership, f.contexts.disabledMembership]) assert(denied(context, f.policies.applicationRead, f.resources.sameTenantApplication, "membership_inactive"), "inactive membership allowed"); });
test("inactive and missing tenant denied", () => { assert(denied(f.contexts.suspendedTenant, f.policies.applicationRead, f.resources.sameTenantApplication, "tenant_inactive"), "suspended tenant allowed"); assert(!evaluate(f.contexts.missingTenant, f.policies.applicationRead, f.resources.sameTenantApplication).ok, "missing tenant accepted"); });
test("same tenant allowed and cross tenant denied", () => { const same = evaluate(f.contexts.activeViewer, f.policies.applicationRead, f.resources.sameTenantApplication); assert(same.ok && same.decision.decision === "allow", "same tenant read denied"); assert(denied(f.contexts.activeViewer, f.policies.applicationRead, f.resources.crossTenantApplication, "resource_tenant_mismatch"), "cross-tenant access allowed"); });
test("unresolved legacy denied", () => assert(denied(f.contexts.activeOwner, f.policies.applicationRead, f.resources.unresolvedLegacyApplication, "unresolved_legacy"), "unresolved legacy allowed"));
test("viewer cannot write", () => assert(denied(f.contexts.activeViewer, f.policies.applicationUpdate, f.resources.sameTenantApplication, "permission_missing"), "viewer write allowed"));
test("processor cannot approve or deny", () => { assert(denied(f.contexts.activeProcessor, f.policies.decisionApprove, f.resources.assignedUser, "permission_missing"), "processor approval allowed"); assert(denied(f.contexts.activeProcessor, f.policies.decisionDeny, f.resources.assignedUser, "permission_missing"), "processor denial allowed"); });
test("underwriter decisions remain explicit", () => { assert(permissionsForRole("underwriter").includes("decision.approve") && permissionsForRole("underwriter").includes("decision.deny") && !permissionsForRole("underwriter").includes("decision.override"), "underwriter decision permissions broadened"); });
test("owner and admin only receive registered explicit permissions", () => { for (const role of ["owner", "admin"] as const) { const permissions = permissionsForRole(role); assert(permissions.every((permission) => AUTHORIZATION_PERMISSIONS.includes(permission)) && permissions.length < AUTHORIZATION_PERMISSIONS.length, `${role} became unrestricted`); } assert(permissionsForRole("owner").includes("billing.manage") && permissionsForRole("owner").includes("audit.export"), "owner explicit sensitive permissions missing"); assert(!permissionsForRole("admin").includes("billing.manage") && !permissionsForRole("admin").includes("audit.export"), "admin inherited sensitive permissions"); });
test("service accounts do not inherit human permissions", () => { assert(permissionsForRole("service_account").length === 0, "service account inherited role permissions"); const valid = evaluate(f.contexts.validServiceGrant, f.policies.serviceFiles, f.resources.sameTenantApplication); assert(valid.ok && valid.decision.decision === "allow", "valid service grant denied"); assert(!evaluate(f.contexts.invalidServiceScope, f.policies.serviceFiles, f.resources.sameTenantApplication).ok || denied(f.contexts.invalidServiceScope, f.policies.serviceFiles, f.resources.sameTenantApplication), "invalid service scope allowed"); });
test("branch and assignment constraints are conservative", () => { const match = evaluate(f.contexts.activeViewer, f.policies.branchRead, f.resources.matchingBranch); assert(match.ok && match.decision.decision === "allow", "matching branch denied"); assert(denied(f.contexts.activeViewer, f.policies.branchRead, f.resources.mismatchedBranch, "branch_scope_denied"), "mismatched branch allowed"); const assigned = evaluate(f.contexts.activeUnderwriter, f.policies.decisionApprove, f.resources.assignedUser); assert(assigned.ok && assigned.decision.decision === "allow", "assigned underwriter denied"); assert(denied(f.contexts.activeUnderwriter, f.policies.decisionApprove, f.resources.unassignedUser, "assignment_scope_denied"), "unassigned underwriter allowed"); });
test("malformed context, resource and missing permission fail closed", () => { assert(!parseAuthorizationContext({}).ok, "malformed context parsed"); assert(!evaluate(f.contexts.activeOwner, f.policies.applicationRead, { ownershipState: "forged" }).ok, "malformed resource accepted"); assert(!evaluate(f.contexts.activeOwner, f.policies.missingPermission, f.resources.sameTenantApplication).ok, "missing permission accepted"); });
test("inputs unchanged and outputs deeply immutable", () => { const before = JSON.stringify(f); const result = evaluate(f.contexts.activeViewer, f.policies.applicationRead, f.resources.sameTenantApplication); assert(result.ok && Object.isFrozen(result.decision) && Object.isFrozen(result.decision.constraintsEvaluated) && result.decision.constraintsEvaluated.every(Object.isFrozen) && Object.isFrozen(result.decision.audit), "decision is mutable"); assert(JSON.stringify(f) === before && Object.isFrozen(f), "fixtures mutated"); assert(parseAuthorizationDecision(result.decision).ok, "decision contract invalid"); });
test("decisions contain no PII", () => { const result = evaluate(f.contexts.activeViewer, f.policies.applicationRead, f.resources.sameTenantApplication); assert(result.ok && !/email|borrower|documentText|ssn|token|cookie/i.test(JSON.stringify(result.decision)), "decision contains PII or credential data"); });
test("no production imports", () => {
  const roots = ["app", "components", "middleware.ts", "lib/firebase.ts", "lib/firebase-admin.ts"];
  const files: string[] = [];
  const importSpecifiers = (source: string) => [...source.matchAll(/(?:import|export)\s+(?:[^"']*?\s+from\s+)?["']([^"']+)["']|require\(["']([^"']+)["']\)/g)].map((match) => (match[1] || match[2]).replace(/\\/g, "/"));
  const forbiddenDocumentResolverImport = (specifier: string) => /(?:^|\/)applicationDocumentResourceResolver(?:Core)?$/.test(specifier.replace(/\.(?:js|jsx|ts|tsx)$/, ""));
  const forbiddenContractImport = (specifier: string) => /(?:^|\/)contracts\/authorization(?:Fixtures)?$|(?:^|\/)server\/authorization\/permissionPolicy$/.test(specifier.replace(/\.(?:js|jsx|ts|tsx)$/, ""));
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    if (fs.statSync(root).isFile()) files.push(root);
    else for (const entry of fs.readdirSync(root, { recursive: true })) {
      const file = path.join(root, String(entry));
      if (fs.statSync(file).isFile() && /\.(ts|tsx|js|jsx)$/.test(file)) files.push(file);
    }
  }
  for (const file of files) {
    const imports = importSpecifiers(fs.readFileSync(file, "utf8"));
    assert(!imports.some(forbiddenDocumentResolverImport), `${file} imports the document resolver`);
    assert(!imports.some(forbiddenContractImport), `${file} imports authorization contracts or policy`);
  }
  for (const synthetic of [
    'import { resolveApplicationDocumentResourceFacts } from "../lib/server/authorization/applicationDocumentResourceResolver";',
    'import { resolveApplicationDocumentResourceFactsCore } from "../../lib/server/authorization/applicationDocumentResourceResolverCore";',
  ]) assert(importSpecifiers(synthetic).some(forbiddenDocumentResolverImport), "synthetic client/page/route resolver import was not rejected");
});
test("matrix is provisional and complete by role", () => { assert(PROVISIONAL_ROLE_PERMISSION_MATRIX.status === "provisional_product_review_required" && Object.keys(PROVISIONAL_ROLE_PERMISSION_MATRIX.roles).sort().join(",") === ["admin", "loan_officer", "owner", "processor", "service_account", "underwriter", "unknown", "viewer"].sort().join(","), "provisional matrix vocabulary changed"); });

let passed = 0; for (const [name, run] of tests) { try { run(); passed += 1; console.log(`PASS: ${name}`); } catch (error) { console.error(`FAIL: ${name}: ${error instanceof Error ? error.message : String(error)}`); } }
console.log(`Authorization contract regression result: ${passed}/${tests.length} passed`); if (passed !== tests.length) process.exitCode = 1;
