import { AnalysisResult } from "./analyzeApplication";


export type HousingPaymentBreakdown = {
  principalAndInterest: number | null;
  taxes: number | null;
  insurance: number | null;
  mortgageInsurance: number | null;
  hoa: number | null;
  total: number | null;
  estimatedRate: number | null;
  assumptionSource: "estimated" | "extracted" | "mixed";
  confidence: "low" | "medium" | "high";
};

export type WorkflowReadinessReport = {
  readinessScore: number;
  readinessLabel: string;
  workflowRisk: string;
  estimatedCloseability: string;
  unresolvedBlockingConditions: number;
  unresolvedConditions: number;
  borrowerActionCount: number;
  processorActionCount: number;
  underwriterActionCount: number;
  topBlockingReasons: string[];
  nextBestActions: string[];
};

export type CanonicalWorkflowReportCondition = {
  id: string;
  title: string;
  category: string;
  severity: string;
  blocking: boolean;
  owner: string;
  resolutionStrategy: string;
  borrowerVisible: boolean;
  autoClearEligible: boolean;
  requiredActions: string[];
  requiredDocuments: string[];
};

export type UnderwritingReport = {
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
    ltv: number | null;
  };
  financials: {
    income: number;
    debts: number | null;
    dti: number | null;
    consumerDebtRatio?: number | null;
    totalDti?: number | null;
    proposedHousingPayment?: number | null;
    housingPaymentBreakdown?: HousingPaymentBreakdown;
    assets: number;
  };
  decision: {
    reason: string;
    conditions: string[];
    conditionSummary?: string;
  };

  workflow?: {
    readiness: WorkflowReadinessReport;
    canonicalConditions: CanonicalWorkflowReportCondition[];
  };

  factors: {
    key?: string;
    label: string;
    impact: string;
    summary: string;
    source?: string;
    value?: number | string | null;
  }[];
};

function safeNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function safeOptionalNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function safePercent(value: unknown): number | null {
  const n = typeof value === "number" && Number.isFinite(value) ? value : null;
  if (n === null) return null;
  return Math.round(n * 10000) / 100;
}

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function upperLabel(value: unknown): string {
  const s = cleanString(value);
  return s ? s.toUpperCase() : "-";
}

function normalizeReason(analysis: AnalysisResult): string {
  const reason = cleanString((analysis as any)?.reason);
  if (reason) return reason;

  const decisionReason = cleanString((analysis as any)?.decision?.reason);
  if (decisionReason) return decisionReason;

  return "No underwriting reason provided.";
}

function normalizeConditions(analysis: AnalysisResult): string[] {
  const raw = (analysis as any)?.conditions;
  if (!Array.isArray(raw)) return [];

  return raw
    .map((item: any) => {
      if (typeof item === "string") return item.trim();
      if (item && typeof item.label === "string") return item.label.trim();
      return "";
    })
    .filter(Boolean);
}

function normalizeFactors(analysis: AnalysisResult) {
  const raw = Array.isArray((analysis as any)?.factors) ? (analysis as any).factors : [];

  return raw.map((factor: any) => ({
    ...(cleanString(factor?.key) ? { key: cleanString(factor.key) } : {}),
    label: cleanString(factor?.label) || cleanString(factor?.key) || "Factor",
    impact: cleanString(factor?.impact) || "neutral",
    summary: cleanString(factor?.summary) || "No factor summary provided.",
    ...(cleanString(factor?.source) ? { source: cleanString(factor.source) } : {}),
    ...(typeof factor?.value === "number" || typeof factor?.value === "string" || factor?.value === null
      ? { value: factor.value }
      : {}),
  }));
}

function getNumericFactorValue(analysis: AnalysisResult, keys: string[]): number | null {
  const normalizedKeys = keys.map((k) => k.toLowerCase());
  const factors = Array.isArray((analysis as any)?.factors) ? (analysis as any).factors : [];

  const factor = factors.find((item: any) => {
    const key = cleanString(item?.key).toLowerCase();
    const label = cleanString(item?.label).toLowerCase();
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

function getReportDti(analysis: AnalysisResult, inputDti?: number) {
  if (typeof inputDti === "number" && Number.isFinite(inputDti)) return inputDti;

  const totalDti = getNumericFactorValue(analysis, ["total_dti", "total dti"]);
  if (totalDti !== null) return totalDti;

  if (typeof (analysis as any)?.dti === "number") return (analysis as any).dti;
  if (typeof (analysis as any)?.normalized?.dti === "number") return (analysis as any).normalized.dti;

  return null;
}

function getConsumerDebtRatio(analysis: AnalysisResult, reportDti: number | null) {
  const normalizedDti =
    typeof (analysis as any)?.normalized?.dti === "number"
      ? (analysis as any).normalized.dti
      : null;

  if (normalizedDti !== null && normalizedDti !== reportDti) return normalizedDti;

  const consumer = getNumericFactorValue(analysis, ["consumer_debt_ratio", "consumer debt ratio"]);
  return consumer;
}

function getProposedHousingPayment(analysis: AnalysisResult) {
  return getNumericFactorValue(analysis, ["proposed_housing_payment", "proposed housing payment"]);
}


function roundMoney(value: number | null): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.round(value * 100) / 100;
}

function buildHousingPaymentBreakdown(
  analysis: AnalysisResult,
  loanAmount: number,
  propertyValue: number
): HousingPaymentBreakdown {
  const extractedHousingPayment = getProposedHousingPayment(analysis);

  const estimatedRate = 0.0675;
  const estimatedTaxesRate = 0.018;
  const estimatedInsuranceAnnual = 1800;

  const estimatedPi =
    loanAmount > 0
      ? (loanAmount * ((estimatedRate / 12) * Math.pow(1 + estimatedRate / 12, 360))) /
        (Math.pow(1 + estimatedRate / 12, 360) - 1)
      : 0;

  const estimatedTaxes =
    propertyValue > 0 ? (propertyValue * estimatedTaxesRate) / 12 : 0;

  const estimatedInsurance = estimatedInsuranceAnnual / 12;

  const ltv =
    propertyValue > 0 && loanAmount > 0
      ? loanAmount / propertyValue
      : 0;

  const estimatedMi =
    ltv > 0.8 ? (loanAmount * 0.0085) / 12 : 0;

  const estimatedHoa = 0;

  const estimatedTotal =
    estimatedPi +
    estimatedTaxes +
    estimatedInsurance +
    estimatedMi +
    estimatedHoa;

  const finalTotal =
    extractedHousingPayment && extractedHousingPayment > 0
      ? extractedHousingPayment
      : estimatedTotal;

  return {
    principalAndInterest: roundMoney(estimatedPi),
    taxes: roundMoney(estimatedTaxes),
    insurance: roundMoney(estimatedInsurance),
    mortgageInsurance: roundMoney(estimatedMi),
    hoa: roundMoney(estimatedHoa),
    total: roundMoney(finalTotal),
    estimatedRate,
    assumptionSource:
      extractedHousingPayment && extractedHousingPayment > 0
        ? "mixed"
        : "estimated",
    confidence:
      extractedHousingPayment && extractedHousingPayment > 0
        ? "medium"
        : "low",
  };
}

function conditionSummaryText(conditions: string[], dti: number | null) {
  if (!conditions.length) return "";

  const hasHighRiskDti =
    typeof dti === "number" &&
    Number.isFinite(dti) &&
    dti >= 0.43;

  if (hasHighRiskDti) {
    return "These conditions and DTI findings require underwriting review before final approval. Total DTI includes existing monthly liabilities plus proposed housing payment when available.";
  }

  return "These conditions must be reviewed and cleared before final approval.";
}

function normalizeWorkflowReadiness(analysis: AnalysisResult): WorkflowReadinessReport {
  const readiness = (analysis as any)?.readiness || {};

  return {
    readinessScore:
      typeof readiness?.readinessScore === "number"
        ? readiness.readinessScore
        : 0,

    readinessLabel:
      cleanString(readiness?.readinessLabel) || "not_ready",

    workflowRisk:
      cleanString(readiness?.workflowRisk) || "high",

    estimatedCloseability:
      cleanString(readiness?.estimatedCloseability) || "low",

    unresolvedBlockingConditions:
      typeof readiness?.unresolvedBlockingConditions === "number"
        ? readiness.unresolvedBlockingConditions
        : 0,

    unresolvedConditions:
      typeof readiness?.unresolvedConditions === "number"
        ? readiness.unresolvedConditions
        : 0,

    borrowerActionCount:
      typeof readiness?.borrowerActionCount === "number"
        ? readiness.borrowerActionCount
        : 0,

    processorActionCount:
      typeof readiness?.processorActionCount === "number"
        ? readiness.processorActionCount
        : 0,

    underwriterActionCount:
      typeof readiness?.underwriterActionCount === "number"
        ? readiness.underwriterActionCount
        : 0,

    topBlockingReasons: Array.isArray(readiness?.topBlockingReasons)
      ? readiness.topBlockingReasons.filter(Boolean)
      : [],

    nextBestActions: Array.isArray(readiness?.nextBestActions)
      ? readiness.nextBestActions.filter(Boolean)
      : [],
  };
}

function normalizeCanonicalWorkflowConditions(
  analysis: AnalysisResult
): CanonicalWorkflowReportCondition[] {
  const canonical = Array.isArray((analysis as any)?.canonicalConditions)
    ? (analysis as any).canonicalConditions
    : [];

  return canonical.map((condition: any) => ({
    id: cleanString(condition?.id),
    title:
      cleanString(condition?.title) ||
      cleanString(condition?.label) ||
      "Workflow Condition",

    category:
      cleanString(condition?.category) || "underwriting",

    severity:
      cleanString(condition?.severity) || "med",

    blocking: !!condition?.blocking,

    owner:
      cleanString(condition?.owner) || "system",

    resolutionStrategy:
      cleanString(condition?.resolutionStrategy) ||
      "manual_underwriter_review",

    borrowerVisible: !!condition?.borrowerVisible,

    autoClearEligible: !!condition?.autoClearEligible,

    requiredActions: Array.isArray(condition?.requiredActions)
      ? condition.requiredActions.filter(Boolean)
      : [],

    requiredDocuments: Array.isArray(condition?.requiredDocuments)
      ? condition.requiredDocuments.filter(Boolean)
      : [],
  }));
}

export function buildUnderwritingReport(
  analysis: AnalysisResult,
  input: {
    borrower?: string;
    email?: string;
    loanNumber?: string;
    loanAmount?: number;
    propertyValue?: number;
    income?: number;
    debts?: number;
    assets?: number;
    dti?: number;
  }
): UnderwritingReport {
  const verdict =
    cleanString((analysis as any)?.verdict) ||
    cleanString((analysis as any)?.decision?.state);

  const risk =
    cleanString((analysis as any)?.risk) ||
    cleanString((analysis as any)?.decision?.risk);

  const score =
    typeof (analysis as any)?.score === "number"
      ? (analysis as any).score
      : safeNumber((analysis as any)?.decision?.score);

  const confidence =
    typeof (analysis as any)?.confidence === "number"
      ? (analysis as any).confidence
      : safeNumber((analysis as any)?.decision?.confidence);

  const dti = getReportDti(analysis, input.dti);
  const consumerDebtRatio = getConsumerDebtRatio(analysis, dti);
  const proposedHousingPayment = getProposedHousingPayment(analysis);

  const ltv =
    typeof (analysis as any)?.ltv === "number"
      ? (analysis as any).ltv
      : typeof (analysis as any)?.normalized?.ltv === "number"
      ? (analysis as any).normalized.ltv
      : null;

  const debts =
    typeof input.debts === "number" && Number.isFinite(input.debts) && input.debts > 0
      ? input.debts
      : null;

  const conditions = normalizeConditions(analysis);

  const workflowReadiness = normalizeWorkflowReadiness(analysis);

  const canonicalWorkflowConditions =
    normalizeCanonicalWorkflowConditions(analysis);

  const housingPaymentBreakdown = buildHousingPaymentBreakdown(
    analysis,
    safeNumber(input.loanAmount),
    safeNumber(input.propertyValue)
  );

  return {
    summary: {
      decision: upperLabel(verdict),
      risk: upperLabel(risk),
      score: safeNumber(score),
      confidence: safeNumber(confidence),
    },

    borrower: {
      name: cleanString(input.borrower),
      email: cleanString(input.email),
      loanNumber:
        cleanString(input.loanNumber) ||
        cleanString((analysis as any)?.normalized?.loanNumber) ||
        cleanString((analysis as any)?.loanNumber),
    },

    loan: {
      loanAmount: safeNumber(input.loanAmount),
      propertyValue: safeNumber(input.propertyValue),
      ltv: safePercent(ltv),
    },

    financials: {
      income: safeNumber(input.income),
      debts,
      dti: safePercent(dti),
      consumerDebtRatio: safePercent(consumerDebtRatio),
      totalDti: safePercent(dti),
      proposedHousingPayment: safeOptionalNumber(proposedHousingPayment),
      housingPaymentBreakdown,
      assets: safeNumber(input.assets),
    },

    decision: {
      reason: normalizeReason(analysis),
      conditions,
      conditionSummary: conditionSummaryText(conditions, dti),
    },

    workflow: {
      readiness: workflowReadiness,
      canonicalConditions: canonicalWorkflowConditions,
    },

    factors: normalizeFactors(analysis),
  };
}
