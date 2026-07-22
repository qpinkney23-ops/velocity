import {NextResponse} from "next/server";
import {requireAuthenticatedUserRequest} from "@/lib/server/auth/userApiAuth";
import {defineUserApiRoutePolicy} from "@/lib/server/auth/userApiAuthPolicy";
import {authorizeApplicationAction} from "@/lib/server/authorization/applicationAuthorizationOrchestrator";
import {persistAuthorizationAuditEvent} from "@/lib/server/authorization/authorizationAuditPersistence";
import {APPLICATION_ACTION_POLICIES} from "@/lib/server/authorization/applicationActionPolicies";
import {underwriterWorkspaceProjection} from "@/lib/server/applications/applicationReadProjection";

export const dynamic="force-dynamic";
const policy=defineUserApiRoutePolicy({routeId:"applications.underwriter-workspace",allowedPrincipalKind:"firebase_user",allowSessionCookie:true,allowFirebaseBearer:true,requireAuthorizationContext:false,allowedMethods:["GET"],bodySizeLimit:1024,csrfMode:"none",originPolicy:"same-origin",auditAction:"underwriter.workspace.read",productionEnabled:true,trustIncomingCorrelationId:false});
export async function GET(request:Request,{params}:{params:{id:string}}){
 const auth=await requireAuthenticatedUserRequest(request,policy);if(!auth.ok)return NextResponse.json({ok:false,error:auth.error},{status:auth.error.status});
 const requestedTenantId=request.headers.get("x-velocity-tenant-id")||undefined,authorization=await authorizeApplicationAction({authentication:auth.context,...(requestedTenantId?{requestedTenantId}:{}),applicationId:params.id,permission:"application.read",policy:APPLICATION_ACTION_POLICIES.read,evaluatedAt:new Date().toISOString()});
 if(!authorization.auditPlan?.tenantId||!(await persistAuthorizationAuditEvent(authorization.auditPlan,{scope:"tenant",tenantId:authorization.auditPlan.tenantId,persistedAt:new Date().toISOString()})).ok)return NextResponse.json({ok:false,error:{code:"AUDIT_REQUIRED",message:"Workspace is unavailable."}},{status:500});
 if(!authorization.ok)return NextResponse.json({ok:false,error:authorization.publicError},{status:authorization.publicError.status});
 const result=await underwriterWorkspaceProjection({auth:auth.context,applicationId:params.id,requestedTenantId});return NextResponse.json(result.ok?result:{ok:false,error:{code:result.code,message:"Workspace is unavailable."}},{status:result.status,headers:{"cache-control":"private, no-store"}});
}
