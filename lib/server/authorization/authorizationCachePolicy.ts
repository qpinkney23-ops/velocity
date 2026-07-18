import type { AuthorizationPermission } from "../../contracts/authorization";

export const AUTHORIZATION_CACHE_POLICY_VERSION = "authorization-cache-policy.v1";
export type AuthorizationCacheAction = AuthorizationPermission | "ownership.migrate" | "permission.manage";
export type AuthorizationCachePolicyResult = Readonly<{ allowed: false; policyVersion: typeof AUTHORIZATION_CACHE_POLICY_VERSION; classification: "cache_disabled_authoritative_reads" }>;

export function authorizationCachePolicy(_input: Readonly<{ action: AuthorizationCacheAction; decision: "allow" | "deny"; resourceStable: boolean }>): AuthorizationCachePolicyResult {
  return Object.freeze({ allowed: false, policyVersion: AUTHORIZATION_CACHE_POLICY_VERSION, classification: "cache_disabled_authoritative_reads" });
}

export const AUTHORIZATION_VERSION_INVALIDATION_MODEL = Object.freeze({
  status: "not_deployed_authoritative_reads_required" as const,
  domains: Object.freeze(["tenant_version", "membership_version", "permission_policy_version", "service_grant_version", "resource_authorization_version"] as const),
  rule: "Production authorization decisions must re-read authoritative tenant, membership, service-grant, and resource state. No authorization decision or resolved authority is cached." as const,
});
