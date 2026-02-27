import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Vercel Cron will call this endpoint with GET.
// We allow either:
// 1) real Vercel Cron header (x-vercel-cron: 1), OR
// 2) manual secret (for testing) via header/query.
function assertCronAuth(req: Request) {
  const vercelCron = req.headers.get("x-vercel-cron") === "1";

  const required = process.env.CRON_SECRET || "";
  const gotHeader =
    req.headers.get("x-cron-secret") ||
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    "";
  const gotQuery = new URL(req.url).searchParams.get("secret") || "";

  // If no CRON_SECRET is set, we still allow Vercel cron header only.
  if (!required) {
    if (!vercelCron) throw new Error("401: Unauthorized (missing CRON_SECRET + not a Vercel cron request)");
    return;
  }

  if (vercelCron) return;
  if (gotHeader === required) return;
  if (gotQuery === required) return;

  throw new Error("401: Unauthorized (bad cron secret)");
}

function is401(err: unknown) {
  return typeof err === "object" && err !== null && String((err as any).message || "").startsWith("401:");
}

export async function GET(req: Request) {
  try {
    assertCronAuth(req);

    // Call your existing worker tick endpoint(s) from here.
    // We call the internal debug tick endpoint you already built.
    const url = new URL(req.url);
    const t = url.searchParams.get("t") || "cron";
    const origin = url.origin;

    // IMPORTANT: /api/debug/run in tick mode calls the workers.
    const tickUrl = `${origin}/api/debug/run?t=${encodeURIComponent(t)}&mode=tick`;

    const res = await fetch(tickUrl, {
      method: "GET",
      headers: {
        // Pass the worker secret through (server-to-server call)
        "x-worker-secret": process.env.WORKER_SECRET || "",
      },
    });

    const bodyText = await res.text();
    let body: any = null;
    try {
      body = JSON.parse(bodyText);
    } catch {
      body = { raw: bodyText };
    }

    return NextResponse.json(
      {
        ok: res.ok,
        status: res.status,
        tickUrl,
        body,
      },
      { status: res.ok ? 200 : 500 }
    );
  } catch (err: any) {
    const msg = String(err?.message || err);
    if (is401(err)) return NextResponse.json({ ok: false, error: msg }, { status: 401 });
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

// Optional: allow POST too (handy for manual testing)
export async function POST(req: Request) {
  return GET(req);
}