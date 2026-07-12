import { analyzeApplication, type ParsedAnalysisDoc } from "../lib/ai/analyzeApplication";

type RegressionCase = {
  name: string;
  docs: ParsedAnalysisDoc[];
  expect: {
    verdict?: "approve" | "approve_with_conditions" | "review" | "deny" | "blocked";
    minIncome?: number;
    maxIncome?: number;
    minAssets?: number;
    maxAssets?: number;
    minDebts?: number;
    maxDebts?: number;
    minCreditScore?: number;
    maxCreditScore?: number;
    minLoanAmount?: number;
    maxLoanAmount?: number;
    minPropertyValue?: number;
    maxPropertyValue?: number;
    minDti?: number;
    maxDti?: number;
    minLtv?: number;
    maxLtv?: number;
    exactRawLtv?: number;
    displayedLtv?: string;
    exactDti?: number;
    mustIncludeConditions?: string[];
  };
};

function fail(message: string): never {
  throw new Error(message);
}

function assertRange(
  label: string,
  actual: number | null | undefined,
  min?: number,
  max?: number
) {
  if (typeof min !== "number" && typeof max !== "number") return;
  if (actual === null || actual === undefined || Number.isNaN(actual)) {
    fail(`${label}: actual value is missing`);
  }

  if (typeof min === "number" && actual < min) {
    fail(`${label}: expected >= ${min}, got ${actual}`);
  }

  if (typeof max === "number" && actual > max) {
    fail(`${label}: expected <= ${max}, got ${actual}`);
  }
}

function assertConditions(actual: Array<string | { label?: string }>, expected?: string[]) {
  if (!expected?.length) return;
  const labels = actual.map((condition) => typeof condition === "string" ? condition : condition?.label).filter((label): label is string => typeof label === "string");

  for (const item of expected) {
    if (!labels.includes(item)) {
      fail(`conditions: missing expected condition "${item}"`);
    }
  }
}

async function runCase(testCase: RegressionCase) {
  const fixtureBefore = JSON.stringify(testCase.docs);
  const result = await analyzeApplication(testCase.docs);

  console.log(`\n=== ${testCase.name} ===`);
  console.log(`verdict: ${result.verdict}`);
  console.log(`score: ${result.score}`);
  console.log(`confidence: ${result.confidence}`);
  console.log(`income: ${result.normalized.income}`);
  console.log(`assets: ${result.normalized.assets}`);
  console.log(`debts: ${result.normalized.debts}`);
  console.log(`creditScore: ${result.normalized.creditScore}`);
  console.log(`loanAmount: ${result.normalized.loanAmount}`);
  console.log(`propertyValue: ${result.normalized.propertyValue}`);
  console.log(`dti: ${result.dti}`);
  console.log(`ltv: ${result.ltv}`);
  console.log(`conditions: ${JSON.stringify(result.conditions)}`);

  const exp = testCase.expect;

  if (exp.verdict && result.verdict !== exp.verdict) {
    fail(`verdict: expected ${exp.verdict}, got ${result.verdict}`);
  }

  assertRange("income", result.normalized.income, exp.minIncome, exp.maxIncome);
  assertRange("assets", result.normalized.assets, exp.minAssets, exp.maxAssets);
  assertRange("debts", result.normalized.debts, exp.minDebts, exp.maxDebts);
  assertRange("creditScore", result.normalized.creditScore, exp.minCreditScore, exp.maxCreditScore);
  assertRange("loanAmount", result.normalized.loanAmount, exp.minLoanAmount, exp.maxLoanAmount);
  assertRange("propertyValue", result.normalized.propertyValue, exp.minPropertyValue, exp.maxPropertyValue);
  assertRange("dti", result.dti, exp.minDti, exp.maxDti);
  assertRange("ltv", result.ltv, exp.minLtv, exp.maxLtv);
  if (typeof exp.exactRawLtv === "number") {
    if (result.ltv !== exp.exactRawLtv) fail(`ltv: expected exact raw fraction ${exp.exactRawLtv}, got ${result.ltv}`);
    if (result.normalized.ltv !== exp.exactRawLtv) fail(`normalized.ltv: expected exact raw fraction ${exp.exactRawLtv}, got ${result.normalized.ltv}`);
    const second = await analyzeApplication(testCase.docs);
    if (second.ltv !== result.ltv) fail(`ltv: calculation is not deterministic (${result.ltv} versus ${second.ltv})`);
  }
  if (exp.displayedLtv && `${((result.ltv ?? 0) * 100).toFixed(2)}%` !== exp.displayedLtv) {
    fail(`ltv display: expected ${exp.displayedLtv}, got ${((result.ltv ?? 0) * 100).toFixed(2)}%`);
  }
  if (typeof exp.exactDti === "number" && result.dti !== exp.exactDti) fail(`dti: expected unchanged ${exp.exactDti}, got ${result.dti}`);
  if (JSON.stringify(testCase.docs) !== fixtureBefore) fail("fixture inputs were mutated");

  assertConditions(result.conditions, exp.mustIncludeConditions);

  console.log(`PASS: ${testCase.name}`);
}

const cases: RegressionCase[] = [
  {
    name: "Daniel Hale - high LTV but strong file should be approve_with_conditions",
    docs: [
      {
        type: "1003",
        name: "form_1003.pdf",
        text: `
          Uniform Residential Loan Application
          Borrower Name Daniel Hale
          Email daniel.hale@northcoastmail.com
          Loan Amount $331,900
          Property Value $347,500
          Annual Income $83,720
        `,
        extracted: {
          borrower: "Daniel Hale",
          email: "daniel.hale@northcoastmail.com",
          income: 83720,
          loanAmount: 331900,
          propertyValue: 347500,
        },
      },
      {
        type: "employment",
        name: "employment_letter.pdf",
        text: `
          EMPLOYMENT VERIFICATION LETTER
          Employee: Daniel Hale
          Employer: Lakefront Industrial Controls, LLC
          Position: Senior Field Service Technician
          Annual Salary $83,720
        `,
        extracted: {
          income: 83720,
          borrower: "Daniel Hale",
        },
      },
      {
        type: "w2",
        name: "w2.pdf",
        text: `
          Wages, tips, other compensation $83,720
        `,
        extracted: {
          income: 83720,
          borrower: "Daniel Hale",
        },
      },
      {
        type: "paystub",
        name: "paystub.pdf",
        text: `
          Current Gross $3,664.74
        `,
        extracted: {
          income: 3664.74,
          borrower: "Daniel Hale",
        },
      },
      {
        type: "bank",
        name: "bank_statement.pdf",
        text: `
          Ending Balance $14,964.06
        `,
        extracted: {
          assets: 14964.06,
          borrower: "Daniel Hale",
        },
      },
      {
        type: "credit",
        name: "credit_summary.pdf",
        text: `
          Representative Score 642
          Total Monthly Payment $648
        `,
        extracted: {
          debts: 648,
          creditScore: 642,
          borrower: "Daniel Hale",
        },
      },
      {
        type: "purchase",
        name: "purchase_agreement.pdf",
        text: `
          Purchase Price $347,500
        `,
        extracted: {
          loanAmount: 331900,
          propertyValue: 347500,
          borrower: "Daniel Hale",
        },
      },
      {
        type: "id",
        name: "drivers_license.pdf",
        text: `
          Daniel Hale
        `,
        extracted: {
          borrower: "Daniel Hale",
        },
      },
    ],
    expect: {
      verdict: "approve_with_conditions",
      minIncome: 83719,
      maxIncome: 83721,
      minAssets: 14964,
      maxAssets: 14965,
      minDebts: 648,
      maxDebts: 648,
      minCreditScore: 642,
      maxCreditScore: 642,
      minLoanAmount: 331900,
      maxLoanAmount: 331900,
      minPropertyValue: 347500,
      maxPropertyValue: 347500,
      minDti: 0.09,
      maxDti: 0.10,
      minLtv: 0.955,
      maxLtv: 0.956,
      exactRawLtv: 331900 / 347500,
      displayedLtv: "95.51%",
      exactDti: 0.09,
      mustIncludeConditions: [
        "High LTV Exposure — confirm MI, product eligibility, and overlays",
        "Credit score 620–679 — confirm pricing tier and investor overlays",
      ],
    },
  },
  {
    name: "Clean conventional file should approve",
    docs: [
      {
        type: "1003",
        name: "form_1003.pdf",
        text: `
          Uniform Residential Loan Application
          Borrower Name Marcus Bennett
          Email marcus.bennett@email.com
          Loan Amount $250,000
          Property Value $310,000
          Annual Income $92,000
        `,
        extracted: {
          borrower: "Marcus Bennett",
          email: "marcus.bennett@email.com",
          income: 92000,
          loanAmount: 250000,
          propertyValue: 310000,
        },
      },
      {
        type: "employment",
        name: "employment_letter.pdf",
        text: `
          EMPLOYMENT VERIFICATION LETTER
          Employee: Marcus Bennett
          Annual Salary $92,000
        `,
        extracted: {
          income: 92000,
          borrower: "Marcus Bennett",
        },
      },
      {
        type: "w2",
        name: "w2.pdf",
        text: `
          Wages, tips, other compensation $92,000
        `,
        extracted: {
          income: 92000,
          borrower: "Marcus Bennett",
        },
      },
      {
        type: "paystub",
        name: "paystub.pdf",
        text: `
          Current Gross $3,833.33
        `,
        extracted: {
          income: 3833.33,
          borrower: "Marcus Bennett",
        },
      },
      {
        type: "bank",
        name: "bank_statement.pdf",
        text: `
          Ending Balance $25,500
        `,
        extracted: {
          assets: 25500,
          borrower: "Marcus Bennett",
        },
      },
      {
        type: "credit",
        name: "credit_summary.pdf",
        text: `
          Representative Score 742
          Total Monthly Payment $595
        `,
        extracted: {
          debts: 595,
          creditScore: 742,
          borrower: "Marcus Bennett",
        },
      },
      {
        type: "purchase",
        name: "purchase_agreement.pdf",
        text: `
          Purchase Price $310,000
        `,
        extracted: {
          loanAmount: 250000,
          propertyValue: 310000,
          borrower: "Marcus Bennett",
        },
      },
      {
        type: "id",
        name: "drivers_license.pdf",
        text: `
          Marcus Bennett
        `,
        extracted: {
          borrower: "Marcus Bennett",
        },
      },
    ],
    expect: {
      verdict: "approve_with_conditions",
      minIncome: 91999,
      maxIncome: 92001,
      minAssets: 25500,
      maxAssets: 25500,
      minDebts: 595,
      maxDebts: 595,
      minCreditScore: 742,
      maxCreditScore: 742,
      minLoanAmount: 250000,
      maxLoanAmount: 250000,
      minPropertyValue: 310000,
      maxPropertyValue: 310000,
      minDti: 0.077,
      maxDti: 0.08,
      minLtv: 0.806,
      maxLtv: 0.807,
      mustIncludeConditions: ["High LTV Exposure — confirm MI, product eligibility, and overlays"],
    },
  },
  {
    name: "Weak file should deny",
    docs: [
      {
        type: "employment",
        name: "employment_letter.pdf",
        text: `
          EMPLOYMENT VERIFICATION LETTER
          Employee: Weak Borrower
          Annual Salary $42,000
        `,
        extracted: {
          income: 42000,
          borrower: "Weak Borrower",
        },
      },
      {
        type: "credit",
        name: "credit_summary.pdf",
        text: `
          Representative Score 579
          Total Monthly Payment $2,600
        `,
        extracted: {
          debts: 2600,
          creditScore: 579,
          borrower: "Weak Borrower",
        },
      },
      {
        type: "purchase",
        name: "purchase_agreement.pdf",
        text: `
          Purchase Price $280,000
        `,
        extracted: {
          loanAmount: 285000,
          propertyValue: 280000,
          borrower: "Weak Borrower",
        },
      },
    ],
    expect: {
      verdict: "blocked",
      minIncome: 41999,
      maxIncome: 42001,
      minDebts: 2600,
      maxDebts: 2600,
      minCreditScore: 579,
      maxCreditScore: 579,
      minLoanAmount: 285000,
      maxLoanAmount: 285000,
      minPropertyValue: 280000,
      maxPropertyValue: 280000,
      minDti: 0.74,
      maxDti: 0.75,
      minLtv: 1.017,
      maxLtv: 1.018,
      mustIncludeConditions: [
        "Credit Policy Hard Stop",
        "DTI Exceeds Threshold — document capacity support",
        "Housing Payment Review — confirm PITI, MI, taxes, insurance, and rate",
        "Asset Review — verify liquid assets and reserves",
      ],
    },
  },
];

async function main() {
  for (const testCase of cases) {
    await runCase(testCase);
  }

  console.log("\nALL REGRESSION TESTS PASSED");
}

main().catch((err) => {
  console.error("\nREGRESSION FAILED");
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
