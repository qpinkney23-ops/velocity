import assert from "node:assert/strict";
import fs from "node:fs";
import { SCHEDULER_GRANT_V1, SCHEDULER_POLICY_VERSION } from "../lib/contracts/schedulerServiceAuth";
import { authorizeSchedulerRequest, signSchedulerRequest, targetsFor } from "../lib/server/scheduler/schedulerServiceAuthCore";

const secret = "synthetic_scheduler_credential_12345678901234567890";
const now = "2026-07-16T12:00:00.000Z";
const principal = "velocity_scheduler";
const grant = (overrides: Record<string, unknown> = {}) => ({ schemaVersion: SCHEDULER_GRANT_V1, grantId: "scheduler_grant", servicePrincipalId: principal, serviceKind: "scheduler", status: "active", credentialVersion: "credential-v1", grantVersion: "grant-v1", environment: "test", scopes: ["scheduler.tick", "scheduler.dispatch_files_worker", "scheduler.dispatch_ai_worker"], workerTargets: ["files_worker", "ai_worker"], tenantIds: ["tenant_alpha"], policyVersion: SCHEDULER_POLICY_VERSION, ...overrides });

function harness(overrides: any = {}) {
  const body = overrides.body || JSON.stringify({ idempotencyKey: "scheduler_command_001", runMode: overrides.mode || "files_then_ai" });
  const timestamp = overrides.timestamp || now, nonce = "scheduler_nonce_001";
  const signature = signSchedulerRequest({ secret, method: "POST", path: "/api/cron/tick", timestamp, nonce, body });
  const headers: Record<string, string> = overrides.missing ? {} : { "x-velocity-service-id": principal, "x-velocity-credential-version": "credential-v1", "x-velocity-timestamp": timestamp, "x-velocity-nonce": nonce, "x-velocity-signature": overrides.signature || signature };
  const request = new Request(`https://velocity.test/api/cron/tick${overrides.query || ""}`, { method: "POST", headers, body });
  return { request, dependencies: { environment: "test", now: () => new Date(now), secretFor: () => overrides.noSecret ? undefined : secret, getGrant: async () => grant(overrides.grant), reserveNonce: async () => !overrides.replay, ids: () => ({ requestId: "scheduler_request_001", correlationId: "scheduler_correlation_001" }) } };
}

async function main() {
  for (const overrides of [{ missing: true }, { signature: "0".repeat(64) }, { timestamp: "2020-01-01T00:00:00Z" }, { query: "?secret=x" }]) { const h = harness(overrides); assert.equal((await authorizeSchedulerRequest(h.request, h.dependencies as any)).ok, false); }
  for (const invalidGrant of [{ status: "inactive" }, { revokedAt: now }, { environment: "production" }, { scopes: ["scheduler.tick"] }, { tenantIds: [] }]) { const h = harness({ grant: invalidGrant }); assert.equal((await authorizeSchedulerRequest(h.request, h.dependencies as any)).ok, false); }
  for (const mode of ["files_only", "ai_only", "files_then_ai"] as const) { const h = harness({ mode }); const result = await authorizeSchedulerRequest(h.request, h.dependencies as any); assert(result.ok); assert.deepEqual(result.authorization.targets, targetsFor(mode)); }
  const replay = harness({ replay: true }), replayResult = await authorizeSchedulerRequest(replay.request, replay.dependencies as any); assert(replayResult.ok && replayResult.authorization.requestReplay);
  const route = fs.readFileSync("app/api/cron/tick/route.ts", "utf8"), production = fs.readFileSync("lib/server/scheduler/schedulerServiceAuth.ts", "utf8");
  assert(!/export async function GET/.test(route), "unauthenticated readiness surface remains");
  assert(route.includes("authorizeProductionScheduler") && route.indexOf("scheduler.execution_started") < route.indexOf("await dispatchWorker"));
  assert(production.includes("signWorkerServiceRequest") && !/CRON_SECRET|authorization.*Bearer|searchParams/.test(route + production));
  assert(route.includes("lookupSchedulerReceipt") && route.includes("AUDIT_REQUIRED") && route.includes("abandonSchedulerCommand"));
  console.log("Scheduler service authorization regression: PASS");
  console.log("PASS: negative service auth, grant scope, replay, fixed targets, audit-before-dispatch, and no public readiness surface");
}
main().catch((error) => { console.error(error); process.exit(1); });
