import assert from "node:assert/strict";
import fs from "node:fs";
import {
  UNDERWRITING_RATIO_SEMANTICS_VERSION,
  calculateCanonicalUnderwritingRatios,
  calculationInput,
} from "../lib/mortgage/canonicalCalculations";
import { analyzeApplication } from "../lib/ai/analyzeApplication";
import { buildUnderwritingReport } from "../lib/ai/buildUnderwritingReport";

const context = {
  timestamp: "2026-07-19T12:00:00.000Z",
  programContext: "ratio_semantics_regression",
  overlayContext: null,
  confidenceSource: "ratio_semantics_regression",
};

function input(key: string, value: number | null, estimated = false) {
  return calculationInput({
    key,
    label: key,
    value,
    unit: "monthly_currency",
    included: value !== null,
    estimated,
    evidenceSources: [{
      extractedField: key,
      value,
      status: value === null ? "missing" : "used",
      reason: "Ratio semantics regression input.",
      estimated,
    }],
  });
}

const definitions = calculateCanonicalUnderwritingRatios({
  monthlyIncome: input("monthlyIncome", 5000),
  monthlyLiabilities: input("monthlyLiabilities", 1000),
  monthlyHousingExpense: input("monthlyHousingExpense", 1500),
  context,
});
assert.equal(definitions.ratioSemanticsVersion, UNDERWRITING_RATIO_SEMANTICS_VERSION);
assert.equal(definitions.consumerDebtRatio.result, 0.2);
assert.equal(definitions.housingRatio.result, 0.3);
assert.equal(definitions.backEndDti.result, 0.5);
assert.equal(definitions.consumerDebtRatio.valueState, "known");

const knownZero = calculateCanonicalUnderwritingRatios({
  monthlyIncome: input("monthlyIncome", 5000),
  monthlyLiabilities: input("monthlyLiabilities", 0),
  monthlyHousingExpense: input("monthlyHousingExpense", 1500),
  context,
});
assert.equal(knownZero.consumerDebtRatio.result, 0);
assert.equal(knownZero.consumerDebtRatio.valueState, "known_zero");
assert.equal(knownZero.backEndDti.result, 0.3);

const unknownLiabilities = calculateCanonicalUnderwritingRatios({
  monthlyIncome: input("monthlyIncome", 5000),
  monthlyLiabilities: input("monthlyLiabilities", null),
  monthlyHousingExpense: input("monthlyHousingExpense", 1500),
  context,
});
assert.equal(unknownLiabilities.consumerDebtRatio.result, null);
assert.equal(unknownLiabilities.consumerDebtRatio.valueState, "unknown");
assert.equal(unknownLiabilities.housingRatio.result, 0.3);
assert.equal(unknownLiabilities.backEndDti.result, null);

const unknownHousing = calculateCanonicalUnderwritingRatios({
  monthlyIncome: input("monthlyIncome", 5000),
  monthlyLiabilities: input("monthlyLiabilities", 1000),
  monthlyHousingExpense: input("monthlyHousingExpense", null),
  context,
});
assert.equal(unknownHousing.consumerDebtRatio.result, 0.2);
assert.equal(unknownHousing.housingRatio.result, null);
assert.equal(unknownHousing.backEndDti.result, null);

const estimated = calculateCanonicalUnderwritingRatios({
  monthlyIncome: input("monthlyIncome", 5000),
  monthlyLiabilities: input("monthlyLiabilities", 1000, true),
  monthlyHousingExpense: input("monthlyHousingExpense", 1500, true),
  context,
});
assert.equal(estimated.consumerDebtRatio.valueState, "estimated");
assert.equal(estimated.housingRatio.valueState, "estimated");
assert.equal(estimated.backEndDti.valueState, "estimated");
assert.equal(estimated.backEndDti.estimated, true);

async function integration() {
  const analysis = await analyzeApplication([
    {
      name: "application.pdf",
      type: "1003",
      text: "Borrower Ratio Test annual income 60000 loan amount 240000 property value 300000",
      extracted: {
        borrower: "Ratio Test",
        income: 60000,
        debts: 1000,
        loanAmount: 240000,
        propertyValue: 300000,
      },
    },
  ] as any, { analysisVersion: "ratio-semantics-regression-v1" });

  const ratios = analysis.calculations?.ratios;
  assert.ok(ratios);
  assert.equal(analysis.normalized.consumerDebtRatio, ratios.consumerDebtRatio.result);
  assert.equal(analysis.normalized.housingRatio, ratios.housingRatio.result);
  assert.equal(analysis.normalized.backEndDti, ratios.backEndDti.result);
  assert.equal(analysis.dti, analysis.consumerDebtRatio);
  assert.equal(analysis.dti, analysis.normalized.consumerDebtRatio);
  assert.equal(analysis.backEndDti, analysis.normalized.backEndDti);

  const totalFactor = analysis.factors.find((factor) => factor.key === "total_dti");
  assert.equal(totalFactor?.value, ratios.backEndDti.result);

  const report = buildUnderwritingReport(analysis, {
    borrower: analysis.normalized.borrower,
    loanAmount: analysis.normalized.loanAmount ?? 0,
    propertyValue: analysis.normalized.propertyValue ?? 0,
    income: analysis.normalized.income ?? 0,
    debts: analysis.normalized.debts ?? undefined,
    dti: 0.99,
  });
  assert.equal(report.financials.consumerDebtRatio, (ratios.consumerDebtRatio.result ?? 0) * 100);
  assert.equal(report.financials.housingRatio, (ratios.housingRatio.result ?? 0) * 100);
  assert.equal(report.financials.backEndDti, (ratios.backEndDti.result ?? 0) * 100);
  assert.equal(report.financials.dti, report.financials.consumerDebtRatio);
  assert.equal(report.financials.totalDti, report.financials.backEndDti);
  assert.notEqual(report.financials.dti, 99, "Ambiguous caller-supplied dti must not override canonical back-end DTI.");

  const analyzerSource = fs.readFileSync("lib/ai/analyzeApplication.ts", "utf8");
  assert(!analyzerSource.includes("function computeTotalDTI"));
  assert(!analyzerSource.includes("function computeConsumerDebtRatio"));
  const reportSource = fs.readFileSync("lib/ai/buildUnderwritingReport.ts", "utf8");
  assert(!reportSource.includes("function getReportDti"));
  const pageSource = fs.readFileSync("app/applications/[id]/page.tsx", "utf8");
  assert(pageSource.includes("calculations?.ratios?.backEndDti?.result"));

  console.log("Canonical underwriting ratio semantics regression: PASS");
}

void integration().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
