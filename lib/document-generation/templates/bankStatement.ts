import { SCHEMA_VERSION, TemplateProfile } from "../contracts";

export const BANK_STATEMENT_TEMPLATE: TemplateProfile = Object.freeze({
  id: "bank-statement-v1",
  schemaVersion: SCHEMA_VERSION,
  version: "1.0.0",
  documentFamily: "BANK_STATEMENT",
  pageCount: 2,
});

