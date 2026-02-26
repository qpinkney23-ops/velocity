import { NextResponse } from "next/server";
import { initAdmin } from "@/lib/firebase-admin";

export const runtime = "nodejs";

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

function looksLikeHtml(buf: Buffer) {
  const head = buf.subarray(0, Math.min(buf.length, 200)).toString("utf8").trimStart().toLowerCase();
  return head.startsWith("<!doctype") || head.startsWith("<html") || head.startsWith("<");
}

async function parsePdfToText(buf: Buffer) {
  const mod: any = await import("pdf-parse");
  const pdfParse = mod?.default || mod;
  const out = await pdfParse(buf);
  return String(out?.text || "").replace(/\r\n/g, "\n").trim();
}

type OverlayRule = {
  ruleId: string;
  title: string;
  severity: "info" | "warn" | "error";
  type: "finding" | "condition" | "blocker";
  pattern: string; // JS-safe regex source
  source?: "overlay";
};

function buildBootstrapOverlayRules(text: string): OverlayRule[] {
  // KISS v1: deterministic “mention” rules so overlay pipeline is real without AI extraction yet.
  // Only keep rules that are likely to match common mortgage docs.
  const candidates: Array<{
    key: string;
    title: string;
    type: OverlayRule["type"];
    severity: OverlayRule["severity"];
    pattern: string;
  }> = [
    { key: "bank_statements_mentioned", title: "Bank statements referenced", type: "finding", severity: "info", pattern: "bank\\s+statements" },
    { key: "voe_mentioned", title: "Verification of employment mentioned", type: "finding", severity: "info", pattern: "verification\\s+of\\s+employment|\\bVOE\\b" },
    { key: "earnest_money_verification", title: "Provide documentation for earnest money / assets", type: "condition", severity: "warn", pattern: "earnest\\s+money|assets" },
    { key: "title_appraisal_required", title: "Confirm appraisal + title are satisfactory", type: "condition", severity: "warn", pattern: "appraisal|\\btitle\\b" },
    { key: "signed_initial_disclosures", title: "Provide signed initial disclosures", type: "condition", severity: "warn", pattern: "disclosures?" },
  ];

  const lowered = text.toLowerCase();
  const rules: OverlayRule[] = [];

  for (const c of candidates) {
    // quick check: try the first “wordish” token from the pattern
    const token = c.pattern
      .replace(/\\b/g, "")
      .replace(/\\s\+/g, " ")
      .replace(/[()|?]/g, " ")
      .trim()
      .split(/\s+/)[0];

    if (!token || lowered.includes(token.toLowerCase())) {
      rules.push({
        ruleId: `overlay.${c.type}.${c.key}`,
        title: c.title,
        severity: c.severity,
        type: c.type,
        pattern: c.pattern,
        source: "overlay",
      });
    }
  }

  // Ensure overlay never ends up empty.
  if (rules.length === 0) {
    rules.push({
      ruleId: "overlay.finding.overlay_processed",
      title: "Overlay document processed",
      severity: "info",
      type: "finding",
      pattern: ".*",
      source: "overlay",
    });
  }

  return rules;
}

export async function POST(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "403: Invalid demo token" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as any;

  const companyProfileId = String(body?.companyProfileId || "");
  const programKey = String(body?.programKey || "");
  const objectPath = String(body?.objectPath || "");
  const overlayName = body?.overlayName ? String(body.overlayName) : null;

  if (!companyProfileId || !programKey || !objectPath) {
    return NextResponse.json(
      {
        ok: false,
        error: "Missing required fields: companyProfileId, programKey, objectPath",
        exampleBody: {
          companyProfileId: "demo-company-strict-001",
          programKey: "conventional_purchase",
          objectPath: "applications/<appId>/<file>.pdf",
          overlayName: "Overlay from storage",
        },
      },
      { status: 400 }
    );
  }

  const { db, bucket } = initAdmin();

  const programDocId = `program-${companyProfileId}-${programKey}`;
  const programRef = db.collection("programs").doc(programDocId);
  const programSnap = await programRef.get();

  if (!programSnap.exists) {
    return NextResponse.json({ ok: false, error: `Program not found: programs/${programDocId}` }, { status: 400 });
  }

  const program = programSnap.data() as any;
  const existingHistory = Array.isArray(program?.overlays) ? program.overlays : [];
  const nextVersion = existingHistory.length + 1;

  const overlayId = `overlay-${companyProfileId}-${programKey}-v${nextVersion}`;
  const overlayRef = db.collection("overlays").doc(overlayId);

  // Download PDF from Storage
  const file = bucket.file(objectPath);
  const [buf] = await file.download();

  if (!buf || buf.length < 50) {
    return NextResponse.json({ ok: false, error: `Downloaded file too small (${buf?.length || 0} bytes)` }, { status: 400 });
  }
  if (looksLikeHtml(buf)) {
    return NextResponse.json({ ok: false, error: "Downloaded content looks like HTML, not PDF." }, { status: 400 });
  }

  // Extract text
  const text = await parsePdfToText(buf);
  if (!text) {
    return NextResponse.json({ ok: false, error: "Extracted text was empty." }, { status: 400 });
  }

  // Build deterministic rules (bootstrap)
  const rules = buildBootstrapOverlayRules(text);

  const overlayDoc = {
    overlayId,
    id: overlayId,

    companyProfileId,
    programKey,
    programId: programDocId,

    name: overlayName || `Overlay v${nextVersion} (${programKey})`,
    version: nextVersion,
    status: "active",

    sourceFile: {
      objectPath,
      createdAt: nowIso(),
    },

    rules,
    ruleCount: rules.length,
    extractedTextLength: text.length,

    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  await overlayRef.set(overlayDoc, { merge: false });

  const historyEntry = {
    overlayId,
    version: nextVersion,
    createdAt: nowIso(),
    source: "from-storage",
  };

  await programRef.set(
    {
      activeOverlayId: overlayId,
      overlays: [...existingHistory, historyEntry],
      updatedAt: nowIso(),
    },
    { merge: true }
  );

  return NextResponse.json(
    {
      ok: true,
      programDocId,
      overlayId,
      overlayRuleCount: rules.length,
      setActiveOverlayId: true,
    },
    { status: 200 }
  );
}