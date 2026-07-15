import { createCanvas, loadImage } from "@napi-rs/canvas";
import { createWorker, type Worker } from "tesseract.js";
import path from "node:path";
import type { ProcessingDependencies, RawPage } from "./authorizedDocumentProcessing";

const localEnglishData = require("@tesseract.js-data/eng") as { langPath: string };
const standardFontDataUrl = `${path.join(process.cwd(), "node_modules", "pdfjs-dist", "standard_fonts")}${path.sep}`;

type PdfDocument = Awaited<ReturnType<typeof openPdf>>;

function processingError(code: string): Error & { code: string } {
  return Object.assign(new Error(code), { code });
}

async function openPdf(bytes: Uint8Array) {
  // pdfjs-dist 3.x's supported Node entry point is the CommonJS legacy build. Its
  // optional `canvas` import is supplied by the package alias to @napi-rs/canvas.
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.js");
  const task = getDocument({
    data: new Uint8Array(bytes),
    disableFontFace: true,
    useSystemFonts: false,
    isEvalSupported: false,
    stopAtErrors: true,
    standardFontDataUrl,
  });
  try {
    return await task.promise;
  } catch (error: any) {
    if (error?.name === "PasswordException" || /password/i.test(String(error?.message))) {
      throw processingError("DOCUMENT_ENCRYPTED");
    }
    throw processingError("DOCUMENT_MALFORMED");
  }
}

async function nativePages(pdf: PdfDocument, signal: AbortSignal): Promise<RawPage[]> {
  const pages: RawPage[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    if (signal.aborted) throw processingError("PROCESSING_TIMEOUT");
    const page = await pdf.getPage(pageNumber);
    try {
      const content = await page.getTextContent();
      const text = (content.items as any[])
        .map((item) => (typeof item.str === "string" ? item.str : ""))
        .join(" ");
      pages.push(Object.freeze({ pageNumber, text, method: "native_text", warnings: Object.freeze([]) }));
    } finally {
      page.cleanup();
    }
  }
  return pages;
}

async function recognize(worker: Worker, bytes: Uint8Array, pageNumber: number, signal: AbortSignal): Promise<RawPage> {
  if (signal.aborted) throw processingError("PROCESSING_TIMEOUT");
  try {
    const result = await worker.recognize(Buffer.from(bytes));
    const text = String(result.data.text || "");
    const confidence = Number(result.data.confidence || 0) / 100;
    const warnings: string[] = [];
    if (!text.trim()) warnings.push("empty_ocr");
    if (text.trim() && confidence < 0.8) warnings.push("low_confidence_ocr_unverified");
    return Object.freeze({
      pageNumber,
      text,
      method: "ocr",
      confidence,
      warnings: Object.freeze(warnings),
    });
  } catch (error: any) {
    if (signal.aborted) throw processingError("PROCESSING_TIMEOUT");
    throw Object.assign(new Error(String(error?.message || "OCR failed")), { code: "OCR_FAILED" });
  }
}

const createLocalWorker = () => createWorker("eng", 1, { langPath: localEnglishData.langPath });

export const APPROVED_DOCUMENT_PROCESSING_DEPENDENCIES: ProcessingDependencies = Object.freeze({
  engineId: "pdfjs+napi-canvas+tesseract",
  engineVersion: "pdfjs-3.11.174+napi-canvas-0.1.100+tesseract-5.1.1",

  async extractPdf(bytes, limits, signal) {
    const pdf = await openPdf(bytes);
    try {
      if (pdf.numPages > limits.maximumPdfPages) {
        return Object.freeze({ pageCount: pdf.numPages, pages: Object.freeze([]), requiresOcr: false });
      }
      const pages = await nativePages(pdf, signal);
      return Object.freeze({
        pageCount: pdf.numPages,
        pages: Object.freeze(pages),
        // Mixed PDFs use native text where present and OCR only for empty pages.
        requiresOcr: pages.some((page) => !page.text.trim()),
      });
    } finally {
      await pdf.destroy();
    }
  },

  async ocrPdf(bytes, limits, signal) {
    const pdf = await openPdf(bytes);
    let worker: Worker | undefined;
    try {
      if (pdf.numPages > limits.maximumPdfPages) throw processingError("DOCUMENT_PAGE_LIMIT_EXCEEDED");
      const native = await nativePages(pdf, signal);
      const pages: RawPage[] = [];
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const nativePage = native[pageNumber - 1];
        if (nativePage.text.trim()) {
          pages.push(nativePage);
          continue;
        }
        if (signal.aborted) throw processingError("PROCESSING_TIMEOUT");
        const page = await pdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 2 });
        const width = Math.ceil(viewport.width);
        const height = Math.ceil(viewport.height);
        if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
          throw processingError("DOCUMENT_MALFORMED");
        }
        if (width * height > limits.maximumImagePixels) throw processingError("DOCUMENT_PIXEL_LIMIT_EXCEEDED");
        const canvas = createCanvas(width, height);
        try {
          await page.render({ canvasContext: canvas.getContext("2d") as any, viewport } as any).promise;
          const png = new Uint8Array(await canvas.encode("png"));
          worker ??= await createLocalWorker();
          pages.push(await recognize(worker, png, pageNumber, signal));
        } finally {
          page.cleanup();
          canvas.width = 1;
          canvas.height = 1;
        }
      }
      return Object.freeze(pages);
    } finally {
      if (worker) await worker.terminate();
      await pdf.destroy();
    }
  },

  async ocrImage(bytes, _type, limits, signal) {
    let image;
    try {
      image = await loadImage(Buffer.from(bytes));
    } catch {
      throw processingError("DOCUMENT_MALFORMED");
    }
    if (image.width * image.height > limits.maximumImagePixels) {
      throw processingError("DOCUMENT_PIXEL_LIMIT_EXCEEDED");
    }
    const worker = await createLocalWorker();
    try {
      return Object.freeze({
        width: image.width,
        height: image.height,
        pages: Object.freeze([await recognize(worker, bytes, 1, signal)]),
      });
    } finally {
      await worker.terminate();
    }
  },
});
