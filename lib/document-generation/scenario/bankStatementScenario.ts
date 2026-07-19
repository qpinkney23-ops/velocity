import { SCHEMA_VERSION, ScenarioTruth, TransactionKind, TransactionTruth } from "../contracts";

function transaction(id: string, date: string, description: string, kind: TransactionKind, amountCents: number): TransactionTruth {
  return Object.freeze({ id, schemaVersion: SCHEMA_VERSION, date, description, kind, amountCents });
}

export const ENTERPRISE_BANK_STATEMENT_SCENARIO: ScenarioTruth = Object.freeze({
  id: "scenario-bank-statement-001",
  schemaVersion: SCHEMA_VERSION,
  seed: "velocity-enterprise-bank-statement-v001-seed",
  borrower: Object.freeze({
    id: "borrower-avery-morgan-001",
    schemaVersion: SCHEMA_VERSION,
    legalName: "Avery Elise Morgan",
    addressLines: Object.freeze(["1847 Cedar Ridge Lane", "Northfield, IL 60093"]),
  }),
  account: Object.freeze({
    id: "account-checking-4821",
    schemaVersion: SCHEMA_VERSION,
    accountType: "CHECKING",
    accountNumberLast4: "4821",
    period: Object.freeze({ startDate: "2026-05-01", endDate: "2026-05-31" }),
    beginningBalanceCents: 842150,
    transactions: Object.freeze([
      transaction("txn-001", "2026-05-01", "ACH CREDIT NORTHSTAR DESIGN PAYROLL", "DEPOSIT", 385000),
      transaction("txn-002", "2026-05-02", "ONLINE PAYMENT CEDAR RIDGE PROPERTY", "WITHDRAWAL", 165000),
      transaction("txn-003", "2026-05-04", "DEBIT CARD GREEN VALLEY MARKET", "WITHDRAWAL", 12643),
      transaction("txn-004", "2026-05-05", "AUTOPAY NORTHFIELD WATER UTILITY", "WITHDRAWAL", 7890),
      transaction("txn-005", "2026-05-07", "DEBIT CARD LAKESHORE FUEL 042", "WITHDRAWAL", 6250),
      transaction("txn-006", "2026-05-09", "STREAMLINE MEDIA MONTHLY", "WITHDRAWAL", 1499),
      transaction("txn-007", "2026-05-12", "TRANSFER FROM SAVINGS 7714", "DEPOSIT", 25000),
      transaction("txn-008", "2026-05-13", "DEBIT CARD NORTHFIELD PHARMACY", "WITHDRAWAL", 5200),
      transaction("txn-009", "2026-05-15", "DEBIT CARD HARBOR HOUSE DINING", "WITHDRAWAL", 18425),
      transaction("txn-010", "2026-05-16", "AUTO LOAN PAYMENT", "WITHDRAWAL", 24000),
      transaction("txn-011", "2026-05-16", "ACH CREDIT NORTHSTAR DESIGN PAYROLL", "DEPOSIT", 385000),
      transaction("txn-012", "2026-05-19", "AUTOPAY PRAIRIE STATE INSURANCE", "WITHDRAWAL", 11250),
      transaction("txn-013", "2026-05-21", "DEBIT CARD GREEN VALLEY MARKET", "WITHDRAWAL", 17684),
      transaction("txn-014", "2026-05-24", "AUTOPAY MIDWEST ELECTRIC", "WITHDRAWAL", 9500),
      transaction("txn-015", "2026-05-27", "MONTHLY ACCOUNT SERVICE FEE", "FEE", 350),
      transaction("txn-016", "2026-05-29", "DEBIT CARD MORNING HARBOR CAFE", "WITHDRAWAL", 4200),
    ]),
  }),
});

