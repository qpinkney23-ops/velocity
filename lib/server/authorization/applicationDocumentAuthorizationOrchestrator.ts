import "server-only";
import { evaluateAuthorizationDecisionCore } from "./authorizationDecisionCore";
import { resolveTenantAuthorizationContext } from "./tenantAuthorizationResolver";
import { resolveApplicationResourceFacts } from "./applicationResourceResolver";
import { resolveApplicationDocumentResourceFacts } from "./applicationDocumentResourceResolver";
import { authorizeApplicationDocumentActionCore, type AuthorizeApplicationDocumentActionInput } from "./applicationDocumentAuthorizationOrchestratorCore";
export const authorizeApplicationDocumentAction=(input:AuthorizeApplicationDocumentActionInput)=>authorizeApplicationDocumentActionCore(input,{resolveTenant:resolveTenantAuthorizationContext,resolveApplication:resolveApplicationResourceFacts,resolveDocument:resolveApplicationDocumentResourceFacts,evaluateDecision:evaluateAuthorizationDecisionCore});
