import "server-only";
import { evaluateAuthorizationDecisionCore } from "./authorizationDecisionCore";
import { resolveApplicationResourceFacts } from "./applicationResourceResolver";
import { authorizeApplicationActionCore, type AuthorizeApplicationActionInput } from "./applicationAuthorizationOrchestratorCore";
import { resolveTenantAuthorizationContext } from "./tenantAuthorizationResolver";

export function authorizeApplicationAction(input: AuthorizeApplicationActionInput) {
  return authorizeApplicationActionCore(input, { resolveTenant: resolveTenantAuthorizationContext, resolveApplication: resolveApplicationResourceFacts, evaluateDecision: evaluateAuthorizationDecisionCore });
}
