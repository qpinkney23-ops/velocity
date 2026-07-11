import "server-only";
import { NextResponse } from "next/server";
import { verifyFirebaseUserWithAdmin } from "./firebaseAuthVerifier";
import { authenticateUserApiRequest, type UserApiAuthResult } from "./userApiAuthCore";
import type { UserApiRoutePolicy } from "./userApiAuthPolicy";
import { boundaryIds } from "./browserSessionPolicy";

export function requireAuthenticatedUserRequest(request: Request, policy: UserApiRoutePolicy): Promise<UserApiAuthResult> {
  return authenticateUserApiRequest(request, policy, { verify: verifyFirebaseUserWithAdmin, ids: boundaryIds, trustedOrigin: process.env.NEXT_PUBLIC_APP_URL || "", production: process.env.NODE_ENV === "production", trustForwardedHost: process.env.VERCEL === "1" });
}

export function userApiAuthErrorResponse(result: Exclude<UserApiAuthResult, { ok: true }>): NextResponse {
  const correlationId = "context" in result ? result.context.correlationId : result.correlationId;
  return NextResponse.json({ ok: false, error: result.error, correlationId }, { status: result.error.status, headers: { "cache-control": "no-store", "x-request-id": result.error.requestId, "x-correlation-id": correlationId } });
}
