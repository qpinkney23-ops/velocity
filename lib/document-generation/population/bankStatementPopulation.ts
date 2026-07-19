import {
  FieldProvenance,
  InstitutionProfile,
  LayoutVariant,
  PopulatedBankStatement,
  PopulatedTransaction,
  ScenarioTruth,
  TemplateProfile,
} from "../contracts";

function sumByKind(transactions: readonly PopulatedTransaction[], kind: PopulatedTransaction["kind"]): number {
  return transactions.filter((item) => item.kind === kind).reduce((sum, item) => sum + item.amountCents, 0);
}

export function populateBankStatement(
  scenario: ScenarioTruth,
  institution: InstitutionProfile,
  template: TemplateProfile,
  layout: LayoutVariant,
): PopulatedBankStatement {
  let runningBalanceCents = scenario.account.beginningBalanceCents;
  const transactions = scenario.account.transactions.map((item) => {
    runningBalanceCents += item.kind === "DEPOSIT" ? item.amountCents : -item.amountCents;
    return Object.freeze({ ...item, runningBalanceCents });
  });
  const depositsCents = sumByKind(transactions, "DEPOSIT");
  const withdrawalsCents = sumByKind(transactions, "WITHDRAWAL");
  const feesCents = sumByKind(transactions, "FEE");
  const documentId = `${scenario.id}-${layout.id}`;
  const field = (fieldId: string, canonicalPath: string, pages: readonly number[], transformation = "identity"): FieldProvenance =>
    Object.freeze({ fieldId, canonicalPath, documentId, pages, transformation });
  const provenance: FieldProvenance[] = [
    field("borrower.legalName", "scenario.borrower.legalName", [1, 2]),
    field("borrower.address", "scenario.borrower.addressLines", [1], "joined postal address"),
    field("account.maskedNumber", "scenario.account.accountNumberLast4", [1, 2], "masked to final four digits"),
    field("statement.period", "scenario.account.period", [1, 2], "ISO date to display date"),
    field("summary.beginningBalance", "scenario.account.beginningBalanceCents", [1], "cents to USD"),
    field("summary.deposits", "scenario.account.transactions[kind=DEPOSIT]", [1], "sum cents to USD"),
    field("summary.withdrawals", "scenario.account.transactions[kind=WITHDRAWAL]", [1], "sum cents to USD"),
    field("summary.fees", "scenario.account.transactions[kind=FEE]", [1], "sum cents to USD"),
    field("summary.endingBalance", "scenario.account.transactions", [1, 2], "reconciled running balance to USD"),
    ...transactions.map((item, index) => field(
      `transactions.${item.id}`,
      `scenario.account.transactions[${index}]`,
      [index < 8 ? 1 : 2],
      "date, description, signed amount, and running balance",
    )),
  ];
  return Object.freeze({
    documentId,
    schemaVersion: scenario.schemaVersion,
    family: "BANK_STATEMENT",
    institution,
    template,
    layout,
    borrower: scenario.borrower,
    account: scenario.account,
    maskedAccountNumber: `XXXX XXXX XXXX ${scenario.account.accountNumberLast4}`,
    depositsCents,
    withdrawalsCents,
    feesCents,
    endingBalanceCents: runningBalanceCents,
    transactions: Object.freeze(transactions),
    provenance: Object.freeze(provenance),
  });
}
