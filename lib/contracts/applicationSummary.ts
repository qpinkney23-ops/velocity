import {
  createMoney,
  validateApplicationId,
  validateIsoTimestamp,
  validateSchemaVersion,
  validateTenantId,
  validateUserId,
  type ApplicationId,
  type IsoTimestamp,
  type Money,
  type SchemaVersion,
  type TenantId,
} from "./primitives";

export const APPLICATION_SUMMARY_SCHEMA_VERSION = "application-summary.v1";

export type ApplicationSummaryStatus =
  | "new" | "in_review" | "approved" | "denied" | "closed" | "unknown";
export type ReadinessSummaryStatus =
  | "not_ready" | "high_risk" | "needs_conditions" | "near_ready" | "clear_to_close" | "unknown";
export type DecisionSummaryStatus =
  | "approved" | "approve_with_conditions" | "blocked" | "denied"
  | "review_required" | "pass" | "conditional" | "fail" | "unknown";
export type ProcessingSummaryStage =
  | "parsing" | "parsing_failed" | "analyzing" | "ai_completed" | "unknown";

export type CompatibilityWarningCode =
  | "missing_tenant" | "invalid_tenant" | "legacy_record" | "missing_borrower_name"
  | "missing_timestamp" | "invalid_timestamp" | "invalid_money" | "ambiguous_money"
  | "unknown_application_status" | "unknown_readiness_status" | "unknown_decision_status"
  | "unknown_processing_stage" | "invalid_underwriter_id" | "invalid_count_source"
  | "parser_failure";

export type CompatibilityWarning = Readonly<{
  code: CompatibilityWarningCode;
  field: string;
  message: string;
}>;

export type LegacyPageParity = Readonly<{
  borrowerName: string;
  email: string;
  loanAmountDisplay: string;
  statusDisplay: string;
  underwriterDisplay: string;
  underwriterEmail: string;
  updatedMs: number;
}>;

export type ApplicationSummaryCompatibility = Readonly<{
  source: "legacy_applications_page";
  sourceRecordVersion?: string;
  warnings: readonly CompatibilityWarning[];
  pageParity: LegacyPageParity;
}>;

export type CanonicalApplicationSummary = Readonly<{
  schemaVersion: SchemaVersion;
  tenantId: TenantId | null;
  applicationId: ApplicationId;
  borrowerDisplayName: string;
  coBorrowerDisplayName?: string;
  loanNumber?: string;
  propertyAddressSummary?: string;
  loanPurpose?: string;
  loanProgram?: string;
  loanAmount: Money | null;
  purchasePriceOrPropertyValue?: Money;
  /** Legacy underwriter collection ID; not asserted to be a users/{uid} identity. */
  assignedUnderwriterId?: string;
  assignedUnderwriterDisplayName?: string;
  applicationStatus: ApplicationSummaryStatus;
  readinessStatus: ReadinessSummaryStatus;
  decisionStatus?: DecisionSummaryStatus;
  processingStage?: ProcessingSummaryStage;
  documentCount: number;
  openConditionCount: number;
  blockingConditionCount: number;
  createdAt: IsoTimestamp | null;
  updatedAt: IsoTimestamp | null;
  lastAnalysisAt?: IsoTimestamp;
  compatibility: ApplicationSummaryCompatibility;
}>;

export type LegacyUnderwriterLookup = Readonly<{
  id: unknown;
  name?: unknown;
  email?: unknown;
}>;

export type ParseLegacyApplicationSummaryOptions = Readonly<{
  underwriters?: readonly LegacyUnderwriterLookup[];
  currency?: string;
}>;

export type ApplicationSummaryParseResult =
  | Readonly<{ ok: true; value: CanonicalApplicationSummary }>
  | Readonly<{ ok: false; code: "invalid_record" | "invalid_application_id"; message: string }>;

export type ApplicationsPageDisplayRow = Readonly<{
  rowKey: string;
  routeId?: string;
  summary: CanonicalApplicationSummary | null;
  borrowerName: string;
  coBorrowerName?: string;
  email: string;
  loanNumber: string;
  loanAmountCents: number | null;
  status: string;
  underwriterId: string;
  uwName: string;
  uwEmail: string;
  updatedMs: number;
  compatibilityWarnings: readonly CompatibilityWarning[];
  degraded: boolean;
}>;

type UnknownRecord = Record<string, unknown>;

function warning(code: CompatibilityWarningCode, field: string, message: string): CompatibilityWarning {
  return Object.freeze({ code, field, message });
}

function record(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : null;
}

export function projectApplicationSummaryForApplicationsPage(
  summary: CanonicalApplicationSummary
): ApplicationsPageDisplayRow {
  const parity = summary.compatibility.pageParity;
  return Object.freeze({
    rowKey: summary.applicationId,
    routeId: summary.applicationId,
    summary,
    borrowerName: parity.borrowerName,
    ...(summary.coBorrowerDisplayName ? { coBorrowerName: summary.coBorrowerDisplayName } : {}),
    email: parity.email,
    loanNumber: summary.loanNumber ?? "",
    loanAmountCents: summary.loanAmount?.cents ?? null,
    status: parity.statusDisplay,
    underwriterId: summary.assignedUnderwriterId ?? "",
    uwName: parity.underwriterDisplay,
    uwEmail: parity.underwriterEmail,
    updatedMs: parity.updatedMs,
    compatibilityWarnings: summary.compatibility.warnings,
    degraded: false,
  });
}

export function createDegradedApplicationsPageRow(
  input: unknown,
  rowIndex: number
): ApplicationsPageDisplayRow {
  const raw = record(input);
  const safeId = validateApplicationId(raw?.id);
  const routeId = safeId.ok ? safeId.value : undefined;
  return Object.freeze({
    rowKey: routeId ?? `degraded-${rowIndex}`,
    ...(routeId ? { routeId } : {}),
    summary: null,
    borrowerName: "Compatibility issue",
    email: "—",
    loanNumber: "",
    loanAmountCents: null,
    status: "Compatibility issue",
    underwriterId: "",
    uwName: "Unassigned",
    uwEmail: "",
    updatedMs: 0,
    compatibilityWarnings: Object.freeze([
      warning("parser_failure", "record", "Application record could not be safely normalized."),
    ]),
    degraded: true,
  });
}

function optionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function legacyTimestampToIso(value: unknown): IsoTimestamp | null {
  const raw = record(value);
  let date: Date | null = null;
  if (raw && typeof raw.toDate === "function") {
    try {
      const candidate = (raw.toDate as () => unknown)();
      if (candidate instanceof Date) date = candidate;
    } catch { date = null; }
  } else if (raw && typeof raw.seconds === "number" && Number.isFinite(raw.seconds)) {
    const nanos = typeof raw.nanoseconds === "number" && Number.isFinite(raw.nanoseconds) ? raw.nanoseconds : 0;
    date = new Date(raw.seconds * 1000 + Math.floor(nanos / 1_000_000));
  } else if (value instanceof Date) {
    date = value;
  } else if (typeof value === "number" && Number.isFinite(value)) {
    date = new Date(value);
  } else if (typeof value === "string") {
    const parsed = validateIsoTimestamp(value);
    return parsed.ok ? parsed.value : null;
  }
  if (!date || !Number.isFinite(date.getTime())) return null;
  const parsed = validateIsoTimestamp(date.toISOString());
  return parsed.ok ? parsed.value : null;
}

function isoToMs(value: IsoTimestamp | null): number {
  return value ? Date.parse(value) : 0;
}

/**
 * Converts legacy dollar numbers to integer cents. Only finite, nonnegative,
 * safe values with no precision beyond cents are accepted. Strings and values
 * requiring fractional-cent rounding are ambiguous and are not converted.
 */
export function convertLegacyDollarsToMoney(
  value: unknown,
  currency = "USD"
): { money: Money | null; issue?: "invalid" | "ambiguous" } {
  if (value === undefined || value === null) return { money: null };
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
    return { money: null, issue: "invalid" };
  const scaled = value * 100;
  const cents = Math.round(scaled);
  if (!Number.isSafeInteger(cents) || Math.abs(scaled - cents) > 1e-7)
    return { money: null, issue: "ambiguous" };
  const result = createMoney(cents, currency);
  return result.ok ? { money: result.value } : { money: null, issue: "invalid" };
}

function mapApplicationStatus(value: unknown): { status: ApplicationSummaryStatus; display: string; unknown: boolean } {
  const raw = optionalString(value);
  if (!raw) return { status: "new", display: "New", unknown: false };
  const key = raw.toLowerCase();
  const known: Record<string, ApplicationSummaryStatus> = {
    new: "new", "in review": "in_review", approved: "approved", denied: "denied", closed: "closed",
  };
  return known[key]
    ? { status: known[key], display: raw, unknown: false }
    : { status: "unknown", display: raw, unknown: true };
}

function mapReadiness(value: unknown): ReadinessSummaryStatus {
  const raw = optionalString(value)?.toLowerCase();
  return raw && ["not_ready", "high_risk", "needs_conditions", "near_ready", "clear_to_close"].includes(raw)
    ? raw as ReadinessSummaryStatus : "unknown";
}

function mapDecision(value: unknown): DecisionSummaryStatus {
  const raw = optionalString(value)?.toLowerCase();
  return raw && ["approved", "approve_with_conditions", "blocked", "denied", "review_required", "pass", "conditional", "fail"].includes(raw)
    ? raw as DecisionSummaryStatus : "unknown";
}

function mapProcessing(value: unknown): ProcessingSummaryStage {
  const raw = optionalString(value)?.toLowerCase();
  return raw && ["parsing", "parsing_failed", "analyzing", "ai_completed"].includes(raw)
    ? raw as ProcessingSummaryStage : "unknown";
}

function countDocuments(app: UnknownRecord, warnings: CompatibilityWarning[]): number {
  if (app.storedDocs === undefined) return 0;
  if (Array.isArray(app.storedDocs)) return app.storedDocs.length;
  warnings.push(warning("invalid_count_source", "storedDocs", "Legacy document metadata was not an array; count set to zero."));
  return 0;
}

function countConditions(app: UnknownRecord, warnings: CompatibilityWarning[]) {
  const source = Array.isArray(app.uwConditions) ? app.uwConditions : Array.isArray(app.conditions) ? app.conditions : [];
  if ((app.uwConditions !== undefined && !Array.isArray(app.uwConditions)) ||
      (app.uwConditions === undefined && app.conditions !== undefined && !Array.isArray(app.conditions)))
    warnings.push(warning("invalid_count_source", "conditions", "Legacy condition metadata was not an array; counts set to zero."));
  let open = 0; let blocking = 0;
  for (const item of source) {
    const c = record(item);
    if (!c) continue;
    const status = optionalString(c.status)?.toLowerCase();
    const isOpen = status === undefined || ["open", "reopened", "in_review", "pending_borrower"].includes(status);
    if (isOpen) open++;
    if (isOpen && c.blocking === true) blocking++;
  }
  return { open, blocking };
}

/** Pure adapter: no fetches, persistence, mutation, or underwriting calculations. */
export function parseLegacyApplicationSummary(
  input: unknown,
  options: ParseLegacyApplicationSummaryOptions = {}
): ApplicationSummaryParseResult {
  const app = record(input);
  if (!app) return { ok: false, code: "invalid_record", message: "Application summary input must be an object." };
  const applicationId = validateApplicationId(app.id);
  if (!applicationId.ok)
    return { ok: false, code: "invalid_application_id", message: "Application record requires a valid application ID." };

  const warnings: CompatibilityWarning[] = [warning("legacy_record", "record", "Parsed from the legacy applications-page shape.")];
  const schema = validateSchemaVersion(APPLICATION_SUMMARY_SCHEMA_VERSION);
  if (!schema.ok) return { ok: false, code: "invalid_record", message: "Application summary schema configuration is invalid." };

  const tenantRaw = app.tenantId ?? app.companyId;
  const tenant = tenantRaw === undefined || tenantRaw === null || tenantRaw === "" ? null : validateTenantId(tenantRaw);
  let tenantId: TenantId | null = null;
  if (tenant === null) warnings.push(warning("missing_tenant", "tenantId", "Legacy record has no tenant ownership; ownership remains unresolved."));
  else if (!tenant.ok) warnings.push(warning("invalid_tenant", "tenantId", "Legacy tenant ownership is invalid; ownership remains unresolved."));
  else tenantId = tenant.value;

  const scan = record(app.scan); const extracted = record(scan?.extracted);
  const rootBorrower = optionalString(app.borrowerName);
  const scanBorrower = optionalString(extracted?.borrower);
  const borrowerDisplayName = rootBorrower ?? scanBorrower ?? "Borrower";
  if (!rootBorrower && !scanBorrower)
    warnings.push(warning("missing_borrower_name", "borrowerDisplayName", "Legacy borrower name is missing; page fallback is preserved."));
  const email = optionalString(app.email) ?? optionalString(extracted?.email) ?? "—";

  const loan = convertLegacyDollarsToMoney(app.loanAmount, options.currency ?? "USD");
  if (loan.issue === "invalid") warnings.push(warning("invalid_money", "loanAmount", "Legacy loan amount was invalid and remains absent."));
  if (loan.issue === "ambiguous") warnings.push(warning("ambiguous_money", "loanAmount", "Legacy loan amount had precision beyond cents and remains absent."));
  const propertyRaw = app.purchasePrice ?? app.propertyValue ?? record(app.borrowerProfile)?.propertyValue;
  const propertyValue = convertLegacyDollarsToMoney(record(propertyRaw)?.value ?? propertyRaw, options.currency ?? "USD");
  if (propertyValue.issue === "invalid") warnings.push(warning("invalid_money", "purchasePriceOrPropertyValue", "Legacy property value was invalid and remains absent."));
  if (propertyValue.issue === "ambiguous") warnings.push(warning("ambiguous_money", "purchasePriceOrPropertyValue", "Legacy property value had precision beyond cents and remains absent."));

  const status = mapApplicationStatus(app.status);
  if (status.unknown) warnings.push(warning("unknown_application_status", "applicationStatus", "Unknown legacy status remains unknown."));

  const readinessRaw = record(scan?.readiness)?.readinessLabel ?? record(app.readiness)?.readinessLabel ?? app.readinessStatus;
  const readinessStatus = mapReadiness(readinessRaw);
  if (readinessRaw !== undefined && readinessStatus === "unknown")
    warnings.push(warning("unknown_readiness_status", "readinessStatus", "Unknown legacy readiness remains unknown."));
  const decisionRaw = record(scan?.ai)?.verdict ?? record(app.decision)?.state ?? app.decision;
  const decisionStatus = decisionRaw === undefined ? undefined : mapDecision(decisionRaw);
  if (decisionRaw !== undefined && decisionStatus === "unknown")
    warnings.push(warning("unknown_decision_status", "decisionStatus", "Unknown legacy decision remains unknown."));
  const processingRaw = app.processingStage;
  const processingStage = processingRaw === undefined ? undefined : mapProcessing(processingRaw);
  if (processingRaw !== undefined && processingStage === "unknown")
    warnings.push(warning("unknown_processing_stage", "processingStage", "Unknown legacy processing stage remains unknown."));

  const underwriterRaw = optionalString(app.underwriterId);
  const underwriterIdResult = underwriterRaw ? validateUserId(underwriterRaw) : null;
  const assignedUnderwriterId = underwriterIdResult?.ok ? underwriterIdResult.value : undefined;
  if (underwriterRaw && underwriterIdResult && !underwriterIdResult.ok)
    warnings.push(warning("invalid_underwriter_id", "assignedUnderwriterId", "Legacy underwriter ID is invalid and remains absent."));
  const lookup = underwriterRaw
    ? (options.underwriters ?? []).find((u) => optionalString(u.id) === underwriterRaw)
    : undefined;
  const assignedUnderwriterDisplayName = optionalString(lookup?.name) ?? optionalString(app.underwriterName);
  const pageUnderwriterDisplay = lookup
    ? optionalString(lookup.name) ?? optionalString(lookup.email) ?? "Assigned"
    : underwriterRaw ? "Assigned" : "Unassigned";
  const pageUnderwriterEmail = optionalString(lookup?.email) ?? "";

  const createdAt = legacyTimestampToIso(app.createdAt);
  const updatedAt = legacyTimestampToIso(app.updatedAt);
  if (app.createdAt !== undefined && !createdAt) warnings.push(warning("invalid_timestamp", "createdAt", "Legacy created timestamp is invalid and remains absent."));
  if (app.updatedAt !== undefined && !updatedAt) warnings.push(warning("invalid_timestamp", "updatedAt", "Legacy updated timestamp is invalid and remains absent."));
  if (!createdAt || !updatedAt) warnings.push(warning("missing_timestamp", "timestamps", "One or more canonical timestamps are unavailable."));
  const analysisRaw = app.lastAnalysisAt ?? app.aiCompletedAt ?? scan?.scannedAt ?? scan?.scannedAtMs;
  const lastAnalysisAt = legacyTimestampToIso(analysisRaw);
  if (analysisRaw !== undefined && !lastAnalysisAt) warnings.push(warning("invalid_timestamp", "lastAnalysisAt", "Legacy analysis timestamp is invalid and remains absent."));

  const counts = countConditions(app, warnings);
  const sourceRecordVersion = optionalString(app.schemaVersion) ?? optionalString(app.analysisVersion) ?? optionalString(scan?.analysisRouteVersion);
  const pageLoanDisplay = loan.money ? `$${Math.round(loan.money.cents / 100).toLocaleString()}` : "$0";

  return { ok: true, value: Object.freeze({
    schemaVersion: schema.value, tenantId, applicationId: applicationId.value,
    borrowerDisplayName,
    ...(optionalString(app.coBorrowerName) ?? optionalString(extracted?.coBorrower)
      ? { coBorrowerDisplayName: optionalString(app.coBorrowerName) ?? optionalString(extracted?.coBorrower) }
      : {}),
    ...(optionalString(app.loanNumber) ? { loanNumber: optionalString(app.loanNumber) } : {}),
    ...(optionalString(app.propertyAddress) ?? optionalString(app.address)
      ? { propertyAddressSummary: optionalString(app.propertyAddress) ?? optionalString(app.address) }
      : {}),
    ...(optionalString(app.loanPurpose) ? { loanPurpose: optionalString(app.loanPurpose) } : {}),
    ...(optionalString(app.programName) ?? optionalString(app.loanProgram)
      ? { loanProgram: optionalString(app.programName) ?? optionalString(app.loanProgram) }
      : {}),
    loanAmount: loan.money,
    ...(propertyValue.money ? { purchasePriceOrPropertyValue: propertyValue.money } : {}),
    ...(assignedUnderwriterId ? { assignedUnderwriterId } : {}),
    ...(assignedUnderwriterDisplayName ? { assignedUnderwriterDisplayName } : {}),
    applicationStatus: status.status, readinessStatus,
    ...(decisionStatus ? { decisionStatus } : {}),
    ...(processingStage ? { processingStage } : {}),
    documentCount: countDocuments(app, warnings), openConditionCount: counts.open,
    blockingConditionCount: counts.blocking, createdAt, updatedAt,
    ...(lastAnalysisAt ? { lastAnalysisAt } : {}),
    compatibility: Object.freeze({
      source: "legacy_applications_page" as const,
      ...(sourceRecordVersion ? { sourceRecordVersion } : {}),
      warnings: Object.freeze(warnings),
      pageParity: Object.freeze({
        borrowerName: borrowerDisplayName, email, loanAmountDisplay: pageLoanDisplay,
        statusDisplay: status.display, underwriterDisplay: pageUnderwriterDisplay,
        underwriterEmail: pageUnderwriterEmail,
        updatedMs: Math.max(isoToMs(updatedAt), isoToMs(createdAt)),
      }),
    }),
  }) as CanonicalApplicationSummary };
}
