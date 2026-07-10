import { analyzeApplication } from "../lib/ai/analyzeApplication";

const args = process.argv.slice(2);

function getArg(name: string): string | undefined {
  const arg = args.find((a) => a.startsWith(`--${name}=`));
  return arg ? arg.split("=").slice(1).join("=") : undefined;
}

const docPath = getArg("docPath");
const runs = Number(getArg("runs") || 1);

if (!docPath) {
  console.error("Missing --docPath");
  process.exit(1);
}

async function run(resolvedDocPath: string) {
  let lastResult: any = null;

  for (let i = 1; i <= runs; i++) {
    const result = await analyzeApplication(resolvedDocPath);

    console.log(`\nRun ${i}`);
    console.log("verdict:", result.verdict);
    console.log("risk:", result.risk);
    console.log("confidence:", result.confidence);
    console.log("score:", result.score);
    console.log("reason:", result.reason);
    console.log("DTI:", result.dti);
    console.log("LTV:", result.ltv);
    console.log("conditions:", result.conditions.length);
    console.log("factors:", result.factors.map((f) => `${f.key}:${f.impact}`).join(", "));

    if (lastResult) {
      const changed = JSON.stringify(result) !== JSON.stringify(lastResult);
      console.log("changed vs last:", changed);
    }

    lastResult = result;
  }
}

run(docPath).catch((err) => {
  console.error(err);
  process.exit(1);
});