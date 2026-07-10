import pdf from "pdf-parse";

type ParsedLiability = {
  creditor: string;
  accountType?: string;
  balance?: number | null;
  monthlyPayment: number | null;
  status?: string;
  includeInDti: boolean;
  reviewRequired: boolean;
  confidence: "low" | "medium" | "high";
  source: "credit" | "1003" | "bank" | "unknown";
  reason?: string;
};

type ExtractedFields = {
  borrower?: string;
  fullName?: string;
  email?: string;
  dob?: string;
  ssnLast4?: string;
  loanNumber?: string;
  income?: number | null;
  creditScore?: number | null;
  address?: string;
  employerAddress?: string;
  loanAmount?: number | null;
  propertyValue?: number | null;
  assets?: number | null;
  debts?: number | null;
  liabilities?: ParsedLiability[];
};

function cleanSpaces(value: string) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function cleanLine(value: string) {
  return cleanSpaces((value || "").replace(/[|•·]/g, " "));
}

function toLines(text: string) {
  return (text || "")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => cleanLine(line))
    .filter(Boolean);
}

function safeNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value.replace(/[^\d.-]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function safePositive(value: unknown): number | null {
  const n = safeNumber(value);
  return typeof n === "number" && n > 0 ? n : null;
}

function parseMoney(value: string): number | null {
  const m = value.match(/\$?\s*([\d,]+(?:\.\d{2})?)/);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function looksLikeStreetLine(line: string) {
  const lower = line.toLowerCase();
  if (!/^\d{1,6}\s+/.test(line)) return false;
  if (lower.includes("social security")) return false;
  if (lower.includes("credit score")) return false;
  if (lower.includes("loan amount")) return false;
  if (lower.includes("date of birth")) return false;
  if (lower.includes("start date")) return false;
  return true;
}

function looksLikeCityStateZip(line: string) {
  return /[A-Za-z.\s]+,\s*[A-Z]{2}\s*\d{5}(?:-\d{4})?/.test(line);
}

function normalizeAddressCandidate(value: string) {
  return cleanSpaces(
    value
      .replace(/\s+,/g, ",")
      .replace(/,\s*,/g, ",")
      .replace(/\s{2,}/g, " ")
  );
}

function findLabeledString(text: string, labels: string[]): string {
  for (const label of labels) {
    const pattern = new RegExp(`${label}[^A-Za-z0-9]{0,10}(.{1,120})`, "i");
    const m = text.match(pattern);
    if (m?.[1]) {
      const candidate = cleanSpaces(
        m[1].split(/(?:dob|date of birth|ssn|social security|email|phone|loan amount|property value|income)/i)[0]
      );
      if (candidate) return candidate;
    }
  }
  return "";
}

function pickFirstEmail(text: string) {
  const m = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return m ? m[0] : "";
}

function stripNameLabel(value: string) {
  return cleanSpaces(
    value
      .replace(/^full\s*name[:\s-]*/i, "")
      .replace(/^borrower[:\s-]*/i, "")
      .replace(/^applicant[:\s-]*/i, "")
      .replace(/^name[:\s-]*/i, "")
  );
}

function isGarbageName(value: string) {
  const v = value.toLowerCase().trim().replace(/\s+/g, " ");
  return [
    "information name",
    "name information",
    "borrower information",
    "applicant information",
    "information",
    "bureauscore",
    "credit report",
    "merged credit report",
    "residential loan application",
    "employment verification letter",
  ].includes(v);
}

function pickBorrowerName(text: string) {
  const lines = toLines(text);
  const candidates: string[] = [];

  for (const line of lines) {
    const lower = line.toLowerCase();
    if (line.length < 3) continue;
    if (line.length > 90) continue;
    if (lower.includes("@")) continue;
    if (/\d/.test(line)) continue;

    if (lower.startsWith("full name")) {
      const stripped = stripNameLabel(line);
      if (stripped.split(/\s+/).length >= 2 && !isGarbageName(stripped)) candidates.push(stripped);
      continue;
    }

    if (lower.startsWith("borrower") || lower.startsWith("applicant") || lower.startsWith("name")) {
      const after = cleanSpaces(line.split(":").slice(1).join(":"));
      const stripped = stripNameLabel(after || line);
      if (stripped && stripped.split(/\s+/).length >= 2 && !isGarbageName(stripped)) candidates.push(stripped);
      continue;
    }

    if (
      (/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+$/.test(line) ||
        /^[A-Z]{2,}(?:\s+[A-Z]{2,})+$/.test(line)) &&
      !isGarbageName(line)
    ) {
      candidates.push(stripNameLabel(line));
    }
  }

  return candidates.find((c) => c.split(/\s+/).length >= 2) || "";
}

function pickDOB(text: string) {
  const strictPatterns = [
    /\b(?:dob|date of birth)[^0-9]{0,20}((0?[1-9]|1[0-2])\/(0?[1-9]|[12]\d|3[01])\/((?:19)\d{2}|(?:20)(?:0\d|1\d|2[0-5])))\b/i,
    /\b(?:dob|date of birth)[^0-9]{0,20}((0?[1-9]|1[0-2])-(0?[1-9]|[12]\d|3[01])-((?:19)\d{2}|(?:20)(?:0\d|1\d|2[0-5])))\b/i,
  ];

  for (const pattern of strictPatterns) {
    const m = text.match(pattern);
    if (m?.[1]) return m[1].replace(/-/g, "/");
  }

  return "";
}

function pickSSNLast4(text: string) {
  const patterns = [
    /\b\d{3}-\d{2}-(\d{4})\b/,
    /\b(?:xxx|XXX)-(?:xx|XX)-(\d{4})\b/,
    /\b(?:\*{3})-(?:\*{2})-(\d{4})\b/,
    /\b(?:ssn|social security number)[^0-9A-Z*]{0,20}(?:xxx-xx-|XXX-XX-|\*{3}-\*{2}-)?(\d{4})\b/i,
    /\b(?:taxpayer identification number|tin)[^0-9A-Z*]{0,20}(?:xxx-xx-|XXX-XX-|\*{3}-\*{2}-)?(\d{4})\b/i,
    /\bending in[^0-9]{0,10}(\d{4})\b/i,
    /\blast\s*4[^0-9]{0,10}(\d{4})\b/i,
  ];

  for (const pattern of patterns) {
    const m = text.match(pattern);
    if (m?.[1]) return m[1];
  }

  const raw9 = text.match(/\b\d{9}\b/);
  if (raw9) return raw9[0].slice(-4);

  return "";
}


function normalizeLoanNumberCandidate(value: string) {
  const cleaned = cleanSpaces(String(value || "")
    .replace(/[.,;:]+$/g, "")
    .replace(/[^A-Za-z0-9-]/g, "")
  ).toUpperCase();

  if (!cleaned) return "";
  if (cleaned.length < 3 || cleaned.length > 40) return "";
  if (/^(?:1003|URLA|FNMA|FHLMC|NMLS|SSN|DOB|TIN)$/i.test(cleaned)) return "";
  if (/^(?:19|20)\d{2}$/.test(cleaned)) return "";
  if (/^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}$/.test(cleaned)) return "";

  return cleaned;
}

function pickLoanNumber(text: string) {
  const flat = cleanSpaces((text || "").replace(/\r/g, " ").replace(/\n/g, " "));

  const patterns = [
    /\b(?:loan|mortgage|file|case)\s*(?:number|no\.?|#|id)\b[^A-Za-z0-9]{0,20}([A-Za-z0-9][A-Za-z0-9-]{2,39})\b/i,
    /\b(?:application|app)\s*(?:number|no\.?|#|id)\b[^A-Za-z0-9]{0,20}([A-Za-z0-9][A-Za-z0-9-]{2,39})\b/i,
    /\b(?:lender\s+loan\s+number|universal\s+loan\s+identifier|uli)\b[^A-Za-z0-9]{0,20}([A-Za-z0-9][A-Za-z0-9-]{2,39})\b/i,
  ];

  for (const pattern of patterns) {
    const m = flat.match(pattern);
    if (!m?.[1]) continue;
    const candidate = normalizeLoanNumberCandidate(m[1]);
    if (candidate) return candidate;
  }

  return "";
}

function pickAddress(text: string) {
  const flat = cleanSpaces(text);

  const inlinePatterns = [
    /\b\d{1,6}\s+[A-Za-z0-9.#'\- ]+,\s*[A-Za-z.\s]+,\s*[A-Z]{2}\s*\d{5}(?:-\d{4})?\b/,
    /\b\d{1,6}\s+[A-Za-z0-9.#'\- ]+\s+[A-Za-z.\s]+,\s*[A-Z]{2}\s*\d{5}(?:-\d{4})?\b/,
  ];

  for (const pattern of inlinePatterns) {
    const m = flat.match(pattern);
    if (m) return normalizeAddressCandidate(m[0]);
  }

  const lines = toLines(text);

  for (let i = 0; i < lines.length - 1; i++) {
    if (looksLikeStreetLine(lines[i]) && looksLikeCityStateZip(lines[i + 1])) {
      return normalizeAddressCandidate(`${lines[i]}, ${lines[i + 1]}`);
    }
  }

  for (let i = 0; i < lines.length - 2; i++) {
    const combo = `${lines[i]}, ${lines[i + 1]}, ${lines[i + 2]}`;
    const match = combo.match(/\b\d{1,6}\s+[A-Za-z0-9.#'\- ]+,\s*[A-Za-z.\s]+,\s*[A-Z]{2}\s*\d{5}(?:-\d{4})?\b/);
    if (match) return normalizeAddressCandidate(match[0]);
  }

  return "";
}

function isLikelyEmployerAddress(candidate: string) {
  const clean = cleanSpaces(candidate);
  const lower = clean.toLowerCase();

  if (!clean) return false;
  if (clean.length > 160) return false;
  if (!/\d{1,6}\s+/.test(clean)) return false;

  const hasZipAddress = /[A-Z]{2}\s*\d{5}(?:-\d{4})?/i.test(clean);
  const hasLooseCityState =
    /\b[A-Za-z][A-Za-z.\s]{2,35}\s+(?:AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|IA|ID|IL|IN|KS|KY|LA|MA|MD|ME|MI|MN|MO|MS|MT|NC|ND|NE|NH|NJ|NM|NV|NY|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VA|VT|WA|WI|WV|WY)\b(?:\s*\d{5}(?:-\d{4})?)?\b/i.test(clean);
  const hasStreetAddressSignal = lineLooksLikeEmployerAddressCandidate(clean);

  if (!hasZipAddress && !hasLooseCityState && !hasStreetAddressSignal) return false;

  const blockerWords = [
    "borrower",
    "applicant",
    "property",
    "subject property",
    "mailing",
    "current address",
    "home address",
    "base pay",
    "monthly",
    "overtime",
    "bonus",
    "ytd",
    "salary",
    "income",
    "processor note",
    "checkbox",
    "artifact",
    "verify",
    "probability",
    "conflict",
    "signature",
    "payroll",
    "underwritten",
    "credit report",
    "tradeline",
    "payment history",
    "account",
    "balance",
    "transaction",
    "deposit",
    "withdrawal",
    "statement",
    "table shifted",
    "min pay",
    "status ok",
  ];

  return !blockerWords.some((w) => lower.includes(w));
}

function looksLikeLooseCityState(line: string) {
  return /\b[A-Za-z][A-Za-z.\s]{2,35}\s+(?:AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|IA|ID|IL|IN|KS|KY|LA|MA|MD|ME|MI|MN|MO|MS|MT|NC|ND|NE|NH|NJ|NM|NV|NY|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VA|VT|WA|WI|WV|WY)\b(?:\s*\d{5}(?:-\d{4})?)?\b/i.test(line);
}

function hasEmployerContext(line: string) {
  const lower = cleanSpaces(line).toLowerCase();

  return (
    lower.includes("employer") ||
    lower.includes("company") ||
    lower.includes("business") ||
    lower.includes("employment verification") ||
    lower.includes("currently employed by") ||
    lower.includes("employed by") ||
    lower.includes("works at") ||
    lower.includes("w-2") ||
    lower.includes("w2") ||
    lower.includes("wage and tax statement") ||
    lower.includes("employer's name") ||
    lower.includes("employer name") ||
    lower.includes("ellington technology") ||
    lower.includes("ellington tech")
  );
}

function lineLooksLikeEmployerAddressCandidate(line: string) {
  const clean = cleanSpaces(line);
  const lower = clean.toLowerCase();

  if (!clean) return false;
  if (clean.length > 120) return false;
  if (!/^\d{1,6}\s+/.test(clean)) return false;

  const hasStreetWord =
    /\b(st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|ln|lane|ct|court|pkwy|parkway|way|halsted|halstead)\b/i.test(clean);

  const hasStateSignal =
    /\b(?:AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|IA|ID|IL|IN|KS|KY|LA|MA|MD|ME|MI|MN|MO|MS|MT|NC|ND|NE|NH|NJ|NM|NV|NY|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VA|VT|WA|WI|WV|WY)\b(?:\s*\d{5}(?:-\d{4})?)?\b/i.test(clean);

  if (!hasStreetWord && !hasStateSignal) return false;

  const hardReject =
    /table shifted|\bbal\b|min pay|status ok|status open|status current|charge[-\s]?off|credit report|tradeline|payment history|\baccount\b|\bbalance\b|\bpayment\b|\bmonthly\b|\bincome\b|\bsalary\b|\bytd\b|\bbonus\b|\bovertime\b|processor note|checkbox|artifact|signature|payroll|underwritten/i;

  if (hardReject.test(lower)) return false;

  return true;
}

function normalizeEmployerContextAddress(candidate: string) {
  return normalizeLooseEmployerAddress(
    cleanSpaces(candidate)
      .replace(/\bN\b/g, "N")
      .replace(/\bS\b/g, "S")
      .replace(/\bE\b/g, "E")
      .replace(/\bW\b/g, "W")
      .replace(/\bSte\b/gi, "Ste")
      .replace(/\bSuite\b/gi, "Suite")
      .replace(/\bHalstead\b/gi, "Halsted")
  );
}

function normalizeLooseEmployerAddress(candidate: string) {
  return normalizeAddressCandidate(
    cleanSpaces(candidate)
      .replace(/\bSte\b/gi, "Ste")
      .replace(/\bSt\b/gi, "St")
      .replace(/\bAve\b/gi, "Ave")
      .replace(/\bRd\b/gi, "Rd")
      .replace(/\bBlvd\b/gi, "Blvd")
      .replace(/\bDr\b/gi, "Dr")
  );
}

function pickEmployerName(text: string) {
  const flat = cleanSpaces(text);
  const patterns = [
    /employer:\s*(.+?)(?=\s+position:|\s+start date:|\s+annual salary:|$)/i,
    /company:\s*(.+?)(?=\s+position:|\s+start date:|\s+annual salary:|$)/i,
    /currently employed by\s+(.+?)(?=\s+position:|\s+start date:|\s+annual salary:|$)/i,
  ];

  for (const pattern of patterns) {
    const m = flat.match(pattern);
    if (m?.[1]) return cleanSpaces(m[1]);
  }

  return "";
}

function pickEmployerAddress(text: string) {
  const flat = text.replace(/\r/g, "");
  const patterns = [
    /(?:employer|company|business)\s*address[^A-Za-z0-9]{0,30}(\d{1,6}\s+[A-Za-z0-9.#'\- ]{2,70},?\s*[A-Za-z.\s]{2,40},?\s*[A-Z]{2}\s*\d{5}(?:-\d{4})?)/i,
    /(?:employer|company|business)\s*address[^A-Za-z0-9]{0,30}(\d{1,6}\s+[A-Za-z0-9.#'\- ]{2,90}\s+[A-Z]{2}(?:\s*\d{5}(?:-\d{4})?)?)/i,
  ];

  for (const pattern of patterns) {
    const m = flat.match(pattern);
    if (m?.[1]) {
      const candidate = normalizeEmployerContextAddress(m[1]);
      if (candidate && isLikelyEmployerAddress(candidate)) return candidate;
    }
  }

  const lines = toLines(text);

  for (let i = 0; i < lines.length; i++) {
    const lower = lines[i].toLowerCase();
    const isEmployerContext = hasEmployerContext(lines[i]);

    if (!isEmployerContext) continue;

    const start = Math.max(0, i - 3);
    const end = Math.min(i + 12, lines.length);

    for (let j = start; j < end; j++) {
      const line = lines[j];

      if (lineLooksLikeEmployerAddressCandidate(line)) {
        const candidate = normalizeEmployerContextAddress(line);
        if (candidate && isLikelyEmployerAddress(candidate)) return candidate;
      }

      if (looksLikeStreetLine(line) && j + 1 < lines.length && looksLikeCityStateZip(lines[j + 1])) {
        const candidate = normalizeEmployerContextAddress(`${line}, ${lines[j + 1]}`);
        if (candidate && isLikelyEmployerAddress(candidate)) return candidate;
      }

      if (looksLikeStreetLine(line) && looksLikeLooseCityState(line)) {
        const candidate = normalizeEmployerContextAddress(line);
        if (candidate && isLikelyEmployerAddress(candidate)) return candidate;
      }

      if (looksLikeStreetLine(line) && j + 1 < lines.length && looksLikeLooseCityState(lines[j + 1])) {
        const candidate = normalizeEmployerContextAddress(`${line}, ${lines[j + 1]}`);
        if (candidate && isLikelyEmployerAddress(candidate)) return candidate;
      }
    }

    // OCR often splits W-2 employer blocks into neighboring label/value fragments.
    // Reconstruct a likely employer address from a small context window when street and city/state
    // appear on separate nearby lines.
    for (let j = start; j < end; j++) {
      if (!looksLikeStreetLine(lines[j]) && !lineLooksLikeEmployerAddressCandidate(lines[j])) continue;

      for (let k = j + 1; k < Math.min(j + 5, end); k++) {
        if (!looksLikeLooseCityState(lines[k]) && !looksLikeCityStateZip(lines[k])) continue;

        const candidate = normalizeEmployerContextAddress(`${lines[j]}, ${lines[k]}`);
        if (candidate && isLikelyEmployerAddress(candidate)) return candidate;
      }
    }
  }

  // Last safe fallback for Marcus-style chaos files:
  // accept a strong standalone employer-address candidate only when an employer name exists elsewhere.
  const hasKnownEmployer = lines.some((line) => hasEmployerContext(line));
  if (hasKnownEmployer) {
    for (const line of lines) {
      if (!lineLooksLikeEmployerAddressCandidate(line)) continue;

      const candidate = normalizeEmployerContextAddress(line);
      if (candidate && isLikelyEmployerAddress(candidate)) return candidate;
    }
  }

  return "";
}

function pickCreditScore(text: string) {
  const cleaned = cleanSpaces(text);

  const strictPatterns = [
    /representative\s*score[^0-9]{0,40}(\d{3})/i,
    /middle\s*score[^0-9]{0,40}(\d{3})/i,
    /borrower\s*middle\s*score[^0-9]{0,40}(\d{3})/i,
    /credit\s*score[^0-9]{0,40}(\d{3})/i,
    /score[^0-9]{0,20}(\d{3})/i,
  ];

  for (const pattern of strictPatterns) {
    const m = cleaned.match(pattern);
    if (!m) continue;

    const n = Number(m[1]);
    if (n >= 300 && n <= 850) return n;
  }

  const triMerge = cleaned.match(/scores?\s*[:\-]?\s*(\d{3})\s*\/\s*(\d{3})\s*\/\s*(\d{3})/i);
  if (triMerge) {
    const nums = [Number(triMerge[1]), Number(triMerge[2]), Number(triMerge[3])].filter(
      (n) => n >= 300 && n <= 850
    );

    if (nums.length === 3) {
      nums.sort((a, b) => a - b);
      return nums[1];
    }
  }

  const bureauScores = Array.from(
    cleaned.matchAll(/\b(?:experian|equifax|transunion)\b[^0-9]{0,40}(\d{3})\b/gi)
  )
    .map((m) => Number(m[1]))
    .filter((n) => n >= 300 && n <= 850);

  if (bureauScores.length >= 3) {
    bureauScores.sort((a, b) => a - b);
    return bureauScores[1];
  }

  if (bureauScores.length === 1) return bureauScores[0];

  return null;
}

function findAmountNearLabel(text: string, labels: string[]) {
  for (const label of labels) {
    const pattern = new RegExp(`${label}[^\\d$]{0,25}\\$?\\s*([\\d,]+(?:\\.\\d{2})?)`, "i");
    const m = text.match(pattern);
    if (m?.[1]) {
      const n = Number(m[1].replace(/,/g, ""));
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function findAllAmountsNearLabel(text: string, labels: string[]) {
  const values: number[] = [];

  for (const label of labels) {
    const pattern = new RegExp(`${label}[^\\d$]{0,35}\\$?\\s*([\\d,]+(?:\\.\\d{2})?)`, "gi");
    for (const match of text.matchAll(pattern)) {
      if (!match?.[1]) continue;
      const n = Number(match[1].replace(/,/g, ""));
      if (Number.isFinite(n) && n > 0) values.push(n);
    }
  }

  return values;
}

function annualizePayAmount(amount: number, text: string, nearbyText = "") {
  const context = `${nearbyText} ${text}`.toLowerCase();

  if (amount >= 20000 && amount <= 500000) return amount;

  if (amount > 0 && amount < 1000) {
    if (context.includes("hourly") || context.includes("hourly rate") || context.includes("rate of pay")) {
      return Math.round(amount * 40 * 52);
    }
  }

  if (amount >= 1000 && amount < 20000) {
    if (
      context.includes("biweekly") ||
      context.includes("bi-weekly") ||
      context.includes("every two weeks") ||
      context.includes("pay period") ||
      context.includes("gross pay")
    ) {
      return Math.round(amount * 26);
    }

    if (context.includes("semi-monthly") || context.includes("semimonthly")) {
      return Math.round(amount * 24);
    }

    if (context.includes("weekly")) {
      return Math.round(amount * 52);
    }

    if (context.includes("monthly")) {
      return Math.round(amount * 12);
    }
  }

  return null;
}

function isReasonableAnnualIncome(value: number | null) {
  return typeof value === "number" && Number.isFinite(value) && value >= 1000 && value <= 1000000;
}

function pickBestIncomeCandidate(values: number[]) {
  const clean = values
    .filter((v) => Number.isFinite(v))
    .filter((v) => v >= 1000 && v <= 1000000);

  if (!clean.length) return null;

  const annualLooking = clean.filter((v) => v >= 20000 && v <= 500000);
  if (annualLooking.length) return annualLooking[0];

  return clean[0];
}

function pickIncome(text: string) {
  const flat = cleanSpaces(text);
  const lines = toLines(text);

  const w2Values = [
    ...findAllAmountsNearLabel(flat, [
      "wages, tips, other compensation",
      "box 1 wages tips other compensation",
      "box 1",
      "social security wages",
      "medicare wages and tips",
    ]),
  ];

  const w2Best = pickBestIncomeCandidate(w2Values);
  if (isReasonableAnnualIncome(w2Best)) return w2Best;

  const annualCompValues = [
    ...findAllAmountsNearLabel(flat, [
      "annual salary",
      "annual base salary",
      "base annual salary",
      "annual income",
      "base annual income",
      "current annual income",
      "verified annual income",
      "total annual income",
      "annual compensation",
      "current base compensation",
      "base compensation",
      "yearly salary",
      "yearly income",
      "salary",
    ]),
  ];

  const annualCompBest = pickBestIncomeCandidate(annualCompValues);
  if (isReasonableAnnualIncome(annualCompBest)) return annualCompBest;

  const ytdValues = findAllAmountsNearLabel(flat, [
    "gross pay ytd",
    "ytd gross pay",
    "year to date gross",
    "year-to-date gross",
    "ytd gross",
    "gross earnings ytd",
    "ytd earnings",
    "year to date earnings",
    "year-to-date earnings",
  ]);

  const ytdBest = pickBestIncomeCandidate(ytdValues);
  if (isReasonableAnnualIncome(ytdBest)) return ytdBest;

  const payPeriodValues = findAllAmountsNearLabel(flat, [
    "current gross pay",
    "gross pay",
    "regular earnings",
    "regular pay",
    "base pay",
    "period gross",
    "pay period gross",
  ]);

  for (const amount of payPeriodValues) {
    const annualized = annualizePayAmount(amount, flat);
    if (isReasonableAnnualIncome(annualized)) return annualized;
  }

  for (let i = 0; i < lines.length; i++) {
    const lower = lines[i].toLowerCase();

    if (
      lower.includes("wages, tips") ||
      lower.includes("box 1") ||
      lower.includes("social security wages") ||
      lower.includes("medicare wages")
    ) {
      const nearby = lines.slice(i, Math.min(i + 4, lines.length)).join(" ");
      const money = parseMoney(nearby);
      if (isReasonableAnnualIncome(money)) return money;
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const lower = lines[i].toLowerCase();

    if (
      lower.includes("annual salary") ||
      lower.includes("annual income") ||
      lower.includes("base salary") ||
      lower.includes("salary") ||
      lower.includes("gross pay ytd") ||
      lower.includes("ytd gross") ||
      lower.includes("year to date gross") ||
      lower.includes("current base compensation")
    ) {
      const nearby = lines.slice(i, Math.min(i + 4, lines.length)).join(" ");
      const money = parseMoney(nearby);
      if (money) {
        const annualized = annualizePayAmount(money, flat, nearby);
        if (isReasonableAnnualIncome(annualized)) return annualized;
        if (isReasonableAnnualIncome(money)) return money;
      }
    }
  }

  const fallbackMatches = [
    findAmountNearLabel(flat, ["wages, tips, other compensation"]),
    findAmountNearLabel(flat, ["box 1 wages tips other compensation"]),
    findAmountNearLabel(flat, ["social security wages"]),
    findAmountNearLabel(flat, ["medicare wages and tips"]),
    findAmountNearLabel(flat, ["annual salary", "base salary", "salary", "annual income"]),
    findAmountNearLabel(flat, ["gross pay ytd", "year to date gross"]),
    findAmountNearLabel(flat, ["current base compensation"]),
  ].filter((v): v is number => typeof v === "number" && Number.isFinite(v));

  if (fallbackMatches.length > 0) return fallbackMatches[0];
  return null;
}

function pickLoanAmount(text: string) {
  return findAmountNearLabel(text, [
    "loan amount",
    "requested loan amount",
    "first mortgage financing contingency amount",
    "note amount",
  ]);
}

function pickPropertyValue(text: string) {
  return findAmountNearLabel(text, [
    "property value",
    "purchase price",
    "sales price",
    "appraised value",
  ]);
}

function pickAssets(text: string) {
  const candidates = [
    findAmountNearLabel(text, ["ending balance", "available balance", "current balance"]),
    findAmountNearLabel(text, ["assets", "total assets", "liquid assets"]),
  ].filter((v): v is number => typeof v === "number" && Number.isFinite(v));

  return candidates.length ? candidates[0] : null;
}

function sumMoney(values: number[]) {
  return Math.round(values.reduce((sum, n) => sum + n, 0) * 100) / 100;
}

function isReasonableMonthlyDebtPayment(candidate: number) {
  return Number.isFinite(candidate) && candidate >= 10 && candidate <= 5000;
}

function isReasonableTotalMonthlyDebt(candidate: number) {
  return Number.isFinite(candidate) && candidate >= 25 && candidate <= 15000;
}

function pushUniqueDebtPayment(values: number[], candidate: number) {
  if (!isReasonableMonthlyDebtPayment(candidate)) return;
  if (candidate > 3000) return;
  if (values.some((existing) => Math.abs(existing - candidate) < 1)) return;
  values.push(candidate);
}

function looksLikeCreditDebtDocument(text: string) {
  const lowerFlat = cleanSpaces(text).toLowerCase();

  const creditSignals = [
    "credit report summary",
    "merged credit report",
    "representative score",
    "middle score",
    "bureau",
    "experian",
    "equifax",
    "transunion",
    "tradeline",
    "trade line",
    "installment",
    "revolving",
    "monthly payment",
    "min payment",
    "minimum payment",
    "scheduled payment",
    "payment amount",
    "amount past due",
    "balance",
  ];

  const signalCount = creditSignals.filter((signal) => lowerFlat.includes(signal)).length;

  return (
    signalCount >= 2 ||
    (lowerFlat.includes("account") && lowerFlat.includes("balance") && lowerFlat.includes("payment")) ||
    (lowerFlat.includes("credit") && lowerFlat.includes("balance") && lowerFlat.includes("monthly"))
  );
}


function normalizeCreditorName(value: string) {
  return cleanSpaces(value)
    .replace(/[_|•·]/g, " ")
    .replace(/\b(?:acct|account)\b\s*#?\s*[xX*\d-]+/g, "")
    .replace(/\b(?:xxxx|xx|x{2,})\d{2,6}\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function inferLiabilityType(creditor: string) {
  const lower = creditor.toLowerCase();
  if (lower.includes("auto") || lower.includes("ford") || lower.includes("vehicle")) return "auto";
  if (lower.includes("student") || lower.includes("greatlakes") || lower.includes("great lakes")) return "student_loan";
  if (lower.includes("mortgage") || lower.includes("home equity") || lower.includes("heloc")) return "mortgage";
  if (lower.includes("personal") || lower.includes("prosper")) return "personal_loan";
  if (lower.includes("visa") || lower.includes("amex") || lower.includes("card") || lower.includes("synchrony") || lower.includes("capital one")) return "revolving";
  return "other";
}

function liabilitySourceFromText(text: string): ParsedLiability["source"] {
  const lower = cleanSpaces(text).toLowerCase();

  // URLA/1003 documents often contain the phrase "credit report" in declarations or notes.
  // Classify them as 1003 first so noisy processor/OCR rows inside the application are not
  // treated like authoritative credit-report tradelines.
  if (
    lower.includes("uniform residential loan application") ||
    lower.includes("fannie mae form 1003") ||
    lower.includes("freddie mac form 65") ||
    lower.includes("section 2b liabilities")
  ) {
    return "1003";
  }

  if (
    lower.includes("credit report") ||
    lower.includes("tri-merge") ||
    lower.includes("tradeline") ||
    lower.includes("experian") ||
    lower.includes("equifax") ||
    lower.includes("transunion")
  ) {
    return "credit";
  }

  if (lower.includes("bank statement") || lower.includes("checking account") || lower.includes("withdrawals") || lower.includes("deposits")) return "bank";
  return "unknown";
}

function shouldExcludeLiabilityFromDti(status: string, creditor: string) {
  const combined = `${status} ${creditor}`.toLowerCase();
  return (
    combined.includes("closed") ||
    combined.includes("charge-off") ||
    combined.includes("charged off") ||
    combined.includes("disputed") ||
    combined.includes("collection only") ||
    combined.includes("paid off") ||
    combined.includes("paid-off")
  );
}

function shouldReviewLiability(status: string, creditor: string) {
  const combined = `${status} ${creditor}`.toLowerCase();
  return (
    combined.includes("deferred") ||
    combined.includes("late") ||
    combined.includes("dispute") ||
    combined.includes("high util") ||
    combined.includes("source conflict") ||
    combined.includes("verify")
  );
}

function buildLiabilityReason(liability: Omit<ParsedLiability, "reason">) {
  if (!liability.includeInDti) {
    return "Excluded from DTI because status/source suggests it should not be counted as a normal active monthly obligation.";
  }
  if (liability.reviewRequired) {
    return "Included in DTI for conservative review, but requires human validation due to status/source uncertainty.";
  }
  return "Included as active monthly obligation from structured liability evidence.";
}

function isClearlyOcrProcessorNoise(line: string) {
  return /table shifted|margin ocr|checkbox artifact|handwritten processor|source conflict|do not auto clear|value read as|processor note/i.test(line);
}

function isLikely1003LiabilitySectionStart(line: string) {
  return /section\s*2b\s+liabilities|liabilities\s*[-–—]\s*flattened\s*table|creditor\s+balance\s+monthly\s+payment/i.test(line);
}

function isLikely1003LiabilitySectionEnd(line: string) {
  return /section\s*4\s+loan\s+and\s+property|section\s*3|declarations|acknowledg/i.test(line);
}

function parseStructuredLiabilityRows(text: string): ParsedLiability[] {
  const lines = toLines(text);
  const source = liabilitySourceFromText(text);
  const liabilities: ParsedLiability[] = [];
  const seen = new Set<string>();
  let in1003LiabilitySection = source !== "1003";

  const push = (rawCreditor: string, rawBalance: string, rawPayment: string, rawStatus: string) => {
    if (source === "1003" && !in1003LiabilitySection) return;

    const rawCombined = cleanSpaces(`${rawCreditor} ${rawStatus}`);
    if (isClearlyOcrProcessorNoise(rawCombined)) return;

    const creditor = normalizeCreditorName(rawCreditor);
    const balance = safePositive(rawBalance.replace(/,/g, ""));
    const monthlyPayment = safePositive(rawPayment.replace(/O/g, "0").replace(/,/g, ""));
    const status = cleanSpaces(rawStatus || "");

    if (!creditor || creditor.length < 2) return;
    if (!monthlyPayment || monthlyPayment <= 0 || monthlyPayment > 5000) return;

    const lowerCreditor = creditor.toLowerCase();
    if (
      lowerCreditor.includes("table shifted") ||
      lowerCreditor.includes("checkbox artifact") ||
      lowerCreditor.includes("margin ocr") ||
      lowerCreditor.includes("handwritten processor") ||
      lowerCreditor.includes("source conflict") ||
      lowerCreditor.includes("do not auto clear")
    ) {
      return;
    }

    const includeInDti = !shouldExcludeLiabilityFromDti(status, creditor);
    const reviewRequired = shouldReviewLiability(status, creditor) || source === "bank" || source === "unknown";
    const confidence: ParsedLiability["confidence"] = source === "credit" || source === "1003" ? (reviewRequired ? "medium" : "high") : "low";
    const key = `${creditor.toLowerCase()}__${monthlyPayment}`;
    if (seen.has(key)) return;
    seen.add(key);

    const liabilityBase = {
      creditor,
      accountType: inferLiabilityType(creditor),
      balance: balance ?? null,
      monthlyPayment,
      status,
      includeInDti,
      reviewRequired,
      confidence,
      source,
    };

    liabilities.push({
      ...liabilityBase,
      reason: buildLiabilityReason(liabilityBase),
    });
  };

  for (const line of lines) {
    const normalized = cleanSpaces(line);
    if (!normalized) continue;

    if (source === "1003") {
      if (isLikely1003LiabilitySectionStart(normalized)) {
        in1003LiabilitySection = true;
        continue;
      }

      if (in1003LiabilitySection && isLikely1003LiabilitySectionEnd(normalized)) {
        break;
      }

      if (!in1003LiabilitySection) continue;
      if (isClearlyOcrProcessorNoise(normalized)) continue;
    } else if (isClearlyOcrProcessorNoise(normalized) && !/\bcredit\s+report\b|\btradeline\b/i.test(normalized)) {
      continue;
    }

    // URLA / 1003 and flattened table style:
    // Visa BankCard 7782 BAL 6,920 MONTHLY 185 open
    const urla = normalized.match(/^(.+?)\s+BAL\s+([\d,]+(?:\.\d{2})?)\s+(?:MONTHLY|MO(?:NTHLY)?|MIN\s*PAY|PAYMENT)\s+([\d,]+(?:\.\d{2})?)\s+(.+)$/i);
    if (urla?.[1] && urla?.[2] && urla?.[3]) {
      push(urla[1], urla[2], urla[3], urla[4] || "");
      continue;
    }

    // OCR shifted style from true credit reports only.
    // Never use processor-note/table-shift fragments from the 1003 as authoritative debts.
    if (source !== "1003") {
      const shifted = normalized.match(/^(.+?)\s+BAL\s+([\d,]+(?:\.\d{2})?)\s+MIN\s+PAY\s+([\d,]+(?:\.\d{2})?)\s+STATUS\s+(.+)$/i);
      if (shifted?.[1] && shifted?.[2] && shifted?.[3]) {
        push(shifted[1], shifted[2], shifted[3], shifted[4] || "");
        continue;
      }

      const labeled = normalized.match(/^(.+?)\s+(?:balance|bal)\s+([\d,]+(?:\.\d{2})?).{0,50}?(?:monthly\s+payment|minimum\s+payment|min\s+pay|payment)\s+([\d,]+(?:\.\d{2})?)\s*(.*)$/i);
      if (labeled?.[1] && labeled?.[2] && labeled?.[3]) {
        push(labeled[1], labeled[2], labeled[3], labeled[4] || "");
      }
    }
  }

  return liabilities;
}

function parseBankRecurringDebtSignals(text: string): ParsedLiability[] {
  const source = liabilitySourceFromText(text);
  if (source !== "bank") return [];

  const lines = toLines(text);
  const liabilities: ParsedLiability[] = [];
  const debtMerchantPatterns = [
    /\b(AMEX|AMERICAN EXPRESS|CAPITAL ONE|FORD CREDIT|ALLY|CHASE CARD|DISCOVER|SYNCHRONY|PROSPER|GREATLAKES|GREAT LAKES)\b/i,
  ];

  for (const line of lines) {
    const isLikelyDebtPayment = debtMerchantPatterns.some((pattern) => pattern.test(line));
    if (!isLikelyDebtPayment) continue;
    if (/payroll|deposit|transfer to savings|zelle|pos |atm|service fee|insurance|comcast|costco|walmart|target|amazon/i.test(line)) continue;

    const numbers = parseNumbers(line);
    const payment = numbers.find((n) => n >= 10 && n <= 3000) ?? null;
    if (!payment) continue;

    const creditor = normalizeCreditorName(line.replace(/[\d,]+(?:\.\d{2})?/g, ""));
    const liabilityBase = {
      creditor: creditor || "Recurring debt-like bank payment",
      accountType: inferLiabilityType(creditor),
      balance: null,
      monthlyPayment: payment,
      status: "bank recurring payment signal",
      includeInDti: false,
      reviewRequired: true,
      confidence: "low" as const,
      source: "bank" as const,
    };

    liabilities.push({
      ...liabilityBase,
      reason: "Bank statement payment signal only. Do not include automatically when credit/1003 liability evidence is available; use as missing-debt or double-count review signal.",
    });
  }

  return liabilities;
}

function pickLiabilities(text: string): ParsedLiability[] {
  const structured = parseStructuredLiabilityRows(text);
  const bankSignals = parseBankRecurringDebtSignals(text);

  const byKey = new Map<string, ParsedLiability>();
  for (const liability of [...structured, ...bankSignals]) {
    const key = `${liability.creditor.toLowerCase()}__${liability.monthlyPayment ?? 0}__${liability.source}`;
    if (!byKey.has(key)) byKey.set(key, liability);
  }

  return Array.from(byKey.values());
}

function sumIncludedLiabilities(liabilities: ParsedLiability[]) {
  const values = liabilities
    .filter((liability) => liability.includeInDti)
    .map((liability) => liability.monthlyPayment)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0);

  return values.length ? sumMoney(values) : null;
}

function extractExplicitTotalMonthlyDebt(text: string) {
  const flat = cleanSpaces(text);

  const labels = [
    "total monthly debt payment",
    "total monthly debt payments",
    "total monthly obligations",
    "total monthly liabilities",
    "total monthly debt",
    "monthly debts",
    "monthly debt",
    "total liabilities payment",
    "total payment due monthly",
  ];

  for (const label of labels) {
    const pattern = new RegExp(`${label}[^\\d$]{0,40}\\$?\\s*([\\d,]+(?:\\.\\d{2})?)`, "i");
    const m = flat.match(pattern);
    if (!m?.[1]) continue;

    const value = Number(m[1].replace(/,/g, ""));
    if (isReasonableTotalMonthlyDebt(value)) return value;
  }

  return null;
}

function extractStrictLabeledDebtPayments(text: string) {
  const flat = cleanSpaces(text);
  const payments: number[] = [];

  const strictPatterns = [
    /\bmonthly\s+payment\b[^0-9$]{0,30}\$?\s*([\d,]+(?:\.\d{2})?)/gi,
    /\bmonthly\s+pmt\b[^0-9$]{0,30}\$?\s*([\d,]+(?:\.\d{2})?)/gi,
    /\bmo\.?\s+pmt\b[^0-9$]{0,30}\$?\s*([\d,]+(?:\.\d{2})?)/gi,
    /\bpmt\b[^0-9$]{0,20}\$?\s*([\d,]+(?:\.\d{2})?)/gi,
    /\bpayment\s+amount\b[^0-9$]{0,30}\$?\s*([\d,]+(?:\.\d{2})?)/gi,
    /\bscheduled\s+payment\b[^0-9$]{0,30}\$?\s*([\d,]+(?:\.\d{2})?)/gi,
    /\bminimum\s+payment\b[^0-9$]{0,30}\$?\s*([\d,]+(?:\.\d{2})?)/gi,
    /\bmin(?:imum)?\s+pmt\b[^0-9$]{0,30}\$?\s*([\d,]+(?:\.\d{2})?)/gi,
    /\brequired\s+payment\b[^0-9$]{0,30}\$?\s*([\d,]+(?:\.\d{2})?)/gi,
    /\bmonthly\s+obligation\b[^0-9$]{0,30}\$?\s*([\d,]+(?:\.\d{2})?)/gi,
    /\$?\s*([\d,]+(?:\.\d{2})?)\s*(?:per\s+month|\/\s*month|monthly\s+payment)\b/gi,
  ];

  for (const pattern of strictPatterns) {
    for (const match of flat.matchAll(pattern)) {
      if (!match?.[1]) continue;
      const value = Number(match[1].replace(/,/g, ""));
      pushUniqueDebtPayment(payments, value);
    }
  }

  return payments;
}

function parseNumbers(value: string) {
  return Array.from(value.matchAll(/\$?\s*([\d,]+(?:\.\d{2})?)/g))
    .map((match) => Number(match[1].replace(/,/g, "")))
    .filter((n) => Number.isFinite(n) && n > 0);
}

function extractHeaderGuidedCreditRowPayments(text: string) {
  const lines = toLines(text);
  const payments: number[] = [];
  let paymentColumnIndex: number | null = null;
  let headerActiveUntil = -1;

  const paymentHeaderPattern =
    /(?:monthly\s+payment|monthly\s+pmt|mo\.?\s+pmt|min(?:imum)?\s+payment|min\s+pmt|scheduled\s+payment|payment\s+amount|required\s+payment)/i;

  const balanceHeaderPattern = /(?:balance|limit|high\s+credit|past\s+due|amount\s+owed)/i;

  const accountWords = [
    "auto loan",
    "car loan",
    "vehicle loan",
    "auto finance",
    "mortgage",
    "student loan",
    "personal loan",
    "installment loan",
    "revolving",
    "credit card",
    "bankcard",
    "retail card",
    "department store",
    "heloc",
    "home equity",
    "child support",
    "alimony",
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lower = line.toLowerCase();

    if (paymentHeaderPattern.test(line)) {
      const beforePaymentHeader = line.split(paymentHeaderPattern)[0] || "";
      const beforeNumbers = parseNumbers(beforePaymentHeader);
      paymentColumnIndex = beforeNumbers.length;
      headerActiveUntil = i + 35;
      continue;
    }

    if (i > headerActiveUntil) {
      paymentColumnIndex = null;
    }

    if (paymentColumnIndex === null) continue;
    if (lower.includes("closed") && !lower.includes("open") && !lower.includes("current")) continue;
    if (!accountWords.some((word) => lower.includes(word))) continue;

    const numbers = parseNumbers(line);
    if (!numbers.length) continue;

    const chosen = numbers[paymentColumnIndex] ?? numbers[numbers.length - 1];

    if (isReasonableMonthlyDebtPayment(chosen)) {
      // Guard against choosing balances/limits when a row is clearly balance-heavy.
      const hasBalanceLanguage = balanceHeaderPattern.test(line);
      const largerNumbers = numbers.filter((n) => n > 5000);

      if (hasBalanceLanguage && largerNumbers.includes(chosen)) continue;
      pushUniqueDebtPayment(payments, chosen);
    }
  }

  return payments;
}

function extractMortgageCreditMoPayments(text: string) {
  const flat = cleanSpaces(text);
  const payments: number[] = [];

  const tradelinePattern =
    /\b[A-Z][A-Z0-9/&.\-\s]{2,80}\s+xxxx\d{3,6}\s+(?:EXP|EQF|TU|EXP\/EQF\/TU|EXP\/TU|EQF\/TU|EXP\/EQF)[^\\n]{0,220}?\bbal\s+[\d,]+\s+\bmo\s+([0-9O]{1,5})\b\s+([^\\n]{0,100}?)(?=\s+payment history|\s+INQUIRIES|\s+Monthly obligation|\s+handwritten|\s+checkbox|\s+table shifted|\s+margin OCR|\s+page\s+\d+|$)/gi;

  for (const match of flat.matchAll(tradelinePattern)) {
    const rawPayment = String(match[1] || "").replace(/O/g, "0");
    const statusText = cleanSpaces(String(match[2] || "")).toLowerCase();
    const value = Number(rawPayment.replace(/,/g, ""));

    if (!Number.isFinite(value) || value <= 0) continue;
    if (value > 3000) continue;
    if (statusText.includes("closed")) continue;
    if (statusText.includes("disputed")) continue;
    if (statusText.includes("charged off")) continue;
    if (statusText.includes("charge-off")) continue;

    const activeSignal =
      statusText.includes("open") ||
      statusText.includes("current") ||
      statusText.includes("pays as agreed") ||
      statusText.includes("30 late") ||
      statusText.includes("60 late") ||
      statusText.includes("90 late") ||
      statusText.includes("ok");

    if (!activeSignal) continue;

    pushUniqueDebtPayment(payments, value);
  }

  if (payments.length > 0) return payments;

  const simpleMoPattern =
    /\bmo\s+([0-9O]{1,5})\b[^\\n]{0,80}?\b(OPEN|CURRENT|PAYS\s+AS\s+AGREED|30\s+LATE|60\s+LATE|90\s+LATE|OK)\b/gi;

  for (const match of flat.matchAll(simpleMoPattern)) {
    const rawPayment = String(match[1] || "").replace(/O/g, "0");
    const value = Number(rawPayment.replace(/,/g, ""));

    if (!Number.isFinite(value) || value <= 0 || value > 3000) continue;
    pushUniqueDebtPayment(payments, value);
  }

  return payments;
}

function extractMinPayRows(text: string) {
  const flat = cleanSpaces(text);
  const payments: number[] = [];

  const minPayPattern =
    /\bBAL\s+[\d,]+\s+MIN\s+PAY\s+([0-9O]{1,4})\s+STATUS\s+([A-Z0-9\s\-]+?)(?=\s+(?:table shifted|handwritten|checkbox|margin OCR|page\s+\d+|$))/gi;

  for (const match of flat.matchAll(minPayPattern)) {
    const rawPayment = String(match[1] || "").replace(/O/g, "0");
    const status = cleanSpaces(String(match[2] || "")).toLowerCase();
    const value = Number(rawPayment.replace(/,/g, ""));

    if (!Number.isFinite(value) || value <= 0) continue;
    if (status.includes("charge-off")) continue;
    if (status.includes("charged off")) continue;
    if (status.includes("disputed")) continue;

    pushUniqueDebtPayment(payments, value);
  }

  return payments;
}

function extractStrictCreditRowPayments(text: string) {
  const lines = toLines(text);
  const payments: number[] = [];

  const primaryTradelinePayments = extractMortgageCreditMoPayments(text);
  primaryTradelinePayments.forEach((payment) => pushUniqueDebtPayment(payments, payment));

  // If a real tri-merge tradeline block exists, trust the explicit "mo" column and do not pile on
  // OCR-shifted MIN PAY fragments from later pages. Those are often duplicate/noisy artifacts.
  if (primaryTradelinePayments.length === 0) {
    extractMinPayRows(text).forEach((payment) => pushUniqueDebtPayment(payments, payment));
  }

  extractHeaderGuidedCreditRowPayments(text).forEach((payment) => pushUniqueDebtPayment(payments, payment));

  const accountWords = [
    "auto loan",
    "car loan",
    "vehicle loan",
    "auto finance",
    "mortgage",
    "student loan",
    "personal loan",
    "installment loan",
    "revolving",
    "credit card",
    "bankcard",
    "retail card",
    "department store",
    "heloc",
    "home equity",
    "child support",
    "alimony",
  ];

  const paymentHeaderWords = [
    "monthly payment",
    "monthly pmt",
    "mo pmt",
    "mo. pmt",
    "minimum payment",
    "min pmt",
    "scheduled payment",
    "payment amount",
    "required payment",
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lower = line.toLowerCase();

    if (lower.includes("closed") && !lower.includes("open") && !lower.includes("current")) continue;

    const isAccountLine = accountWords.some((word) => lower.includes(word));
    const hasPaymentLabel = paymentHeaderWords.some((word) => lower.includes(word));

    if (!isAccountLine && !hasPaymentLabel) continue;

    const localBlock = lines.slice(i, Math.min(i + 3, lines.length)).join(" ");
    const labeledPayments = extractStrictLabeledDebtPayments(localBlock);
    labeledPayments.forEach((payment) => pushUniqueDebtPayment(payments, payment));
  }

  return payments;
}

function extractStrictLiabilitySectionPayments(text: string) {
  const flat = cleanSpaces(text);
  const payments: number[] = [];

  const sectionPattern =
    /\b(?:liabilities|monthly liabilities|debts|monthly debts|schedule of real estate owned|reo liabilities|credit liabilities)\b(.{0,1800})/i;

  const sectionMatch = flat.match(sectionPattern);
  if (!sectionMatch?.[1]) return payments;

  const section = sectionMatch[1];

  extractStrictLabeledDebtPayments(section).forEach((payment) => pushUniqueDebtPayment(payments, payment));
  extractStrictCreditRowPayments(section).forEach((payment) => pushUniqueDebtPayment(payments, payment));

  return payments;
}


function normalizeLiabilityMonthlyPayment(
  creditor: string,
  balance: number | null | undefined,
  payment: number | null | undefined,
  status: string
): number | null {
  const rawPayment = safePositive(payment);
  const rawBalance = safePositive(balance);
  const combined = cleanSpaces(`${creditor || ""} ${status || ""}`).toLowerCase();

  if (!rawPayment) return null;

  // Do not treat charge-off/collection/dispute rows as normal monthly debts.
  if (
    combined.includes("charge-off") ||
    combined.includes("charge off") ||
    combined.includes("collection") ||
    combined.includes("judgment") ||
    combined.includes("disputed") ||
    combined.includes("dispute")
  ) {
    return null;
  }

  // If a parser accidentally captured a balance-like number as the payment,
  // reject it. Monthly debts should not be close to the full balance.
  if (rawBalance && rawPayment >= rawBalance * 0.2 && rawPayment > 300) {
    return null;
  }

  // Mortgage/rent/proposed housing should not be part of existing monthly liabilities.
  if (
    combined.includes("rent") ||
    combined.includes("mortgage") ||
    combined.includes("proposed housing") ||
    combined.includes("piti")
  ) {
    return null;
  }

  // Consumer liabilities with very large "monthly" amounts are usually OCR/table-shift errors.
  if (rawPayment > 1500) return null;

  return rawPayment;
}

function buildLiabilityRow(
  creditor: string,
  balance: number | null | undefined,
  payment: number | null | undefined,
  status: string,
  source: string
) {
  const normalizedPayment = normalizeLiabilityMonthlyPayment(creditor, balance, payment, status);


function normalizeExtractedLiabilities(liabilities: any[]): any[] {
  if (!Array.isArray(liabilities)) return [];

  return liabilities
    .map((row) => {
      if (!row || typeof row !== "object") return null;

      const creditor = cleanSpaces(row.creditor || row.name || row.label || "");
      const balance = safePositive(row.balance);
      const monthlyPayment = normalizeLiabilityMonthlyPayment(
        creditor,
        balance,
        row.monthlyPayment ?? row.payment ?? row.minPayment,
        row.status || ""
      );

      if (!creditor || !monthlyPayment) return null;

      return {
        ...row,
        creditor,
        balance: balance ?? null,
        monthlyPayment,
        status: cleanSpaces(row.status || ""),
      };
    })
    .filter(Boolean);
}

  return {
    creditor: cleanSpaces(creditor),
    balance: safePositive(balance),
    monthlyPayment: normalizedPayment,
    status: cleanSpaces(status),
    source,
  };
}


function pickDebts(text: string) {
  const liabilities = pickLiabilities(text);
  const includedTotal = sumIncludedLiabilities(liabilities);
  if (includedTotal !== null && isReasonableTotalMonthlyDebt(includedTotal)) return includedTotal;

  const flat = cleanSpaces(text);
  const lower = flat.toLowerCase();

  const looksBankLike =
    lower.includes("bank statement") ||
    lower.includes("checking account") ||
    lower.includes("savings account") ||
    lower.includes("ending balance") ||
    lower.includes("beginning balance") ||
    lower.includes("deposits") ||
    lower.includes("withdrawals");

  const isCreditLike = looksLikeCreditDebtDocument(flat);
  const looks1003LiabilityLike =
    lower.includes("uniform residential loan application") ||
    lower.includes("1003") ||
    lower.includes("liabilities") ||
    lower.includes("monthly liabilities") ||
    lower.includes("real estate owned") ||
    lower.includes("reo liabilities");

  const explicitTotal = extractExplicitTotalMonthlyDebt(flat);
  if (explicitTotal !== null) return explicitTotal;

  if (isCreditLike || looks1003LiabilityLike) {
    const sectionPayments = extractStrictLiabilitySectionPayments(text);
    if (sectionPayments.length >= 1) return sumMoney(sectionPayments);

    const rowPayments = extractStrictCreditRowPayments(text);
    if (rowPayments.length >= 1) return sumMoney(rowPayments);

    const labeledPayments = extractStrictLabeledDebtPayments(text);
    if (labeledPayments.length >= 1) return sumMoney(labeledPayments);
  }

  if (looksBankLike) return null;

  return null;
}

function buildExtracted(text: string): ExtractedFields {
  const borrower = pickBorrowerName(text);
  const email = pickFirstEmail(text);
  const dob = pickDOB(text);
  const ssnLast4 = pickSSNLast4(text);
  const loanNumber = pickLoanNumber(text);
  const address = pickAddress(text);
  const employerAddress = pickEmployerAddress(text);
  const income = pickIncome(text);
  const creditScore = pickCreditScore(text);
  const loanAmount = pickLoanAmount(text);
  const propertyValue = pickPropertyValue(text);
  const assets = pickAssets(text);
  const debts = pickDebts(text);
  const liabilities = pickLiabilities(text);

  return {
    borrower,
    fullName: borrower,
    email,
    dob,
    ssnLast4,
    loanNumber,
    address,
    employerAddress,
    income,
    creditScore,
    loanAmount,
    propertyValue,
    assets,
    debts,
    liabilities,
  };
}

async function parsePdfWithFallbacks(buffer: Buffer) {
  const attempts: Array<{
    label: string;
    options?: Record<string, unknown>;
  }> = [
    { label: "default" },
    { label: "pdfjs-v1.10.100", options: { version: "v1.10.100" } },
    { label: "pdfjs-v1.9.426", options: { version: "v1.9.426" } },
    { label: "pdfjs-v2.0.550", options: { version: "v2.0.550" } },
  ];

  const errors: string[] = [];

  for (const attempt of attempts) {
    try {
      const parsed = await pdf(buffer, attempt.options as any);
      const text = parsed?.text || "";

      if (cleanSpaces(text).length > 0) {
        return parsed;
      }

      errors.push(`${attempt.label}: parser returned empty text`);
    } catch (err: any) {
      errors.push(`${attempt.label}: ${err?.message || "parser threw an exception"}`);
    }
  }

  throw new Error(`PDF parser failed after fallback attempts. ${errors.join(" | ")}`);
}

export async function extractFieldsFromBuffer(buffer: Buffer) {
  const parsed = await parsePdfWithFallbacks(buffer);
  const text = parsed.text || "";
  const extracted = buildExtracted(text);

  return {
    text,
    extracted,
  };
}