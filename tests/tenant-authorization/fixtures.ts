export type SyntheticRole = "owner" | "processor" | "underwriter" | "viewer" | "service_account" | "unknown";
export type SyntheticMembershipStatus = "active" | "suspended" | "disabled";

export type SyntheticMembership = Readonly<{
  tenantId: string;
  userId: string;
  role: SyntheticRole;
  membershipStatus: SyntheticMembershipStatus;
}>;
export type SyntheticApplication = Readonly<{
  applicationId: string;
  tenantId?: string;
  createdBy?: string;
  borrowerLabel: string;
  ownershipState?: "tenant_owned" | "unresolved_legacy";
}>;
export type SyntheticFileMetadata = Readonly<{
  tenantId: string;
  applicationId: string;
  documentId: string;
  contentType: string;
}>;

const freeze = <T>(value: T): Readonly<T> => Object.freeze(value);
const member = (tenantId: string, userId: string, role: SyntheticRole, membershipStatus: SyntheticMembershipStatus = "active") =>
  freeze({ tenantId, userId, role, membershipStatus });

export const tenantAuthorizationFixtures = freeze({
  tenants: freeze({
    tenant_alpha: freeze({ tenantId: "tenant_alpha", displayName: "Synthetic Alpha", status: "active" }),
    tenant_beta: freeze({ tenantId: "tenant_beta", displayName: "Synthetic Beta", status: "active" }),
  }),
  users: freeze({
    owner_alpha: freeze({ userId: "owner_alpha", displayName: "Synthetic Owner Alpha" }),
    processor_alpha: freeze({ userId: "processor_alpha", displayName: "Synthetic Processor Alpha" }),
    underwriter_alpha: freeze({ userId: "underwriter_alpha", displayName: "Synthetic Underwriter Alpha" }),
    viewer_alpha: freeze({ userId: "viewer_alpha", displayName: "Synthetic Viewer Alpha" }),
    suspended_alpha: freeze({ userId: "suspended_alpha", displayName: "Synthetic Suspended Alpha" }),
    disabled_alpha: freeze({ userId: "disabled_alpha", displayName: "Synthetic Disabled Alpha" }),
    unknown_alpha: freeze({ userId: "unknown_alpha", displayName: "Synthetic Unknown Alpha" }),
    service_alpha: freeze({ userId: "service_alpha", displayName: "Synthetic Service Alpha" }),
    owner_beta: freeze({ userId: "owner_beta", displayName: "Synthetic Owner Beta" }),
    processor_beta: freeze({ userId: "processor_beta", displayName: "Synthetic Processor Beta" }),
    outsider_user: freeze({ userId: "outsider_user", displayName: "Synthetic Outsider" }),
  }),
  memberships: freeze({
    owner_alpha: member("tenant_alpha", "owner_alpha", "owner"),
    processor_alpha: member("tenant_alpha", "processor_alpha", "processor"),
    underwriter_alpha: member("tenant_alpha", "underwriter_alpha", "underwriter"),
    viewer_alpha: member("tenant_alpha", "viewer_alpha", "viewer"),
    suspended_alpha: member("tenant_alpha", "suspended_alpha", "processor", "suspended"),
    disabled_alpha: member("tenant_alpha", "disabled_alpha", "processor", "disabled"),
    unknown_alpha: member("tenant_alpha", "unknown_alpha", "unknown"),
    service_alpha: member("tenant_alpha", "service_alpha", "service_account"),
    owner_beta: member("tenant_beta", "owner_beta", "owner"),
    processor_beta: member("tenant_beta", "processor_beta", "processor"),
  }),
  applications: freeze({
    application_alpha: freeze({ applicationId: "application_alpha", tenantId: "tenant_alpha", createdBy: "owner_alpha", borrowerLabel: "Synthetic Borrower Alpha", ownershipState: "tenant_owned" }) as SyntheticApplication,
    application_beta: freeze({ applicationId: "application_beta", tenantId: "tenant_beta", createdBy: "owner_beta", borrowerLabel: "Synthetic Borrower Beta", ownershipState: "tenant_owned" }) as SyntheticApplication,
    unresolved_legacy: freeze({ applicationId: "application_legacy", borrowerLabel: "Synthetic Legacy Borrower", ownershipState: "unresolved_legacy" }) as SyntheticApplication,
  }),
  fileMetadata: freeze({
    alpha: freeze({ tenantId: "tenant_alpha", applicationId: "application_alpha", documentId: "document_alpha", contentType: "application/pdf" }) as SyntheticFileMetadata,
    beta: freeze({ tenantId: "tenant_beta", applicationId: "application_beta", documentId: "document_beta", contentType: "application/pdf" }) as SyntheticFileMetadata,
  }),
});

export type TenantAuthorizationFixtures = typeof tenantAuthorizationFixtures;

