import fs from "fs";
import path from "path";
import {
  APPLICATION_SUMMARY_SCHEMA_VERSION,
  applicationSummaryUnderwriterFixtures,
  convertLegacyDollarsToMoney,
  legacyApplicationSummaryFixtures,
  parseLegacyApplicationSummary,
} from "../lib/contracts";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

function parse(name: keyof typeof legacyApplicationSummaryFixtures) {
  const result = parseLegacyApplicationSummary(legacyApplicationSummaryFixtures[name], {
    underwriters: applicationSummaryUnderwriterFixtures,
  });
  assert(result.ok, `${name} should parse`);
  assert(result.value.schemaVersion === APPLICATION_SUMMARY_SCHEMA_VERSION, `${name} schema version`);
  assert(result.value.compatibility.source === "legacy_applications_page", `${name} compatibility source`);
  return result.value;
}

function deterministicAndImmutable() {
  for (const name of Object.keys(legacyApplicationSummaryFixtures) as Array<keyof typeof legacyApplicationSummaryFixtures>) {
    const fixture = legacyApplicationSummaryFixtures[name];
    const before = JSON.stringify(fixture);
    const first = parse(name);
    const second = parse(name);
    assert(JSON.stringify(first) === JSON.stringify(second), `${name} deterministic`);
    assert(JSON.stringify(fixture) === before, `${name} input unchanged`);
    assert(Object.isFrozen(fixture), `${name} fixture frozen`);
  }
}

function moneyConversion() {
  const exact = convertLegacyDollarsToMoney(123456.78);
  assert(exact.money?.cents === 12345678, "exact dollar-to-cent conversion");
  assert(convertLegacyDollarsToMoney("123456.78").issue === "invalid", "numeric string rejected");
  assert(convertLegacyDollarsToMoney(1.234).issue === "ambiguous", "fractional cent rejected");
  const malformed = parse("malformedMoney");
  assert(malformed.loanAmount === null, "malformed loan amount absent");
  assert(malformed.purchasePriceOrPropertyValue === undefined, "ambiguous property value absent");
  assert(malformed.compatibility.warnings.some((w) => w.code === "invalid_money"), "invalid money warning");
  assert(malformed.compatibility.warnings.some((w) => w.code === "ambiguous_money"), "ambiguous money warning");
}

function tenantAndIdentitySafety() {
  const missingTenant = parse("missingTenantOwnership");
  assert(missingTenant.tenantId === null, "tenant is not invented");
  assert(missingTenant.compatibility.warnings.some((w) => w.code === "missing_tenant"), "missing tenant warning");

  const pii = "Fixture Person fixture.person@example.invalid";
  const invalid = parseLegacyApplicationSummary({ id: pii, borrowerName: pii });
  assert(!invalid.ok, "invalid required ID fails");
  assert(!invalid.message.includes("Fixture Person") && !invalid.message.includes("example.invalid"), "identity error is PII-safe");
}

function safeStatusesAndOptionality() {
  const unknown = parse("unknownStatus");
  assert(unknown.applicationStatus === "unknown", "unknown status stays unknown");
  assert(unknown.compatibility.pageParity.statusDisplay === "Instantly Complete", "legacy visible status retained");
  assert(unknown.compatibility.warnings.some((w) => w.code === "unknown_application_status"), "unknown status warning");

  const minimal = parse("missingOptionalFields");
  assert(minimal.coBorrowerDisplayName === undefined && minimal.loanNumber === undefined, "optional values absent");
  assert(minimal.loanProgram === undefined && minimal.propertyAddressSummary === undefined, "optional loan values absent");
  assert(minimal.assignedUnderwriterId === undefined && minimal.assignedUnderwriterDisplayName === undefined, "optional assignment absent");
}

function borrowerAndAnalysis() {
  const single = parse("normalAssigned");
  const coBorrower = parse("coBorrowerPresent");
  assert(single.coBorrowerDisplayName === undefined, "single borrower unchanged");
  assert(coBorrower.coBorrowerDisplayName === "Fixture Co-Borrower", "co-borrower represented");

  const missing = parse("missingBorrowerDisplayName");
  assert(missing.borrowerDisplayName === "Borrower", "page borrower fallback preserved");
  assert(missing.compatibility.pageParity.email === "scan-fallback@example.invalid", "scan email fallback preserved");
  assert(missing.compatibility.warnings.some((w) => w.code === "missing_borrower_name"), "missing borrower warning");

  const analyzed = parse("analysisDecisionPresent");
  assert(analyzed.readinessStatus === "needs_conditions", "readiness retained");
  assert(analyzed.decisionStatus === "review_required", "decision retained without reinterpretation");
  assert(analyzed.processingStage === "ai_completed", "processing stage retained");
  assert(analyzed.lastAnalysisAt === "2026-01-03T00:00:00.000Z", "analysis timestamp retained");
  assert(analyzed.compatibility.sourceRecordVersion === "stable_route_dirty_id_name_lock_v3", "source version retained");
}

function pageParity() {
  const normal = parse("normalAssigned");
  assert(normal.borrowerDisplayName === "Fixture Borrower", "borrower parity");
  assert(normal.loanAmount?.cents === 32500025, "loan amount canonical parity");
  assert(normal.applicationStatus === "in_review", "status canonical parity");
  assert(normal.assignedUnderwriterId === "user_underwriter-001", "assignment parity");
  assert(normal.assignedUnderwriterDisplayName === "Fixture Underwriter", "underwriter name parity");
  assert(normal.createdAt === "2026-01-01T00:00:00.000Z", "created timestamp parity");
  assert(normal.updatedAt === "2026-01-02T00:00:00.000Z", "updated timestamp parity");
  assert(normal.compatibility.pageParity.loanAmountDisplay === "$325,000", "legacy rounded display parity");
  assert(normal.compatibility.pageParity.underwriterDisplay === "Fixture Underwriter", "legacy underwriter display parity");
  assert(normal.documentCount === 2 && normal.openConditionCount === 1 && normal.blockingConditionCount === 1, "structural counts");

  const unassigned = parse("unassigned");
  assert(unassigned.compatibility.pageParity.underwriterDisplay === "Unassigned", "unassigned parity");
  const noTime = parse("missingTimestamps");
  assert(noTime.createdAt === null && noTime.updatedAt === null, "missing timestamps remain absent");
  assert(noTime.compatibility.pageParity.updatedMs === 0, "legacy timestamp fallback parity");
}

function compatibilityMetadata() {
  const legacy = parse("legacyCompatibilityMetadata");
  assert(legacy.borrowerDisplayName === "Scan Fixture Borrower", "scan borrower fallback parity");
  assert(legacy.applicationStatus === "new" && legacy.compatibility.pageParity.statusDisplay === "New", "missing status page parity");
  assert(legacy.assignedUnderwriterDisplayName === undefined, "unmatched assignment name not invented");
  assert(legacy.compatibility.pageParity.underwriterDisplay === "Assigned", "legacy assigned label retained");
  assert(legacy.compatibility.sourceRecordVersion === "legacy-analysis-v3", "legacy metadata retained");
  assert(legacy.compatibility.warnings.length > 0, "compatibility warnings retained");
}

function noProductionImports() {
  const violations: string[] = [];
  const visit = (relative: string) => {
    for (const entry of fs.readdirSync(relative, { withFileTypes: true })) {
      const child = path.join(relative, entry.name);
      if (entry.isDirectory()) {
        if (child.replace(/\\/g, "/") === "lib/contracts") continue;
        visit(child);
      } else if (/\.(ts|tsx)$/.test(entry.name)) {
        const source = fs.readFileSync(child, "utf8").replace(/\\/g, "/");
        if (/from\s+["'][^"']*(applicationSummary|lib\/contracts|\/contracts)["']/.test(source)) violations.push(child);
      }
    }
  };
  ["app", "components", "lib"].forEach(visit);
  assert(violations.length === 0, `production imports found: ${violations.join(", ")}`);
}

const tests = [
  ["fixtures parse deterministically without mutation", deterministicAndImmutable],
  ["legacy money conversion is exact and conservative", moneyConversion],
  ["tenant and identity failures are explicit and safe", tenantAndIdentitySafety],
  ["unknown statuses and optional values fail closed", safeStatusesAndOptionality],
  ["borrower and analysis fields retain meaning", borrowerAndAnalysis],
  ["applications-page visible values retain parity", pageParity],
  ["legacy metadata and warnings remain explicit", compatibilityMetadata],
  ["no production file imports the adapter", noProductionImports],
] as const;

let passed = 0; const failures: string[] = [];
for (const [name, test] of tests) {
  try { test(); passed++; console.log(`PASS: ${name}`); }
  catch (error: any) { const message = error?.message || String(error); failures.push(`${name}: ${message}`); console.error(`FAIL: ${name}\n  ${message}`); }
}
console.log(`\nApplication summary contract regression result: ${passed}/${tests.length} passed`);
if (failures.length) { failures.forEach((failure) => console.log(`- ${failure}`)); process.exitCode = 1; }
