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

const credit = selectRepresentativeCreditScore([
  input("experian", 718, "credit_score"),
  input("equifax", 695, "credit_score"),
  input("transunion", 704, "credit_score"),
], context);
assert.equal(credit.result, 704);

for (const calculation of [income, liabilities, ltv, pitia, housingRatio, backEndDti, credit]) {
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

void analyzeApplication([
  {
    name: "application.pdf",
    type: "1003",
    text: "Borrower Test Applicant annual income 120000 loan amount 320000 property value 400000",
    extracted: { borrower: "Test Applicant", income: 120000, loanAmount: 320000, propertyValue: 400000, debts: 750 },
  },
  {
    name: "credit.pdf",
    type: "credit",
    text: "Credit scores Experian 718 Equifax 695 TransUnion 704",
    extracted: { creditScore: 704, debts: 750 },
  },
], { analysisVersion: "canonical-math-regression-v1", programContext: "regression_program" }).then((analysis) => {
  assert.ok(analysis.calculations);
  assert.equal(analysis.calculations.monthlyQualifyingIncome.result, 10000);
  assert.equal(analysis.calculations.ltv.result, analysis.normalized.ltv);
  assert.equal(analysis.calculations.creditScoreSelection.result, analysis.normalized.creditScore);
  assert.equal(analysis.calculations.backEndDti.programContext, "regression_program");
  assert.equal(analysis.calculations.backEndDti.overlayContext, null);
  assert.equal(analysis.calculations.backEndDti.timestamp, analysis.analyzedAt);
  assert.ok(analysis.calculations.monthlyQualifyingIncome.evidenceSources.some((source) => source.documentName === "application.pdf"));
  console.log("Canonical analysis integration regression: PASS");
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
