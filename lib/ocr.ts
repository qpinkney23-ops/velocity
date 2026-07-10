import { execFile } from "child_process";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export type OcrEngine =
  | "native"
  | "tesseract"
  | "vision"
  | "document_ai"
  | "azure"
  | "textract";

export type OcrConfidence = "high" | "medium" | "low";
export type OcrInputType = "pdf" | "image" | "unknown";

export type OcrPageResult = {
  page: number;
  text: string;
  confidence: number;
  confidenceLabel: OcrConfidence;
  charsExtracted: number;
};

export type OcrResult = {
  ok: boolean;
  engine: OcrEngine;
  inputType: OcrInputType;
  sourceName: string;
  totalPages: number;
  confidence: number;
  confidenceLabel: OcrConfidence;
  extractedText: string;
  pages: OcrPageResult[];
  diagnostics: {
    usedFallback: boolean;
    extractedDirectText: boolean;
    attemptedImagePipeline: boolean;
    normalizedFile: boolean;
    warnings: string[];
  };
};

const CHILD_OCR_TIMEOUT_MS = 150000;
const MAX_DIRECT_IMAGE_OCR_BYTES = 8 * 1024 * 1024;

function cleanSpaces(value: unknown): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function confidenceLabel(score: number): OcrConfidence {
  if (score >= 0.85) return "high";
  if (score >= 0.6) return "medium";
  return "low";
}

function inferInputType(fileName: string): OcrInputType {
  const lower = fileName.toLowerCase();

  if (lower.endsWith(".pdf")) return "pdf";

  if (
    lower.endsWith(".jpg") ||
    lower.endsWith(".jpeg") ||
    lower.endsWith(".png") ||
    lower.endsWith(".webp") ||
    lower.endsWith(".heic")
  ) {
    return "image";
  }

  return "unknown";
}

function extensionForTempFile(fileName: string): string {
  const ext = path.extname(fileName || "").toLowerCase();

  if ([".png", ".jpg", ".jpeg", ".webp"].includes(ext)) return ext;

  return ".png";
}

function estimateTextConfidence(text: string): number {
  const clean = cleanSpaces(text);

  if (!clean) return 0;

  let score = 0.35;

  if (clean.length > 40) score += 0.1;
  if (clean.length > 100) score += 0.1;
  if (clean.length > 500) score += 0.1;

  if (/\bdriver\b/i.test(clean)) score += 0.08;
  if (/\blicense\b/i.test(clean)) score += 0.08;
  if (/\baddress\b/i.test(clean)) score += 0.06;
  if (/\bohio\b/i.test(clean)) score += 0.06;
  if (/\bdob\b/i.test(clean)) score += 0.06;
  if (/\bclass\b/i.test(clean)) score += 0.04;

  if (/\bborrower\b/i.test(clean)) score += 0.05;
  if (/\bincome\b/i.test(clean)) score += 0.05;
  if (/\bloan\b/i.test(clean)) score += 0.05;
  if (/\bproperty\b/i.test(clean)) score += 0.05;
  if (/\bcredit\b/i.test(clean)) score += 0.05;

  return Math.max(0, Math.min(1, round2(score)));
}

function estimateTesseractConfidence(
  rawConfidence: unknown,
  text: string
): number {
  const parsed =
    typeof rawConfidence === "number" && Number.isFinite(rawConfidence)
      ? rawConfidence
      : 0;

  const normalized = parsed > 1 ? parsed / 100 : parsed;
  const bounded = Math.max(0, Math.min(1, normalized));
  const textConfidence = estimateTextConfidence(text);

  if (!text) return 0;
  if (!bounded) return textConfidence;

  return round2(
    Math.max(0, Math.min(1, bounded * 0.7 + textConfidence * 0.3))
  );
}

async function extractDirectTextFromPdf(buffer: Buffer): Promise<string> {
  try {
    const pdfParse = (await import("pdf-parse")).default;
    const parsed = await pdfParse(buffer);

    return cleanSpaces(parsed?.text || "");
  } catch {
    return "";
  }
}

async function writeTempImageFile(buffer: Buffer, fileName: string): Promise<string> {
  const ext = extensionForTempFile(fileName);
  const tempName = `velocity-ocr-${Date.now()}-${Math.random()
    .toString(16)
    .slice(2)}${ext}`;

  const tempPath = path.join(os.tmpdir(), tempName);

  await fs.writeFile(tempPath, buffer);

  return tempPath;
}

function parseLastJsonLine(output: string): any {
  const lines = String(output || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .reverse();

  for (const line of lines) {
    try {
      return JSON.parse(line);
    } catch {
      continue;
    }
  }

  throw new Error("OCR child process did not return JSON.");
}

async function fallbackImagePipeline(
  buffer: Buffer,
  fileName: string
): Promise<{
  text: string;
  confidence: number;
  warnings: string[];
}> {
  const warnings: string[] = [];

  if (buffer.length > MAX_DIRECT_IMAGE_OCR_BYTES) {
    warnings.push(
      `Image OCR skipped safely because file is ${(buffer.length / 1024 / 1024).toFixed(
        2
      )}MB. Current direct OCR safety cap is ${(
        MAX_DIRECT_IMAGE_OCR_BYTES /
        1024 /
        1024
      ).toFixed(0)}MB. Compress/crop image or add preprocessing pipeline.`
    );

    return {
      text: "",
      confidence: 0,
      warnings,
    };
  }

  let tempPath = "";

  try {
    tempPath = await writeTempImageFile(buffer, fileName);

    warnings.push(
      `Tesseract OCR started in isolated child process with ${Math.round(
        CHILD_OCR_TIMEOUT_MS / 1000
      )}s timeout.`
    );

    const childScript = path.join(
      process.cwd(),
      "scripts",
      "velocityOcrChild.ts"
    );

    const { stdout, stderr } = await execFileAsync(
      process.platform === "win32" ? "cmd.exe" : "npx",
      process.platform === "win32"
        ? ["/c", "npx", "tsx", childScript, tempPath]
        : ["tsx", childScript, tempPath],
      {
        cwd: process.cwd(),
        timeout: CHILD_OCR_TIMEOUT_MS,
        windowsHide: true,
        maxBuffer: 1024 * 1024 * 10,
      }
    );

    if (stderr?.trim()) {
      warnings.push(`OCR child stderr: ${cleanSpaces(stderr).slice(0, 500)}`);
    }

    const result = parseLastJsonLine(stdout);

    if (!result?.ok) {
      warnings.push(
        `OCR child failed: ${result?.error || "Unknown child OCR failure."}`
      );

      return {
        text: "",
        confidence: 0,
        warnings,
      };
    }

    const text = cleanSpaces(result.text || "");

    const confidence = estimateTesseractConfidence(result.confidence, text);

    if (!text) {
      warnings.push("Tesseract OCR completed but did not extract usable text.");
    }

    return {
      text,
      confidence,
      warnings,
    };
  } catch (error: any) {
    warnings.push(
      `Tesseract OCR child process failed or timed out safely: ${
        error?.message || String(error)
      }`
    );

    return {
      text: "",
      confidence: 0,
      warnings,
    };
  } finally {
    if (tempPath) {
      await fs.unlink(tempPath).catch(() => undefined);
    }
  }
}

export async function runOcr(params: {
  filePath?: string;
  fileBuffer?: Buffer;
  fileName: string;
  preferredEngine?: OcrEngine;
}): Promise<OcrResult> {
  const {
    filePath,
    fileBuffer,
    fileName,
    preferredEngine = "native",
  } = params;

  let buffer: Buffer;

  if (fileBuffer) {
    buffer = fileBuffer;
  } else if (filePath) {
    buffer = await fs.readFile(path.resolve(filePath));
  } else {
    throw new Error("runOcr requires fileBuffer or filePath");
  }

  const inputType = inferInputType(fileName);

  let extractedText = "";
  let extractedDirectText = false;
  let attemptedImagePipeline = false;
  let usedFallback = false;
  let normalizedFile = false;
  let activeEngine: OcrEngine = preferredEngine;
  let fallbackConfidence = 0;

  const warnings: string[] = [];

  if (inputType === "pdf") {
    extractedText = await extractDirectTextFromPdf(buffer);

    if (extractedText) {
      extractedDirectText = true;
    }
  }

  if (!extractedText && inputType === "image") {
    attemptedImagePipeline = true;
    activeEngine = "tesseract";

    const fallback = await fallbackImagePipeline(buffer, fileName);

    extractedText = fallback.text;
    fallbackConfidence = fallback.confidence;

    warnings.push(...fallback.warnings);

    if (extractedText) {
      usedFallback = true;
    }
  }

  if (!extractedText && inputType === "pdf") {
    attemptedImagePipeline = false;
    activeEngine = preferredEngine;
    normalizedFile = false;

    warnings.push(
      "PDF direct text extraction returned no usable text. Image-based PDF OCR requires PDF page rasterization before Tesseract can safely run."
    );

    warnings.push(
      "Current safety behavior: fail closed instead of sending raw PDF bytes or native canvas binaries through Next build/runtime."
    );
  }

  if (inputType === "unknown") {
    warnings.push(
      "Unknown file type. OCR was not attempted because the file extension is not supported."
    );
  }

  extractedText = cleanSpaces(extractedText);

  if (!extractedText) {
    warnings.push(
      "No OCR text extracted. File may be image-only, corrupted, encrypted, unsupported, too large for direct OCR, or require advanced OCR."
    );
  }

  const confidence =
    fallbackConfidence > 0
      ? fallbackConfidence
      : estimateTextConfidence(extractedText);

  const label = confidenceLabel(confidence);

  console.log("\n================ OCR DEBUG ================");
  console.log("FILE:", fileName);
  console.log("INPUT TYPE:", inputType);
  console.log("ENGINE:", activeEngine);
  console.log("BUFFER BYTES:", buffer.length);
  console.log("CONFIDENCE:", confidence);
  console.log("TEXT LENGTH:", extractedText.length);
  console.log("WARNINGS:", warnings.join(" | ") || "none");
  console.log("TEXT:");
  console.log(extractedText || "[EMPTY]");
  console.log("===========================================\n");

  return {
    ok: extractedText.length > 0,
    engine: activeEngine,
    inputType,
    sourceName: fileName,
    totalPages: 1,
    confidence,
    confidenceLabel: label,
    extractedText,
    pages: [
      {
        page: 1,
        text: extractedText,
        confidence,
        confidenceLabel: label,
        charsExtracted: extractedText.length,
      },
    ],
    diagnostics: {
      usedFallback,
      extractedDirectText,
      attemptedImagePipeline,
      normalizedFile,
      warnings,
    },
  };
}
