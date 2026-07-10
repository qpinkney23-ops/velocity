import { analyzeApplication } from "../lib/ai/analyzeApplication";

type AnyDoc = Record<string, any>;

type RegressionCase = {
  name: string;
  docs: AnyDoc[];
  expect: {
    minDti?: number;
    maxDti?: number;
    mustMention?: string[];
    mustNotMention?: string[];
    allowedVerdicts?: string[];
    blockedAllowed?: boolean;
  };
};

function doc(name: string, type: string, extracted: Record<string, any>, text: string = ""): AnyDoc {
  return {
    name,
    type,
    text,
    extracted,
  };
}

function liability(
  creditor: string,
  monthlyPayment: number,
  source: "credit" | "1003" | "bank",
  options: Partial<{
    accountType: string;
    balance: number;
    status: string;
    includeInDti: boolean;
    reviewRequired: boolean;
    confidence: "high" | "medium" | "low";
    reason: string;
  }> = {}
) {
  return {
    creditor,
    monthlyPayment,
    source,
    accountType: options.accountType || "",
    balance: options.balance ?? null,
    status: options.status || "open",
    includeInDti: options.includeInDti ?? true,
    reviewRequired: options.reviewRequired ?? false,
    confidence: options.confidence || "medium",
    reason: options.reason || "",
  };
}

function normalizeText(value: unknown): string {
  return (value || "").toString().replace(/\s+/g, " ").trim();
}

function collectResultText(result: any): string {
  const factors = Array.isArray(result?.factors) ? result.factors : [];
  const conditions = Array.isArray(result?.conditions) ? result.conditions : [];
  const redFlags = Array.isArray(result?.redFlags) ? result.redFlags : [];

  return normalizeText(
    [
      result?.verdict,
      result?.risk,
      result?.reason,
      result?.decision?.reason,
      JSON.stringify(result?.normalized || {}),
      JSON.stringify(result?.borrowerProfile || {}),
      factors.map((factor: any) => `${factor?.key || ""} ${factor?.label || ""} ${factor?.summary || ""} ${factor?.details || ""}`).join(" "),
      conditions.map((condition: any) => `${condition?.label || condition?.title || ""} ${condition?.summary || condition?.description || ""}`).join(" "),
      redFlags.map((flag: any) => `${flag?.label || flag?.title || ""} ${flag?.summary || flag?.description || ""}`).join(" "),
    ].join(" ")
  ).toLowerCase();
}

function getDti(result: any): number | null {
  const candidates = [
    result?.dti,
    result?.normalized?.dti,
    result?.normalized?.consumerDebtRatio,
    result?.normalized?.totalDti,
  ];

  for (const candidate of candidates) {
    const n = Number(candidate);
    if (Number.isFinite(n) && n > 0) return n;
  }

  return null;
}

function assertRange(label: string, value: number | null, min?: number, max?: number) {
  if (typeof min !== "number" && typeof max !== "number") return;

  if (value === null) {
    throw new Error(`${label} was missing`);
  }

  if (typeof min === "number" && value < min) {
    throw new Error(`${label} ${value} was below expected minimum ${min}`);
  }

  if (typeof max === "number" && value > max) {
    throw new Error(`${label} ${value} was above expected maximum ${max}`);
  }
}

function assertMentions(resultText: string, mustMention: string[] = []) {
  for (const phrase of mustMention) {
    if (!resultText.includes(phrase.toLowerCase())) {
      throw new Error(`Missing expected phrase: ${phrase}`);
    }
  }
}

function assertNotMentions(resultText: string, mustNotMention: string[] = []) {
  for (const phrase of mustNotMention) {
    if (resultText.includes(phrase.toLowerCase())) {
      throw new Error(`Unexpected phrase appeared: ${phrase}`);
    }
  }
}

function assertDecision(result: any, allowedVerdicts?: string[], blockedAllowed = true) {
  const verdict = normalizeText(result?.verdict || result?.decision?.state || "").toLowerCase();

  if (allowedVerdicts?.length) {
    const allowed = allowedVerdicts.map((item) => item.toLowerCase());
    if (!allowed.includes(verdict)) {
      throw new Error(`Unexpected verdict "${verdict || "missing"}"; expected one of: ${allowedVerdicts.join(", ")}`);
    }
  }

  if (!blockedAllowed && verdict === "blocked") {
    throw new Error("Unexpected blocked decision");
  }
}

function hasActiveEnterpriseDenialGuardrail(result: any): boolean {
  const conditions = Array.isArray(result?.conditions) ? result.conditions : [];
  return conditions.some((condition: any) => {
    const label = normalizeText(condition?.label || condition?.title || "").toLowerCase();
    const evidence = normalizeText(condition?.evidence || condition?.summary || condition?.description || "").toLowerCase();
    const status = normalizeText(condition?.status || "open").toLowerCase();
    const severity = normalizeText(condition?.severity || "").toLowerCase();

    return (
      status !== "done" &&
      severity === "high" &&
      (label.includes("enterprise denial guardrail") ||
        evidence.includes("enterprise denial guardrail") ||
        label.includes("credit policy hard stop"))
    );
  });
}

function assertNoActiveGuardrail(result: any) {
  if (hasActiveEnterpriseDenialGuardrail(result)) {
    throw new Error("Unexpected active enterprise denial guardrail/high hard-stop condition");
  }
}

function makeMarcusStressDocs(): AnyDoc[] {
  const liabilities = [
    liability("Midwest Auto Finance", 612, "credit", {
      accountType: "installment auto",
      balance: 18775,
      status: "open",
      confidence: "high",
      reason: "credit report monthly payment",
    }),
    liability("GreatLakes / Nelnet Student Loan", 275, "credit", {
      accountType: "student loan",
      balance: 22104,
      status: "deferred?",
      reviewRequired: true,
      confidence: "medium",
      reason: "student loan treatment requires review",
    }),
    liability("Prosper Funding", 240, "credit", {
      accountType: "personal loan",
      balance: 4020,
      status: "open",
      confidence: "medium",
      reason: "payoff candidate",
    }),
    liability("Utility Charge-Off", 275, "credit", {
      accountType: "charge-off",
      balance: 0,
      status: "review",
      includeInDti: false,
      reviewRequired: true,
      confidence: "low",
      reason: "charge-off/payment treatment requires review",
    }),
  ];

  return [
    doc("1003.pdf", "1003", {
      borrower: "Marcus D Ellington",
      fullName: "Marcus D Ellington",
      dob: "03/14/1989",
      ssnLast4: "4821",
      address: "4921 W Lake Rd Apt 3B Chicago IL 60614",
      employerAddress: "1900 N Halsted St Ste 240 Chicago IL",
      income: 75000,
      loanAmount: 285000,
      propertyValue: 300000,
      creditScore: 642,
      liabilities,
    }),
    doc("Credit_Report.pdf", "credit", {
      borrower: "Marcus D Ellington",
      fullName: "Marcus D Ellington",
      creditScore: 642,
      creditScores: [618, 642, 655],
      liabilities,
    }),
    doc("VOE.pdf", "employment", {
      borrower: "Marcus D Ellington",
      fullName: "Marcus D Ellington",
      income: 75000,
    }),
  ];
}

function makeCleanBorrowerDocs(): AnyDoc[] {
  const liabilities = [
    liability("Capital One", 45, "credit", {
      accountType: "revolving",
      balance: 1200,
      confidence: "high",
    }),
    liability("Auto Loan", 280, "credit", {
      accountType: "installment auto",
      balance: 9500,
      confidence: "high",
    }),
  ];

  return [
    doc("1003_clean.pdf", "1003", {
      borrower: "Olivia Cleanfile",
      fullName: "Olivia Cleanfile",
      dob: "04/10/1991",
      income: 108000,
      loanAmount: 280000,
      propertyValue: 350000,
      creditScore: 742,
      liabilities,
    }),
    doc("Credit_Report_clean.pdf", "credit", {
      borrower: "Olivia Cleanfile",
      fullName: "Olivia Cleanfile",
      creditScore: 742,
      liabilities,
    }),
  ];
}

function makeStudentLoanBorrowerDocs(): AnyDoc[] {
  const liabilities = [
    liability("Nelnet Student Loan", 475, "credit", {
      accountType: "student loan",
      balance: 44000,
      confidence: "high",
      reason: "student loan payment",
    }),
    liability("Great Lakes Student Loan", 165, "credit", {
      accountType: "student loan",
      balance: 12000,
      confidence: "high",
      reason: "student loan payment",
    }),
  ];

  return [
    doc("1003_student.pdf", "1003", {
      borrower: "Noah Student",
      fullName: "Noah Student",
      income: 62400,
      loanAmount: 209000,
      propertyValue: 220000,
      creditScore: 681,
      liabilities,
    }),
    doc("Credit_Report_student.pdf", "credit", {
      borrower: "Noah Student",
      fullName: "Noah Student",
      creditScore: 681,
      creditScores: [670, 681, 699],
      liabilities,
    }),
  ];
}

function makeAutoHeavyBorrowerDocs(): AnyDoc[] {
  const liabilities = [
    liability("Ford Credit", 725, "credit", {
      accountType: "auto installment",
      balance: 26500,
      confidence: "high",
    }),
    liability("GM Financial", 520, "credit", {
      accountType: "auto installment",
      balance: 18200,
      confidence: "high",
    }),
    liability("Capital One Card", 110, "credit", {
      accountType: "revolving",
      balance: 3500,
      confidence: "medium",
    }),
  ];

  return [
    doc("1003_auto_heavy.pdf", "1003", {
      borrower: "Ava Autoheavy",
      fullName: "Ava Autoheavy",
      income: 84000,
      loanAmount: 270000,
      propertyValue: 300000,
      creditScore: 705,
      liabilities,
    }),
    doc("Credit_Report_auto_heavy.pdf", "credit", {
      borrower: "Ava Autoheavy",
      fullName: "Ava Autoheavy",
      creditScore: 705,
      creditScores: [690, 705, 720],
      liabilities,
    }),
  ];
}

const cases: RegressionCase[] = [
  {
    name: "Marcus stress file — high debt, account-level strategy",
    docs: makeMarcusStressDocs(),
    expect: {
      minDti: 0.15,
      maxDti: 0.35,
      mustMention: ["marcus", "prosper", "midwest", "dti"],
      mustNotMention: ["clear to approve"],
    },
  },
  {
    name: "Clean borrower — lower debt should not create hard-stop noise",
    docs: makeCleanBorrowerDocs(),
    expect: {
      minDti: 0.01,
      maxDti: 0.15,
      mustMention: ["olivia"],
    },
  },
  {
    name: "Student-loan borrower — student loan signals remain visible",
    docs: makeStudentLoanBorrowerDocs(),
    expect: {
      minDti: 0.05,
      maxDti: 0.25,
      mustMention: ["student", "nelnet"],
      mustNotMention: ["payoff/exclusion candidate"],
    },
  },
  {
    name: "Auto-heavy borrower — auto liability signals remain visible",
    docs: makeAutoHeavyBorrowerDocs(),
    expect: {
      minDti: 0.1,
      maxDti: 0.3,
      mustMention: ["auto", "ford"],
      allowedVerdicts: ["approved", "approve_with_conditions"],
      blockedAllowed: false,
    },
  },
];

async function run() {
  let passed = 0;
  const failures: string[] = [];

  for (const testCase of cases) {
    try {
      const result = await analyzeApplication(testCase.docs as any, {
        applicationId: `regression-${testCase.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        analysisVersion: "dti-regression-v3",
      });

      const dti = getDti(result);
      const resultText = collectResultText(result);

      assertRange("DTI", dti, testCase.expect.minDti, testCase.expect.maxDti);
      assertMentions(resultText, testCase.expect.mustMention);
      assertDecision(result, testCase.expect.allowedVerdicts, testCase.expect.blockedAllowed ?? true);

      if (testCase.expect.blockedAllowed === false) {
        assertNoActiveGuardrail(result);
      }

      assertNotMentions(resultText, testCase.expect.mustNotMention);

      passed += 1;
      console.log(`PASS: ${testCase.name}`);
      console.log(`  verdict=${result?.verdict ?? "unknown"} risk=${result?.risk ?? "unknown"} dti=${dti ?? "missing"} ltv=${result?.ltv ?? "missing"} score=${result?.score ?? "missing"}`);
    } catch (error: any) {
      const message = error?.message || String(error);
      failures.push(`${testCase.name}: ${message}`);
      console.error(`FAIL: ${testCase.name}`);
      console.error(`  ${message}`);
    }
  }

  console.log(`\nDTI regression result: ${passed}/${cases.length} passed`);

  if (failures.length) {
    console.log("\nFailures:");
    for (const failure of failures) {
      console.log(`- ${failure}`);
    }

    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
