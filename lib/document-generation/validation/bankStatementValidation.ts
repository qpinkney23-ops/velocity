import {
  PopulatedBankStatement,
  SCHEMA_VERSION,
  ScenarioTruth,
  ValidationResult,
} from "../contracts";

const pass = (ruleId: string, message: string): ValidationResult => ({ ruleId, status: "PASS", message });
const error = (ruleId: string, message: string): ValidationResult => ({ ruleId, status: "ERROR", message });

export function validateBankStatement(scenario: ScenarioTruth, document: PopulatedBankStatement): readonly ValidationResult[] {
  const results: ValidationResult[] = [];
  results.push(
    scenario.schemaVersion === SCHEMA_VERSION && document.schemaVersion === SCHEMA_VERSION
      ? pass("schema.supported", `Schema ${SCHEMA_VERSION} is supported.`)
      : error("schema.supported", "Unsupported scenario or document schema version."),
  );
  results.push(
    document.borrower.id === scenario.borrower.id && document.borrower.legalName === scenario.borrower.legalName
      ? pass("identity.matches", "Rendered borrower identity matches canonical truth.")
      : error("identity.matches", "Rendered borrower identity differs from canonical truth."),
  );
  results.push(
    document.account.period.startDate === scenario.account.period.startDate &&
      document.account.period.endDate === scenario.account.period.endDate &&
      document.account.period.startDate <= document.account.period.endDate
      ? pass("statement.dates", "Statement period matches canonical truth and is ordered.")
      : error("statement.dates", "Statement period is invalid or mismatched."),
  );
  const chronologyValid = document.transactions.every((item, index, values) =>
    item.date >= scenario.account.period.startDate &&
    item.date <= scenario.account.period.endDate &&
    (index === 0 || values[index - 1]!.date <= item.date),
  );
  results.push(
    chronologyValid
      ? pass("transactions.chronology", "Transactions are chronological and within the statement period.")
      : error("transactions.chronology", "Transaction chronology is invalid."),
  );
  const uniqueIds = new Set(document.transactions.map((item) => item.id));
  results.push(
    uniqueIds.size === document.transactions.length
      ? pass("transactions.uniqueIds", "Transaction IDs are unique.")
      : error("transactions.uniqueIds", "Duplicate transaction IDs were found."),
  );
  let running = document.account.beginningBalanceCents;
  const runningBalancesValid = document.transactions.every((item) => {
    running += item.kind === "DEPOSIT" ? item.amountCents : -item.amountCents;
    return item.runningBalanceCents === running;
  });
  const equation = document.account.beginningBalanceCents + document.depositsCents - document.withdrawalsCents - document.feesCents;
  results.push(
    runningBalancesValid && equation === document.endingBalanceCents && running === document.endingBalanceCents
      ? pass("balances.reconcile", "Beginning balance plus deposits less withdrawals and fees equals ending balance.")
      : error("balances.reconcile", "Statement balances do not reconcile."),
  );
  const expectedFields = 9 + document.transactions.length;
  const provenanceIds = new Set(document.provenance.map((item) => item.fieldId));
  results.push(
    document.provenance.length === expectedFields && provenanceIds.size === expectedFields &&
      document.provenance.every((item) => item.canonicalPath.length > 0 && item.pages.length > 0)
      ? pass("provenance.complete", "Every required statement field has canonical provenance.")
      : error("provenance.complete", "Required field provenance is missing or duplicated."),
  );
  results.push(
    document.template.pageCount === 2 && document.institution.supportedLayouts.includes(document.layout.id)
      ? pass("selection.compatible", "Institution, template, and two-page layout are compatible.")
      : error("selection.compatible", "Institution, template, or layout selection is incompatible."),
  );
  return Object.freeze(results);
}

export function assertValidationPassed(results: readonly ValidationResult[]): void {
  const failures = results.filter((item) => item.status === "ERROR");
  if (failures.length > 0) {
    throw new Error(`Bank statement validation failed: ${failures.map((item) => `${item.ruleId}: ${item.message}`).join("; ")}`);
  }
}

