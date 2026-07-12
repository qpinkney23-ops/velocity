import { createHash } from "node:crypto";
import type { AuthorizedDocumentProcessingResultV1 } from "../documents/authorizedDocumentProcessing";

export const DOCUMENT_EVIDENCE_SET_V1 = "document-evidence-set.v1" as const;
export const DOCUMENT_EVIDENCE_RECORD_V1 = "document-evidence-record.v1" as const;
export const EVIDENCE_EXTRACTION_ENGINE_VERSION = "deterministic-evidence-extractor.v1" as const;

export const EVIDENCE_CATEGORIES = Object.freeze(["identity", "employment", "income", "assets", "liabilities", "credit", "property", "purchase_contract", "insurance", "tax", "bank_statements", "unknown"] as const);
export type EvidenceType = typeof EVIDENCE_CATEGORIES[number];
export type NormalizedEvidenceValueV1 = Readonly<{ kind: "text" | "currency" | "percentage" | "date" | "phone" | "address" | "employer_name" | "loan_number" | "property_value" | "income_value"; value: string }>;
export type EvidenceProvenanceV1 = Readonly<{ source: "authorized_document_processing"; processingSchemaVersion: AuthorizedDocumentProcessingResultV1["schemaVersion"]; documentAuthorizationVersion: string; retrievalPolicyVersion: string; pageProcessingFingerprint: string }>;
export type DocumentEvidenceRecordV1 = Readonly<{ schemaVersion: typeof DOCUMENT_EVIDENCE_RECORD_V1; documentId: string; applicationId: string; tenantId: string; pageNumber: number; sourceText: string; normalizedValue: NormalizedEvidenceValueV1; confidence: number | null; extractionMethod: "native_text" | "ocr"; engineVersion: typeof EVIDENCE_EXTRACTION_ENGINE_VERSION; processingFingerprint: string; sourceContentHash: string; evidenceType: EvidenceType; fieldIdentifier: string; warnings: readonly string[]; diagnostics: readonly string[]; provenance: EvidenceProvenanceV1 }>;
export type EvidenceConflictV1 = Readonly<{ fieldIdentifier: string; evidenceRecordIds: readonly string[]; normalizedValues: readonly string[]; warning: "conflicting_evidence" }>;
export type DocumentEvidenceSetV1 = Readonly<{ schemaVersion: typeof DOCUMENT_EVIDENCE_SET_V1; documentId: string; applicationId: string; tenantId: string; evidence: readonly DocumentEvidenceRecordV1[]; summary: Readonly<{ evidenceCounts: Readonly<Record<EvidenceType, number>>; warnings: readonly string[]; conflicts: readonly EvidenceConflictV1[]; missingCategories: readonly EvidenceType[]; processingFingerprint: string }> }>;

type Match = { evidenceType: EvidenceType; fieldIdentifier: string; raw: string; kind: NormalizedEvidenceValueV1["kind"] };
const clean = (value: string) => value.normalize("NFKC").replace(/\s+/g, " ").trim();
const money = (value: string) => { const negative = /^\s*\(/.test(value); const n = value.replace(/[^\d.]/g, ""); return `${negative ? "-" : ""}${n}`; };
const date = (value: string) => { const match = clean(value).match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/); return match ? `${match[3]}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}` : clean(value); };
const normalize = (kind: NormalizedEvidenceValueV1["kind"], raw: string): NormalizedEvidenceValueV1 => Object.freeze({ kind, value: kind === "currency" || kind === "property_value" || kind === "income_value" ? money(raw) : kind === "percentage" ? clean(raw).replace(/\s*%$/, "") : kind === "date" ? date(raw) : kind === "phone" ? raw.replace(/\D/g, "") : kind === "loan_number" ? raw.replace(/[^A-Za-z0-9]/g, "").toUpperCase() : clean(raw) });
const rules: readonly Readonly<{ regex: RegExp; evidenceType: EvidenceType; fieldIdentifier: string; kind: NormalizedEvidenceValueV1["kind"] }>[] = Object.freeze([
  { regex: /(?:borrower|name)\s*:\s*([^\n]+)/gi, evidenceType: "identity", fieldIdentifier: "identity.name", kind: "text" },
  { regex: /(?:driver(?:'s)? license|license)(?: number| no\.?| #)?\s*:\s*([A-Z0-9-]+)/gi, evidenceType: "identity", fieldIdentifier: "identity.driver_license_number", kind: "text" },
  { regex: /(?:phone|telephone)\s*:\s*([+()\d .-]{7,})/gi, evidenceType: "identity", fieldIdentifier: "identity.phone", kind: "phone" },
  { regex: /(?:address|property address)\s*:\s*([^\n]+)/gi, evidenceType: "property", fieldIdentifier: "property.address", kind: "address" },
  { regex: /(?:employer|employer name)\s*:\s*([^\n]+)/gi, evidenceType: "employment", fieldIdentifier: "employment.employer_name", kind: "employer_name" },
  { regex: /(?:gross pay|gross income|monthly income|annual income|wages|income)\s*:\s*(\(?\$?[\d,]+(?:\.\d{1,2})?\)?)/gi, evidenceType: "income", fieldIdentifier: "income.amount", kind: "income_value" },
  { regex: /(?:account balance|ending balance|available balance|assets?)\s*:\s*(\(?\$?[\d,]+(?:\.\d{1,2})?\)?)/gi, evidenceType: "assets", fieldIdentifier: "assets.amount", kind: "currency" },
  { regex: /(?:monthly payment|balance owed|liabilit(?:y|ies))\s*:\s*(\(?\$?[\d,]+(?:\.\d{1,2})?\)?)/gi, evidenceType: "liabilities", fieldIdentifier: "liabilities.amount", kind: "currency" },
  { regex: /(?:credit score|fico)\s*:\s*(\d{3})/gi, evidenceType: "credit", fieldIdentifier: "credit.score", kind: "text" },
  { regex: /(?:purchase price|property value|appraised value)\s*:\s*(\$?[\d,]+(?:\.\d{1,2})?)/gi, evidenceType: "property", fieldIdentifier: "property.value", kind: "property_value" },
  { regex: /(?:contract price|purchase agreement price)\s*:\s*(\$?[\d,]+(?:\.\d{1,2})?)/gi, evidenceType: "purchase_contract", fieldIdentifier: "purchase_contract.price", kind: "currency" },
  { regex: /(?:insurance premium|annual premium)\s*:\s*(\$?[\d,]+(?:\.\d{1,2})?)/gi, evidenceType: "insurance", fieldIdentifier: "insurance.premium", kind: "currency" },
  { regex: /(?:tax year)\s*:\s*(\d{4})/gi, evidenceType: "tax", fieldIdentifier: "tax.year", kind: "text" },
  { regex: /(?:bank statement|statement period)\s*:\s*([^\n]+)/gi, evidenceType: "bank_statements", fieldIdentifier: "bank_statements.period", kind: "text" },
  { regex: /(?:loan number|loan no\.?|loan #)\s*:\s*([A-Z0-9 -]+)/gi, evidenceType: "credit", fieldIdentifier: "credit.loan_number", kind: "loan_number" },
  { regex: /(?:interest rate|rate)\s*:\s*([\d.]+\s*%)/gi, evidenceType: "credit", fieldIdentifier: "credit.interest_rate", kind: "percentage" },
  { regex: /(?:date of birth|dob|statement date|effective date|closing date)\s*:\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{4})/gi, evidenceType: "identity", fieldIdentifier: "identity.date", kind: "date" },
]);
const freezeArray = <T>(items: T[]) => Object.freeze(items.map(item => typeof item === "object" && item !== null ? Object.freeze(item) : item)) as readonly T[];

export function extractDocumentEvidence(input: AuthorizedDocumentProcessingResultV1): DocumentEvidenceSetV1 {
  const records: DocumentEvidenceRecordV1[] = [];
  for (const page of input.pages) {
    const matches: Match[] = [];
    for (const rule of rules) { rule.regex.lastIndex = 0; for (let match = rule.regex.exec(page.text); match; match = rule.regex.exec(page.text)) matches.push({ evidenceType: rule.evidenceType, fieldIdentifier: rule.fieldIdentifier, raw: match[1], kind: rule.kind }); }
    if (!matches.length && clean(page.text)) matches.push({ evidenceType: "unknown", fieldIdentifier: "unknown.unclassified_text", raw: page.text, kind: "text" });
    for (const match of matches) {
      const warnings = [...page.warnings, ...(page.confidence === undefined ? ["confidence_unavailable"] : [])];
      records.push(Object.freeze({ schemaVersion: DOCUMENT_EVIDENCE_RECORD_V1, documentId: input.documentId, applicationId: input.applicationId, tenantId: input.tenantId, pageNumber: page.pageNumber, sourceText: clean(match.raw), normalizedValue: normalize(match.kind, match.raw), confidence: page.confidence ?? null, extractionMethod: page.method, engineVersion: EVIDENCE_EXTRACTION_ENGINE_VERSION, processingFingerprint: input.processingFingerprint, sourceContentHash: input.sourceContentHash, evidenceType: match.evidenceType, fieldIdentifier: match.fieldIdentifier, warnings: freezeArray(warnings), diagnostics: freezeArray([...input.diagnostics]), provenance: Object.freeze({ source: "authorized_document_processing", processingSchemaVersion: input.schemaVersion, documentAuthorizationVersion: input.documentAuthorizationVersion, retrievalPolicyVersion: input.provenance.retrievalPolicyVersion, pageProcessingFingerprint: page.processingFingerprint }) }));
    }
  }
  const grouped = new Map<string, { indexes: number[]; values: Set<string> }>();
  records.forEach((record, index) => { const group = grouped.get(record.fieldIdentifier) ?? { indexes: [], values: new Set<string>() }; group.indexes.push(index); group.values.add(`${record.normalizedValue.kind}:${record.normalizedValue.value}`); grouped.set(record.fieldIdentifier, group); });
  const conflicts: EvidenceConflictV1[] = [];
  for (const [fieldIdentifier, group] of grouped) if (group.values.size > 1) { group.indexes.forEach(index => { const record = records[index]; records[index] = Object.freeze({ ...record, warnings: freezeArray([...record.warnings, "conflicting_evidence"]) }); }); conflicts.push(Object.freeze({ fieldIdentifier, evidenceRecordIds: freezeArray(group.indexes.map(index => createHash("sha256").update(JSON.stringify([input.processingFingerprint, records[index].pageNumber, fieldIdentifier, records[index].sourceText])).digest("hex"))), normalizedValues: freezeArray([...group.values]), warning: "conflicting_evidence" })); }
  const counts = Object.fromEntries(EVIDENCE_CATEGORIES.map(category => [category, records.filter(record => record.evidenceType === category).length])) as Record<EvidenceType, number>;
  const warnings = [...input.warnings, ...(records.length ? [] : ["no_evidence_extracted"]), ...(conflicts.length ? ["conflicting_evidence"] : [])];
  return Object.freeze({ schemaVersion: DOCUMENT_EVIDENCE_SET_V1, documentId: input.documentId, applicationId: input.applicationId, tenantId: input.tenantId, evidence: freezeArray(records), summary: Object.freeze({ evidenceCounts: Object.freeze(counts), warnings: freezeArray(warnings), conflicts: freezeArray(conflicts), missingCategories: freezeArray(EVIDENCE_CATEGORIES.filter(category => category !== "unknown" && counts[category] === 0)), processingFingerprint: input.processingFingerprint }) });
}
