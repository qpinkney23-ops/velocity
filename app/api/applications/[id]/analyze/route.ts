import {NextResponse} from "next/server";
import {defineUserApiRoutePolicy} from "@/lib/server/auth/userApiAuthPolicy";
import {requireAuthenticatedUserRequest} from "@/lib/server/auth/userApiAuth";
import {authorizeApplicationAction} from "@/lib/server/authorization/applicationAuthorizationOrchestrator";
import {authorizeApplicationDocumentAction} from "@/lib/server/authorization/applicationDocumentAuthorizationOrchestrator";
import {persistAuthorizationAuditEvent} from "@/lib/server/authorization/authorizationAuditPersistence";
import {retrieveAuthorizedDocumentBytes} from "@/lib/server/documents/authorizedDocumentBytesFirebase";
import {executeApplicationAnalyzeRoute} from "@/lib/server/applications/applicationAnalyzeRouteCore";
import {analyzeCanonicalEvidence,beginCanonicalAnalysis,completeCanonicalAnalysis,listCanonicalApplicationDocuments,processCanonicalAuthorizedBytes} from "@/lib/server/applications/applicationAnalyzeAdapters";
export const dynamic="force-dynamic";
const APPLICATION_ANALYZE_ROUTE_POLICY=defineUserApiRoutePolicy({routeId:"applications.analyze",allowedPrincipalKind:"firebase_user",allowSessionCookie:true,allowFirebaseBearer:true,requireAuthorizationContext:false,allowedMethods:Object.freeze(["POST"]),bodySizeLimit:4096,csrfMode:"none",originPolicy:"same-origin",auditAction:"application.analyze",productionEnabled:true,trustIncomingCorrelationId:false});
export async function POST(request:Request,context:{params:{id:string}}){let body:unknown;try{body=await request.json()}catch{body=null}const result=await executeApplicationAnalyzeRoute(request,context.params.id,body,{authenticate:value=>requireAuthenticatedUserRequest(value,APPLICATION_ANALYZE_ROUTE_POLICY),authorizeApplication:authorizeApplicationAction,persistAuthorizationAudit:persistAuthorizationAuditEvent,listDocuments:listCanonicalApplicationDocuments,authorizeDocument:authorizeApplicationDocumentAction,retrieveBytes:retrieveAuthorizedDocumentBytes,processBytes:processCanonicalAuthorizedBytes,analyzeEvidence:analyzeCanonicalEvidence,begin:beginCanonicalAnalysis,complete:completeCanonicalAnalysis,now:()=>new Date()});const status=result.ok?200:result.status||500;return NextResponse.json(result,{status,headers:{"cache-control":"no-store",...(result.requestId?{"x-request-id":result.requestId}:{}),...(result.correlationId?{"x-correlation-id":result.correlationId}:{})}})}
