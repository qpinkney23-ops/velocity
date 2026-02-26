import { NextResponse } from "next/server";
import { initAdmin } from "@/lib/firebase-admin";
import crypto from "crypto";

export const runtime = "nodejs";

const LEASE_MS = 5 * 60 * 1000; // 5 minutes
const LEASE_FIELD = "workerLease"; // { holder, stage, claimedAt, expiresAt }

function assertWorkerAuth(req: Request) {
  const expected = process.env.WORKER_SECRET || process.env.X_WORKER_SECRET || "";
  if (!expected) throw new Error("500: WORKER_SECRET missing on server");
  const got = req.headers.get("x-worker-secret") || "";
  if (!got || got !== expected) throw new Error("401: Unauthorized (bad x-worker-secret)");
}

function is401(err: unknown) {
  return typeof err === "object" && err !== null && String((err as any).message || "").startsWith("401:");
}

function errToObj(e: any) {
  return {
    name: e?.name || "Error",
    message: e?.message || String(e),
    stack: e?.stack || null,
  };
}

type Rule = {
  ruleId: string;
  title: string;
  severity?: "info" | "warn" | "error";
  pattern?: string; // JS regex string
  type?: "finding" | "condition" | "blocker";
  source?: "base" | "overlay";
};

function safeRegex(pattern: string): RegExp | null {
  try {
    return new RegExp(pattern, "i");
  } catch {
    return null;
  }
}

function firstMatchEvidence(re: RegExp, text: string): string {
  const m = text.match(re);
  if (!m) return "No match";
  const s = (m[0] || "").trim();
  return s ? `Matched: "${s.slice(0, 160)}"` : "Matched pattern";
}

async function claimOneAnalyzingJob(db: any, admin: any) {
  const leaseId = crypto.randomUUID();
  const now = admin.firestore.Timestamp.now();
  const expiresAt = admin.firestore.Timestamp.fromMillis(now.toMillis() + LEASE_MS);

  const claimed = await db.runTransaction(async (tx: any) => {
    const q = db
      .collection("applications")
      .where("processingStage", "==", "analyzing")
      .orderBy("updatedAt", "asc")
      .limit(1);

    const snap = await tx.get(q);
    if (snap.empty) return null;

    const doc = snap.docs[0];
    const ref = doc.ref;

    const fresh = await tx.get(ref);
    if (!fresh.exists) return null;

    const app = fresh.data() as any;
    const stage = String(app?.processingStage || "");
    if (stage !== "analyzing") return null;

    const lease = app?.[LEASE_FIELD] || null;
    const leaseExpiresMs = lease?.expiresAt?.toMillis ? lease.expiresAt.toMillis() : 0;
    const leaseActive = lease && leaseExpiresMs && leaseExpiresMs > now.toMillis();

    if (leaseActive) return null;

    tx.set(
      ref,
      {
        [LEASE_FIELD]: {
          holder: leaseId,
          stage: "analyzing",
          claimedAt: now,
          expiresAt,
        },
        aiStartedAt: now,
        updatedAt: now,
      },
      { merge: true }
    );

    return { leaseId, ref, appId: ref.id, app };
  });

  return claimed;
}

async function releaseLease(ref: any, admin: any, reason: "success" | "failed" | "skipped") {
  const now = admin.firestore.Timestamp.now();
  await ref.set(
    {
      [LEASE_FIELD]: null,
      leaseReleasedAt: now,
      leaseReleaseReason: reason,
      updatedAt: now,
    },
    { merge: true }
  );
}

export async function POST(req: Request) {
  try {
    assertWorkerAuth(req);

    const { db, admin } = initAdmin();
    const now = admin.firestore.Timestamp.now();

    // 1) Claim (lock) one job
    const claimed = await claimOneAnalyzingJob(db, admin);
    if (!claimed) {
      return NextResponse.json({ ok: true, processed: 0, msg: "No claimable analyzing jobs." }, { status: 200 });
    }

    const { ref, appId } = claimed;

    // 2) Re-read authoritative data
    const snap = await ref.get();
    const app = (snap.data() || {}) as any;

    if (String(app?.processingStage || "") !== "analyzing") {
      await releaseLease(ref, admin, "skipped");
      return NextResponse.json({ ok: true, processed: 0, appId, msg: "Job no longer in analyzing; skipped." }, { status: 200 });
    }

    const companyProfileId = String(app?.companyProfileId || "");
    const text = String(app?.extractedTextCombined || app?.extractedText || "");

    // Hard requirements for analysis
    if (!companyProfileId) {
      // Deterministic: complete with conditional + error recorded (but do not crash loop).
      await ref.set(
        {
          processingStage: "ai_completed",
          decision: "conditional",
          lastError: "App missing companyProfileId (cannot choose rulepack)",
          error: "App missing companyProfileId (cannot choose rulepack)",
          aiCompletedAt: now,
          updatedAt: now,
        },
        { merge: true }
      );
      await releaseLease(ref, admin, "failed");
      return NextResponse.json({ ok: true, processed: 1, appId, decision: "conditional", matched: 0, conditionsMatched: 0, msg: "Missing companyProfileId; completed as conditional." }, { status: 200 });
    }

    if (!text || text.trim().length === 0) {
      await ref.set(
        {
          processingStage: "ai_completed",
          decision: "conditional",
          lastError: "Missing extractedTextCombined (cannot evaluate rules)",
          error: "Missing extractedTextCombined (cannot evaluate rules)",
          aiCompletedAt: now,
          updatedAt: now,
        },
        { merge: true }
      );
      await releaseLease(ref, admin, "failed");
      return NextResponse.json({ ok: true, processed: 1, appId, decision: "conditional", matched: 0, conditionsMatched: 0, msg: "Missing extracted text; completed as conditional." }, { status: 200 });
    }

    // 3) Company profile -> rulePackId (NO silent fallback)
    const companySnap = await db.collection("companyProfiles").doc(companyProfileId).get();
    if (!companySnap.exists) {
      await ref.set(
        {
          processingStage: "ai_completed",
          decision: "conditional",
          lastError: `Company profile not found: ${companyProfileId}`,
          error: `Company profile not found: ${companyProfileId}`,
          aiCompletedAt: now,
          updatedAt: now,
        },
        { merge: true }
      );
      await releaseLease(ref, admin, "failed");
      return NextResponse.json({ ok: true, processed: 1, appId, decision: "conditional", matched: 0, conditionsMatched: 0, companyProfileId, msg: "Company profile missing; completed as conditional." }, { status: 200 });
    }

    const company = companySnap.data() as any;
    const rulePackId = String(company?.rulePackId || "");
    if (!rulePackId) {
      await ref.set(
        {
          processingStage: "ai_completed",
          decision: "conditional",
          lastError: `companyProfiles/${companyProfileId} missing rulePackId`,
          error: `companyProfiles/${companyProfileId} missing rulePackId`,
          aiCompletedAt: now,
          updatedAt: now,
        },
        { merge: true }
      );
      await releaseLease(ref, admin, "failed");
      return NextResponse.json({ ok: true, processed: 1, appId, decision: "conditional", matched: 0, conditionsMatched: 0, companyProfileId, msg: "Missing rulePackId; completed as conditional." }, { status: 200 });
    }

    // 4) Load base rule pack
    const packSnap = await db.collection("rulePacks").doc(rulePackId).get();
    if (!packSnap.exists) {
      await ref.set(
        {
          processingStage: "ai_completed",
          decision: "conditional",
          lastError: `Rule pack not found: ${rulePackId}`,
          error: `Rule pack not found: ${rulePackId}`,
          aiCompletedAt: now,
          updatedAt: now,
        },
        { merge: true }
      );
      await releaseLease(ref, admin, "failed");
      return NextResponse.json({ ok: true, processed: 1, appId, decision: "conditional", matched: 0, conditionsMatched: 0, rulePackId, companyProfileId, msg: "Rule pack missing; completed as conditional." }, { status: 200 });
    }

    const pack = packSnap.data() as any;
    const baseRules: Rule[] = Array.isArray(pack?.rules) ? pack.rules.map((r: any) => ({ ...r, source: "base" })) : [];
    const rulePackVersion = String(pack?.rulePackVersion || "1");

    // 5) Overlay lookup (program -> activeOverlayId -> overlay rules)
    const programId = app?.programId ? String(app.programId) : null;
    let programName: string | null = app?.programName ? String(app.programName) : null;

    let overlayApplied = false;
    let overlayRuleCount = 0;
    let overlayId: string | null = null;
    let overlayName: string | null = null;

    let overlayRules: Rule[] = [];

    if (programId) {
      const programSnap = await db.collection("programs").doc(programId).get();
      if (programSnap.exists) {
        const program = programSnap.data() as any;
        programName = programName || (program?.name ? String(program.name) : null);

        const activeOverlayId = program?.activeOverlayId ? String(program.activeOverlayId) : null;
        if (activeOverlayId) {
          const overlaySnap = await db.collection("overlays").doc(activeOverlayId).get();
          if (overlaySnap.exists) {
            const overlay = overlaySnap.data() as any;
            overlayId = activeOverlayId;
            overlayName = overlay?.name ? String(overlay.name) : activeOverlayId;

            const or: Rule[] = Array.isArray(overlay?.rules)
              ? overlay.rules.map((r: any) => ({ ...r, source: "overlay" }))
              : [];

            overlayRules = or;
            overlayApplied = true;
            overlayRuleCount = or.length;
          }
        }
      }
    }

    // 6) Evaluate merged rules
    const rules: Rule[] = [...baseRules, ...overlayRules];

    const matchedFindings: any[] = [];
    const conditions: any[] = [];
    const blockers: any[] = [];

    for (const r of rules) {
      const type = (r.type || "finding") as Rule["type"];
      const pattern = (r.pattern || "").trim();
      if (!pattern) continue;

      const re = safeRegex(pattern);
      if (!re) continue;

      if (re.test(text)) {
        const item = {
          ruleId: r.ruleId,
          title: r.title,
          severity: r.severity || (type === "blocker" ? "error" : "warn"),
          evidence: firstMatchEvidence(re, text),
          source: r.source || "base",
        };

        if (type === "condition") conditions.push(item);
        else if (type === "blocker") blockers.push(item);
        else matchedFindings.push(item);
      }
    }

    let decision: "pass" | "conditional" | "fail" = "pass";
    if (blockers.length) decision = "fail";
    else if (conditions.length) decision = "conditional";

    const summary = `Rules evaluated: ${rules.length}. Findings matched: ${matchedFindings.length}. Conditions matched: ${conditions.length}. Decision: ${decision}.`;

    const evaluatedAt = now;
    const evaluatedAtIso = now.toDate().toISOString();

    const decisionArtifactPublic = {
      appId,
      rulePackId,
      companyProfileId,

      programId: programId || null,
      programName: programName || null,

      overlayApplied,
      overlayId,
      overlayName,
      overlayRuleCount,

      decision,
      summary,

      matchedFindings,
      findings: matchedFindings, // compatibility
      conditions,

      evaluatedAt: evaluatedAtIso,
    };

    const decisionArtifactRaw = {
      appId,
      rulePackId,
      rulePackVersion,
      companyProfileId,

      programId: programId || null,
      programName: programName || null,

      overlayApplied,
      overlayId,
      overlayName,
      overlayRuleCount,

      decision,
      summary,
      matchedFindings,
      conditions,
      blockers,
      evaluatedAt,
      notes: [],
    };

    // 7) Persist + advance stage
    await ref.set(
      {
        processingStage: "ai_completed",
        decision,
        decisionArtifactPublic,
        decisionArtifactRaw,
        aiCompletedAt: now,
        updatedAt: now,
        lastError: null,
        error: null,
      },
      { merge: true }
    );

    await releaseLease(ref, admin, "success");

    return NextResponse.json(
      {
        ok: true,
        processed: 1,
        appId,
        decision,
        matched: matchedFindings.length,
        conditionsMatched: conditions.length,
        rulePackId,
        companyProfileId,
        programId: programId || null,
        overlayApplied,
        overlayRuleCount,
      },
      { status: 200 }
    );
  } catch (err: any) {
    const msg = String(err?.message || err);

    // If we fail before claiming, nothing to release.
    // If we fail after claiming, we don't have the ref here, so we just return the error.
    // (The lease expires automatically via expiresAt, so it will self-heal.)
    if (is401(err)) return NextResponse.json({ ok: false, error: msg }, { status: 401 });
    if (msg.startsWith("500:")) return NextResponse.json({ ok: false, error: msg }, { status: 500 });

    return NextResponse.json({ ok: false, error: msg, detail: errToObj(err) }, { status: 500 });
  }
}