import { NextResponse } from "next/server";
import { initAdmin } from "@/lib/firebase-admin";

export const runtime = "nodejs";

function assertWorkerAuth(req: Request) {
  const required = process.env.WORKER_SECRET || process.env.X_WORKER_SECRET || "";
  if (!required) return;
  const got = req.headers.get("x-worker-secret") || "";
  if (got !== required) throw new Error("401: Unauthorized (bad x-worker-secret)");
}

function is401(err: unknown) {
  return (
    typeof err === "object" &&
    err !== null &&
    String((err as any).message || "").startsWith("401:")
  );
}

function errToObj(e: any) {
  return {
    name: e?.name || "Error",
    message: e?.message || String(e),
    stack: e?.stack || null,
  };
}

function looksLikeHtml(buf: Buffer) {
  const head = buf
    .subarray(0, Math.min(buf.length, 200))
    .toString("utf8")
    .trimStart()
    .toLowerCase();
  return head.startsWith("<!doctype") || head.startsWith("<html") || head.startsWith("<");
}

function isLikelyXrefError(e: any) {
  const msg = String(e?.message || e || "").toLowerCase();
  return msg.includes("xref") || msg.includes("bad xref") || msg.includes("failed to parse") || msg.includes("pdf");
}

async function parsePdfToText(buf: Buffer) {
  // pdf-parse is commonly installed; use dynamic import to avoid bundling issues.
  const mod: any = await import("pdf-parse");
  const pdfParse = mod?.default || mod;
  const out = await pdfParse(buf);
  const text = String(out?.text || "");
  return text;
}

async function repairPdfBuffer(buf: Buffer): Promise<Buffer> {
  // Attempt to rewrite a broken PDF (rebuilds xref) using pdf-lib.
  // This often fixes "bad XRef entry" coming from pdf.js/pdf-parse.
  const mod: any = await import("pdf-lib");
  const PDFDocument = mod?.PDFDocument;
  if (!PDFDocument) throw new Error("pdf-lib not available for repair.");

  const doc = await PDFDocument.load(buf, {
    ignoreEncryption: true,
    updateMetadata: false,
  } as any);

  const bytes = await doc.save({
    useObjectStreams: false, // tends to be more compatible for downstream parsers
    addDefaultPage: false,
  } as any);

  return Buffer.from(bytes);
}

async function downloadPdfWithRetry(bucket: any, objectPath: string) {
  // Retry once because truncated/interrupted downloads can yield "bad XRef entry".
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

      if (!buf || buf.length < 50) {
        throw new Error(`Downloaded file is unexpectedly small (${buf?.length || 0} bytes).`);
      }

      if (looksLikeHtml(buf)) {
        throw new Error(
          `Downloaded content looks like HTML, not a PDF. (Possible auth/404 proxy page). First bytes: ${buf
            .subarray(0, 60)
            .toString("utf8")}`
        );
      }

      // Optional: if metadata says it isn't a PDF, flag it early (not fatal)
      const ct = String(meta?.contentType || "");
      if (ct && !ct.toLowerCase().includes("pdf")) {
        // still proceed
      }

      return { buf, meta, attempt };
    } catch (e: any) {
      lastErr = e;
      // brief retry on next loop
    }
  }

  throw lastErr || new Error("Failed to download PDF.");
}

export async function GET() {
  return NextResponse.json(
    { ok: true, route: "/api/worker/files/process", note: "POST processes 1 parsing job." },
    { status: 200 }
  );
}

export async function POST(req: Request) {
  try {
    assertWorkerAuth(req);

    const { db, admin, bucket } = initAdmin();
    const now = admin.firestore.Timestamp.now();

    // Pick ONE parsing job deterministically.
    const snap = await db
      .collection("applications")
      .where("processingStage", "==", "parsing")
      .orderBy("updatedAt", "asc")
      .limit(1)
      .get();

    if (snap.empty) {
      return NextResponse.json({ ok: true, processed: 0, msg: "No parsing jobs." }, { status: 200 });
    }

    const doc = snap.docs[0];
    const appId = doc.id;
    const app = doc.data() as any;

    const objectPath = String(app?.objectPath || "");
    if (!objectPath) {
      await doc.ref.set(
        {
          processingStage: "parsing_failed",
          parsingError: { message: "Missing required field: objectPath" },
          parsingFailedAt: now,
          updatedAt: now,
        },
        { merge: true }
      );

      return NextResponse.json(
        { ok: false, processed: 0, appId, error: "Missing required field: objectPath" },
        { status: 500 }
      );
    }

    // Mark start (do NOT change stage here; stage is already "parsing")
    await doc.ref.set(
      {
        parsingStartedAt: now,
        updatedAt: now,
      },
      { merge: true }
    );

    let extractedText = "";
    let extractor = "pdf-parse";
    let fallbackUsed = false;

    try {
      // Download (+ retry)
      const { buf, attempt } = await downloadPdfWithRetry(bucket, objectPath);

      try {
        // Primary parse
        extractedText = await parsePdfToText(buf);
      } catch (parseErr: any) {
        // If first download attempt, try re-download then parse
        if (attempt === 1) {
          const { buf: buf2 } = await downloadPdfWithRetry(bucket, objectPath);
          extractedText = await parsePdfToText(buf2);
        } else {
          throw parseErr;
        }
      }

      // Normalize/trim
      extractedText = extractedText.replace(/\r\n/g, "\n").trim();

      // If still empty OR parse threw earlier, attempt repair path
      if (!extractedText) {
        throw new Error("PDF parsed but extractedText was empty.");
      }

      await doc.ref.set(
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

      return NextResponse.json(
        {
          ok: true,
          processed: 1,
          appId,
          extractor,
          extractedTextLength: extractedText.length,
          fallbackUsed,
        },
        { status: 200 }
      );
    } catch (e1: any) {
      // REPAIR FALLBACK (for bad XRef, etc.)
      try {
        if (!isLikelyXrefError(e1)) throw e1;

        const { buf: raw } = await downloadPdfWithRetry(bucket, objectPath);

        const repaired = await repairPdfBuffer(raw);
        fallbackUsed = true;
        extractor = "pdf-parse+pdf-lib-repair";

        extractedText = await parsePdfToText(repaired);
        extractedText = extractedText.replace(/\r\n/g, "\n").trim();

        if (!extractedText) throw new Error("Repair succeeded but extractedText was empty.");

        await doc.ref.set(
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

        return NextResponse.json(
          {
            ok: true,
            processed: 1,
            appId,
            extractor,
            extractedTextLength: extractedText.length,
            fallbackUsed,
          },
          { status: 200 }
        );
      } catch (e2: any) {
        await doc.ref.set(
          {
            processingStage: "parsing_failed",
            parsingError: errToObj(e2),
            parsingFailedAt: now,
            updatedAt: now,
          },
          { merge: true }
        );

        return NextResponse.json(
          {
            ok: false,
            error: String(e2?.message || e2),
            appId,
          },
          { status: 500 }
        );
      }
    }
  } catch (err: any) {
    const msg = String(err?.message || err);
    if (is401(err)) return NextResponse.json({ ok: false, error: msg }, { status: 401 });
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}