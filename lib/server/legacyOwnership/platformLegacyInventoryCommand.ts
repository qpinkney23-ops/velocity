import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { getFirestore } from "firebase-admin/firestore";
import { defaultAdminApp } from "../auth/firebaseAdminAuthAdapter";
import { inventoryLegacyOwnership } from "./legacyOwnershipInventory";
import { authorizePlatformLegacyInventory, decodeOperationalCursor, encodeOperationalCursor, type PlatformAuthDeps } from "./platformLegacyInventoryCore";
import { PLATFORM_LEGACY_INVENTORY_POLICY, PLATFORM_LEGACY_INVENTORY_SCOPE } from "../../contracts/platformLegacyInventory";

const db = () => getFirestore(defaultAdminApp());
const safe = (code: string, status: number, ids: { requestId: string; correlationId: string }) => Object.freeze({ ok: false as const, status, error: { code, message: "Legacy ownership inventory is unavailable." }, ...ids });
const opaque = (prefix: string, value: string) => `${prefix}_${createHash("sha256").update(value).digest("hex").slice(0, 24)}`;

function environmentAllowed(environment: string, projectId: string) {
  if (projectId.startsWith("demo-")) return true;
  const environments = (process.env.LEGACY_OWNERSHIP_INVENTORY_ALLOWED_ENVIRONMENTS || "").split(",").filter(Boolean);
  const projects = (process.env.LEGACY_OWNERSHIP_INVENTORY_ALLOWED_PROJECTS || "").split(",").filter(Boolean);
  return process.env.LEGACY_OWNERSHIP_INVENTORY_OPERATIONAL_ENABLED === "true" && environments.includes(environment) && projects.includes(projectId);
}

export function productionPlatformInventoryAuthDeps(): PlatformAuthDeps {
  const environment = process.env.NODE_ENV || "production";
  const projectId = process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID || "";
  return {
    environment, projectId, now: () => new Date(),
    secretFor: (id, version) => id === process.env.LEGACY_INVENTORY_SERVICE_ID && version === process.env.LEGACY_INVENTORY_CREDENTIAL_VERSION ? process.env.LEGACY_INVENTORY_CREDENTIAL : undefined,
    getGrant: async (id) => (await db().doc(`platformServiceGrants/${id}`).get()).data(),
    reserveNonce: async (input) => db().runTransaction(async (transaction) => {
      const ref = db().doc(`platformServiceRequestNonces/${input.principalId}:${input.nonce}`);
      if ((await transaction.get(ref)).exists) return false;
      transaction.create(ref, { schemaVersion: "platform-service-nonce.v1", principalReference: opaque("principal", input.principalId), requestId: input.requestId, expiresAt: input.expiresAt, createdAt: new Date().toISOString(), piiPresent: false });
      return true;
    }),
    ids: () => ({ requestId: `platform_req_${randomUUID().replace(/-/g, "")}`, correlationId: `platform_corr_${randomUUID().replace(/-/g, "")}` }),
  };
}

type ExecuteOptions = { authDeps?: PlatformAuthDeps; failStartAudit?: boolean; failCompletionAudit?: boolean; failDenialAudit?: boolean; dependencyCallCounters?: Record<string, number> };

async function persistDenialAudit(input: { requestId: string; correlationId: string; principalId: string; credentialVersion: string; reasonCode: string }, fail = false) {
  if (fail) throw Error("audit");
  await db().doc(`legacyOwnershipInventoryAuditEvents/${input.requestId}:denied`).create({
    schemaVersion: "legacy-ownership-inventory-audit.v1", action: "dry_run_denied", outcome: "denied",
    principalReference: opaque("principal", input.principalId), credentialVersion: input.credentialVersion,
    scope: PLATFORM_LEGACY_INVENTORY_SCOPE, reasonCode: input.reasonCode, requestId: input.requestId,
    correlationId: input.correlationId, policyVersion: PLATFORM_LEGACY_INVENTORY_POLICY,
    mutationPerformed: false, piiPresent: false, createdAt: new Date().toISOString(),
  });
}

export async function executePlatformLegacyInventory(request: Request, options: ExecuteOptions = {}) {
  const auth = await authorizePlatformLegacyInventory(request, options.authDeps || productionPlatformInventoryAuthDeps());
  if (!auth.ok) {
    const denied = auth as typeof auth & { attribution?: { principalId: string; credentialVersion: string; reasonCode: string }; requestId: string; correlationId: string };
    if (denied.attribution) {
      try { await persistDenialAudit({ requestId: denied.requestId, correlationId: denied.correlationId, ...denied.attribution }, options.failDenialAudit); }
      catch { return safe("AUDIT_REQUIRED", 500, { requestId: denied.requestId, correlationId: denied.correlationId }); }
    }
    return safe(auth.code, auth.code === "SERVICE_AUTH_REQUIRED" ? 401 : 403, { requestId: (auth as any).requestId, correlationId: (auth as any).correlationId });
  }
  const authorization = auth.authorization;
  const ids = { requestId: authorization.principal.requestId, correlationId: authorization.principal.correlationId };
  const denial = async (code: string, status: number, reasonCode: string) => {
    try { await persistDenialAudit({ ...ids, principalId: authorization.principal.principalId, credentialVersion: authorization.principal.credentialVersion, reasonCode }, options.failDenialAudit); }
    catch { return safe("AUDIT_REQUIRED", 500, ids); }
    return safe(code, status, ids);
  };
  if (!environmentAllowed(authorization.principal.environment, authorization.principal.projectId)) return denial("PLATFORM_AUTHORITY_REQUIRED", 403, "ENVIRONMENT_POLICY_DENIED");
  const cursorSecret = process.env.LEGACY_OWNERSHIP_OPERATIONAL_CURSOR_SECRET || (authorization.principal.projectId.startsWith("demo-") ? "demo-operational-cursor-secret-00000001" : "");
  if (cursorSecret.length < 32) return safe("INTERNAL_ERROR", 500, ids);
  let innerCursor: string | undefined;
  try {
    if (authorization.request.continuationCursor) innerCursor = decodeOperationalCursor(authorization.request.continuationCursor, { principalId: authorization.principal.principalId, environment: authorization.principal.environment, projectId: authorization.principal.projectId, classes: authorization.request.includeResourceClasses!, secret: cursorSecret, now: new Date().toISOString() });
  } catch { return denial("INVENTORY_CURSOR_INVALID", 400, "CURSOR_POLICY_DENIED"); }
  const commandId = opaque("legacy_inventory_command", `${authorization.principal.principalId}:${authorization.request.idempotencyKey}`);
  const commandRef = db().doc(`legacyOwnershipInventoryCommands/${commandId}`);
  const principalReference = opaque("principal", authorization.principal.principalId);
  const startedAt = new Date().toISOString();
  let reservation: { status: "conflict" | "running" | "started" | "completed"; receipt?: any };
  try {
    reservation = await db().runTransaction(async (transaction) => {
      const snapshot = await transaction.get(commandRef);
      if (snapshot.exists) {
        const data = snapshot.data()!;
        if (data.commandFingerprint !== authorization.commandFingerprint) return { status: "conflict" as const };
        if (data.status === "completed") return { status: "completed" as const, receipt: data.receipt };
        return { status: "running" as const };
      }
      if (options.failStartAudit) throw Error("audit");
      transaction.create(db().doc(`legacyOwnershipInventoryAuditEvents/${commandId}:start`), { schemaVersion: "legacy-ownership-inventory-audit.v1", action: "dry_run_start", outcome: "reserved", principalReference, credentialVersion: authorization.principal.credentialVersion, scope: PLATFORM_LEGACY_INVENTORY_SCOPE, commandId, requestId: ids.requestId, correlationId: ids.correlationId, policyVersion: PLATFORM_LEGACY_INVENTORY_POLICY, piiPresent: false, createdAt: startedAt });
      transaction.create(commandRef, { schemaVersion: "legacy-ownership-inventory-command.v1", commandId, commandFingerprint: authorization.commandFingerprint, principalReference, credentialVersion: authorization.principal.credentialVersion, grantVersion: authorization.grant.grantVersion, scope: PLATFORM_LEGACY_INVENTORY_SCOPE, runMode: "dry_run", pageSize: authorization.request.pageSize, includeResourceClasses: authorization.request.includeResourceClasses, status: "running", startedAt, requestId: ids.requestId, correlationId: ids.correlationId, mutationPerformed: false, piiPresent: false });
      return { status: "started" as const };
    });
  } catch { return safe("AUDIT_REQUIRED", 500, ids); }
  if (reservation.status === "conflict") return denial("INVENTORY_COMMAND_CONFLICT", 409, "IDEMPOTENCY_CONFLICT");
  if (reservation.status === "running") return safe("INVENTORY_ALREADY_RUNNING", 409, ids);
  if (reservation.status === "completed") return Object.freeze({ ok: true as const, status: 200, receipt: reservation.receipt, ...ids });
  let inventory;
  try {
    inventory = await inventoryLegacyOwnership({ requestId: ids.requestId, correlationId: ids.correlationId, pageSize: authorization.request.pageSize, includeResourceClasses: authorization.request.includeResourceClasses, dependencyCallCounters: options.dependencyCallCounters, ...(innerCursor ? { continuationCursor: innerCursor } : {}) });
  } catch {
    await commandRef.update({ status: "recoverable_failed", safeReason: "INVENTORY_FAILED", updatedAt: new Date().toISOString() }).catch(() => {});
    return safe("INVENTORY_FAILED", 500, ids);
  }
  const completedAt = new Date().toISOString();
  const result = inventory.receipt;
  const continuationCursor = result.continuationCursor ? encodeOperationalCursor({ innerCursor: result.continuationCursor, principalId: authorization.principal.principalId, environment: authorization.principal.environment, projectId: authorization.principal.projectId, classes: authorization.request.includeResourceClasses!, expiresAt: new Date(Date.now() + 3_600_000).toISOString(), secret: cursorSecret }) : null;
  const receiptId = opaque("legacy_inventory_receipt", `${commandId}:${result.inventoryFingerprint}`);
  const receipt = Object.freeze({ schemaVersion: "platform-legacy-ownership-inventory-receipt.v1", commandId, receiptId, principalReference, status: "completed", runMode: "dry_run", inventoryFingerprint: result.inventoryFingerprint, batchId: result.batchId, planId: result.planId, totalScanned: result.totalScanned, tenantOwnedCount: result.tenantOwnedCount, unresolvedCount: result.unresolvedCount, evidenceAvailableCount: result.evidenceAvailableCount, disputedCount: result.disputedCount, malformedCount: result.malformedCount, orphanedCount: result.orphanedCount, continuationCursor, policyVersion: PLATFORM_LEGACY_INVENTORY_POLICY, startedAt, completedAt, requestId: ids.requestId, correlationId: ids.correlationId, mutationPerformed: false, piiPresent: false });
  try {
    await db().runTransaction(async (transaction) => {
      const current = await transaction.get(commandRef);
      if (!current.exists || current.data()?.status !== "running") throw Error("stale");
      if (options.failCompletionAudit) throw Error("audit");
      transaction.create(db().doc(`legacyOwnershipInventoryReceipts/${receiptId}`), receipt);
      transaction.create(db().doc(`legacyOwnershipInventoryAuditEvents/${commandId}:complete`), { schemaVersion: "legacy-ownership-inventory-audit.v1", action: "dry_run_completion", outcome: "completed", principalReference, scope: PLATFORM_LEGACY_INVENTORY_SCOPE, commandId, receiptId, totalScanned: result.totalScanned, requestId: ids.requestId, correlationId: ids.correlationId, policyVersion: PLATFORM_LEGACY_INVENTORY_POLICY, piiPresent: false, createdAt: completedAt });
      transaction.update(commandRef, { status: "completed", receiptId, receipt, completedAt });
    });
  } catch {
    await commandRef.update({ status: "completion_audit_recovery_required", safeReason: "AUDIT_REQUIRED", updatedAt: new Date().toISOString() }).catch(() => {});
    return safe("AUDIT_REQUIRED", 500, ids);
  }
  return Object.freeze({ ok: true as const, status: 200, receipt, ...ids });
}
