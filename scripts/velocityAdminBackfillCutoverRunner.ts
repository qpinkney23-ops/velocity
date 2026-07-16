import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";

const port = 8197;
const start = "ADMIN_BACKFILL_CUTOVER_EMULATOR_CHILD_STARTED";
const complete = "ADMIN_BACKFILL_CUTOVER_EMULATOR_CHILD_COMPLETED";
const work = path.join(process.cwd(), "work");
const state = path.join(work, `.firebase-admin-backfill-${process.pid}`);
const cache = path.join(work, "firebase-emulator-cache");
const logs = ["firebase-debug.log", "firestore-debug.log", "ui-debug.log"].map(name => path.join(process.cwd(), name));
const existing = new Set(logs.filter(fs.existsSync));
const available = () => new Promise<boolean>(resolve => { const server = net.createServer(); server.once("error", () => resolve(false)); server.listen(port, "127.0.0.1", () => server.close(() => resolve(true))); });
const kill = (pid: number) => process.platform === "win32" ? spawnSync("taskkill.exe", ["/pid", String(pid), "/t", "/f"], { stdio: "ignore", windowsHide: true }) : (() => { try { process.kill(-pid, "SIGKILL"); } catch {} })();

async function main() {
  if (!await available()) throw Error(`EMULATOR_PORT_CONFLICT:${port}`);
  fs.mkdirSync(path.join(state, "config", "configstore"), { recursive: true });
  fs.mkdirSync(cache, { recursive: true });
  fs.writeFileSync(path.join(state, "config", "configstore", "firebase-tools.json"), JSON.stringify({ motd: { fetched: Date.now() } }));
  const cli = path.join(process.cwd(), "node_modules", "firebase-tools", "lib", "bin", "firebase.js");
  const env = { ...process.env, HOME: state, USERPROFILE: state, APPDATA: path.join(state, "appdata"), XDG_CONFIG_HOME: path.join(state, "config"), XDG_CACHE_HOME: cache, FIREBASE_EMULATORS_PATH: cache, FIREBASE_CLI_DISABLE_UPDATE_CHECK: "true", CI: "true" };
  const child = spawn(process.execPath, [cli, "emulators:exec", "--config", "firebase.admin-backfill-cutover.test.json", "--project", "demo-velocity-admin-backfill-cutover", "--only", "firestore", "set NODE_PATH=tests/shims&& npx tsx scripts/velocityAdminBackfillCutoverEmulatorRegression.ts"], { cwd: process.cwd(), env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true, detached: process.platform !== "win32" });
  let output = "";
  let timedOut = false;
  for (const [stream, target] of [[child.stdout, process.stdout], [child.stderr, process.stderr]] as const) stream.on("data", buffer => { output += buffer.toString(); target.write(buffer); });
  const startup = setTimeout(() => { if (!output.includes(start)) { timedOut = true; kill(child.pid!); } }, 90000);
  const total = setTimeout(() => { timedOut = true; kill(child.pid!); }, 210000);
  const status = await new Promise<number | null>((resolve, reject) => { child.once("error", reject); child.once("exit", resolve); });
  clearTimeout(startup); clearTimeout(total);
  if (timedOut || status !== 0 || !output.includes(start) || !output.includes(complete)) throw Error(`ADMIN_BACKFILL_EMULATOR_FAILED:${status}`);
  console.log("ADMIN BACKFILL CUTOVER HARNESS: child markers verified; emulator shut down cleanly");
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { fs.rmSync(state, { recursive: true, force: true }); for (const log of logs) if (!existing.has(log) && fs.existsSync(log)) fs.rmSync(log, { force: true }); });
