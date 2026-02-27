import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Vercel Cron always triggers with an HTTP GET. (UA: vercel-cron/1.0)
 * We allow:
 *  - Real Vercel Cron GETs (user-agent contains vercel-cron/1.0)
 *  - OR manual calls if you provide ?secret=... matching CRON_SECRET
 */
function assertCronAuth(req: Request) {
  const ua = (req.headers.get("user-agent") || "").toLowerCase();
  const url = new URL(req.url);

  const secretExpected = process.env.CRON_SECRET || "";
  const secretGot = url.searchParams.get("secret") || "";

  const isVercelCron = ua.includes("vercel-cron/1.0");
  const hasSecret = !!secretExpected && secretGot === secretExpected;

  if (!isVercelCron && !hasSecret) {
    throw new Error("401: Unauthorized (not vercel cron and missing/invalid ?secret=)");
  }
}

function is401(err: unknown) {
  return typeof err === "object" && err !== null && String((err as any).message || "").startsWith("401:");
}

async function callWorker(origin: string, path: string) {
  const secret = process.env.WORKER_SECRET || process.env.X_WORKER_SECRET || "";
  if (!secret) throw new Error("500: WORKER_SECRET missing on server");

  const r = await fetch(`${origin}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-worker-secret": secret,
    },
    // keep it deterministic
    cache: "no-store",
  });

  let body: any = null;
  try {
    body = await r.json();
  } catch {
    body = null;
  }

  return { path, status: r.status, body };
}

export async function GET(req: Request) {
  try {
    assertCronAuth(req);

    const origin = new URL(req.url).origin;

    const results = [
      await callWorker(origin, "/api/worker/watchdog"),
      await callWorker(origin, "/api/worker/files/process"),
      await callWorker(origin, "/api/worker/ai/process"),
    ];

    const anyFailed = results.some((x) => x.status >= 400 || x.body?.ok === false);

    return NextResponse.json(
      {
        ok: !anyFailed,
        mode: "cron",
        time: new Date().toISOString(),
        anyFailed,
        results,
      },
      { status: anyFailed ? 500 : 200 }
    );
  } catch (err: any) {
    const msg = String(err?.message || err);
    if (is401(err)) return NextResponse.json({ ok: false, error: msg }, { status: 401 });
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

/**
 * Optional: allow POST too (handy for manual testing with ?secret=)
 * (Cron itself will use GET.)
 */
export async function POST(req: Request) {
  return GET(req);
}