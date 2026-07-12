import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import PDFKit from "pdfkit";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { createCanvas } from "@napi-rs/canvas";
import { AUTHORIZED_DOCUMENT_BYTES_V1, DOCUMENT_RETRIEVAL_POLICY_VERSION } from "../lib/server/documents/authorizedDocumentBytes";
import { DOCUMENT_PROCESSING_POLICY, processAuthorizedDocumentBytes } from "../lib/server/documents/authorizedDocumentProcessing";
import { APPROVED_DOCUMENT_PROCESSING_DEPENDENCIES as adapter } from "../lib/server/documents/authorizedDocumentProcessingAdapter";

type Fixture = { contentType: "application/pdf" | "image/png" | "image/jpeg"; bytes: Uint8Array };

function envelope(fixture: Fixture, documentId: string) {
  return Object.freeze({
    schemaVersion: AUTHORIZED_DOCUMENT_BYTES_V1,
    tenantId: "tenant_synthetic",
    applicationId: "application_synthetic",
    documentId,
    documentAuthorizationVersion: "document-auth-synthetic-v1",
    contentType: fixture.contentType,
    sizeBytes: fixture.bytes.length,
    sha256: createHash("sha256").update(fixture.bytes).digest("hex"),
    bytes: new Uint8Array(fixture.bytes),
    retrievedAt: "2026-07-12T00:00:00.000Z",
    requestId: "request_synthetic",
    correlationId: "correlation_synthetic",
    retrievalPolicyVersion: DOCUMENT_RETRIEVAL_POLICY_VERSION,
    warnings: Object.freeze([]),
  });
}

async function image(text: string, type: "png" | "jpeg" = "png", width = 900, height = 220) {
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");
  context.fillStyle = "white";
  context.fillRect(0, 0, width, height);
  context.fillStyle = "black";
  context.font = "bold 58px sans-serif";
  if (text) context.fillText(text, 35, 130);
  return new Uint8Array(type === "jpeg" ? await canvas.encode("jpeg", 90) : await canvas.encode("png"));
}

async function nativePdf(lines: string[]) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (const line of lines) {
    const page = pdf.addPage([612, 792]);
    page.drawText(line, { x: 60, y: 700, size: 26, font, color: rgb(0, 0, 0) });
  }
  return new Uint8Array(await pdf.save());
}

async function scannedPdf(lines: string[]) {
  const pdf = await PDFDocument.create();
  for (const line of lines) {
    const bytes = await image(line);
    const embedded = await pdf.embedPng(bytes);
    const page = pdf.addPage([450, 110]);
    page.drawImage(embedded, { x: 0, y: 0, width: 450, height: 110 });
  }
  return new Uint8Array(await pdf.save());
}

async function mixedPdf() {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const native = pdf.addPage([612, 792]);
  native.drawText("NATIVE FIRST", { x: 60, y: 700, size: 26, font });
  const scan = await pdf.embedPng(await image("SCANNED SECOND"));
  const scanned = pdf.addPage([450, 110]);
  scanned.drawImage(scan, { x: 0, y: 0, width: 450, height: 110 });
  return new Uint8Array(await pdf.save());
}

async function encryptedPdf() {
  return await new Promise<Uint8Array>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const document = new PDFKit({ userPassword: "synthetic-password", ownerPassword: "synthetic-owner-password" });
    document.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    document.on("end", () => resolve(new Uint8Array(Buffer.concat(chunks))));
    document.on("error", reject);
    document.text("SYNTHETIC ENCRYPTED CONTENT");
    document.end();
  });
}

async function run(fixture: Fixture, id: string) {
  return processAuthorizedDocumentBytes(envelope(fixture, id), DOCUMENT_PROCESSING_POLICY, adapter);
}

async function main() {
  let passed = 0;
  const test = async (name: string, fn: () => Promise<void>) => {
    await fn();
    passed += 1;
    console.log(`PASS ${passed}: ${name}`);
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => { throw new Error("network fetch forbidden during document processing"); }) as typeof fetch;
  try {
    await test("native single and multipage PDF extraction", async () => {
      const result: any = await run({ contentType: "application/pdf", bytes: await nativePdf(["NATIVE ONE", "NATIVE TWO"]) }, "native_pdf");
      assert(result.ok, result.code);
      assert.deepEqual(result.value.pages.map((page: any) => page.text), ["NATIVE ONE", "NATIVE TWO"]);
      assert(result.value.pages.every((page: any) => page.method === "native_text"));
    });
    await test("scanned single-page PDF rasterizes and OCRs", async () => {
      const result: any = await run({ contentType: "application/pdf", bytes: await scannedPdf(["SCAN ALPHA"]) }, "scanned_pdf");
      assert(result.ok, result.code);
      assert.match(result.value.normalizedText, /SCAN ALPHA/i);
      assert.equal(result.value.pages[0].method, "ocr");
    });
    await test("scanned multipage PDF preserves page order", async () => {
      const result: any = await run({ contentType: "application/pdf", bytes: await scannedPdf(["PAGE ALPHA", "PAGE BETA"]) }, "scanned_multipage_pdf");
      assert(result.ok, result.code);
      assert.deepEqual(result.value.pages.map((page: any) => page.pageNumber), [1, 2]);
      assert.match(result.value.pages[0].text, /PAGE ALPHA/i);
      assert.match(result.value.pages[1].text, /PAGE BETA/i);
    });
    await test("mixed PDF keeps native text and OCRs only scanned page", async () => {
      const result: any = await run({ contentType: "application/pdf", bytes: await mixedPdf() }, "mixed_pdf");
      assert(result.ok, result.code);
      assert.deepEqual(result.value.pages.map((page: any) => page.method), ["native_text", "ocr"]);
      assert.match(result.value.pages[0].text, /NATIVE FIRST/i);
      assert.match(result.value.pages[1].text, /SCANNED SECOND/i);
    });
    await test("PNG and JPEG OCR use real image decoding", async () => {
      for (const type of ["png", "jpeg"] as const) {
        const result: any = await run({ contentType: type === "png" ? "image/png" : "image/jpeg", bytes: await image(`${type.toUpperCase()} ALPHA`, type) }, `${type}_image`);
        assert(result.ok, result.code);
        assert.match(result.value.normalizedText, new RegExp(`${type.toUpperCase()} ALPHA`, "i"));
      }
    });
    await test("blank image does not fabricate OCR text", async () => {
      const result: any = await run({ contentType: "image/png", bytes: await image("") }, "blank_image");
      assert(result.ok, result.code);
      assert.equal(result.value.normalizedText, "");
      assert(result.value.warnings.includes("empty_ocr"));
    });
    await test("malformed and encrypted PDFs fail closed", async () => {
      const malformed: any = await run({ contentType: "application/pdf", bytes: new TextEncoder().encode("not a pdf") }, "malformed_pdf");
      assert.equal(malformed.code, "DOCUMENT_MALFORMED");
      const encrypted: any = await run({ contentType: "application/pdf", bytes: await encryptedPdf() }, "encrypted_pdf");
      assert.equal(encrypted.code, "DOCUMENT_ENCRYPTED");
      assert(!encrypted.stages.some((stage: any) => stage.stage === "ocr_attempted" && stage.status === "completed"));
    });
    await test("oversized PDF page fails before rendering", async () => {
      const pdf = await PDFDocument.create();
      pdf.addPage([5000, 5000]);
      const result: any = await run({ contentType: "application/pdf", bytes: new Uint8Array(await pdf.save()) }, "oversized_pdf_page");
      assert.equal(result.code, "DOCUMENT_PIXEL_LIMIT_EXCEEDED");
    });
    await test("fingerprint, normalization, provenance, and stages are deterministic", async () => {
      const fixture = { contentType: "application/pdf" as const, bytes: await nativePdf([" A   B "]) };
      const first: any = await run(fixture, "deterministic_pdf");
      const second: any = await run(fixture, "deterministic_pdf");
      assert(first.ok && second.ok);
      assert.equal(first.value.processingFingerprint, second.value.processingFingerprint);
      assert.equal(first.value.normalizedText, "A B");
      assert.deepEqual(first.value.provenance, second.value.provenance);
      assert.deepEqual(first.value.stages.map((stage: any) => stage.stage), ["validated", "type_detected", "native_text_attempted", "rasterization_attempted", "ocr_attempted", "normalized", "completed"]);
      assert(first.value.stages.filter((stage: any) => stage.status === "skipped").every((stage: any) => stage.reason));
      assert(!/borrower|password|storagePath|bucket/i.test(JSON.stringify(first.value.provenance)));
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
  const adapterSource = await readFile("lib/server/documents/authorizedDocumentProcessingAdapter.ts", "utf8");
  assert(!/writeFile|mkdtemp|tmpdir|createWriteStream|child_process|spawn\(|exec\(/.test(adapterSource), "in-memory adapter must not write temp files or shell out");
  console.log(`Authorized document real-processing regression: ${passed}/${passed} passed`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
