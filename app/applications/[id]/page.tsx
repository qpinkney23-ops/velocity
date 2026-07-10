"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { db, storage } from "@/lib/firebase";
import {
  arrayUnion,
  collection,
  deleteField,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { deleteObject, getDownloadURL, ref, uploadBytesResumable } from "firebase/storage";
import { useToast } from "@/components/ui/ToastProvider";

type Underwriter = {
  id: string;
  name?: string;
  email?: string;
  active?: boolean;
};

type StoredDoc = {
  name: string;
  url: string;
  path: string;
  uploadedAtMs: number;
};

type ScanCondition = {
  label: string;
  severity: "low" | "med" | "high";
  evidence?: string;
};

type ReportFactor = {
  key?: string;
  label: string;
  impact: string;
  summary: string;
  source?: string;
  value?: number | string | null;
};

type FactorDisplay = {
  summary: string;
  source: string;
};

type SourceConfidence = {
  field: string;
  sourceLabel: string;
  confidenceLabel: "High" | "Medium" | "Low";
  confidence: number | null;
  reason: string;
  docName?: string;
  docType?: string;
  method?: string;
  evidenceCount: number;
};

type SourceConfidenceMap = Record<string, SourceConfidence>;


type HousingPaymentBreakdown = {
  principalAndInterest?: number | null;
  taxes?: number | null;
  insurance?: number | null;
  mortgageInsurance?: number | null;
  hoa?: number | null;
  total?: number | null;
  estimatedRate?: number | null;
  assumptionSource?: string;
  confidence?: string;
};

type UnderwritingReport = {
  summary: {
    decision: string;
    risk: string;
    score: number;
    confidence: number;
  };
  borrower?: {
    name?: string;
    email?: string;
    loanNumber?: string;
  };
  loan: {
    loanAmount: number;
    propertyValue: number;
    ltv: number;
  };
  financials: {
    income: number;
    debts: number;
    dti: number;
    totalDti?: number;
    housingPaymentBreakdown?: HousingPaymentBreakdown;
    assets: number;
  };
  decision: {
    reason: string;
    conditions: string[];
  };
  factors: ReportFactor[];
};

type ScanResult = {
  mode: "pdf-parse" | "unknown";
  scannedAtMs: number;
  docName?: string;
  summary: string;
  preview?: string;
  extracted: {
    borrower?: string;
    coBorrower?: string;
    email?: string;
    loanNumber?: string;
    loanAmount?: number | null;
    fullName?: string;
    dob?: string;
    ssnLast4?: string;
    income?: number | null;
    creditScore?: number | null;
    address?: string;
    employerAddress?: string;
    assets?: number | null;
    debts?: number | null;
    propertyValue?: number | null;
  };
  conditions: ScanCondition[];
  redFlags: string[];
  ai?: {
    verdict?: string;
    risk?: string;
    confidence?: number;
    score?: number;
    reason?: string;
    dti?: number;
    ltv?: number;
    conditions?: string[];
    factors?: Array<{
      key?: string;
      label?: string;
      value?: number | string | null;
      impact?: "positive" | "neutral" | "negative";
      summary?: string;
      source?: string;
    }>;
  } | null;
  report?: UnderwritingReport | null;
  diagnostics?: ScanDiagnostics | null;
  sourceConfidence?: SourceConfidenceMap | null;
  canonicalConditions?: CanonicalWorkflowCondition[];
  readiness?: WorkflowReadiness | null;
};

type BorrowerProfileField = {
  value?: any;
  status?: string;
  source?: string;
  updatedAtMs?: number;
};

type BorrowerProfileFS = {
  [k: string]: BorrowerProfileField | undefined;
};

type BorrowerProfileFlat = {
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
  debts?: number | null;
  dti?: number | null;
  ltv?: number | null;
};

type UWConditionSource = "ai" | "borrower_profile" | "manual";

type UWCondition = {
  id: string;
  label: string;
  severity: "low" | "med" | "high";
  status: "open" | "done";
  source: UWConditionSource;
  evidence?: string;
  createdAtMs: number;
  updatedAtMs: number;
};

type AppDoc = {
  borrowerName?: string;
  email?: string;
  loanNumber?: string;
  loanAmount?: number;
  status?: string;
  underwriterId?: string;
  notes?: string;
  storedDocs?: StoredDoc[];
  scan?: ScanResult;
  borrowerProfile?: BorrowerProfileFS;
  borrowerProfileVerified?: Record<string, boolean>;
  uwConditions?: UWCondition[];
  conditions?: any[];
  createdAt?: any;
  updatedAt?: any;
};

type BlockingReason = {
  label: string;
  source: string;
  severity: "low" | "med" | "high";
  evidence?: string;
};

type WorkflowReadiness = {
  readinessScore?: number;
  readinessLabel?: "not_ready" | "high_risk" | "needs_conditions" | "near_ready" | "clear_to_close" | string;
  unresolvedBlockingConditions?: number;
  unresolvedConditions?: number;
  borrowerActionCount?: number;
  processorActionCount?: number;
  underwriterActionCount?: number;
  estimatedCloseability?: "low" | "medium" | "high" | string;
  topBlockingReasons?: string[];
  nextBestActions?: string[];
  workflowRisk?: "low" | "medium" | "high" | string;
};

type CanonicalWorkflowCondition = {
  id: string;
  title?: string;
  summary?: string;
  category?: string;
  severity?: "low" | "med" | "high";
  blocking?: boolean;
  status?: string;
  owner?: "loan_officer" | "processor" | "underwriter" | "borrower" | "system" | string;
  borrowerVisible?: boolean;
  autoClearEligible?: boolean;
  confidence?: number | null;
  relatedFields?: string[];
  evidence?: Array<{
    sourceDoc?: string;
    sourceType?: string;
    snippet?: string;
    confidence?: number | null;
    relatedField?: string;
    page?: number | null;
  }>;
  evidenceRefs?: string[];
  requiredActions?: string[];
  requiredDocuments?: string[];
  dependencyConditions?: string[];
  resolutionStrategy?: string;
  source?: string;
  createdAt?: string;
  updatedAt?: string;
};

type AnalyzeResponse = {
  ok?: boolean;
  id?: string;
  mode?: string;
  docName?: string;
  extracted?: Partial<ScanResult["extracted"]>;
  summary?: string;
  preview?: string;
  conditions?: ScanCondition[];
  redFlags?: string[];
  ai?: ScanResult["ai"];
  report?: UnderwritingReport | null;
  canonicalConditions?: CanonicalWorkflowCondition[];
  readiness?: WorkflowReadiness | null;
  docsProcessed?: Array<{ name: string; type: string }>;
  docsProcessedCount?: number;
  docsUploaded?: number;
  docsSkippedCount?: number;
  docsSkipped?: Array<{
    name: string;
    reason: string;
    detail?: string;
  }>;
  runtimeDocDebug?: Array<{
    name: string;
    type?: string;
    parsedDebts?: number | null;
    routeCreditDebts?: number | null;
    finalDocDebts?: number | null;
    finalAddress?: string;
    finalEmployerAddress?: string;
    ocrInputType?: string;
    ocrEngine?: string;
    ocrConfidence?: number;
    ocrConfidenceLabel?: string;
    ocrWarnings?: string[];
    extractedDirectText?: boolean;
    attemptedImagePipeline?: boolean;
  }>;
  analysis?: {
    borrowerProfile?: Record<
      string,
      {
        value?: any;
        confidence?: number | null;
        winningSource?: {
          docName?: string;
          docType?: string;
          method?: string;
        } | null;
        evidenceRefs?: string[];
      }
    >;
    canonicalConditions?: CanonicalWorkflowCondition[];
    readiness?: WorkflowReadiness | null;
    normalized?: {
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
      assets?: number | null;
      debts?: number | null;
      propertyValue?: number | null;
      dti?: number | null;
      ltv?: number | null;
    };
  };
};

type ScanDiagnostics = {
  uploadedCount: number;
  processedCount: number;
  skippedCount: number;
  skippedDocs: Array<{
    name: string;
    reason: string;
    detail?: string;
  }>;
  runtimeDocDebug?: Array<{
    name: string;
    type?: string;
    parsedDebts?: number | null;
    routeCreditDebts?: number | null;
    finalDocDebts?: number | null;
    finalAddress?: string;
    finalEmployerAddress?: string;
    ocrInputType?: string;
    ocrEngine?: string;
    ocrConfidence?: number;
    ocrConfidenceLabel?: string;
    ocrWarnings?: string[];
    extractedDirectText?: boolean;
    attemptedImagePipeline?: boolean;
  }>;
};

function formatMoney(n?: number | null) {
  const v = typeof n === "number" && Number.isFinite(n) ? n : 0;
  return `$${v.toLocaleString()}`;
}

function formatPercent(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  const normalized = Math.abs(value) <= 1 ? value * 100 : value;
  return `${normalized.toFixed(2)}%`;
}

function formatConfidence(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return value.toFixed(2);
}

function ocrConfidenceTone(value?: string | number | null) {
  const clean = String(value || "").toLowerCase();

  if (clean === "high") return "green" as const;
  if (clean === "medium") return "amber" as const;
  if (clean === "low") return "red" as const;

  if (typeof value === "number" && Number.isFinite(value)) {
    if (value >= 0.85) return "green" as const;
    if (value >= 0.6) return "amber" as const;
    return "red" as const;
  }

  return "gray" as const;
}

function ocrPipelineLabel(item: {
  extractedDirectText?: boolean;
  attemptedImagePipeline?: boolean;
}) {
  if (item.extractedDirectText) return "Direct Text";
  if (item.attemptedImagePipeline) return "Image/OCR Fallback";
  return "Unknown";
}

function fmtDateTimeFromMs(ms?: number) {
  if (!ms || !Number.isFinite(ms)) return "-";
  const d = new Date(ms);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleString();
}

function sanitizeFilename(name: string) {
  return (name || "document").replace(/[^\w.\-()\s]/g, "").replace(/\s+/g, " ").trim();
}

function makeId(prefix = "cond") {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

function toTitleWords(value: string) {
  return (value || "")
    .replace(/[_\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function prettyVerdict(value?: string) {
  if (!value) return "-";
  return toTitleWords(value);
}

function prettyRisk(value?: string) {
  if (!value) return "-";
  return toTitleWords(value);
}

function statusTone(status: string) {
  const s = (status || "").toLowerCase();
  if (s.includes("approve")) return "green";
  if (s.includes("deny") || s.includes("decline") || s.includes("block")) return "red";
  if (s.includes("condition")) return "amber";
  if (s.includes("review") || s.includes("uw")) return "blue";
  if (s.includes("new")) return "gray";
  return "gray";
}

function impactTone(impact?: string) {
  const i = (impact || "").toLowerCase();
  if (i === "positive") return "green";
  if (i === "negative") return "red";
  return "gray";
}

function sourceTone(source: UWConditionSource) {
  if (source === "ai") return "blue";
  if (source === "manual") return "amber";
  return "gray";
}

function sourceLabel(source: UWConditionSource) {
  if (source === "ai") return "AI";
  if (source === "manual") return "Manual";
  return "Borrower Profile";
}

function normalizeFactorSummary(factor: ReportFactor): FactorDisplay {
  const key = (factor.key || "").trim().toLowerCase();
  const label = (factor.label || "").trim().toLowerCase();
  const summary = (factor.summary || "").trim();
  const source = (factor.source || "").trim();
  const impact = (factor.impact || "").trim().toLowerCase();

  if (key === "total_dti" || label === "total dti") {
    return {
      summary: summary || "Total DTI includes existing monthly debts plus proposed housing payment.",
      source: source ? `Source: ${source}` : "",
    };
  }

  if (key === "proposed_housing_payment" || label === "proposed housing payment") {
    return {
      summary: summary || "Estimated proposed housing payment/PITI was calculated from loan and property data.",
      source: source ? `Source: ${source}` : "",
    };
  }

  if (label === "income" && impact === "positive") {
    return {
      summary: "Income verified in file.",
      source: source ? `Source: ${source}` : "",
    };
  }

  if (label === "assets" && impact === "positive") {
    return {
      summary: "Assets verified in file.",
      source: source ? `Source: ${source}` : "",
    };
  }

  if (label === "debts" && (impact === "positive" || impact === "neutral")) {
    return {
      summary: "Debt obligations identified in file.",
      source: source ? `Source: ${source}` : "",
    };
  }

  if (label === "dti" || label.includes("debt-to-income")) {
    return {
      summary: summary || "DTI calculated from normalized monthly debts and verified income.",
      source: source ? `Source: ${source}` : "",
    };
  }

  return {
    summary: summary || "-",
    source: source ? `Source: ${source}` : "",
  };
}

function isDtiFactor(factor?: {
  key?: string;
  label?: string;
  summary?: string;
} | null) {
  const key = (factor?.key || "").toString().trim().toLowerCase();
  const label = (factor?.label || "").toString().trim().toLowerCase();
  const summary = (factor?.summary || "").toString().trim().toLowerCase();

  return (
    key === "dti" ||
    key === "total_dti" ||
    label === "dti" ||
    label === "total dti" ||
    label.includes("debt-to-income") ||
    summary.includes("dti of") ||
    summary.includes("total underwriting dti")
  );
}

function normalizeConfidenceLabel(value?: number | null): SourceConfidence["confidenceLabel"] {
  if (typeof value !== "number" || !Number.isFinite(value)) return "Low";
  if (value >= 0.9) return "High";
  if (value >= 0.75) return "Medium";
  return "Low";
}

function sourceConfidenceTone(label: SourceConfidence["confidenceLabel"]) {
  if (label === "High") return "green" as const;
  if (label === "Medium") return "amber" as const;
  return "red" as const;
}

function titleFromSourceDoc(docType?: string, docName?: string) {
  const type = (docType || "").trim();
  const name = (docName || "").trim();

  if (name && type) return `${name} (${type})`;
  if (name) return name;
  if (type) return type;
  return "source documents";
}

function sourceConfidenceReason(field: string, source?: SourceConfidence["docType"], docName?: string) {
  const sourceName = titleFromSourceDoc(source, docName);

  if (field === "income") {
    return `Winning income value came from ${sourceName}.`;
  }

  if (field === "debts" || field === "dti") {
    return `DTI uses the winning monthly liability value from ${sourceName}.`;
  }

  if (field === "creditScore") {
    return `Credit score was selected from the highest-priority credit source available: ${sourceName}.`;
  }

  if (field === "propertyValue" || field === "ltv") {
    return `LTV uses the winning property value source: ${sourceName}.`;
  }

  if (field === "loanAmount") {
    return `Loan amount was selected from the highest-priority loan source available: ${sourceName}.`;
  }

  if (field === "assets") {
    return `Assets were selected from the strongest available asset source: ${sourceName}.`;
  }

  if (field === "borrower" || field === "fullName") {
    return `Borrower identity was selected from the highest-priority identity source available: ${sourceName}.`;
  }

  return `Winning value came from ${sourceName}.`;
}

function buildSourceConfidenceFromAnalysis(analysis?: AnalyzeResponse["analysis"]): SourceConfidenceMap {
  const out: SourceConfidenceMap = {};
  const profile = analysis?.borrowerProfile || {};

  const add = (field: string, aliases: string[] = []) => {
    const node = profile[field];
    if (!node) return;

    const confidence =
      typeof node.confidence === "number" && Number.isFinite(node.confidence)
        ? node.confidence
        : null;

    const docName = node.winningSource?.docName || "";
    const docType = node.winningSource?.docType || "";
    const method = node.winningSource?.method || "";
    const evidenceCount = Array.isArray(node.evidenceRefs) ? node.evidenceRefs.length : 0;
    const confidenceLabel = normalizeConfidenceLabel(confidence);

    const item: SourceConfidence = {
      field,
      sourceLabel: titleFromSourceDoc(docType, docName),
      confidenceLabel,
      confidence,
      reason: sourceConfidenceReason(field, docType, docName),
      ...(docName ? { docName } : {}),
      ...(docType ? { docType } : {}),
      ...(method ? { method } : {}),
      evidenceCount,
    };

    out[field] = item;
    aliases.forEach((alias) => {
      out[alias] = {
        ...item,
        field: alias,
        reason: sourceConfidenceReason(alias, docType, docName),
      };
    });
  };

  add("borrower", ["fullName"]);
  add("loanNumber");
  add("income");
  add("creditScore");
  add("debts", ["dti"]);
  add("loanAmount");
  add("propertyValue", ["ltv"]);
  add("assets");

  return out;
}

function sourceConfidenceKeyFromFactor(factor: ReportFactor): string {
  const label = (factor.label || "").trim().toLowerCase();
  const source = (factor.source || "").trim().toLowerCase();

  if (label === "borrower name" || source === "borrower_profile") return "fullName";
  if (label === "loan number" || source === "loan_number") return "loanNumber";
  if (label === "income" || source === "income") return "income";
  if (label === "credit score" || source === "credit") return "creditScore";
  if (label === "dti" || label === "total dti" || label.includes("debt-to-income") || source === "debts") return "dti";
  if (label === "proposed housing payment") return "loanAmount";
  if (label === "ltv" || source === "loan") return "ltv";
  if (label === "assets" || source === "assets") return "assets";
  return label.replace(/\s+/g, "");
}

function getSourceConfidenceForFactor(factor: ReportFactor, sourceConfidence?: SourceConfidenceMap | null) {
  if (!sourceConfidence) return null;
  const key = sourceConfidenceKeyFromFactor(factor);
  return sourceConfidence[key] || null;
}

function normalizeSeverity(value?: string): "low" | "med" | "high" {
  const v = (value || "").toLowerCase().trim();
  if (v === "high") return "high";
  if (v === "low") return "low";
  return "med";
}

function normalizeSource(value?: string): UWConditionSource {
  const v = (value || "").toLowerCase().trim();
  if (v === "ai") return "ai";
  if (v === "borrower_profile") return "borrower_profile";
  return "manual";
}

function hasMeaningfulValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return Number.isFinite(value) && value > 0;
  return true;
}

function isCleanEmployerAddress(value: unknown): boolean {
  if (typeof value !== "string") return false;

  const clean = value.replace(/\s+/g, " ").trim();
  const lower = clean.toLowerCase();

  if (!clean) return false;
  if (clean.length > 160) return false;
  if (!/\d{1,6}\s+/.test(clean)) return false;

  const hasZipAddress = /[A-Z]{2}\s*\d{5}(?:-\d{4})?/i.test(clean);
  const hasLooseCityState =
    /\b[A-Za-z][A-Za-z.\s]{2,35}\s+(?:AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|IA|ID|IL|IN|KS|KY|LA|MA|MD|ME|MI|MN|MO|MS|MT|NC|ND|NE|NH|NJ|NM|NV|NY|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VA|VT|WA|WI|WV|WY)\b(?:\s*\d{5}(?:-\d{4})?)?\b/i.test(clean);

  if (!hasZipAddress && !hasLooseCityState) return false;

  const garbagePattern =
    /base pay|monthly|overtime|bonus|ytd|salary|income|processor note|checkbox|artifact|verify|probability|conflict|signature|payroll|underwritten|credit report|tradeline|payment history|debt-to-income|dti|ltv|borrower|applicant|subject property|home address|current address|table shifted|\bbal\b|min pay|status ok|status open|charge[-\s]?off|\baccount\b|\bbalance\b|\bpayment\b|\btradeline\b|\bcredit\b/i;

  if (garbagePattern.test(clean)) return false;

  const digitGroups = clean.match(/\d+/g) || [];
  if (digitGroups.length >= 4 && (lower.includes("status") || lower.includes("pay") || lower.includes("bal"))) {
    return false;
  }

  return true;
}

function cleanEmployerAddressValue(value: unknown): string {
  if (typeof value !== "string") return "";
  const clean = value.replace(/\s+/g, " ").trim();
  return isCleanEmployerAddress(clean) ? clean : "";
}

function getNumericFactorValueFromScan(scanValue: ScanResult | null | undefined, keys: string[]): number | null {
  const normalizedKeys = keys.map((key) => key.toLowerCase());
  const factors = scanValue?.ai?.factors || [];

  const factor = factors.find((item) => {
    const key = (item?.key || "").toString().trim().toLowerCase();
    const label = (item?.label || "").toString().trim().toLowerCase();

    return normalizedKeys.includes(key) || normalizedKeys.includes(label);
  });

  const raw = factor?.value;

  if (typeof raw === "number" && Number.isFinite(raw)) return raw;

  if (typeof raw === "string" && raw.trim()) {
    const n = Number(raw.replace(/%/g, "").trim());
    if (Number.isFinite(n)) return n > 1 ? n / 100 : n;
  }

  return null;
}

function getDisplayDtiValue(scanValue: ScanResult | null | undefined, borrowerProfileValue?: BorrowerProfileFlat | null) {
  return (
    getNumericFactorValueFromScan(scanValue, ["total_dti", "total dti"]) ??
    toFiniteNumber((scanValue as any)?.displayDti) ??
    toFiniteNumber((scanValue as any)?.extracted?.dti) ??
    toFiniteNumber((scanValue as any)?.ai?.dti) ??
    toFiniteNumber(borrowerProfileValue?.dti)
  );
}

function getProposedHousingPaymentValue(scanValue: ScanResult | null | undefined): number | null {
  return getNumericFactorValueFromScan(scanValue, ["proposed_housing_payment", "proposed housing payment"]);
}

function formatCurrencyCompact(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";

  return value.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function formatPercentCompact(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(2)}%`;
}


function getHousingPaymentBreakdown(
  scanValue: ScanResult | null | undefined
): HousingPaymentBreakdown | null {
  const breakdown = scanValue?.report?.financials?.housingPaymentBreakdown;

  if (!breakdown || typeof breakdown !== "object") return null;

  return breakdown;
}

function readinessLabelText(value?: string | null): string {
  const clean = (value || "").toString().trim();
  if (!clean) return "Needs Review";

  const map: Record<string, string> = {
    not_ready: "Not Ready",
    high_risk: "High Risk",
    needs_conditions: "Needs Conditions",
    near_ready: "Near Ready",
    clear_to_close: "Clear To Close",
  };

  return map[clean] || toTitleWords(clean);
}

function workflowRiskTone(value?: string | null): "green" | "red" | "amber" | "blue" | "gray" {
  const clean = (value || "").toString().trim().toLowerCase();
  if (clean === "high" || clean === "not_ready" || clean.includes("block")) return "red";
  if (clean === "medium" || clean === "needs_conditions" || clean.includes("condition")) return "amber";
  if (clean === "low" || clean === "near_ready" || clean === "clear_to_close") return "green";
  return "gray";
}

function buildFallbackWorkflowReadiness(summary: ReturnType<typeof canonicalConditionSummary>): WorkflowReadiness {
  const readinessScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(100 - summary.highCount * 28 - summary.medCount * 12 - summary.lowCount * 5)
    )
  );

  return {
    readinessScore,
    readinessLabel:
      summary.highCount > 0
        ? "not_ready"
        : summary.openCount > 0
        ? "needs_conditions"
        : "clear_to_close",
    unresolvedBlockingConditions: summary.highCount,
    unresolvedConditions: summary.openCount,
    borrowerActionCount: 0,
    processorActionCount: summary.medCount + summary.lowCount,
    underwriterActionCount: summary.highCount,
    estimatedCloseability:
      summary.highCount > 0
        ? "low"
        : summary.openCount > 0
        ? "medium"
        : "high",
    topBlockingReasons: summary.high.slice(0, 5).map((condition) => condition.label),
    nextBestActions:
      summary.openCount > 0
        ? summary.open.slice(0, 5).map((condition) => `Clear: ${condition.label}`)
        : ["No open conditions remain. Maintain verified inputs through final approval."],
    workflowRisk:
      summary.highCount > 0
        ? "high"
        : summary.openCount > 0
        ? "medium"
        : "low",
  };
}

function getWorkflowReadiness(
  scanValue: ScanResult | null | undefined,
  summary: ReturnType<typeof canonicalConditionSummary>
): WorkflowReadiness {
  const direct = scanValue?.readiness || (scanValue as any)?.workflowReadiness || null;

  if (direct && typeof direct === "object") {
    return {
      ...buildFallbackWorkflowReadiness(summary),
      ...direct,
    };
  }

  return buildFallbackWorkflowReadiness(summary);
}

function getCanonicalWorkflowConditions(scanValue: ScanResult | null | undefined): CanonicalWorkflowCondition[] {
  const direct = scanValue?.canonicalConditions;
  if (Array.isArray(direct)) return direct;

  const nested = (scanValue as any)?.analysis?.canonicalConditions;
  if (Array.isArray(nested)) return nested;

  return [];
}

function buildDtiBreakdown(scanValue: ScanResult | null | undefined, borrowerProfileValue: BorrowerProfileFlat | null) {
  const annualIncome = toFiniteNumber(borrowerProfileValue?.income) ?? toFiniteNumber((scanValue as any)?.extracted?.income);
  const monthlyIncome = annualIncome ? annualIncome / 12 : null;
  const existingDebts = toFiniteNumber(borrowerProfileValue?.debts) ?? toFiniteNumber((scanValue as any)?.extracted?.debts);
  const proposedHousing = getProposedHousingPaymentValue(scanValue);
  const totalDti = getDisplayDtiValue(scanValue, borrowerProfileValue);
  const totalObligations =
    typeof existingDebts === "number" || typeof proposedHousing === "number"
      ? (existingDebts ?? 0) + (proposedHousing ?? 0)
      : null;

  const maxObligationsAt50 = monthlyIncome ? monthlyIncome * 0.5 : null;
  const maxObligationsAt43 = monthlyIncome ? monthlyIncome * 0.43 : null;
  const reductionTo50 =
    typeof totalObligations === "number" && typeof maxObligationsAt50 === "number"
      ? Math.max(0, totalObligations - maxObligationsAt50)
      : null;
  const reductionTo43 =
    typeof totalObligations === "number" && typeof maxObligationsAt43 === "number"
      ? Math.max(0, totalObligations - maxObligationsAt43)
      : null;

  return {
    annualIncome,
    monthlyIncome,
    existingDebts,
    proposedHousing,
    totalObligations,
    totalDti,
    reductionTo50,
    reductionTo43,
  };
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function isFirebaseFieldValue(value: unknown): boolean {
  return (
    !!value &&
    typeof value === "object" &&
    (
      "_methodName" in (value as Record<string, unknown>) ||
      "isEqual" in (value as Record<string, unknown>)
    )
  );
}

function stripUndefinedForFirestore<T>(value: T): T {
  if (value === undefined) return null as T;

  // Do not recurse into Firestore sentinels like arrayUnion(), deleteField(),
  // or serverTimestamp(). They are special SDK objects and must be passed through.
  if (isFirebaseFieldValue(value)) return value;

  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== undefined)
      .map((item) => stripUndefinedForFirestore(item)) as T;
  }

  if (value && typeof value === "object") {
    const out: Record<string, any> = {};

    for (const [key, childValue] of Object.entries(value as Record<string, any>)) {
      if (childValue === undefined) continue;
      out[key] = stripUndefinedForFirestore(childValue);
    }

    return out as T;
  }

  return value;
}


function normalizeExistingCondition(raw: any): UWCondition | null {
  if (!raw || typeof raw !== "object") return null;
  const label = (raw.label || "").toString().trim();
  if (!label) return null;
  const now = Date.now();
  const status: UWCondition["status"] = raw.status === "done" ? "done" : "open";

  const evidence = raw.evidence ? String(raw.evidence) : "";
  const severity = isHardStopConditionLike({ ...raw, label, evidence })
    ? "high"
    : normalizeSeverity(raw.severity);

  return {
    id: (raw.id || makeId("uw")).toString(),
    label,
    severity,
    status,
    source: normalizeSource(raw.source),
    ...(evidence ? { evidence } : {}),
    createdAtMs: Number.isFinite(raw.createdAtMs) ? Number(raw.createdAtMs) : now,
    updatedAtMs: Number.isFinite(raw.updatedAtMs) ? Number(raw.updatedAtMs) : now,
  };
}

function conditionCanonicalKey(condition: Pick<UWCondition, "label" | "source" | "evidence">) {
  const label = cleanSpaces(condition.label || "").toLowerCase();
  const evidence = cleanSpaces(condition.evidence || "").toLowerCase();
  const combined = `${label} ${evidence}`;

  if (isHardStopConditionLike(condition)) return "hard_stop_credit_policy";

  if (
    combined.includes("dti") ||
    combined.includes("capacity") ||
    combined.includes("debt-to-income") ||
    combined.includes("compensating factor")
  ) {
    return "capacity_dti";
  }

  if (
    combined.includes("ltv") ||
    combined.includes("collateral") ||
    combined.includes("mi") ||
    combined.includes("mortgage insurance") ||
    combined.includes("product eligibility")
  ) {
    return "collateral_ltv";
  }

  if (
    combined.includes("credit score 620") ||
    combined.includes("moderate credit tier") ||
    combined.includes("credit tier") ||
    combined.includes("pricing tier") ||
    combined.includes("investor overlay") ||
    combined.includes("credit review")
  ) {
    return "credit_tier";
  }

  if (
    combined.includes("income review") ||
    combined.includes("income documentation") ||
    combined.includes("qualifying income") ||
    combined.includes("paystub") ||
    combined.includes("w-2") ||
    combined.includes("voe")
  ) {
    return "income_documentation";
  }

  if (
    combined.includes("housing payment") ||
    combined.includes("piti") ||
    combined.includes("taxes") ||
    combined.includes("insurance") ||
    combined.includes("rate")
  ) {
    return "housing_payment";
  }

  if (
    combined.includes("borrower full legal name") ||
    combined.includes("date of birth") ||
    combined.includes("ssn") ||
    combined.includes("identity") ||
    combined.includes("primary address")
  ) {
    return `identity_${label.replace(/[^a-z0-9]+/g, "_").slice(0, 50)}`;
  }

  return label.replace(/[^a-z0-9]+/g, "_").slice(0, 100);
}

function conditionMergeRank(condition: UWCondition) {
  let score = 0;

  if (condition.source === "manual") score += 300;
  if (condition.source === "ai") score += 200;
  if (condition.source === "borrower_profile") score += 100;

  if (condition.severity === "high") score += 30;
  if (condition.severity === "med") score += 20;
  if (condition.severity === "low") score += 10;

  if (isHardStopConditionLike(condition)) score += 1000;

  const label = cleanSpaces(condition.label).toLowerCase();
  if (label.includes("moderate credit tier")) score += 20;
  if (label.includes("credit score 620-679")) score -= 10;
  if (label.includes("dti exceeds threshold")) score += 20;
  if (label.includes("high ltv exposure")) score += 20;

  return score;
}

function mergeConditionRecords(existing: UWCondition, incoming: UWCondition): UWCondition {
  const winner = conditionMergeRank(incoming) > conditionMergeRank(existing) ? incoming : existing;
  const loser = winner === incoming ? existing : incoming;
  const hardStop = isHardStopConditionLike(winner) || isHardStopConditionLike(loser);

  return {
    ...winner,
    label: hardStop ? "Credit Policy Hard Stop" : winner.label,
    severity: hardStop ? "high" : winner.severity,
    status: hardStop ? "open" : winner.status,
    evidence:
      cleanSpaces(winner.evidence || "") ||
      cleanSpaces(loser.evidence || "") ||
      undefined,
    createdAtMs: Math.min(winner.createdAtMs || Date.now(), loser.createdAtMs || Date.now()),
    updatedAtMs: Math.max(winner.updatedAtMs || Date.now(), loser.updatedAtMs || Date.now()),
  };
}


function mergeCanonicalConditions(groups: UWCondition[][]): UWCondition[] {
  const byKey = new Map<string, UWCondition>();

  for (const group of groups) {
    for (const raw of group) {
      const normalized = normalizeExistingCondition(raw);
      if (!normalized) continue;

      const key = conditionCanonicalKey(normalized);
      const existing = byKey.get(key);

      if (!existing) {
        byKey.set(key, normalized);
        continue;
      }

      byKey.set(key, mergeConditionRecords(existing, normalized));
    }
  }

  const sevRank: Record<UWCondition["severity"], number> = {
    high: 0,
    med: 1,
    low: 2,
  };

  const categoryRank = (condition: UWCondition) => {
    const key = conditionCanonicalKey(condition);

    if (key === "hard_stop_credit_policy") return 0;
    if (key === "capacity_dti") return 1;
    if (key === "collateral_ltv") return 2;
    if (key === "credit_tier") return 3;
    if (key === "income_documentation") return 4;
    if (key === "housing_payment") return 5;
    if (key.startsWith("identity_")) return 6;

    return 99;
  };

  const merged = Array.from(byKey.values()).map((condition) =>
    isHardStopConditionLike(condition)
      ? {
          ...condition,
          label: "Credit Policy Hard Stop",
          severity: "high" as const,
          status: "open" as const,
        }
      : condition
  );

  merged.sort((a, b) => {
    if (a.status !== b.status) return a.status === "open" ? -1 : 1;

    const categoryA = categoryRank(a);
    const categoryB = categoryRank(b);
    if (categoryA !== categoryB) return categoryA - categoryB;

    if (sevRank[a.severity] !== sevRank[b.severity]) {
      return sevRank[a.severity] - sevRank[b.severity];
    }

    return a.label.localeCompare(b.label);
  });

  return merged;
}

function buildAiConditions(labels: string[] = [], existing: UWCondition[] = []): UWCondition[] {
  const existingByLabel = new Map<string, UWCondition>();

  for (const raw of existing) {
    const normalized = normalizeExistingCondition(raw);
    if (!normalized || normalized.source !== "ai") continue;
    existingByLabel.set(normalized.label.trim().toLowerCase(), normalized);
  }

  const now = Date.now();

  return labels
    .map((labelRaw) => labelRaw?.toString().trim())
    .filter((label): label is string => !!label)
    .map((label) => {
      const existingMatch = existingByLabel.get(label.toLowerCase());
      return {
        id: existingMatch?.id || makeId("ai"),
        label,
        severity: isHardStopConditionLike({ label, evidence: existingMatch?.evidence || "" })
          ? "high"
          : existingMatch?.severity || "med",
        status: existingMatch?.status || "open",
        source: "ai" as const,
        ...(existingMatch?.evidence ? { evidence: existingMatch.evidence } : {}),
        createdAtMs: existingMatch?.createdAtMs || now,
        updatedAtMs: now,
      };
    });
}

function buildManualCondition(input: {
  label: string;
  severity: "low" | "med" | "high";
  evidence?: string;
}): UWCondition {
  const now = Date.now();
  return {
    id: makeId("manual"),
    label: input.label.trim(),
    severity: isHardStopConditionLike({ label: input.label, evidence: input.evidence || "" })
      ? "high"
      : input.severity,
    status: "open",
    source: "manual",
    ...(input.evidence?.trim() ? { evidence: input.evidence.trim() } : {}),
    createdAtMs: now,
    updatedAtMs: now,
  };
}

function splitConditionsBySource(existing: UWCondition[] = []) {
  const normalized = existing.map(normalizeExistingCondition).filter(Boolean) as UWCondition[];
  return {
    ai: normalized.filter((c) => c.source === "ai"),
    borrowerProfile: normalized.filter((c) => c.source === "borrower_profile"),
    manual: normalized.filter((c) => c.source === "manual"),
  };
}

function canonicalConditionSummary(conditions: UWCondition[]) {
  const normalized = lockHardStopConditionArray(
    conditions.map(normalizeExistingCondition).filter(Boolean) as UWCondition[]
  ) as UWCondition[];
  const open = normalized.filter((c) => c.status === "open");
  const done = normalized.filter((c) => c.status === "done");
  const high = open.filter((c) => c.severity === "high");
  const med = open.filter((c) => c.severity === "med");
  const low = open.filter((c) => c.severity === "low");

  return {
    all: normalized,
    open,
    done,
    high,
    med,
    low,
    openCount: open.length,
    doneCount: done.length,
    highCount: high.length,
    medCount: med.length,
    lowCount: low.length,
  };
}

function canonicalConditionStatusLabel(summary: ReturnType<typeof canonicalConditionSummary>) {
  if (summary.highCount > 0) return "Blocked";
  if (summary.openCount > 0) return "Approve With Conditions";
  return "Clear To Approve";
}

function canonicalConditionStatusTone(summary: ReturnType<typeof canonicalConditionSummary>) {
  if (summary.highCount > 0) return "red" as const;
  if (summary.openCount > 0) return "amber" as const;
  return "green" as const;
}

function ToneChip({
  label,
  tone,
}: {
  label: string;
  tone: "green" | "red" | "amber" | "blue" | "gray";
}) {
  const map: Record<string, { bg: string; border: string; text: string }> = {
    green: { bg: "bg-green-50", border: "border-green-200", text: "text-green-800" },
    red: { bg: "bg-red-50", border: "border-red-200", text: "text-red-700" },
    amber: { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-800" },
    blue: { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-800" },
    gray: { bg: "bg-gray-100", border: "border-gray-200", text: "text-gray-700" },
  };

  const c = map[tone] ?? map.gray;

  return (
    <span className={`inline-flex items-center px-2 py-1 rounded-md border text-xs ${c.bg} ${c.border} ${c.text}`}>
      {label}
    </span>
  );
}

function StatusChip({ status }: { status: string }) {
  return <ToneChip label={status || "-"} tone={statusTone(status)} />;
}

function PriorityChip({ p }: { p: "low" | "med" | "high" }) {
  const tone = p === "high" ? "red" : p === "med" ? "amber" : "gray";
  const label = p === "high" ? "High" : p === "med" ? "Med" : "Low";
  return <ToneChip label={label} tone={tone} />;
}

function getBPValue(bp: BorrowerProfileFS | null | undefined, key: keyof BorrowerProfileFlat) {
  const node = (bp?.[String(key)] as BorrowerProfileField | undefined) || undefined;
  return node?.value;
}

function normalizeBorrowerProfile(bp: BorrowerProfileFS | null | undefined): BorrowerProfileFlat {
  const fullName = (getBPValue(bp, "fullName") ?? "").toString().trim();
  const email = (getBPValue(bp, "email") ?? "").toString().trim();
  const dob = (getBPValue(bp, "dob") ?? "").toString().trim();
  const ssnRaw = (getBPValue(bp, "ssnLast4") ?? "").toString().trim();
  const ssnLast4 = ssnRaw ? ssnRaw.slice(-4) : "";
  const loanNumber = (getBPValue(bp, "loanNumber") ?? "").toString().trim();
  const incomeRaw = getBPValue(bp, "income");
  const creditRaw = getBPValue(bp, "creditScore");
  const loanRaw = getBPValue(bp, "loanAmount");
  const propertyValueRaw = getBPValue(bp, "propertyValue");
  const debtsRaw = getBPValue(bp, "debts");
  const dtiRaw = getBPValue(bp, "dti");
  const ltvRaw = getBPValue(bp, "ltv");
  const income = typeof incomeRaw === "number" ? incomeRaw : incomeRaw ? Number(incomeRaw) : null;
  const creditScore = typeof creditRaw === "number" ? creditRaw : creditRaw ? Number(creditRaw) : null;
  const loanAmount = typeof loanRaw === "number" ? loanRaw : loanRaw ? Number(loanRaw) : null;
  const propertyValue =
    typeof propertyValueRaw === "number"
      ? propertyValueRaw
      : propertyValueRaw
      ? Number(propertyValueRaw)
      : null;
  const debts = typeof debtsRaw === "number" ? debtsRaw : debtsRaw ? Number(debtsRaw) : null;
  const dti = typeof dtiRaw === "number" ? dtiRaw : dtiRaw ? Number(dtiRaw) : null;
  const ltv = typeof ltvRaw === "number" ? ltvRaw : ltvRaw ? Number(ltvRaw) : null;
  const address = (getBPValue(bp, "address") ?? "").toString().trim();
  const employerAddress = cleanEmployerAddressValue(getBPValue(bp, "employerAddress"));

  return {
    fullName,
    email,
    dob,
    ssnLast4,
    loanNumber,
    income: Number.isFinite(income as any) ? income : null,
    creditScore: Number.isFinite(creditScore as any) ? creditScore : null,
    address,
    employerAddress,
    loanAmount: Number.isFinite(loanAmount as any) ? loanAmount : null,
    propertyValue: Number.isFinite(propertyValue as any) ? propertyValue : null,
    debts: Number.isFinite(debts as any) ? debts : null,
    dti: Number.isFinite(dti as any) ? dti : null,
    ltv: Number.isFinite(ltv as any) ? ltv : null,
  };
}

function buildBorrowerProfileFromCanonical(source: {
  borrower?: string;
  fullName?: string;
  email?: string;
  dob?: string;
  ssnLast4?: string;
  loanNumber?: string;
  income?: number | string | null;
  creditScore?: number | string | null;
  address?: string;
  employerAddress?: string;
  loanAmount?: number | string | null;
  propertyValue?: number | string | null;
  debts?: number | string | null;
  dti?: number | string | null;
  ltv?: number | string | null;
}) {
  const now = Date.now();

  const makeField = (value: any, src = "scan"): BorrowerProfileField | undefined => {
    if (!hasMeaningfulValue(value)) return undefined;
    return {
      value,
      status: "derived",
      source: src,
      updatedAtMs: now,
    };
  };

  const fullName = (source.fullName || source.borrower || "").toString().trim();
  const email = (source.email || "").toString().trim();
  const dob = (source.dob || "").toString().trim();
  const ssnLast4 = (source.ssnLast4 || "").toString().trim();
  const loanNumber = (source.loanNumber || "").toString().trim();
  const address = (source.address || "").toString().trim();
  const employerAddress = cleanEmployerAddressValue(source.employerAddress || "");
  const income = toFiniteNumber(source.income);
  const creditScore = toFiniteNumber(source.creditScore);
  const loanAmount = toFiniteNumber(source.loanAmount);
  const propertyValue = toFiniteNumber(source.propertyValue);
  const debts = toFiniteNumber(source.debts);
  const dti = toFiniteNumber(source.dti);
  const ltv = toFiniteNumber(source.ltv);

  return {
    ...(makeField(fullName) ? { fullName: makeField(fullName) } : {}),
    ...(makeField(email) ? { email: makeField(email) } : {}),
    ...(makeField(dob) ? { dob: makeField(dob) } : {}),
    ...(makeField(ssnLast4) ? { ssnLast4: makeField(ssnLast4) } : {}),
    ...(makeField(loanNumber) ? { loanNumber: makeField(loanNumber) } : {}),
    ...(makeField(address) ? { address: makeField(address) } : {}),
    ...(makeField(employerAddress) ? { employerAddress: makeField(employerAddress) } : {}),
    ...(makeField(income) ? { income: makeField(income) } : {}),
    ...(makeField(creditScore) ? { creditScore: makeField(creditScore) } : {}),
    ...(makeField(loanAmount) ? { loanAmount: makeField(loanAmount) } : {}),
    ...(makeField(propertyValue) ? { propertyValue: makeField(propertyValue) } : {}),
    ...(makeField(debts) ? { debts: makeField(debts) } : {}),
    ...(makeField(dti) ? { dti: makeField(dti) } : {}),
    ...(makeField(ltv) ? { ltv: makeField(ltv) } : {}),
  } as BorrowerProfileFS;
}

function buildConditionsFromBorrowerProfile(
  profile: BorrowerProfileFlat | null,
  verified: Record<string, boolean>
): UWCondition[] {
  const now = Date.now();
  const out: UWCondition[] = [];
  const p = profile || {};
  const v = verified || {};

  const isSatisfied = (field: keyof BorrowerProfileFlat) => {
    return hasMeaningfulValue(p[field]) || v[String(field)];
  };

  const add = (label: string, severity: "low" | "med" | "high", evidence?: string) => {
    out.push({
      id: makeId("uw"),
      label,
      severity,
      status: "open",
      source: "borrower_profile",
      ...(evidence ? { evidence } : {}),
      createdAtMs: now,
      updatedAtMs: now,
    });
  };

  if (!isSatisfied("fullName")) {
    add("Verify borrower full legal name", "high", "Field is missing or still unverified.");
  }
  if (!isSatisfied("dob")) {
    add("Verify borrower date of birth", "high", "Field is missing or still unverified.");
  }
  if (!isSatisfied("ssnLast4")) {
    add("Collect SSN (last 4) / verify identity", "high", "Field is missing or still unverified.");
  }
  if (!isSatisfied("address")) {
    add("Verify current primary address", "med", "Field is missing or still unverified.");
  }
  if (!isSatisfied("income")) {
    add("Verify annual income documentation (paystubs/W-2)", "high", "Field is missing or still unverified.");
  }
  if (!isSatisfied("loanAmount")) {
    add("Confirm requested loan amount", "med", "Field is missing or still unverified.");
  }
  if (!isSatisfied("employerAddress")) {
    add("Verify employer / employer address", "low", "Employer address not present in source docs or not yet verified.");
  }

  if (typeof p.creditScore === "number" && Number.isFinite(p.creditScore)) {
    if (p.creditScore < 620) {
      add("Credit score below 620 - review eligibility / pricing", "high", `Credit score = ${p.creditScore}.`);
    } else if (p.creditScore < 680) {
      add("Credit score 620-679 - watch overlays / pricing", "med", `Credit score = ${p.creditScore}.`);
    }
  } else if (!v["creditScore"]) {
    add("Pull / confirm credit score", "med", "Field is missing or still unverified.");
  }

  const sevRank: Record<UWCondition["severity"], number> = { high: 0, med: 1, low: 2 };

  out.sort((a, b) => {
    return sevRank[a.severity] - sevRank[b.severity] || a.label.localeCompare(b.label);
  });

  const seen = new Set<string>();
  return out.filter((c) => {
    const key = c.label.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function verificationFieldFromLabel(label: string): keyof BorrowerProfileFlat | null {
  const normalized = (label || "").trim().toLowerCase();
  const map: Record<string, keyof BorrowerProfileFlat> = {
    "verify borrower full legal name": "fullName",
    "verify borrower date of birth": "dob",
    "collect ssn (last 4) / verify identity": "ssnLast4",
    "verify current primary address": "address",
    "verify annual income documentation (paystubs/w-2)": "income",
    "pull / confirm credit score": "creditScore",
    "verify employer / employer address": "employerAddress",
    "confirm requested loan amount": "loanAmount",
    "mark full name as verified": "fullName",
    "mark dob as verified": "dob",
    "mark ssn (last 4) as verified": "ssnLast4",
    "mark address as verified": "address",
    "mark income as verified": "income",
    "mark credit score as verified": "creditScore",
    "mark employer address as verified": "employerAddress",
    "mark loan amount as verified": "loanAmount",
    "mark debts as verified": "debts",
    "mark dti as verified": "dti",
  };
  return map[normalized] ?? null;
}

function maskSsnLast4(value?: string) {
  const v = (value || "").trim();
  if (!v) return "";
  return `***-**-${v.slice(-4)}`;
}

type ApprovalPathItem = {
  title: string;
  status: "critical" | "review" | "improve" | "met";
  body: string;
  action: string;
};


function getDtiActionEngineSummary(scanValue: ScanResult | null | undefined): string {
  const scanFactors = Array.isArray(scanValue?.ai?.factors) ? scanValue?.ai?.factors || [] : [];
  const reportFactors = Array.isArray(scanValue?.report?.factors) ? scanValue?.report?.factors || [] : [];
  const allFactors = [...scanFactors, ...reportFactors];

  const factor = allFactors.find((item: any) => {
    const key = (item?.key || "").toString().trim().toLowerCase();
    const label = (item?.label || "").toString().trim().toLowerCase();

    return key === "dti_action_engine" || label === "dti action engine";
  });

  return (factor?.summary || "").toString().trim();
}

function getDtiActionEngineExecutiveSummary(scanValue: ScanResult | null | undefined): string {
  const summary = getDtiActionEngineSummary(scanValue);
  return summary.replace(/\s*Per-debt strategy:\s*.*$/i, "").trim();
}

function getDtiPerDebtStrategyRows(scanValue: ScanResult | null | undefined): Array<{
  step: string;
  name: string;
  amount: string;
  treatment: string;
  improvement: string;
  source: string;
  confidence: string;
  rationale: string;
}> {
  const summary = getDtiActionEngineSummary(scanValue);
  const segment = summary.match(/Per-debt strategy:\s*(.*?)(?:\.$|$)/i)?.[1] || "";
  if (!segment.trim()) return [];

  return segment
    .split("|")
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((raw) => {
      const match = raw.match(/^(\d+)\)\s*(.*?)\s*—\s*(\$[\d,]+\/mo)\s*—\s*(.*?)\s*—\s*realistic improvement approx\s*(\$[\d,]+\/mo)\s*—\s*source:(.*?)\s*—\s*confidence:(.*?)\s*—\s*rationale:(.*)$/i);

      if (!match) {
        return {
          step: "",
          name: raw,
          amount: "",
          treatment: "Review",
          improvement: "",
          source: "",
          confidence: "",
          rationale: "",
        };
      }

      return {
        step: match[1] || "",
        name: match[2] || "",
        amount: match[3] || "",
        treatment: match[4] || "",
        improvement: match[5] || "",
        source: match[6] || "",
        confidence: match[7] || "",
        rationale: match[8] || "",
      };
    });
}

function approvalPathToneClass(status: ApprovalPathItem["status"]) {
  if (status === "critical") return "border-rose-200 bg-rose-50 text-rose-900";
  if (status === "review") return "border-amber-200 bg-amber-50 text-amber-900";
  if (status === "improve") return "border-sky-200 bg-sky-50 text-sky-900";
  return "border-emerald-200 bg-emerald-50 text-emerald-900";
}

function approvalPathPillClass(status: ApprovalPathItem["status"]) {
  if (status === "critical") return "border-rose-200 bg-white text-rose-700";
  if (status === "review") return "border-amber-200 bg-white text-amber-700";
  if (status === "improve") return "border-sky-200 bg-white text-sky-700";
  return "border-emerald-200 bg-white text-emerald-700";
}

function buildApprovalPath(
  scanValue: ScanResult | null | undefined,
  borrowerProfileValue: BorrowerProfileFlat | null,
  dtiBreakdownValue: ReturnType<typeof buildDtiBreakdown>
): ApprovalPathItem[] {
  const items: ApprovalPathItem[] = [];
  const credit = toFiniteNumber(borrowerProfileValue?.creditScore);
  const ltv = toFiniteNumber(borrowerProfileValue?.ltv) ?? toFiniteNumber(scanValue?.ai?.ltv);
  const loanAmount = toFiniteNumber(borrowerProfileValue?.loanAmount) ?? toFiniteNumber((scanValue as any)?.extracted?.loanAmount);
  const propertyValue =
    toFiniteNumber(borrowerProfileValue?.propertyValue) ??
    toFiniteNumber((scanValue as any)?.extracted?.propertyValue);
  const income = toFiniteNumber(borrowerProfileValue?.income);
  const totalDti = dtiBreakdownValue.totalDti;
  const dtiActionEngineSummary = getDtiActionEngineExecutiveSummary(scanValue);

  if (typeof totalDti === "number" && totalDti > 0.5) {
    items.push({
      title: "Reduce total DTI pressure",
      status: "critical",
      body: dtiActionEngineSummary
        ? `Total DTI is ${formatPercentCompact(totalDti)}. ${dtiActionEngineSummary}`
        : `Total DTI is ${formatPercentCompact(totalDti)}. Approximate monthly reduction needed is ${formatCurrencyCompact(
            dtiBreakdownValue.reductionTo50
          )} to reach 50% DTI${
            typeof dtiBreakdownValue.reductionTo43 === "number" && dtiBreakdownValue.reductionTo43 > 0
              ? ` or ${formatCurrencyCompact(dtiBreakdownValue.reductionTo43)} to reach 43% DTI.`
              : "."
          }`,
      action: dtiActionEngineSummary
        ? "Follow the DTI Action Engine path first, then re-run the scan after documentation, payoff, or exclusion support is uploaded."
        : "Rework debts, pay down obligations, add qualifying income, reduce loan amount, or improve housing-payment structure.",
    });
  } else if (typeof totalDti === "number" && totalDti > 0.43) {
    items.push({
      title: "Strengthen DTI before final approval",
      status: "review",
      body: `Total DTI is ${formatPercentCompact(totalDti)}, above the 43% review zone but not an automatic hard stop.`,
      action: "Document compensating factors, confirm housing payment, and review overlays.",
    });
  } else if (typeof totalDti === "number") {
    items.push({
      title: "DTI is supportable",
      status: "met",
      body: `Total DTI is ${formatPercentCompact(totalDti)}, which is within a stronger approval range.`,
      action: "Keep liabilities and housing payment verified through final underwriting.",
    });
  }

  if (typeof credit === "number" && credit < 620) {
    items.push({
      title: "Raise representative credit score above 620",
      status: "critical",
      body: `Representative credit score is ${credit}, below the common 620 review threshold.`,
      action: "Review rapid-rescore options, correct tradeline errors, resolve derogatory items, or consider alternate product eligibility.",
    });
  } else if (typeof credit === "number" && credit < 660) {
    items.push({
      title: "Improve credit tier / overlays",
      status: "review",
      body: `Representative credit score is ${credit}. This may be financeable, but pricing and overlays remain sensitive.`,
      action: "Document compensating factors and review whether a higher score tier would reduce pricing/overlay risk.",
    });
  } else if (typeof credit === "number") {
    items.push({
      title: "Credit score is supportable",
      status: "met",
      body: `Representative credit score is ${credit}.`,
      action: "Keep credit report current and monitor for new liabilities before closing.",
    });
  }

  if (typeof ltv === "number" && ltv > 0.95) {
    items.push({
      title: "Lower LTV below high-risk threshold",
      status: "critical",
      body: `LTV is ${formatPercentCompact(ltv)}, above 95%.`,
      action: "Increase down payment, reduce loan amount, verify value, or choose a product that supports the high-LTV profile.",
    });
  } else if (typeof ltv === "number" && ltv >= 0.9) {
    const targetLoanAt90 =
      typeof propertyValue === "number" && propertyValue > 0 ? propertyValue * 0.9 : null;
    const reductionTo90 =
      typeof loanAmount === "number" && typeof targetLoanAt90 === "number"
        ? Math.max(0, loanAmount - targetLoanAt90)
        : null;

    items.push({
      title: "Reduce LTV / confirm MI eligibility",
      status: "review",
      body:
        `LTV is ${formatPercentCompact(ltv)}, which is elevated. ` +
        (typeof reductionTo90 === "number" && reductionTo90 > 0
          ? `Approximate loan reduction/down-payment increase to reach 90% LTV is ${formatCurrencyCompact(reductionTo90)}.`
          : "Review product overlays and mortgage insurance requirements."),
      action: "Confirm MI, eligibility overlays, down payment, and final collateral value.",
    });
  } else if (typeof ltv === "number") {
    items.push({
      title: "LTV is supportable",
      status: "met",
      body: `LTV is ${formatPercentCompact(ltv)}.`,
      action: "Keep appraisal/value support and loan amount aligned through final approval.",
    });
  }

  if (typeof income === "number" && income > 0) {
    items.push({
      title: "Lock income documentation",
      status: "review",
      body: `Income is currently normalized at ${formatCurrencyCompact(income)} annually, but W-2 recency and source consistency should be reviewed.`,
      action: "Confirm current paystub/YTD, VOE support, W-2 history, and resolve any conflicting income values before final clearance.",
    });
  } else {
    items.push({
      title: "Normalize qualifying income",
      status: "critical",
      body: "Qualifying income is missing or not reliable enough for approval-path analysis.",
      action: "Collect current paystub, W-2 history, VOE, and calculate usable qualifying income.",
    });
  }

  return items;
}

function cleanSpaces(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\s+/g, " ").trim();
}


function isHardStopConditionLike(condition: any) {
  const label = cleanSpaces(condition?.label || condition?.title || condition?.name || "");
  const evidence = cleanSpaces(condition?.evidence || condition?.note || condition?.description || "");
  const source = cleanSpaces(condition?.source || "");

  const combined = `${label} ${evidence} ${source}`.toLowerCase();

  return (
    combined.includes("hard stop") ||
    combined.includes("hard-stop") ||
    combined.includes("credit policy hard stop") ||
    combined.includes("enterprise denial guardrail") ||
    combined.includes("denial guardrail")
  );
}

function lockHardStopConditionSeverity<T extends any>(condition: T): T {
  if (!condition || typeof condition !== "object") return condition;

  if (!isHardStopConditionLike(condition)) return condition;

  const conditionRecord = condition as Record<string, any>;

  return {
    ...conditionRecord,
    severity: "high",
    status: conditionRecord.status || "open",
  } as T;
}

function lockHardStopConditionArray<T extends any>(conditions: T[] | undefined | null): T[] {
  if (!Array.isArray(conditions)) return [];
  return conditions.map((condition) => lockHardStopConditionSeverity(condition));
}


function enterpriseDecisionLanguage(decision: string, reason?: string) {
  const lowerDecision = cleanSpaces(decision).toLowerCase();
  const lowerReason = cleanSpaces(reason || "").toLowerCase();

  if (
    lowerDecision.includes("blocked") ||
    lowerDecision.includes("deny") ||
    lowerReason.includes("denial guardrail") ||
    lowerReason.includes("hard-stop")
  ) {
    return {
      title: "Loan Ineligible Under Current Credit Policy",
      result: "Hard Stop",
      summary:
        "This file cannot proceed as-is. Approval would require materially improved risk factors, updated documentation, or an approved policy exception.",
    };
  }

  if (lowerDecision.includes("condition")) {
    return {
      title: "Conditionally Approvable",
      result: "Conditional",
      summary:
        "File may proceed only after open conditions are cleared and risk support is documented.",
    };
  }

  return {
    title: "Eligible to Proceed",
    result: "Proceed",
    summary:
      "File appears supportable pending normal verification and final quality control.",
  };
}


function buildUnderwritingSnapshot(
  scanValue: ScanResult | null | undefined,
  borrowerProfileValue: BorrowerProfileFlat | null,
  dtiBreakdownValue: ReturnType<typeof buildDtiBreakdown>
) {
  const decisionRaw =
    (scanValue?.ai?.verdict || scanValue?.report?.summary?.decision || "").toString();
  const decision = prettyVerdict(decisionRaw || "Review Required");

  const totalDti = dtiBreakdownValue.totalDti;
  const ltv = toFiniteNumber(borrowerProfileValue?.ltv) ?? toFiniteNumber(scanValue?.ai?.ltv);
  const credit = toFiniteNumber(borrowerProfileValue?.creditScore);
  const income = toFiniteNumber(borrowerProfileValue?.income);

  const drivers: string[] = [];

  if (typeof totalDti === "number" && totalDti > 0.5) {
    drivers.push(`High DTI (${formatPercentCompact(totalDti)})`);
  } else if (typeof totalDti === "number" && totalDti > 0.43) {
    drivers.push(`Elevated DTI (${formatPercentCompact(totalDti)})`);
  }

  if (typeof ltv === "number" && ltv >= 0.95) {
    drivers.push(`High LTV (${formatPercentCompact(ltv)})`);
  } else if (typeof ltv === "number" && ltv >= 0.9) {
    drivers.push(`Elevated LTV (${formatPercentCompact(ltv)})`);
  }

  if (typeof credit === "number" && credit < 620) {
    drivers.push(`Credit below 620 (${credit})`);
  } else if (typeof credit === "number" && credit < 680) {
    drivers.push(`Moderate credit (${credit})`);
  }

  if (!income) {
    drivers.push("Income not fully normalized");
  }

  const lowerDecision = decisionRaw.toLowerCase();
  const path =
    lowerDecision.includes("blocked") || lowerDecision.includes("denied")
      ? "Loan cannot proceed until risk factors are materially improved or a policy exception is approved."
      : lowerDecision.includes("condition")
      ? "Clear conditions, verify PITI/MI, and document compensating factors."
      : "Maintain verified inputs through final underwriting.";

  const tone =
    lowerDecision.includes("denied") || lowerDecision.includes("blocked")
      ? "red"
      : lowerDecision.includes("condition")
      ? "amber"
      : "green";

  return {
    decision,
    drivers: drivers.length ? drivers : ["No major risk drivers detected"],
    path,
    tone,
  };
}

function snapshotToneClass(tone: string) {
  if (tone === "red") return "border-rose-200 bg-rose-50 text-rose-900";
  if (tone === "amber") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-emerald-200 bg-emerald-50 text-emerald-900";
}

function snapshotPillClass(tone: string) {
  if (tone === "red") return "border-rose-200 bg-white text-rose-700";
  if (tone === "amber") return "border-amber-200 bg-white text-amber-700";
  return "border-emerald-200 bg-white text-emerald-700";
}

function getBorrowerFieldPresentation(
  key: keyof BorrowerProfileFlat,
  value: unknown,
  verifiedMap: Record<string, boolean>
) {
  const isVerified = !!verifiedMap[String(key)];
  const hasValue = hasMeaningfulValue(value);
  let displayValue = "-";

  if (key === "income" || key === "loanAmount" || key === "debts") {
    displayValue = hasValue ? formatMoney(Number(value)) : "Missing";
  } else if (key === "dti") {
    displayValue = hasValue ? formatPercent(Number(value)) : "Missing";
  } else if (key === "ssnLast4") {
    displayValue = hasValue ? maskSsnLast4(String(value)) : "Missing";
  } else if (key === "employerAddress") {
    displayValue = hasValue ? String(value) : "Not provided in source docs";
  } else {
    displayValue = hasValue ? String(value) : "Missing";
  }

  if (isVerified) {
    return {
      displayValue,
      chipLabel: "Verified",
      chipTone: "green" as const,
      helper: "Human-reviewed and verified.",
    };
  }

  if (!hasValue) {
    if (key === "email") {
      return {
        displayValue,
        chipLabel: "Optional / Missing",
        chipTone: "gray" as const,
        helper: "Email was not found in source docs. This is not a core underwriting blocker.",
      };
    }

    return {
      displayValue,
      chipLabel: "Missing",
      chipTone: "red" as const,
      helper: "No usable value was found in source docs.",
    };
  }

  if (key === "creditScore") {
    return {
      displayValue,
      chipLabel: "Verified / High",
      chipTone: "green" as const,
      helper: "Credit score was found from credit-report evidence. Middle-score logic should be reviewed separately when tri-merge scores are available.",
    };
  }

  if (key === "debts") {
    return {
      displayValue,
      chipLabel: "Verified / High",
      chipTone: "green" as const,
      helper: "Monthly debts are sourced from credit-report liability data when available, with non-credit sources treated as fallback only.",
    };
  }

  if (key === "dti") {
    return {
      displayValue,
      chipLabel: "Derived / Review",
      chipTone: "amber" as const,
      helper: "Total DTI is derived from income, monthly liabilities, and proposed housing payment. Review the Summary breakdown for the full math.",
    };
  }

  if (key === "loanAmount" || key === "propertyValue" || key === "ltv") {
    return {
      displayValue,
      chipLabel: "Verified / High",
      chipTone: "green" as const,
      helper: "Loan and property values were selected from loan/application source data. Review purchase/appraisal evidence before final approval.",
    };
  }

  if (key === "dob") {
    return {
      displayValue,
      chipLabel: "High Confidence",
      chipTone: "green" as const,
      helper: "DOB was found in source documents and is suitable for high-confidence review.",
    };
  }

  if (key === "ssnLast4") {
    return {
      displayValue,
      chipLabel: "Needs Human Verify",
      chipTone: "amber" as const,
      helper: "SSN last-four exists in the file but should remain human-verified before final clearance.",
    };
  }

  if (key === "income") {
    return {
      displayValue,
      chipLabel: "Medium / Review",
      chipTone: "amber" as const,
      helper: "Income exists, but source recency and VOE/paystub/W-2 alignment should be reviewed before final clearance.",
    };
  }

  if (key === "employerAddress") {
    return {
      displayValue,
      chipLabel: "Medium / Review",
      chipTone: "amber" as const,
      helper: "Employer address was found and normalized from employer-context source evidence. Human review is still recommended.",
    };
  }

  if (key === "address" || key === "fullName") {
    return {
      displayValue,
      chipLabel: "High Confidence",
      chipTone: "green" as const,
      helper: "Value was found from strong identity/application source evidence.",
    };
  }

  return {
    displayValue,
    chipLabel: "Present / Review",
    chipTone: "amber" as const,
    helper: "Value exists in the file and should be reviewed before final clearance.",
  };
}
function buildBlockingReasons(args: {
  aiRecommendationRaw: string;
  aiReason?: string;
  openHighConditions: UWCondition[];
  openConditions: UWCondition[];
}) {
  const reasons: BlockingReason[] = [];
  const seen = new Set<string>();

  const pushReason = (reason: BlockingReason) => {
    const key = isHardStopConditionLike(reason)
      ? "hard_stop_credit_policy"
      : `${reason.label.toLowerCase()}__${reason.source}`;
    if (seen.has(key)) return;
    seen.add(key);
    reasons.push(reason);
  };

  const aiHardStop =
    args.aiRecommendationRaw === "blocked" ||
    args.aiRecommendationRaw === "denied" ||
    args.aiRecommendationRaw === "deny";

  const hardStopCondition = args.openHighConditions.find((condition) =>
    isHardStopConditionLike(condition)
  );

  if (aiHardStop || hardStopCondition) {
    pushReason({
      label: "Credit Policy Hard Stop",
      source: "AI Decision",
      severity: "high",
      evidence:
        args.aiReason ||
        hardStopCondition?.evidence ||
        "AI decision returned a hard-stop recommendation.",
    });
  }

  for (const condition of args.openHighConditions) {
    if (isHardStopConditionLike(condition)) continue;

    pushReason({
      label: condition.label,
      source: sourceLabel(condition.source),
      severity: condition.severity,
      evidence: condition.evidence || "Open high-severity condition.",
    });
  }

  return reasons;
}


export default function ApplicationDetailPage() {
  const params = useParams();
  const id = String((params as any)?.id || "");
  const { toast } = useToast();

  const [app, setApp] = useState<AppDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [underwriters, setUnderwriters] = useState<Underwriter[]>([]);
  const [statusDraft, setStatusDraft] = useState("");
  const [notesDraft, setNotesDraft] = useState("");
  const [uwDraft, setUwDraft] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [downloadingReport, setDownloadingReport] = useState(false);
  const [tab, setTab] = useState<"Borrower Profile" | "Summary" | "Conditions" | "Docs">("Borrower Profile");
  const [scanning, setScanning] = useState(false);
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const [manualLabel, setManualLabel] = useState("");
  const [manualSeverity, setManualSeverity] = useState<"low" | "med" | "high">("med");
  const [manualEvidence, setManualEvidence] = useState("");
  const [lastScanDiagnostics, setLastScanDiagnostics] = useState<ScanDiagnostics | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const appRef = useMemo(() => doc(db, "applications", id), [id]);

  useEffect(() => {
    if (!id) return;
    const unsub = onSnapshot(
      appRef,
      (snap) => {
        const data = (snap.data() as any) || null;
        setApp(data);
        setLoading(false);
        if (data) {
          setStatusDraft((data.status || "New").toString());
          setNotesDraft((data.notes || "").toString());
          setUwDraft((data.underwriterId || "").toString());

          const persistedDiagnostics = (data.scan?.diagnostics || null) as ScanDiagnostics | null;
          if (persistedDiagnostics) {
            setLastScanDiagnostics(persistedDiagnostics);
          }
        }
      },
      (err) => {
        console.error("onSnapshot error", err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [appRef, id]);

  useEffect(() => {
    const qy = query(collection(db, "underwriters"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(
      qy,
      (snap) => {
        const list: Underwriter[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
        setUnderwriters(list);
      },
      () => {}
    );
    return () => unsub();
  }, []);

  const storedDocs = useMemo(() => {
    const raw = (app as any)?.storedDocs;
    if (!Array.isArray(raw)) return [];

    return raw
      .filter((item: any) => item && typeof item === "object")
      .map((item: any) => ({
        name: (item.name || "Document").toString(),
        url: (item.url || "").toString(),
        path: (item.path || "").toString(),
        uploadedAtMs:
          typeof item.uploadedAtMs === "number" && Number.isFinite(item.uploadedAtMs)
            ? item.uploadedAtMs
            : 0,
      }))
      .filter((item: StoredDoc) => item.name && item.path);
  }, [app]);
  const scan = (app?.scan || null) as ScanResult | null;
  const hasScan = !!scan;

  const borrowerProfile = useMemo(() => {
    const borrowerProfileFS = ((app?.borrowerProfile || {}) as BorrowerProfileFS) || {};
    return normalizeBorrowerProfile(borrowerProfileFS);
  }, [app?.borrowerProfile]);

  const verified = ((app as any)?.borrowerProfileVerified || {}) as Record<string, boolean>;

  const uwConditions = useMemo(
    () =>
      lockHardStopConditionArray(((app as any)?.uwConditions || []) as UWCondition[])
        .map(normalizeExistingCondition)
        .filter(Boolean) as UWCondition[],
    [app]
  );

  const statusOptions = useMemo(() => ["New", "UW Review", "Conditions", "Approved"] as const, []);
  const underwritingReport = scan?.report || null;
  const scanDiagnostics = lastScanDiagnostics || scan?.diagnostics || null;

  async function saveStatus() {
    try {
      await updateDoc(appRef, stripUndefinedForFirestore({ status: statusDraft, updatedAt: serverTimestamp() }));
      toast({ type: "success", title: "Status saved", message: `Set to "${statusDraft}"` });
    } catch (e: any) {
      toast({ type: "error", title: "Status save failed", message: e?.message ?? "Unknown error" });
    }
  }

  async function saveNotes() {
    try {
      await updateDoc(appRef, stripUndefinedForFirestore({ notes: notesDraft, updatedAt: serverTimestamp() }));
      toast({ type: "success", title: "Notes saved" });
    } catch (e: any) {
      toast({ type: "error", title: "Notes save failed", message: e?.message ?? "Unknown error" });
    }
  }

  async function saveUnderwriter() {
    try {
      await updateDoc(appRef, stripUndefinedForFirestore({ underwriterId: uwDraft || "", updatedAt: serverTimestamp() }));
      toast({ type: "success", title: "Underwriter assigned" });
    } catch (e: any) {
      toast({ type: "error", title: "Assignment failed", message: e?.message ?? "Unknown error" });
    }
  }

  async function handleUpload(file: File) {
    if (!id) return;
    setUploading(true);
    setUploadPct(0);

    const cleanName = sanitizeFilename(file.name);
    const path = `applications/${id}/${Date.now()}_${cleanName}`;
    const storageRef = ref(storage, path);

    try {
      const task = uploadBytesResumable(storageRef, file);
      await new Promise<void>((resolve, reject) => {
        task.on(
          "state_changed",
          (snap) => {
            const pctVal = snap.totalBytes ? Math.round((snap.bytesTransferred / snap.totalBytes) * 100) : 0;
            setUploadPct(pctVal);
          },
          (err) => reject(err),
          () => resolve()
        );
      });

      const url = await getDownloadURL(storageRef);
      const docMeta: StoredDoc = {
        name: cleanName,
        url,
        path,
        uploadedAtMs: Date.now(),
      };

      await updateDoc(appRef, {
        storedDocs: arrayUnion(stripUndefinedForFirestore(docMeta) as any),
        updatedAt: serverTimestamp(),
      });

      toast({ type: "success", title: "Upload complete", message: cleanName });
      setTab("Docs");
    } catch (e: any) {
      toast({ type: "error", title: "Upload failed", message: e?.message ?? "Unknown error" });
    } finally {
      setUploading(false);
      setUploadPct(0);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function deleteOneDoc(target: StoredDoc) {
    if (!target?.path) return;

    try {
      await deleteObject(ref(storage, target.path));
    } catch {}

    try {
      const next = storedDocs.filter((d) => d.path !== target.path);
      await updateDoc(appRef, stripUndefinedForFirestore({
        storedDocs: next as any,
        updatedAt: serverTimestamp(),
      }));
      toast({ type: "success", title: "Doc deleted", message: target.name });
    } catch (e: any) {
      toast({ type: "error", title: "Delete failed", message: e?.message ?? "Unknown error" });
    }
  }

  async function deleteAllDocs() {
    if (storedDocs.length === 0) return;

    try {
      for (const d of storedDocs) {
        try {
          if (d?.path) await deleteObject(ref(storage, d.path));
        } catch {}
      }

      await updateDoc(appRef, {
        storedDocs: [],
        scan: deleteField(),
        borrowerProfile: deleteField(),
        borrowerProfileVerified: deleteField(),
        borrowerName: deleteField(),
        email: deleteField(),
        loanAmount: deleteField(),
        uwConditions: [],
        conditions: [],
        updatedAt: serverTimestamp(),
      });

      setLastScanDiagnostics(null);

      toast({
        type: "success",
        title: "All docs deleted",
        message: "Cleared docs, scan, borrower profile, top-level borrower fields, verified flags, and conditions.",
      });

      setTab("Docs");
    } catch (e: any) {
      toast({ type: "error", title: "Delete all failed", message: e?.message ?? "Unknown error" });
    }
  }

  async function saveUwConditions(next: UWCondition[]) {
    const canonical = lockHardStopConditionArray(mergeCanonicalConditions([next])) as UWCondition[];
    try {
      await updateDoc(appRef, stripUndefinedForFirestore({
        uwConditions: canonical as any,
        conditions: canonical as any,
        updatedAt: serverTimestamp(),
      }));
    } catch (e: any) {
      console.error("saveUwConditions failed:", e);
      throw e;
    }
  }

  async function runAiScan() {
    if (scanning) return;

    if (storedDocs.length === 0) {
      toast({ type: "error", title: "Upload required", message: "Upload a document before running AI Scan." });
      return;
    }

    setScanning(true);
    setSummaryExpanded(false);
    setPreviewExpanded(false);

    try {
      const docsForScan = storedDocs.map((d) => ({
        name: d.name,
        url: d.url,
        path: d.path,
        uploadedAtMs: d.uploadedAtMs,
      }));

      const res = await fetch(`/api/applications/${id}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storedDocs: docsForScan,
        }),
      });

      const data = (await res.json().catch(() => null)) as AnalyzeResponse | null;

      if (!res.ok || !data?.ok) {
        const msg = (data as any)?.error || `Analyze failed (${res.status})`;
        throw new Error(msg);
      }

      const diagnostics: ScanDiagnostics = {
        uploadedCount:
          typeof data.docsUploaded === "number" ? data.docsUploaded : docsForScan.length,
        processedCount:
          typeof data.docsProcessedCount === "number"
            ? data.docsProcessedCount
            : Array.isArray(data.docsProcessed)
            ? data.docsProcessed.length
            : 0,
        skippedCount:
          typeof data.docsSkippedCount === "number"
            ? data.docsSkippedCount
            : Array.isArray(data.docsSkipped)
            ? data.docsSkipped.length
            : 0,
        skippedDocs: Array.isArray(data.docsSkipped) ? data.docsSkipped : [],
        runtimeDocDebug: Array.isArray(data.runtimeDocDebug) ? data.runtimeDocDebug : [],
      };

      setLastScanDiagnostics(diagnostics);

      const canonical = {
        borrower:
          (data?.analysis?.normalized?.borrower || "").toString().trim() ||
          (data?.extracted?.borrower || "").toString().trim(),
        fullName:
          (data?.analysis?.normalized?.fullName || "").toString().trim() ||
          (data?.extracted?.fullName || "").toString().trim() ||
          (data?.extracted?.borrower || "").toString().trim(),
        email:
          (data?.analysis?.normalized?.email || "").toString().trim() ||
          (data?.extracted?.email || "").toString().trim(),
        dob:
          (data?.analysis?.normalized?.dob || "").toString().trim() ||
          (data?.extracted?.dob || "").toString().trim(),
        ssnLast4:
          (data?.analysis?.normalized?.ssnLast4 || "").toString().trim() ||
          (data?.extracted?.ssnLast4 || "").toString().trim(),
        loanNumber:
          (data?.analysis?.normalized?.loanNumber || "").toString().trim() ||
          (data?.extracted?.loanNumber || "").toString().trim() ||
          (data?.report?.borrower?.loanNumber || "").toString().trim(),
        income:
          data?.analysis?.normalized?.income ?? data?.extracted?.income ?? null,
        creditScore:
          data?.analysis?.normalized?.creditScore ?? data?.extracted?.creditScore ?? null,
        address:
          (data?.analysis?.normalized?.address || "").toString().trim() ||
          (data?.extracted?.address || "").toString().trim(),
        employerAddress:
          cleanEmployerAddressValue(data?.analysis?.normalized?.employerAddress || "") ||
          cleanEmployerAddressValue(data?.extracted?.employerAddress || ""),
        loanAmount:
          data?.analysis?.normalized?.loanAmount ?? data?.extracted?.loanAmount ?? null,
        assets:
          data?.analysis?.normalized?.assets ?? data?.extracted?.assets ?? null,
        debts:
          data?.analysis?.normalized?.debts ?? data?.extracted?.debts ?? null,
        propertyValue:
          data?.analysis?.normalized?.propertyValue ?? data?.extracted?.propertyValue ?? null,
        dti:
          data?.analysis?.normalized?.dti ?? data?.ai?.dti ?? null,
        ltv:
          data?.analysis?.normalized?.ltv ?? data?.ai?.ltv ?? null,
      };

      const nextBorrowerProfileFS = buildBorrowerProfileFromCanonical(canonical);
      const nextBorrowerProfile = normalizeBorrowerProfile(nextBorrowerProfileFS);

      const existingBySource = splitConditionsBySource(uwConditions);
      const nextAiConditions = buildAiConditions(
        Array.isArray(data?.ai?.conditions) ? data.ai.conditions : [],
        existingBySource.ai
      );
      const nextBorrowerConditions = buildConditionsFromBorrowerProfile(nextBorrowerProfile, verified);

      const canonicalConditions = lockHardStopConditionArray(
        mergeCanonicalConditions([
          nextAiConditions,
          nextBorrowerConditions,
          existingBySource.manual,
        ])
      ) as UWCondition[];

      const sourceConfidence = buildSourceConfidenceFromAnalysis(data?.analysis);

      const scanToSave: ScanResult = {
        mode: (data.mode || "unknown") as any,
        scannedAtMs: Date.now(),
        docName: data.docName || "Borrower File",
        summary: (data.summary || "").toString(),
        preview: (data.preview || "").toString(),
        extracted: {
          borrower: canonical.borrower,
          coBorrower: "",
          email: canonical.email,
          loanNumber: canonical.loanNumber,
          loanAmount: canonical.loanAmount,
          fullName: canonical.fullName || canonical.borrower,
          dob: canonical.dob,
          ssnLast4: canonical.ssnLast4,
          income: canonical.income,
          creditScore: canonical.creditScore,
          address: canonical.address,
          employerAddress: canonical.employerAddress,
          assets: canonical.assets,
          debts: canonical.debts,
          propertyValue: canonical.propertyValue,
        },
        conditions: [],
        redFlags: Array.isArray(data?.redFlags) ? data.redFlags : [],
        ai: data?.ai || null,
        report: data?.report || null,
        diagnostics,
        sourceConfidence,
        canonicalConditions:
          Array.isArray(data?.canonicalConditions)
            ? data.canonicalConditions
            : Array.isArray(data?.analysis?.canonicalConditions)
            ? data.analysis.canonicalConditions
            : [],
        readiness:
          data?.readiness ||
          data?.analysis?.readiness ||
          null,
      };

      await updateDoc(appRef, stripUndefinedForFirestore({
        scan: scanToSave as any,
        borrowerProfile: nextBorrowerProfileFS as any,
        borrowerName: canonical.fullName || canonical.borrower || "",
        email: canonical.email || "",
        loanNumber: canonical.loanNumber || "",
        loanAmount: canonical.loanAmount ?? null,
        uwConditions: canonicalConditions as any,
        conditions: canonicalConditions as any,
        updatedAt: serverTimestamp(),
      }));

      toast({
        type: "success",
        title: "AI Scan complete",
        message: `Processed ${diagnostics.processedCount} of ${diagnostics.uploadedCount} uploaded doc(s).`,
      });

      setTab("Summary");
    } catch (e: any) {
      toast({
        type: "error",
        title: "AI Scan failed",
        message: e?.message ?? "Unknown error",
        durationMs: 6000,
      });
      console.error("runAiScan error", e);
    } finally {
      setScanning(false);
    }
  }

  async function addManualCondition() {
    const label = manualLabel.trim();
    const evidence = manualEvidence.trim();

    if (!label) {
      toast({ type: "error", title: "Manual condition required", message: "Enter a condition label first." });
      return;
    }

    try {
      const existingBySource = splitConditionsBySource(uwConditions);
      const nextManual = buildManualCondition({
        label,
        severity: manualSeverity,
        evidence,
      });

      const canonical = mergeCanonicalConditions([
        existingBySource.ai,
        existingBySource.borrowerProfile,
        [...existingBySource.manual, nextManual],
      ]);

      await saveUwConditions(canonical);
      setManualLabel("");
      setManualSeverity("med");
      setManualEvidence("");
      toast({ type: "success", title: "Manual condition added", message: label });
      setTab("Conditions");
    } catch (e: any) {
      toast({ type: "error", title: "Add condition failed", message: e?.message ?? "Unknown error" });
    }
  }

  async function removeManualCondition(condId: string) {
    try {
      const existingBySource = splitConditionsBySource(uwConditions);
      const nextManual = existingBySource.manual.filter((c) => c.id !== condId);
      const canonical = mergeCanonicalConditions([
        existingBySource.ai,
        existingBySource.borrowerProfile,
        nextManual,
      ]);
      await saveUwConditions(canonical);
      toast({ type: "success", title: "Manual condition removed" });
    } catch (e: any) {
      toast({ type: "error", title: "Remove condition failed", message: e?.message ?? "Unknown error" });
    }
  }

  async function downloadReport() {
    if (!scan?.ai) {
      toast({ type: "error", title: "No report available", message: "Run AI Scan first." });
      return;
    }

    setDownloadingReport(true);

    try {
      const res = await fetch(`/api/applications/${id}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          extracted: scan.extracted || {},
          ai: scan.ai || null,
          report: scan.report || null,

          // Enterprise workflow orchestration layer
          readiness: workflowReadiness,
          canonicalConditions: canonicalWorkflowConditions,

          workflow: {
            readiness: workflowReadiness,
            canonicalConditions: canonicalWorkflowConditions,
            workflowRisk: workflowReadiness.workflowRisk || "review",
            readinessLabel: workflowReadiness.readinessLabel || "needs_review",
            readinessScore:
              typeof workflowReadiness.readinessScore === "number"
                ? workflowReadiness.readinessScore
                : 0,
            topBlockingReasons:
              Array.isArray(workflowReadiness.topBlockingReasons)
                ? workflowReadiness.topBlockingReasons
                : [],
            nextBestActions:
              Array.isArray(workflowReadiness.nextBestActions)
                ? workflowReadiness.nextBestActions
                : [],
          },
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `Report export failed (${res.status})`);
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      const safeName = (scan.extracted?.fullName || scan.extracted?.borrower || "application")
        .toString()
        .replace(/[^\w\-]+/g, "_");
      a.href = url;
      a.download = `${safeName}_underwriting_report.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      toast({ type: "success", title: "Report downloaded" });
    } catch (e: any) {
      toast({
        type: "error",
        title: "Download failed",
        message: e?.message ?? "Unknown error",
        durationMs: 6000,
      });
    } finally {
      setDownloadingReport(false);
    }
  }

  async function refreshConditions() {
    try {
      const existingBySource = splitConditionsBySource(uwConditions);
      const nextBorrowerConditions = storedDocs.length
        ? buildConditionsFromBorrowerProfile(borrowerProfile, verified)
        : [];

      const canonical = mergeCanonicalConditions([
        storedDocs.length ? existingBySource.ai : [],
        nextBorrowerConditions,
        existingBySource.manual,
      ]);

      await saveUwConditions(canonical);

      toast({
        type: "success",
        title: "Conditions refreshed",
        message: `${canonical.filter((x) => x.status === "open").length} open item(s) generated.`,
      });

      setTab("Conditions");
    } catch (e: any) {
      toast({
        type: "error",
        title: "Refresh failed",
        message: e?.message ?? "Unknown error",
        durationMs: 7000,
      });
      console.error("refreshConditions error", e);
    }
  }

  const markVerified = async (field: keyof BorrowerProfileFlat) => {
    try {
      const nextVerified = { ...(verified || {}), [String(field)]: true };
      await updateDoc(appRef, stripUndefinedForFirestore({
        borrowerProfileVerified: nextVerified as any,
        updatedAt: serverTimestamp(),
      }));

      const existingBySource = splitConditionsBySource(uwConditions);
      const nextBorrowerConditions = storedDocs.length
        ? buildConditionsFromBorrowerProfile(borrowerProfile, nextVerified)
        : [];

      const canonical = mergeCanonicalConditions([
        storedDocs.length ? existingBySource.ai : [],
        nextBorrowerConditions,
        existingBySource.manual,
      ]);

      await saveUwConditions(canonical);
      toast({ type: "success", title: "Verified", message: `${String(field)} marked verified.` });
    } catch (e: any) {
      toast({ type: "error", title: "Verify failed", message: e?.message ?? "Unknown error" });
      console.error("markVerified error", e);
    }
  };

  const clearVerified = async (field: keyof BorrowerProfileFlat) => {
    try {
      const nextVerified = { ...(verified || {}) };
      delete nextVerified[String(field)];

      await updateDoc(appRef, stripUndefinedForFirestore({
        borrowerProfileVerified: nextVerified as any,
        updatedAt: serverTimestamp(),
      }));

      const existingBySource = splitConditionsBySource(uwConditions);
      const nextBorrowerConditions = storedDocs.length
        ? buildConditionsFromBorrowerProfile(borrowerProfile, nextVerified)
        : [];

      const canonical = mergeCanonicalConditions([
        storedDocs.length ? existingBySource.ai : [],
        nextBorrowerConditions,
        existingBySource.manual,
      ]);

      await saveUwConditions(canonical);
      toast({ type: "success", title: "Unverified", message: `${String(field)} cleared.` });
    } catch (e: any) {
      toast({ type: "error", title: "Update failed", message: e?.message ?? "Unknown error" });
      console.error("clearVerified error", e);
    }
  };

  async function toggleCondition(condId: string) {
    try {
      const list = uwConditions || [];
      const target = list.find((c) => c.id === condId);
      if (!target) return;

      const field = verificationFieldFromLabel(target.label);
      const nextStatus: UWCondition["status"] = target.status === "done" ? "open" : "done";

      const nextVerifiedMap = (() => {
        const map = { ...(verified || {}) };
        if (field) {
          if (nextStatus === "done") map[String(field)] = true;
          else delete map[String(field)];
        }
        return map;
      })();

      if (field) {
        await updateDoc(appRef, {
          borrowerProfileVerified: nextVerifiedMap as any,
          updatedAt: serverTimestamp(),
        });
      }

      const next = list.map((c) =>
        c.id === condId ? { ...c, status: nextStatus, updatedAtMs: Date.now() } : c
      );

      const nextBySource = splitConditionsBySource(next);

      if (target.source === "borrower_profile") {
        const regeneratedBorrower = storedDocs.length
          ? buildConditionsFromBorrowerProfile(borrowerProfile, nextVerifiedMap)
          : [];

        const canonical = mergeCanonicalConditions([
          storedDocs.length ? nextBySource.ai : [],
          regeneratedBorrower,
          nextBySource.manual,
        ]);

        await saveUwConditions(canonical);

        if (!field) {
          toast({
            type: "info",
            title: "System condition recalculated",
            message: "Borrower Profile conditions now clear only when the underlying field is actually satisfied.",
          });
        }

        return;
      }

      const canonical = mergeCanonicalConditions([
        storedDocs.length ? nextBySource.ai : [],
        storedDocs.length ? nextBySource.borrowerProfile : [],
        nextBySource.manual,
      ]);

      await saveUwConditions(canonical);
    } catch (e: any) {
      toast({ type: "error", title: "Update failed", message: e?.message ?? "Unknown error" });
      console.error("toggleCondition error", e);
    }
  }

  const uwLabel = useMemo(() => {
    const u = underwriters.find((x) => x.id === (app?.underwriterId || ""));
    if (!u) return "Unassigned";
    return u.name || u.email || "Underwriter";
  }, [underwriters, app?.underwriterId]);

  const borrowerDisplay =
    borrowerProfile.fullName ||
    (app?.borrowerName || "").toString().trim() ||
    (scan?.extracted?.fullName || scan?.extracted?.borrower || "").toString().trim() ||
    "Borrower";

  const emailDisplay =
    borrowerProfile.email ||
    (app?.email || "").toString().trim() ||
    (scan?.extracted?.email || "").toString().trim() ||
    "-";

  const loanDisplay =
    borrowerProfile.loanAmount ??
    (typeof app?.loanAmount === "number" ? app.loanAmount : null) ??
    (scan?.extracted?.loanAmount ?? null);

  const loanNumberDisplay =
    borrowerProfile.loanNumber ||
    ((app as any)?.loanNumber || "").toString().trim() ||
    (scan?.extracted?.loanNumber || "").toString().trim() ||
    (underwritingReport?.borrower?.loanNumber || "").toString().trim() ||
    "-";

  const creditScoreDisplayValue =
    borrowerProfile.creditScore ??
    (typeof scan?.extracted?.creditScore === "number" ? scan.extracted.creditScore : null) ??
    (scan?.ai?.factors || []).find((factor) => {
      const key = (factor?.key || "").toString().toLowerCase();
      const label = (factor?.label || "").toString().toLowerCase();
      return key.includes("credit") || label.includes("credit");
    })?.value ??
    null;

  const debtsDisplayValue =
    borrowerProfile.debts ??
    (typeof scan?.extracted?.debts === "number" ? scan.extracted.debts : null) ??
    (typeof underwritingReport?.financials?.debts === "number" ? underwritingReport.financials.debts : null);

  const dtiDisplayValue =
    getDisplayDtiValue(scan, borrowerProfile) ??
    (typeof underwritingReport?.financials?.totalDti === "number" ? underwritingReport.financials.totalDti / 100 : null) ??
    (typeof underwritingReport?.financials?.dti === "number" ? underwritingReport.financials.dti / 100 : null);

  const aiDtiFactor = (scan?.ai?.factors || []).find((factor) => isDtiFactor(factor)) || null;
  const reportDtiFactor = (underwritingReport?.factors || []).find((factor) => isDtiFactor(factor)) || null;
  const dtiFactorDisplay = aiDtiFactor
    ? normalizeFactorSummary({
        label: aiDtiFactor.label || "DTI",
        impact: aiDtiFactor.impact || "neutral",
        summary: aiDtiFactor.summary || "",
        source: aiDtiFactor.source || "debts",
      })
    : reportDtiFactor
    ? normalizeFactorSummary(reportDtiFactor)
    : null;

  const sourceConfidence = scan?.sourceConfidence || null;

  const visibleReportFactors = (() => {
    const reportFactors = [...(underwritingReport?.factors || [])];
    const aiFactors = scan?.ai?.factors || [];
    const hasReportDtiFactor = reportFactors.some((factor) => isDtiFactor(factor));

    if (!hasReportDtiFactor && aiDtiFactor) {
      reportFactors.push({
        key: aiDtiFactor.key || "total_dti",
        label: aiDtiFactor.label || "Total DTI",
        impact: aiDtiFactor.impact || "neutral",
        summary: aiDtiFactor.summary || "",
        source: aiDtiFactor.source || "debts",
        value: aiDtiFactor.value ?? null,
      });
    }

    const aiProposedHousing = aiFactors.find((factor) => {
      const key = (factor?.key || "").toString().toLowerCase();
      const label = (factor?.label || "").toString().toLowerCase();
      return key === "proposed_housing_payment" || label === "proposed housing payment";
    });

    const hasProposedHousing = reportFactors.some((factor) => {
      const key = (factor?.key || "").toString().toLowerCase();
      const label = (factor?.label || "").toString().toLowerCase();
      return key === "proposed_housing_payment" || label === "proposed housing payment";
    });

    if (!hasProposedHousing && aiProposedHousing) {
      reportFactors.push({
        key: aiProposedHousing.key || "proposed_housing_payment",
        label: aiProposedHousing.label || "Proposed Housing Payment",
        impact: aiProposedHousing.impact || "neutral",
        summary: aiProposedHousing.summary || "",
        source: aiProposedHousing.source || "loan",
        value: aiProposedHousing.value ?? null,
      });
    }

    return reportFactors;
  })();

  const dtiBreakdown = buildDtiBreakdown(scan, borrowerProfile);
  const approvalPath = buildApprovalPath(scan, borrowerProfile, dtiBreakdown);
  const underwritingSnapshot = buildUnderwritingSnapshot(scan, borrowerProfile, dtiBreakdown);
  const enterpriseDecision = enterpriseDecisionLanguage(
    underwritingSnapshot.decision,
    scan?.ai?.reason || underwritingReport?.decision?.reason
  );

  const blockedExplanation = (() => {
    const dti = dtiBreakdown.totalDti;
    const credit = toFiniteNumber(borrowerProfile.creditScore);
    const ltv = toFiniteNumber(borrowerProfile.ltv) ?? toFiniteNumber(scan?.ai?.ltv);

    const reasons: string[] = [];

    if (typeof dti === "number" && dti > 0.5) {
      reasons.push(`Total DTI is ${formatPercentCompact(dti)}, which is above the usual 50% stress zone.`);
    }

    if (typeof credit === "number" && credit < 620) {
      reasons.push(`Credit score is ${credit}, which is below the common 620 review threshold.`);
    }

    if (typeof ltv === "number" && ltv >= 0.9) {
      reasons.push(`LTV is ${formatPercentCompact(ltv)}, leaving limited borrower equity cushion.`);
    }

    if (!reasons.length) {
      return "File is blocked because one or more high-severity conditions remain open.";
    }

    return reasons.join(" ");
  })();

  const canonicalConditions = useMemo(() => mergeCanonicalConditions([uwConditions]), [uwConditions]);
  const conditionSummary = useMemo(
    () => canonicalConditionSummary(canonicalConditions),
    [canonicalConditions]
  );

  const workflowReadiness = getWorkflowReadiness(scan, conditionSummary);
  const canonicalWorkflowConditions = getCanonicalWorkflowConditions(scan);
  const workflowReadinessTone = workflowRiskTone(workflowReadiness.workflowRisk || workflowReadiness.readinessLabel);
  const workflowReadinessScore =
    typeof workflowReadiness.readinessScore === "number" && Number.isFinite(workflowReadiness.readinessScore)
      ? workflowReadiness.readinessScore
      : 0;

  const openConditions = conditionSummary.open;
  const openHighConditions = conditionSummary.high;
  const openMedConditions = conditionSummary.med;
  const openLowConditions = conditionSummary.low;
  const doneConditions = conditionSummary.done;

  const aiRecommendationLabel = prettyVerdict(
    underwritingReport?.summary?.decision || scan?.ai?.verdict || ""
  );

  const aiRecommendationRaw = (
    underwritingReport?.summary?.decision ||
    scan?.ai?.verdict ||
    ""
  )
    .toString()
    .trim()
    .toLowerCase();

  const aiHardStop =
    aiRecommendationRaw === "blocked" ||
    aiRecommendationRaw === "denied" ||
    aiRecommendationRaw === "deny";

  const workflowGate = (() => {
    if (openHighConditions.length > 0 || aiHardStop) {
      return {
        label: "Blocked",
        tone: "red" as const,
        message: "One or more high-severity conditions or hard-stop decision findings must be cleared before approval.",
      };
    }

    if (openConditions.length > 0) {
      return {
        label: "Conditionally Approve",
        tone: "amber" as const,
        message: "All high severity conditions are cleared. Remaining open items must be resolved before final approval.",
      };
    }

    return {
      label: "Clear to Approve",
      tone: "green" as const,
      message: "No open conditions remain. Loan is ready for approval.",
    };
  })();

  const finalDecisionState = (() => {
    if (workflowGate.label === "Blocked") {
      return {
        label: "Blocked",
        tone: "red" as const,
        message:
          "Loan is blocked under current credit policy. One or more high-severity conditions or hard-stop decision findings must be cleared before any approval is possible.",
      };
    }

    if (workflowGate.label === "Conditionally Approve") {
      return {
        label: "Approve With Conditions",
        tone: "amber" as const,
        message:
          "All hard blocks are cleared. Remaining conditions must be resolved before final approval.",
      };
    }

    return {
      label: "Ready For Final Approval",
      tone: "green" as const,
      message: "No open conditions remain. Operational workflow is aligned for approval.",
    };
  })();

  const operationalDecisionLabel = finalDecisionState.label;
  const operationalDecisionTone = finalDecisionState.tone;

  const operationalReason =
    conditionSummary.openCount === 0
      ? "No open conditions remain. Operational workflow is aligned for approval."
      : finalDecisionState.message;

  const aiDecisionChipLabel =
    conditionSummary.openCount === 0
      ? "Ready For Final Approval"
      : aiRecommendationLabel || "-";

  const aiDecisionChipTone =
    conditionSummary.openCount === 0
      ? "green"
      : statusTone(aiRecommendationLabel || "");

  const advisoryAiLabel = aiDecisionChipLabel;
  const advisoryAiTone = aiDecisionChipTone;

  const displayedAiRecommendationLabel =
    conditionSummary.openCount === 0 ? "Operationally Ready" : aiRecommendationLabel || "-";

  const displayedAiRecommendationTone =
    conditionSummary.openCount === 0 ? "green" : statusTone(aiRecommendationLabel || "");

  const aiRiskChipLabel =
    conditionSummary.openCount === 0
      ? "Clear"
      : prettyRisk(underwritingReport?.summary?.risk || scan?.ai?.risk || "");

  const aiRiskChipTone =
    conditionSummary.openCount === 0
      ? "green"
      : statusTone(prettyRisk(underwritingReport?.summary?.risk || scan?.ai?.risk || ""));

  const blockingReasons = buildBlockingReasons({
    aiRecommendationRaw,
    aiReason: scan?.ai?.reason || underwritingReport?.decision?.reason || "",
    openHighConditions,
    openConditions,
  });

  const showHardBlockUI = openHighConditions.length > 0 || aiHardStop;

  const controllingRedFlags = showHardBlockUI
    ? blockingReasons.map((reason) => reason.label)
    : [];

  const nonBlockingOpenConditions = openConditions.filter((condition) => condition.severity !== "high");

  function tabBtn(active: boolean) {
    return active ? "v-btn-primary" : "v-btn";
  }

  if (loading) {
    return (
      <div className="v-card p-6">
        <div className="text-sm v-muted">Loading application...</div>
      </div>
    );
  }

  if (!app) {
    return (
      <div className="v-card p-6">
        <div className="text-sm text-red-600">Application not found.</div>
      </div>
    );
  }

  const bpRows: Array<{ key: keyof BorrowerProfileFlat; label: string; value: any }> = [
    { key: "fullName", label: "Full Name", value: borrowerProfile.fullName },
    { key: "email", label: "Email", value: borrowerProfile.email },
    { key: "dob", label: "DOB", value: borrowerProfile.dob },
    { key: "ssnLast4", label: "SSN (Last 4)", value: borrowerProfile.ssnLast4 },
    { key: "loanNumber", label: "Loan Number", value: borrowerProfile.loanNumber },
    { key: "income", label: "Income", value: borrowerProfile.income },
    { key: "creditScore", label: "Credit Score", value: creditScoreDisplayValue },
    { key: "debts", label: "Monthly Debts", value: debtsDisplayValue },
    { key: "dti", label: "Total DTI", value: dtiDisplayValue },
    { key: "address", label: "Address", value: borrowerProfile.address },
    { key: "employerAddress", label: "Employer Address", value: cleanEmployerAddressValue(borrowerProfile.employerAddress || "") },
    { key: "loanAmount", label: "Loan Amount", value: borrowerProfile.loanAmount },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-xs v-muted">Application</div>
          <div className="text-2xl font-semibold">{borrowerDisplay}</div>
          <div className="text-sm v-muted">{emailDisplay !== "-" ? emailDisplay : `ID: ${id}`}</div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="v-chip">{formatMoney(loanDisplay)}</span>
          <StatusChip status={app.status || "New"} />
          <span className="v-chip">{uwLabel}</span>
          <span className="v-chip">{hasScan ? "Scan: Completed" : "Scan: -"}</span>
          <button className="v-btn-primary" onClick={downloadReport} disabled={!scan?.ai || downloadingReport}>
            {downloadingReport ? "Downloading..." : "Download Report PDF"}
          </button>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2 space-y-3">
          <div className="v-card p-5">
            <div className="text-sm font-semibold">Workflow</div>
            <div className="text-xs v-muted mt-1">Status + underwriting assignment.</div>

            <div className="mt-4 grid md:grid-cols-2 gap-3">
              <div>
                <div className="text-xs v-muted mb-1">Status</div>
                <select
                  className="w-full border rounded-xl p-2 bg-white text-sm"
                  style={{ borderColor: "rgba(15,23,42,0.10)" }}
                  value={statusDraft}
                  onChange={(e) => setStatusDraft(e.target.value)}
                  disabled={uploading || scanning}
                >
                  {statusOptions.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <button className="v-btn-primary mt-2" onClick={saveStatus} disabled={uploading || scanning}>
                  Save status
                </button>
              </div>

              <div>
                <div className="text-xs v-muted mb-1">Assign underwriter</div>
                <select
                  className="w-full border rounded-xl p-2 bg-white text-sm"
                  style={{ borderColor: "rgba(15,23,42,0.10)" }}
                  value={uwDraft}
                  onChange={(e) => setUwDraft(e.target.value)}
                  disabled={uploading || scanning}
                >
                  <option value="">Unassigned</option>
                  {underwriters.map((u) => (
                    <option key={u.id} value={u.id}>
                      {(u.name || u.email || u.id) + (u.active === false ? " (inactive)" : "")}
                    </option>
                  ))}
                </select>
                <button className="v-btn mt-2" onClick={saveUnderwriter} disabled={uploading || scanning}>
                  Save assignment
                </button>
              </div>
            </div>
          </div>

          <div className="v-card p-5">
            <div className="text-sm font-semibold">Internal notes</div>
            <textarea
              className="w-full border rounded-xl p-3 bg-white text-sm mt-3"
              style={{ borderColor: "rgba(15,23,42,0.10)", minHeight: 140 }}
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              placeholder="Add notes..."
              disabled={uploading || scanning}
            />
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <button className="v-btn-primary" onClick={saveNotes} disabled={uploading || scanning}>
                Save notes
              </button>
              <button
                className="v-btn"
                onClick={() => {
                  setNotesDraft(app.notes || "");
                  toast({ type: "info", title: "Reset notes", message: "Draft restored to last saved version." });
                }}
                disabled={uploading || scanning}
              >
                Reset
              </button>
            </div>
          </div>

          <div className="v-card p-5">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <div className="text-sm font-semibold">AI Scan</div>
                <div className="text-xs v-muted mt-1">
                  {scan?.scannedAtMs
                    ? `Last scanned: ${fmtDateTimeFromMs(scan.scannedAtMs)}`
                    : "Run scan to generate summary + profile."}
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button className={tabBtn(tab === "Borrower Profile")} onClick={() => setTab("Borrower Profile")}>
                  Borrower Profile
                </button>
                <button className={tabBtn(tab === "Summary")} onClick={() => setTab("Summary")}>
                  Summary
                </button>
                <button className={tabBtn(tab === "Conditions")} onClick={() => setTab("Conditions")}>
                  Conditions
                </button>
                <button className={tabBtn(tab === "Docs")} onClick={() => setTab("Docs")}>
                  Docs
                </button>
                <button className="v-btn-primary" onClick={runAiScan} disabled={scanning || storedDocs.length === 0}>
                  {scanning ? "Scanning..." : "Run AI Scan"}
                </button>
              </div>
            </div>

            {!!scanDiagnostics && (
              <div className="mt-4 v-card-soft p-4 space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <div className="text-sm font-semibold">Scan Diagnostics</div>
                    <div className="text-xs v-muted mt-1">
                      Backend doc flow from the most recent AI Scan.
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <ToneChip label={`Uploaded ${scanDiagnostics.uploadedCount}`} tone="gray" />
                    <ToneChip label={`Processed ${scanDiagnostics.processedCount}`} tone="green" />
                    <ToneChip
                      label={`Skipped ${scanDiagnostics.skippedCount}`}
                      tone={scanDiagnostics.skippedCount > 0 ? "amber" : "blue"}
                    />
                  </div>
                </div>

                {scanDiagnostics.skippedDocs.length > 0 ? (
                  <div className="space-y-2">
                    {scanDiagnostics.skippedDocs.map((doc, idx) => (
                      <div key={`${doc.name}_${idx}`} className="v-card p-3">
                        <div className="flex items-start justify-between gap-2 flex-wrap">
                          <div className="text-sm font-semibold">{doc.name}</div>
                          <ToneChip label={toTitleWords(doc.reason)} tone="amber" />
                        </div>
                        <div className="text-xs v-muted mt-2">{doc.detail || "No extra detail provided."}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm v-muted">No skipped docs on the last scan.</div>
                )}
              </div>
            )}

            {!hasScan && (
              <div className="mt-4 text-sm v-muted">
                No scan results yet. Upload a document and click <span className="font-semibold">Run AI Scan</span>.
              </div>
            )}

            {tab === "Borrower Profile" && (
              <div className="mt-4 space-y-3">
                <div className="grid md:grid-cols-2 gap-3">
                  {bpRows.map((row) => {
                    const presentation = getBorrowerFieldPresentation(row.key, row.value, verified);
                    const isVerified = !!verified[String(row.key)];

                    return (
                      <div key={String(row.key)} className="v-card-soft p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-xs v-muted">{row.label}</div>
                            <div className="text-sm font-semibold mt-1 break-words">{presentation.displayValue}</div>
                            <div className="text-xs v-muted mt-2">{presentation.helper}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <ToneChip label={presentation.chipLabel} tone={presentation.chipTone} />
                          </div>
                        </div>
                        <div className="mt-3 flex items-center gap-2 flex-wrap">
                          <button className="v-btn-primary" onClick={() => markVerified(row.key)} disabled={isVerified}>
                            Verify
                          </button>
                          <button className="v-btn" onClick={() => clearVerified(row.key)} disabled={!isVerified}>
                            Unverify
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {tab === "Summary" && (
              <div className="mt-4 space-y-3">
                {!scan ? (
                  <div className="text-sm v-muted">
                    No scan yet. Upload a doc and click <span className="font-semibold">Run AI Scan</span>.
                  </div>
                ) : (
                  <>
                    <div className="v-card-soft p-4">
                      <div className="text-xs v-muted">Scanned doc(s)</div>
                      <div className="text-sm font-semibold mt-1">{scan.docName || "-"}</div>
                      <div className="text-xs v-muted mt-1">
                        Mode: {scan.mode} • {fmtDateTimeFromMs(scan.scannedAtMs)}
                      </div>
                    </div>

                    {underwritingReport && (
                      <div className="v-card-soft p-4 space-y-4">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div>
                            <div className="text-xs v-muted">Underwriting Report</div>
                            <div className="text-lg font-semibold mt-1">
                              {prettyVerdict(underwritingReport.summary.decision)}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <ToneChip label={`Score ${underwritingReport.summary.score}`} tone="blue" />
                            <ToneChip
                              label={prettyRisk(underwritingReport.summary.risk)}
                              tone={
                                underwritingReport.summary.risk === "HIGH"
                                  ? "red"
                                  : underwritingReport.summary.risk === "MEDIUM"
                                  ? "amber"
                                  : "green"
                              }
                            />
                            <ToneChip label={`Workflow Gate: ${workflowGate.label}`} tone={workflowGate.tone} />
                          </div>
                        </div>

                        <div className="v-card p-4">
                          <div className="text-xs v-muted">Final Decision State</div>
                          <div className="mt-2 flex items-center gap-2 flex-wrap">
                            <ToneChip label={finalDecisionState.label} tone={finalDecisionState.tone} />
                          </div>
                          <div className="text-xs v-muted mt-2">{finalDecisionState.message}</div>
                        </div>

                        <div className="v-card p-4">
                          <div className="flex items-start justify-between gap-3 flex-wrap">
                            <div>
                              <div className="text-xs v-muted">Canonical Condition State</div>
                              <div className="text-sm font-semibold mt-1">
                                Summary, Conditions tab, Snapshot, and workflow gate are using the same saved condition set.
                              </div>
                            </div>
                            <ToneChip
                              label={canonicalConditionStatusLabel(conditionSummary)}
                              tone={canonicalConditionStatusTone(conditionSummary)}
                            />
                          </div>

                          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-4">
                            <div className="v-card-soft p-3">
                              <div className="text-xs v-muted">Open</div>
                              <div className="text-sm font-semibold mt-1">{conditionSummary.openCount}</div>
                            </div>
                            <div className="v-card-soft p-3">
                              <div className="text-xs v-muted">High</div>
                              <div className="text-sm font-semibold mt-1">{conditionSummary.highCount}</div>
                            </div>
                            <div className="v-card-soft p-3">
                              <div className="text-xs v-muted">Med</div>
                              <div className="text-sm font-semibold mt-1">{conditionSummary.medCount}</div>
                            </div>
                            <div className="v-card-soft p-3">
                              <div className="text-xs v-muted">Low</div>
                              <div className="text-sm font-semibold mt-1">{conditionSummary.lowCount}</div>
                            </div>
                            <div className="v-card-soft p-3">
                              <div className="text-xs v-muted">Cleared</div>
                              <div className="text-sm font-semibold mt-1">{conditionSummary.doneCount}</div>
                            </div>
                          </div>

                          {conditionSummary.openCount > 0 ? (
                            <div className="text-xs v-muted mt-3">
                              Next required action: clear the open saved conditions in the Conditions tab before final approval.
                            </div>
                          ) : (
                            <div className="text-xs v-muted mt-3">
                              No open saved conditions remain. Workflow is aligned for final approval.
                            </div>
                          )}
                        </div>

                        <div className="v-card p-4">
                          <div className="flex items-start justify-between gap-3 flex-wrap">
                            <div>
                              <div className="text-xs v-muted">Workflow Readiness</div>
                              <div className="text-lg font-semibold mt-1">
                                {readinessLabelText(workflowReadiness.readinessLabel)}
                              </div>
                              <div className="text-xs v-muted mt-1">
                                Canonical workflow conditions now drive operational readiness, owner routing, and closeability signals.
                              </div>
                            </div>

                            <div className="flex items-center gap-2 flex-wrap">
                              <ToneChip label={`${workflowReadinessScore}% Ready`} tone={workflowReadinessTone} />
                              <ToneChip
                                label={`Risk: ${prettyRisk(workflowReadiness.workflowRisk || "review")}`}
                                tone={workflowRiskTone(workflowReadiness.workflowRisk)}
                              />
                              <ToneChip
                                label={`Closeability: ${prettyRisk(workflowReadiness.estimatedCloseability || "review")}`}
                                tone={workflowRiskTone(workflowReadiness.estimatedCloseability)}
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-4">
                            <div className="v-card-soft p-3">
                              <div className="text-xs v-muted">Blocking</div>
                              <div className="text-sm font-semibold mt-1">
                                {workflowReadiness.unresolvedBlockingConditions ?? 0}
                              </div>
                            </div>
                            <div className="v-card-soft p-3">
                              <div className="text-xs v-muted">Borrower Tasks</div>
                              <div className="text-sm font-semibold mt-1">
                                {workflowReadiness.borrowerActionCount ?? 0}
                              </div>
                            </div>
                            <div className="v-card-soft p-3">
                              <div className="text-xs v-muted">Processor Tasks</div>
                              <div className="text-sm font-semibold mt-1">
                                {workflowReadiness.processorActionCount ?? 0}
                              </div>
                            </div>
                            <div className="v-card-soft p-3">
                              <div className="text-xs v-muted">UW Tasks</div>
                              <div className="text-sm font-semibold mt-1">
                                {workflowReadiness.underwriterActionCount ?? 0}
                              </div>
                            </div>
                          </div>

                          {Array.isArray(workflowReadiness.topBlockingReasons) && workflowReadiness.topBlockingReasons.length ? (
                            <div className="mt-4">
                              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                Top Blocking Reasons
                              </div>
                              <div className="mt-2 space-y-2">
                                {workflowReadiness.topBlockingReasons.slice(0, 4).map((reason, index) => (
                                  <div key={`${reason}_${index}`} className="v-card-soft p-2 text-xs">
                                    {reason}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : null}

                          {Array.isArray(workflowReadiness.nextBestActions) && workflowReadiness.nextBestActions.length ? (
                            <div className="mt-4">
                              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                Next Best Actions
                              </div>
                              <div className="mt-2 space-y-2">
                                {workflowReadiness.nextBestActions.slice(0, 5).map((action, index) => (
                                  <div key={`${action}_${index}`} className="v-card-soft p-2 text-xs">
                                    {index + 1}. {action}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : null}
                        </div>

                        {canonicalWorkflowConditions.length ? (
                          <div className="v-card p-4">
                            <div className="flex items-start justify-between gap-3 flex-wrap">
                              <div>
                                <div className="text-xs v-muted">Canonical Workflow Conditions</div>
                                <div className="text-sm font-semibold mt-1">
                                  Backend workflow-condition metadata is now present on this loan.
                                </div>
                              </div>
                              <ToneChip label={`${canonicalWorkflowConditions.length} Workflow Items`} tone="blue" />
                            </div>

                            <div className="grid md:grid-cols-2 gap-3 mt-4">
                              {canonicalWorkflowConditions.slice(0, 6).map((condition) => (
                                <div key={condition.id} className="v-card-soft p-3">
                                  <div className="flex items-start justify-between gap-2 flex-wrap">
                                    <div className="text-sm font-semibold">
                                      {condition.title || condition.id}
                                    </div>
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <ToneChip
                                        label={condition.blocking ? "Blocking" : "Workflow"}
                                        tone={condition.blocking ? "red" : "blue"}
                                      />
                                      <ToneChip
                                        label={toTitleWords(condition.owner || "system")}
                                        tone={
                                          condition.owner === "underwriter"
                                            ? "red"
                                            : condition.owner === "processor"
                                            ? "amber"
                                            : condition.owner === "borrower"
                                            ? "blue"
                                            : "gray"
                                        }
                                      />
                                    </div>
                                  </div>
                                  <div className="text-xs v-muted mt-2">
                                    Category: {toTitleWords(condition.category || "underwriting")} • Strategy:{" "}
                                    {toTitleWords(condition.resolutionStrategy || "review")}
                                  </div>
                                  {condition.summary ? (
                                    <div className="text-xs mt-2" style={{ color: "rgba(15,23,42,0.78)" }}>
                                      {condition.summary}
                                    </div>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        <div className="grid md:grid-cols-3 gap-3">
                          <div className="v-card p-3">
                            <div className="text-xs v-muted">Loan Amount</div>
                            <div className="text-sm font-semibold mt-1">
                              {formatMoney(underwritingReport.loan.loanAmount)}
                            </div>
                          </div>
                          <div className="v-card p-3">
                            <div className="text-xs v-muted">Loan Number</div>
                            <div className="text-sm font-semibold mt-1 break-all">
                              {loanNumberDisplay}
                            </div>
                          </div>
                          <div className="v-card p-3">
                            <div className="text-xs v-muted">Property Value</div>
                            <div className="text-sm font-semibold mt-1">
                              {formatMoney(underwritingReport.loan.propertyValue)}
                            </div>
                          </div>
                          <div className="v-card p-3">
                            <div className="text-xs v-muted">LTV / DTI</div>
                            <div className="text-sm font-semibold mt-1">
                              {formatPercent(underwritingReport.loan.ltv)} / {formatPercent(underwritingReport.financials.dti)}
                            </div>
                            {dtiFactorDisplay?.summary ? (
                              <div className="text-xs v-muted mt-2">{dtiFactorDisplay.summary}</div>
                            ) : null}
                          </div>
                        </div>

                        <div className="v-card p-4">
                          <div className="text-xs v-muted">Reason</div>
                          <div className="text-sm mt-2" style={{ color: "rgba(15,23,42,0.82)" }}>
                            {underwritingReport.decision.reason || "-"}
                          </div>
                        </div>

                        <div>
                          <div className="text-sm font-semibold mb-2">Key Factors</div>
                          <div className="grid md:grid-cols-2 gap-3">
                            {visibleReportFactors.map((f, i) => {
                              const normalized = normalizeFactorSummary(f);
                              const sourceInfo = getSourceConfidenceForFactor(f, sourceConfidence);

                              return (
                                <div key={`${f.label}_${i}`} className="v-card p-4">
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="text-sm font-semibold">{f.label}</div>
                                    <ToneChip label={toTitleWords(f.impact)} tone={impactTone(f.impact)} />
                                  </div>
                                  <div className="text-sm mt-2" style={{ color: "rgba(15,23,42,0.82)" }}>
                                    {normalized.summary}
                                  </div>
                                  {normalized.source ? (
                                    <div className="text-xs mt-2 v-muted">{normalized.source}</div>
                                  ) : null}

                                  {sourceInfo ? (
                                    <div className="mt-3 rounded-xl border bg-white p-3" style={{ borderColor: "rgba(15,23,42,0.08)" }}>
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <ToneChip
                                          label={`Source Confidence: ${sourceInfo.confidenceLabel}`}
                                          tone={sourceConfidenceTone(sourceInfo.confidenceLabel)}
                                        />
                                        <span className="text-xs v-muted">
                                          {sourceInfo.confidence !== null ? `${Math.round(sourceInfo.confidence * 100)}%` : "No score"}
                                        </span>
                                      </div>
                                      <div className="text-xs mt-2" style={{ color: "rgba(15,23,42,0.76)" }}>
                                        <span className="font-semibold">Winning source:</span> {sourceInfo.sourceLabel}
                                      </div>
                                      <div className="text-xs v-muted mt-1">{sourceInfo.reason}</div>
                                      {sourceInfo.evidenceCount > 0 ? (
                                        <div className="text-xs v-muted mt-1">Evidence refs: {sourceInfo.evidenceCount}</div>
                                      ) : null}
                                    </div>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        <div className={`rounded-2xl border p-4 shadow-sm ${snapshotToneClass(underwritingSnapshot.tone)}`}>
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <div className="text-sm font-semibold">Underwriting Snapshot</div>
                              <p className="mt-1 text-xs opacity-80">
                                Fast decision-maker view of the file, the main risk drivers, and the approval path.
                              </p>
                            </div>
                            <span
                              className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${snapshotPillClass(
                                underwritingSnapshot.tone
                              )}`}
                            >
                              {underwritingSnapshot.decision}
                            </span>
                          </div>

                          <div className="mt-4 grid gap-3 lg:grid-cols-3">
                            <div className="rounded-xl border border-white/70 bg-white/70 p-3">
                              <p className="text-[11px] uppercase tracking-wide opacity-70">Decision</p>
                              <p className="mt-1 text-sm font-semibold">{underwritingSnapshot.decision}</p>
                              <p className="mt-2 text-xs font-medium opacity-80">{enterpriseDecision.title}</p>
                            </div>

                            <div className="rounded-xl border border-white/70 bg-white/70 p-3 lg:col-span-1">
                              <p className="text-[11px] uppercase tracking-wide opacity-70">Primary Drivers</p>
                              <p className="mt-1 text-sm font-semibold">
                                {underwritingSnapshot.drivers.join(", ")}
                              </p>
                            </div>

                            <div className="rounded-xl border border-white/70 bg-white/70 p-3">
                              <p className="text-[11px] uppercase tracking-wide opacity-70">Path</p>
                              <p className="mt-1 text-sm font-semibold">{underwritingSnapshot.path}</p>
                            </div>
                          </div>

                          <div className="mt-3 rounded-xl border border-white/70 bg-white/70 p-3 text-xs font-medium opacity-90">
                            {enterpriseDecision.summary}
                          </div>
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <div className="text-sm font-semibold text-slate-900">DTI Breakdown</div>
                              <p className="mt-1 text-xs text-slate-500">
                                Shows the math behind Total DTI so the underwriting decision is traceable.
                              </p>
                            </div>
                            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-600">
                              Explainability
                            </span>
                          </div>

                          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                              <p className="text-[11px] uppercase tracking-wide text-slate-500">Monthly Income</p>
                              <p className="mt-1 text-sm font-semibold text-slate-900">
                                {formatCurrencyCompact(dtiBreakdown.monthlyIncome)}
                              </p>
                              <p className="mt-1 text-[11px] text-slate-500">
                                Annual: {formatCurrencyCompact(dtiBreakdown.annualIncome)}
                              </p>
                            </div>

                            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                              <p className="text-[11px] uppercase tracking-wide text-slate-500">Existing Debts</p>
                              <p className="mt-1 text-sm font-semibold text-slate-900">
                                {formatCurrencyCompact(dtiBreakdown.existingDebts)}
                              </p>
                              <p className="mt-1 text-[11px] text-slate-500">Credit/validated liabilities</p>
                            </div>

                            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                              <p className="text-[11px] uppercase tracking-wide text-slate-500">Proposed Housing</p>
                              <p className="mt-1 text-sm font-semibold text-slate-900">
                                {formatCurrencyCompact(dtiBreakdown.proposedHousing)}
                              </p>
                              <p className="mt-1 text-[11px] text-slate-500">Estimated PITI/MI when not explicit</p>
                            </div>

                            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                              <p className="text-[11px] uppercase tracking-wide text-slate-500">Total Obligations</p>
                              <p className="mt-1 text-sm font-semibold text-slate-900">
                                {formatCurrencyCompact(dtiBreakdown.totalObligations)}
                              </p>
                              <p className="mt-1 text-[11px] text-slate-500">Debts + proposed housing</p>
                            </div>

                            <div className="rounded-xl border border-rose-100 bg-rose-50 p-3">
                              <p className="text-[11px] uppercase tracking-wide text-rose-600">Total DTI</p>
                              <p className="mt-1 text-sm font-semibold text-rose-700">
                                {formatPercentCompact(dtiBreakdown.totalDti)}
                              </p>
                              <p className="mt-1 text-[11px] text-rose-600">Decision uses this ratio</p>
                            </div>
                          </div>

                          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                            <p className="font-semibold">What needs to improve</p>
                            <p className="mt-1">{blockedExplanation}</p>
                            {getDtiActionEngineSummary(scan) ? (
                              <div className="mt-3 rounded-lg border border-amber-200 bg-white/70 p-3">
                                <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                                  DTI Action Engine
                                </p>
                                <p className="mt-1 text-xs leading-relaxed text-amber-950">
                                  {getDtiActionEngineExecutiveSummary(scan)}
                                </p>

                                {getDtiPerDebtStrategyRows(scan).length ? (
                                  <div className="mt-3 grid gap-2">
                                    {getDtiPerDebtStrategyRows(scan).map((row, index) => (
                                      <div
                                        key={`${row.name}-${index}`}
                                        className="rounded-md border border-amber-200 bg-amber-50/60 p-2"
                                      >
                                        <div className="flex items-start justify-between gap-3">
                                          <div>
                                            <p className="text-xs font-semibold text-amber-950">
                                              {row.step ? `${row.step}. ` : ""}
                                              {row.name}
                                            </p>
                                            <p className="mt-1 text-[11px] text-amber-900">
                                              Recommended treatment: {row.treatment}
                                            </p>

                                            <div className="mt-1 flex flex-wrap items-center gap-2">
                                              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-amber-800">
                                                {row.confidence || "review"}
                                              </span>

                                              {row.source ? (
                                                <span className="text-[10px] text-amber-700">
                                                  Source: {row.source}
                                                </span>
                                              ) : null}
                                            </div>

                                            {row.rationale ? (
                                              <p className="mt-1 text-[10px] leading-relaxed text-amber-800">
                                                {row.rationale}
                                              </p>
                                            ) : null}
                                          </div>
                                          <div className="min-w-[110px] text-right">
                                            <p className="text-xs font-semibold text-amber-950">{row.amount}</p>
                                            {row.improvement ? (
                                              <p className="mt-1 text-[11px] text-amber-800">
                                                Est. impact {row.improvement}
                                              </p>
                                            ) : null}
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                            ) : null}
                            {(typeof dtiBreakdown.reductionTo50 === "number" && dtiBreakdown.reductionTo50 > 0) ||
                            (typeof dtiBreakdown.reductionTo43 === "number" && dtiBreakdown.reductionTo43 > 0) ? (
                              <p className="mt-2">
                                Approximate monthly obligation reduction needed:{" "}
                                {typeof dtiBreakdown.reductionTo50 === "number" && dtiBreakdown.reductionTo50 > 0
                                  ? `${formatCurrencyCompact(dtiBreakdown.reductionTo50)} to reach 50% DTI`
                                  : ""}
                                {typeof dtiBreakdown.reductionTo50 === "number" &&
                                dtiBreakdown.reductionTo50 > 0 &&
                                typeof dtiBreakdown.reductionTo43 === "number" &&
                                dtiBreakdown.reductionTo43 > 0
                                  ? "; "
                                  : ""}
                                {typeof dtiBreakdown.reductionTo43 === "number" && dtiBreakdown.reductionTo43 > 0
                                  ? `${formatCurrencyCompact(dtiBreakdown.reductionTo43)} to reach 43% DTI`
                                  : ""}
                                .
                              </p>
                            ) : null}
                          </div>
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <div className="text-sm font-semibold text-slate-900">Path to Approval</div>
                              <p className="mt-1 text-xs text-slate-500">
                                Converts the underwriting finding into practical next steps for the borrower, LO, processor, or UW team.
                              </p>
                            </div>
                            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-600">
                              Advisor Layer
                            </span>
                          </div>

                          <div className="mt-4 grid gap-3 lg:grid-cols-2">
                            {approvalPath.map((item, index) => (
                              <div
                                key={`${item.title}_${index}`}
                                className={`rounded-xl border p-3 ${approvalPathToneClass(item.status)}`}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <p className="text-sm font-semibold">{item.title}</p>
                                  <span
                                    className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${approvalPathPillClass(
                                      item.status
                                    )}`}
                                  >
                                    {item.status}
                                  </span>
                                </div>
                                <p className="mt-2 text-xs leading-relaxed">{item.body}</p>
                                <div className="mt-3 rounded-lg border border-white/70 bg-white/65 p-2 text-xs leading-relaxed">
                                  <span className="font-semibold">Action: </span>
                                  {item.action}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div>
                          <div className="text-sm font-semibold mb-2">Decision Conditions</div>
                          {underwritingReport.decision.conditions?.length ? (
                            <ul className="space-y-2">
                              {underwritingReport.decision.conditions.map((c, i) => (
                                <li key={`${c}_${i}`} className="v-card p-3 text-sm">
                                  {c}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <div className="text-sm v-muted">No decision conditions returned.</div>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="v-card-soft p-4">
                      <div className="text-xs v-muted">Summary</div>
                      <div className="text-sm mt-2" style={{ color: "rgba(15,23,42,0.82)" }}>
                        {summaryExpanded
                          ? scan.summary
                          : (scan.summary || "").slice(0, 520) + ((scan.summary || "").length > 520 ? "..." : "")}
                      </div>
                      {(scan.summary || "").length > 520 && (
                        <button className="v-btn mt-2" onClick={() => setSummaryExpanded((v) => !v)}>
                          {summaryExpanded ? "Show less" : "Show more"}
                        </button>
                      )}
                    </div>

                    {!!scan.preview && (
                      <div className="v-card-soft p-4">
                        <div className="text-xs v-muted">Text preview</div>
                        <div className="text-sm mt-2" style={{ color: "rgba(15,23,42,0.82)" }}>
                          {previewExpanded ? scan.preview : scan.preview.slice(0, 800) + (scan.preview.length > 800 ? "..." : "")}
                        </div>
                        {scan.preview.length > 800 && (
                          <button className="v-btn mt-2" onClick={() => setPreviewExpanded((v) => !v)}>
                            {previewExpanded ? "Show less" : "Show more"}
                          </button>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {tab === "Conditions" && (
              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <div className="text-sm font-semibold">Underwriting conditions</div>
                    <div className="text-xs v-muted mt-1">
                      Strict enterprise mode: fields can exist in the file and still remain open until a human verifies them.
                    </div>
                  </div>
                  <button className="v-btn-primary" onClick={refreshConditions}>
                    Refresh conditions
                  </button>
                </div>

                <div className="grid md:grid-cols-3 gap-3">
                  <div className="v-card p-4">
                    <div className="text-xs v-muted">Open Conditions</div>
                    <div className="text-xl font-semibold mt-1">{openConditions.length}</div>
                  </div>
                  <div className="v-card p-4">
                    <div className="text-xs v-muted">Open High Severity</div>
                    <div className="text-xl font-semibold mt-1">{openHighConditions.length}</div>
                  </div>
                  <div className="v-card p-4">
                    <div className="text-xs v-muted">Open Med Severity</div>
                    <div className="text-xl font-semibold mt-1">{openMedConditions.length}</div>
                  </div>
                </div>

                <div className="v-card p-4 space-y-3">
                  <div className="text-sm font-semibold">Final Decision State</div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <ToneChip label={`AI Recommendation: ${displayedAiRecommendationLabel}`} tone={displayedAiRecommendationTone as any} />
                    <ToneChip label={`Workflow Gate: ${workflowGate.label}`} tone={workflowGate.tone} />
                    <ToneChip label={`Controlling Outcome: ${finalDecisionState.label}`} tone={finalDecisionState.tone} />
                  </div>
                  <div className="text-xs v-muted">{finalDecisionState.message}</div>
                </div>

                {showHardBlockUI && blockingReasons.length > 0 ? (
                  <div className="v-card p-4 space-y-3">
                    <div className="text-sm font-semibold">Blocking Drivers</div>
                    <div className="text-xs v-muted">
                      These are the exact high-severity or hard-stop findings currently blocking the file.
                    </div>
                    <div className="space-y-3">
                      {blockingReasons.map((reason, idx) => (
                        <div key={`${reason.label}_${idx}`} className="v-card-soft p-3">
                          <div className="flex items-start justify-between gap-2 flex-wrap">
                            <div className="text-sm font-semibold">{reason.label}</div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <PriorityChip p={reason.severity} />
                              <ToneChip label={reason.source} tone={reason.source === "AI Decision" ? "red" : "blue"} />
                            </div>
                          </div>
                          <div className="text-xs v-muted mt-2">{reason.evidence || "No additional evidence."}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : nonBlockingOpenConditions.length > 0 ? (
                  <div className="v-card p-4 space-y-3">
                    <div className="text-sm font-semibold">Key Open Conditions</div>
                    <div className="text-xs v-muted">
                      These items still need to be cleared before final approval, but they are not hard blockers.
                    </div>
                    <div className="space-y-3">
                      {nonBlockingOpenConditions.slice(0, 5).map((condition) => (
                        <div key={condition.id} className="v-card-soft p-3">
                          <div className="flex items-start justify-between gap-2 flex-wrap">
                            <div className="text-sm font-semibold">{condition.label}</div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <PriorityChip p={condition.severity} />
                              <ToneChip label={sourceLabel(condition.source)} tone={sourceTone(condition.source)} />
                            </div>
                          </div>
                          <div className="text-xs v-muted mt-2">{condition.evidence || "Open underwriting condition."}</div>
                        </div>
                      ))}
                      {nonBlockingOpenConditions.length > 3 ? (
                        <ToneChip label={`+ more`} tone="gray" />
                      ) : null}
                    </div>
                  </div>
                ) : null}

                <div className="v-card-soft p-4 space-y-3">
                  <div className="text-sm font-semibold">Add manual condition</div>
                  <div className="grid md:grid-cols-2 gap-3">
                    <div className="md:col-span-2">
                      <div className="text-xs v-muted mb-1">Condition label</div>
                      <input
                        className="w-full border rounded-xl p-2 bg-white text-sm"
                        style={{ borderColor: "rgba(15,23,42,0.10)" }}
                        value={manualLabel}
                        onChange={(e) => setManualLabel(e.target.value)}
                        placeholder="Example: Obtain updated VOE before final approval"
                      />
                    </div>
                    <div>
                      <div className="text-xs v-muted mb-1">Severity</div>
                      <select
                        className="w-full border rounded-xl p-2 bg-white text-sm"
                        style={{ borderColor: "rgba(15,23,42,0.10)" }}
                        value={manualSeverity}
                        onChange={(e) => setManualSeverity(e.target.value as "low" | "med" | "high")}
                      >
                        <option value="low">Low</option>
                        <option value="med">Med</option>
                        <option value="high">High</option>
                      </select>
                    </div>
                    <div>
                      <div className="text-xs v-muted mb-1">Evidence / note</div>
                      <input
                        className="w-full border rounded-xl p-2 bg-white text-sm"
                        style={{ borderColor: "rgba(15,23,42,0.10)" }}
                        value={manualEvidence}
                        onChange={(e) => setManualEvidence(e.target.value)}
                        placeholder="Optional explanation"
                      />
                    </div>
                  </div>
                  <div>
                    <button className="v-btn-primary" onClick={addManualCondition}>
                      Add manual condition
                    </button>
                  </div>
                </div>

                {uwConditions.length === 0 ? (
                  <div className="text-sm v-muted">
                    No UW conditions yet. Click <span className="font-semibold">Refresh conditions</span> or add a manual condition.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {uwConditions.map((c) => (
                      <div key={c.id} className="v-card-soft p-4">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div>
                            <div className="text-sm font-semibold">{c.label}</div>
                            <div className="text-xs v-muted mt-1">{c.evidence || "No evidence provided."}</div>
                            <div className="text-xs v-muted mt-2">
                              Created: {fmtDateTimeFromMs(c.createdAtMs)} | Updated: {fmtDateTimeFromMs(c.updatedAtMs)}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <PriorityChip p={c.severity} />
                            <ToneChip label={sourceLabel(c.source)} tone={sourceTone(c.source)} />
                            <ToneChip label={c.status === "done" ? "Done" : "Open"} tone={c.status === "done" ? "green" : "blue"} />
                          </div>
                        </div>
                        <div className="mt-3 flex items-center gap-2 flex-wrap">
                          <button className="v-btn" onClick={() => toggleCondition(c.id)}>
                            {c.status === "done" ? "Mark open" : "Mark done"}
                          </button>
                          {c.source === "manual" ? (
                            <button className="v-btn" onClick={() => removeManualCondition(c.id)}>
                              Remove
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {tab === "Docs" && (
              <div className="mt-4 space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void handleUpload(file);
                    }}
                  />
                  <button className="v-btn-primary" onClick={() => fileInputRef.current?.click()} disabled={uploading || scanning}>
                    {uploading ? `Uploading ${uploadPct}%` : "Upload document"}
                  </button>
                  <button className="v-btn" onClick={deleteAllDocs} disabled={storedDocs.length === 0 || uploading || scanning}>
                    Delete all docs
                  </button>
                </div>

                {storedDocs.length === 0 ? (
                  <div className="text-sm v-muted">No uploaded documents yet.</div>
                ) : (
                  <div className="space-y-3">
                    {storedDocs.map((d) => (
                      <div key={d.path} className="v-card-soft p-4">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div>
                            <div className="text-sm font-semibold">{d.name}</div>
                            <div className="text-xs v-muted mt-1">{fmtDateTimeFromMs(d.uploadedAtMs)}</div>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <a className="v-btn" href={d.url} target="_blank" rel="noreferrer">
                              Open
                            </a>
                            <button className="v-btn" onClick={() => deleteOneDoc(d)}>
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <div className="v-card p-5">
            <div className="text-sm font-semibold">Snapshot</div>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="v-muted">Borrower</span>
                <span className="font-medium text-right">{borrowerDisplay}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="v-muted">Email</span>
                <span className="font-medium text-right break-all">{emailDisplay}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="v-muted">Loan</span>
                <span className="font-medium">{formatMoney(loanDisplay)}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="v-muted">Loan #</span>
                <span className="font-medium text-right break-all">{loanNumberDisplay}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="v-muted">Docs</span>
                <span className="font-medium">{storedDocs.length}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="v-muted">UW Conditions</span>
                <span className="font-medium">{openConditions.length}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="v-muted">AI Recommendation</span>
                <span className="font-medium">{displayedAiRecommendationLabel}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="v-muted">Workflow Gate</span>
                <span
                  className={`font-medium ${
                    workflowGate.tone === "green"
                      ? "text-green-600"
                      : workflowGate.tone === "red"
                      ? "text-red-600"
                      : "text-amber-600"
                  }`}
                >
                  {workflowGate.label}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="v-muted">Final Decision</span>
                <span
                  className={`font-medium ${
                    finalDecisionState.tone === "green"
                      ? "text-green-600"
                      : finalDecisionState.tone === "red"
                      ? "text-red-600"
                      : "text-amber-600"
                  }`}
                >
                  {finalDecisionState.label}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="v-muted">Blocking Drivers</span>
                <span className="font-medium">{showHardBlockUI ? blockingReasons.length : 0}</span>
              </div>
            </div>
          </div>

          {scan?.ai && (
            <div className="v-card p-5">
              <div className="text-sm font-semibold">AI Decision</div>
              <div className="mt-3 space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <ToneChip label={aiDecisionChipLabel} tone={aiDecisionChipTone as any} />
                  <ToneChip label={aiRiskChipLabel} tone={aiRiskChipTone as any} />
                  <ToneChip label={`Final: ${operationalDecisionLabel}`} tone={operationalDecisionTone} />
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="v-card-soft p-3">
                    <div className="text-xs v-muted">Score</div>
                    <div className="font-semibold mt-1">{scan.ai.score ?? "-"}</div>
                  </div>
                  <div className="v-card-soft p-3">
                    <div className="text-xs v-muted">Confidence</div>
                    <div className="font-semibold mt-1">{formatConfidence(scan.ai.confidence)}</div>
                  </div>
                  <div className="v-card-soft p-3">
                    <div className="text-xs v-muted">DTI</div>
                    <div className="font-semibold mt-1">{formatPercent(scan.ai.dti)}</div>
                  </div>
                  <div className="v-card-soft p-3">
                    <div className="text-xs v-muted">LTV</div>
                    <div className="font-semibold mt-1">{formatPercent(scan.ai.ltv)}</div>
                  </div>
                </div>

                <div>
                  <div className="text-xs v-muted">Reason</div>
                  <div className="text-sm mt-1" style={{ color: "rgba(15,23,42,0.82)" }}>
                    {scan.ai.reason || "-"}
                  </div>
                </div>

                {showHardBlockUI && controllingRedFlags.length > 0 ? (
                  <div>
                    <div className="text-xs v-muted">Blocking Drivers</div>
                    <div className="mt-2 flex items-center gap-2 flex-wrap">
                      {controllingRedFlags.map((flag, i) => (
                        <ToneChip key={`${flag}_${i}`} label={flag} tone="red" />
                      ))}
                    </div>
                  </div>
                ) : nonBlockingOpenConditions.length > 0 ? (
                  <div>
                    <div className="text-xs v-muted">Condition Summary</div>
                    <div className="mt-2 flex items-center gap-2 flex-wrap">
                      {nonBlockingOpenConditions.slice(0, 3).map((condition) => (
                        <ToneChip
                          key={condition.id}
                          label={condition.label}
                          tone={condition.severity === "med" ? "amber" : "gray"}
                        />
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="text-xs v-muted">{finalDecisionState.message}</div>
              </div>
            </div>
          )}

          {showHardBlockUI && blockingReasons.length > 0 ? (
            <div className="v-card p-5">
              <div className="text-sm font-semibold">Red Flags</div>
              <div className="text-xs v-muted mt-1">
                These are the exact high-severity or hard-stop drivers currently controlling the file outcome.
              </div>
              <div className="mt-3 space-y-3">
                {blockingReasons.map((reason, i) => (
                  <div key={`${reason.label}_${i}`} className="v-card-soft p-3">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="text-sm font-semibold">{reason.label}</div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <PriorityChip p={reason.severity} />
                        <ToneChip label={reason.source} tone={reason.source === "AI Decision" ? "red" : "blue"} />
                      </div>
                    </div>
                    <div className="text-xs v-muted mt-2">{reason.evidence || "No additional evidence."}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : nonBlockingOpenConditions.length > 0 ? (
            <div className="v-card p-5">
              <div className="text-sm font-semibold">Key Conditions</div>
              <div className="text-xs v-muted mt-1">
                These open conditions must be cleared before final approval, but they are not hard-block red flags.
              </div>
              <div className="mt-3 space-y-3">
                {nonBlockingOpenConditions.slice(0, 5).map((condition) => (
                  <div key={condition.id} className="v-card-soft p-3">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="text-sm font-semibold">{condition.label}</div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <PriorityChip p={condition.severity} />
                        <ToneChip label={sourceLabel(condition.source)} tone={sourceTone(condition.source)} />
                      </div>
                    </div>
                    <div className="text-xs v-muted mt-2">{condition.evidence || "Open underwriting condition."}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}