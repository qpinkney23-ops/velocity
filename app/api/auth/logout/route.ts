import { NextResponse } from "next/server";
import { boundaryError, boundaryIds, browserSessionCookieDeletionPolicy } from "@/lib/server/auth/browserSessionPolicy";
import { validateBrowserMutationSource } from "@/lib/server/auth/browserMutationSecurity";

export const runtime = "nodejs";

function jsonError(error: ReturnType<typeof boundaryError>, correlationId: string) { return NextResponse.json({ ok: false, error, correlationId }, { status: error.status, headers: { "x-request-id": error.requestId, "x-correlation-id": correlationId } }); }

export async function POST(request: Request) {
  const ids = boundaryIds(request.headers.get("x-correlation-id"), false);
  const source = validateBrowserMutationSource({ origin: request.headers.get("origin"), host: request.headers.get("host"), forwardedHost: request.headers.get("x-forwarded-host"), trustedOrigin: process.env.NEXT_PUBLIC_APP_URL || "", trustForwardedHost: process.env.VERCEL === "1" });
  if (!source.ok) return jsonError(boundaryError(source.code, ids.requestId), ids.correlationId);
  const response = NextResponse.json({ ok: true, requestId: ids.requestId, correlationId: ids.correlationId }, { status: 200, headers: { "x-request-id": ids.requestId, "x-correlation-id": ids.correlationId, "cache-control": "no-store" } });
  response.cookies.set({ ...browserSessionCookieDeletionPolicy(process.env.NODE_ENV === "production"), value: "" });
  return response;
}

export async function GET() { const ids = boundaryIds(undefined, false); return jsonError(boundaryError("METHOD_NOT_ALLOWED", ids.requestId), ids.correlationId); }
