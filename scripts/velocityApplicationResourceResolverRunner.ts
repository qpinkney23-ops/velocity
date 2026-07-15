import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";

const PROJECT = "demo-velocity-application-resource";
const PORT = 8180;
const STARTUP_TIMEOUT_MS = 90_000;
const EXECUTION_TIMEOUT_MS = 210_000;
const START_MARKER = "EMULATOR_APPLICATION_RESOURCE_TEST_EXECUTION_STARTED";
const COMPLETION_MARKER = "EMULATOR_APPLICATION_RESOURCE_TEST_EXECUTION_COMPLETED";
const work = path.join(process.cwd(), "work");
const state = path.join(work, `.firebase-application-resource-${process.pid}`);
const cache = path.join(work, "firebase-emulator-cache");
const logs = ["firebase-debug.log", "firestore-debug.log", "ui-debug.log"].map(name => path.join(process.cwd(), name));
const preexistingLogs = new Set(logs.filter(fs.existsSync));

const portAvailable = () => new Promise<boolean>(resolve => { const server = net.createServer(); server.once("error", () => resolve(false)); server.listen(PORT, "127.0.0.1", () => server.close(() => resolve(true))); });
const killTree = (pid: number) => process.platform === "win32" ? spawnSync("taskkill.exe", ["/pid", String(pid), "/t", "/f"], { stdio: "ignore", windowsHide: true }) : (() => { try { process.kill(-pid, "SIGKILL"); } catch {} })();

async function main() {
  if (!await portAvailable()) throw new Error(`EMULATOR_PORT_CONFLICT: ${PORT}`);
  fs.mkdirSync(path.join(state, "config", "configstore"), { recursive: true });
  fs.mkdirSync(cache, { recursive: true });
  fs.writeFileSync(path.join(state, "config", "configstore", "firebase-tools.json"), JSON.stringify({ motd: { fetched: Date.now() } }));
  const cli = path.join(process.cwd(), "node_modules", "firebase-tools", "lib", "bin", "firebase.js");
  const env = { ...process.env, HOME: state, USERPROFILE: state, APPDATA: path.join(state, "appdata"), XDG_CONFIG_HOME: path.join(state, "config"), XDG_CACHE_HOME: cache, FIREBASE_EMULATORS_PATH: cache, FIREBASE_CLI_DISABLE_UPDATE_CHECK: "true", CI: "true" };
  const child = spawn(process.execPath, [cli, "emulators:exec", "--config", "firebase.tenant-auth.test.json", "--project", PROJECT, "--only", "firestore", "npx tsx scripts/velocityApplicationResourceResolverEmulatorRegression.ts"], { cwd: process.cwd(), env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true, detached: process.platform !== "win32" });
  let output = "", timedOut = false;
  for (const [stream, target] of [[child.stdout, process.stdout], [child.stderr, process.stderr]] as const) stream.on("data", chunk => { output += chunk.toString(); target.write(chunk); });
  const startupTimer = setTimeout(() => { if (!output.includes(START_MARKER)) { timedOut = true; killTree(child.pid!); } }, STARTUP_TIMEOUT_MS);
  const executionTimer = setTimeout(() => { timedOut = true; killTree(child.pid!); }, EXECUTION_TIMEOUT_MS);
  const status = await new Promise<number | null>((resolve, reject) => { child.once("error", reject); child.once("exit", resolve); });
  clearTimeout(startupTimer); clearTimeout(executionTimer);
  if (timedOut) throw new Error("APPLICATION_RESOURCE_EMULATOR_TIMEOUT");
  if (!output.includes(START_MARKER)) throw new Error("APPLICATION_RESOURCE_CHILD_START_MARKER_MISSING");
  if (!output.includes(COMPLETION_MARKER)) throw new Error("APPLICATION_RESOURCE_CHILD_COMPLETION_MARKER_MISSING");
  if (status !== 0) throw new Error(`APPLICATION_RESOURCE_EMULATOR_FAILED_${status}`);
  console.log("APPLICATION RESOURCE HARNESS: child markers verified; emulator shut down cleanly");
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  fs.rmSync(state, { recursive: true, force: true });
  for (const log of logs) if (!preexistingLogs.has(log) && fs.existsSync(log)) fs.rmSync(log, { force: true });
  console.log("APPLICATION RESOURCE HARNESS: isolated Firebase CLI state removed");
});
