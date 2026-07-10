/** De-identified frozen examples of observed legacy shapes; not canonical schemas. */
function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value as Record<string, unknown>).forEach(deepFreeze);
  }
  return value as Readonly<T>;
}

export const legacyApplicationFixture = deepFreeze({
  id: "fixture-application-001", borrowerName: "Fixture Borrower",
  email: "fixture.borrower@example.invalid", loanNumber: "FIXTURE-LOAN-001",
  loanAmount: 325000, status: "In Review", underwriterId: "fixture-underwriter-001",
  notes: "Synthetic contract fixture; contains no borrower data.",
  createdAt: { seconds: 1767225600, nanoseconds: 0 },
  updatedAt: { seconds: 1767312000, nanoseconds: 0 },
});

export const legacyBorrowerProfileFixture = deepFreeze({
  borrowerProfile: {
    fullName: { value: "Fixture Borrower", status: "extracted", source: "Fixture 1003.pdf", updatedAtMs: 1767312000000 },
    income: { value: 96000, status: "extracted", source: "Fixture Paystub.pdf", updatedAtMs: 1767312000000 },
    creditScore: { value: 720, status: "extracted", source: "Fixture Credit.pdf", updatedAtMs: 1767312000000 },
    dti: { value: 0.57, status: "derived", source: "analysis", updatedAtMs: 1767312000000 },
  },
  borrowerProfileVerified: { fullName: true, income: false, creditScore: false },
  borrowerName: "Fixture Borrower", email: "fixture.borrower@example.invalid",
});

export const legacyDocumentMetadataFixture = deepFreeze({
  name: "Fixture_1003.pdf", url: "https://example.invalid/fixture-document",
  path: "applications/fixture-application-001/1767312000000_Fixture_1003.pdf",
  uploadedAtMs: 1767312000000,
});

export const legacyAnalysisDecisionFixture = deepFreeze({
  ok: true, id: "fixture-application-001", mode: "pdf-parse",
  analysisRouteVersion: "stable_route_dirty_id_name_lock_v3", docName: "Fixture_1003.pdf",
  extracted: {
    borrower: "Fixture Borrower", fullName: "Fixture Borrower",
    email: "fixture.borrower@example.invalid", loanAmount: 325000,
    income: 96000, creditScore: 720, assets: null, debts: null, propertyValue: null,
  },
  ai: {
    verdict: "review_required", risk: "low", confidence: 0.84, score: 84,
    reason: "Document parsed successfully.", dti: null, ltv: null,
    conditions: [], factors: [],
  },
  report: null,
});

export const legacyConditionFixture = deepFreeze({
  id: "manual_fixture-condition-001",
  label: "Verify synthetic fixture income documentation",
  severity: "med", status: "open", source: "manual",
  evidence: "Synthetic fixture evidence only.",
  createdAtMs: 1767312000000, updatedAtMs: 1767312000000,
});

export const legacyReportFixture = deepFreeze({
  summary: { decision: "REVIEW_REQUIRED", risk: "LOW", score: 84, confidence: 0.84 },
  borrower: { name: "Fixture Borrower", email: "fixture.borrower@example.invalid", loanNumber: "FIXTURE-LOAN-001" },
  loan: { loanAmount: 325000, propertyValue: 400000, ltv: 81.25 },
  financials: {
    income: 96000, debts: 4560, dti: 57, totalDti: 57, assets: 50000,
    housingPaymentBreakdown: {
      principalAndInterest: 0, taxes: 0, insurance: 0, mortgageInsurance: 0,
      hoa: 0, total: 0, estimatedRate: null, assumptionSource: "estimated", confidence: "low",
    },
  },
  decision: { reason: "Synthetic fixture report.", conditions: [] }, factors: [],
});

export const legacyRatioConventionFixtures = deepFreeze({
  deterministicAnalysis: {
    field: "dti", representation: "fraction", value: 0.57,
    observedIn: "lib/ai/applicationAnalysisSchema.ts NormalizedMetrics",
  },
  underwritingReport: {
    field: "dti", representation: "percentage_points", value: 57,
    observedIn: "lib/ai/buildUnderwritingReport.ts safePercent/UnderwritingReport",
  },
});

export const representativeLegacyFixtures = deepFreeze({
  application: legacyApplicationFixture,
  borrowerProfile: legacyBorrowerProfileFixture,
  documentMetadata: legacyDocumentMetadataFixture,
  analysisDecision: legacyAnalysisDecisionFixture,
  condition: legacyConditionFixture,
  report: legacyReportFixture,
  ratioConventions: legacyRatioConventionFixtures,
});

export type LegacyApplicationFixture = typeof legacyApplicationFixture;
export type LegacyBorrowerProfileFixture = typeof legacyBorrowerProfileFixture;
export type LegacyDocumentMetadataFixture = typeof legacyDocumentMetadataFixture;
export type LegacyAnalysisDecisionFixture = typeof legacyAnalysisDecisionFixture;
export type LegacyConditionFixture = typeof legacyConditionFixture;
export type LegacyReportFixture = typeof legacyReportFixture;
