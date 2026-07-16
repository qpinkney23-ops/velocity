import "server-only";
import { createHash } from "node:crypto";
import { LEGACY_OWNERSHIP_POLICY, type LegacyInventoryCandidateV1, type LegacyOwnershipState } from "../../contracts/legacyOwnership";

const id=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
export type ClassifiedLegacyResourceV1=Readonly<{resourceType:LegacyInventoryCandidateV1["resourceType"];resourceReference:string;state:LegacyOwnershipState;candidateTenantId?:string;evidenceIds:readonly string[];safeWarnings:readonly string[]}>;
const opaque=(kind:string,value:string)=>`${kind}_${createHash("sha256").update(value).digest("hex").slice(0,24)}`;
export function classifyLegacyCandidate(c:LegacyInventoryCandidateV1):ClassifiedLegacyResourceV1{
  const resourceReference=opaque("legacy",`${c.resourceType}:${c.resourceId}`),warnings:string[]=[];
  if(c.malformed||!id.test(c.resourceId)||c.tenantId!==undefined&&!id.test(c.tenantId))return Object.freeze({resourceType:c.resourceType,resourceReference,state:"ownership_unresolved",evidenceIds:[],safeWarnings:["malformed_authoritative_identity"]});
  const tenants=new Set<string>(); for(const v of [c.tenantId,c.parentTenantId,c.storageMetadataTenantId,...(c.lineageTenantIds||[]),...(c.evidence||[]).map(e=>e.candidateTenantId)])if(v&&id.test(v))tenants.add(v);
  const evidenceIds=Object.freeze((c.evidence||[]).map(e=>e.evidenceId).sort()); let state:LegacyOwnershipState="ownership_unresolved",candidateTenantId:string|undefined;
  if(c.orphaned)warnings.push("authoritative_parent_missing");
  if(tenants.size>1){state="ownership_disputed";warnings.push("mixed_tenant_lineage")}else if(c.orphaned)state="ownership_unresolved";else if(c.ownershipState==="tenant_owned"&&c.tenantId&&tenants.size===1&&(c.resourceType==="application"?!!c.authorizationVersion:c.parentTenantId===c.tenantId)){state="tenant_owned";candidateTenantId=c.tenantId}else if(tenants.size===1){state="ownership_evidence_available";candidateTenantId=[...tenants][0]}
  return Object.freeze({resourceType:c.resourceType,resourceReference,state,...(candidateTenantId?{candidateTenantId}:{}),evidenceIds,safeWarnings:Object.freeze(warnings)});
}
export function runLegacyOwnershipInventory(input:Readonly<{candidates:readonly LegacyInventoryCandidateV1[];requestId:string;correlationId:string;batchSeed:string;hasMore?:boolean}>){
  if(!id.test(input.requestId)||!id.test(input.correlationId)||!input.candidates.length||input.candidates.length>100)throw Error("INVALID_BOUNDED_INVENTORY");
  const classified=Object.freeze(input.candidates.map(classifyLegacyCandidate)),count=(s:LegacyOwnershipState)=>classified.filter(x=>x.state===s).length,malformed=classified.filter(x=>x.safeWarnings.includes("malformed_authoritative_identity")).length,orphaned=classified.filter(x=>x.safeWarnings.includes("authoritative_parent_missing")).length,fingerprint=createHash("sha256").update(JSON.stringify(classified)).digest("hex"),batchId=opaque("batch",`${input.batchSeed}:${fingerprint}`),planId=opaque("plan",`${LEGACY_OWNERSHIP_POLICY.schemaVersion}:${fingerprint}`),continuationCursor=input.hasMore?opaque("cursor",`${input.batchSeed}:${input.candidates.at(-1)!.resourceId}`):null;
  const receipt=Object.freeze({schemaVersion:"legacy-ownership-inventory-receipt.v1",totalScanned:classified.length,tenantOwnedCount:count("tenant_owned"),unresolvedCount:count("ownership_unresolved"),evidenceAvailableCount:count("ownership_evidence_available"),disputedCount:count("ownership_disputed"),malformedCount:malformed,orphanedCount:orphaned,batchId,planId,policyVersion:LEGACY_OWNERSHIP_POLICY.schemaVersion,requestId:input.requestId,correlationId:input.correlationId,continuationCursor,inventoryFingerprint:fingerprint,readOnly:true,piiPresent:false});
  return Object.freeze({receipt,classified});
}
export function planLegacyOwnershipAdjudication(input:Readonly<{classified:ClassifiedLegacyResourceV1;inventoryFingerprint:string}>){if(input.classified.state!=="ownership_evidence_available"||!input.classified.candidateTenantId)return Object.freeze({ok:false as const,code:"OWNERSHIP_NOT_PLANNABLE",mutationExecutable:false as const});return Object.freeze({ok:true as const,schemaVersion:"legacy-ownership-adjudication-plan.v1",resourceReference:input.classified.resourceReference,candidateTenantId:input.classified.candidateTenantId,evidenceIds:input.classified.evidenceIds,inventoryFingerprint:input.inventoryFingerprint,policyVersion:LEGACY_OWNERSHIP_POLICY.schemaVersion,status:"adjudication_pending" as const,mutationExecutable:false as const,blocker:"PLATFORM_IDENTITY_GOVERNANCE_REQUIRED" as const})}
