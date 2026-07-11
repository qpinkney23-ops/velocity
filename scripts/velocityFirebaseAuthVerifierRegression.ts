import fs from "fs";
import path from "path";
import { classifyUserCredential } from "../lib/contracts/serverAuth";
import { serverAuthFixtures as f } from "../lib/contracts/serverAuthFixtures";
import { verifyFirebaseUserCredential, type FirebaseAuthVerificationAdapter } from "../lib/server/auth/firebaseAuthVerifierCore";

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const secretToken = "synthetic-token-secret";
const secretCookie = "synthetic-cookie-secret";
const fixedNow = new Date("2026-07-11T17:40:00.000Z");
let idCounter = 0;
const dependencies = (adapter: FirebaseAuthVerificationAdapter) => ({ adapter, now: () => new Date(fixedNow), generateOpaqueId: () => `opaque${String(++idCounter).padStart(4, "0")}` });
const adapter = (claims: any = f.verifierClaims): FirebaseAuthVerificationAdapter => ({ verifyIdToken: async () => clone(claims), verifySessionCookie: async () => clone(claims), assertUserEnabled: async () => undefined });
const input = (raw: any, trustedCorrelationCaller = false, inboundCorrelationId?: unknown) => Object.freeze({ classification: classifyUserCredential(raw), ...raw, trustedCorrelationCaller, inboundCorrelationId });
async function code(raw: any, authAdapter: FirebaseAuthVerificationAdapter) { const result = await verifyFirebaseUserCredential(input(raw), dependencies(authAdapter)); assert(!result.ok, "expected verifier failure"); return result.error; }
const firebaseError = (errorCode: string, message = "synthetic.person@example.test secret-token") => Object.assign(new Error(message), { code: errorCode });

async function main() {
  idCounter = 0;
  const bearerRaw = clone(f.credentials.bearer), cookieRaw = clone(f.credentials.cookie); const bearerBefore = JSON.stringify(bearerRaw), cookieBefore = JSON.stringify(cookieRaw);
  const bearer = await verifyFirebaseUserCredential(input(bearerRaw), dependencies(adapter()));
  const cookie = await verifyFirebaseUserCredential(input(cookieRaw), dependencies(adapter()));
  assert(bearer.ok && bearer.context.principal.kind === "firebase_user" && bearer.context.principal.authenticationMethod === "firebase_id_token", "valid ID token rejected");
  assert(cookie.ok && cookie.context.principal.kind === "firebase_user" && cookie.context.principal.authenticationMethod === "session_cookie", "valid session cookie rejected");
  assert(Object.isFrozen(bearer.context) && Object.isFrozen(bearer.context.principal), "context is mutable");
  assert(JSON.stringify(bearerRaw) === bearerBefore && JSON.stringify(cookieRaw) === cookieBefore, "verifier mutated input");

  assert((await code(f.credentials.none, adapter())).code === "AUTH_REQUIRED", "missing credential mapping changed");
  assert((await code(f.credentials.conflict, adapter())).code === "AUTH_INVALID", "conflict accepted");
  assert((await code(f.credentials.unsupported, adapter())).code === "AUTH_INVALID", "unsupported scheme accepted");
  assert((await code({ authorizationHeader: "Bearer" }, adapter())).code === "AUTH_INVALID", "malformed bearer accepted");
  assert((await code({ sessionCookie: "   " }, adapter())).code === "AUTH_REQUIRED", "malformed cookie accepted");
  for (const errorCode of ["auth/id-token-expired", "auth/argument-error", "auth/invalid-issuer", "auth/invalid-audience"]) {
    const failing = adapter(); (failing as any).verifyIdToken = async () => { throw firebaseError(errorCode); };
    const error = await code(f.credentials.bearer, failing); assert(error.code === "AUTH_INVALID" && !JSON.stringify(error).includes("example.test") && !JSON.stringify(error).includes(secretToken), "Firebase error leaked or mapped incorrectly");
  }
  for (const errorCode of ["auth/id-token-revoked", "auth/session-cookie-revoked"]) { const failing = adapter(); (failing as any).verifyIdToken = async () => { throw firebaseError(errorCode); }; (failing as any).verifySessionCookie = async () => { throw firebaseError(errorCode); }; assert((await code(errorCode.includes("session") ? f.credentials.cookie : f.credentials.bearer, failing)).code === "AUTH_REVOKED", "revocation mapping changed"); }
  const disabled = adapter(); (disabled as any).assertUserEnabled = async () => { throw firebaseError("auth/user-disabled"); }; assert((await code(f.credentials.bearer, disabled)).code === "ACCOUNT_DISABLED", "disabled mapping changed");
  for (const claims of [{ ...f.verifierClaims, uid: undefined }, { ...f.verifierClaims, issuedAtSeconds: "bad" }, { ...f.verifierClaims, authenticatedAtSeconds: -1 }]) assert((await code(f.credentials.bearer, adapter(claims))).code === "AUTH_INVALID", "malformed claims accepted");
  const unknown = adapter(); (unknown as any).verifyIdToken = async () => { throw new Error("synthetic.person@example.test unknown secret-token"); }; const internal = await code(f.credentials.bearer, unknown); assert(internal.code === "INTERNAL_ERROR" && !JSON.stringify(internal).includes("example.test"), "unknown error leaked");

  const untrusted = await verifyFirebaseUserCredential(input(f.credentials.bearer, false, f.untrustedCorrelationId), dependencies(adapter()));
  const trusted = await verifyFirebaseUserCredential(input(f.credentials.bearer, true, f.trustedCorrelationId), dependencies(adapter()));
  assert(untrusted.ok && untrusted.context.correlationId !== f.untrustedCorrelationId, "untrusted correlation ID preserved");
  assert(trusted.ok && trusted.context.correlationId === f.trustedCorrelationId, "trusted correlation ID not preserved");
  assert(untrusted.ok && /^req_opaque\d+$/.test(untrusted.context.requestId) && /^corr_opaque\d+$/.test(untrusted.context.correlationId), "opaque ID contract changed");

  idCounter = 0; const repeatA = await verifyFirebaseUserCredential(input(f.credentials.bearer), dependencies(adapter())); idCounter = 0; const repeatB = await verifyFirebaseUserCredential(input(f.credentials.bearer), dependencies(adapter())); assert(JSON.stringify(repeatA) === JSON.stringify(repeatB), "deterministic adapter fixture changed");
  const serverFiles = ["lib/server/auth/firebaseAdminAuthAdapter.ts", "lib/server/auth/firebaseAuthVerifier.ts"]; for (const file of serverFiles) assert(fs.readFileSync(file, "utf8").includes('import "server-only"'), `${file} is not server-only`);
  const roots = ["app", "components", "middleware.ts"]; const production: string[] = []; for (const root of roots) { if (!fs.existsSync(root)) continue; if (fs.statSync(root).isFile()) production.push(root); else for (const entry of fs.readdirSync(root, { recursive: true })) { const file = path.join(root, String(entry)); if (fs.statSync(file).isFile() && /\.(ts|tsx|js|jsx)$/.test(file)) production.push(file); } } assert(production.every((file) => !/firebaseAuthVerifier|firebaseAdminAuthAdapter/.test(fs.readFileSync(file, "utf8"))), "production imports verifier");
  console.log("Firebase Admin authentication verifier regression: PASS");
  console.log("PASS: ID token/session, revocation, disabled, stable errors, opaque IDs, immutability, no production imports");
}
main().catch((error) => { console.error(error?.message || String(error)); process.exitCode = 1; });
