import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";

const FIRESTORE_PORT = 8185;
const STORAGE_PORT = 9295;
const STARTUP_TIMEOUT_MS = 90_000;
const EXECUTION_TIMEOUT_MS = 120_000;
const TOTAL_TIMEOUT_MS = STARTUP_TIMEOUT_MS + EXECUTION_TIMEOUT_MS;
const START_MARKER = "APPLICATION_DOCUMENT_RESOURCE_EMULATOR_CHILD_STARTED";
const COMPLETION_MARKER = "APPLICATION_DOCUMENT_RESOURCE_EMULATOR_CHILD_COMPLETED";
const workRoot = path.join(process.cwd(), "work");
const state = path.join(workRoot, `.firebase-document-resource-${process.pid}`);
const artifactCache = path.join(workRoot, "firebase-emulator-cache");
const generatedLogs = ["firebase-debug.log", "firestore-debug.log", "storage-debug.log", "ui-debug.log"].map((name) => path.join(process.cwd(), name));
const preexistingLogs = new Set(generatedLogs.filter((file) => fs.existsSync(file)));

function portAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)));
  });
}

function killTree(pid: number): void {
  if (process.platform === "win32") {
    spawnSync("taskkill.exe", ["/pid", String(pid), "/t", "/f"], { stdio: "ignore", windowsHide: true });
    return;
  }
  try { process.kill(-pid, "SIGKILL"); } catch { /* Process already exited. */ }
}

async function main(): Promise<void> {
  const conflicts = (await Promise.all([FIRESTORE_PORT, STORAGE_PORT].map(async (port) => ({ port, available: await portAvailable(port) })))).filter(({ available }) => !available);
  if (conflicts.length) throw new Error(`EMULATOR_PORT_CONFLICT: ${conflicts.map(({ port }) => port).join(", ")}`);

  fs.mkdirSync(path.join(state, ".config", "configstore"), { recursive: true });
  fs.mkdirSync(path.join(state, "config", "configstore"), { recursive: true });
  fs.mkdirSync(artifactCache, { recursive: true });
  const firebasePreferences = JSON.stringify({ motd: { fetched: Date.now() } });
  fs.writeFileSync(path.join(state, ".config", "configstore", "firebase-tools.json"), firebasePreferences);
  fs.writeFileSync(path.join(state, "config", "configstore", "firebase-tools.json"), firebasePreferences);
  const env = {
    ...process.env,
    HOME: state,
    USERPROFILE: state,
    APPDATA: path.join(state, "appdata"),
    XDG_CONFIG_HOME: path.join(state, "config"),
    XDG_CACHE_HOME: artifactCache,
    FIREBASE_EMULATORS_PATH: artifactCache,
    FIREBASE_CLI_DISABLE_UPDATE_CHECK: "true",
    CI: "true",
  };

  console.log(`APPLICATION DOCUMENT RESOURCE HARNESS: demo project, Firestore ${FIRESTORE_PORT}, Storage ${STORAGE_PORT}`);
  console.log(`APPLICATION DOCUMENT RESOURCE HARNESS: repository-local artifact cache ${artifactCache}`);
  const firebaseCli = path.join(process.cwd(), "node_modules", "firebase-tools", "lib", "bin", "firebase.js");
  const child = spawn(process.execPath, [firebaseCli, "emulators:exec", "--config", "firebase.application-document-resource.test.json", "--project", "demo-velocity-application-document-resource", "--only", "firestore,storage", "npx tsx scripts/velocityApplicationDocumentResourceEmulatorRegression.ts"], {
    cwd: process.cwd(), env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true, detached: process.platform !== "win32",
  });
  let output = "";
  let started = false;
  let completed = false;
  let timedOut = false;
  const capture = (chunk: Buffer, target: NodeJS.WriteStream) => {
    const text = chunk.toString(); output += text; target.write(text);
    started ||= output.includes(START_MARKER);
    completed ||= output.includes(COMPLETION_MARKER);
  };
  child.stdout.on("data", (chunk: Buffer) => capture(chunk, process.stdout));
  child.stderr.on("data", (chunk: Buffer) => capture(chunk, process.stderr));
  const timeout = setTimeout(() => { timedOut = true; killTree(child.pid!); }, TOTAL_TIMEOUT_MS);
  const startup = setTimeout(() => { if (!started) { timedOut = true; killTree(child.pid!); } }, STARTUP_TIMEOUT_MS);
  const status = await new Promise<number | null>((resolve, reject) => { child.once("error", reject); child.once("exit", resolve); });
  clearTimeout(timeout); clearTimeout(startup);
  if (timedOut) throw new Error(started ? "EMULATOR_EXECUTION_TIMEOUT" : "EMULATOR_STARTUP_TIMEOUT");
  if (!started) throw new Error("EMULATOR_CHILD_START_MARKER_MISSING");
  if (!completed) throw new Error("EMULATOR_CHILD_COMPLETION_MARKER_MISSING");
  if (status !== 0) throw new Error(`EMULATOR_CHILD_EXIT_${status ?? "UNKNOWN"}`);
  console.log("APPLICATION DOCUMENT RESOURCE HARNESS: emulators shut down cleanly");
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }).finally(() => {
  try {
    fs.rmSync(state, { recursive: true, force: true });
    console.log("APPLICATION DOCUMENT RESOURCE HARNESS: per-run Firebase CLI state removed");
  } catch (error) {
    console.error(`APPLICATION DOCUMENT RESOURCE HARNESS: cleanup failed; retained ${state}: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
  for (const log of generatedLogs) {
    if (preexistingLogs.has(log) || !fs.existsSync(log)) continue;
    try { fs.rmSync(log, { force: true }); }
    catch (error) { console.error(`APPLICATION DOCUMENT RESOURCE HARNESS: cleanup failed; retained ${log}: ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1; }
  }
});
