export const SCHEMA_VERSION = "velocity.enterprise-renderer.v1" as const;
export const DOCUMENT_FAMILY = "BANK_STATEMENT" as const;

export type LayoutId = "lakeview-traditional-v1" | "lakeview-modern-v1";

export interface BorrowerIdentity {
  readonly id: string;
  readonly schemaVersion: typeof SCHEMA_VERSION;
  readonly legalName: string;
  readonly addressLines: readonly string[];
}

export interface StatementPeriod {
  readonly startDate: string;
  readonly endDate: string;
}

export type TransactionKind = "DEPOSIT" | "WITHDRAWAL" | "FEE";

export interface TransactionTruth {
  readonly id: string;
  readonly schemaVersion: typeof SCHEMA_VERSION;
  readonly date: string;
  readonly description: string;
  readonly kind: TransactionKind;
  readonly amountCents: number;
}

export interface AccountTruth {
  readonly id: string;
  readonly schemaVersion: typeof SCHEMA_VERSION;
  readonly accountType: "CHECKING";
  readonly accountNumberLast4: string;
  readonly period: StatementPeriod;
  readonly beginningBalanceCents: number;
  readonly transactions: readonly TransactionTruth[];
}

export interface ScenarioTruth {
  readonly id: string;
  readonly schemaVersion: typeof SCHEMA_VERSION;
  readonly seed: string;
  readonly borrower: BorrowerIdentity;
  readonly account: AccountTruth;
}

export interface InstitutionProfile {
  readonly id: string;
  readonly schemaVersion: typeof SCHEMA_VERSION;
  readonly version: "1.0.0";
  readonly legalName: string;
  readonly shortName: string;
  readonly customerService: string;
  readonly website: string;
  readonly address: string;
  readonly syntheticNotice: string;
  readonly supportedLayouts: readonly LayoutId[];
}

export interface TemplateProfile {
  readonly id: "bank-statement-v1";
  readonly schemaVersion: typeof SCHEMA_VERSION;
  readonly version: "1.0.0";
  readonly documentFamily: typeof DOCUMENT_FAMILY;
  readonly pageCount: 2;
}

export interface LayoutVariant {
  readonly id: LayoutId;
  readonly schemaVersion: typeof SCHEMA_VERSION;
  readonly version: "1.0.0";
  readonly name: string;
  readonly structure: "TRADITIONAL_REGIONAL" | "MODERN_DIGITAL";
}

export interface ArtifactProfile {
  readonly id: "typical-production-scan-v1";
  readonly schemaVersion: typeof SCHEMA_VERSION;
  readonly version: "1.0.0";
  readonly rotationDegrees: readonly [number, number];
  readonly skewPixels: readonly [number, number];
  readonly noiseDensity: number;
  readonly jpegQuality: number;
  readonly foldShadowProbability: number;
  readonly allowedDpi: readonly number[];
}

export interface FieldProvenance {
  readonly fieldId: string;
  readonly canonicalPath: string;
  readonly documentId: string;
  readonly pages: readonly number[];
  readonly transformation: string;
}

export interface PopulatedTransaction extends TransactionTruth {
  readonly runningBalanceCents: number;
}

export interface PopulatedBankStatement {
  readonly documentId: string;
  readonly schemaVersion: typeof SCHEMA_VERSION;
  readonly family: typeof DOCUMENT_FAMILY;
  readonly institution: InstitutionProfile;
  readonly template: TemplateProfile;
  readonly layout: LayoutVariant;
  readonly borrower: BorrowerIdentity;
  readonly account: AccountTruth;
  readonly maskedAccountNumber: string;
  readonly depositsCents: number;
  readonly withdrawalsCents: number;
  readonly feesCents: number;
  readonly endingBalanceCents: number;
  readonly transactions: readonly PopulatedTransaction[];
  readonly provenance: readonly FieldProvenance[];
}

export interface ValidationResult {
  readonly ruleId: string;
  readonly status: "PASS" | "ERROR";
  readonly message: string;
}

export interface AppliedPageArtifacts {
  readonly pageNumber: number;
  readonly dpi: number;
  readonly rotationDegrees: number;
  readonly skewPixels: number;
  readonly noiseDensity: number;
  readonly jpegQuality: number;
  readonly foldShadowApplied: boolean;
}

export interface RenderedDocumentManifest {
  readonly schemaVersion: typeof SCHEMA_VERSION;
  readonly generatorVersion: "1.0.0";
  readonly scenarioId: string;
  readonly seed: string;
  readonly documentId: string;
  readonly documentFamily: typeof DOCUMENT_FAMILY;
  readonly institution: { readonly id: string; readonly version: string };
  readonly template: { readonly id: string; readonly version: string };
  readonly layout: { readonly id: LayoutId; readonly version: string };
  readonly artifactProfile: { readonly id: string; readonly version: string };
  readonly pageCount: number;
  readonly artifacts: readonly AppliedPageArtifacts[];
  readonly pageImageSha256: readonly string[];
  readonly borrowerFacingPdfSha256: string;
  readonly groundTruthSha256: string;
  readonly validationResultsSha256: string;
  readonly binaryDeterminism: "BYTE_IDENTICAL_WITHIN_PINNED_RUNTIME";
  readonly binaryDeterminismNote: string;
}

export interface GroundTruthPackage {
  readonly schemaVersion: typeof SCHEMA_VERSION;
  readonly scenario: ScenarioTruth;
  readonly documentId: string;
  readonly layoutId: LayoutId;
  readonly expected: {
    readonly beginningBalanceCents: number;
    readonly depositsCents: number;
    readonly withdrawalsCents: number;
    readonly feesCents: number;
    readonly endingBalanceCents: number;
    readonly transactionCount: number;
  };
  readonly provenance: readonly FieldProvenance[];
}
