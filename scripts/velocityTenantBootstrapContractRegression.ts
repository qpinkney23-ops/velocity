import fs from "fs";
import { buildTenantBootstrapPlan } from "../lib/contracts/tenantBootstrap";
import { tenantBootstrapFixtures as f } from "../lib/contracts/tenantBootstrapFixtures";

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const before = JSON.stringify(f.platformAdmin);
const first = buildTenantBootstrapPlan(clone(f.platformAdmin), f.tenantId);
const second = buildTenantBootstrapPlan(clone(f.platformAdmin), f.tenantId);
assert(first.ok && second.ok, "valid bootstrap plan rejected");
assert(JSON.stringify(first.value) === JSON.stringify(second.value), "plan builder is not deterministic");
assert(JSON.stringify(f.platformAdmin) === before, "builder mutated its input");
assert(first.value.tenantId === f.tenantId && first.value.tenant.createdAt === f.platformAdmin.requestedAt, "builder did not preserve supplied identity/time");
assert(first.value.firstOwnerMembership.userId === f.platformAdmin.initiatingAuthenticatedUserId && first.value.firstOwnerMembership.role === "owner", "first owner was invented or reassigned");
assert(!buildTenantBootstrapPlan(f.invalidAuthority, f.tenantId).ok, "invalid authority accepted");
assert(!buildTenantBootstrapPlan(f.malformedUser, f.tenantId).ok, "malformed initiator accepted");
assert(!buildTenantBootstrapPlan(f.missingIdempotency, f.tenantId).ok, "missing idempotency accepted");
assert(!buildTenantBootstrapPlan(f.malformedTimestamp, f.tenantId).ok, "malformed timestamp accepted");
assert(!buildTenantBootstrapPlan(f.platformAdmin, f.malformedTenantId).ok, "malformed tenant ID accepted");
const migration = buildTenantBootstrapPlan(f.controlledMigration, "tenant_bootstrap_migration"); assert(migration.ok, "controlled migration rejected");
for (const path of Object.values(first.value.persistencePaths)) assert(typeof path === "string" && !path.includes("undefined"), "canonical path is invalid");
const pages = [...fs.existsSync("app") ? fs.readdirSync("app", { recursive: true }) : []].filter((p) => typeof p === "string" && /\.(tsx?|jsx?)$/.test(p)).map((p) => `app/${p}`);
assert(pages.every((p) => !fs.readFileSync(p, "utf8").includes("tenantBootstrap")), "production page or route imports bootstrap modules");
assert(!fs.readFileSync("firestore.rules", "utf8").includes("tenantBootstrapRequests"), "production Firestore rules changed for bootstrap");
console.log("Tenant bootstrap contract regression: PASS");
console.log("PASS: deterministic immutable plan, explicit IDs/times/authority, safe failures, no production exposure");
