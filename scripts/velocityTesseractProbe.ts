import fs from "fs/promises";
import path from "path";

const DEFAULT_TIMEOUT_MS = 120000;

type TesseractProbeResult = {
  data?: {
    text?: string;
    confidence?: number;
  };
};

function cleanSpaces(value: unknown): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  timeoutMessage: string
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, ms);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

async function main() {
  const rawPath = process.argv[2];

  if (!rawPath) {
    console.error("");
    console.error("Velocity Tesseract Probe");
    console.error("");
    console.error("Usage:");
    console.error("  npx tsx scripts/velocityTesseractProbe.ts \"C:\\\\path\\\\to\\\\image.png\"");
    console.error("");
    process.exitCode = 1;
    return;
  }

  const absolutePath = path.resolve(rawPath);
  const stat = await fs.stat(absolutePath).catch(() => null);

  if (!stat || !stat.isFile()) {
    console.error(`File not found: ${absolutePath}`);
    process.exitCode = 1;
    return;
  }

  console.log("");
  console.log("============================================================");
  console.log("VELOCITY TESSERACT LOCAL PROBE");
  console.log("============================================================");
  console.log(`File: ${absolutePath}`);
  console.log(`Bytes: ${stat.size}`);
  console.log(`Timeout: ${DEFAULT_TIMEOUT_MS}ms`);
  console.log("Loading tesseract.js...");

  const tesseract = await import("tesseract.js");

  console.log("tesseract.js loaded.");
  console.log("Creating worker...");

  let worker: any = null;

  try {
    const createWorker = (tesseract as any).createWorker;

    if (typeof createWorker !== "function") {
      throw new Error("tesseract.js createWorker API is not available.");
    }

    worker = await withTimeout(
      createWorker("eng", 1, {
        logger: (m: any) => {
          const status = cleanSpaces(m?.status || "");
          const progress =
            typeof m?.progress === "number"
              ? `${Math.round(m.progress * 100)}%`
              : "";

          if (status) {
            console.log(`[worker] ${status}${progress ? ` ${progress}` : ""}`);
          }
        },
      }),
      DEFAULT_TIMEOUT_MS,
      "Timed out while creating Tesseract worker."
    );

    console.log("Worker created.");
    console.log("Setting OCR parameters...");

    await withTimeout(
      worker.setParameters({
        tessedit_pageseg_mode: "6",
        preserve_interword_spaces: "1",
      }),
      DEFAULT_TIMEOUT_MS,
      "Timed out while setting Tesseract parameters."
    );

    console.log("Recognizing image...");

    const result = (await withTimeout(
      worker.recognize(absolutePath),
      DEFAULT_TIMEOUT_MS,
      "Timed out while recognizing image."
    )) as TesseractProbeResult;

    const text = cleanSpaces(result?.data?.text || "");
    const confidence =
      typeof result?.data?.confidence === "number"
        ? result.data.confidence
        : 0;

    console.log("");
    console.log("============================================================");
    console.log("OCR RESULT");
    console.log("============================================================");
    console.log(`Confidence: ${confidence}`);
    console.log(`Text length: ${text.length}`);
    console.log("Text:");
    console.log(text || "[EMPTY]");
    console.log("============================================================");
    console.log("");

    if (!text) {
      process.exitCode = 2;
    }
  } catch (error: any) {
    console.error("");
    console.error("============================================================");
    console.error("OCR PROBE FAILED");
    console.error("============================================================");
    console.error(error?.stack || error?.message || String(error));
    console.error("============================================================");
    console.error("");
    process.exitCode = 1;
  } finally {
    if (worker && typeof worker.terminate === "function") {
      await worker.terminate().catch(() => undefined);
    }
  }
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});
