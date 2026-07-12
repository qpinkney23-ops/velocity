import { createHash } from "node:crypto";
import { parseAuthorizationAuditEvent, type AuthorizationAuditEventV1 } from "../../contracts/authorizationAudit";
import { validateIsoTimestamp, validateSchemaVersion, validateTenantId, type IsoTimestamp, type SchemaVersion, type TenantId } from "../../contracts/primitives";

export const AUTHORIZATION_AUDIT_RECEIPT_V1 = "authorization-audit-receipt.v1" as SchemaVersion;
export const AUTHORIZATION_AUDIT_PERSISTENCE_PRODUCER = "authorization-audit-persistence.v1" as const;
export const AUTHORIZATION_AUDIT_PERSISTENCE_ERRORS = ["AUDIT_EVENT_INVALID", "AUDIT_TENANT_REQUIRED", "AUDIT_TENANT_MISMATCH", "AUDIT_EVENT_CONFLICT", "AUDIT_WRITE_FAILED", "AUDIT_DEPENDENCY_FAILURE", "INTERNAL_ERROR"] as const;
export type AuthorizationAuditPersistenceErrorCode = typeof AUTHORIZATION_AUDIT_PERSISTENCE_ERRORS[number];
export type AuthorizationAuditPersistenceContext = Readonly<{ scope: "tenant"; tenantId: unknown; persistedAt: unknown }> | Readonly<{ scope: "platform_security"; persistedAt: unknown }>;
export type AuthorizationAuditPersistenceReceiptV1 = Readonly<{ schemaVersion: typeof AUTHORIZATION_AUDIT_RECEIPT_V1; eventId: string; canonicalPath: string; tenantId?: TenantId; persistedAt: IsoTimestamp; integrityFingerprint: string; writeResult: "created" | "already_exists_identical"; producerVersion: typeof AUTHORIZATION_AUDIT_PERSISTENCE_PRODUCER }>;
export type AuthorizationAuditPersistenceResult = Readonly<{ ok: true; receipt: AuthorizationAuditPersistenceReceiptV1 }> | Readonly<{ ok: false; error: Readonly<{ code: AuthorizationAuditPersistenceErrorCode; message: string }> }>;
export type AuthorizationAuditStoredDocumentV1 = Readonly<{ event: AuthorizationAuditEventV1; integrityFingerprint: string; persistedAt: IsoTimestamp; persistenceProducer: typeof AUTHORIZATION_AUDIT_PERSISTENCE_PRODUCER }>;
export type AuthorizationAuditPersistenceRepository = Readonly<{ createOrRead(path: string, document: AuthorizationAuditStoredDocumentV1): Promise<Readonly<{ result: "created" } | { result: "existing"; document: unknown }>> }>;

const messages: Record<AuthorizationAuditPersistenceErrorCode, string> = { AUDIT_EVENT_INVALID: "Authorization audit event is invalid.", AUDIT_TENANT_REQUIRED: "Authorization audit tenant is required.", AUDIT_TENANT_MISMATCH: "Authorization audit tenant is invalid.", AUDIT_EVENT_CONFLICT: "Authorization audit event conflicts with an existing event.", AUDIT_WRITE_FAILED: "Authorization audit event could not be written.", AUDIT_DEPENDENCY_FAILURE: "Authorization audit persistence is unavailable.", INTERNAL_ERROR: "Authorization audit persistence failed." };
const failure = (code: AuthorizationAuditPersistenceErrorCode): AuthorizationAuditPersistenceResult => Object.freeze({ ok: false, error: Object.freeze({ code, message: messages[code] }) });

export function canonicalSerializeAuthorizationAuditEvent(event: AuthorizationAuditEventV1): string { return canonicalJson(event); }
export function fingerprintAuthorizationAuditEvent(event: AuthorizationAuditEventV1): string { return `sha256:${createHash("sha256").update(canonicalSerializeAuthorizationAuditEvent(event)).digest("hex")}`; }
function canonicalJson(value: unknown): string { if (value === null || typeof value !== "object") return JSON.stringify(value); if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`; const record = value as Record<string, unknown>; return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`; }
function deepFreeze<T>(value: T): T { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const nested of Object.values(value as any)) deepFreeze(nested); } return value; }

export async function persistAuthorizationAuditEventCore(eventInput: unknown, context: AuthorizationAuditPersistenceContext, repository: AuthorizationAuditPersistenceRepository): Promise<AuthorizationAuditPersistenceResult> {
  const parsed = parseAuthorizationAuditEvent(eventInput); if (!parsed.ok) return failure("AUDIT_EVENT_INVALID"); const event = parsed.value;
  const persistedAt = validateIsoTimestamp(context?.persistedAt); if (!persistedAt.ok) return failure("AUDIT_EVENT_INVALID");
  let canonicalPath: string; let tenantId: TenantId | undefined;
  if (context?.scope === "tenant") { const destination = validateTenantId(context.tenantId); if (!destination.ok) return failure("AUDIT_TENANT_REQUIRED"); if (!event.tenantId) return failure("AUDIT_TENANT_REQUIRED"); if (event.tenantId !== destination.value) return failure("AUDIT_TENANT_MISMATCH"); tenantId = destination.value; canonicalPath = `tenants/${tenantId}/authorizationAuditEvents/${event.eventId}`; }
  else if (context?.scope === "platform_security") { if (event.tenantId) return failure("AUDIT_TENANT_MISMATCH"); if (event.classification !== "security_event") return failure("AUDIT_TENANT_REQUIRED"); canonicalPath = `platformSecurity/authorizationAuditEvents/events/${event.eventId}`; }
  else return failure("AUDIT_TENANT_REQUIRED");
  const fingerprint = fingerprintAuthorizationAuditEvent(event); const stored = deepFreeze({ event, integrityFingerprint: fingerprint, persistedAt: persistedAt.value, persistenceProducer: AUTHORIZATION_AUDIT_PERSISTENCE_PRODUCER } as AuthorizationAuditStoredDocumentV1);
  let outcome: Awaited<ReturnType<AuthorizationAuditPersistenceRepository["createOrRead"]>>; try { outcome = await repository.createOrRead(canonicalPath, stored); } catch { return failure("AUDIT_DEPENDENCY_FAILURE"); }
  let writeResult: AuthorizationAuditPersistenceReceiptV1["writeResult"]; let receiptPersistedAt = persistedAt.value;
  if (outcome.result === "created") writeResult = "created";
  else { const existing = outcome.document as any; const existingTime = validateIsoTimestamp(existing?.persistedAt); if (!existing || existing.integrityFingerprint !== fingerprint || canonicalJson(existing.event) !== canonicalSerializeAuthorizationAuditEvent(event) || !existingTime.ok) return failure("AUDIT_EVENT_CONFLICT"); writeResult = "already_exists_identical"; receiptPersistedAt = existingTime.value; }
  return Object.freeze({ ok: true, receipt: deepFreeze({ schemaVersion: AUTHORIZATION_AUDIT_RECEIPT_V1, eventId: event.eventId, canonicalPath, ...(tenantId ? { tenantId } : {}), persistedAt: receiptPersistedAt, integrityFingerprint: fingerprint, writeResult, producerVersion: AUTHORIZATION_AUDIT_PERSISTENCE_PRODUCER }) });
}

export function parseAuthorizationAuditPersistenceReceipt(input: unknown): Readonly<{ ok: true; value: AuthorizationAuditPersistenceReceiptV1 }> | Readonly<{ ok: false; code: "invalid_audit_persistence_receipt" }> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return Object.freeze({ ok: false, code: "invalid_audit_persistence_receipt" }); const raw = input as any; const tenant = raw.tenantId === undefined ? undefined : validateTenantId(raw.tenantId), time = validateIsoTimestamp(raw.persistedAt);
  if (!validateSchemaVersion(raw.schemaVersion).ok || raw.schemaVersion !== AUTHORIZATION_AUDIT_RECEIPT_V1 || typeof raw.eventId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(raw.eventId) || typeof raw.canonicalPath !== "string" || (tenant && !tenant.ok) || !time.ok || !/^sha256:[a-f0-9]{64}$/.test(raw.integrityFingerprint || "") || !["created", "already_exists_identical"].includes(raw.writeResult) || raw.producerVersion !== AUTHORIZATION_AUDIT_PERSISTENCE_PRODUCER) return Object.freeze({ ok: false, code: "invalid_audit_persistence_receipt" }); return Object.freeze({ ok: true, value: deepFreeze({ ...raw, ...(tenant?.ok ? { tenantId: tenant.value } : {}), persistedAt: time.value }) });
}
