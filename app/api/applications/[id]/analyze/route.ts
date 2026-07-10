import { NextResponse } from "next/server";
import { runOcr } from "@/lib/ocr";

// pdf-parse is CommonJS
const pdfParse: any = require("pdf-parse");

const VELOCITY_ANALYZE_ROUTE_VERSION = "stable_route_dirty_id_name_lock_v3";

// -------------------- helpers --------------------
function cleanSpaces(s: string) {
  return (s || "").replace(/\s+/g, " ").trim();
}

function pickFirstEmail(text: string): string {
  const m = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return m ? m[0] : "";
}

function stripNameLabel(s: string) {
  return cleanSpaces(
    s
      .replace(/^full\s*name[:\s-]*/i, "")
      .replace(/^borrower[:\s-]*/i, "")
      .replace(/^applicant[:\s-]*/i, "")
      .replace(/^name[:\s-]*/i, "")
  );
}

function normalizePersonName(value: string): string {
  const cleaned = cleanSpaces(value || "")
    .replace(/[|•·]/g, " ")
    .replace(/[^A-Za-z'.\-\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return "";

  const bad = [
    "driver license",
    "driver ligerse",
    "state of ohio",
    "ohio",
    "governor",
    "registrar",
    "license",
    "class",
    "sex",
    "eyes",
    "hair",
    "dob",
  ];

  const lower = cleaned.toLowerCase();
  if (bad.some((item) => lower.includes(item))) return "";

  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length < 2 || parts.length > 4) return "";
  if (!parts.every((part) => /^[A-Za-z][A-Za-z'.-]*$/.test(part))) return "";

  return parts
    .map((part) =>
      part === part.toUpperCase()
        ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
        : part.charAt(0).toUpperCase() + part.slice(1)
    )
    .join(" ");
}

function pickBorrowerName(text: string): string {
  const lines = text
    .split(/\r?\n/)
    .map((l) => cleanSpaces(l))
    .filter(Boolean);

  const candidates: string[] = [];

  for (const l of lines) {
    const lower = l.toLowerCase();

    if (l.length < 3) continue;
    if (l.length > 80) continue;
    if (lower.includes("@")) continue;
    if (/\d/.test(l)) continue;

    if (lower.startsWith("full name")) {
      const stripped = normalizePersonName(stripNameLabel(l));
      if (stripped) candidates.push(stripped);
      continue;
    }

    if (lower.startsWith("borrower") || lower.startsWith("applicant") || lower.startsWith("name")) {
      const after = cleanSpaces(l.split(":").slice(1).join(":"));
      const stripped = normalizePersonName(stripNameLabel(after || l));
      if (stripped) candidates.push(stripped);
      continue;
    }

    if (/^[A-Z][a-z]+(\s+[A-Z][a-z]+)+$/.test(l) || /^[A-Z]{2,}(\s+[A-Z]{2,})+$/.test(l)) {
      const normalized = normalizePersonName(stripNameLabel(l));
      if (normalized) candidates.push(normalized);
    }
  }

  return candidates.find((c) => c.split(/\s+/).length >= 2) || "";
}

function pickDirtyOcrDriverLicenseName(text: string): string {
  const flat = cleanSpaces(text);
  const upper = flat.toUpperCase();

  const licenseStart = upper.search(
    /\b(?:DRIVER\s+(?:LICENSE|LICENCE|LIGERSE|LICERSE)|STATE\s+OF\s+OHIO|GOVERNOR|REGISTRAR)\b/
  );

  const working = licenseStart >= 0 ? flat.slice(licenseStart) : flat;

  const rawTokens = working
    .replace(/[^A-Za-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim().toUpperCase())
    .filter(Boolean);

  const hardJunk = new Set([
    "A",
    "AE",
    "AN",
    "AND",
    "BA",
    "BE",
    "CJ",
    "D",
    "EE",
    "EEE",
    "EEEE",
    "EN",
    "ER",
    "ES",
    "F",
    "L",
    "LU",
    "M",
    "OY",
    "S",
    "SE",
    "THE",
    "TOHT",
    "TOA",
    "HHEVES",
    "ERNIE",
    "ERNI",
  ]);

  const docJunk = new Set([
    "DRIVER",
    "LICENSE",
    "LICENCE",
    "LICERSE",
    "LIGERSE",
    "STATE",
    "OHIO",
    "GOVERNOR",
    "REGISTRAR",
    "REGISTRA",
    "CLASS",
    "SEX",
    "EYES",
    "HAIR",
    "HEIGHT",
    "WEIGHT",
    "DONOR",
    "RESTRICTIONS",
    "ENDORSEMENTS",
    "ISSUE",
    "ISS",
    "EXPIRES",
    "EXP",
    "DOB",
    "NORTHROYALTON",
    "NORTH",
    "ROYALTON",
    "APT",
    "UNIT",
    "STE",
    "DR",
    "ST",
    "RD",
    "AVE",
    "BRO",
    "BLK",
    "BRN",
    "HAZ",
    "GRN",
    "BLU",
    "NORMAN",
    "DEWINE",
    "MIKE",
    "HILE",
    "HIKE",
    "SHAD",
  ]);

  const isLicenseNumber = (token: string) => {
    return /^[A-Z]{1,4}\d{4,10}$/.test(token) || /^\d{6,12}$/.test(token);
  };

  const isNameToken = (token: string) => {
    if (!/^[A-Z][A-Z'-]{2,24}$/.test(token)) return false;
    if (hardJunk.has(token)) return false;
    if (docJunk.has(token)) return false;
    if (isLicenseNumber(token)) return false;
    if (/^\d/.test(token)) return false;
    return true;
  };

  const normalizeLicenseName = (last: string, first: string, middle?: string) => {
    const candidate = normalizePersonName(
      middle ? `${first} ${middle} ${last}` : `${first} ${last}`
    );

    if (!candidate) return "";

    const parts = candidate.split(/\s+/);
    if (middle && parts.length !== 3) return "";
    if (!middle && parts.length !== 2) return "";

    return candidate;
  };

  for (let i = 0; i < rawTokens.length; i++) {
    if (!isLicenseNumber(rawTokens[i])) continue;

    const after = rawTokens.slice(i + 1, i + 14).filter(isNameToken);

    if (after.length >= 3) {
      const candidate = normalizeLicenseName(after[0], after[1], after[2]);
      if (candidate) return candidate;
    }

    if (after.length >= 2) {
      const candidate = normalizeLicenseName(after[0], after[1]);
      if (candidate) return candidate;
    }
  }

  const licenseWordIndex = rawTokens.findIndex((token) =>
    /^(LICENSE|LICENCE|LICERSE|LIGERSE)$/.test(token)
  );

  const searchTokens =
    licenseWordIndex >= 0 ? rawTokens.slice(licenseWordIndex + 1) : rawTokens;

  const cleanNameTokens = searchTokens.filter(isNameToken);

  for (let i = 0; i < cleanNameTokens.length - 2; i++) {
    const candidate = normalizeLicenseName(
      cleanNameTokens[i],
      cleanNameTokens[i + 1],
      cleanNameTokens[i + 2]
    );

    if (candidate) return candidate;
  }

  for (let i = 0; i < cleanNameTokens.length - 1; i++) {
    const candidate = normalizeLicenseName(cleanNameTokens[i], cleanNameTokens[i + 1]);
    if (candidate) return candidate;
  }

  return "";
}

function pickLoanAmount(text: string): number | null {
  const matches = text.match(/\$?\s*\d{1,3}(?:,\d{3})+(?:\.\d{2})?/g);
  if (!matches) return null;

  let best = 0;
  for (const raw of matches) {
    const cleaned = raw.replace(/[^0-9.]/g, "");
    const num = Number(cleaned);
    if (!isFinite(num)) continue;
    if (num > best && num <= 10_000_000) best = num;
  }
  return best > 0 ? best : null;
}

function pickDob(text: string): string {
  const labeled = text.match(/\b(?:dob|date of birth)[^0-9]{0,20}(0?[1-9]|1[0-2])[-\/](0?[1-9]|[12]\d|3[01])[-\/]((?:19)\d{2}|(?:20)(?:0\d|1\d|2[0-6]))\b/i);
  if (labeled) {
    return `${labeled[1].padStart(2, "0")}/${labeled[2].padStart(2, "0")}/${labeled[3]}`;
  }

  const matches = Array.from(
    text.matchAll(/\b(0?[1-9]|1[0-2])[-\/](0?[1-9]|[12]\d|3[01])[-\/]((?:19)\d{2}|(?:20)(?:0\d|1\d|2[0-6]))\b/g)
  );

  const normalized = matches
    .map((m) => `${m[1].padStart(2, "0")}/${m[2].padStart(2, "0")}/${m[3]}`)
    .filter((value) => {
      const year = Number(value.slice(-4));
      return year >= 1920 && year <= 2010;
    });

  return normalized[0] || "";
}

function pickSsnLast4(text: string): string {
  const m1 = text.match(/\b\d{3}-\d{2}-(\d{4})\b/);
  if (m1) return m1[1];

  const masked = text.match(/\b(?:x{3}|\*{3})-(?:x{2}|\*{2})-(\d{4})\b/i);
  if (masked) return masked[1];

  const m2 = text.match(/\b\d{9}\b/);
  if (m2) return m2[0].slice(-4);

  return "";
}

function pickIncome(text: string): number | null {
  const matches = text.match(/\$?\s*\d{1,3}(?:,\d{3})+(?:\.\d{2})?/g);
  if (!matches) return null;

  let best = 0;
  for (const raw of matches) {
    const cleaned = raw.replace(/[^0-9.]/g, "");
    const num = Number(cleaned);
    if (!isFinite(num)) continue;
    if (num > best && num <= 1_000_000) best = num;
  }
  return best > 0 ? best : null;
}

function pickCreditScore(text: string): number | null {
  const m = text.match(/credit\s*score[^0-9]{0,20}(\d{3})/i);
  if (m) return Number(m[1]);

  const all = text.match(/\b\d{3}\b/g) || [];
  for (const s of all) {
    const n = Number(s);
    if (n >= 300 && n <= 850) return n;
  }
  return null;
}

function normalizeAddressCandidate(value: string): string {
  return cleanSpaces(value)
    .replace(/\s+,/g, ",")
    .replace(/,\s*,/g, ",")
    .replace(/\bAPT\b/gi, "Apt")
    .replace(/\bDR\b/gi, "Dr")
    .replace(/\bST\b/gi, "St")
    .replace(/\bRD\b/gi, "Rd")
    .replace(/\bAVE\b/gi, "Ave")
    .trim();
}

function pickAddress(text: string): string {
  const normal = text.match(/\b\d{1,6}\s+[A-Za-z0-9.#'\-\s]+,\s*[A-Za-z.\s]+,\s*[A-Z]{2}\s*\d{5}\b/);
  if (normal) return normalizeAddressCandidate(normal[0]);

  const flat = cleanSpaces(text);

  const northRoyalton = flat.match(
    /\b(\d{1,6}\s+[A-Z0-9.#'\-\s]{3,90}?(?:\bAPT\b\s*[A-Z0-9-]+|\bUNIT\b\s*[A-Z0-9-]+|\bSTE\b\s*[A-Z0-9-]+|#[A-Z0-9-]+)?)\s+(NORTH\s*ROYALTON|NORTHROYALTON)\s*,?\s*(OH)\s*(\d{5})(?:-\d{4})?\b/i
  );

  if (northRoyalton) {
    const street = cleanSpaces(northRoyalton[1]);
    const state = northRoyalton[3].toUpperCase();
    const zip = northRoyalton[4];

    return normalizeAddressCandidate(`${street}, North Royalton, ${state} ${zip}`);
  }

  const general = flat.match(
    /\b(\d{1,6}\s+[A-Z0-9.#'\-\s]{3,90}?(?:\bAPT\b\s*[A-Z0-9-]+|\bUNIT\b\s*[A-Z0-9-]+|\bSTE\b\s*[A-Z0-9-]+|#[A-Z0-9-]+)?)\s+([A-Z][A-Z\s]{2,35})\s*,?\s*(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|IA|ID|IL|IN|KS|KY|LA|MA|MD|ME|MI|MN|MO|MS|MT|NC|ND|NE|NH|NJ|NM|NV|NY|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VA|VT|WA|WI|WV|WY)\s*(\d{5})(?:-\d{4})?\b/i
  );

  if (general) {
    return normalizeAddressCandidate(`${general[1]}, ${general[2]}, ${general[3]} ${general[4]}`);
  }

  return "";
}

function pickEmployerAddress(text: string): string {
  const m = text.match(/employer\s*address[^A-Za-z0-9]{0,20}(\d{1,6}\s+[A-Za-z0-9.\s]+,\s*[A-Za-z.\s]+,\s*[A-Z]{2}\s*\d{5})/i);
  return m ? normalizeAddressCandidate(m[1]) : "";
}

function classifyDocFromName(name: string) {
  const lower = name.toLowerCase();
  if (
    lower.includes("license") ||
    lower.includes("driver") ||
    lower.includes("photo id") ||
    lower.includes("photo_id") ||
    /(?:^|[._\-\s])id\d*(?:[._\-\s]|$)/i.test(lower)
  ) {
    return "id";
  }

  return "unknown";
}

function classifyDocFromText(text: string) {
  const lower = text.toLowerCase();

  if (
    lower.includes("driver license") ||
    lower.includes("driver's license") ||
    lower.includes("driver licence") ||
    lower.includes("driver ligerse") ||
    lower.includes("state of ohio") ||
    lower.includes("governor") ||
    lower.includes("registrar") ||
    lower.includes("license")
  ) {
    return "id";
  }

  return "unknown";
}

function buildSummary(text: string): string {
  const compact = cleanSpaces(text);
  const max = 1800;
  return compact.slice(0, max) + (compact.length > max ? "…" : "");
}

function buildConditions(text: string): { label: string; severity: "low" | "med" | "high"; evidence?: string }[] {
  const lower = text.toLowerCase();
  const conditions: { label: string; severity: "low" | "med" | "high"; evidence?: string }[] = [];

  const checks: Array<[string, string, "low" | "med" | "high"]> = [
    ["Bankruptcy mention", "bankruptcy", "high"],
    ["Collections mention", "collections", "med"],
    ["Late payment mention", "late", "med"],
    ["Foreclosure mention", "foreclosure", "high"],
    ["Judgment mention", "judgment", "high"],
    ["Charge-off mention", "charge off", "med"],
  ];

  for (const [label, needle, severity] of checks) {
    if (lower.includes(needle)) {
      conditions.push({ label, severity, evidence: `Found keyword: "${needle}"` });
    }
  }

  return conditions;
}

function buildRedFlags(text: string): string[] {
  const lower = text.toLowerCase();
  const flags: string[] = [];
  const keywords = ["bankruptcy", "foreclosure", "judgment", "fraud", "charge off", "collections"];
  for (const k of keywords) if (lower.includes(k)) flags.push(k);
  return flags;
}

function buildOcrCondition(params: {
  docType: string;
  ocrEngine: string;
  ocrConfidenceLabel: string;
  ocrConfidence: number;
  textLength: number;
}) {
  const { docType, ocrEngine, ocrConfidenceLabel, ocrConfidence, textLength } = params;

  if (docType !== "id") return null;

  return {
    label: "Verify identity document OCR extraction",
    severity: "med" as const,
    evidence: `ID OCR processed using ${ocrEngine}. OCR confidence ${ocrConfidenceLabel} (${ocrConfidence}). Extracted ${textLength} characters. Human verification required before relying on identity fields.`,
  };
}

// -------------------- handler --------------------
export async function POST(req: Request, ctx: { params: { id: string } }) {
  try {
    const { id } = ctx.params;

    const body = await req.json().catch(() => ({} as any));

    const storedDocs = Array.isArray(body?.storedDocs)
      ? body.storedDocs
      : Array.isArray(body?.documents)
      ? body.documents
      : [];

    const selectedStoredDoc = storedDocs
      .filter((doc: any) => doc && typeof doc === "object")
      .sort((a: any, b: any) => Number(a?.uploadedAtMs || 0) - Number(b?.uploadedAtMs || 0))[0];

    const documentUrl: string = (
      body?.documentUrl ||
      selectedStoredDoc?.url ||
      ""
    )
      .toString()
      .trim();

    const documentName: string = (
      body?.documentName ||
      selectedStoredDoc?.name ||
      selectedStoredDoc?.path ||
      ""
    )
      .toString()
      .trim();

    if (!documentUrl) {
      return NextResponse.json(
        {
          ok: false,
          error: "No documentUrl or storedDocs URL provided",
          analysisRouteVersion: VELOCITY_ANALYZE_ROUTE_VERSION,
          diagnostics: {
            receivedStoredDocs: storedDocs.length,
            receivedBodyKeys: Object.keys(body || {}),
          },
        },
        { status: 400 }
      );
    }

    const res = await fetch(documentUrl);
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: `Failed to fetch document (${res.status})` }, { status: 500 });
    }

    const arrayBuf = await res.arrayBuffer();
    const fileBuffer = Buffer.from(arrayBuf);

    let pdfText = "";
    let pdfParseError = "";

    if ((documentName || "").toLowerCase().endsWith(".pdf")) {
      try {
        const parsed = await pdfParse(fileBuffer);
        pdfText = (parsed?.text || "").toString();
      } catch (error: any) {
        pdfParseError = error?.message || String(error);
      }
    }

    const ocr = await runOcr({
      fileBuffer,
      fileName: documentName || "uploaded-document",
      preferredEngine: "native",
    }).catch((error: any) => ({
      ok: false,
      engine: "native" as const,
      inputType: "unknown" as const,
      sourceName: documentName || "uploaded-document",
      totalPages: 1,
      confidence: 0,
      confidenceLabel: "low" as const,
      extractedText: "",
      pages: [],
      diagnostics: {
        usedFallback: false,
        extractedDirectText: false,
        attemptedImagePipeline: false,
        normalizedFile: false,
        warnings: [`runOcr failed: ${error?.message || String(error)}`],
      },
    }));

    const text = cleanSpaces(pdfText || ocr.extractedText || "");
    const docType = classifyDocFromName(documentName) !== "unknown" ? classifyDocFromName(documentName) : classifyDocFromText(text);

    const borrower =
      docType === "id"
        ? pickDirtyOcrDriverLicenseName(text) || pickBorrowerName(text)
        : pickBorrowerName(text);

    const email = pickFirstEmail(text);
    const loanAmount = docType === "id" ? null : pickLoanAmount(text);

    const dob = pickDob(text);
    const ssnLast4 = docType === "id" ? "" : pickSsnLast4(text);
    const income = docType === "id" ? null : pickIncome(text);
    const creditScore = docType === "id" ? null : pickCreditScore(text);
    const address = pickAddress(text);
    const employerAddress = docType === "id" ? "" : pickEmployerAddress(text);

    const summary = buildSummary(text);
    const conditions = buildConditions(text);
    const redFlags = buildRedFlags(text);

    const ocrCondition = buildOcrCondition({
      docType,
      ocrEngine: ocr.engine,
      ocrConfidenceLabel: ocr.confidenceLabel,
      ocrConfidence: ocr.confidence,
      textLength: text.length,
    });

    if (ocrCondition) conditions.push(ocrCondition);

    const ok =
      text.length > 0 ||
      !!borrower ||
      !!dob ||
      !!address ||
      docType === "id";

    if (!ok) {
      return NextResponse.json(
        {
          ok: false,
          error: "No usable document text or OCR identity signals were extracted.",
          analysisRouteVersion: VELOCITY_ANALYZE_ROUTE_VERSION,
          diagnostics: {
            pdfParseError,
            ocr,
            docType,
            textLength: text.length,
          },
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      id,
      mode: ocr.ok ? "ocr" : "pdf-parse",
      analysisRouteVersion: VELOCITY_ANALYZE_ROUTE_VERSION,
      docName: documentName || "Uploaded Document",
      docsUploaded: 1,
      docsProcessedCount: 1,
      docsProcessed: [{ name: documentName || "Uploaded Document", type: docType }],
      docsSkippedCount: 0,
      docsSkipped: [],
      runtimeDocDebug: [
        {
          name: documentName || "Uploaded Document",
          type: docType,
          parsedDebts: null,
          routeCreditDebts: null,
          finalDocDebts: null,
          finalAddress: address || "",
          finalEmployerAddress: employerAddress || "",
          ocrInputType: ocr.inputType,
          ocrEngine: ocr.engine,
          ocrConfidence: ocr.confidence,
          ocrConfidenceLabel: ocr.confidenceLabel,
          ocrWarnings: ocr.diagnostics?.warnings || [],
          extractedDirectText: !!ocr.diagnostics?.extractedDirectText,
          attemptedImagePipeline: !!ocr.diagnostics?.attemptedImagePipeline,
        },
      ],
      extracted: {
        borrower: borrower || "",
        fullName: borrower || "",
        email: email || "",
        loanAmount: loanAmount ?? null,
        dob: dob || "",
        ssnLast4: ssnLast4 || "",
        income: income ?? null,
        creditScore: creditScore ?? null,
        address: address || "",
        employerAddress: employerAddress || "",
        assets: null,
        debts: null,
        propertyValue: null,
      },
      summary,
      preview: text.slice(0, 4200),
      conditions,
      redFlags,
      ai: {
        verdict: "review_required",
        risk: docType === "id" ? "medium" : "low",
        confidence: ocr.confidence,
        score: Math.round((ocr.confidence || 0) * 100),
        reason:
          docType === "id"
            ? "Identity document OCR completed. Human verification required before using extracted identity fields."
            : "Document parsed successfully.",
        dti: null,
        ltv: null,
        conditions: conditions.map((c) => c.label),
        factors: [
          {
            key: "ocr_document_ingestion",
            label: "OCR Document Ingestion",
            value: ocr.confidence,
            impact: ocr.ok ? "positive" : "neutral",
            summary: `OCR engine=${ocr.engine}; inputType=${ocr.inputType}; chars=${text.length}.`,
            source: documentName || "Uploaded Document",
          },
        ],
      },
      report: null,
      diagnostics: {
        uploadedCount: 1,
        processedCount: 1,
        skippedCount: 0,
        skippedDocs: [],
        runtimeDocDebug: [
          {
            name: documentName || "Uploaded Document",
            type: docType,
            parsedDebts: null,
            routeCreditDebts: null,
            finalDocDebts: null,
            finalAddress: address || "",
            finalEmployerAddress: employerAddress || "",
            ocrInputType: ocr.inputType,
            ocrEngine: ocr.engine,
            ocrConfidence: ocr.confidence,
            ocrConfidenceLabel: ocr.confidenceLabel,
            ocrWarnings: ocr.diagnostics?.warnings || [],
            extractedDirectText: !!ocr.diagnostics?.extractedDirectText,
            attemptedImagePipeline: !!ocr.diagnostics?.attemptedImagePipeline,
          },
        ],
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.stack || e?.message || "Unknown error" }, { status: 500 });
  }
}
