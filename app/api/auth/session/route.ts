import { NextResponse } from "next/server";
import { classifyUserCredential } from "@/lib/contracts/serverAuth";
import { browserSessionCookiePolicy, boundaryError, boundaryIds, VELOCITY_AUTH_BODY_MAX_BYTES } from "@/lib/server/auth/browserSessionPolicy";
import { validateBrowserMutationSource } from "@/lib/server/auth/browserMutationSecurity";
import { createVelocitySessionCookie } from "@/lib/server/auth/firebaseSessionCookie";
import { verifyFirebaseUserWithAdmin } from "@/lib/server/auth/firebaseAuthVerifier";
import { exchangeSession, parseSessionExchangePayload } from "@/lib/server/auth/sessionEndpointService";

export const runtime = "nodejs";

function jsonError(error: ReturnType<typeof boundaryError>, correlationId: string) { return NextResponse.json({ ok: false, error, correlationId }, { status: error.status, headers: { "x-request-id": error.requestId, "x-correlation-id": correlationId } }); }

export async function POST(request: Request) {
  const ids = boundaryIds(request.headers.get("x-correlation-id"), false);
  const trustedOrigin = process.env.NEXT_PUBLIC_APP_URL || "";
  const source = validateBrowserMutationSource({ origin: request.headers.get("origin"), host: request.headers.get("host"), forwardedHost: request.headers.get("x-forwarded-host"), trustedOrigin, trustForwardedHost: process.env.VERCEL === "1" });
  if (!source.ok) return jsonError(boundaryError(source.code, ids.requestId), ids.correlationId);
  const length = Number(request.headers.get("content-length") || "0"); if (!Number.isFinite(length) || length < 0 || length > VELOCITY_AUTH_BODY_MAX_BYTES) return jsonError(boundaryError("PAYLOAD_INVALID", ids.requestId), ids.correlationId);
  const text = await request.text().catch(() => ""); const payload = parseSessionExchangePayload(text, request.headers.get("authorization"), ids.requestId); if (!payload.ok) return jsonError(payload.error, ids.correlationId);
  const result = await exchangeSession(payload, ids.requestId, ids.correlationId, { verifyIdToken: (authorizationHeader, correlationId) => verifyFirebaseUserWithAdmin({ classification: classifyUserCredential({ authorizationHeader }), authorizationHeader, inboundCorrelationId: correlationId, trustedCorrelationCaller: true }), createSessionCookie: createVelocitySessionCookie, now: () => new Date() });
  if (!result.ok) return jsonError(result.error, ids.correlationId);
  const response = NextResponse.json({ ok: true, requestId: result.context.requestId, correlationId: result.context.correlationId }, { status: 200, headers: { "x-request-id": result.context.requestId, "x-correlation-id": result.context.correlationId, "cache-control": "no-store" } });
  response.cookies.set({ ...browserSessionCookiePolicy(process.env.NODE_ENV === "production"), value: result.sessionCookie });
  return response;
}

export async function GET() { const ids = boundaryIds(undefined, false); return jsonError(boundaryError("METHOD_NOT_ALLOWED", ids.requestId), ids.correlationId); }
