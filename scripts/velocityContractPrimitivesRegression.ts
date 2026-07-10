import {
  createMoney, createProvenance, legacyRatioConventionFixtures,
  representativeLegacyFixtures, roundFractionRatio, roundPercentagePointRatio,
  validateFractionRatio, validateId, validateIsoTimestamp,
  validatePercentagePointRatio, validateVersion,
  type ApplicationId, type DocumentId, type FractionRatio, type Money,
  type PercentagePointRatio, type SchemaVersion,
} from "../lib/contracts";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

function identifiersAndVersions() {
  assert(validateId<ApplicationId>("application_fixture-001").ok, "valid application ID");
  assert(!validateId<ApplicationId>("").ok, "empty ID rejected");
  assert(!validateId<ApplicationId>("borrower name@example.invalid").ok, "unsafe ID rejected");
  assert(validateVersion<SchemaVersion>("core-001.v1").ok, "valid schema version");
  assert(!validateVersion<SchemaVersion>("").ok, "empty version rejected");
}

function timestamps() {
  assert(validateIsoTimestamp("2026-07-10T12:34:56Z").ok, "valid ISO timestamp");
  assert(validateIsoTimestamp("2026-07-10T12:34:56.123Z").ok, "valid milliseconds");
  assert(!validateIsoTimestamp("2026-02-30T12:34:56Z").ok, "impossible date rejected");
  assert(!validateIsoTimestamp("07/10/2026 12:34:56").ok, "non-ISO rejected");
  assert(!validateIsoTimestamp("2026-07-10T12:34:56-04:00").ok, "non-UTC rejected");
}

function money() {
  const result = createMoney(12345, "USD");
  assert(result.ok && result.value.cents === 12345 && result.value.currency === "USD", "integer cents retained");
  assert(!createMoney(123.45, "USD").ok, "floating dollar-like value rejected");
  assert(!createMoney(-1, "USD").ok, "negative rejected by default");
  assert(createMoney(-1, "USD", { allowNegative: true }).ok, "explicit negative allowed");
  assert(!createMoney(100, "usd").ok, "invalid currency rejected");
  const explicit: Money = result.value;
  assert(typeof explicit !== "number", "money is structured, not raw number");
  // @ts-expect-error raw floating-point dollars cannot be assigned to Money.
  const ambiguousDollars: Money = 123.45;
  void ambiguousDollars;
}

function ratios() {
  const fraction = validateFractionRatio(0.57);
  const percent = validatePercentagePointRatio(57);
  assert(fraction.ok && percent.ok, "both conventions represented");
  assert(!validateFractionRatio(57).ok, "57 rejected as fraction");
  assert(!validatePercentagePointRatio(NaN).ok, "NaN rejected");
  assert(!validatePercentagePointRatio(101).ok, "out-of-range percentage rejected");
  const fractionToRound = validateFractionRatio(0.5767894);
  const percentToRound = validatePercentagePointRatio(57.67894);
  assert(fractionToRound.ok && percentToRound.ok, "rounding inputs validate");
  assert(roundFractionRatio(fractionToRound.value, 4) === 0.5768, "fraction rounding");
  assert(roundPercentagePointRatio(percentToRound.value, 2) === 57.68, "percent rounding");
  const f: FractionRatio = fraction.value;
  const p: PercentagePointRatio = percent.value;
  // @ts-expect-error branded percentage points cannot be assigned to fraction.
  const wrongF: FractionRatio = p;
  // @ts-expect-error branded fraction cannot be assigned to percentage points.
  const wrongP: PercentagePointRatio = f;
  void wrongF; void wrongP;
}

function provenance() {
  const result = createProvenance({
    sourceDocumentId: "document_fixture-001", pageNumber: 2,
    extractionMethod: "ocr", confidence: 0.91, assumption: false,
    producer: "velocity-contract-regression", schemaVersion: "core-001.v1",
  });
  assert(result.ok, "complete provenance validates");
  assert(result.value.sourceDocumentId === "document_fixture-001", "document retained");
  assert(result.value.pageNumber === 2 && result.value.extractionMethod === "ocr", "page/method retained");
  assert(result.value.confidence === 0.91 && !result.value.assumption, "confidence/assumption retained");
  assert(result.value.producer === "velocity-contract-regression" && result.value.schemaVersion === "core-001.v1", "producer/version retained");
  assert(!createProvenance({ sourceDocumentId: "", pageNumber: 0, extractionMethod: "ocr", confidence: 2, assumption: false, producer: "", schemaVersion: "" }).ok, "invalid provenance rejected");
  assert(validateId<DocumentId>("document_fixture-001").ok, "document ID validates");
}

function fixtures() {
  assert(Object.keys(representativeLegacyFixtures).length === 7, "seven fixture groups");
  assert(Object.isFrozen(representativeLegacyFixtures), "registry frozen");
  assert(Object.isFrozen(representativeLegacyFixtures.borrowerProfile.borrowerProfile), "nested fixtures frozen");
  assert(legacyRatioConventionFixtures.deterministicAnalysis.value === 0.57, "fraction frozen");
  assert(legacyRatioConventionFixtures.underwritingReport.value === 57, "percentage frozen");
  assert(legacyRatioConventionFixtures.deterministicAnalysis.representation !== legacyRatioConventionFixtures.underwritingReport.representation, "competing conventions documented");
}

const tests = [
  ["identifiers and versions", identifiersAndVersions], ["timestamps", timestamps],
  ["money", money], ["distinct ratios", ratios], ["provenance", provenance],
  ["legacy fixtures", fixtures],
] as const;
let passed = 0; const failures: string[] = [];
for (const [name, test] of tests) {
  try { test(); passed++; console.log(`PASS: ${name}`); }
  catch (error: any) { const m = error?.message || String(error); failures.push(`${name}: ${m}`); console.error(`FAIL: ${name}\n  ${m}`); }
}
console.log(`\nContract primitive regression result: ${passed}/${tests.length} passed`);
if (failures.length) { failures.forEach((f) => console.log(`- ${f}`)); process.exitCode = 1; }
