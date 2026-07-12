import { requireAuthenticatedUserRequest } from "../../../../lib/server/auth/userApiAuth";
import { authorizeApplicationAction } from "../../../../lib/server/authorization/applicationAuthorizationOrchestrator";
import { persistAuthorizationAuditEvent } from "../../../../lib/server/authorization/authorizationAuditPersistence";
import { APPLICATION_READ_ROUTE_POLICY, executeApplicationReadRoute } from "../../../../lib/server/applications/applicationReadRouteCore";

export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: { id: string } }) { return executeApplicationReadRoute(request, context.params.id, { authenticate: (value) => requireAuthenticatedUserRequest(value, APPLICATION_READ_ROUTE_POLICY), authorize: authorizeApplicationAction, persist: persistAuthorizationAuditEvent, now: () => new Date() }); }
