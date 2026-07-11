import fs from "fs";
import path from "path";
import { authorizationFixtures as f } from "../lib/contracts/authorizationFixtures";
import { evaluateAuthorizationDecisionCore } from "../lib/server/authorization/authorizationDecisionCore";

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
const decide = (context: unknown, request: unknown, facts?: unknown) => evaluateAuthorizationDecisionCore({ context, request, ...(facts !== undefined ? { resourceFacts: facts } : {}), evaluatedAt: f.evaluatedAt });
const reason = (context: unknown, request: unknown, facts: unknown, expected: string) => { const result = decide(context, request, facts); return result.ok && result.decision.decision === "deny" && result.decision.reasonCode === expected; };

function main() {
  const allow = decide(f.contexts.activeViewer, f.requests.applicationRead, f.resolvedFacts.sameTenantApplication); assert(allow.ok && allow.decision.decision === "allow" && allow.decision.reasonCode === "authorized", "valid decision denied");
  assert(reason(undefined, f.requests.applicationRead, f.resolvedFacts.sameTenantApplication, "authentication_required"), "missing context not denied");
  assert(reason(f.contexts.suspendedTenant, f.requests.applicationRead, f.resolvedFacts.sameTenantApplication, "tenant_inactive"), "inactive tenant not denied");
  assert(reason(f.contexts.suspendedMembership, f.requests.applicationRead, f.resolvedFacts.sameTenantApplication, "membership_inactive"), "inactive membership not denied");
  assert(reason(f.contexts.unknownRole, f.requests.applicationRead, f.resolvedFacts.sameTenantApplication, "role_unknown"), "unknown role not denied");
  assert(reason(f.contexts.activeViewer, f.requests.applicationUpdate, f.resolvedFacts.sameTenantApplication, "permission_missing"), "viewer write allowed");
  assert(reason(f.contexts.activeProcessor, f.requests.approval, f.resolvedFacts.assignedDecision, "permission_missing"), "processor approve allowed");
  assert(reason(f.contexts.activeUnderwriter, f.requests.override, f.resolvedFacts.assignedDecision, "permission_missing"), "underwriter inherited unregistered approval power");
  assert(reason(f.contexts.activeViewer, f.requests.applicationRead, f.resolvedFacts.crossTenantApplication, "resource_tenant_mismatch"), "cross tenant allowed");
  assert(reason(f.contexts.activeViewer, f.requests.branchRead, f.resolvedFacts.mismatchedBranch, "branch_scope_denied"), "branch mismatch allowed");
  assert(reason(f.contexts.activeViewer, f.requests.teamRead, f.resolvedFacts.mismatchedTeam, "team_scope_denied"), "team mismatch allowed");
  assert(reason(f.contexts.activeUnderwriter, f.requests.approval, f.resolvedFacts.unassignedDecision, "assignment_scope_denied"), "unassigned approval allowed");
  const teamMatch = decide(f.contexts.activeViewer, f.requests.teamRead, f.resolvedFacts.sameTenantApplication), assigned = decide(f.contexts.activeUnderwriter, f.requests.approval, f.resolvedFacts.assignedDecision), creator = decide(f.contexts.activeProcessor, f.requests.creatorUpdate, f.resolvedFacts.creatorMatch); assert(teamMatch.ok && teamMatch.decision.decision === "allow" && assigned.ok && assigned.decision.decision === "allow" && creator.ok && creator.decision.decision === "allow", "matching team, assignment, or creator denied");
  assert(reason(f.contexts.activeProcessor, f.requests.creatorUpdate, f.resolvedFacts.creatorMismatch, "resource_tenant_mismatch") || reason(f.contexts.activeProcessor, f.requests.creatorUpdate, f.resolvedFacts.creatorMismatch, "assignment_scope_denied"), "creator mismatch allowed");
  assert(reason(f.contexts.activeOwner, f.requests.applicationRead, f.resolvedFacts.unresolvedLegacy, "unresolved_legacy"), "legacy resource allowed");
  assert(reason(f.contexts.activeOwner, f.requests.applicationRead, f.resolvedFacts.malformed, "internal_error"), "malformed facts did not fail closed");
  assert(reason(f.contexts.activeOwner, f.requests.invalidPolicy, f.resolvedFacts.sameTenantApplication, "policy_invalid"), "malformed policy did not deny");
  assert(reason(f.contexts.invalidServiceScope, f.requests.serviceFiles, f.resolvedFacts.serviceJob, "service_scope_denied"), "invalid service scope allowed");
  const missingResource = decide(f.contexts.activeViewer, f.requests.applicationRead); assert(missingResource.ok && missingResource.decision.reasonCode === "resource_not_found", "missing resource not denied safely");
  const adminOverride = decide(f.contexts.activeAdmin, f.requests.override, f.resolvedFacts.assignedDecision), ownerOverride = decide(f.contexts.activeOwner, f.requests.override, f.resolvedFacts.assignedDecision); assert(adminOverride.ok && adminOverride.decision.decision === "deny" && ownerOverride.ok && ownerOverride.decision.decision === "deny", "admin or owner became unrestricted");
  const before = JSON.stringify({ contexts: f.contexts, requests: f.requests, facts: f.resolvedFacts }); const repeatA = decide(f.contexts.activeViewer, f.requests.applicationRead, f.resolvedFacts.sameTenantApplication), repeatB = decide(f.contexts.activeViewer, f.requests.applicationRead, f.resolvedFacts.sameTenantApplication); assert(JSON.stringify(repeatA) === JSON.stringify(repeatB), "output is nondeterministic"); assert(JSON.stringify({ contexts: f.contexts, requests: f.requests, facts: f.resolvedFacts }) === before, "inputs mutated");
  assert(allow.ok && Object.isFrozen(allow.decision) && Object.isFrozen(allow.decision.constraintsEvaluated) && allow.decision.constraintsEvaluated.every(Object.isFrozen) && Object.isFrozen(allow.decision.audit), "decision output mutable");
  assert(allow.ok && !/borrower|email|income|credit|loan|documentText|ssn|token|cookie/i.test(JSON.stringify(allow.decision)), "decision leaks PII or loan data");
  const production = ["app", "components", "middleware.ts"].flatMap((root) => !fs.existsSync(root) ? [] : fs.statSync(root).isFile() ? [root] : [...fs.readdirSync(root, { recursive: true })].map(String).map((entry) => path.join(root, entry)).filter((file) => fs.statSync(file).isFile() && /\.(ts|tsx)$/.test(file))); assert(production.every((file) => !/authorizationDecisionEngine|authorizationDecisionCore/.test(fs.readFileSync(file, "utf8"))), "production imports decision engine");
  console.log("Authorization decision orchestration regression: PASS");
  console.log("PASS: ordered fail-closed RBAC/ABAC, resource facts, stable denials, immutability, determinism, PII safety and production isolation");
}
try { main(); } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
