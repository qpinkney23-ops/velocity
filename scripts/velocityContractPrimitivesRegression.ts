import {
  createMoney, createProvenance, legacyRatioConventionFixtures, representativeLegacyFixtures,
  roundFractionRatio, roundNonnegativePercentagePoints,
  validateApplicationId, validateAuditEventId, validateBorrowerId, validateConditionId,
  validateDecisionPackageId, validateDocumentId, validateEngineVersion, validateEvidenceId,
  validateFractionRatio, validateIsoTimestamp, validateJobId,
  validateNonnegativePercentagePoints, validateReportArtifactId, validateReportVersion,
  validateRuleVersion, validateSchemaVersion, validateTenantId, validateUserId,
  type ApplicationId, type BorrowerId, type DocumentId, type FractionRatio,
  type Money, type NonnegativePercentagePoints, type TenantId, type UserId,
} from "../lib/contracts";
import fs from "fs";
import path from "path";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

function dedicatedIdentifiersAndVersions() {
  const tenant = validateTenantId("tenant_fixture-001");
  const user = validateUserId("user_fixture-001");
  const application = validateApplicationId("application_fixture-001");
  const borrower = validateBorrowerId("borrower_fixture-001");
  const document = validateDocumentId("document_fixture-001");
  const evidence = validateEvidenceId("evidence_fixture-001");
  const condition = validateConditionId("condition_fixture-001");
  const decision = validateDecisionPackageId("decision_fixture-001");
  const job = validateJobId("job_fixture-001");
  const audit = validateAuditEventId("audit_fixture-001");
  const report = validateReportArtifactId("report_fixture-001");
  assert(tenant.ok && user.ok && application.ok && borrower.ok && document.ok && evidence.ok, "dedicated identity constructors");
  assert(condition.ok && decision.ok && job.ok && audit.ok && report.ok, "dedicated artifact constructors");

  const tenantId: TenantId = tenant.value;
  const userId: UserId = user.value;
  const applicationId: ApplicationId = application.value;
  const borrowerId: BorrowerId = borrower.value;
  const documentId: DocumentId = document.value;
  void tenantId; void userId; void applicationId; void borrowerId; void documentId;

  // Public dedicated validators accept no caller-selected brand type argument.
  // @ts-expect-error validateApplicationId cannot be asked to return UserId.
  validateApplicationId<UserId>("application_fixture-001");
  // @ts-expect-error validateTenantId cannot be asked to return BorrowerId.
  validateTenantId<BorrowerId>("tenant_fixture-001");

  assert(validateSchemaVersion("schema.v1").ok, "schema version");
  assert(validateEngineVersion("engine.v1").ok, "engine version");
  assert(validateRuleVersion("rules.v1").ok, "rule version");
  assert(validateReportVersion("report.v1").ok, "report version");
  // @ts-expect-error validateSchemaVersion cannot be asked to return another version brand.
  validateSchemaVersion<ReturnType<typeof validateEngineVersion>>("schema.v1");

  const pii = "Fixture Borrower fixture.borrower@example.invalid";
  const invalid = validateApplicationId(pii);
  assert(!invalid.ok, "invalid ID rejected");
  assert(!invalid.message.includes("Fixture Borrower") && !invalid.message.includes("example.invalid"), "ID error is PII-safe");
  assert(!validateApplicationId("").ok, "empty ID rejected");
}

function timestamps() {
  assert(validateIsoTimestamp("2026-07-10T12:34:56Z").ok, "valid ISO timestamp");
  assert(validateIsoTimestamp("2026-07-10T12:34:56.123Z").ok, "valid milliseconds");
  assert(!validateIsoTimestamp("2026-02-30T12:34:56Z").ok, "impossible date rejected");
  assert(!validateIsoTimestamp("07/10/2026 12:34:56").ok, "non-ISO rejected");
}

function money() {
  const result = createMoney(12345, "USD");
  assert(result.ok && result.value.cents === 12345 && result.value.currency === "USD", "integer cents retained");
  assert(!createMoney(123.45, "USD").ok, "floating dollar-like value rejected");
  assert(!createMoney(-1, "USD").ok, "negative rejected by default");
  assert(createMoney(-1, "USD", { allowNegative: true }).ok, "explicit negative allowed");
  const explicit: Money = result.value;
  // @ts-expect-error raw floating-point dollars cannot be assigned to Money.
  const ambiguousDollars: Money = 123.45;
  void explicit; void ambiguousDollars;
}

function ratioRepresentations() {
  const fraction = validateFractionRatio(0.57);
  const fiftySeven = validateNonnegativePercentagePoints(57);
  const oneTwentyOne = validateNonnegativePercentagePoints(121);
  assert(fraction.ok, "0.57 normalized fraction valid");
  assert(!validateFractionRatio(1.21).ok, "1.21 normalized fraction rejected");
  assert(fiftySeven.ok && fiftySeven.value === 57, "57 percentage points preserved");
  assert(oneTwentyOne.ok && oneTwentyOne.value === 121, "121 percentage points preserved for domain review");
  assert(!validateNonnegativePercentagePoints(-0.01).ok, "negative percentage points rejected");
  assert(roundFractionRatio(fraction.value, 2) === 0.57, "fraction rounding preserves representation");
  assert(roundNonnegativePercentagePoints(oneTwentyOne.value, 1) === 121, "percentage rounding preserves representation");
  const f: FractionRatio = fraction.value;
  const p: NonnegativePercentagePoints = fiftySeven.value;
  // @ts-expect-error percentage points cannot be assigned to a normalized fraction.
  const wrongFraction: FractionRatio = p;
  // @ts-expect-error normalized fractions cannot be assigned to percentage points.
  const wrongPercentage: NonnegativePercentagePoints = f;
  void wrongFraction; void wrongPercentage;
}

function provenanceMethods() {
  const manual = createProvenance({
    extractionMethod: "manual", confidence: 1, assumption: false,
    producer: "fixture-user-entry", schemaVersion: "schema.v1",
  });
  assert(manual.ok && manual.value.sources.length === 0 && manual.value.evidenceIds.length === 0, "manual provenance needs no fake document");

  const derived = createProvenance({
    sources: [{ documentId: "document_fixture-001" }, { documentId: "document_fixture-002", location: { pageNumber: 4, locator: "income table" } }],
    evidenceIds: ["evidence_fixture-001", "evidence_fixture-002"],
    extractionMethod: "derived", confidence: 0.88, assumption: true,
    producer: "fixture-calculation", schemaVersion: "schema.v1",
  });
  assert(derived.ok && derived.value.sources.length === 2 && derived.value.evidenceIds.length === 2, "derived provenance retains multiple inputs");

  const ocr = createProvenance({
    sources: [{ documentId: "document_fixture-003", location: { pageNumber: 2, region: { x: 10, y: 20, width: 30, height: 40 } } }],
    extractionMethod: "ocr", confidence: 0.91, assumption: false,
    producer: "fixture-ocr", schemaVersion: "schema.v1",
  });
  assert(ocr.ok, "OCR provenance valid");
  assert(ocr.value.sources[0].documentId === "document_fixture-003", "OCR document retained");
  assert(ocr.value.sources[0].location?.pageNumber === 2 && ocr.value.sources[0].location?.region?.width === 30, "OCR page/location retained");

  assert(!createProvenance({ extractionMethod: "ocr", confidence: 0.8, assumption: false, producer: "fixture-ocr", schemaVersion: "schema.v1" }).ok, "OCR requires source document");
  assert(!createProvenance({ extractionMethod: "derived", confidence: 0.8, assumption: false, producer: "fixture-engine", schemaVersion: "schema.v1" }).ok, "derived requires source or evidence input");
}

function fixtures() {
  assert(Object.keys(representativeLegacyFixtures).length === 7, "seven fixture groups");
  assert(Object.isFrozen(representativeLegacyFixtures), "fixture registry frozen");
  assert(legacyRatioConventionFixtures.deterministicAnalysis.value === 0.57, "legacy fraction frozen");
  assert(legacyRatioConventionFixtures.underwritingReport.value === 57, "legacy percentage frozen");
}

function noProductionImports() {
  const roots = ["app", "components", "lib"];
  const violations: string[] = [];
  const visit = (relative: string) => {
    for (const entry of fs.readdirSync(relative, { withFileTypes: true })) {
      const child = path.join(relative, entry.name);
      if (entry.isDirectory()) {
        if (child.replace(/\\/g, "/") === "lib/contracts") continue;
        visit(child);
      } else if (/\.(ts|tsx)$/.test(entry.name)) {
        const source = fs.readFileSync(child, "utf8");
        if (/from\s+["'][^"']*lib\/contracts|from\s+["'][^"']*\/contracts["']/.test(source.replace(/\\/g, "/"))) {
          violations.push(child);
        }
      }
    }
  };
  roots.forEach(visit);
  assert(violations.length === 0, `production contract imports found: ${violations.join(", ")}`);
}

const tests = [
  ["dedicated identifiers and versions", dedicatedIdentifiersAndVersions],
  ["timestamps", timestamps], ["money", money],
  ["ratio representations", ratioRepresentations],
  ["method-aware provenance", provenanceMethods], ["legacy fixtures", fixtures],
  ["no production imports", noProductionImports],
] as const;
let passed = 0; const failures: string[] = [];
for (const [name, test] of tests) {
  try { test(); passed++; console.log(`PASS: ${name}`); }
  catch (error: any) { const m = error?.message || String(error); failures.push(`${name}: ${m}`); console.error(`FAIL: ${name}\n  ${m}`); }
}
console.log(`\nContract primitive regression result: ${passed}/${tests.length} passed`);
if (failures.length) { failures.forEach((f) => console.log(`- ${f}`)); process.exitCode = 1; }
