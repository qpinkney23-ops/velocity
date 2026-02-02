import { NextResponse } from "next/server";

// pdf-parse is CommonJS
const pdfParse: any = require("pdf-parse");

// -------------------- helpers --------------------
function cleanSpaces(s: string) {
  return (s || "").replace(/\s+/g, " ").trim();
}

function pickFirstEmail(text: string): string {
  const m = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return m ? m[0] : "";
}

function stripNameLabel(s: string) {
  // Turn "Full Name Olivia Martinez" -> "Olivia Martinez"
  return cleanSpaces(
    s
      .replace(/^full\s*name[:\s-]*/i, "")
      .replace(/^borrower[:\s-]*/i, "")
      .replace(/^applicant[:\s-]*/i, "")
      .replace(/^name[:\s-]*/i, "")
  );
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

    // If the line contains digits, usually not a clean name
    // BUT allow "Full Name Olivia Martinez" (no digits)
    if (/\d/.test(l)) continue;

    // Handle "Full Name Olivia Martinez" without colon
    if (lower.startsWith("full name")) {
      const stripped = stripNameLabel(l);
      if (stripped.split(/\s+/).length >= 2) candidates.push(stripped);
      continue;
    }

    // Handle "Borrower: John Doe" etc
    if (lower.startsWith("borrower") || lower.startsWith("applicant") || lower.startsWith("name")) {
      const after = cleanSpaces(l.split(":").slice(1).join(":"));
      const stripped = stripNameLabel(after || l);
      if (stripped && stripped.split(/\s+/).length >= 2) candidates.push(stripped);
      continue;
    }

    // Looks like a normal name line
    if (/^[A-Z][a-z]+(\s+[A-Z][a-z]+)+$/.test(l) || /^[A-Z]{2,}(\s+[A-Z]{2,})+$/.test(l)) {
      candidates.push(stripNameLabel(l));
    }
  }

  const chosen = candidates.find((c) => c.split(/\s+/).length >= 2) || "";
  return chosen;
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
  // match 08/30/1991 or 8/30/1991
  const m = text.match(/\b(0?[1-9]|1[0-2])\/(0?[1-9]|[12]\d|3[01])\/(19|20)\d{2}\b/);
  return m ? m[0] : "";
}

function pickSsnLast4(text: string): string {
  // match SSN 901-23-4567 or 901234567
  const m1 = text.match(/\b\d{3}-\d{2}-(\d{4})\b/);
  if (m1) return m1[1];
  const m2 = text.match(/\b\d{9}\b/);
  if (m2) return m2[0].slice(-4);
  return "";
}

function pickIncome(text: string): number | null {
  // Look for "Income 88,000" or "$88,000"
  // We'll grab dollar-ish values and pick a reasonable salary-ish number (<= 1M)
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
  // Look for "Credit Score 725"
  const m = text.match(/credit\s*score[^0-9]{0,20}(\d{3})/i);
  if (m) return Number(m[1]);
  // fallback: any 3-digit between 300-850
  const all = text.match(/\b\d{3}\b/g) || [];
  for (const s of all) {
    const n = Number(s);
    if (n >= 300 && n <= 850) return n;
  }
  return null;
}

function pickAddress(text: string): string {
  // Very lightweight: try to find something like "123 Birch St, Cleveland, OH 44102"
  const m = text.match(/\b\d{1,6}\s+[A-Za-z0-9.\s]+,\s*[A-Za-z.\s]+,\s*[A-Z]{2}\s*\d{5}\b/);
  return m ? cleanSpaces(m[0]) : "";
}

function pickEmployerAddress(text: string): string {
  // try to find "Employer Address 500 Techway Dr, Cleveland, OH 44102"
  const m = text.match(/employer\s*address[^A-Za-z0-9]{0,20}(\d{1,6}\s+[A-Za-z0-9.\s]+,\s*[A-Za-z.\s]+,\s*[A-Z]{2}\s*\d{5})/i);
  return m ? cleanSpaces(m[1]) : "";
}

function buildSummary(text: string): string {
  // Keep it readable and scrollable in UI
  const compact = cleanSpaces(text);
  const max = 1800; // enough to scroll without being insane
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

// -------------------- handler --------------------
export async function POST(req: Request, ctx: { params: { id: string } }) {
  try {
    const { id } = ctx.params;

    const body = await req.json().catch(() => ({} as any));
    const documentUrl: string = (body?.documentUrl || "").toString().trim();
    const documentName: string = (body?.documentName || "").toString().trim();

    if (!documentUrl) {
      return NextResponse.json({ ok: false, error: "No documentUrl provided" }, { status: 400 });
    }

    const res = await fetch(documentUrl);
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: `Failed to fetch PDF (${res.status})` }, { status: 500 });
    }

    const arrayBuf = await res.arrayBuffer();
    const pdfBuffer = Buffer.from(arrayBuf);

    const parsed = await pdfParse(pdfBuffer);
    const text: string = (parsed?.text || "").toString();

    const borrower = pickBorrowerName(text);
    const email = pickFirstEmail(text);
    const loanAmount = pickLoanAmount(text);

    const dob = pickDob(text);
    const ssnLast4 = pickSsnLast4(text);
    const income = pickIncome(text);
    const creditScore = pickCreditScore(text);
    const address = pickAddress(text);
    const employerAddress = pickEmployerAddress(text);

    const summary = buildSummary(text);
    const conditions = buildConditions(text);
    const redFlags = buildRedFlags(text);

    return NextResponse.json({
      ok: true,
      id,
      mode: "pdf-parse",
      docName: documentName || "Uploaded PDF",
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
      },
      summary,
      conditions,
      redFlags,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.stack || e?.message || "Unknown error" }, { status: 500 });
  }
}
