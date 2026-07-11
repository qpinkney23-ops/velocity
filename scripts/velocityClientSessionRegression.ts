import fs from "fs";
import { clearSession, exchangeSession, sessionErrorMessage } from "../lib/client/auth/velocitySession";

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
const response = (ok: boolean, code?: string) => ({ ok, json: async () => ({ error: { code } }) }) as Response;

async function main() {
  let tokenCalls = 0, exchangeCalls = 0, releaseExchange!: () => void;
  const held = new Promise<void>((resolve) => { releaseExchange = resolve; });
  const user = { getIdToken: async (fresh: true) => { assert(fresh === true, "ID token was not force-refreshed"); tokenCalls += 1; return "synthetic-transient-token"; } };
  const request = async (_input: RequestInfo | URL, init?: RequestInit) => { exchangeCalls += 1; assert(init?.body === JSON.stringify({ idToken: "synthetic-transient-token" }), "exchange payload changed"); await held; return response(true); };
  const first = exchangeSession(user, request), duplicate = exchangeSession(user, request);
  assert(first === duplicate, "duplicate exchange did not share the in-flight request");
  releaseExchange(); await Promise.all([first, duplicate]);
  assert(tokenCalls === 1 && exchangeCalls === 1, "login exchange did not execute exactly once");

  let failedSignOut = 0;
  try { await exchangeSession(user, async () => response(false, "AUTH_REVOKED")); } catch (error) { failedSignOut += 1; assert(sessionErrorMessage(error) === "Your sign-in is no longer valid. Please sign in again.", "stable server error mapping changed"); }
  assert(failedSignOut === 1 && !sessionErrorMessage(new Error("raw Firebase PII")).includes("Firebase"), "raw authentication error escaped");

  const clears = { server: 0, firebase: 0 };
  await clearSession(async () => { clears.firebase += 1; }, async (input) => { assert(input === "/api/auth/logout", "wrong logout endpoint"); clears.server += 1; return response(true); });
  assert(clears.server === 1 && clears.firebase === 1, "logout did not clear both sessions");
  await clearSession(async () => { clears.firebase += 1; throw new Error("synthetic"); }, async () => { clears.server += 1; return response(true); }).catch(() => undefined);
  await clearSession(async () => { clears.firebase += 1; }, async () => { clears.server += 1; throw new Error("synthetic"); }).catch(() => undefined);
  assert(Number(clears.server) === 3 && Number(clears.firebase) === 3, "logout did not survive partial failures");

  const helper = fs.readFileSync("lib/client/auth/velocitySession.ts", "utf8");
  assert(!/localStorage|sessionStorage|console\./.test(helper), "client helper persists or logs credentials");
  assert(!/uid|tenant|role|cookie/i.test(helper), "client helper accepts identity or inspects cookies");
  const login = fs.readFileSync("app/auth/login/page.tsx", "utf8"), registration = fs.readFileSync("app/auth/register/page.tsx", "utf8"), topbar = fs.readFileSync("components/layout/Topbar.tsx", "utf8");
  assert((login.match(/exchangeSession\(/g) || []).length === 1 && login.indexOf("exchangeSession(") < login.indexOf("router.push(safeNextDestination"), "login navigation does not wait for one exchange");
  assert((registration.match(/exchangeSession\(/g) || []).length === 1 && registration.indexOf("setDoc(") < registration.indexOf("exchangeSession(") && registration.indexOf("exchangeSession(") < registration.indexOf('router.push("/dashboard")'), "registration behavior or exchange ordering changed");
  assert(topbar.includes("clearSession") && topbar.includes('router.replace("/auth/login")'), "logout redirect integration missing");
  console.log("Client browser session regression: PASS");
  console.log("PASS: login/registration exchange, duplicate protection, transient token, stable errors, dual logout, partial failure, redirect and scope isolation");
}
main().catch((error) => { console.error(error?.message || String(error)); process.exitCode = 1; });
