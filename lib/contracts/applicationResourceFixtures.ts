const freeze = <T>(value: T): T => { if (value && typeof value === "object") { Object.freeze(value); Object.values(value as any).forEach(freeze); } return value; };
export const applicationResourceFixtures = freeze({
  tenantOwned: { applicationId: "application_alpha", ownershipState: "tenant_owned", tenantId: "tenant_alpha", authorizationVersion: "auth-v1", status: "In Review", createdBy: "creator_alpha", assignedUnderwriterId: "underwriter_alpha", assignedProcessorId: "processor_alpha", branchId: "branch_alpha", teamIds: ["team_beta", "team_alpha"], borrowerName: "Synthetic Borrower", email: "synthetic@example.invalid", loanAmount: 100000 },
  crossTenant: { applicationId: "application_beta", ownershipState: "tenant_owned", tenantId: "tenant_beta", authorizationVersion: "auth-v1", status: "New" },
  unresolved: { applicationId: "application_legacy", status: "New" },
  pending: { applicationId: "application_pending", ownershipState: "migration_pending", authorizationVersion: "auth-v1", status: "New" },
  rejected: { applicationId: "application_rejected", ownershipState: "migration_rejected", authorizationVersion: "auth-v1", status: "New" },
  duplicateTeams: { applicationId: "application_teams", ownershipState: "tenant_owned", tenantId: "tenant_alpha", authorizationVersion: "auth-v1", status: "New", teamIds: ["team_beta", "team_alpha", "team_beta"] },
  malformedTenant: { applicationId: "application_bad_tenant", ownershipState: "tenant_owned", tenantId: "borrower@example.com", authorizationVersion: "auth-v1", status: "New" },
  contradictory: { applicationId: "application_contradictory", ownershipState: "tenant_owned", authorizationVersion: "auth-v1", status: "New" },
  malformedVersion: { applicationId: "application_bad_version", ownershipState: "tenant_owned", tenantId: "tenant_alpha", updatedAt: "not-a-timestamp", status: "New" },
  unknownStatus: { applicationId: "application_unknown_status", ownershipState: "tenant_owned", tenantId: "tenant_alpha", authorizationVersion: "auth-v1" },
});
