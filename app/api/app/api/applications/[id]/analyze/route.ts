import { NextResponse } from "next/server";

// pdf-parse is CommonJS; require is safest in Next/TS server routes.
const pdfParse: any = require("pdf-parse");

type AnalyzeBody = {
  // accept multiple key names so the UI can’t “miss” it
  documentUrl?: string;
  downloadURL?: string;
  url?: string;

  documentName?: string;
  name?: string;
};

function cleanLine(s: string) {
  return (s || "").replace(/\s+/g, " ").trim();
}

function pickFirstEmail(text: string): string {
  const m = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return m ? m[0] : "";
}

function extractNameFromLabeledLine(line: string) {
  // "Borrower: John Doe" | "Co-Borrower Name: Jane Doe"
  const parts = line.split(":");
  if (parts.length < 2) return "";
  return cleanLine(parts.slice(1).join(":"));
}

function looksLikeName(line: string) {
  const l = cleanLine(line);
  if (!l) return false;
  if (l.length < 3 || l.length > 60) return false;
  if (/@/.test(l)) return false;
  if (/\d/.test(l)) return false;
  // allow "JOHN A DOE" or "John Doe"
  if (/^[A-Z]{2,}(\s+[A-Z]{1,2})?(\s+[A-Z]{2,})+$/.test(l)) return true;
  if (/^[A-Z][a-z]+(\s+[A-Z]\.)?(\s+[A-Z][a-z]+)+$/.test(l)) return true;
  return false;
}

function pickBorrowerName(text: string): string {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  // 1) Look for labeled borrower/applicant lines
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (lower.startsWith("borrower") || lower.startsWith("applicant") || lower.startsWith("borrower name") || lower.startsWith("applicant name")) {
      const name = extractNameFromLabeledLine(line);
      if (looksLikeName(name)) return name;
    }
  }

  // 2) Otherwise pick first "name-looking" line
  for (const line of lines) {
    if (looksLikeName(line)) return cleanLine(line);
  }

  return "";
}

function pickCoBorrowerName(text: string): string {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  // Look for co-borrower / co-applicant labels
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (
      lower.startsWith("co-borrower") ||
      lower.startsWith("co borrower") ||
      lower.startsWith("co-applicant") ||
      lower.startsWith("co applicant") ||
      lower.startsWith("coborrower") ||
      lower.includes("co-borrower name") ||
      lower.includes("co-applicant name")
    ) {
      const name = extractNameFromLabeledLine(line);
      if (looksLikeName(name)) return name;
    }
  }

  // Sometimes the form has "Co-Borrower" on one line and name on next line
  for (let i = 0; i < lines.length - 1; i++) {
    const lower = lines[i].toLowerCase();
    if (lower.includes("co-borrower") || lower.includes("co-applicant")) {
      const next = cleanLine(lines[i + 1]);
      if (looksLikeName(next)) return next;
    }
  }

  return "";
}

function pickLoanAmount(text: string): number | null {
  // Find dollar amounts; pick largest reasonable under 10M
  const matches = text.match(/\$?\s*\d{1,3}(?:,\d{3})+(?:\.\d{2})?/g);
  if (!matches) return null;

  let best = 0;
  for (const raw of matches) {
    const cleaned = raw.replace(/[^0-9.]/g, "");
    const num = Number(cleaned);
    if (!Number.isFinite(num)) continue;
    if (num > best && num <= 10_000_000) best = num;
  }
  return best > 0 ? best : null;
}

function buildSummary(text: string): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (!compact) return "No text extracted from PDF (it may be scanned).";
  return compact.slice(0, 1200) + (compact.length > 1200 ? "…" : "");
}

function buildPreview(text: string): string {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.slice(0, 4000);
}

type Condition = { label: string; severity: "low" | "med" | "high"; evidence?: string };

function buildConditions(text: string): Condition[] {
  const lower = text.toLowerCase();
  const out: Condition[] = [];

  const checks: Array<[string, string[], "low" | "med" | "high"]> = [
    ["Bankruptcy mention", ["bankruptcy"], "high"],
    ["Foreclosure mention", ["foreclosure"], "high"],
    ["Judgment mention", ["judgment"], "high"],
    ["Collections mention", ["collections"], "med"],
    ["Charge-off mention", ["charge off", "chargeoff"], "med"],
    ["Late payment mention", ["late payment", "30 day late", "60 day late", "90 day late"], "med"],
    ["Fraud mention", ["fraud"], "high"],
  ];

  for (const [label, needles, severity] of checks) {
    for (const needle of needles) {
      if (lower.includes(needle)) {
        out.push({ label, severity, evidence: `Found keyword: "${needle}"` });
        break;
      }
    }
  }

  return out;
}

function buildRedFlags(text: string): string[] {
  const lower = text.toLowerCase();
  const flags: string[] = [];
  const keywords = ["bankruptcy", "foreclosure", "judgment", "fraud", "charge off", "collections"];
  for (const k of keywords) if (lower.includes(k)) flags.push(k);
  return flags;
}

export async function POST(req: Request, ctx: { params: { id: string } }) {
  try {
    const { id } = ctx.params;

    const body = (await req.json().catch(() => ({}))) as AnalyzeBody;

    const documentUrl =
      (body.documentUrl || "").toString().trim() ||
      (body.downloadURL || "").toString().trim() ||
      (body.url || "").toString().trim();

    const documentName =
      (body.documentName || "").toString().trim() ||
      (body.name || "").toString().trim() ||
      "Uploaded PDF";

    if (!documentUrl) {
      return NextResponse.json({ ok: false, error: "No documentUrl/downloadURL provided" }, { status: 400 });
    }

    // Fetch PDF bytes
    const res = await fetch(documentUrl);
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: `Failed to fetch PDF (${res.status})` }, { status: 500 });
    }

    const arrayBuf = await res.arrayBuffer();
    const pdfBuffer = Buffer.from(arrayBuf);

    const parsed = await pdfParse(pdfBuffer);
    const text: string = (parsed?.text || "").toString();

    const borrower = pickBorrowerName(text);
    const coBorrower = pickCoBorrowerName(text);
    const email = pickFirstEmail(text); // may be blank (your doc may not have one)
    const loanAmount = pickLoanAmount(text);

    const summary = buildSummary(text);
    const preview = buildPreview(text);
    const conditions = buildConditions(text);
    const redFlags = buildRedFlags(text);

    return NextResponse.json({
      ok: true,
      id,
      mode: "pdf-parse",
      docName: documentName,
      extracted: {
        borrower: borrower || "",
        coBorrower: coBorrower || "",
        email: email || "",
        loanAmount: loanAmount ?? null,
      },
      summary,
      preview,
      conditions,
      redFlags,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.stack || e?.message || "Unknown error" }, { status: 500 });
  }
}
