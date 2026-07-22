import { buildEvidencePackage } from "../../evidence/aggregation/package";
import { createEvidence } from "../../evidence/provenance/factory";
import { resolutionKey, type DerivedValueInput, type EvidenceObject, type EvidencePackage, type FieldName } from "../../evidence/contracts";
import type { ApplicationEvidenceSetV1 } from "../evidence/applicationEvidence";
import type { ApplicationAnalysisResult, ParsedAnalysisDoc, ParsedAnalysisDocType } from "../../ai/applicationAnalysisSchema";

export const ENTERPRISE_REVIEW_VERSION = "enterprise-underwriter-review.v1" as const;

const FIELD_MAP: Readonly<Record<string, FieldName>> = Object.freeze({
  "identity.name": "borrower.name",
  "employment.employer_name": "employment.employer",
  "income.amount": "income.amount",
  "credit.score": "credit.score",
  "liabilities.amount": "debts.monthly",
  "property.value": "property.appraised_value",
  "purchase_contract.price": "property.purchase_price",
  "loan.amount": "loan.amount",
  "housing.taxes": "housing.taxes",
  "housing.insurance": "housing.insurance",
  "housing.hoa": "housing.hoa",
});

const docType = (category: string): ParsedAnalysisDocType =>
  category === "credit" || category === "liabilities" ? "credit" :
  category === "income" ? "paystub" : category === "employment" ? "employment" :
  category === "purchase_contract" || category === "property" ? "purchase" :
  category === "identity" ? "id" : "unknown";

const numberValue = (value: unknown) => {
  const parsed = typeof value === "number" ? value : Number(String(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
};

export function evidenceDocs(input: ApplicationEvidenceSetV1): ParsedAnalysisDoc[] {
  const byDocument = new Map<string, ParsedAnalysisDoc>();
  for (const record of input.candidates) {
    const existing = byDocument.get(record.documentId) || { name: record.documentId, type: docType(record.evidenceType), text: "", extracted: {} };
    existing.text = [existing.text, record.sourceText].filter(Boolean).join("\n");
    existing.type = existing.type === "unknown" ? docType(record.evidenceType) : existing.type;
    const value = record.normalizedValue.value;
    if (record.fieldIdentifier === "identity.name") existing.extracted.borrower = value;
    if (record.fieldIdentifier === "employment.employer_name") (existing.extracted as any).employer = value;
    if (record.fieldIdentifier === "income.amount") existing.extracted.income = numberValue(value);
    if (record.fieldIdentifier === "credit.score") existing.extracted.creditScore = numberValue(value);
    if (record.fieldIdentifier === "liabilities.amount") existing.extracted.debts = numberValue(value);
    if (record.fieldIdentifier === "property.value" || record.fieldIdentifier === "purchase_contract.price") existing.extracted.propertyValue = numberValue(value);
    if (record.fieldIdentifier === "loan.amount") existing.extracted.loanAmount = numberValue(value);
    byDocument.set(record.documentId, existing);
  }
  return [...byDocument.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function canonicalEvidence(input: ApplicationEvidenceSetV1): EvidenceObject[] {
  const output: EvidenceObject[] = [];
  for (const candidate of input.candidates) {
    const fieldName = FIELD_MAP[candidate.fieldIdentifier];
    if (!fieldName) continue;
    const normalized = ["income.amount", "credit.score", "debts.monthly", "property.appraised_value", "property.purchase_price", "loan.amount", "housing.taxes", "housing.insurance", "housing.hoa"].includes(fieldName)
      ? numberValue(candidate.normalizedValue.value) : candidate.normalizedValue.value;
    if (normalized === null || normalized === "") continue;
    const created = createEvidence({ fieldName, canonicalValue: normalized, rawValue: candidate.sourceText, normalizedValue: normalized,
      confidence: candidate.confidence ?? 0.5, documentId: candidate.documentId, documentType: candidate.evidenceType,
      borrowerId: null, pageNumber: candidate.pageNumber,
      // The extractor supplies page provenance but no coordinates; the page extent is the narrowest truthful region available.
      boundingRegion: { unit: "normalized", x: 0, y: 0, width: 1, height: 1, pageWidth: 1, pageHeight: 1 },
      ocrText: candidate.sourceText, extractionMethod: candidate.extractionMethod, sourceComponent: "deterministic-evidence-extractor",
      timestamp: input.aggregatedAt, version: "1.0.0" });
    if (!created.ok) throw new Error(`ENTERPRISE_EVIDENCE_INVALID:${created.errors.map(e => e.ruleId).join(",")}`);
    output.push(created.value);
  }
  return output;
}

export type EnterpriseFieldReview = Readonly<{field:string;label:string;canonicalValue:string|number|boolean|null;confidence:number|null;verificationState:"verified"|"conflict"|"review_required";sourceCount:number;winningEvidenceId:string|null;supportingEvidenceIds:readonly string[];rejectedEvidenceIds:readonly string[];resolutionReason:string|null;dependencies:readonly string[]}>;
export type EnterpriseReview = Readonly<{schemaVersion:typeof ENTERPRISE_REVIEW_VERSION;state:"evidence_backed"|"review_required"|"blocked";package:EvidencePackage;fields:readonly EnterpriseFieldReview[];blockedReasons:readonly string[];reviewReasons:readonly string[];provenancePrecision:"page_only"}>;

export function buildEnterpriseReview(input: ApplicationEvidenceSetV1, analysis: ApplicationAnalysisResult): EnterpriseReview {
  const first = buildEvidencePackage(canonicalEvidence(input), input.aggregatedAt);
  if (!first.ok) throw new Error(`ENTERPRISE_PACKAGE_INVALID:${first.errors.map(e => e.ruleId).join(",")}`);
  const resolution = new Map(first.value.resolutions.map(r => [r.fieldName, r]));
  const required: FieldName[] = ["borrower.name","employment.employer","income.amount","credit.score","debts.monthly","loan.amount"];
  const propertyResolution = resolution.get("property.appraised_value") || resolution.get("property.purchase_price");
  const blockedReasons = required.filter(field => !resolution.has(field)).map(field => `missing_required_evidence:${field}`);
  if (!propertyResolution) blockedReasons.push("missing_required_evidence:property.value");
  const calculations = analysis.calculations;
  const dependencies: Record<string, string[]> = {
    "custom.monthly_qualifying_income": ["income.amount"],
    "custom.total_monthly_liabilities": ["debts.monthly"],
    "custom.pitia": ["loan.amount", propertyResolution?.fieldName || "property.appraised_value"],
    "custom.back_end_dti": ["income.amount", "debts.monthly", "custom.pitia"],
    "custom.ltv": ["loan.amount", propertyResolution?.fieldName || "property.appraised_value"],
  };
  const derivedInputs: DerivedValueInput[] = [];
  const pushDerived = (fieldName: FieldName, value: number|null|undefined, formula: string, fields: string[]) => {
    if (value === null || value === undefined || fields.some(f => f.startsWith("custom.") || !resolution.has(f as FieldName))) return;
    derivedInputs.push({fieldName, borrowerId:null, canonicalValue:value, formula, inputResolutionKeys:fields.map(f => resolutionKey(f as FieldName,null)), timestamp:input.aggregatedAt, version:"1.0.0"});
  };
  pushDerived("custom.monthly_qualifying_income", calculations?.monthlyQualifyingIncome.result, "canonical annual qualifying income / 12", dependencies["custom.monthly_qualifying_income"]);
  pushDerived("custom.total_monthly_liabilities", calculations?.monthlyLiabilities.result, "canonical sum of included monthly liabilities", dependencies["custom.total_monthly_liabilities"]);
  pushDerived("custom.pitia", calculations?.pitia.result, "canonical PITIA calculation", dependencies["custom.pitia"]);
  pushDerived("custom.back_end_dti", calculations?.backEndDti.result, "canonical (monthly liabilities + PITIA) / monthly qualifying income", ["income.amount","debts.monthly","loan.amount",propertyResolution?.fieldName || "property.appraised_value"]);
  pushDerived("custom.ltv", calculations?.ltv.result, "canonical loan amount / property value", dependencies["custom.ltv"]);
  const packaged = buildEvidencePackage(first.value.evidence, input.aggregatedAt, derivedInputs);
  if (!packaged.ok) throw new Error(`ENTERPRISE_PACKAGE_INVALID:${packaged.errors.map(e => e.ruleId).join(",")}`);
  const conflicts = new Set(packaged.value.conflicts.map(c => c.fieldName));
  const labels: Record<string,string> = {"borrower.name":"Borrower name","employment.employer":"Employer","income.amount":"Monthly qualifying income","credit.score":"Representative credit score","debts.monthly":"Total monthly liabilities","custom.pitia":"Proposed housing expense / PITIA","loan.amount":"Loan amount","property.appraised_value":"Property value","property.purchase_price":"Property value","custom.back_end_dti":"Back-end DTI","custom.ltv":"LTV"};
  const fields: EnterpriseFieldReview[] = [];
  for (const r of packaged.value.resolutions) fields.push({field:r.fieldName,label:labels[r.fieldName]||r.fieldName,canonicalValue:r.canonicalValue,confidence:r.confidence,verificationState:conflicts.has(r.fieldName)?"conflict":"verified",sourceCount:1+r.supportingEvidenceIds.length+r.rejectedEvidenceIds.length,winningEvidenceId:r.winningEvidenceId,supportingEvidenceIds:r.supportingEvidenceIds,rejectedEvidenceIds:r.rejectedEvidenceIds,resolutionReason:r.reason,dependencies:[]});
  for (const d of packaged.value.derivedValues) fields.push({field:d.fieldName,label:labels[d.fieldName]||d.fieldName,canonicalValue:d.canonicalValue,confidence:null,verificationState:"verified",sourceCount:d.inputEvidenceIds.length,winningEvidenceId:null,supportingEvidenceIds:d.inputEvidenceIds,rejectedEvidenceIds:[],resolutionReason:d.formula,dependencies:dependencies[d.fieldName]||[]});
  const reviewReasons = packaged.value.conflicts.map(c => `material_conflict:${c.fieldName}`);
  return Object.freeze({schemaVersion:ENTERPRISE_REVIEW_VERSION,state:blockedReasons.length?"blocked":reviewReasons.length?"review_required":"evidence_backed",package:packaged.value,fields:Object.freeze(fields),blockedReasons:Object.freeze(blockedReasons),reviewReasons:Object.freeze(reviewReasons),provenancePrecision:"page_only"});
}
