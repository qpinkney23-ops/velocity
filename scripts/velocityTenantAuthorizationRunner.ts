import { spawnSync } from "child_process";
import os from "os";
import path from "path";

const javaBin = "C:\\Program Files\\Eclipse Adoptium\\jdk-21.0.11.10-hotspot\\bin";
const pathValue = process.env.PATH || "";
const firebaseHome = path.join(os.tmpdir(), "velocity-firebase-cli");
const env = {
  ...process.env,
  PATH: pathValue.toLowerCase().includes("eclipse adoptium") ? pathValue : `${javaBin};${pathValue}`,
  XDG_CONFIG_HOME: path.join(firebaseHome, "config"),
  XDG_CACHE_HOME: path.join(firebaseHome, "cache"),
  HOME: firebaseHome,
  USERPROFILE: firebaseHome,
  APPDATA: path.join(firebaseHome, "appdata"),
  FIREBASE_CLI_DISABLE_UPDATE_CHECK: "true",
};

function run(command: string, args: string[]) {
  return spawnSync(command, args, { cwd: process.cwd(), env, encoding: "utf8", shell: true, maxBuffer: 20 * 1024 * 1024 });
}

console.log("TENANT AUTH HARNESS: launching Firebase Emulator Suite (Firestore 8180, Storage 9299)");
console.log("TENANT AUTH HARNESS: loading isolated rules from firebase.tenant-auth.test.json");
const emulator = run("npm.cmd", ["run", "velocity:tenant-auth:emulator"]);
if (emulator.stdout) process.stdout.write(emulator.stdout);
if (emulator.stderr) process.stderr.write(emulator.stderr);

const executionStarted = `${emulator.stdout || ""}\n${emulator.stderr || ""}`.includes("EMULATOR_TEST_EXECUTION_STARTED");
if (emulator.status === 0) {
  console.log("TENANT AUTH HARNESS: emulator tests passed; Emulator Suite shutdown completed.");
  process.exit(0);
}

if (executionStarted) {
  console.error("TENANT AUTH HARNESS: emulators started, but emulator-backed tests failed; deterministic fallback is intentionally not used.");
  process.exit(emulator.status ?? 1);
}

console.warn("TENANT AUTH HARNESS: Emulator Suite could not start; running deterministic fallback.");
const fallback = run("npx.cmd", ["tsx", "scripts/velocityTenantAuthorizationRegression.ts"]);
if (fallback.stdout) process.stdout.write(fallback.stdout);
if (fallback.stderr) process.stderr.write(fallback.stderr);
console.log("TENANT AUTH HARNESS: deterministic fallback shutdown completed.");
process.exit(fallback.status ?? 1);
