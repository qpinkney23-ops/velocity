import {AUTHORIZATION_PERMISSIONS,type AuthorizationPermission} from "../contracts/authorization";
import type {TenantRole} from "../contracts/tenantSystem";

export const GOVERNANCE_SCHEMA_VERSION="enterprise-governance.v1" as const;
export const GOVERNANCE_POLICY_VERSION="enterprise-governance-policy.v1" as const;
export const FEATURE_FLAG_VERSION="enterprise-feature-flags.v1" as const;
export const TEAM_VERSION="enterprise-team.v1" as const;

const labels:Partial<Record<AuthorizationPermission,string>>={"application.read":"View applications","document.read":"View documents","evidence.read":"View evidence","evidence.review":"Review evidence","application.analyze":"Run analysis","assignment.manage":"Assign files","queue.manage":"Manage workflow","condition.manage":"Resolve conditions","decision.approve":"Approve loans","decision.deny":"Deny loans","audit.read":"View audit","configuration.manage":"Manage governance","membership.manage":"Manage users","tenant.manage":"Manage organization"};
const category=(permission:string)=>permission.split(".")[0];
export const PERMISSION_REGISTRY=Object.freeze(AUTHORIZATION_PERMISSIONS.map(permission=>Object.freeze({permission,label:labels[permission]||permission.replace("."," ").replace(/\b\w/g,c=>c.toUpperCase()),category:category(permission),version:GOVERNANCE_SCHEMA_VERSION})));

const role=(id:TenantRole,label:string,permissions:readonly AuthorizationPermission[],approval:"none"|"recommend"|"final")=>Object.freeze({id,label,permissions:Object.freeze([...permissions]),capabilities:Object.freeze([...new Set(permissions.map(category))].sort()),approvalAuthority:approval,version:GOVERNANCE_SCHEMA_VERSION});
export const GOVERNANCE_ROLE_REGISTRY=Object.freeze({
 owner:role("owner","Organization Admin",["evidence.read","evidence.review","evidence.verify","evidence.dispute","evidence.revoke","application.read","application.create","application.update","application.analyze","application.delete","document.read","document.upload","document.delete","condition.read","condition.manage","condition.clear","assignment.read","assignment.manage","decision.read","report.generate","report.read","export.generate","queue.read","queue.manage","tenant.read","tenant.manage","membership.read","membership.invite","membership.manage","configuration.read","configuration.manage","billing.read","billing.manage","audit.read","audit.export"],"none"),
 admin:role("admin","Operations Manager",["application.read","application.create","application.update","application.analyze","document.read","document.upload","document.delete","condition.read","condition.manage","condition.clear","assignment.read","assignment.manage","decision.read","report.generate","report.read","export.generate","queue.read","queue.manage","tenant.read","membership.read","membership.invite","membership.manage","configuration.read","configuration.manage","audit.read"],"none"),
 underwriter:role("underwriter","Underwriter",["evidence.read","evidence.review","evidence.verify","evidence.dispute","evidence.revoke","application.read","application.analyze","document.read","condition.read","condition.manage","condition.clear","assignment.read","decision.read","decision.recommend","decision.approve","decision.deny","report.generate","report.read","queue.read"],"final"),
 processor:role("processor","Processor",["evidence.read","evidence.review","evidence.dispute","application.read","application.create","application.update","application.analyze","document.read","document.upload","document.delete","condition.read","condition.manage","condition.clear","assignment.read","decision.read","report.generate","report.read","queue.read"],"none"),
 loan_officer:role("loan_officer","Loan Officer",["application.read","application.create","application.update","document.read","document.upload","condition.read","assignment.read","decision.read","report.read","queue.read"],"none"),
 viewer:role("viewer","Read Only",["application.read","document.read","condition.read","assignment.read","decision.read","report.read","queue.read","tenant.read","membership.read","configuration.read","audit.read"],"none"),
 service_account:role("service_account","Service Account",[],"none"),unknown:role("unknown","Unknown",[],"none"),
} satisfies Record<TenantRole,ReturnType<typeof role>>);

export const permissionsForGovernanceRole=(roleId:TenantRole):readonly AuthorizationPermission[]=>
 Object.freeze([...(GOVERNANCE_ROLE_REGISTRY[roleId]?.permissions||[])]);
export const resolveGovernanceRole=(roleId:unknown)=>typeof roleId==="string"&&roleId in GOVERNANCE_ROLE_REGISTRY?Object.freeze({ok:true as const,role:GOVERNANCE_ROLE_REGISTRY[roleId as TenantRole]}):Object.freeze({ok:false as const,reason:"role_unknown"});

export type ApprovalPolicy=Readonly<{schemaVersion:typeof GOVERNANCE_POLICY_VERSION;policyId:string;version:number;approvePermission:"decision.approve";denyPermission:"decision.deny";requireEscalationAbove?:number;active:boolean}>;
export const DEFAULT_APPROVAL_POLICY:ApprovalPolicy=Object.freeze({schemaVersion:GOVERNANCE_POLICY_VERSION,policyId:"default-approval-authority",version:1,approvePermission:"decision.approve",denyPermission:"decision.deny",active:true});
export function evaluateApprovalAuthority(input:{role:unknown;action:"approve"|"deny";loanAmount?:number;policy?:ApprovalPolicy}){
 const resolved=resolveGovernanceRole(input.role),policy=input.policy;if(!resolved.ok||!policy||policy.schemaVersion!==GOVERNANCE_POLICY_VERSION||!policy.active)return Object.freeze({allowed:false as const,reason:"policy_unavailable",requiredPermission:input.action==="approve"?"decision.approve":"decision.deny"});
 const required=input.action==="approve"?policy.approvePermission:policy.denyPermission,has=resolved.role.permissions.includes(required),escalate=typeof policy.requireEscalationAbove==="number"&&typeof input.loanAmount==="number"&&input.loanAmount>policy.requireEscalationAbove&&resolved.role.id!=="owner";
 return Object.freeze({allowed:has&&!escalate,reason:!has?"permission_missing":escalate?"escalation_required":"authorized",requiredPermission:required,effectiveRole:resolved.role.id,requiresEscalation:escalate});
}

export const ENTERPRISE_FEATURES=Object.freeze(["underwriter_workspace","change_intelligence","mortgage_review","team_queues","governance_admin","audit_export"] as const);
export type EnterpriseFeature=typeof ENTERPRISE_FEATURES[number];
export function evaluateFeature(input:{feature:unknown;tenantFlags?:Record<string,boolean>;organizationFlags?:Record<string,boolean>;defaults?:Record<string,boolean>}){
 if(!ENTERPRISE_FEATURES.includes(input.feature as EnterpriseFeature))return Object.freeze({enabled:false as const,source:"invalid",reason:"feature_unknown"});
 const feature=input.feature as EnterpriseFeature;if(typeof input.tenantFlags?.[feature]==="boolean")return Object.freeze({enabled:input.tenantFlags[feature],source:"tenant",reason:"configured"});if(typeof input.organizationFlags?.[feature]==="boolean")return Object.freeze({enabled:input.organizationFlags[feature],source:"organization",reason:"configured"});return Object.freeze({enabled:input.defaults?.[feature]!==false,source:"default",reason:"safe_compatibility_default"});
}

export type GovernanceTeam=Readonly<{schemaVersion:typeof TEAM_VERSION;teamId:string;name:string;status:"active"|"archived";managerIds:readonly string[];memberIds:readonly string[];underwriterIds:readonly string[];processorIds:readonly string[];version:number}>;
export function routeTeam(input:{teams:readonly GovernanceTeam[];members:readonly {userId:string;role:string;membershipStatus:string;teamIds?:readonly string[]}[];preferredTeamId?:string}){
 const eligible=input.teams.filter(t=>t.status==="active"&&(!input.preferredTeamId||t.teamId===input.preferredTeamId)).map(team=>({team,underwriters:team.underwriterIds.filter(id=>input.members.some(m=>m.userId===id&&m.membershipStatus==="active"&&m.role==="underwriter"))})).filter(x=>x.underwriters.length).sort((a,b)=>a.underwriters.length-b.underwriters.length||a.team.teamId.localeCompare(b.team.teamId));
 return eligible[0]?Object.freeze({ok:true as const,teamId:eligible[0].team.teamId,eligibleUnderwriterIds:Object.freeze([...eligible[0].underwriters].sort())}):Object.freeze({ok:false as const,reason:"no_eligible_team"});
}
