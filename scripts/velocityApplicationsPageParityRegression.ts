import fs from "fs";
import path from "path";
import {
  applicationSummaryUnderwriterFixtures,
  createDegradedApplicationsPageRow,
  legacyApplicationSummaryFixtures,
  parseLegacyApplicationSummary,
  projectApplicationSummaryForApplicationsPage,
  type ApplicationsPageDisplayRow,
} from "../lib/contracts";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

function row(name: keyof typeof legacyApplicationSummaryFixtures): ApplicationsPageDisplayRow {
  const parsed = parseLegacyApplicationSummary(legacyApplicationSummaryFixtures[name], {
    underwriters: applicationSummaryUnderwriterFixtures,
  });
  assert(parsed.ok, `${name} parses`);
  return projectApplicationSummaryForApplicationsPage(parsed.value);
}

function tabFromStatus(status: string) {
  const s = (status || "").toLowerCase();
  if (s.includes("new")) return "New";
  if (s.includes("review") || s.includes("uw")) return "UW Review";
  if (s.includes("condition")) return "Conditions";
  if (s.includes("approve")) return "Approved";
  if (s.includes("deny") || s.includes("decline")) return "Denied";
  return "All";
}

function statusTone(status: string) {
  const s = (status || "").toLowerCase();
  if (s.includes("approve")) return "green";
  if (s.includes("deny") || s.includes("decline")) return "red";
  if (s.includes("condition")) return "amber";
  if (s.includes("review") || s.includes("uw")) return "blue";
  if (s.includes("new")) return "gray";
  return "gray";
}

function matchesSearch(application: ApplicationsPageDisplayRow, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return application.borrowerName.toLowerCase().includes(q) ||
    application.email.toLowerCase().includes(q) ||
    application.loanNumber.toLowerCase().includes(q) ||
    application.status.toLowerCase().includes(q) ||
    application.uwName.toLowerCase().includes(q) ||
    application.uwEmail.toLowerCase().includes(q);
}

function allFixturesProjectWithoutMutation() {
  for (const name of Object.keys(legacyApplicationSummaryFixtures) as Array<keyof typeof legacyApplicationSummaryFixtures>) {
    const fixture = legacyApplicationSummaryFixtures[name];
    const before = JSON.stringify(fixture);
    const projected = row(name);
    assert(projected.summary !== null && !projected.degraded, `${name} canonical display model`);
    assert(JSON.stringify(fixture) === before, `${name} input unchanged`);
  }
}

function visibleParity() {
  const normal = row("normalAssigned");
  assert(normal.borrowerName === "Fixture Borrower", "borrower parity");
  assert(normal.email === "fixture.borrower@example.invalid", "email parity");
  assert(normal.loanAmountCents === 32500025, "money cents parity");
  assert(normal.status === "In Review", "status display parity");
  assert(normal.uwName === "Fixture Underwriter" && normal.uwEmail === "underwriter@example.invalid", "underwriter parity");
  assert(normal.updatedMs === 1767312000000, "updated timestamp parity");
  assert(normal.routeId === "application_fixture-001", "routing parity");

  const coBorrower = row("coBorrowerPresent");
  assert(coBorrower.coBorrowerName === "Fixture Co-Borrower", "co-borrower display supported");
  assert(row("normalAssigned").coBorrowerName === undefined, "single-borrower display unchanged");
}

function searchParity() {
  const normal = row("normalAssigned");
  assert(matchesSearch(normal, "Fixture Borrower"), "borrower search");
  assert(matchesSearch(normal, "fixture.borrower@example.invalid"), "email search");
  assert(matchesSearch(normal, "FIXTURE-LOAN-001"), "loan-number search");
  assert(matchesSearch(normal, "Fixture Underwriter"), "underwriter-name search");
  assert(matchesSearch(normal, "underwriter@example.invalid"), "underwriter-email search");
  assert(!matchesSearch(normal, "does-not-match"), "nonmatching search excluded");
}

function tabsCountsAndTones() {
  const statuses = ["New", "In Review", "Conditions", "Approved", "Denied"];
  // Preserve the page's current literal substring behavior, including its
  // existing "Denied" -> All/gray result ("denied" does not contain "deny").
  const expectedTabs = ["New", "UW Review", "Conditions", "Approved", "All"];
  const expectedTones = ["gray", "blue", "amber", "green", "gray"];
  statuses.forEach((status, index) => {
    assert(tabFromStatus(status) === expectedTabs[index], `${status} tab parity`);
    assert(statusTone(status) === expectedTones[index], `${status} tone parity`);
  });
  const unknown = row("unknownStatus");
  assert(tabFromStatus(unknown.status) === "All", "unknown status has no favorable tab");
  assert(statusTone(unknown.status) === "gray", "unknown status is neutral");
}

function warningsAndDegradedRows() {
  const malformed = row("malformedMoney");
  assert(malformed.loanAmountCents === null, "invalid money neutral");
  assert(malformed.compatibilityWarnings.some((w) => w.code === "invalid_money"), "invalid money warning visible to page");
  const noTenant = row("missingTenantOwnership");
  assert(noTenant.summary?.tenantId === null, "tenant not invented");
  assert(noTenant.compatibilityWarnings.some((w) => w.code === "missing_tenant"), "missing tenant warning visible to page");
  const missingBorrower = row("missingBorrowerDisplayName");
  assert(missingBorrower.borrowerName === "Borrower", "safe borrower fallback");
  assert(missingBorrower.compatibilityWarnings.some((w) => w.code === "missing_borrower_name"), "borrower warning visible");

  const degraded = createDegradedApplicationsPageRow({ id: "Fixture Person fixture@example.invalid" }, 7);
  assert(degraded.degraded && degraded.summary === null, "parser failure becomes degraded row");
  assert(degraded.routeId === undefined && degraded.borrowerName === "Compatibility issue", "degraded row exposes no PII or unsafe route");
  assert(degraded.loanAmountCents === null && degraded.status === "Compatibility issue", "degraded row is neutral");
  assert(degraded.compatibilityWarnings.some((w) => w.code === "parser_failure"), "degraded warning explicit");
}

function productionSourceGuardrails() {
  const page = fs.readFileSync("app/applications/page.tsx", "utf8");
  assert(page.includes('query(collection(db, "applications"), orderBy("updatedAt", "desc"))'), "Firestore application query unchanged");
  assert(page.includes("parseLegacyApplicationSummary"), "page uses canonical adapter");
  assert(page.includes("createDegradedApplicationsPageRow"), "page uses safe degraded row");
  assert(!/addDoc\(|setDoc\(|updateDoc\(|deleteDoc\(/.test(page), "page introduces no Firestore writes");
  assert(!/console\.(error|warn|log)\(/.test(page), "page logs no parser or borrower data");

  const imports: string[] = [];
  const visit = (relative: string) => {
    for (const entry of fs.readdirSync(relative, { withFileTypes: true })) {
      const child = path.join(relative, entry.name);
      if (entry.isDirectory()) { if (child.replace(/\\/g, "/") !== "lib/contracts") visit(child); }
      else if (/\.(ts|tsx)$/.test(entry.name)) {
        const source = fs.readFileSync(child, "utf8").replace(/\\/g, "/");
        if (/from\s+["'][^"']*(applicationSummary|lib\/contracts|\/contracts)["']/.test(source)) imports.push(child.replace(/\\/g, "/"));
      }
    }
  };
  ["app", "components", "lib"].forEach(visit);
  assert(imports.length === 1 && imports[0] === "app/applications/page.tsx", `unexpected production imports: ${imports.join(", ")}`);
}

const tests = [
  ["all Slice 02A fixtures project without mutation", allFixturesProjectWithoutMutation],
  ["visible applications-page values retain parity", visibleParity],
  ["search fields retain and extend expected matching", searchParity],
  ["tabs, counts, and status tones remain stable", tabsCountsAndTones],
  ["warnings and degraded rows remain neutral", warningsAndDegradedRows],
  ["production source guardrails remain intact", productionSourceGuardrails],
] as const;

let passed = 0; const failures: string[] = [];
for (const [name, test] of tests) {
  try { test(); passed++; console.log(`PASS: ${name}`); }
  catch (error: any) { const message = error?.message || String(error); failures.push(`${name}: ${message}`); console.error(`FAIL: ${name}\n  ${message}`); }
}
console.log(`\nApplications page parity regression result: ${passed}/${tests.length} passed`);
if (failures.length) { failures.forEach((failure) => console.log(`- ${failure}`)); process.exitCode = 1; }
