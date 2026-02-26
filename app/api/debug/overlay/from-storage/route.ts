import { NextResponse } from "next/server";
import { initAdmin } from "@/lib/firebase-admin";

export const runtime = "nodejs";

/**
 * DEBUG ENDPOINT (protected)
 * Purpose: create/ensure an overlay doc exists and is attached to a program.
 *
 * IMPORTANT:
 * - This endpoint ALWAYS returns JSON (even on errors) so we stop getting empty 500 responses.
 * - This does NOT try to "infer rules from PDF" yet. It creates a predictable overlay with safe placeholder rules.
 */

function authorized(req: Request) {
  const url = new URL(req.url);
  const demo = url.searchParams.get("t") || req.headers.get("x-demo-token") || "";
  const worker = req.headers.get("x-worker-secret") || "";

  const expectedDemo = process.env.DEMO_TOKEN || "";
  const expectedWorker = process.env.WORKER_SECRET || "";

  if (expectedDemo && demo === expectedDemo) return true;
  if (expectedWorker && worker === expectedWorker) return true;
  return false;
}

function nowIso() {
  return new Date().toISOString();
}

type Body = {
  companyProfileId: string;
  programKey: string;
  objectPath?: string;
  overlayName?: string;
  force?: boolean;
};

type Rule = {
  ruleId: string;
  title: string;
  severity?: "info" | "warn" | "error";
  pattern?: string;
  type?: "finding" | "condition" | "blocker";
  source?: "base" | "overlay";
};

function safeJsonError(err: any) {
  return {
    name: err?.name || "Error",
    message: err?.message || String(err),
    stack: err?.stack || null,
    cause: err?.cause ? { message: String(err.cause) } : null,
  };
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "403: Invalid demo token" }, { status: 403 });
  }
  return NextResponse.json(
    {
      ok: true,
      hint:
        "POST JSON: { companyProfileId, programKey, objectPath?, overlayName? }. This creates/ensures overlay + attaches to program.",
      time: nowIso(),
    },
    { status: 200 }
  );
}

export async function POST(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "403: Invalid demo token" }, { status: 403 });
  }

  try {
    const url = new URL(req.url);
    const forceFromQuery = url.searchParams.get("force") === "1";

    const body = (await req.json()) as Body;

    const companyProfileId = String(body?.companyProfileId || "").trim();
    const programKey = String(body?.programKey || "").trim();
    const objectPath = body?.objectPath ? String(body.objectPath).trim() : "";
    const overlayName = body?.overlayName ? String(body.overlayName).trim() : "Overlay (debug)";
    const force = Boolean(body?.force) || forceFromQuery;

    if (!companyProfileId) {
      return NextResponse.json({ ok: false, error: "Missing companyProfileId" }, { status: 400 });
    }
    if (!programKey) {
      return NextResponse.json({ ok: false, error: "Missing programKey" }, { status: 400 });
    }

    const { db } = initAdmin();

    // Deterministic IDs (stable + predictable)
    const programId = `program-${companyProfileId}-${programKey}`;
    const overlayId = `overlay-${companyProfileId}-${programKey}-v1`;

    const programRef = db.collection("programs").doc(programId);
    const overlayRef = db.collection("overlays").doc(overlayId);

    // 1) Ensure program exists
    const programSnap = await programRef.get();
    if (!programSnap.exists) {
      return NextResponse.json(
        {
          ok: false,
          error: `Program not found: programs/${programId}. Seed programs first.`,
          programId,
          companyProfileId,
          programKey,
        },
        { status: 404 }
      );
    }

    // 2) Create/ensure overlay exists
    const overlaySnap = await overlayRef.get();

    // JS-safe placeholder rules (overlay source). 5 rules so it matches your "overlayRuleCount: 5".
    const overlayRules: Rule[] = [
      {
        ruleId: "ov-income-missing",
        title: "Income documentation may be missing",
        severity: "warn",
        type: "condition",
        pattern: "\\b(no income|missing income|income not provided)\\b",
        source: "overlay",
      },
      {
        ruleId: "ov-assets-missing",
        title: "Asset documentation may be missing",
        severity: "warn",
        type: "condition",
        pattern: "\\b(missing assets|no assets|asset statement missing)\\b",
        source: "overlay",
      },
      {
        ruleId: "ov-identity-missing",
        title: "Identity documentation may be missing",
        severity: "warn",
        type: "condition",
        pattern: "\\b(missing id|no id provided|identity not provided)\\b",
        source: "overlay",
      },
      {
        ruleId: "ov-hoa-present",
        title: "HOA detected (review HOA docs)",
        severity: "info",
        type: "finding",
        pattern: "\\bHOA\\b|homeowners association",
        source: "overlay",
      },
      {
        ruleId: "ov-large-deposit",
        title: "Large deposit detected (needs sourcing)",
        severity: "warn",
        type: "condition",
        pattern: "\\blarge deposit\\b|\\bunsourced deposit\\b",
        source: "overlay",
      },
    ];

    const overlayPayload = {
      id: overlayId,
      overlayId,
      name: overlayName,
      companyProfileId,
      programId,
      programKey,
      sourceObjectPath: objectPath || null,
      rules: overlayRules,
      ruleCount: overlayRules.length,
      version: "v1",
      createdAt: overlaySnap.exists ? overlaySnap.data()?.createdAt || nowIso() : nowIso(),
      updatedAt: nowIso(),
      seedTag: "debug-from-storage-v1",
    };

    let overlayAction: "created" | "skipped" | "updated" = "skipped";
    if (!overlaySnap.exists) {
      await overlayRef.set(overlayPayload, { merge: false });
      overlayAction = "created";
    } else if (force) {
      await overlayRef.set(overlayPayload, { merge: false });
      overlayAction = "updated";
    }

    // 3) Attach overlay to program (set activeOverlayId)
    // If already attached and not forcing, we still respond ok.
    const programData = programSnap.data() as any;
    const currentActive = programData?.activeOverlayId ? String(programData.activeOverlayId) : null;

    let programUpdated = false;
    if (currentActive !== overlayId) {
      await programRef.set(
        {
          activeOverlayId: overlayId,
          updatedAt: nowIso(),
        },
        { merge: true }
      );
      programUpdated = true;
    }

    return NextResponse.json(
      {
        ok: true,
        force,
        companyProfileId,
        programKey,
        programId,
        overlayId,
        overlayName,
        overlayAction,
        programUpdated,
        note:
          "Overlay ensured + program activeOverlayId set. This uses placeholder rules (not PDF-derived yet).",
      },
      { status: 200 }
    );
  } catch (err: any) {
    // The whole point: NEVER return an empty 500 again.
    console.error("from-storage overlay error:", err);
    return NextResponse.json(
      {
        ok: false,
        error: "500: from-storage failed",
        details: safeJsonError(err),
      },
      { status: 500 }
    );
  }
}