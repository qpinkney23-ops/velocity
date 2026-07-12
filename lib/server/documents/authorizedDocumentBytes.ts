import { createHash } from "node:crypto";
import type { ApplicationDocumentAuthorizationResult } from "../authorization/applicationDocumentAuthorizationOrchestratorCore";

export const AUTHORIZED_DOCUMENT_BYTES_V1 = "authorized-document-bytes.v1";
export const DOCUMENT_RETRIEVAL_POLICY_VERSION = "document-retrieval-policy.v1";
export const DOCUMENT_RETRIEVAL_POLICY = Object.freeze({
  policyVersion: DOCUMENT_RETRIEVAL_POLICY_VERSION,
  maximumByteSize: 20 * 1024 * 1024,
  allowedMimeTypes: Object.freeze(["application/pdf", "image/png", "image/jpeg"] as const),
  timeoutMs: 30_000,
  hashRequired: true,
  verifyMetadata: true,
  requireGenerationConsistency: true,
  allowZeroBytes: false,
  allowArchives: false,
  allowDecompression: false,
  allowRedirects: false,
  allowNetworkUrls: false,
} as const);

export type DocumentRetrievalErrorCode = "DOCUMENT_AUTHORIZATION_REQUIRED"|"DOCUMENT_AUTHORIZATION_MISMATCH"|"DOCUMENT_AUTHORIZATION_STALE"|"DOCUMENT_OBJECT_NOT_FOUND"|"DOCUMENT_OBJECT_CHANGED"|"DOCUMENT_TYPE_UNSUPPORTED"|"DOCUMENT_TOO_LARGE"|"DOCUMENT_EMPTY"|"DOCUMENT_METADATA_INVALID"|"DOCUMENT_READ_TIMEOUT"|"DOCUMENT_HASH_FAILED"|"DOCUMENT_READ_FAILED"|"DEPENDENCY_FAILURE"|"INTERNAL_ERROR";
export type StorageObjectMetadataV1 = Readonly<{exists:boolean;sizeBytes?:number;contentType?:string;generation?:string;metageneration?:string;encrypted?:boolean}>;
export type AuthorizedDocumentBytesV1 = Readonly<{schemaVersion:typeof AUTHORIZED_DOCUMENT_BYTES_V1;applicationId:string;documentId:string;tenantId:string;storageGeneration?:string;storageMetageneration?:string;documentAuthorizationVersion:string;contentType:string;sizeBytes:number;sha256:string;bytes:Uint8Array;retrievedAt:string;requestId:string;correlationId:string;retrievalPolicyVersion:typeof DOCUMENT_RETRIEVAL_POLICY_VERSION;warnings:readonly string[]}>;
export type RetrievalResult = Readonly<{ok:true;value:AuthorizedDocumentBytesV1}|{ok:false;code:DocumentRetrievalErrorCode}>;
export type RetrievalDependencies = Readonly<{getMetadata(canonicalPath:string,canonicalBucket?:string):Promise<StorageObjectMetadataV1>;readBytes(canonicalPath:string,options:Readonly<{bucket?:string;generation?:string;maximumBytes:number;signal:AbortSignal}>):Promise<Uint8Array>;now?:()=>Date}>;
export type RetrieveAuthorizedDocumentBytesInput = Readonly<{authorization:unknown;expectedApplicationId:unknown;expectedDocumentId:unknown;expectedDocumentAuthorizationVersion:unknown;policy:unknown;requestId:unknown;correlationId:unknown}>;
const fail=(code:DocumentRetrievalErrorCode):RetrievalResult=>Object.freeze({ok:false,code});
const id=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const sameMetadata=(a:StorageObjectMetadataV1,b:StorageObjectMetadataV1)=>a.exists===b.exists&&a.sizeBytes===b.sizeBytes&&a.contentType===b.contentType&&a.generation===b.generation&&a.metageneration===b.metageneration;

export async function retrieveAuthorizedDocumentBytesCore(input:RetrieveAuthorizedDocumentBytesInput,deps:RetrievalDependencies):Promise<RetrievalResult>{
  const auth=input.authorization as ApplicationDocumentAuthorizationResult;
  if(!auth||auth.ok!==true||auth.decision?.decision!=="allow"||!auth.auditPlan)return fail("DOCUMENT_AUTHORIZATION_REQUIRED");
  if(auth.decision.permission!=="document.read"||auth.decision.resourceType!=="application_document"||auth.auditPlan.documentPermission!=="document.read")return fail("DOCUMENT_AUTHORIZATION_MISMATCH");
  if(!id.test(String(input.expectedApplicationId||""))||!id.test(String(input.expectedDocumentId||""))||!id.test(String(input.requestId||""))||!id.test(String(input.correlationId||"")))return fail("DOCUMENT_AUTHORIZATION_MISMATCH");
  const f=auth.documentFacts;
  if(f.applicationId!==input.expectedApplicationId||f.documentId!==input.expectedDocumentId||auth.decision.resourceId!==f.documentId||auth.decision.tenantId!==f.tenantId||auth.context.tenantId!==f.tenantId)return fail("DOCUMENT_AUTHORIZATION_MISMATCH");
  if(input.expectedDocumentAuthorizationVersion!==f.documentAuthorizationVersion||auth.auditPlan.documentAuthorizationVersion!==f.documentAuthorizationVersion)return fail("DOCUMENT_AUTHORIZATION_STALE");
  if(input.policy!==DOCUMENT_RETRIEVAL_POLICY)return fail("DOCUMENT_METADATA_INVALID");
  let before:StorageObjectMetadataV1;
  try{before=await deps.getMetadata(f.storagePath,f.storageBucket)}catch{return fail("DEPENDENCY_FAILURE")}
  if(!before.exists)return fail("DOCUMENT_OBJECT_NOT_FOUND");
  if(!Number.isSafeInteger(before.sizeBytes)||before.sizeBytes!<0||typeof before.contentType!=="string")return fail("DOCUMENT_METADATA_INVALID");
  const metadataSize=before.sizeBytes as number;
  if(before.encrypted)return fail("DOCUMENT_TYPE_UNSUPPORTED");
  if(!DOCUMENT_RETRIEVAL_POLICY.allowedMimeTypes.includes(before.contentType as any))return fail("DOCUMENT_TYPE_UNSUPPORTED");
  if(metadataSize===0)return fail("DOCUMENT_EMPTY");
  if(metadataSize>DOCUMENT_RETRIEVAL_POLICY.maximumByteSize)return fail("DOCUMENT_TOO_LARGE");
  if(f.sizeBytes!==undefined&&f.sizeBytes!==metadataSize||f.mimeType!==undefined&&f.mimeType!==before.contentType)return fail("DOCUMENT_OBJECT_CHANGED");
  const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined,bytes:Uint8Array;
  const read=deps.readBytes(f.storagePath,{...(f.storageBucket?{bucket:f.storageBucket}:{}),...(before.generation?{generation:before.generation}:{}),maximumBytes:DOCUMENT_RETRIEVAL_POLICY.maximumByteSize,signal:controller.signal});
  const timeout=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error("DOCUMENT_READ_TIMEOUT"))},DOCUMENT_RETRIEVAL_POLICY.timeoutMs)});
  try{bytes=await Promise.race([read,timeout])}catch(e){return fail(controller.signal.aborted?"DOCUMENT_READ_TIMEOUT":"DOCUMENT_READ_FAILED")}finally{if(timer)clearTimeout(timer)}
  if(!(bytes instanceof Uint8Array))return fail("DOCUMENT_READ_FAILED");
  if(bytes.byteLength!==metadataSize)return fail("DOCUMENT_OBJECT_CHANGED");
  let after:StorageObjectMetadataV1;try{after=await deps.getMetadata(f.storagePath,f.storageBucket)}catch{return fail("DEPENDENCY_FAILURE")}
  if(!sameMetadata(before,after))return fail("DOCUMENT_OBJECT_CHANGED");
  let sha256:string;try{sha256=createHash("sha256").update(bytes).digest("hex")}catch{return fail("DOCUMENT_HASH_FAILED")}
  const value={schemaVersion:AUTHORIZED_DOCUMENT_BYTES_V1,applicationId:f.applicationId,documentId:f.documentId,tenantId:f.tenantId,...(before.generation?{storageGeneration:before.generation}:{}),...(before.metageneration?{storageMetageneration:before.metageneration}:{}),documentAuthorizationVersion:f.documentAuthorizationVersion,contentType:before.contentType,sizeBytes:bytes.byteLength,sha256,bytes:new Uint8Array(bytes),retrievedAt:(deps.now?.()||new Date()).toISOString(),requestId:String(input.requestId),correlationId:String(input.correlationId),retrievalPolicyVersion:DOCUMENT_RETRIEVAL_POLICY_VERSION,warnings:Object.freeze([])} as AuthorizedDocumentBytesV1;
  return Object.freeze({ok:true,value:Object.freeze(value)});
}
