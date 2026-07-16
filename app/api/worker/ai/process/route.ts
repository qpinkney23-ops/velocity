import { NextResponse } from "next/server";
import { initAdmin } from "@/lib/firebase-admin";
import crypto from "crypto";
import { abandonWorkerExecution, authorizeProductionWorker, completeWorkerExecution, lookupWorkerExecutionReceipt, reserveWorkerExecution } from "@/lib/server/workers/workerServiceAuth";

export const runtime = "nodejs";

const LEASE_MS = 5 * 60 * 1000; // 5 minutes
const LEASE_FIELD = "workerLease"; // { holder, stage, claimedAt, expiresAt }

function is401(err: unknown) {
  return typeof err === "object" && err !== null && String((err as any).message || "").startsWith("401:");
}

function errToObj(e: any) {
  return {
    code: "AI_PROCESSING_FAILED",
    message: "AI processing failed",
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

async function claimOneAnalyzingJob(db: any, admin: any, authorization: any) {
  const leaseId = crypto.randomUUID();
  const now = admin.firestore.Timestamp.now();
  const expiresAt = admin.firestore.Timestamp.fromMillis(now.toMillis() + LEASE_MS);

  const claimed = await db.runTransaction(async (tx: any) => {
    const q = db
      .collection("applications")
      .where("tenantId", "in", authorization.grant.tenantIds)
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
    if (app?.ownershipState !== "tenant_owned" || !authorization.grant.tenantIds.includes(app?.tenantId)) return null;
    if (Number(app?.workerAttempt || 0) >= 5) return null;
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
          servicePrincipalId: authorization.principal.servicePrincipalId,
          serviceGrantVersion: authorization.grant.grantVersion,
          leaseVersion: "worker-lease.v1",
          attempt: Math.min(Number(app?.workerAttempt || 0) + 1, 5),
          stage: "analyzing",
          claimedAt: now,
          expiresAt,
        },
        aiStartedAt: now,
        updatedAt: now,
      },
      { merge: true }
    );

    return { leaseId, ref, appId: ref.id, app, authorization };
  });

  return claimed;
}

async function releaseLease(ref: any, admin: any, reason: "success" | "failed" | "skipped", expectedLeaseId?: string, expectedPrincipalId?: string) {
  const now = admin.firestore.Timestamp.now();
  await ref.firestore.runTransaction(async (tx: any) => {
    const snapshot = await tx.get(ref), lease = snapshot.data()?.[LEASE_FIELD];
    if (!lease?.holder) throw new Error("stale worker lease");
    if ((expectedLeaseId && lease.holder !== expectedLeaseId) || (expectedPrincipalId && lease.servicePrincipalId !== expectedPrincipalId)) throw new Error("stale worker lease");
    tx.create(ref.collection("serviceExecutionAudits").doc(`${lease.holder}:${reason}`), { schemaVersion: "worker-service-audit.v1", executionId: lease.holder, worker: "ai", outcome: reason, servicePrincipalId: lease.servicePrincipalId, grantVersion: lease.serviceGrantVersion, attempt: lease.attempt, piiPresent: false, createdAt: now });
    if (reason === "success") tx.create(ref.collection("serviceExecutionReceipts").doc(lease.holder), { schemaVersion: "worker-service-receipt.v1", executionId: lease.holder, worker: "ai", status: "completed", attempt: lease.attempt, piiPresent: false, completedAt: now });
    tx.set(ref, { [LEASE_FIELD]: null, workerAttempt: lease.attempt, leaseReleasedAt: now, leaseReleaseReason: reason, updatedAt: now }, { merge: true });
  });
}

export async function POST(req: Request) {
  try {
    const service = await authorizeProductionWorker(req, "ai_worker");
    if (!service.ok) return NextResponse.json({ ok: false, error: { code: service.code, message: "Worker service authorization failed" }, requestId: service.requestId, correlationId: service.correlationId, retryable: false }, { status: service.code === "SERVICE_AUTH_REQUIRED" || service.code === "SERVICE_AUTH_INVALID" ? 401 : 403 });
    if (service.authorization.requestReplay) { const receipt = await lookupWorkerExecutionReceipt(service.authorization.executionFingerprint); return receipt ? NextResponse.json(receipt,{status:200}) : NextResponse.json({ok:false,error:{code:"SERVICE_REQUEST_REPLAYED",message:"Service request replayed"},requestId:service.authorization.principal.requestId,correlationId:service.authorization.principal.correlationId,retryable:false},{status:409}); }
    const command=await reserveWorkerExecution(service.authorization);if(command.status==="completed")return NextResponse.json(command.receipt,{status:200});if(command.status==="running")return NextResponse.json({ok:false,error:{code:"JOB_ALREADY_CLAIMED",message:"Worker execution already running"},requestId:service.authorization.principal.requestId,correlationId:service.authorization.principal.correlationId,retryable:true},{status:409});

    const { db, admin } = initAdmin();
    const now = admin.firestore.Timestamp.now();

    // 1) Claim (lock) one job
    const claimed = await claimOneAnalyzingJob(db, admin, service.authorization);
    if (!claimed) {
      const receipt={ok:true,status:"completed",executionId:`execution_${service.authorization.executionFingerprint.slice(0,24)}`,worker:"ai",processed:0,requestId:service.authorization.principal.requestId,correlationId:service.authorization.principal.correlationId};await completeWorkerExecution(service.authorization,receipt);return NextResponse.json(receipt,{status:200});
    }

    const { ref, appId } = claimed;
    const finish = async (processed: 0 | 1) => { const receipt={ok:true,status:"completed",executionId:claimed.leaseId,worker:"ai",processed,requestId:service.authorization.principal.requestId,correlationId:service.authorization.principal.correlationId};await completeWorkerExecution(service.authorization,receipt);return NextResponse.json(receipt,{status:200}); };
    try { if (process.env.GCLOUD_PROJECT?.startsWith("demo-") && req.headers.get("x-velocity-test-audit-failure") === "start") throw new Error("injected"); await ref.collection("serviceExecutionAudits").doc(`${claimed.leaseId}:start`).create({ schemaVersion: "worker-service-audit.v1", executionId: claimed.leaseId, worker: "ai", outcome: "started", servicePrincipalId: service.authorization.principal.servicePrincipalId, grantVersion: service.authorization.grant.grantVersion, requestId: service.authorization.principal.requestId, correlationId: service.authorization.principal.correlationId, piiPresent: false, createdAt: new Date().toISOString() }); } catch { await releaseLease(ref, admin, "failed").catch(() => undefined); await abandonWorkerExecution(service.authorization).catch(() => undefined); return NextResponse.json({ ok: false, error: { code: "AUDIT_REQUIRED", message: "Required service audit failed" }, requestId: service.authorization.principal.requestId, correlationId: service.authorization.principal.correlationId, retryable: true }, { status: 500 }); }
    if (process.env.GCLOUD_PROJECT?.startsWith("demo-") && req.headers.get("x-velocity-test-lease-mode")) await ref.set({ workerLease: { ...(await ref.get()).data()?.workerLease, holder: req.headers.get("x-velocity-test-lease-mode") === "stale" ? "stale_lease_holder" : claimed.leaseId, servicePrincipalId: req.headers.get("x-velocity-test-lease-mode") === "wrong_principal" ? "other_service" : service.authorization.principal.servicePrincipalId } }, { merge: true });

    // 2) Re-read authoritative data
    const snap = await ref.get();
    const app = (snap.data() || {}) as any;

    if (String(app?.processingStage || "") !== "analyzing") {
      await releaseLease(ref, admin, "skipped", claimed.leaseId, service.authorization.principal.servicePrincipalId);
      return finish(0);
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
      await releaseLease(ref, admin, "failed", claimed.leaseId, service.authorization.principal.servicePrincipalId);
      return finish(1);
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
      await releaseLease(ref, admin, "failed", claimed.leaseId, service.authorization.principal.servicePrincipalId);
      return finish(1);
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
      await releaseLease(ref, admin, "failed", claimed.leaseId, service.authorization.principal.servicePrincipalId);
      return finish(1);
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
      await releaseLease(ref, admin, "failed", claimed.leaseId, service.authorization.principal.servicePrincipalId);
      return finish(1);
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
      await releaseLease(ref, admin, "failed", claimed.leaseId, service.authorization.principal.servicePrincipalId);
      return finish(1);
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

    await releaseLease(ref, admin, "success", claimed.leaseId, service.authorization.principal.servicePrincipalId);
    const receipt={ok:true,status:"completed",executionId:claimed.leaseId,worker:"ai",processed:1,requestId:service.authorization.principal.requestId,correlationId:service.authorization.principal.correlationId};await completeWorkerExecution(service.authorization,receipt);return NextResponse.json(receipt,{status:200});
  } catch (err: any) {
    return NextResponse.json({ok:false,error:{code:"WORKER_EXECUTION_FAILED",message:"AI worker execution failed"},retryable:true},{status:500});
  }
}
