import {
  APPLICATION_CREATE_SCHEMA_VERSION,
  type ApplicationCreateV1,
  type LegacyApplicationCreatePayload,
} from "./applicationCreate";
import {
  createMoney,
  validateTenantId,
  validateUserId,
  type Money,
} from "./primitives";

function value<T>(result: { ok: true; value: T } | { ok: false }): T {
  if (!result.ok) throw new Error("Synthetic contract fixture is invalid.");
  return result.value;
}

const tenantId = value(validateTenantId("tenant_fixture-001"));
const creatorUserId = value(validateUserId("user_creator-001"));
const underwriterId = value(validateUserId("user_underwriter-001"));
const usd = (cents: number) => value(createMoney(cents, "USD"));

export const legacyCreateTimestampFixtures = Object.freeze({
  createdAt: Object.freeze({ __fixtureServerTimestamp: true }),
  updatedAt: Object.freeze({ __fixtureServerTimestamp: true }),
});

const base: ApplicationCreateV1 = Object.freeze({
  schemaVersion: APPLICATION_CREATE_SCHEMA_VERSION,
  tenantId,
  applicationIdentity: Object.freeze({ kind: "firestore_add_doc" }),
  borrower: Object.freeze({ firstName: "Fixture", lastName: "Borrower" }),
  email: "Fixture.Borrower@Example.Invalid ",
  loanAmount: usd(35000000),
  initialStatus: "New",
  creatorUserId,
  timestampOwnership: "firestore_server_timestamp_supplied_by_caller",
  compatibility: Object.freeze({ source: "applications_new_page", sourcePayloadVersion: "unversioned" }),
});

export const applicationCreateFixtures = Object.freeze({
  normalBorrower: base,
  minimumRequired: Object.freeze({ ...base, borrower: Object.freeze({ firstName: "Minimum", lastName: "Borrower" }), email: "minimum@example.invalid", loanAmount: usd(1) }),
  middleNameAndSuffix: Object.freeze({ ...base, borrower: Object.freeze({ firstName: "Fixture", middleName: "Middle", lastName: "Borrower", suffix: "Jr." }) }),
  coBorrowerPresent: Object.freeze({ ...base, coBorrower: Object.freeze({ firstName: "Co", lastName: "Borrower" }) }),
  assignedUnderwriter: Object.freeze({ ...base, assignedUnderwriterId: underwriterId }),
  unassigned: base,
  validLoanAmount: Object.freeze({ ...base, loanAmount: usd(12345678) }),
  optionalAddress: Object.freeze({ ...base, currentAddress: Object.freeze({ line1: "100 Fixture Way", line2: "Unit 2", city: "Testville", stateOrProvince: "VA", postalCode: "22000", countryCode: "US" }) }),
  legacyCompatibilityMetadata: Object.freeze({ ...base, compatibility: Object.freeze({ source: "applications_new_page", sourcePayloadVersion: "unversioned", notes: Object.freeze(["Synthetic parity fixture"]) }) }),
  currentlyUnsupportedFields: Object.freeze({ ...base, phone: "555-0100", loanNumber: "FIXTURE-LOAN-001", loanPurpose: "fixture-purpose", loanProgram: "fixture-program", purchasePriceOrPropertyValue: usd(40000000), initialProcessingStage: "fixture-stage" }),
});

export const currentCreatePagePayloadFixture: LegacyApplicationCreatePayload<typeof legacyCreateTimestampFixtures.createdAt> = Object.freeze({
  borrowerName: "Fixture Borrower",
  email: "fixture.borrower@example.invalid",
  loanAmount: 350000,
  status: "New",
  underwriterId: "",
  notes: "",
  createdAt: legacyCreateTimestampFixtures.createdAt,
  updatedAt: legacyCreateTimestampFixtures.updatedAt,
});

export const malformedApplicationCreateFixture = Object.freeze({ ...base, loanAmount: Object.freeze({ cents: 100.5, currency: "USD" }) as Money });
export const zeroLoanAmountApplicationCreateFixture = Object.freeze({ ...base, loanAmount: usd(0) });
export const missingTenantApplicationCreateFixture = Object.freeze({ ...base, tenantId: "" as ApplicationCreateV1["tenantId"] });
export const missingBorrowerApplicationCreateFixture = Object.freeze({ ...base, borrower: Object.freeze({ firstName: "", lastName: "" }) });
