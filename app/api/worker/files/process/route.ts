import { NextResponse } from "next/server";
import { initAdmin } from "@/lib/firebase-admin";
import crypto from "crypto";
import { abandonWorkerExecution, authorizeProductionWorker, completeWorkerExecution, lookupWorkerExecutionReceipt, reserveWorkerExecution } from "@/lib/server/workers/workerServiceAuth";

export const runtime = "nodejs";

/**
 * Lease-based worker locking (single-claim).
 * - We DO NOT add new processing stages.
 * - We keep processingStage as your pipeline truth ("parsing" -> "analyzing").
 * - We add a short-lived lease so only 1 worker can own a job at a time.
 */

const LEASE_MS = 5 * 60 * 1000; // 5 minutes
const LEASE_FIELD = "workerLease"; // { holder, stage, claimedAt, expiresAt }

function is401(err: unknown) {
  return typeof err === "object" && err !== null && String((err as any).message || "").startsWith("401:");
}

function errToObj(e: any) {
  return {
    code: "DOCUMENT_PROCESSING_FAILED",
    message: "Document processing failed",
  };
}

function looksLikeHtml(buf: Buffer) {
  const head = buf.subarray(0, Math.min(buf.length, 200)).toString("utf8").trimStart().toLowerCase();
  return head.startsWith("<!doctype") || head.startsWith("<html") || head.startsWith("<");
}

function isLikelyXrefError(e: any) {
  const msg = String(e?.message || e || "").toLowerCase();
  return msg.includes("xref") || msg.includes("bad xref") || msg.includes("failed to parse");
}

async function parsePdfToText(buf: Buffer) {
  // pdf-parse uses pdf.js internally; dynamic import avoids bundling surprises.
  const mod: any = await import("pdf-parse");
  const pdfParse = mod?.default || mod;
  const out = await pdfParse(buf);
  return String(out?.text || "");
}

async function repairPdfBuffer(buf: Buffer): Promise<Buffer> {
  // Rewrites broken PDF structures (often fixes bad XRef entry).
  const mod: any = await import("pdf-lib");
  const PDFDocument = mod?.PDFDocument;
  if (!PDFDocument) throw new Error("pdf-lib not available for repair.");

  const doc = await PDFDocument.load(buf, { ignoreEncryption: true, updateMetadata: false } as any);
  const bytes = await doc.save({ useObjectStreams: false, addDefaultPage: false } as any);
  return Buffer.from(bytes);
}

async function downloadPdfWithRetry(bucket: any, objectPath: string) {
  let lastErr: any = null;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const file = bucket.file(objectPath);

      // Best-effort metadata sanity
      let meta: any = null;
      try {
        const [m] = await file.getMetadata();
        meta = m;
      } catch {
        meta = null;
      }

      const [buf] = await file.download();

      if (!buf || buf.length < 50) throw new Error(`Downloaded file too small (${buf?.length || 0} bytes).`);
      if (looksLikeHtml(buf)) {
        throw new Error(
          `Downloaded content looks like HTML, not a PDF. First bytes: ${buf.subarray(0, 60).toString("utf8")}`
        );
      }

      // If contentType looks wrong, we still proceed.
      void meta;

      return { buf, attempt };
    } catch (e: any) {
      lastErr = e;
    }
  }

  throw lastErr || new Error("Failed to download PDF.");
}

/**
 * Claim ONE parsing job with a short-lived lease.
 * If another worker owns the lease and it's not expired => return null (no job claimed).
 */
async function claimOneParsingJob(db: any, admin: any, authorization: any) {
  const leaseId = crypto.randomUUID();
  const now = admin.firestore.Timestamp.now();
  const expiresAt = admin.firestore.Timestamp.fromMillis(now.toMillis() + LEASE_MS);

  const claimed = await db.runTransaction(async (tx: any) => {
    const q = db
      .collection("applications")
      .where("tenantId", "in", authorization.grant.tenantIds)
      .where("processingStage", "==", "parsing")
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
    const documentId = String(app?.sourceDocumentId || "");
    if (!documentId) return null;
    const documentSnap = await tx.get(db.doc(`applicationDocuments/${documentId}`));
    const document = documentSnap.exists ? documentSnap.data() : undefined;
    const canonicalPrefix = `tenants/${app.tenantId}/applications/${ref.id}/documents/${documentId}/`;
    if (!document || document.ownershipState !== "tenant_owned" || document.tenantId !== app.tenantId || document.applicationId !== ref.id || typeof document.storagePath !== "string" || !document.storagePath.startsWith(canonicalPrefix)) return null;

    // Idempotency guard: if already moved forward, don't touch it.
    const stage = String(app?.processingStage || "");
    if (stage !== "parsing") return null;

    const lease = app?.[LEASE_FIELD] || null;
    const leaseExpiresMs = lease?.expiresAt?.toMillis ? lease.expiresAt.toMillis() : 0;
    const leaseActive = lease && leaseExpiresMs && leaseExpiresMs > now.toMillis();

    if (leaseActive) {
      // Another worker owns it right now.
      return null;
    }

    tx.set(
      ref,
      {
        [LEASE_FIELD]: {
          holder: leaseId,
          servicePrincipalId: authorization.principal.servicePrincipalId,
          serviceGrantVersion: authorization.grant.grantVersion,
          leaseVersion: "worker-lease.v1",
          attempt: Math.min(Number(app?.workerAttempt || 0) + 1, 5),
          stage: "parsing",
          claimedAt: now,
          expiresAt,
        },
        parsingStartedAt: now,
        updatedAt: now,
      },
      { merge: true }
    );

    return { leaseId, ref, appId: ref.id, app, objectPath: document.storagePath, authorization };
  });

  return claimed;
}

async function releaseLease(ref: any, admin: any, reason: "success" | "failed" | "skipped", expectedLeaseId?: string, expectedPrincipalId?: string) {
  const now = admin.firestore.Timestamp.now();
  await ref.firestore.runTransaction(async (tx: any) => {
    const snapshot = await tx.get(ref), lease = snapshot.data()?.[LEASE_FIELD];
    if (!lease?.holder) throw new Error("stale worker lease");
    if ((expectedLeaseId && lease.holder !== expectedLeaseId) || (expectedPrincipalId && lease.servicePrincipalId !== expectedPrincipalId)) throw new Error("stale worker lease");
    tx.create(ref.collection("serviceExecutionAudits").doc(`${lease.holder}:${reason}`), { schemaVersion: "worker-service-audit.v1", executionId: lease.holder, worker: "files", outcome: reason, servicePrincipalId: lease.servicePrincipalId, grantVersion: lease.serviceGrantVersion, attempt: lease.attempt, piiPresent: false, createdAt: now });
    if (reason === "success") tx.create(ref.collection("serviceExecutionReceipts").doc(lease.holder), { schemaVersion: "worker-service-receipt.v1", executionId: lease.holder, worker: "files", status: "completed", attempt: lease.attempt, piiPresent: false, completedAt: now });
    tx.set(ref, { [LEASE_FIELD]: null, workerAttempt: lease.attempt, leaseReleasedAt: now, leaseReleaseReason: reason, updatedAt: now }, { merge: true });
  });
}

export async function GET() {
  return NextResponse.json(
    { ok: true, route: "/api/worker/files/process", note: "POST processes (claims) 1 parsing job with a lease." },
    { status: 200 }
  );
}

export async function POST(req: Request) {
  try {
    const service = await authorizeProductionWorker(req, "files_worker");
    if (!service.ok) return NextResponse.json({ ok: false, error: { code: service.code, message: "Worker service authorization failed" }, requestId: service.requestId, correlationId: service.correlationId, retryable: false }, { status: service.code === "SERVICE_AUTH_REQUIRED" || service.code === "SERVICE_AUTH_INVALID" ? 401 : 403 });
    if (service.authorization.requestReplay) { const receipt = await lookupWorkerExecutionReceipt(service.authorization.executionFingerprint); return receipt ? NextResponse.json(receipt, { status: 200 }) : NextResponse.json({ ok:false,error:{code:"SERVICE_REQUEST_REPLAYED",message:"Service request replayed"},requestId:service.authorization.principal.requestId,correlationId:service.authorization.principal.correlationId,retryable:false },{status:409}); }
    const command = await reserveWorkerExecution(service.authorization); if (command.status === "completed") return NextResponse.json(command.receipt, { status: 200 }); if (command.status === "running") return NextResponse.json({ok:false,error:{code:"JOB_ALREADY_CLAIMED",message:"Worker execution already running"},requestId:service.authorization.principal.requestId,correlationId:service.authorization.principal.correlationId,retryable:true},{status:409});

    const { db, admin, bucket } = initAdmin();
    const now = admin.firestore.Timestamp.now();

    // 1) Claim (lock) one job
    const claimed = await claimOneParsingJob(db, admin, service.authorization);
    if (!claimed) {
      const receipt={ok:true,status:"completed",executionId:`execution_${service.authorization.executionFingerprint.slice(0,24)}`,worker:"files",processed:0,requestId:service.authorization.principal.requestId,correlationId:service.authorization.principal.correlationId};await completeWorkerExecution(service.authorization,receipt);return NextResponse.json(receipt,{status:200});
    }

    const { ref, appId, objectPath } = claimed;
    const finish = async (processed: 0 | 1) => { const receipt={ok:true,status:"completed",executionId:claimed.leaseId,worker:"files",processed,requestId:service.authorization.principal.requestId,correlationId:service.authorization.principal.correlationId};await completeWorkerExecution(service.authorization,receipt);return NextResponse.json(receipt,{status:200}); };
    try { if (process.env.GCLOUD_PROJECT?.startsWith("demo-") && req.headers.get("x-velocity-test-audit-failure") === "start") throw new Error("injected"); await ref.collection("serviceExecutionAudits").doc(`${claimed.leaseId}:start`).create({ schemaVersion: "worker-service-audit.v1", executionId: claimed.leaseId, worker: "files", outcome: "started", servicePrincipalId: service.authorization.principal.servicePrincipalId, grantVersion: service.authorization.grant.grantVersion, requestId: service.authorization.principal.requestId, correlationId: service.authorization.principal.correlationId, piiPresent: false, createdAt: new Date().toISOString() }); } catch { await releaseLease(ref, admin, "failed").catch(() => undefined); await abandonWorkerExecution(service.authorization).catch(() => undefined); return NextResponse.json({ ok: false, error: { code: "AUDIT_REQUIRED", message: "Required service audit failed" }, requestId: service.authorization.principal.requestId, correlationId: service.authorization.principal.correlationId, retryable: true }, { status: 500 }); }
    if (process.env.GCLOUD_PROJECT?.startsWith("demo-") && req.headers.get("x-velocity-test-lease-mode")) await ref.set({ workerLease: { ...(await ref.get()).data()?.workerLease, holder: req.headers.get("x-velocity-test-lease-mode") === "stale" ? "stale_lease_holder" : claimed.leaseId, servicePrincipalId: req.headers.get("x-velocity-test-lease-mode") === "wrong_principal" ? "other_service" : service.authorization.principal.servicePrincipalId } }, { merge: true });

    // 2) Re-read for authoritative data (avoid stale)
    const snap = await ref.get();
    const app = (snap.data() || {}) as any;

    // If someone manually moved stage forward while we held lease, skip safely.
    if (String(app?.processingStage || "") !== "parsing") {
      await releaseLease(ref, admin, "skipped", claimed.leaseId, service.authorization.principal.servicePrincipalId);
      return finish(0);
    }

    let extractedText = "";
    let extractor = "pdf-parse";
    let fallbackUsed = false;

    try {
      // 3) Download + parse
      const { buf, attempt } = await downloadPdfWithRetry(bucket, objectPath);

      try {
        extractedText = await parsePdfToText(buf);
      } catch (parseErr: any) {
        // Retry parse with a re-download if first attempt
        if (attempt === 1) {
          const { buf: buf2 } = await downloadPdfWithRetry(bucket, objectPath);
          extractedText = await parsePdfToText(buf2);
        } else {
          throw parseErr;
        }
      }

      extractedText = extractedText.replace(/\r\n/g, "\n").trim();
      if (!extractedText) throw new Error("PDF parsed but extractedText was empty.");

      // 4) Persist + advance stage
      await ref.set(
        {
          extractedTextCombined: extractedText,
          extractedTextLength: extractedText.length,
          extractor,
          fallbackUsed,

          processingStage: "analyzing",
          parsingCompletedAt: now,
          parsingError: null,

          updatedAt: now,
        },
        { merge: true }
      );

      await releaseLease(ref, admin, "success", claimed.leaseId, service.authorization.principal.servicePrincipalId);
      const receipt={ok:true,status:"completed",executionId:claimed.leaseId,worker:"files",processed:1,requestId:service.authorization.principal.requestId,correlationId:service.authorization.principal.correlationId};await completeWorkerExecution(service.authorization,receipt);return NextResponse.json(receipt,{status:200});
    } catch (e1: any) {
      // 5) Repair fallback for bad XRef
      try {
        if (!isLikelyXrefError(e1)) throw e1;

        const { buf: raw } = await downloadPdfWithRetry(bucket, objectPath);
        const repaired = await repairPdfBuffer(raw);

        fallbackUsed = true;
        extractor = "pdf-parse+pdf-lib-repair";

        extractedText = await parsePdfToText(repaired);
        extractedText = extractedText.replace(/\r\n/g, "\n").trim();
        if (!extractedText) throw new Error("Repair succeeded but extractedText was empty.");

        await ref.set(
          {
            extractedTextCombined: extractedText,
            extractedTextLength: extractedText.length,
            extractor,
            fallbackUsed,

            processingStage: "analyzing",
            parsingCompletedAt: now,
            parsingError: null,

            updatedAt: now,
          },
          { merge: true }
        );

        await releaseLease(ref, admin, "success", claimed.leaseId, service.authorization.principal.servicePrincipalId);
        const receipt={ok:true,status:"completed",executionId:claimed.leaseId,worker:"files",processed:1,requestId:service.authorization.principal.requestId,correlationId:service.authorization.principal.correlationId};await completeWorkerExecution(service.authorization,receipt);return NextResponse.json(receipt,{status:200});
      } catch (e2: any) {
        await ref.set(
          {
            processingStage: "parsing_failed",
            parsingError: errToObj(e2),
            parsingFailedAt: now,
            updatedAt: now,
          },
          { merge: true }
        );

        await releaseLease(ref, admin, "failed", claimed.leaseId, service.authorization.principal.servicePrincipalId);

        return NextResponse.json({ok:false,error:{code:"WORKER_EXECUTION_FAILED",message:"Files worker execution failed"},requestId:service.authorization.principal.requestId,correlationId:service.authorization.principal.correlationId,retryable:true},{status:500});
      }
    }
  } catch (err: any) {
    return NextResponse.json({ok:false,error:{code:"INTERNAL_ERROR",message:"Files worker failed"},retryable:true},{status:500});
  }
}
