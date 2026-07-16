import { NextResponse } from "next/server";
import { requireAuthenticatedUserRequest } from "@/lib/server/auth/userApiAuth";
import { resolveTenantAuthorizationContext } from "@/lib/server/authorization/tenantAuthorizationResolver";
import { billingProductionDependencies, statusForBillingResponse } from "@/lib/server/billing/stripeBillingProduction";
import { executeStripePortalRoute } from "@/lib/server/billing/stripeBillingRouteCore";
export const dynamic = "force-dynamic";
export async function POST(request: Request) { let body: unknown; try { body = await request.json(); } catch { body = undefined; } const result = await executeStripePortalRoute(request, body, { ...billingProductionDependencies(), authenticate: requireAuthenticatedUserRequest as any, resolveTenant: async auth => { const r = await resolveTenantAuthorizationContext({ authentication: auth }); return r.ok ? { ok: true as const, context: r.context } : { ok: false as const, code: r.error.code }; } }); return NextResponse.json(result, { status: statusForBillingResponse(result), headers: { "cache-control": "no-store", "x-request-id": result.requestId, "x-correlation-id": result.correlationId } }); }
