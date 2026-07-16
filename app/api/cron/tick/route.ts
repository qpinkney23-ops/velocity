import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
export const runtime = "nodejs";
function authorized(request: Request) { const configured = process.env.CRON_SECRET || "", header = request.headers.get("authorization") || "", supplied = header.startsWith("Bearer ") ? header.slice(7) : ""; const a = Buffer.from(configured), b = Buffer.from(supplied); return a.length >= 32 && a.length === b.length && timingSafeEqual(a, b); }
function response(request: Request) { if (!authorized(request)) return NextResponse.json({ ok: false, error: { code: "SERVICE_AUTH_REQUIRED", message: "Scheduler authorization required" } }, { status: 401 }); return NextResponse.json({ ok: false, error: { code: "SERVICE_AUTH_REQUIRED", message: "Scheduler service authorization migration is required" }, retryable: false }, { status: 503 }); }
export async function GET(request: Request) { return response(request); }
export async function POST(request: Request) { return response(request); }
