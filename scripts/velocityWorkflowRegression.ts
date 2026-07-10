import { analyzeApplication } from "../lib/ai/analyzeApplication";

type AnyDoc = Record<string, any>;

type RegressionCase = {
  name: string;
  docs: AnyDoc[];
  expect: {
    verdict?: string;
    blocked?: boolean;
    minDti?: number;
    maxDti?: number;
    readinessLabels?: string[];
    minCanonicalConditions?: number;
    minReadinessScore?: number;
    maxReadinessScore?: number;
    mustMentionCanonical?: string[];
    mustHaveOwners?: string[];
  };
};

function doc(name: string, type: string, extracted: Record<string, any>, text = ""): AnyDoc {
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

function collectCanonicalText(result: any): string {
  const canonicalConditions = Array.isArray(result?.canonicalConditions)
    ? result.canonicalConditions
    : [];

  return normalizeText(
    canonicalConditions
      .map((condition: any) =>
        [
          condition?.id,
          condition?.title,
          condition?.summary,
          condition?.category,
          condition?.severity,
          condition?.owner,
          condition?.resolutionStrategy,
          Array.isArray(condition?.requiredActions) ? condition.requiredActions.join(" ") : "",
          Array.isArray(condition?.requiredDocuments) ? condition.requiredDocuments.join(" ") : "",
        ].join(" ")
      )
      .join(" ")
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

function assertCanonicalConditions(result: any, minCanonicalConditions = 1) {
  const canonicalConditions = Array.isArray(result?.canonicalConditions)
    ? result.canonicalConditions
    : [];

  if (canonicalConditions.length < minCanonicalConditions) {
    throw new Error(
      `Expected at least ${minCanonicalConditions} canonical condition(s), found ${canonicalConditions.length}`
    );
  }

  for (const condition of canonicalConditions) {
    if (!condition?.id) throw new Error("Canonical condition missing id");
    if (!condition?.title) throw new Error(`Canonical condition ${condition?.id || "unknown"} missing title`);
    if (!condition?.category) throw new Error(`Canonical condition ${condition?.id || "unknown"} missing category`);
    if (!condition?.status) throw new Error(`Canonical condition ${condition?.id || "unknown"} missing status`);
    if (!condition?.owner) throw new Error(`Canonical condition ${condition?.id || "unknown"} missing owner`);
    if (typeof condition?.blocking !== "boolean") {
      throw new Error(`Canonical condition ${condition?.id || "unknown"} missing boolean blocking`);
    }
    if (typeof condition?.autoClearEligible !== "boolean") {
      throw new Error(`Canonical condition ${condition?.id || "unknown"} missing boolean autoClearEligible`);
    }
    if (!Array.isArray(condition?.requiredActions)) {
      throw new Error(`Canonical condition ${condition?.id || "unknown"} missing requiredActions array`);
    }
    if (!Array.isArray(condition?.requiredDocuments)) {
      throw new Error(`Canonical condition ${condition?.id || "unknown"} missing requiredDocuments array`);
    }
  }
}

function assertReadiness(result: any, expectedLabels?: string[], minScore?: number, maxScore?: number) {
  const readiness = result?.readiness;

  if (!readiness || typeof readiness !== "object") {
    throw new Error("Readiness object missing");
  }

  const score = Number(readiness.readinessScore);
  if (!Number.isFinite(score)) {
    throw new Error("Readiness score missing or invalid");
  }

  if (typeof minScore === "number" && score < minScore) {
    throw new Error(`Readiness score ${score} was below expected minimum ${minScore}`);
  }

  if (typeof maxScore === "number" && score > maxScore) {
    throw new Error(`Readiness score ${score} was above expected maximum ${maxScore}`);
  }

  const label = normalizeText(readiness.readinessLabel).toLowerCase();

  if (expectedLabels?.length) {
    const allowed = expectedLabels.map((item) => item.toLowerCase());
    if (!allowed.includes(label)) {
      throw new Error(`Unexpected readiness label "${label || "missing"}"; expected one of ${expectedLabels.join(", ")}`);
    }
  }

  const numericFields = [
    "unresolvedBlockingConditions",
    "unresolvedConditions",
    "borrowerActionCount",
    "processorActionCount",
    "underwriterActionCount",
  ];

  for (const field of numericFields) {
    const n = Number(readiness[field]);
    if (!Number.isFinite(n)) {
      throw new Error(`Readiness numeric field missing or invalid: ${field}`);
    }
  }

  if (!Array.isArray(readiness.topBlockingReasons)) {
    throw new Error("Readiness topBlockingReasons must be an array");
  }

  if (!Array.isArray(readiness.nextBestActions)) {
    throw new Error("Readiness nextBestActions must be an array");
  }
}

function assertBlockedAlignment(result: any, blocked?: boolean) {
  if (typeof blocked !== "boolean") return;

  const verdict = normalizeText(result?.decision?.state || result?.verdict).toLowerCase();
  const readinessLabel = normalizeText(result?.readiness?.readinessLabel).toLowerCase();
  const blockingCount = Number(result?.readiness?.unresolvedBlockingConditions || 0);
  const canonicalConditions = Array.isArray(result?.canonicalConditions)
    ? result.canonicalConditions
    : [];
  const canonicalBlockers = canonicalConditions.filter((condition: any) => condition?.blocking === true);

  if (blocked) {
    if (verdict !== "blocked") {
      throw new Error(`Expected blocked verdict, received "${verdict || "missing"}"`);
    }

    if (readinessLabel !== "not_ready" && readinessLabel !== "high_risk") {
      throw new Error(`Expected blocked readiness label, received "${readinessLabel || "missing"}"`);
    }

    if (blockingCount < 1 && canonicalBlockers.length < 1) {
      throw new Error("Expected at least one blocking condition for blocked file");
    }
  } else {
    if (verdict === "blocked") {
      throw new Error("Expected non-blocked verdict but received blocked");
    }

    if (blockingCount > 0 || canonicalBlockers.length > 0) {
      throw new Error("Expected no blocking conditions for non-blocked file");
    }
  }
}

function assertMentionsCanonical(result: any, phrases: string[] = []) {
  const text = collectCanonicalText(result);

  for (const phrase of phrases) {
    if (!text.includes(phrase.toLowerCase())) {
      throw new Error(`Canonical conditions missing expected phrase: ${phrase}`);
    }
  }
}

function assertOwners(result: any, owners: string[] = []) {
  if (!owners.length) return;

  const canonicalConditions = Array.isArray(result?.canonicalConditions)
    ? result.canonicalConditions
    : [];

  const presentOwners = new Set(
    canonicalConditions
      .map((condition: any) => normalizeText(condition?.owner).toLowerCase())
      .filter(Boolean)
  );

  for (const owner of owners) {
    if (!presentOwners.has(owner.toLowerCase())) {
      throw new Error(`Missing expected workflow owner: ${owner}`);
    }
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
      ssnLast4: "7710",
      address: "100 Main St Cleveland OH 44114",
      employerAddress: "1500 Stable Way Cleveland OH 44114",
      income: 108000,
      loanAmount: 280000,
      propertyValue: 350000,
      creditScore: 742,
      assets: 35000,
      liabilities,
    }),
    doc("Credit_Report_clean.pdf", "credit", {
      borrower: "Olivia Cleanfile",
      fullName: "Olivia Cleanfile",
      creditScore: 742,
      liabilities,
    }),
    doc("VOE_clean.pdf", "employment", {
      borrower: "Olivia Cleanfile",
      fullName: "Olivia Cleanfile",
      income: 108000,
    }),
  ];
}

function makeMissingIncomeDocs(): AnyDoc[] {
  const liabilities = [
    liability("Capital One", 125, "credit", {
      accountType: "revolving",
      balance: 3200,
      confidence: "high",
    }),
  ];

  return [
    doc("1003_missing_income.pdf", "1003", {
      borrower: "Maya Missingincome",
      fullName: "Maya Missingincome",
      dob: "01/22/1990",
      ssnLast4: "4432",
      address: "200 Missing Ave Columbus OH 43210",
      loanAmount: 240000,
      propertyValue: 300000,
      creditScore: 710,
      liabilities,
    }),
    doc("Credit_Report_missing_income.pdf", "credit", {
      borrower: "Maya Missingincome",
      fullName: "Maya Missingincome",
      creditScore: 710,
      liabilities,
    }),
  ];
}

const cases: RegressionCase[] = [
  {
    name: "Marcus blocked file — canonical workflow layer must preserve hard stop",
    docs: makeMarcusStressDocs(),
    expect: {
      verdict: "blocked",
      blocked: true,
      minDti: 0.15,
      maxDti: 0.35,
      readinessLabels: ["not_ready", "high_risk"],
      minCanonicalConditions: 1,
      maxReadinessScore: 65,
      mustMentionCanonical: ["credit", "hard", "dti"],
      mustHaveOwners: ["underwriter"],
    },
  },
  {
    name: "Clean borrower — canonical workflow layer must not create false blocker",
    docs: makeCleanBorrowerDocs(),
    expect: {
      blocked: false,
      minDti: 0.01,
      maxDti: 0.15,
      readinessLabels: ["near_ready", "clear_to_close", "needs_conditions"],
      minCanonicalConditions: 1,
      minReadinessScore: 50,
    },
  },
  {
    name: "Missing income borrower — workflow layer should fail closed as not ready",
    docs: makeMissingIncomeDocs(),
    expect: {
      blocked: true,
      minCanonicalConditions: 1,
      readinessLabels: ["not_ready", "high_risk"],
      maxReadinessScore: 65,
      mustMentionCanonical: ["income"],
      mustHaveOwners: ["processor"],
    },
  },
];

async function run() {
  let passed = 0;
  const failures: string[] = [];

  for (const testCase of cases) {
    try {
      const result = await analyzeApplication(testCase.docs as any, {
        applicationId: `workflow-regression-${testCase.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        analysisVersion: "workflow-regression-v1",
      });

      const dti = getDti(result);

      if (testCase.expect.verdict) {
        const verdict = normalizeText(result?.decision?.state || result?.verdict).toLowerCase();
        if (verdict !== testCase.expect.verdict.toLowerCase()) {
          throw new Error(`Unexpected verdict "${verdict || "missing"}"; expected ${testCase.expect.verdict}`);
        }
      }

      assertRange("DTI", dti, testCase.expect.minDti, testCase.expect.maxDti);
      assertCanonicalConditions(result, testCase.expect.minCanonicalConditions);
      assertReadiness(
        result,
        testCase.expect.readinessLabels,
        testCase.expect.minReadinessScore,
        testCase.expect.maxReadinessScore
      );
      assertBlockedAlignment(result, testCase.expect.blocked);
      assertMentionsCanonical(result, testCase.expect.mustMentionCanonical);
      assertOwners(result, testCase.expect.mustHaveOwners);

      passed += 1;
      console.log(`PASS: ${testCase.name}`);
      console.log(
        `  verdict=${result?.decision?.state ?? "unknown"} risk=${result?.decision?.risk ?? "unknown"} dti=${dti ?? "missing"} readiness=${result?.readiness?.readinessLabel ?? "missing"} score=${result?.readiness?.readinessScore ?? "missing"} canonical=${Array.isArray(result?.canonicalConditions) ? result.canonicalConditions.length : 0}`
      );
    } catch (error: any) {
      const message = error?.message || String(error);
      failures.push(`${testCase.name}: ${message}`);
      console.error(`FAIL: ${testCase.name}`);
      console.error(`  ${message}`);
    }
  }

  console.log(`\nWorkflow regression result: ${passed}/${cases.length} passed`);

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
