import { NextResponse } from "next/server";
import { initAdmin } from "@/lib/firebase-admin";

export const runtime = "nodejs";

function isVercelCron(req: Request) {
  // Vercel sets this header for cron invocations
  const v = req.headers.get("x-vercel-cron");
  return !!v;
}

function requireCronAuth(req: Request) {
  const secret = String(process.env.CRON_SECRET || "").trim();
  if (!secret) throw new Error("401: Unauthorized (missing CRON_SECRET + not a Vercel cron request)");

  // Allow either:
  // 1) Real Vercel Cron invocation (x-vercel-cron present)
  // 2) Manual call with ?secret= for testing
  const url = new URL(req.url);
  const got = (url.searchParams.get("secret") || "").trim();

  if (isVercelCron(req)) return;
  if (got && got === secret) return;

  throw new Error("401: Unauthorized (not vercel cron and missing/invalid ?secret=)");
}

function is401(err: any) {
  return String(err?.message || "").startsWith("401:");
}

export async function GET(req: Request) {
  try {
    requireCronAuth(req);

    const { db, admin } = initAdmin();
    const now = admin.firestore.Timestamp.now();

    // 🔥 Heartbeat: write a tiny marker that cron ran
    await db.collection("_system").doc("cron").set(
      {
        lastCronTickAt: now,
        lastCronTickIso: now.toDate().toISOString(),
      },
      { merge: true }
    );

    // Call the tick runner internally (same origin call)
    const url = new URL(req.url);
    const t = url.searchParams.get("t") || "";
    const tickUrl = new URL("/api/debug/run", url.origin);
    if (t) tickUrl.searchParams.set("t", t);
    tickUrl.searchParams.set("mode", "tick");

    const res = await fetch(tickUrl.toString(), { method: "GET" });
    const body = await res.json().catch(() => ({}));

    return NextResponse.json(
      { ok: true, cron: true, tickStatus: res.status, tick: body },
      { status: 200 }
    );
  } catch (err: any) {
    const msg = String(err?.message || err);
    return NextResponse.json({ ok: false, error: msg }, { status: is401(err) ? 401 : 500 });
  }
}