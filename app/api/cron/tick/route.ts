import { NextResponse } from "next/server";
import { initAdmin } from "@/lib/firebase-admin";

export const runtime = "nodejs";

function isVercelCron(req: Request) {
  // Vercel sets this on scheduled cron invocations
  const v = req.headers.get("x-vercel-cron");
  return !!v;
}

function requireCronAuth(req: Request) {
  // ✅ If this is an actual Vercel cron invocation, allow it even if CRON_SECRET is missing.
  if (isVercelCron(req)) return;

  // Manual calls require ?secret= AND a configured CRON_SECRET
  const secret = String(process.env.CRON_SECRET || "").trim();
  if (!secret) throw new Error("401: Unauthorized (missing CRON_SECRET + not a Vercel cron request)");

  const url = new URL(req.url);
  const got = String(url.searchParams.get("secret") || "").trim();

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

    // Heartbeat marker: proves cron ran
    await db.collection("_system").doc("cron").set(
      {
        lastCronTickAt: now,
        lastCronTickIso: now.toDate().toISOString(),
        via: isVercelCron(req) ? "vercel-cron" : "manual-secret",
      },
      { merge: true }
    );

    // Trigger tick runner
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