import {
  validateApplicationId,
  validateTenantId,
  validateUserId,
  type ApplicationId,
  type Money,
  type SchemaVersion,
  type TenantId,
  type UserId,
} from "./primitives";

export const APPLICATION_CREATE_SCHEMA_VERSION = "application-create.v1" as SchemaVersion;

export type ApplicationCreateIdentity =
  | Readonly<{ kind: "firestore_add_doc" }>
  | Readonly<{ kind: "caller_supplied"; applicationId: ApplicationId }>;

export type ApplicationCreatePartyV1 = Readonly<{
  firstName: string;
  middleName?: string;
  lastName: string;
  suffix?: string;
}>;

export type ApplicationCreateAddressV1 = Readonly<{
  line1?: string;
  line2?: string;
  city?: string;
  stateOrProvince?: string;
  postalCode?: string;
  countryCode?: string;
}>;

export type ApplicationCreateCompatibilityMetadata = Readonly<{
  source: "applications_new_page";
  sourcePayloadVersion: "unversioned";
  notes?: readonly string[];
}>;

/**
 * Canonical create intent. Fields unsupported by the current page remain explicit
 * here but are intentionally omitted by the legacy serializer.
 */
export type ApplicationCreateV1 = Readonly<{
  schemaVersion: typeof APPLICATION_CREATE_SCHEMA_VERSION;
  tenantId: TenantId;
  applicationIdentity: ApplicationCreateIdentity;
  borrower: ApplicationCreatePartyV1;
  coBorrower?: ApplicationCreatePartyV1;
  email: string;
  phone?: string;
  currentAddress?: ApplicationCreateAddressV1;
  loanNumber?: string;
  loanPurpose?: string;
  loanProgram?: string;
  loanAmount: Money;
  purchasePriceOrPropertyValue?: Money;
  assignedUnderwriterId?: UserId;
  initialStatus: "New";
  initialProcessingStage?: string;
  creatorUserId: UserId;
  timestampOwnership: "firestore_server_timestamp_supplied_by_caller";
  compatibility: ApplicationCreateCompatibilityMetadata;
}>;

export type LegacyApplicationCreatePayload<TTimestamp> = Readonly<{
  borrowerName: string;
  email: string;
  loanAmount: number;
  status: "New";
  underwriterId: "";
  notes: "";
  createdAt: TTimestamp;
  updatedAt: TTimestamp;
}>;

export type ApplicationCreateWarningCode =
  | "canonical_field_not_serialized"
  | "canonical_identity_not_serialized"
  | "legacy_id_generated_by_firestore";

export type ApplicationCreateBuildResult<TTimestamp> =
  | Readonly<{
      ok: true;
      payload: LegacyApplicationCreatePayload<TTimestamp>;
      compatibilityWarnings: readonly Readonly<{ code: ApplicationCreateWarningCode; field: string }>[];
    }>
  | Readonly<{
      ok: false;
      code: "invalid_application_create" | "invalid_money";
      message: string;
    }>;

function failure<TTimestamp>(
  code: "invalid_application_create" | "invalid_money",
  message: string,
): ApplicationCreateBuildResult<TTimestamp> {
  // Validation messages never interpolate input values because they may contain PII.
  return Object.freeze({ ok: false, code, message });
}

function requiredText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function partyName(party: ApplicationCreatePartyV1): string {
  return [party.firstName, party.middleName, party.lastName, party.suffix]
    .filter((part): part is string => requiredText(part))
    .map((part) => part.trim())
    .join(" ");
}

function legacyDollars(money: Money): number | null {
  const cents = (money as { cents?: unknown }).cents;
  const currency = (money as { currency?: unknown }).currency;
  if (!Number.isSafeInteger(cents) || (cents as number) < 0 || currency !== "USD") return null;
  const dollars = (cents as number) / 100;
  return Number.isFinite(dollars) && Number.isSafeInteger(Math.round(dollars * 100)) && Math.round(dollars * 100) === cents
    ? dollars
    : null;
}

/**
 * Pure serialization boundary for the exact payload currently written by
 * app/applications/new/page.tsx. It performs no I/O, ID generation, or time generation.
 */
export function buildLegacyApplicationCreatePayload<TTimestamp>(
  input: ApplicationCreateV1,
  timestamps: Readonly<{ createdAt: TTimestamp; updatedAt: TTimestamp }>,
): ApplicationCreateBuildResult<TTimestamp> {
  if (!input || input.schemaVersion !== APPLICATION_CREATE_SCHEMA_VERSION)
    return failure("invalid_application_create", "Application create schema version is invalid.");
  if (!validateTenantId(input.tenantId).ok)
    return failure("invalid_application_create", "Application create tenant identity is invalid.");
  if (!validateUserId(input.creatorUserId).ok)
    return failure("invalid_application_create", "Application create creator identity is invalid.");
  if (input.applicationIdentity?.kind === "caller_supplied" && !validateApplicationId(input.applicationIdentity.applicationId).ok)
    return failure("invalid_application_create", "Application create application identity is invalid.");
  if (input.applicationIdentity?.kind !== "caller_supplied" && input.applicationIdentity?.kind !== "firestore_add_doc")
    return failure("invalid_application_create", "Application create ID ownership is invalid.");
  if (!requiredText(input.borrower?.firstName) || !requiredText(input.borrower?.lastName))
    return failure("invalid_application_create", "Application create borrower identity is incomplete.");
  if (!requiredText(input.email) || !input.email.trim().includes("@") || !input.email.trim().includes("."))
    return failure("invalid_application_create", "Application create email is invalid.");
  if (input.initialStatus !== "New")
    return failure("invalid_application_create", "Application create initial status is invalid.");
  if (input.timestampOwnership !== "firestore_server_timestamp_supplied_by_caller")
    return failure("invalid_application_create", "Application create timestamp ownership is invalid.");

  const amount = legacyDollars(input.loanAmount);
  if (amount === null || amount <= 0)
    return failure("invalid_money", "Application create loan amount must be positive, safe USD cents.");

  const unsupported = [
    ["tenantId", true], ["applicationIdentity", input.applicationIdentity.kind === "caller_supplied"],
    ["coBorrower", !!input.coBorrower], ["phone", !!input.phone], ["currentAddress", !!input.currentAddress],
    ["loanNumber", !!input.loanNumber], ["loanPurpose", !!input.loanPurpose], ["loanProgram", !!input.loanProgram],
    ["purchasePriceOrPropertyValue", !!input.purchasePriceOrPropertyValue],
    ["assignedUnderwriterId", !!input.assignedUnderwriterId], ["initialProcessingStage", !!input.initialProcessingStage],
    ["creatorUserId", true], ["schemaVersion", true], ["compatibility", true],
  ] as const;
  const compatibilityWarnings: Array<Readonly<{ code: ApplicationCreateWarningCode; field: string }>> = unsupported.filter(([, present]) => present).map(([field]) => Object.freeze({
    code: field === "applicationIdentity"
      ? "canonical_identity_not_serialized" as const
      : "canonical_field_not_serialized" as const,
    field,
  }));
  if (input.applicationIdentity.kind === "firestore_add_doc")
    compatibilityWarnings.push(Object.freeze({ code: "legacy_id_generated_by_firestore", field: "applicationIdentity" }));

  const payload: LegacyApplicationCreatePayload<TTimestamp> = Object.freeze({
    borrowerName: partyName(input.borrower),
    email: input.email.trim().toLowerCase(),
    loanAmount: amount,
    status: "New",
    underwriterId: "",
    notes: "",
    createdAt: timestamps.createdAt,
    updatedAt: timestamps.updatedAt,
  });
  return Object.freeze({
    ok: true,
    payload,
    compatibilityWarnings: Object.freeze(compatibilityWarnings),
  });
}
