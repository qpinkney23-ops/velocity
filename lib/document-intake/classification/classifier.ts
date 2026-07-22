import type { Classification, DocumentType, IntakeUpload } from "../contracts";

const rules: readonly Readonly<{type:DocumentType; patterns:readonly RegExp[]; weight:number}>[] = [
 {type:"1003",patterns:[/\b1003\b/i,/uniform residential loan application/i],weight:.98},
 {type:"Credit Report",patterns:[/credit report/i,/credit score/i,/equifax|experian|transunion/i],weight:.94},
 {type:"Driver License",patterns:[/driver'?s? license/i,/\bDL\b/i],weight:.94}, {type:"Passport",patterns:[/passport/i],weight:.96},
 {type:"Paystub",patterns:[/pay ?stub/i,/earnings statement/i,/gross pay/i],weight:.9}, {type:"W2",patterns:[/\bW-?2\b/i,/wage and tax statement/i],weight:.96},
 {type:"1099",patterns:[/\b1099(?:-[a-z]+)?\b/i],weight:.96}, {type:"Bank Statement",patterns:[/bank statement/i,/account statement/i,/ending balance/i],weight:.9},
 {type:"VOE",patterns:[/verification of employment/i,/\bVOE\b/i],weight:.95}, {type:"Tax Return",patterns:[/tax return/i,/\b1040\b/i],weight:.92},
 {type:"Purchase Agreement",patterns:[/purchase agreement/i,/contract of sale/i],weight:.94}, {type:"Appraisal",patterns:[/appraisal/i,/uniform residential appraisal report/i],weight:.94},
 {type:"Insurance Binder",patterns:[/insurance binder/i,/evidence of insurance/i],weight:.95}, {type:"Closing Disclosure",patterns:[/closing disclosure/i],weight:.98},
 {type:"Loan Estimate",patterns:[/loan estimate/i],weight:.98}, {type:"Asset Statement",patterns:[/asset statement/i,/investment statement/i],weight:.9},
 {type:"HOA Docs",patterns:[/homeowners? association/i,/\bHOA\b/i],weight:.9}, {type:"Letter of Explanation",patterns:[/letter of explanation/i,/\bLOE\b/i],weight:.93},
];
export function classifyDocument(upload:IntakeUpload):Classification {
 const corpus=`${upload.fileName.replace(/[_.-]+/g," ")} ${upload.nativeText?.slice(0,10000)??""}`;
 const matches=rules.map(r=>({r,count:r.patterns.filter(p=>p.test(corpus)).length})).filter(x=>x.count>0).sort((a,b)=>(b.r.weight+b.count*.02)-(a.r.weight+a.count*.02)||a.r.type.localeCompare(b.r.type));
 if(!matches.length)return Object.freeze({documentType:"Unknown",confidence:0,method:"deterministic_rules",evidence:Object.freeze([]),classifierVersion:"rules.v1"});
 const best=matches[0]; const evidence=best.r.patterns.filter(p=>p.test(corpus)).map(p=>p.source).sort();
 return Object.freeze({documentType:best.r.type,confidence:Math.min(1,Number((best.r.weight+(best.count-1)*.02).toFixed(4))),method:"deterministic_rules",evidence:Object.freeze(evidence),classifierVersion:"rules.v1"});
}
