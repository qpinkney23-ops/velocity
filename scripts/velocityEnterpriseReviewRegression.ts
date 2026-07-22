import assert from "node:assert/strict";
import { aggregateApplicationEvidence, APPLICATION_EVIDENCE_AGGREGATION_POLICY } from "../lib/server/evidence/applicationEvidence";
import { extractDocumentEvidence, type DocumentEvidenceSetV1 } from "../lib/server/evidence/documentEvidence";
import { evidenceDocs, buildEnterpriseReview } from "../lib/server/applications/enterpriseEvidenceReview";
import { analyzeApplication } from "../lib/ai/analyzeApplication";

const hash = "a".repeat(64);
const processing = (documentId:string, text:string, confidence=.92) => ({schemaVersion:"authorized-document-processing.v1",tenantId:"tenant_1",applicationId:"application_1",documentId,documentAuthorizationVersion:"auth_v1",sourceContentHash:hash,sourceSizeBytes:100,sourceContentType:"application/pdf",processingStatus:"completed",processingStage:"completed",engine:{id:"test",version:"1"},processingPolicyVersion:"document-processing-policy.v1",normalizationVersion:"document-text-normalization.v1",startedAt:"2026-01-01T00:00:00.000Z",completedAt:"2026-01-01T00:00:00.000Z",requestId:"request_1",correlationId:"correlation_1",pageCount:1,normalizedText:text,pages:[{schemaVersion:"authorized-document-processing.v1",documentId,pageNumber:1,method:"native_text",text,confidence,warnings:[],sourceContentHash:hash,processingFingerprint:hash,assumption:false}],warnings:[],diagnostics:[],provenance:{source:"authorized_document_bytes",retrievalPolicyVersion:"document-retrieval-policy.v1",authorizationVersion:"auth_v1"},stages:[],processingFingerprint:hash} as const);

async function review(texts:string[]) {
  const sets = texts.map((text,index)=>extractDocumentEvidence(processing(`doc_${index+1}`,text))) as DocumentEvidenceSetV1[];
  const aggregate=aggregateApplicationEvidence(sets,APPLICATION_EVIDENCE_AGGREGATION_POLICY,{aggregatedAt:"2026-01-01T00:00:00.000Z",requestId:"request_1",correlationId:"correlation_1"});
  const analysis=await analyzeApplication(evidenceDocs(aggregate),{applicationId:"application_1",analysisVersion:"test.v1"});
  return buildEnterpriseReview(aggregate,analysis);
}

async function main(){
const docs=["Borrower: Jamie Rivera","Loan Amount: $320,000","Employer: Acme Corp\nAnnual Income: $120,000","Credit Score: 740\nMonthly Payment: $900","Appraised Value: $400,000"];
const first=await review(docs);
assert.equal(first.package.validation.valid,true,"package validates");
for(const field of ["borrower.name","employment.employer","income.amount","credit.score","debts.monthly","loan.amount","property.appraised_value"]) assert(first.package.resolutions.some(r=>r.fieldName===field),`${field} has evidence`);
assert(first.package.derivedValues.some(v=>v.fieldName==="custom.monthly_qualifying_income"),"income chain exists");
assert(first.package.derivedValues.some(v=>v.fieldName==="custom.total_monthly_liabilities"),"debt chain exists");
assert(first.package.derivedValues.some(v=>v.fieldName==="custom.pitia"),"PITIA chain exists");
assert(first.package.derivedValues.some(v=>v.fieldName==="custom.back_end_dti"),"DTI chain exists");
assert(first.package.derivedValues.some(v=>v.fieldName==="custom.ltv"),"LTV chain exists");
const agreeing=await review([...docs,"Credit Score: 740"]);
assert(agreeing.package.resolutions.every(r=>r.reason==="unanimous_evidence"),"agreeing sources resolve deterministically");
const replay=await review(docs);
assert.equal(first.package.packageId,replay.package.packageId,"deterministic replay has equivalent identity");
const conflict=await review([...docs,"Credit Score: 710"]);
assert(conflict.package.conflicts.some(c=>c.fieldName==="credit.score"),"conflicts remain visible");
assert.equal(conflict.state,"review_required","material conflict requires review");
const missing=await review(["Borrower: Jamie Rivera"]);
assert.equal(missing.state,"blocked","missing material evidence blocks the slice");
console.log("Enterprise evidence-backed review regression passed.");
}
main().catch(error=>{console.error(error);process.exitCode=1});
