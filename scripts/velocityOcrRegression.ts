import { runOcr } from "../lib/ocr";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

async function testImageUploadAttemptsTesseractAndFailsClosedOnGarbageBytes() {
  const result = await runOcr({
    fileBuffer: Buffer.from("not a real mortgage document image"),
    fileName: "phone_upload.heic",
    preferredEngine: "native",
  });

  assert(result, "OCR result missing");
  assert(result.ok === false, "Expected garbage image OCR to fail closed");
  assert(result.inputType === "image", `Expected image input type, got ${result.inputType}`);
  assert(result.engine === "tesseract", `Expected tesseract engine for image input, got ${result.engine}`);
  assert(result.confidence === 0, `Expected confidence 0, got ${result.confidence}`);
  assert(result.confidenceLabel === "low", `Expected low confidence, got ${result.confidenceLabel}`);
  assert(result.extractedText === "", "Expected empty extractedText for unreadable image bytes");
  assert(Array.isArray(result.pages), "Expected pages array");
  assert(result.pages.length === 1, `Expected 1 page result, got ${result.pages.length}`);
  assert(result.pages[0].confidenceLabel === "low", "Expected page confidence label low");
  assert(result.diagnostics.attemptedImagePipeline === true, "Expected attemptedImagePipeline true for image input");
  assert(result.diagnostics.extractedDirectText === false, "Expected extractedDirectText false");
  assert(result.diagnostics.usedFallback === false, "Expected usedFallback false when no OCR text is extracted");
  assert(Array.isArray(result.diagnostics.warnings), "Expected warnings array");
  assert(result.diagnostics.warnings.length > 0, "Expected warning for missing OCR text");
}

async function testUnknownExtensionFailsClosedWithoutTesseractAttempt() {
  const result = await runOcr({
    fileBuffer: Buffer.from("random bytes"),
    fileName: "mystery-file.bin",
  });

  assert(result.ok === false, "Expected unknown file to fail closed");
  assert(result.inputType === "unknown", `Expected unknown input type, got ${result.inputType}`);
  assert(result.engine === "native", `Expected unknown extension to remain native engine, got ${result.engine}`);
  assert(result.confidenceLabel === "low", `Expected low confidence, got ${result.confidenceLabel}`);
  assert(result.diagnostics.attemptedImagePipeline === false, "Expected no image pipeline attempt for unknown file");
  assert(result.diagnostics.usedFallback === false, "Expected no fallback for unknown file");
  assert(result.diagnostics.warnings.length > 0, "Expected warning for unknown file");
}

async function testPdfPathDoesNotCrashAndFailsClosedWithoutUnsafeRawPdfOcr() {
  const result = await runOcr({
    fileBuffer: Buffer.from("%PDF-1.4 fake pdf body"),
    fileName: "fake.pdf",
  });

  assert(result, "PDF OCR result missing");
  assert(result.inputType === "pdf", `Expected pdf input type, got ${result.inputType}`);
  assert(result.engine === "native", `Expected native engine for PDF without rasterization, got ${result.engine}`);
  assert(typeof result.ok === "boolean", "Expected ok boolean");
  assert(typeof result.confidence === "number", "Expected numeric confidence");
  assert(Array.isArray(result.pages), "Expected pages array");
  assert(result.pages.length === 1, "Expected one page result");
  assert(result.diagnostics.attemptedImagePipeline === false, "Expected no unsafe raw-PDF image pipeline attempt");
  assert(result.diagnostics.usedFallback === false, "Expected no fallback used for raw PDF bytes");
  assert(Array.isArray(result.diagnostics.warnings), "Expected warnings array");
  assert(
    result.diagnostics.warnings.some((warning) =>
      warning.toLowerCase().includes("pdf direct text extraction returned no usable text")
    ),
    "Expected PDF direct text failure warning"
  );
  assert(
    result.diagnostics.warnings.some((warning) =>
      warning.toLowerCase().includes("rasterization")
    ),
    "Expected rasterization-required warning"
  );
}

async function run() {
  const tests = [
    [
      "image/phone upload attempts Tesseract and fails closed on garbage bytes",
      testImageUploadAttemptsTesseractAndFailsClosedOnGarbageBytes,
    ],
    [
      "unknown extension fails closed without Tesseract attempt",
      testUnknownExtensionFailsClosedWithoutTesseractAttempt,
    ],
    [
      "pdf path does not crash and fails closed without unsafe raw-PDF OCR",
      testPdfPathDoesNotCrashAndFailsClosedWithoutUnsafeRawPdfOcr,
    ],
  ] as const;

  let passed = 0;
  const failures: string[] = [];

  for (const [name, fn] of tests) {
    try {
      await fn();
      passed += 1;
      console.log(`PASS: ${name}`);
    } catch (error: any) {
      const message = error?.message || String(error);
      failures.push(`${name}: ${message}`);
      console.error(`FAIL: ${name}`);
      console.error(`  ${message}`);
    }
  }

  console.log(`\nOCR regression result: ${passed}/${tests.length} passed`);

  if (failures.length) {
    console.log("\nFailures:");

    for (const failure of failures) {
      console.log(`- ${failure}`);
    }

    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
