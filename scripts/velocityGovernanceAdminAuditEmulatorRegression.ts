import assert from "node:assert/strict";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { initializeTestEnvironment, assertFails } from "@firebase/rules-unit-testing";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { createSafeUserProfile, listAvailableTenants, listTenantMembers, listUnderwriterDirectory, selectActiveTenant, readTenantAudit, exportTenantAudit } from "../lib/server/governance/governanceAdminAudit";

console.log("GOVERNANCE_ADMIN_AUDIT_EMULATOR_CHILD_STARTED");
const iso="2026-07-16T20:00:00.000Z";
const auth=(uid:string,requestId:string)=>({schemaVersion:"server-auth-context.v1",principal:{kind:"firebase_user",uid,authenticationMethod:"firebase_id_token",tokenIssuedAt:iso,authenticatedAt:iso,emailVerified:true},verifiedAt:iso,requestId,correlationId:`corr_${requestId}`} as any);

async function main(){
  const projectId=process.env.GCLOUD_PROJECT||"demo-velocity-governance-admin-audit";
  const [host,port]=process.env.FIRESTORE_EMULATOR_HOST!.split(":");
  const env=await initializeTestEnvironment({projectId,firestore:{host,port:+port}}),app=initializeApp({projectId}),db=getFirestore(app);
  const admin=auth("admin_user_001","request_admin_001"),ordinary=auth("ordinary_user_001","request_ordinary_001");
  try{
    for(const uid of["admin_user_001","ordinary_user_001","underwriter_user_001"])await db.doc(`userTenantMemberships/${uid}/tenants/tenant_alpha`).set({active:true});
    await db.doc("tenants/tenant_alpha").set({schemaVersion:"tenant.v1",tenantId:"tenant_alpha",displayName:"Alpha",status:"active",createdAt:iso,createdBy:"admin_user_001",updatedAt:iso,tenantVersion:"tenant_v1",compatibility:{migrationStatus:"not_required",warnings:[],legacyFieldNames:[],adapterVersion:"tenant-contract-adapter.v1"}});
    for(const [uid,role,status] of [["admin_user_001","owner","active"],["ordinary_user_001","processor","active"],["underwriter_user_001","underwriter","active"]])await db.doc(`tenants/tenant_alpha/members/${uid}`).set({schemaVersion:"tenant-membership.v1",tenantId:"tenant_alpha",userId:uid,role,membershipStatus:status,createdAt:iso,createdBy:"admin_user_001",updatedAt:iso,membershipVersion:`member_${uid}`,compatibility:{migrationStatus:"not_required",warnings:[],legacyFieldNames:[],adapterVersion:"tenant-contract-adapter.v1"}});
    assert((await createSafeUserProfile(admin,{displayName:"Admin"})).ok);assert(!(await db.doc("users/admin_user_001").get()).data()?.role);
    assert.equal((await listAvailableTenants(admin) as any).tenants.length,1);
    assert((await selectActiveTenant(admin,{tenantId:"tenant_alpha"})).ok);assert.equal((await db.doc("userActiveTenantSelections/admin_user_001").get()).data()?.tenantId,"tenant_alpha");
    assert.equal((await listTenantMembers(admin,"tenant_alpha") as any).members.length,3);assert(!(await listTenantMembers(ordinary,"tenant_alpha")).ok);
    const directory:any=await listUnderwriterDirectory(admin,"tenant_alpha");assert.deepEqual(directory.underwriters.map((x:any)=>x.userId),["underwriter_user_001"]);
    await db.doc("tenants/tenant_alpha/governanceAuditEvents/synthetic_event_001").set({action:"membership.list",outcome:"allowed",principalReference:"admin_user_001",policyVersion:"test",piiPresent:false,createdAt:iso});
    const audit:any=await readTenantAudit(admin,{tenantId:"tenant_alpha",pageSize:"10",eventType:"governanceAuditEvents"});assert(audit.ok&&audit.events.length>=1);
    const payload={tenantId:"tenant_alpha",idempotencyKey:"export_key_001",eventType:"governanceAuditEvents",limit:10};
    const exported:any=await exportTenantAudit({...admin,requestId:"request_export_001"},payload);assert(exported.ok&&exported.export.format==="csv"&&!/borrower|ssn|ocr/i.test(exported.export.content));
    assert((await exportTenantAudit({...admin,requestId:"request_export_002"},payload)).ok);
    const failed:any=await selectActiveTenant({...admin,requestId:"request_fail_001"},{tenantId:"tenant_alpha"},true);assert(!failed.ok&&failed.error.code==="AUDIT_REQUIRED");
    const client=env.authenticatedContext("admin_user_001");
    await assertFails(setDoc(doc(client.firestore(),"users/admin_user_001"),{role:"admin"}));await assertFails(setDoc(doc(client.firestore(),"underwriters/fake"),{active:true}));await assertFails(getDoc(doc(client.firestore(),"underwriters/fake")));await assertFails(getDoc(doc(client.firestore(),"applications/app_alpha")));
    console.log("GOVERNANCE_ADMIN_AUDIT_EMULATOR_CHILD_COMPLETED");console.log("Governance admin audit emulator regression passed");
  }finally{await env.cleanup();await deleteApp(app)}
}
main().catch(e=>{console.error(e);process.exitCode=1});
