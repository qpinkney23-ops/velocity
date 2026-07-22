import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

type RegressionJob = {
  name: string;
  script: string;
};

const jobs: RegressionJob[] = [
  {
    name: "Underwriter Workspace Regression",
    script: "scripts/velocityUnderwriterWorkspaceRegression.ts",
  },
  {
    name: "Change Intelligence Regression",
    script: "scripts/velocityChangeIntelligenceRegression.ts",
  },
  {
    name: "DTI Regression",
    script: "scripts/velocityDtiRegression.ts",
  },
  {
    name: "Workflow Regression",
    script: "scripts/velocityWorkflowRegression.ts",
  },
  {
    name: "Report/PDF Regression",
    script: "scripts/velocityReportRegression.ts",
  },
  {
    name: "OCR Regression",
    script: "scripts/velocityOcrRegression.ts",
  },
];

async function runJob(job: RegressionJob): Promise<boolean> {
  console.log(`\n============================================================`);
  console.log(`RUNNING: ${job.name}`);
  console.log(`SCRIPT: ${job.script}`);
  console.log(`============================================================\n`);

  const command = process.platform === "win32" ? "cmd.exe" : "npx";
  const args =
    process.platform === "win32"
      ? ["/c", "npx", "tsx", job.script]
      : ["tsx", job.script];

  try {
    const result = await execFileAsync(command, args, {
      cwd: process.cwd(),
      windowsHide: false,
      maxBuffer: 1024 * 1024 * 20,
    });

    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);

    console.log(`\nPASS: ${job.name}`);
    return true;
  } catch (error: any) {
    if (error?.stdout) process.stdout.write(error.stdout);
    if (error?.stderr) process.stderr.write(error.stderr);

    console.error(`\nFAIL: ${job.name}`);
    console.error(`  ${error?.message || String(error)}`);

    if (typeof error?.code !== "undefined") {
      console.error(`  Exit code: ${error.code}`);
    }

    return false;
  }
}

async function run() {
  const startedAt = Date.now();

  console.log("Velocity Regression Suite");
  console.log(`Started: ${new Date(startedAt).toLocaleString()}`);

  const results: Array<{
    name: string;
    passed: boolean;
  }> = [];

  for (const job of jobs) {
    const passed = await runJob(job);

    results.push({
      name: job.name,
      passed,
    });

    if (!passed) {
      break;
    }
  }

  const durationMs = Date.now() - startedAt;
  const passedCount = results.filter((result) => result.passed).length;
  const failed = results.filter((result) => !result.passed);
  const notRun = jobs.filter(
    (job) => !results.some((result) => result.name === job.name)
  );

  console.log(`\n============================================================`);
  console.log("VELOCITY REGRESSION SUITE RESULT");
  console.log(`============================================================`);
  console.log(`Passed: ${passedCount}/${jobs.length}`);
  console.log(`Duration: ${(durationMs / 1000).toFixed(1)}s`);

  for (const result of results) {
    console.log(`${result.passed ? "PASS" : "FAIL"}: ${result.name}`);
  }

  for (const job of notRun) {
    console.log(`SKIPPED: ${job.name}`);
  }

  if (failed.length > 0 || notRun.length > 0) {
    process.exitCode = 1;
    return;
  }

  console.log("\nALL VELOCITY REGRESSIONS PASSED.");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
