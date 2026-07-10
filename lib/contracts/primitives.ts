/** CORE-001 primitives. No production producer or consumer imports this module yet. */
declare const brand: unique symbol;
type Branded<T, Name extends string> = T & { readonly [brand]: Name };

export type TenantId = Branded<string, "TenantId">;
export type UserId = Branded<string, "UserId">;
export type ApplicationId = Branded<string, "ApplicationId">;
export type BorrowerId = Branded<string, "BorrowerId">;
export type DocumentId = Branded<string, "DocumentId">;
export type EvidenceId = Branded<string, "EvidenceId">;
export type ConditionId = Branded<string, "ConditionId">;
export type DecisionPackageId = Branded<string, "DecisionPackageId">;
export type JobId = Branded<string, "JobId">;
export type AuditEventId = Branded<string, "AuditEventId">;
export type ReportArtifactId = Branded<string, "ReportArtifactId">;

export type SchemaVersion = Branded<string, "SchemaVersion">;
export type EngineVersion = Branded<string, "EngineVersion">;
export type RuleVersion = Branded<string, "RuleVersion">;
export type ReportVersion = Branded<string, "ReportVersion">;

export type IsoTimestamp = Branded<string, "IsoTimestamp">;
export type CreatedAt = IsoTimestamp;
export type UpdatedAt = IsoTimestamp;
export type GeneratedAt = IsoTimestamp;
export type EffectiveAt = IsoTimestamp;

export type CurrencyCode = Branded<string, "CurrencyCode">;
export type MoneyCents = Branded<number, "MoneyCents">;
export type Money = Readonly<{ cents: MoneyCents; currency: CurrencyCode }>;

/** Normalized ratio representation, bounded from 0 through 1. */
export type FractionRatio = Branded<number, "FractionRatio">;
/** Nonnegative percentage points. Values above 100 are preserved without policy meaning. */
export type NonnegativePercentagePoints = Branded<number, "NonnegativePercentagePoints">;
/** A presentation percentage explicitly bounded from 0 through 100. */
export type BoundedPercentagePoints0To100 = Branded<number, "BoundedPercentagePoints0To100">;
export type Confidence = Branded<number, "Confidence">;

export type ExtractionMethod =
  | "native_text" | "ocr" | "extracted" | "derived"
  | "manual" | "fallback" | "imported";

export type SourceRegion = Readonly<{ x: number; y: number; width: number; height: number }>;
export type SourceLocation = Readonly<{
  pageNumber?: number;
  locator?: string;
  region?: SourceRegion;
}>;
export type ProvenanceSource = Readonly<{
  documentId: DocumentId;
  location?: SourceLocation;
}>;
export type Provenance = Readonly<{
  sources: readonly ProvenanceSource[];
  evidenceIds: readonly EvidenceId[];
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

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const VERSION = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const CURRENCY = /^[A-Z]{3}$/;

function fail<T>(code: ValidationIssueCode, message: string): ValidationResult<T> {
  // Messages describe the contract and never echo rejected values, which may contain PII.
  return { ok: false, code, message };
}

/** Internal-only generic helper. Public callers cannot select the resulting brand. */
function validateBrandedId<T>(value: unknown): ValidationResult<T> {
  return typeof value === "string" && ID.test(value)
    ? { ok: true, value: value as T }
    : fail("invalid_id", "Identifier must be 1-128 safe non-whitespace characters.");
}

export const validateTenantId = (v: unknown) => validateBrandedId<TenantId>(v);
export const validateUserId = (v: unknown) => validateBrandedId<UserId>(v);
export const validateApplicationId = (v: unknown) => validateBrandedId<ApplicationId>(v);
export const validateBorrowerId = (v: unknown) => validateBrandedId<BorrowerId>(v);
export const validateDocumentId = (v: unknown) => validateBrandedId<DocumentId>(v);
export const validateEvidenceId = (v: unknown) => validateBrandedId<EvidenceId>(v);
export const validateConditionId = (v: unknown) => validateBrandedId<ConditionId>(v);
export const validateDecisionPackageId = (v: unknown) => validateBrandedId<DecisionPackageId>(v);
export const validateJobId = (v: unknown) => validateBrandedId<JobId>(v);
export const validateAuditEventId = (v: unknown) => validateBrandedId<AuditEventId>(v);
export const validateReportArtifactId = (v: unknown) => validateBrandedId<ReportArtifactId>(v);

/** Internal-only generic helper. Public callers cannot select the resulting version brand. */
function validateBrandedVersion<T>(value: unknown): ValidationResult<T> {
  return typeof value === "string" && VERSION.test(value)
    ? { ok: true, value: value as T }
    : fail("invalid_version", "Version must be 1-64 safe version characters.");
}

export const validateSchemaVersion = (v: unknown) => validateBrandedVersion<SchemaVersion>(v);
export const validateEngineVersion = (v: unknown) => validateBrandedVersion<EngineVersion>(v);
export const validateRuleVersion = (v: unknown) => validateBrandedVersion<RuleVersion>(v);
export const validateReportVersion = (v: unknown) => validateBrandedVersion<ReportVersion>(v);

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
  return c.ok ? { ok: true, value: Object.freeze({ cents: cents as MoneyCents, currency: c.value }) } : c;
}

export function validateFractionRatio(value: unknown): ValidationResult<FractionRatio> {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1
    ? { ok: true, value: value as FractionRatio }
    : fail("invalid_ratio", "Fraction ratio must be a finite number from 0 through 1.");
}

export function validateNonnegativePercentagePoints(value: unknown): ValidationResult<NonnegativePercentagePoints> {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? { ok: true, value: value as NonnegativePercentagePoints }
    : fail("invalid_ratio", "Percentage points must be a finite nonnegative number.");
}

export function validateBoundedPercentagePoints0To100(value: unknown): ValidationResult<BoundedPercentagePoints0To100> {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100
    ? { ok: true, value: value as BoundedPercentagePoints0To100 }
    : fail("invalid_ratio", "Bounded percentage points must be a finite number from 0 through 100.");
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
export const roundNonnegativePercentagePoints = (v: NonnegativePercentagePoints, places = 4) => round(v, places) as NonnegativePercentagePoints;
export const roundBoundedPercentagePoints0To100 = (v: BoundedPercentagePoints0To100, places = 4) => round(v, places) as BoundedPercentagePoints0To100;

function validateLocation(value: unknown): ValidationResult<SourceLocation> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return fail("invalid_provenance", "Source location must be an object when present.");
  const raw = value as Record<string, unknown>;
  if (raw.pageNumber !== undefined && (!Number.isSafeInteger(raw.pageNumber) || (raw.pageNumber as number) < 1))
    return fail("invalid_provenance", "Source page number must be a positive integer when present.");
  if (raw.locator !== undefined && (typeof raw.locator !== "string" || !raw.locator.trim() || raw.locator.length > 256))
    return fail("invalid_provenance", "Source locator must be 1-256 characters when present.");
  let region: SourceRegion | undefined;
  if (raw.region !== undefined) {
    if (!raw.region || typeof raw.region !== "object" || Array.isArray(raw.region))
      return fail("invalid_provenance", "Source region must be an object when present.");
    const r = raw.region as Record<string, unknown>;
    if (![r.x, r.y, r.width, r.height].every((n) => typeof n === "number" && Number.isFinite(n)) ||
        (r.x as number) < 0 || (r.y as number) < 0 || (r.width as number) <= 0 || (r.height as number) <= 0)
      return fail("invalid_provenance", "Source region requires nonnegative coordinates and positive dimensions.");
    region = Object.freeze({ x: r.x as number, y: r.y as number, width: r.width as number, height: r.height as number });
  }
  return { ok: true, value: Object.freeze({
    ...(raw.pageNumber === undefined ? {} : { pageNumber: raw.pageNumber as number }),
    ...(raw.locator === undefined ? {} : { locator: (raw.locator as string).trim() }),
    ...(region ? { region } : {}),
  }) };
}

export function createProvenance(input: {
  sources?: unknown; evidenceIds?: unknown; extractionMethod: unknown;
  confidence: unknown; assumption: unknown; producer: unknown; schemaVersion: unknown;
}): ValidationResult<Provenance> {
  const rawSources = input.sources ?? [];
  const rawEvidence = input.evidenceIds ?? [];
  if (!Array.isArray(rawSources) || !Array.isArray(rawEvidence))
    return fail("invalid_provenance", "Provenance sources and evidence IDs must be arrays.");

  const sources: ProvenanceSource[] = [];
  for (const item of rawSources) {
    if (!item || typeof item !== "object" || Array.isArray(item))
      return fail("invalid_provenance", "Each provenance source must be an object.");
    const source = item as Record<string, unknown>;
    const documentId = validateDocumentId(source.documentId);
    if (!documentId.ok) return fail("invalid_provenance", "Provenance source requires a valid document ID.");
    const location = source.location === undefined ? undefined : validateLocation(source.location);
    if (location && !location.ok) return location;
    sources.push(Object.freeze({ documentId: documentId.value, ...(location ? { location: location.value } : {}) }));
  }

  const evidenceIds: EvidenceId[] = [];
  for (const item of rawEvidence) {
    const evidenceId = validateEvidenceId(item);
    if (!evidenceId.ok) return fail("invalid_provenance", "Provenance evidence reference requires a valid evidence ID.");
    evidenceIds.push(evidenceId.value);
  }
  if (new Set(sources.map((s) => s.documentId)).size !== sources.length || new Set(evidenceIds).size !== evidenceIds.length)
    return fail("invalid_provenance", "Provenance references must not contain duplicate IDs.");

  const methods: ExtractionMethod[] = ["native_text", "ocr", "extracted", "derived", "manual", "fallback", "imported"];
  if (typeof input.extractionMethod !== "string" || !methods.includes(input.extractionMethod as ExtractionMethod))
    return fail("invalid_provenance", "Provenance extraction method is not supported.");
  const method = input.extractionMethod as ExtractionMethod;
  if (["native_text", "ocr", "extracted"].includes(method) && sources.length === 0)
    return fail("invalid_provenance", "Document extraction provenance requires at least one source document.");
  if (["derived", "fallback", "imported"].includes(method) && sources.length + evidenceIds.length === 0)
    return fail("invalid_provenance", "This provenance method requires at least one source or evidence input.");
  // Manual provenance intentionally permits zero document and evidence references.

  const confidence = validateConfidence(input.confidence);
  if (!confidence.ok) return fail("invalid_provenance", "Provenance requires confidence from 0 through 1.");
  if (typeof input.assumption !== "boolean") return fail("invalid_provenance", "Provenance assumption flag must be boolean.");
  if (typeof input.producer !== "string" || !input.producer.trim() || input.producer.length > 128)
    return fail("invalid_provenance", "Provenance producer must be 1-128 characters.");
  const version = validateSchemaVersion(input.schemaVersion);
  if (!version.ok) return fail("invalid_provenance", "Provenance requires a valid schema version.");

  return { ok: true, value: Object.freeze({
    sources: Object.freeze(sources), evidenceIds: Object.freeze(evidenceIds),
    extractionMethod: method, confidence: confidence.value,
    assumption: input.assumption, producer: input.producer.trim(), schemaVersion: version.value,
  }) };
}
