import type { ResolvedApplicationResourceFactsV1 } from "./applicationResourceFacts";

export const APPLICATION_READ_RESPONSE_V1 = "application-read-response.v1" as const;
export type ApplicationReadResponseV1 = Readonly<{
  schemaVersion: typeof APPLICATION_READ_RESPONSE_V1; applicationId: string; status: string; ownershipState: "tenant_owned";
  assignedUnderwriterId?: string; assignedProcessorId?: string; branchId?: string; teamIds: readonly string[];
  createdAt?: string; updatedAt?: string; resourceAuthorizationVersion: string; compatibilityWarnings: readonly string[];
  requestId: string; correlationId: string;
}>;

export function projectApplicationReadResponse(facts: ResolvedApplicationResourceFactsV1, requestId: string, correlationId: string): ApplicationReadResponseV1 {
  if (facts.ownershipState !== "tenant_owned") throw new Error("application_read_projection_requires_tenant_owned_resource");
  return Object.freeze({ schemaVersion: APPLICATION_READ_RESPONSE_V1, applicationId: facts.applicationId, status: facts.applicationStatus, ownershipState: facts.ownershipState, ...(facts.assignedUnderwriterId ? { assignedUnderwriterId: facts.assignedUnderwriterId } : {}), ...(facts.assignedProcessorId ? { assignedProcessorId: facts.assignedProcessorId } : {}), ...(facts.branchId ? { branchId: facts.branchId } : {}), teamIds: Object.freeze([...facts.teamIds]), ...(facts.createdAt ? { createdAt: facts.createdAt } : {}), ...(facts.updatedAt ? { updatedAt: facts.updatedAt } : {}), resourceAuthorizationVersion: facts.resourceAuthorizationVersion, compatibilityWarnings: Object.freeze([...facts.warnings]), requestId, correlationId });
}
