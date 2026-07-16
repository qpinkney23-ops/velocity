import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { LEGACY_OWNERSHIP_POLICY_VERSION } from "../../contracts/legacyOwnership";
import {
  parsePlatformLegacyInventoryGrant,
  PLATFORM_LEGACY_INVENTORY_POLICY,
  PLATFORM_LEGACY_INVENTORY_RESOURCE_CLASSES,
  PLATFORM_LEGACY_INVENTORY_SCOPE,
  type PlatformLegacyInventoryError,
  type PlatformLegacyInventoryGrantV1,
  type PlatformLegacyInventoryRequestV1,
} from "../../contracts/platformLegacyInventory";

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const WINDOW = 300_000;
const deny = (code: PlatformLegacyInventoryError, ids: object, attribution?: object) =>
  Object.freeze({ ok: false as const, code, ...ids, ...(attribution ? { attribution: Object.freeze(attribution) } : {}) });

export function signPlatformLegacyInventoryRequest(input: { secret: string; method: string; path: string; timestamp: string; nonce: string; body: string }) {
  return createHmac("sha256", input.secret)
    .update([input.method, input.path, input.timestamp, input.nonce, createHash("sha256").update(input.body).digest("hex")].join("\n"))
    .digest("hex");
}

export function parsePlatformLegacyInventoryRequest(raw: any): PlatformLegacyInventoryRequestV1 | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || Object.keys(raw).some((key) => !["idempotencyKey", "runMode", "pageSize", "continuationCursor", "includeResourceClasses"].includes(key)) || !ID.test(raw.idempotencyKey || "") || raw.runMode !== "dry_run" || !Number.isInteger(raw.pageSize) || raw.pageSize < 1 || raw.pageSize > 50 || (raw.continuationCursor !== undefined && (typeof raw.continuationCursor !== "string" || raw.continuationCursor.length > 2048))) return;
  const classes = raw.includeResourceClasses ?? PLATFORM_LEGACY_INVENTORY_RESOURCE_CLASSES;
  if (!Array.isArray(classes) || !classes.length || classes.some((value: any) => !PLATFORM_LEGACY_INVENTORY_RESOURCE_CLASSES.includes(value)) || new Set(classes).size !== classes.length) return;
  return Object.freeze({ ...raw, includeResourceClasses: Object.freeze([...classes].sort()) });
}

export interface PlatformAuthDeps {
  environment: string;
  projectId: string;
  now(): Date;
  secretFor(id: string, version: string): string | undefined;
  getGrant(id: string): Promise<unknown>;
  reserveNonce(input: any): Promise<boolean>;
  ids(): { requestId: string; correlationId: string };
}

function grantDenialReason(raw: any, expected: { principalId: string; credentialVersion: string; environment: string; projectId: string; now: string }) {
  if (!raw) return "GRANT_MISSING";
  if (raw.status === "revoked" || raw.revokedAt) return "GRANT_REVOKED";
  if (raw.status !== "active") return "GRANT_INACTIVE";
  if (Date.parse(raw.expiresAt) <= Date.parse(expected.now)) return "GRANT_EXPIRED";
  if (raw.principalId !== expected.principalId) return "PRINCIPAL_GRANT_MISMATCH";
  if (raw.credentialVersion !== expected.credentialVersion) return "CREDENTIAL_VERSION_MISMATCH";
  if (raw.environment !== expected.environment) return "WRONG_ENVIRONMENT";
  if (!Array.isArray(raw.allowedProjectIds) || !raw.allowedProjectIds.includes(expected.projectId)) return "WRONG_PROJECT";
  if (raw.scope !== PLATFORM_LEGACY_INVENTORY_SCOPE) return "SCOPE_DENIED";
  return "POLICY_REJECTED";
}

export async function authorizePlatformLegacyInventory(request: Request, deps: PlatformAuthDeps) {
  const ids = deps.ids();
  if (request.method !== "POST" || new URL(request.url).search) return deny("SERVICE_AUTH_INVALID", ids);
  let body = "";
  let rawBody: any;
  try { body = await request.clone().text(); rawBody = JSON.parse(body); } catch { return deny("LEGACY_OWNERSHIP_MUTATION_NOT_AVAILABLE", ids); }
  const header = (name: string) => request.headers.get(name) || "";
  const principalId = header("x-velocity-service-id");
  const version = header("x-velocity-credential-version");
  const timestamp = header("x-velocity-timestamp");
  const nonce = header("x-velocity-nonce");
  const signature = header("x-velocity-signature");
  if (![principalId, version, timestamp, nonce, signature].every(Boolean)) return deny("SERVICE_AUTH_REQUIRED", ids);
  if (!ID.test(principalId) || !ID.test(version) || !ID.test(nonce) || !/^[a-f0-9]{64}$/.test(signature)) return deny("SERVICE_AUTH_INVALID", ids);
  const now = deps.now();
  const issued = Date.parse(timestamp);
  if (!Number.isFinite(issued) || Math.abs(now.getTime() - issued) > WINDOW) return deny("SERVICE_REQUEST_EXPIRED", ids);
  const secret = deps.secretFor(principalId, version);
  if (!secret || secret.length < 32) return deny("SERVICE_AUTH_INVALID", ids);
  const expectedSignature = signPlatformLegacyInventoryRequest({ secret, method: "POST", path: new URL(request.url).pathname, timestamp, nonce, body });
  const actual = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return deny("SERVICE_AUTH_INVALID", ids);
  const attribution = { principalId, credentialVersion: version, reasonCode: "POLICY_REJECTED" };
  const parsed = parsePlatformLegacyInventoryRequest(rawBody);
  if (!parsed) return deny("LEGACY_OWNERSHIP_MUTATION_NOT_AVAILABLE", ids, { ...attribution, reasonCode: "RESOURCE_CLASS_DENIED" });
  let rawGrant: any;
  try { rawGrant = await deps.getGrant(principalId); } catch { return deny("INTERNAL_ERROR", ids); }
  const expectedGrant = { principalId, credentialVersion: version, environment: deps.environment, projectId: deps.projectId, now: now.toISOString() };
  const grant = parsePlatformLegacyInventoryGrant(rawGrant, expectedGrant);
  if (!grant) return deny("PLATFORM_AUTHORITY_REQUIRED", ids, { ...attribution, reasonCode: grantDenialReason(rawGrant, expectedGrant) });
  if (grant.scope !== PLATFORM_LEGACY_INVENTORY_SCOPE) return deny("PLATFORM_SCOPE_DENIED", ids, { ...attribution, reasonCode: "SCOPE_DENIED" });
  if (grant.allowedResourceClasses && parsed.includeResourceClasses!.some((value) => !grant.allowedResourceClasses!.includes(value))) return deny("PLATFORM_SCOPE_DENIED", ids, { ...attribution, reasonCode: "RESOURCE_CLASS_DENIED" });
  const reserved = await deps.reserveNonce({ principalId, nonce, expiresAt: new Date(now.getTime() + WINDOW).toISOString(), requestId: ids.requestId }).catch(() => false);
  if (!reserved) return deny("SERVICE_REQUEST_REPLAYED", ids);
  const commandFingerprint = createHash("sha256").update(JSON.stringify([principalId, version, grant.grantVersion, PLATFORM_LEGACY_INVENTORY_SCOPE, parsed, PLATFORM_LEGACY_INVENTORY_POLICY, LEGACY_OWNERSHIP_POLICY_VERSION, deps.environment, deps.projectId])).digest("hex");
  return Object.freeze({ ok: true as const, authorization: Object.freeze({ principal: Object.freeze({ principalId, principalKind: "legacy_inventory_service" as const, credentialVersion: version, environment: deps.environment, projectId: deps.projectId, requestId: ids.requestId, correlationId: ids.correlationId }), grant, request: parsed, commandFingerprint }) });
}

export function encodeOperationalCursor(input: { innerCursor: string; principalId: string; environment: string; projectId: string; classes: readonly string[]; expiresAt: string; secret: string }) {
  const payload = Buffer.from(JSON.stringify({ v: 1, innerCursor: input.innerCursor, principalId: input.principalId, environment: input.environment, projectId: input.projectId, classes: [...input.classes].sort(), policy: PLATFORM_LEGACY_INVENTORY_POLICY, expiresAt: input.expiresAt })).toString("base64url");
  return `${payload}.${createHmac("sha256", input.secret).update(payload).digest("base64url")}`;
}

export function decodeOperationalCursor(value: string, input: { principalId: string; environment: string; projectId: string; classes: readonly string[]; secret: string; now: string }) {
  try {
    const [payload, signature, ...extra] = value.split(".");
    if (!payload || !signature || extra.length) throw 0;
    const expected = createHmac("sha256", input.secret).update(payload).digest();
    const actual = Buffer.from(signature, "base64url");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw 0;
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (decoded.v !== 1 || decoded.principalId !== input.principalId || decoded.environment !== input.environment || decoded.projectId !== input.projectId || decoded.policy !== PLATFORM_LEGACY_INVENTORY_POLICY || decoded.expiresAt <= input.now || JSON.stringify(decoded.classes) !== JSON.stringify([...input.classes].sort()) || typeof decoded.innerCursor !== "string") throw 0;
    return decoded.innerCursor as string;
  } catch { throw Error("INVENTORY_CURSOR_INVALID"); }
}
