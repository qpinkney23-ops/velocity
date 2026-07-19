import assert from "node:assert/strict";
import {
  CANONICAL_CALCULATION_VERSION,
  calculateDebtToIncomeRatio,
  calculateEstimatedPitia,
  calculateLtv,
  calculateMonthlyLiabilities,
  calculateMonthlyQualifyingIncome,
  calculationInput,
  selectRepresentativeCreditScore,
} from "../lib/mortgage/canonicalCalculations";
import { analyzeApplication } from "../lib/ai/analyzeApplication";

const context = {
  timestamp: "2026-07-18T12:00:00.000Z",
  programContext: "regression_program",
  overlayContext: null,
  confidenceSource: "regression_fixture",
};

const input = (key: string, value: number | null, unit: Parameters<typeof calculationInput>[0]["unit"], included = true) =>
  calculationInput({
    key,
    label: key,
    value,
    unit,
    included,
    evidenceSources: [{ documentName: "fixture.pdf", extractedField: key, value, status: included ? "used" : "ignored", reason: included ? "Regression input." : "Regression exclusion." }],
    exclusionReason: included ? undefined : "Excluded by fixture.",
  });

const income = calculateMonthlyQualifyingIncome(input("annualIncome", 120000, "annual_currency"), context);
assert.equal(income.result, 10000);

const liabilities = calculateMonthlyLiabilities([
  input("auto", 500, "monthly_currency"),
  input("card", 250, "monthly_currency"),
  input("ignored", 999, "monthly_currency", false),
], context);
assert.equal(liabilities.result, 750);
assert.equal(liabilities.explanation.excludedInputs.length, 1);

const ltv = calculateLtv(input("loanAmount", 320000, "currency"), input("propertyValue", 400000, "currency"), context);
assert.equal(ltv.result, 0.8);

const pitia = calculateEstimatedPitia({
  loanAmount: input("loanAmount", 320000, "currency"),
  propertyValue: input("propertyValue", 400000, "currency"),
  ltv: input("ltv", ltv.result, "ratio"),
  annualInterestRate: input("annualInterestRate", 0.0675, "annual_rate"),
  termYears: input("termYears", 30, "years"),
  annualTaxRate: input("annualTaxRate", 0.018, "annual_rate"),
  annualInsuranceAmount: input("annualInsuranceAmount", 1800, "annual_currency"),
  annualMiRate: input("annualMiRate", 0, "annual_rate"),
  hoa: input("hoa", 0, "monthly_currency"),
  context,
});
assert.equal(pitia.result, 2825.51);

const housingRatio = calculateDebtToIncomeRatio({
  calculationName: "Housing Ratio",
  monthlyIncome: input("monthlyIncome", income.result, "monthly_currency"),
  obligations: [input("pitia", pitia.result, "monthly_currency")],
  context,
});
assert.equal(housingRatio.result, 0.28);

const backEndDti = calculateDebtToIncomeRatio({
  calculationName: "Back-End DTI",
  monthlyIncome: input("monthlyIncome", income.result, "monthly_currency"),
  obligations: [input("liabilities", liabilities.result, "monthly_currency"), input("pitia", pitia.result, "monthly_currency")],
  context,
});
assert.equal(backEndDti.result, 0.36);

const knownZeroLiabilities = input("knownZeroLiabilities", 0, "monthly_currency");
const knownZeroDti = calculateDebtToIncomeRatio({
  calculationName: "Consumer Debt Ratio",
  monthlyIncome: input("monthlyIncome", income.result, "monthly_currency"),
  obligations: [knownZeroLiabilities],
  context,
});
assert.equal(knownZeroDti.result, 0);
assert.equal(knownZeroDti.inputs[1].missing, false);
assert.equal(knownZeroDti.inputs[1].estimated, false);

const unknownDti = calculateDebtToIncomeRatio({
  calculationName: "Consumer Debt Ratio",
  monthlyIncome: input("monthlyIncome", income.result, "monthly_currency"),
  obligations: [input("unknownLiabilities", null, "monthly_currency")],
  context,
});
assert.equal(unknownDti.result, null);
assert.equal(unknownDti.inputs[1].missing, true);

const estimatedLiabilities = calculationInput({
  key: "estimatedLiabilities",
  label: "estimatedLiabilities",
  value: 500,
  unit: "monthly_currency",
  included: true,
  estimated: true,
  evidenceSources: [{ extractedField: "estimatedLiabilities", value: 500, status: "used", reason: "Regression estimate.", estimated: true }],
});
const estimatedDti = calculateDebtToIncomeRatio({
  calculationName: "Consumer Debt Ratio",
  monthlyIncome: input("monthlyIncome", income.result, "monthly_currency"),
  obligations: [estimatedLiabilities],
  context,
});
assert.equal(estimatedDti.result, 0.05);
assert.equal(estimatedDti.inputs[1].estimated, true);

const credit = selectRepresentativeCreditScore([
  input("experian", 718, "credit_score"),
  input("equifax", 695, "credit_score"),
  input("transunion", 704, "credit_score"),
], context);
assert.equal(credit.result, 704);

const duplicateCredit = selectRepresentativeCreditScore([
  input("experian", 680, "credit_score"),
  input("equifax", 700, "credit_score"),
  input("transunion", 700, "credit_score"),
], context);
assert.equal(duplicateCredit.result, 700);

for (const calculation of [income, liabilities, ltv, pitia, housingRatio, backEndDti, knownZeroDti, unknownDti, estimatedDti, credit, duplicateCredit]) {
  assert.equal(calculation.calculationVersion, CANONICAL_CALCULATION_VERSION);
  assert.equal(calculation.timestamp, context.timestamp);
  assert.ok(calculation.formulaName);
  assert.ok(calculation.explanation.formula);
  assert.equal(calculation.reproductionMetadata.engine, "canonical_mortgage_mathematics");
  assert.deepEqual(calculation, structuredClone(calculation));
}

const repeated = calculateDebtToIncomeRatio({
  calculationName: "Back-End DTI",
  monthlyIncome: input("monthlyIncome", income.result, "monthly_currency"),
  obligations: [input("liabilities", liabilities.result, "monthly_currency"), input("pitia", pitia.result, "monthly_currency")],
  context,
});
assert.deepEqual(repeated, backEndDti);

console.log("Canonical mortgage mathematics regression: PASS");

const analysisDocs = (debts: number | null) => [
  {
    name: "application.pdf",
    type: "1003",
    text: "Borrower Test Applicant annual income 120000 loan amount 320000 property value 400000",
    extracted: { borrower: "Test Applicant", income: 120000, loanAmount: 320000, propertyValue: 400000, debts },
  },
  {
    name: "credit.pdf",
    type: "credit",
    text: "Credit scores Experian 718 Equifax 695 TransUnion 704",
    extracted: { creditScore: 704, debts },
  },
] as const;

void Promise.all([
  analyzeApplication(analysisDocs(750) as any, { analysisVersion: "canonical-math-regression-v1", programContext: "regression_program" }),
  analyzeApplication(analysisDocs(4000) as any, { analysisVersion: "dti-threshold-below-v1", programContext: "regression_program" }),
  analyzeApplication(analysisDocs(6000) as any, { analysisVersion: "dti-threshold-above-v1", programContext: "regression_program" }),
  analyzeApplication(analysisDocs(0) as any, { analysisVersion: "known-zero-debt-v1", programContext: "regression_program" }),
  analyzeApplication(analysisDocs(null) as any, { analysisVersion: "unknown-debt-v1", programContext: "regression_program" }),
  analyzeApplication([
    {
      name: "duplicate-score-credit.pdf",
      type: "credit",
      text: "Credit scores Experian 680 Equifax 700 TransUnion 700",
      extracted: { creditScore: 680 },
    },
  ] as any, { analysisVersion: "duplicate-score-median-v1", programContext: "regression_program" }),
]).then(([analysis, belowThreshold, aboveThreshold, knownZeroDebtAnalysis, unknownDebtAnalysis, duplicateScoreAnalysis]) => {
  assert.ok(analysis.calculations);
  assert.equal(analysis.calculations.monthlyQualifyingIncome.result, 10000);
  assert.equal(analysis.calculations.ltv.result, analysis.normalized.ltv);
  assert.equal(analysis.calculations.creditScoreSelection.result, analysis.normalized.creditScore);
  assert.equal(analysis.calculations.backEndDti.programContext, "regression_program");
  assert.equal(analysis.calculations.backEndDti.overlayContext, null);
  assert.equal(analysis.calculations.backEndDti.timestamp, analysis.analyzedAt);
  assert.ok(analysis.calculations.monthlyQualifyingIncome.evidenceSources.some((source) => source.documentName === "application.pdf"));
  const belowFactor = belowThreshold.factors.find((factor) => factor.key === "dti_action_engine");
  const aboveFactor = aboveThreshold.factors.find((factor) => factor.key === "dti_action_engine");
  assert.equal(belowThreshold.normalized.dti, 0.4);
  assert.equal(belowFactor?.impact, "neutral");
  assert.equal(aboveThreshold.normalized.dti, 0.6);
  assert.equal(aboveFactor?.impact, "negative");
  assert.equal(knownZeroDebtAnalysis.normalized.debts, 0);
  assert.equal(knownZeroDebtAnalysis.normalized.dti, 0);
  assert.equal(unknownDebtAnalysis.normalized.debts, null);
  assert.equal(unknownDebtAnalysis.normalized.dti, null);
  assert.equal(duplicateScoreAnalysis.normalized.creditScore, 700);
  assert.equal(duplicateScoreAnalysis.calculations?.creditScoreSelection.result, 700);
  console.log("Canonical analysis integration regression: PASS");
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
