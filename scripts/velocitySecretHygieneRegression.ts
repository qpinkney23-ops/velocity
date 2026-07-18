import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
const forbiddenEnvironmentFiles = tracked.filter((file) => /(^|\/)\.env(?:\..+)?$/i.test(file) && file !== ".env.example");
assert.deepEqual(forbiddenEnvironmentFiles, [], `tracked environment file: ${forbiddenEnvironmentFiles.join(", ")}`);

const highConfidenceSecrets = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bAIza[0-9A-Za-z_-]{35}\b/,
  /\bsk_live_[0-9A-Za-z]+\b/,
];
const candidateFiles = tracked.filter((file) => !/\.(?:png|jpe?g|gif|ico|pdf|woff2?|zip|gz)$/i.test(file) && fs.existsSync(file));
const findings: string[] = [];
for (const file of candidateFiles) {
  const source = fs.readFileSync(file, "utf8");
  if (highConfidenceSecrets.some((pattern) => pattern.test(source))) findings.push(file);
}
assert.deepEqual(findings, [], `high-confidence secret pattern in tracked files: ${findings.join(", ")}`);

const ignore = fs.readFileSync(".gitignore", "utf8");
assert(/^\.env$/m.test(ignore) && /^\.env\.\*$/m.test(ignore) && /^!\.env\.example$/m.test(ignore), "environment ignore policy incomplete");
const example = fs.readFileSync(".env.example", "utf8");
assert(!highConfidenceSecrets.some((pattern) => pattern.test(example)), "example contains credential material");
assert(/replace_with_|false/.test(example), "example does not use placeholders");

console.log("Repository secret hygiene regression: PASS");
console.log("PASS: environment files untracked, ignore policy enforced, placeholder example safe, high-confidence tracked-secret scan clean");
