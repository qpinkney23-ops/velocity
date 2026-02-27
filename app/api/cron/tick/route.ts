import { NextResponse } from "next/server";

export const runtime = "nodejs";

function assertCronAuth(req: Request) {
  // Vercel Cron Jobs: if CRON_SECRET exists, Vercel sends:
  // Authorization: Bearer <CRON_SECRET>
  const expected = process.env.CRON_SECRET || "";
  if (!expected) {
    // If you forget to set CRON_SECRET in Vercel, fail loudly (do not run unprotected).
    throw new Error("500: CRON_SECRET missing on server");
  }
  const auth = req.headers.get("authorization") || "";
  if (auth !== `Bearer ${expected}`) {
    throw new Error("401: Unauthorized (bad authorization bearer)");
  }
}

function is401(e: any) {
  return String(e?.message || "").startsWith("401:");
}

function baseUrlFromReq(req: Request) {
  // Works on Vercel + locally
  const host = req.headers.get("host") || "localhost:3000";
  const proto = host.includes("localhost") ? "http" : "https";
  return `${proto}://${host}`;
}

async function callInternal(path: string, workerSecret: string, baseUrl: string) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "x-worker-secret": workerSecret,
      "content-type": "application/json",
    },
    cache: "no-store",
  });

  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }

  return { path, status: res.status, ok: res.ok, body };
}

export async function GET(req: Request) {
  try {
    assertCronAuth(req);

    const workerSecret = process.env.WORKER_SECRET || process.env.X_WORKER_SECRET || "";
    if (!workerSecret) {
      return NextResponse.json({ ok: false, error: "WORKER_SECRET missing on server" }, { status: 500 });
    }

    const baseUrl = baseUrlFromReq(req);

    // One cron invocation = one deterministic tick sequence
    const results = [
      await callInternal("/api/worker/watchdog", workerSecret, baseUrl),
      await callInternal("/api/worker/files/process", workerSecret, baseUrl),
      await callInternal("/api/worker/ai/process", workerSecret, baseUrl),
    ];

    const anyFailed = results.some((r) => !r.ok);

    return NextResponse.json(
      {
        ok: true,
        cron: true,
        baseUrl,
        anyFailed,
        results,
      },
      { status: anyFailed ? 500 : 200 }
    );
  } catch (e: any) {
    const msg = String(e?.message || e);
    if (is401(e)) return NextResponse.json({ ok: false, error: msg }, { status: 401 });
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}