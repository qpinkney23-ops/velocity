import type { AuthorizationPermission } from "../../contracts/authorization";

export const AUTHORIZATION_CACHE_POLICY_VERSION = "authorization-cache-policy.provisional.v1";
export type AuthorizationCacheAction = AuthorizationPermission | "ownership.migrate" | "permission.manage";
export type AuthorizationCachePolicyResult = Readonly<{ allowed: boolean; policyVersion: typeof AUTHORIZATION_CACHE_POLICY_VERSION; classification: "low_risk_stable_read" | "high_risk_forbidden" | "deny_not_cached" | "unstable_resource" }>;

const LOW_RISK_READS = new Set<AuthorizationCacheAction>(["application.read", "document.read", "condition.read", "assignment.read", "decision.read", "report.read", "queue.read", "tenant.read", "membership.read", "configuration.read", "billing.read", "audit.read"]);
const HIGH_RISK = new Set<AuthorizationCacheAction>(["decision.approve", "decision.override", "membership.manage", "membership.invite", "billing.manage", "audit.export", "ownership.migrate", "permission.manage", "tenant.manage", "configuration.manage"]);

export function authorizationCachePolicy(input: Readonly<{ action: AuthorizationCacheAction; decision: "allow" | "deny"; resourceStable: boolean }>): AuthorizationCachePolicyResult {
  if (input.decision === "deny") return Object.freeze({ allowed: false, policyVersion: AUTHORIZATION_CACHE_POLICY_VERSION, classification: "deny_not_cached" });
  if (HIGH_RISK.has(input.action) || !LOW_RISK_READS.has(input.action)) return Object.freeze({ allowed: false, policyVersion: AUTHORIZATION_CACHE_POLICY_VERSION, classification: "high_risk_forbidden" });
  if (!input.resourceStable) return Object.freeze({ allowed: false, policyVersion: AUTHORIZATION_CACHE_POLICY_VERSION, classification: "unstable_resource" });
  return Object.freeze({ allowed: true, policyVersion: AUTHORIZATION_CACHE_POLICY_VERSION, classification: "low_risk_stable_read" });
}

export const AUTHORIZATION_VERSION_INVALIDATION_MODEL = Object.freeze({
  status: "provisional" as const,
  domains: Object.freeze(["tenant_version", "membership_version", "permission_policy_version", "service_grant_version", "resource_authorization_version"] as const),
  rule: "Changing any applicable version produces a different cache key and invalidates the previous authorization result." as const,
});
