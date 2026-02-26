import { NextResponse } from "next/server";

export const runtime = "nodejs";

function getWorkerSecret() {
  return process.env.WORKER_SECRET || process.env.X_WORKER_SECRET || "";
}

function baseUrlFromReq(req: Request) {
  // Works on Vercel + local
  const h = req.headers;
  const proto = h.get("x-forwarded-proto") || "https";
  const host = h.get("x-forwarded-host") || h.get("host") || "";
  if (!host) return "";
  return `${proto}://${host}`;
}

async function callJson(
  baseUrl: string,
  path: string,
  opts: { method?: string; headers?: Record<string, string>; body?: any } = {}
) {
  const url = `${baseUrl}${path}`;
  const method = opts.method || "GET";
  const headers: Record<string, string> = {
    ...(opts.headers || {}),
  };

  const init: RequestInit = { method, headers };

  if (opts.body !== undefined) {
    headers["content-type"] = "application/json";
    init.body = JSON.stringify(opts.body);
  }

  const res = await fetch(url, init);
  let text = "";
  try {
    text = await res.text();
  } catch {
    text = "";
  }

  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text || null };
  }

  return { ok: res.ok, status: res.status, body: json };
}

/**
 * /api/debug/run
 *
 * Query:
 *  - t=demo216 (ignored by server logic; just a tag you use)
 *  - mode=tick|full
 *
 * DEFAULT: mode=tick  (reliability-first; does NOT requeue)
 * mode=full: seed + requeue + tick + share
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const t = url.searchParams.get("t") || null;

    // DEFAULT = tick-only (A)
    const mode = (url.searchParams.get("mode") || "tick").toLowerCase();
    const baseUrl = baseUrlFromReq(req);
    if (!baseUrl) {
      return NextResponse.json({ ok: false, error: "Unable to determine base URL from request headers." }, { status: 500 });
    }

    const workerSecret = getWorkerSecret();
    if (!workerSecret) {
      return NextResponse.json({ ok: false, error: "WORKER_SECRET missing on server." }, { status: 500 });
    }

    const workerHeaders = { "x-worker-secret": workerSecret };

    // ---- TICK (always available) ----
    const tick = {
      ok: true,
      status: 200,
      body: {
        ok: true,
        pipelineRunId: crypto.randomUUID(),
        anyFailed: false,
        results: [] as any[],
      },
    };

    // run watchdog + files + ai
    const watchdog = await callJson(baseUrl, "/api/worker/watchdog", { method: "POST", headers: workerHeaders });
    tick.body.results.push({ path: "/api/worker/watchdog", status: watchdog.status, body: watchdog.body });

    const files = await callJson(baseUrl, "/api/worker/files/process", { method: "POST", headers: workerHeaders });
    tick.body.results.push({ path: "/api/worker/files/process", status: files.status, body: files.body });

    const ai = await callJson(baseUrl, "/api/worker/ai/process", { method: "POST", headers: workerHeaders });
    tick.body.results.push({ path: "/api/worker/ai/process", status: ai.status, body: ai.body });

    tick.body.anyFailed = !watchdog.ok || !files.ok || !ai.ok;

    // ---- FULL MODE extras ----
    let seed: any = null;
    let requeue: any = null;
    let share: any = null;

    if (mode === "full") {
      // seed strict rules
      seed = await callJson(baseUrl, "/api/debug/seed/strict", { method: "POST", headers: workerHeaders });

      // requeue (fresh start)
      requeue = await callJson(baseUrl, "/api/debug/requeue", {
        method: "POST",
        headers: workerHeaders,
        body: { companyProfileId: "demo-company-strict-001" },
      });

      // create share (so the report URL exists)
      share = await callJson(baseUrl, "/api/debug/share", {
        method: "POST",
        headers: workerHeaders,
        body: { companyProfileId: "demo-company-strict-001" },
      });
    }

    // Try to attach some “top-level” convenience fields if worker returns them
    const filesBody = files.body || {};
    const aiBody = ai.body || {};

    const out: any = {
      ok: true,
      t,
      mode,
      tick,
    };

    if (seed) out.seed = seed;
    if (requeue) out.requeue = requeue;
    if (share) out.share = share;

    // best-effort appId/decision
    out.appId = filesBody?.appId || aiBody?.appId || null;
    out.decision = aiBody?.decision || null;

    return NextResponse.json(out, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}