import { NextResponse } from "next/server";

export const runtime = "nodejs";

function unauthorized(reason: string) {
  return NextResponse.json({ ok: false, error: `401: Unauthorized (${reason})` }, { status: 401 });
}

function getBearerToken(req: Request): string | null {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

function isAuthorized(req: Request): { ok: true } | { ok: false; reason: string } {
  const secret = (process.env.CRON_SECRET || "").trim();
  if (!secret) return { ok: false, reason: "missing CRON_SECRET + not a Vercel cron request" };

  // 1) Vercel Cron uses Authorization: Bearer <CRON_SECRET>
  const bearer = getBearerToken(req);
  if (bearer && bearer === secret) return { ok: true };

  // 2) Manual/test fallback: allow ?secret=<CRON_SECRET>
  const url = new URL(req.url);
  const qp = (url.searchParams.get("secret") || "").trim();
  if (qp && qp === secret) return { ok: true };

  return { ok: false, reason: "not vercel cron and missing/invalid secret" };
}

async function postInternal(origin: string, path: string, workerSecret: string) {
  const url = `${origin}${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-worker-secret": workerSecret,
    },
    body: JSON.stringify({}),
    cache: "no-store",
  });

  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }

  return { path, status: res.status, body };
}

// Vercel Cron triggers GET requests to the path in vercel.json
export async function GET(req: Request) {
  const auth = isAuthorized(req);
  if (!auth.ok) return unauthorized(auth.reason);

  const workerSecret = (process.env.WORKER_SECRET || process.env.X_WORKER_SECRET || "").trim();
  if (!workerSecret) {
    return NextResponse.json({ ok: false, error: "WORKER_SECRET missing on server" }, { status: 500 });
  }

  const origin = new URL(req.url).origin;
  const t = new URL(req.url).searchParams.get("t") || null;

  const results = [];
  results.push(await postInternal(origin, "/api/worker/watchdog", workerSecret));
  results.push(await postInternal(origin, "/api/worker/files/process", workerSecret));
  results.push(await postInternal(origin, "/api/worker/ai/process", workerSecret));

  const anyFailed = results.some((r: any) => (r.status || 0) >= 400);

  return NextResponse.json(
    {
      ok: true,
      mode: "cron",
      t,
      anyFailed,
      results,
      note: "Triggered by Vercel Cron (Authorization: Bearer CRON_SECRET).",
    },
    { status: 200 }
  );
}

// Optional: allow POST too (handy for manual testing)
export async function POST(req: Request) {
  return GET(req);
}