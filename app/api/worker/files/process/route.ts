import { NextResponse } from "next/server";
import { initAdmin } from "@/lib/firebase-admin";
import crypto from "crypto";

export const runtime = "nodejs";

/**
 * Lease-based worker locking (single-claim).
 * - We DO NOT add new processing stages.
 * - We keep processingStage as your pipeline truth ("parsing" -> "analyzing").
 * - We add a short-lived lease so only 1 worker can own a job at a time.
 */

const LEASE_MS = 5 * 60 * 1000; // 5 minutes
const LEASE_FIELD = "workerLease"; // { holder, stage, claimedAt, expiresAt }

function assertWorkerAuth(req: Request) {
  const required = process.env.WORKER_SECRET || process.env.X_WORKER_SECRET || "";
  if (!required) return;
  const got = req.headers.get("x-worker-secret") || "";
  if (got !== required) throw new Error("401: Unauthorized (bad x-worker-secret)");
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
async function claimOneParsingJob(db: any, admin: any) {
  const leaseId = crypto.randomUUID();
  const now = admin.firestore.Timestamp.now();
  const expiresAt = admin.firestore.Timestamp.fromMillis(now.toMillis() + LEASE_MS);

  const claimed = await db.runTransaction(async (tx: any) => {
    const q = db
      .collection("applications")
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
          stage: "parsing",
          claimedAt: now,
          expiresAt,
        },
        parsingStartedAt: now,
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

export async function GET() {
  return NextResponse.json(
    { ok: true, route: "/api/worker/files/process", note: "POST processes (claims) 1 parsing job with a lease." },
    { status: 200 }
  );
}

export async function POST(req: Request) {
  try {
    assertWorkerAuth(req);

    const { db, admin, bucket } = initAdmin();
    const now = admin.firestore.Timestamp.now();

    // 1) Claim (lock) one job
    const claimed = await claimOneParsingJob(db, admin);
    if (!claimed) {
      return NextResponse.json({ ok: true, processed: 0, msg: "No claimable parsing jobs." }, { status: 200 });
    }

    const { ref, appId } = claimed;

    // 2) Re-read for authoritative data (avoid stale)
    const snap = await ref.get();
    const app = (snap.data() || {}) as any;

    const objectPath = String(app?.objectPath || "");
    if (!objectPath) {
      await ref.set(
        {
          processingStage: "parsing_failed",
          parsingError: { message: "Missing required field: objectPath" },
          parsingFailedAt: now,
          updatedAt: now,
        },
        { merge: true }
      );
      await releaseLease(ref, admin, "failed");
      return NextResponse.json({ ok: false, processed: 0, appId, error: "Missing required field: objectPath" }, { status: 500 });
    }

    // If someone manually moved stage forward while we held lease, skip safely.
    if (String(app?.processingStage || "") !== "parsing") {
      await releaseLease(ref, admin, "skipped");
      return NextResponse.json({ ok: true, processed: 0, appId, msg: "Job no longer in parsing; skipped." }, { status: 200 });
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

      await releaseLease(ref, admin, "success");

      return NextResponse.json(
        { ok: true, processed: 1, appId, extractor, extractedTextLength: extractedText.length, fallbackUsed },
        { status: 200 }
      );
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

        await releaseLease(ref, admin, "success");

        return NextResponse.json(
          { ok: true, processed: 1, appId, extractor, extractedTextLength: extractedText.length, fallbackUsed },
          { status: 200 }
        );
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

        await releaseLease(ref, admin, "failed");

        return NextResponse.json({ ok: false, error: String(e2?.message || e2), appId }, { status: 500 });
      }
    }
  } catch (err: any) {
    const msg = String(err?.message || err);
    if (is401(err)) return NextResponse.json({ ok: false, error: msg }, { status: 401 });
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}