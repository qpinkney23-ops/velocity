export const CANONICAL_CALCULATION_VERSION = "mortgage_math_v1" as const;

export const CANONICAL_PRECISION = {
  currencyDecimalPlaces: 2,
  ratioDecimalPlaces: 2,
  percentageDisplayDecimalPlaces: 2,
  creditScoreDecimalPlaces: 0,
} as const;

export const CANONICAL_ROUNDING_POLICY = {
  method: "half_away_from_zero",
  intermediate: "preserve",
  currency: "round_at_currency_output_to_2_decimals",
  ratio: "round_at_ratio_output_to_2_decimals_when_formula_requires_legacy_boundary",
  percentageDisplay: "derive_from_authoritative_ratio_and_round_to_2_decimals",
} as const;

export type CalculationUnit =
  | "currency"
  | "annual_currency"
  | "monthly_currency"
  | "ratio"
  | "credit_score"
  | "count"
  | "annual_rate"
  | "years";

export type CalculationEvidenceSource = {
  evidenceRef?: string;
  documentName?: string;
  documentType?: string;
  extractedField?: string;
  value?: number | null;
  status: "used" | "ignored" | "missing";
  reason: string;
  manualOverrideApplied?: boolean;
  estimated?: boolean;
};

export type CalculationInput = {
  key: string;
  label: string;
  value: number | null;
  unit: CalculationUnit;
  evidenceSources: CalculationEvidenceSource[];
  included: boolean;
  inclusionReason?: string;
  exclusionReason?: string;
  manualOverrideApplied: boolean;
  estimated: boolean;
  missing: boolean;
};

export type CalculationContext = {
  timestamp: string;
  programContext?: string | null;
  overlayContext?: string | null;
  confidenceSource?: string;
};

export type CanonicalCalculation<T extends number | null = number | null> = {
  calculationName: string;
  formulaName: string;
  inputs: CalculationInput[];
  units: CalculationUnit;
  evidenceSources: CalculationEvidenceSource[];
  inclusionRules: string[];
  exclusionRules: string[];
  precision: typeof CANONICAL_PRECISION;
  roundingPolicy: typeof CANONICAL_ROUNDING_POLICY;
  calculationVersion: typeof CANONICAL_CALCULATION_VERSION;
  timestamp: string;
  result: T;
  confidenceSource: string;
  programContext: string | null;
  overlayContext: string | null;
  explanation: {
    summary: string;
    formula: string;
    includedInputs: string[];
    excludedInputs: string[];
    evidenceSources: string[];
  };
  reproductionMetadata: {
    engine: "canonical_mortgage_mathematics";
    formulaName: string;
    calculationVersion: typeof CANONICAL_CALCULATION_VERSION;
    authoritativeInputValues: Record<string, number | null>;
    programContext: string | null;
    overlayContext: string | null;
  };
};

export type CanonicalCalculationSet = {
  monthlyQualifyingIncome: CanonicalCalculation;
  monthlyLiabilities: CanonicalCalculation;
  pitia: CanonicalCalculation;
  housingRatio: CanonicalCalculation;
  backEndDti: CanonicalCalculation;
  ltv: CanonicalCalculation;
  creditScoreSelection: CanonicalCalculation;
};

function roundHalfAwayFromZero(value: number, decimalPlaces: number): number {
  const factor = 10 ** decimalPlaces;
  return Math.sign(value) * Math.round((Math.abs(value) + Number.EPSILON) * factor) / factor;
}

export function roundCurrency(value: number): number {
  return roundHalfAwayFromZero(value, CANONICAL_PRECISION.currencyDecimalPlaces);
}

export function roundRatio(value: number): number {
  return roundHalfAwayFromZero(value, CANONICAL_PRECISION.ratioDecimalPlaces);
}

export function ratioToDisplayPercent(value: number): number {
  return roundHalfAwayFromZero(value * 100, CANONICAL_PRECISION.percentageDisplayDecimalPlaces);
}

export function calculationInput(args: Omit<CalculationInput, "manualOverrideApplied" | "estimated" | "missing"> & Partial<Pick<CalculationInput, "manualOverrideApplied" | "estimated" | "missing">>): CalculationInput {
  return {
    ...args,
    manualOverrideApplied: args.manualOverrideApplied ?? false,
    estimated: args.estimated ?? false,
    missing: args.missing ?? args.value === null,
  };
}

function buildCalculation(args: {
  calculationName: string;
  formulaName: string;
  formula: string;
  inputs: CalculationInput[];
  units: CalculationUnit;
  inclusionRules: string[];
  exclusionRules: string[];
  result: number | null;
  context: CalculationContext;
  summary: string;
}): CanonicalCalculation {
  const evidenceSources = args.inputs.flatMap((input) => input.evidenceSources);
  const programContext = args.context.programContext ?? null;
  const overlayContext = args.context.overlayContext ?? null;

  return {
    calculationName: args.calculationName,
    formulaName: args.formulaName,
    inputs: args.inputs,
    units: args.units,
    evidenceSources,
    inclusionRules: args.inclusionRules,
    exclusionRules: args.exclusionRules,
    precision: CANONICAL_PRECISION,
    roundingPolicy: CANONICAL_ROUNDING_POLICY,
    calculationVersion: CANONICAL_CALCULATION_VERSION,
    timestamp: args.context.timestamp,
    result: args.result,
    confidenceSource: args.context.confidenceSource ?? "input_completeness_and_provenance",
    programContext,
    overlayContext,
    explanation: {
      summary: args.summary,
      formula: args.formula,
      includedInputs: args.inputs.filter((input) => input.included).map((input) => input.label),
      excludedInputs: args.inputs.filter((input) => !input.included).map((input) => `${input.label}: ${input.exclusionReason ?? "excluded"}`),
      evidenceSources: evidenceSources.map((source) => source.documentName ?? source.evidenceRef ?? source.extractedField ?? "unspecified source"),
    },
    reproductionMetadata: {
      engine: "canonical_mortgage_mathematics",
      formulaName: args.formulaName,
      calculationVersion: CANONICAL_CALCULATION_VERSION,
      authoritativeInputValues: Object.fromEntries(args.inputs.map((input) => [input.key, input.value])),
      programContext,
      overlayContext,
    },
  };
}

export function calculateMonthlyQualifyingIncome(annualIncome: CalculationInput, context: CalculationContext): CanonicalCalculation {
  const result = annualIncome.value !== null && annualIncome.value > 0 ? annualIncome.value / 12 : null;
  return buildCalculation({
    calculationName: "Monthly Qualifying Income",
    formulaName: "annual_qualifying_income_divided_by_12",
    formula: "annual qualifying income / 12",
    inputs: [annualIncome],
    units: "monthly_currency",
    inclusionRules: ["Use the selected annual qualifying income when it is positive."],
    exclusionRules: ["Return missing when selected annual qualifying income is absent or non-positive."],
    result,
    context,
    summary: result === null ? "Monthly qualifying income is unavailable." : `Monthly qualifying income is ${result}.`,
  });
}

export function calculateMonthlyLiabilities(inputs: CalculationInput[], context: CalculationContext): CanonicalCalculation {
  const included = inputs.filter((input) => input.included && input.value !== null && Number.isFinite(input.value));
  const result = included.length ? roundCurrency(included.reduce((sum, input) => sum + (input.value ?? 0), 0)) : null;
  return buildCalculation({
    calculationName: "Monthly Liabilities",
    formulaName: "sum_included_monthly_liabilities",
    formula: "sum(included monthly liability payments)",
    inputs,
    units: "monthly_currency",
    inclusionRules: ["Include only obligations selected by the existing liability source and treatment rules."],
    exclusionRules: ["Exclude obligations marked excluded; preserve the exclusion reason and evidence."],
    result,
    context,
    summary: result === null ? "Monthly liabilities are unavailable." : `Included monthly liabilities total ${result}.`,
  });
}

export function calculateDebtToIncomeRatio(args: {
  calculationName: "Housing Ratio" | "Back-End DTI" | "Consumer Debt Ratio";
  monthlyIncome: CalculationInput;
  obligations: CalculationInput[];
  context: CalculationContext;
}): CanonicalCalculation {
  const included = args.obligations.filter((input) => input.included && input.value !== null);
  const obligations = included.reduce((sum, input) => sum + (input.value ?? 0), 0);
  const validIncome = args.monthlyIncome.value !== null && args.monthlyIncome.value > 0;
  const result = validIncome && obligations > 0 ? roundRatio(obligations / (args.monthlyIncome.value as number)) : null;
  const formulaName = args.calculationName === "Housing Ratio" ? "monthly_pitia_divided_by_monthly_qualifying_income" : args.calculationName === "Back-End DTI" ? "total_monthly_obligations_divided_by_monthly_qualifying_income" : "monthly_liabilities_divided_by_monthly_qualifying_income";
  return buildCalculation({
    calculationName: args.calculationName,
    formulaName,
    formula: "sum(included monthly obligations) / monthly qualifying income",
    inputs: [args.monthlyIncome, ...args.obligations],
    units: "ratio",
    inclusionRules: ["Use positive monthly qualifying income and included monthly obligations."],
    exclusionRules: ["Return missing when income is absent/non-positive or no positive obligation is available."],
    result,
    context: args.context,
    summary: result === null ? `${args.calculationName} is unavailable.` : `${args.calculationName} is ${ratioToDisplayPercent(result)}%.`,
  });
}

export function calculateLtv(loanAmount: CalculationInput, propertyValue: CalculationInput, context: CalculationContext): CanonicalCalculation {
  const result = loanAmount.value !== null && loanAmount.value > 0 && propertyValue.value !== null && propertyValue.value > 0 ? loanAmount.value / propertyValue.value : null;
  return buildCalculation({
    calculationName: "LTV",
    formulaName: "loan_amount_divided_by_property_value",
    formula: "loan amount / property value",
    inputs: [loanAmount, propertyValue],
    units: "ratio",
    inclusionRules: ["Use positive selected loan amount and property value."],
    exclusionRules: ["Return missing when either authoritative input is absent or non-positive."],
    result,
    context,
    summary: result === null ? "LTV is unavailable." : `LTV is ${ratioToDisplayPercent(result)}%.`,
  });
}

export function selectRepresentativeCreditScore(scoreInputs: CalculationInput[], context: CalculationContext): CanonicalCalculation {
  const scores = Array.from(new Set(scoreInputs.filter((input) => input.included && input.value !== null && input.value >= 300 && input.value <= 850).map((input) => Math.round(input.value as number)))).sort((a, b) => a - b);
  const result = scores.length >= 3 ? scores[Math.floor(scores.length / 2)] : scores.length === 2 ? Math.min(...scores) : scores[0] ?? null;
  return buildCalculation({
    calculationName: "Credit Score Selection",
    formulaName: "representative_mortgage_credit_score_selection",
    formula: "middle sorted unique score when 3+; lower score when 2; available score when 1",
    inputs: scoreInputs,
    units: "credit_score",
    inclusionRules: ["Include unique integer scores from 300 through 850 selected by existing document parsing rules."],
    exclusionRules: ["Exclude missing, duplicate, non-finite, and out-of-range values."],
    result,
    context,
    summary: result === null ? "Representative credit score is unavailable." : `Representative credit score is ${result}.`,
  });
}

export function calculateEstimatedPitia(args: {
  loanAmount: CalculationInput;
  propertyValue: CalculationInput;
  ltv: CalculationInput;
  annualInterestRate: CalculationInput;
  termYears: CalculationInput;
  annualTaxRate: CalculationInput;
  annualInsuranceAmount?: CalculationInput;
  annualInsuranceRate?: CalculationInput;
  annualMiRate: CalculationInput;
  hoa: CalculationInput;
  authoritativeTotal?: CalculationInput;
  context: CalculationContext;
}): CanonicalCalculation & { components: { principalAndInterest: number | null; taxes: number | null; insurance: number | null; mortgageInsurance: number | null; hoa: number | null } } {
  const loan = args.loanAmount.value;
  const value = args.propertyValue.value;
  const rate = args.annualInterestRate.value;
  const years = args.termYears.value;
  let principalAndInterest: number | null = null;
  if (loan !== null && loan > 0 && years !== null && years > 0 && rate !== null) {
    const months = years * 12;
    const monthlyRate = rate / 12;
    principalAndInterest = monthlyRate > 0 ? roundCurrency(loan * ((monthlyRate * (1 + monthlyRate) ** months) / ((1 + monthlyRate) ** months - 1))) : roundCurrency(loan / months);
  }
  const taxes = value !== null && value > 0 && args.annualTaxRate.value !== null ? roundCurrency((value * args.annualTaxRate.value) / 12) : null;
  const insurance = args.annualInsuranceAmount?.value !== null && args.annualInsuranceAmount?.value !== undefined ? roundCurrency(args.annualInsuranceAmount.value / 12) : value !== null && value > 0 && args.annualInsuranceRate?.value !== null && args.annualInsuranceRate?.value !== undefined ? roundCurrency((value * args.annualInsuranceRate.value) / 12) : null;
  const mortgageInsurance = loan !== null && loan > 0 && args.annualMiRate.value !== null ? roundCurrency((loan * args.annualMiRate.value) / 12) : 0;
  const hoa = args.hoa.value === null ? 0 : roundCurrency(args.hoa.value);
  const estimatedTotal = principalAndInterest === null ? null : roundCurrency(principalAndInterest + (taxes ?? 0) + (insurance ?? 0) + mortgageInsurance + hoa);
  const result = args.authoritativeTotal?.value !== null && args.authoritativeTotal?.value !== undefined && args.authoritativeTotal.value > 0 ? roundCurrency(args.authoritativeTotal.value) : estimatedTotal;
  const inputs = [args.loanAmount, args.propertyValue, args.ltv, args.annualInterestRate, args.termYears, args.annualTaxRate, ...(args.annualInsuranceAmount ? [args.annualInsuranceAmount] : []), ...(args.annualInsuranceRate ? [args.annualInsuranceRate] : []), args.annualMiRate, args.hoa, ...(args.authoritativeTotal ? [args.authoritativeTotal] : [])];
  return {
    ...buildCalculation({
      calculationName: "PITIA",
      formulaName: "monthly_principal_interest_taxes_insurance_mi_hoa",
      formula: "P&I amortization + monthly taxes + monthly insurance + monthly MI + HOA",
      inputs,
      units: "monthly_currency",
      inclusionRules: ["Use the authoritative total when supplied; otherwise sum the configured estimated components."],
      exclusionRules: ["Missing optional estimated components contribute zero but remain visibly missing or estimated."],
      result,
      context: args.context,
      summary: result === null ? "PITIA is unavailable." : `Monthly PITIA is ${result}.`,
    }),
    components: { principalAndInterest, taxes, insurance, mortgageInsurance, hoa },
  };
}
