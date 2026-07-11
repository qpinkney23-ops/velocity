import { spawnSync } from "child_process";
import os from "os";
import path from "path";

const javaBin = "C:\\Program Files\\Eclipse Adoptium\\jdk-21.0.11.10-hotspot\\bin";
const firebaseHome = path.join(os.tmpdir(), "velocity-firebase-cli");
const currentPath = process.env.PATH || "";
const env = { ...process.env, PATH: currentPath.toLowerCase().includes("eclipse adoptium") ? currentPath : `${javaBin};${currentPath}`, XDG_CONFIG_HOME: path.join(firebaseHome, "config"), XDG_CACHE_HOME: path.join(firebaseHome, "cache"), HOME: firebaseHome, USERPROFILE: firebaseHome, APPDATA: path.join(firebaseHome, "appdata"), FIREBASE_CLI_DISABLE_UPDATE_CHECK: "true" };
const result = spawnSync("npm.cmd", ["run", "velocity:tenant-bootstrap:emulator"], { cwd: process.cwd(), env, encoding: "utf8", shell: true, maxBuffer: 20 * 1024 * 1024 });
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
process.exit(result.status ?? 1);
