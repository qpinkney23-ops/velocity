/** Synthetic legacy application-list shapes. No fixture contains real borrower data. */
function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value as Record<string, unknown>).forEach(deepFreeze);
  }
  return value as Readonly<T>;
}

function timestamp(iso: string) {
  const date = new Date(iso);
  return {
    seconds: Math.floor(date.getTime() / 1000),
    nanoseconds: 0,
    toDate: () => new Date(date.getTime()),
  };
}

const base = {
  id: "application_fixture-001",
  tenantId: "tenant_fixture-001",
  borrowerName: "Fixture Borrower",
  email: "fixture.borrower@example.invalid",
  loanNumber: "FIXTURE-LOAN-001",
  loanAmount: 325000.25,
  propertyValue: 400000,
  propertyAddress: "100 Fixture Ave, Test City, OH 43000",
  loanPurpose: "Synthetic fixture purpose",
  programName: "Synthetic fixture program",
  status: "In Review",
  underwriterId: "user_underwriter-001",
  storedDocs: [{ name: "Fixture 1003.pdf" }, { name: "Fixture Credit.pdf" }],
  uwConditions: [
    { id: "condition-001", status: "open", blocking: true },
    { id: "condition-002", status: "done", blocking: false },
  ],
  createdAt: timestamp("2026-01-01T00:00:00.000Z"),
  updatedAt: timestamp("2026-01-02T00:00:00.000Z"),
  schemaVersion: "legacy.application.v0",
};

export const applicationSummaryUnderwriterFixtures = deepFreeze([
  { id: "user_underwriter-001", name: "Fixture Underwriter", email: "underwriter@example.invalid" },
]);

export const legacyApplicationSummaryFixtures = deepFreeze({
  normalAssigned: { ...base },
  unassigned: { ...base, id: "application_fixture-002", underwriterId: "" },
  missingTenantOwnership: { ...base, id: "application_fixture-003", tenantId: undefined },
  missingOptionalFields: {
    id: "application_fixture-004", tenantId: "tenant_fixture-001",
    borrowerName: "Minimal Fixture", email: "minimal@example.invalid",
    loanAmount: 100000, status: "New",
    createdAt: timestamp("2026-02-01T00:00:00.000Z"),
    updatedAt: timestamp("2026-02-01T00:00:00.000Z"),
  },
  legacyDollarAmount: { ...base, id: "application_fixture-005", loanAmount: 123456.78 },
  malformedMoney: { ...base, id: "application_fixture-006", loanAmount: "325000.25", propertyValue: 400000.123 },
  unknownStatus: { ...base, id: "application_fixture-007", status: "Instantly Complete" },
  missingBorrowerDisplayName: {
    ...base, id: "application_fixture-008", borrowerName: "", email: "",
    scan: { extracted: { borrower: "", email: "scan-fallback@example.invalid" } },
  },
  coBorrowerPresent: { ...base, id: "application_fixture-009", coBorrowerName: "Fixture Co-Borrower" },
  missingTimestamps: { ...base, id: "application_fixture-010", createdAt: undefined, updatedAt: undefined },
  analysisDecisionPresent: {
    ...base, id: "application_fixture-011", schemaVersion: undefined, processingStage: "ai_completed",
    scan: {
      analysisRouteVersion: "stable_route_dirty_id_name_lock_v3",
      scannedAtMs: 1767398400000,
      extracted: { borrower: "Fixture Borrower", email: "fixture.borrower@example.invalid" },
      ai: { verdict: "review_required" },
      readiness: { readinessLabel: "needs_conditions" },
    },
  },
  legacyCompatibilityMetadata: {
    ...base, id: "application_fixture-012", tenantId: undefined,
    schemaVersion: undefined, analysisVersion: "legacy-analysis-v3", status: undefined,
    borrowerName: "", scan: { extracted: { borrower: "Scan Fixture Borrower", email: "scan@example.invalid" } },
    underwriterId: "user_missing-directory-entry",
  },
});

export type LegacyApplicationSummaryFixtures = typeof legacyApplicationSummaryFixtures;
