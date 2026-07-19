import { LayoutVariant, SCHEMA_VERSION } from "../contracts";

export const BANK_STATEMENT_LAYOUTS: Readonly<Record<LayoutVariant["id"], LayoutVariant>> = Object.freeze({
  "lakeview-traditional-v1": Object.freeze({
    id: "lakeview-traditional-v1",
    schemaVersion: SCHEMA_VERSION,
    version: "1.0.0",
    name: "Lakeview Traditional Regional Statement",
    structure: "TRADITIONAL_REGIONAL",
  }),
  "lakeview-modern-v1": Object.freeze({
    id: "lakeview-modern-v1",
    schemaVersion: SCHEMA_VERSION,
    version: "1.0.0",
    name: "Lakeview Modern Digital Statement",
    structure: "MODERN_DIGITAL",
  }),
});

