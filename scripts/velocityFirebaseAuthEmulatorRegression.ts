import { deleteApp, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

async function main() {
  const host = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9199";
  const projectId = "demo-velocity-server-auth";
  const response = await fetch(`http://${host}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "synthetic-auth-user@example.test", password: "synthetic-password-001", returnSecureToken: true }) });
  const body = await response.json() as { idToken?: string };
  if (!response.ok || !body.idToken) throw new Error("auth_emulator_token_issue_failed");
  const app = initializeApp({ projectId }, "velocity-server-auth-emulator-test");
  try {
    const decoded = await getAuth(app).verifyIdToken(body.idToken, true);
    if (!decoded.uid || decoded.aud !== projectId || !decoded.iat || !decoded.auth_time) throw new Error("auth_emulator_claims_invalid");
    console.log("Firebase Auth Emulator verifier result: PASS");
    console.log("PASS: Admin SDK verified a real emulator-issued Firebase ID token with revocation flag enabled");
    console.log("LIMITATION: Auth Emulator does not provide production-equivalent session-cookie, revocation, or disabled-user simulation; deterministic adapter regressions cover those mappings.");
  } finally { await deleteApp(app); }
}
main().catch((error) => { console.error("FIREBASE_AUTH_EMULATOR_FATAL:", error?.message || String(error)); process.exitCode = 1; });
