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
    const timer = setTimeout(() => reject(new Error(timeoutMessage)), ms);

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

async function recognizeImage(imagePath: string) {
  const absolutePath = path.resolve(imagePath);
  const stat = await fs.stat(absolutePath).catch(() => null);

  if (!stat || !stat.isFile()) {
    throw new Error(`Image file not found: ${absolutePath}`);
  }

  const tesseract = await import("tesseract.js");
  const createWorker = (tesseract as any).createWorker;

  if (typeof createWorker !== "function") {
    throw new Error("tesseract.js createWorker API is not available.");
  }

  let worker: any = null;

  try {
    worker = await withTimeout(
      createWorker("eng", 1, {
        logger: () => undefined,
      }),
      DEFAULT_TIMEOUT_MS,
      "Timed out while creating Tesseract worker."
    );

    await withTimeout(
      worker.setParameters({
        tessedit_pageseg_mode: "6",
        preserve_interword_spaces: "1",
      }),
      DEFAULT_TIMEOUT_MS,
      "Timed out while setting Tesseract parameters."
    );

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

    return {
      ok: true,
      text,
      confidence,
    };
  } finally {
    if (worker && typeof worker.terminate === "function") {
      await worker.terminate().catch(() => undefined);
    }
  }
}

async function main() {
  const imagePath = process.argv[2];

  if (!imagePath) {
    console.log(
      JSON.stringify({
        ok: false,
        text: "",
        confidence: 0,
        error: "Missing image path argument.",
      })
    );

    process.exitCode = 1;
    return;
  }

  try {
    const result = await recognizeImage(imagePath);

    console.log(JSON.stringify(result));
  } catch (error: any) {
    console.log(
      JSON.stringify({
        ok: false,
        text: "",
        confidence: 0,
        error: error?.message || String(error),
      })
    );

    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.log(
    JSON.stringify({
      ok: false,
      text: "",
      confidence: 0,
      error: error?.message || String(error),
    })
  );

  process.exitCode = 1;
});
