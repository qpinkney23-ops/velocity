import assert from "node:assert/strict";
import {compareSnapshots,createAnalysisSnapshot,historyEntry,type AnalysisSnapshot} from "../lib/change-intelligence/engine";

const analysis=(overrides:any={})=>({
 analysisVersion:"analysis.v1",
 enterpriseEvidence:{package:{packageId:overrides.evidenceId||"ep1",engineVersion:"e1",resolutions:[
  {fieldName:"borrower.name",canonicalValue:overrides.name||"Jane Doe"},
  {fieldName:"employment.employer",canonicalValue:"Acme"},
  {fieldName:"credit.score",canonicalValue:overrides.credit??720},
  {fieldName:"loan.amount",canonicalValue:overrides.loan??300000},
  {fieldName:"property.appraised_value",canonicalValue:overrides.property??400000},
 ],derivedValues:[
  {fieldName:"custom.monthly_qualifying_income",canonicalValue:overrides.income??10000},
  {fieldName:"custom.total_monthly_liabilities",canonicalValue:overrides.liabilities??3000},
  {fieldName:"custom.pitia",canonicalValue:overrides.pitia??2000},
  {fieldName:"custom.back_end_dti",canonicalValue:overrides.dti??.5},
  {fieldName:"custom.ltv",canonicalValue:overrides.ltv??.75},
 ]}},
 mortgageReview:{packageId:overrides.reviewId||"mr1",engineVersion:"m1",findings:overrides.findings||[]},
 canonicalConditions:overrides.conditions||[],
 decision:{state:overrides.decision||"incomplete"},
 readiness:{readinessLabel:overrides.readiness||"not_ready"},
 workflowFacts:{stage:"processing",status:"review_required",attention:"normal",priority:"normal",ownerId:null},
 calculations:{reproductionMetadata:{version:"c1"}},normalized:{borrower:"Jane Doe"},
});
const snap=(sequence:number,a:any,docs:any[]=[],parent:AnalysisSnapshot|null=null):AnalysisSnapshot=>createAnalysisSnapshot({applicationId:"app1",tenantId:"tenant1",sequence,parentSnapshotId:parent?.snapshotId||null,analysis:a,documentLineage:docs,createdAt:`2026-01-0${sequence}T00:00:00.000Z`,triggerType:sequence===1?"initial_analysis":"manual_reanalysis"});
const docs=[{documentId:"d1",processingFingerprint:"p1",evidenceCount:4}];
const base=snap(1,analysis(),docs);
const same=snap(1,analysis(),docs);
assert.equal(base.snapshotId,same.snapshotId,"equivalent state has deterministic identity");
assert.equal(base.sequence,1);
assert.equal(base.validation.valid,true);
assert.equal(base.documents.length,1);
assert.throws(()=>createAnalysisSnapshot({applicationId:"a",tenantId:"t",sequence:1,parentSnapshotId:null,analysis:{},documentLineage:[],createdAt:"x",triggerType:"initial_analysis"}),/SNAPSHOT_REFERENCE_INVALID/);

const changed=snap(2,analysis({income:9000,liabilities:3500,dti:.61,ltv:.8,credit:690,decision:"blocked",readiness:"not_ready",conditions:[{id:"c1",status:"open",severity:"high",blocking:true}],findings:[{ruleId:"MR-1",affectedFields:["income"],severity:"high",disposition:"open",reviewRequired:true,blocking:true}]}),[...docs,{documentId:"d2",processingFingerprint:"p2",evidenceCount:3}],base);
const pkg=compareSnapshots(base,changed);
assert.equal(pkg.priorSnapshotId,base.snapshotId);
assert.equal(pkg.currentSnapshotId,changed.snapshotId);
assert.equal(pkg.validation.causalGraphAcyclic,true);
assert.equal(pkg.reReviewRequired,true);
assert.equal(pkg.overallMateriality,"critical");
assert.ok(pkg.summary.total>=8);
assert.ok(pkg.summary.adverse>=5);
assert.ok(pkg.summary.blocking>=2);
assert.ok(pkg.byCategory.document.length===1);
assert.ok(pkg.byCategory.income.length===1);
assert.ok(pkg.byCategory.dti.length===1);
assert.ok(pkg.byCategory.ltv.length===1);
assert.ok(pkg.byCategory.credit.length===1);
assert.ok(pkg.byCategory.condition.length===1);
assert.ok(pkg.byCategory.mortgage_review.length===1);
assert.ok(pkg.byCategory.underwriting_decision.length===1);
assert.ok(pkg.changes.find(x=>x.category==="underwriting_decision")!.upstreamChangeIds.length>0);
assert.equal(pkg.packageId,compareSnapshots(base,changed).packageId,"comparison is deterministic");

const formatting=snap(2,analysis({name:"Jane-Doe"}),docs,base),formatPkg=compareSnapshots(base,formatting);
assert.equal(formatPkg.summary.total,1);
assert.equal(formatPkg.changes[0].materiality,"immaterial");
assert.equal(formatPkg.changes[0].reviewRequired,false);
const smallIncome=snap(2,analysis({income:10050}),docs,base),smallPkg=compareSnapshots(base,smallIncome);
assert.equal(smallPkg.changes.find(x=>x.category==="income")?.materiality,"immaterial");
const favorable=snap(2,analysis({income:11000,dti:.45,credit:750}),docs,base),favorablePkg=compareSnapshots(base,favorable);
assert.ok(favorablePkg.summary.favorable>=3);
assert.equal(favorablePkg.overallFavorability,"favorable");
const entry=historyEntry(changed,pkg);
assert.equal(entry.sequence,2);
assert.equal(entry.reviewRequired,true);
assert.equal(entry.materialChanges,pkg.summary.material+pkg.summary.critical);
assert.throws(()=>compareSnapshots(changed,base),/CHANGE_COMPARISON_INVALID/);
console.log(`PASS change-intelligence regression (${pkg.summary.total} detected changes)`);
