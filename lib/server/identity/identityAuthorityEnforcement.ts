import "server-only";
import {createHash,randomUUID} from "node:crypto";
import {getFirestore} from "firebase-admin/firestore";
import {defaultAdminApp} from "../auth/firebaseAdminAuthAdapter";
import {DEFAULT_APPROVAL_POLICY,evaluateApprovalAuthority} from "../../governance/enterpriseGovernance";
import type {ServerAuthContextV1} from "../../contracts/serverAuth";

export const AUTHORITY_REFRESH_MESSAGE="Your access changed. Refresh the workspace before retrying.";
export type AuthorityExpectation=Readonly<{expectedMembershipVersion:number;expectedAuthorizationVersion:string;expectedApprovalAuthorityVersion?:string}>;
export type AuthoritySnapshot=Readonly<{membershipVersion:number;authorizationVersion:string;role:string;membershipStatus:string;approvalAuthorityVersions:Readonly<{approve:string;deny:string}>}>;
type RejectionCode="MEMBERSHIP_STALE"|"AUTHORIZATION_STALE"|"MEMBERSHIP_INACTIVE"|"ROLE_CHANGED"|"APPROVAL_AUTHORITY_STALE"|"SESSION_AUTHORITY_STALE";
const db=()=>getFirestore(defaultAdminApp());
const safeVersion=(data:any)=>String(data?.authorizationVersion||data?.updatedAt?.toDate?.().toISOString?.()||data?.updatedAt||"legacy");
export const approvalAuthorityVersion=(role:string,action:"approve"|"deny")=>{const decision=evaluateApprovalAuthority({role,action,policy:DEFAULT_APPROVAL_POLICY});return `approval-${createHash("sha256").update(JSON.stringify([DEFAULT_APPROVAL_POLICY.policyId,DEFAULT_APPROVAL_POLICY.version,role,action,decision.allowed,decision.reason])).digest("hex").slice(0,24)}`};
export function evaluateAuthority(input:{current:AuthoritySnapshot;invalidation?:{membershipVersion:number;authorizationVersion:string}|null;expected:AuthorityExpectation;action?:"approve"|"deny"}){
 const {current,expected}=input;
 if(current.membershipStatus!=="active")return {ok:false as const,code:"MEMBERSHIP_INACTIVE" as RejectionCode};
 if(current.membershipVersion!==expected.expectedMembershipVersion)return {ok:false as const,code:"MEMBERSHIP_STALE" as RejectionCode};
 if(current.authorizationVersion!==expected.expectedAuthorizationVersion)return {ok:false as const,code:"AUTHORIZATION_STALE" as RejectionCode};
 if(input.invalidation&&(input.invalidation.membershipVersion!==expected.expectedMembershipVersion||input.invalidation.authorizationVersion!==expected.expectedAuthorizationVersion))return {ok:false as const,code:"SESSION_AUTHORITY_STALE" as RejectionCode};
 if(input.action&&expected.expectedApprovalAuthorityVersion!==current.approvalAuthorityVersions[input.action])return {ok:false as const,code:"APPROVAL_AUTHORITY_STALE" as RejectionCode};
 return {ok:true as const,snapshot:current};
}
export async function readAuthoritySnapshot(tenantId:string,userId:string):Promise<AuthoritySnapshot|undefined>{const member=await db().doc(`tenants/${tenantId}/members/${userId}`).get();if(!member.exists)return;const data=member.data()!;const role=String(data.role||"unknown");return Object.freeze({membershipVersion:Number(data.membershipVersion||0),authorizationVersion:safeVersion(data),role,membershipStatus:String(data.membershipStatus||"unknown"),approvalAuthorityVersions:Object.freeze({approve:approvalAuthorityVersion(role,"approve"),deny:approvalAuthorityVersion(role,"deny")})})}
export async function enforceAuthorityInTransaction(tx:any,input:{tenantId:string;userId:string;expected:AuthorityExpectation;action?:"approve"|"deny"}){const [member,invalidation]=await Promise.all([tx.get(db().doc(`tenants/${input.tenantId}/members/${input.userId}`)),tx.get(db().doc(`tenants/${input.tenantId}/sessionInvalidations/${input.userId}`))]);if(!member.exists)return {ok:false as const,code:"MEMBERSHIP_INACTIVE" as RejectionCode};const data=member.data(),role=String(data.role||"unknown"),current:AuthoritySnapshot={membershipVersion:Number(data.membershipVersion||0),authorizationVersion:safeVersion(data),role,membershipStatus:String(data.membershipStatus||"unknown"),approvalAuthorityVersions:{approve:approvalAuthorityVersion(role,"approve"),deny:approvalAuthorityVersion(role,"deny")}};const marker=invalidation.exists?{membershipVersion:Number(invalidation.data()?.membershipVersion||0),authorizationVersion:String(invalidation.data()?.authorizationVersion||"")}:null;return evaluateAuthority({current,invalidation:marker,expected:input.expected,...(input.action?{action:input.action}:{})})}
export async function auditAuthorityRejection(input:{auth:ServerAuthContextV1;tenantId:string;commandType:string;code:string;applicationId?:string}){const userId=input.auth.principal.kind==="firebase_user"?input.auth.principal.uid:"invalid";await db().doc(`tenants/${input.tenantId}/authorityDenialAuditEvents/authority_${randomUUID().replace(/-/g,"")}`).create({schemaVersion:"identity-authority-denial-audit.v1",classification:"authority_stale_or_inactive",reasonCode:input.code,commandType:input.commandType,principalReference:userId,...(input.applicationId?{applicationId:input.applicationId}:{}),requestId:input.auth.requestId,correlationId:input.auth.correlationId,piiPresent:false,createdAt:new Date().toISOString()})}
