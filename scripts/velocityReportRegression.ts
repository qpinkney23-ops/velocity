import { analyzeApplication } from "../lib/ai/analyzeApplication";
import { buildUnderwritingReport } from "../lib/ai/buildUnderwritingReport";
import { renderUnderwritingPdf } from "../lib/ai/renderUnderwritingPdf";

type AnyDoc = Record<string, any>;

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
      email: "marcus@example.com",
      dob: "03/14/1989",
      ssnLast4: "4821",
      address: "4921 W Lake Rd Apt 3B Chicago IL 60614",
      employerAddress: "1900 N Halsted St Ste 240 Chicago IL",
      income: 75000,
      loanAmount: 285000,
      propertyValue: 300000,
      creditScore: 642,
      assets: 12500,
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

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

async function run() {
  const analysis = await analyzeApplication(makeMarcusStressDocs() as any, {
    applicationId: "report-regression-marcus",
    analysisVersion: "report-regression-v1",
  });

  assert(analysis, "Analysis result missing");
  assert(analysis.decision?.state === "blocked", `Expected Marcus to remain blocked, got ${analysis.decision?.state}`);
  assert(Array.isArray((analysis as any).canonicalConditions), "Analysis canonicalConditions missing");
  assert((analysis as any).canonicalConditions.length > 0, "Analysis canonicalConditions empty");
  assert((analysis as any).readiness, "Analysis readiness missing");
  assert((analysis as any).readiness.readinessLabel === "not_ready", `Expected readiness not_ready, got ${(analysis as any).readiness?.readinessLabel}`);

  const report = buildUnderwritingReport(analysis as any, {
    borrower: analysis.normalized.fullName || analysis.normalized.borrower || "Marcus D Ellington",
    email: analysis.normalized.email || "marcus@example.com",
    loanNumber: (analysis.normalized as any).loanNumber || "",
    loanAmount: analysis.normalized.loanAmount ?? 0,
    propertyValue: analysis.normalized.propertyValue ?? 0,
    income: analysis.normalized.income ?? 0,
    debts: analysis.normalized.debts ?? 0,
    assets: analysis.normalized.assets ?? 0,
    dti: (analysis as any).normalized?.dti ?? undefined,
  });

  assert(report, "Report missing");
  assert(report.summary?.decision, "Report summary decision missing");
  assert(report.financials?.housingPaymentBreakdown, "Report housingPaymentBreakdown missing");
  assert((report as any).workflow, "Report workflow section missing");
  assert((report as any).workflow?.readiness, "Report workflow readiness missing");
  assert(
    (report as any).workflow?.readiness?.readinessLabel === "not_ready",
    `Expected report readiness not_ready, got ${(report as any).workflow?.readiness?.readinessLabel}`
  );
  assert(
    Array.isArray((report as any).workflow?.canonicalConditions),
    "Report workflow canonicalConditions missing"
  );
  assert(
    (report as any).workflow?.canonicalConditions?.length > 0,
    "Report workflow canonicalConditions empty"
  );

  const pdf = await renderUnderwritingPdf({
    applicationId: "report-regression-marcus",
    borrowerName: analysis.normalized.fullName || analysis.normalized.borrower || "Marcus D Ellington",
    borrowerEmail: analysis.normalized.email || "marcus@example.com",
    report,
  });

  assert(Buffer.isBuffer(pdf), "PDF result is not a Buffer");
  assert(pdf.length > 1000, `PDF buffer too small: ${pdf.length}`);
  assert(pdf.slice(0, 4).toString("utf8") === "%PDF", "PDF buffer missing %PDF header");

  console.log("PASS: Report workflow regression");
  console.log(
    `  decision=${report.summary.decision} readiness=${(report as any).workflow.readiness.readinessLabel} score=${(report as any).workflow.readiness.readinessScore} canonical=${(report as any).workflow.canonicalConditions.length} pdfBytes=${pdf.length}`
  );
}

run().catch((error) => {
  console.error("FAIL: Report workflow regression");
  console.error(`  ${error?.message || String(error)}`);
  process.exitCode = 1;
});
