import { InstitutionProfile, SCHEMA_VERSION } from "../contracts";

export const LAKEVIEW_COMMUNITY_BANK: InstitutionProfile = Object.freeze({
  id: "lakeview-community-bank-v1",
  schemaVersion: SCHEMA_VERSION,
  version: "1.0.0",
  legalName: "Lakeview Community Bank",
  shortName: "LAKEVIEW",
  customerService: "1-800-555-0148",
  website: "lakeviewcommunity.example",
  address: "100 Harbor Square, Northfield, IL 60093",
  syntheticNotice: "SYNTHETIC DOCUMENT - FOR VELOCITY VALIDATION ONLY - NOT AN ACTUAL BANK RECORD",
  supportedLayouts: ["lakeview-traditional-v1", "lakeview-modern-v1"] as const,
});
