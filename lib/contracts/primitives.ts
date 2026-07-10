/** CORE-001 primitives. No production producer or consumer imports this module yet. */
declare const brand: unique symbol;
export type Brand<T, N extends string> = T & { readonly [brand]: N };

export type TenantId = Brand<string, "TenantId">;
export type UserId = Brand<string, "UserId">;
export type ApplicationId = Brand<string, "ApplicationId">;
export type BorrowerId = Brand<string, "BorrowerId">;
export type DocumentId = Brand<string, "DocumentId">;
export type EvidenceId = Brand<string, "EvidenceId">;
export type ConditionId = Brand<string, "ConditionId">;
export type DecisionPackageId = Brand<string, "DecisionPackageId">;
export type JobId = Brand<string, "JobId">;
export type AuditEventId = Brand<string, "AuditEventId">;
export type ReportArtifactId = Brand<string, "ReportArtifactId">;

export type SchemaVersion = Brand<string, "SchemaVersion">;
export type EngineVersion = Brand<string, "EngineVersion">;
export type RuleVersion = Brand<string, "RuleVersion">;
export type ReportVersion = Brand<string, "ReportVersion">;

export type IsoTimestamp = Brand<string, "IsoTimestamp">;
export type CreatedAt = IsoTimestamp;
export type UpdatedAt = IsoTimestamp;
export type GeneratedAt = IsoTimestamp;
export type EffectiveAt = IsoTimestamp;

export type CurrencyCode = Brand<string, "CurrencyCode">;
export type MoneyCents = Brand<number, "MoneyCents">;
export type Money = Readonly<{ cents: MoneyCents; currency: CurrencyCode }>;

export type FractionRatio = Brand<number, "FractionRatio">;
export type PercentagePointRatio = Brand<number, "PercentagePointRatio">;
export type Confidence = Brand<number, "Confidence">;

export type ExtractionMethod =
  | "native_text" | "ocr" | "extracted" | "derived"
  | "manual" | "fallback" | "imported";

export type Provenance = Readonly<{
  sourceDocumentId: DocumentId;
  pageNumber?: number;
  extractionMethod: ExtractionMethod;
  confidence: Confidence;
  assumption: boolean;
  producer: string;
  schemaVersion: SchemaVersion;
}>;

export type ValidationIssueCode =
  | "invalid_id" | "invalid_version" | "invalid_timestamp"
  | "invalid_currency" | "invalid_money" | "invalid_ratio"
  | "invalid_confidence" | "invalid_provenance";
export type ValidationResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; code: ValidationIssueCode; message: string }>;

type Identifier = TenantId | UserId | ApplicationId | BorrowerId | DocumentId |
  EvidenceId | ConditionId | DecisionPackageId | JobId | AuditEventId | ReportArtifactId;
type Version = SchemaVersion | EngineVersion | RuleVersion | ReportVersion;

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const VERSION = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const CURRENCY = /^[A-Z]{3}$/;

function fail<T>(code: ValidationIssueCode, message: string): ValidationResult<T> {
  // Never echo rejected values: they may contain borrower PII.
  return { ok: false, code, message };
}

export function validateId<T extends Identifier>(value: unknown): ValidationResult<T> {
  return typeof value === "string" && ID.test(value)
    ? { ok: true, value: value as T }
    : fail("invalid_id", "Identifier must be 1-128 safe non-whitespace characters.");
}

export function validateVersion<T extends Version>(value: unknown): ValidationResult<T> {
  return typeof value === "string" && VERSION.test(value)
    ? { ok: true, value: value as T }
    : fail("invalid_version", "Version must be 1-64 safe version characters.");
}

export function validateIsoTimestamp(value: unknown): ValidationResult<IsoTimestamp> {
  if (typeof value !== "string" || !ISO_UTC.test(value))
    return fail("invalid_timestamp", "Timestamp must be a valid UTC ISO-8601 timestamp ending in Z.");
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return fail("invalid_timestamp", "Timestamp must be a real UTC calendar instant.");
  const normalized = value.includes(".")
    ? value.replace(/\.(\d{1,2})Z$/, (_, d: string) => `.${d.padEnd(3, "0")}Z`)
    : value.replace(/Z$/, ".000Z");
  return new Date(ms).toISOString() === normalized
    ? { ok: true, value: value as IsoTimestamp }
    : fail("invalid_timestamp", "Timestamp must be a real UTC calendar instant.");
}

export function validateCurrencyCode(value: unknown): ValidationResult<CurrencyCode> {
  return typeof value === "string" && CURRENCY.test(value)
    ? { ok: true, value: value as CurrencyCode }
    : fail("invalid_currency", "Currency must be a three-letter uppercase code.");
}

export function createMoney(cents: unknown, currency: unknown, options: { allowNegative?: boolean } = {}): ValidationResult<Money> {
  if (!Number.isSafeInteger(cents)) return fail("invalid_money", "Money cents must be a safe integer.");
  if (!options.allowNegative && (cents as number) < 0) return fail("invalid_money", "Money cents cannot be negative for this contract.");
  const c = validateCurrencyCode(currency);
  return c.ok
    ? { ok: true, value: Object.freeze({ cents: cents as MoneyCents, currency: c.value }) }
    : c;
}

export function validateFractionRatio(value: unknown): ValidationResult<FractionRatio> {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1
    ? { ok: true, value: value as FractionRatio }
    : fail("invalid_ratio", "Fraction ratio must be a finite number from 0 through 1.");
}

export function validatePercentagePointRatio(value: unknown): ValidationResult<PercentagePointRatio> {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100
    ? { ok: true, value: value as PercentagePointRatio }
    : fail("invalid_ratio", "Percentage-point ratio must be a finite number from 0 through 100.");
}

export function validateConfidence(value: unknown): ValidationResult<Confidence> {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1
    ? { ok: true, value: value as Confidence }
    : fail("invalid_confidence", "Confidence must be a finite number from 0 through 1.");
}

/** Rounds half away from zero and never converts between ratio representations. */
function round(value: number, places: number): number {
  if (!Number.isInteger(places) || places < 0 || places > 12) throw new Error("decimalPlaces must be an integer from 0 through 12");
  const factor = 10 ** places;
  const magnitude = Math.round((Math.abs(value) + Number.EPSILON) * factor) / factor;
  return Object.is(value, -0) || value < 0 ? -magnitude : magnitude;
}
export const roundFractionRatio = (v: FractionRatio, places = 6) => round(v, places) as FractionRatio;
export const roundPercentagePointRatio = (v: PercentagePointRatio, places = 4) => round(v, places) as PercentagePointRatio;

export function createProvenance(input: {
  sourceDocumentId: unknown; pageNumber?: unknown; extractionMethod: unknown;
  confidence: unknown; assumption: unknown; producer: unknown; schemaVersion: unknown;
}): ValidationResult<Provenance> {
  const doc = validateId<DocumentId>(input.sourceDocumentId);
  if (!doc.ok) return fail("invalid_provenance", "Provenance requires a valid source document ID.");
  if (input.pageNumber !== undefined && (!Number.isSafeInteger(input.pageNumber) || (input.pageNumber as number) < 1))
    return fail("invalid_provenance", "Provenance page number must be a positive integer when present.");
  const methods: ExtractionMethod[] = ["native_text", "ocr", "extracted", "derived", "manual", "fallback", "imported"];
  if (typeof input.extractionMethod !== "string" || !methods.includes(input.extractionMethod as ExtractionMethod))
    return fail("invalid_provenance", "Provenance extraction method is not supported.");
  const confidence = validateConfidence(input.confidence);
  if (!confidence.ok) return fail("invalid_provenance", "Provenance requires confidence from 0 through 1.");
  if (typeof input.assumption !== "boolean") return fail("invalid_provenance", "Provenance assumption flag must be boolean.");
  if (typeof input.producer !== "string" || !input.producer.trim() || input.producer.length > 128)
    return fail("invalid_provenance", "Provenance producer must be 1-128 characters.");
  const version = validateVersion<SchemaVersion>(input.schemaVersion);
  if (!version.ok) return fail("invalid_provenance", "Provenance requires a valid schema version.");
  return { ok: true, value: Object.freeze({
    sourceDocumentId: doc.value,
    ...(input.pageNumber === undefined ? {} : { pageNumber: input.pageNumber as number }),
    extractionMethod: input.extractionMethod as ExtractionMethod,
    confidence: confidence.value, assumption: input.assumption,
    producer: input.producer.trim(), schemaVersion: version.value,
  }) };
}
