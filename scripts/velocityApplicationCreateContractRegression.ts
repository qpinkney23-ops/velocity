import fs from "fs";
import path from "path";
import {
  APPLICATION_CREATE_SCHEMA_VERSION,
  applicationCreateFixtures,
  buildLegacyApplicationCreatePayload,
  currentCreatePagePayloadFixture,
  legacyCreateTimestampFixtures,
  malformedApplicationCreateFixture,
  missingBorrowerApplicationCreateFixture,
  missingTenantApplicationCreateFixture,
  zeroLoanAmountApplicationCreateFixture,
} from "../lib/contracts";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

function build(name: keyof typeof applicationCreateFixtures) {
  const result = buildLegacyApplicationCreatePayload(applicationCreateFixtures[name], legacyCreateTimestampFixtures);
  assert(result.ok, `${name} should build`);
  return result;
}

function deterministicAndImmutable() {
  for (const name of Object.keys(applicationCreateFixtures) as Array<keyof typeof applicationCreateFixtures>) {
    const fixture = applicationCreateFixtures[name];
    const before = JSON.stringify(fixture);
    assert(JSON.stringify(build(name)) === JSON.stringify(build(name)), `${name} deterministic`);
    assert(JSON.stringify(fixture) === before, `${name} input unchanged`);
  }
}

function exactCurrentPayloadParity() {
  const result = build("normalBorrower");
  assert(JSON.stringify(result.payload) === JSON.stringify(currentCreatePagePayloadFixture), "builder output deeply equals current create payload fixture");
  assert(result.payload.borrowerName === "Fixture Borrower", "borrowerName parity");
  assert(result.payload.email === "fixture.borrower@example.invalid", "email normalization parity");
  assert(result.payload.loanAmount === 350000, "whole-dollar payload parity");
  assert(result.payload.status === "New" && result.payload.underwriterId === "" && result.payload.notes === "", "legacy defaults parity");
  assert(result.payload.createdAt === legacyCreateTimestampFixtures.createdAt && result.payload.updatedAt === legacyCreateTimestampFixtures.updatedAt, "external timestamps retained by identity");
}

function variantsAndOmissions() {
  assert(build("minimumRequired").payload.loanAmount === 0.01, "safe cent money converts exactly to legacy dollars");
  assert(build("validLoanAmount").payload.loanAmount === 123456.78, "canonical cents convert exactly");
  assert(build("middleNameAndSuffix").payload.borrowerName === "Fixture Middle Borrower Jr.", "optional name parts serialize to legacy full name");
  const unsupported = build("currentlyUnsupportedFields");
  const keys = Object.keys(unsupported.payload).sort();
  assert(keys.join(",") === "borrowerName,createdAt,email,loanAmount,notes,status,underwriterId,updatedAt", "unsupported optional fields remain omitted");
  assert(unsupported.compatibilityWarnings.some((warning) => warning.field === "loanNumber"), "omitted loan number is explicit");
  assert(!("coBorrower" in build("coBorrowerPresent").payload), "co-borrower remains omitted from current payload");
  assert(build("assignedUnderwriter").payload.underwriterId === "", "current create flow remains unassigned");
}

function safeFailures() {
  const malformed = buildLegacyApplicationCreatePayload(malformedApplicationCreateFixture, legacyCreateTimestampFixtures);
  const zero = buildLegacyApplicationCreatePayload(zeroLoanAmountApplicationCreateFixture, legacyCreateTimestampFixtures);
  const tenant = buildLegacyApplicationCreatePayload(missingTenantApplicationCreateFixture, legacyCreateTimestampFixtures);
  const borrower = buildLegacyApplicationCreatePayload(missingBorrowerApplicationCreateFixture, legacyCreateTimestampFixtures);
  assert(!malformed.ok && malformed.code === "invalid_money", "fractional cents rejected");
  assert(!zero.ok && zero.code === "invalid_money", "zero remains unsupported like current create page");
  assert(!tenant.ok && tenant.code === "invalid_application_create", "missing tenant rejected");
  assert(!borrower.ok && borrower.code === "invalid_application_create", "missing borrower identity rejected");
  const messages = [malformed, zero, tenant, borrower].filter((result) => !result.ok).map((result) => result.message).join(" ");
  assert(!messages.includes("Fixture") && !messages.includes("example.invalid"), "errors remain PII-safe");
}

function ownershipAndNoGeneration() {
  assert(APPLICATION_CREATE_SCHEMA_VERSION === "application-create.v1", "schema version fixed");
  const source = fs.readFileSync("lib/contracts/applicationCreate.ts", "utf8");
  assert(!/Date\.now\(|new Date\(|randomUUID\(|Math\.random\(|serverTimestamp\(/.test(source), "builder generates no ID or timestamp");
  const result = build("normalBorrower");
  assert(result.compatibilityWarnings.some((warning) => warning.code === "legacy_id_generated_by_firestore"), "Firestore addDoc ID ownership explicit");
}

function noProductionImports() {
  const violations: string[] = [];
  const visit = (relative: string) => {
    for (const entry of fs.readdirSync(relative, { withFileTypes: true })) {
      const child = path.join(relative, entry.name);
      if (entry.isDirectory()) {
        if (child.replace(/\\/g, "/") !== "lib/contracts") visit(child);
      } else if (/\.(ts|tsx)$/.test(entry.name)) {
        const source = fs.readFileSync(child, "utf8");
        if (/ApplicationCreateV1|buildLegacyApplicationCreatePayload|applicationCreateFixtures/.test(source)) violations.push(child.replace(/\\/g, "/"));
      }
    }
  };
  ["app", "components", "lib"].forEach(visit);
  assert(violations.length === 0, `production create-contract imports found: ${violations.join(", ")}`);
}

const tests = [
  ["fixtures build deterministically without mutation", deterministicAndImmutable],
  ["builder output exactly matches current create payload", exactCurrentPayloadParity],
  ["supported variants and legacy omissions are explicit", variantsAndOmissions],
  ["invalid input fails safely", safeFailures],
  ["ID and timestamp ownership generate no values", ownershipAndNoGeneration],
  ["no production path imports the create contract", noProductionImports],
] as const;

let passed = 0;
const failures: string[] = [];
for (const [name, test] of tests) {
  try { test(); passed++; console.log(`PASS: ${name}`); }
  catch (error: any) { const message = error?.message || String(error); failures.push(`${name}: ${message}`); console.error(`FAIL: ${name}\n  ${message}`); }
}
console.log(`\nApplication create contract regression result: ${passed}/${tests.length} passed`);
if (failures.length) { failures.forEach((failure) => console.log(`- ${failure}`)); process.exitCode = 1; }
