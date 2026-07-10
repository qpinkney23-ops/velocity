import { analyzeApplication, type ParsedAnalysisDoc } from "../lib/ai/analyzeApplication";

type RegressionCase = {
  name: string;
  docs: ParsedAnalysisDoc[];
  expect: {
    verdict?: "approve" | "approve_with_conditions" | "review" | "deny";
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

function assertConditions(actual: string[], expected?: string[]) {
  if (!expected?.length) return;

  for (const item of expected) {
    if (!actual.includes(item)) {
      fail(`conditions: missing expected condition "${item}"`);
    }
  }
}

async function runCase(testCase: RegressionCase) {
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
      mustIncludeConditions: [
        "Review loan-to-value ratio",
        "Confirm high-LTV eligibility and mortgage insurance structure",
        "Confirm program eligibility for borderline credit profile",
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
      verdict: "approve",
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
      maxDti: 0.078,
      minLtv: 0.806,
      maxLtv: 0.807,
      mustIncludeConditions: ["Review loan-to-value ratio"],
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
      verdict: "deny",
      minIncome: 41999,
      maxIncome: 42001,
      minAssets: 0,
      maxAssets: 0,
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
        "Missing 1003 application",
        "Missing bank statement",
        "Confirm assets",
        "Review debt-to-income ratio",
        "Review loan-to-value ratio",
        "Confirm high-LTV eligibility and mortgage insurance structure",
        "Resolve loan amount exceeding property value",
        "Review credit profile",
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