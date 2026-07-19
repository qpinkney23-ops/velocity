import path from "node:path";
import { buildBankStatementPackage, writeBankStatementPackage } from "../lib/document-generation/packaging/bankStatementPackage";
import { renderBankStatementSlice } from "../lib/document-generation/renderBankStatementSlice";
import { LayoutId } from "../lib/document-generation/contracts";

export const ENTERPRISE_BANK_STATEMENT_OUTPUT = path.resolve(
  process.cwd(),
  "output/pdf/enterprise-renderer-bank-statement-v001",
);

export async function generateAllBankStatementLayouts(): Promise<readonly string[]> {
  const layouts: readonly LayoutId[] = ["lakeview-traditional-v1", "lakeview-modern-v1"];
  const outputPaths: string[] = [];
  for (const layout of layouts) {
    const generated = await renderBankStatementSlice(layout);
    outputPaths.push(await writeBankStatementPackage(ENTERPRISE_BANK_STATEMENT_OUTPUT, buildBankStatementPackage(generated)));
  }
  return Object.freeze(outputPaths);
}

if (require.main === module) {
  generateAllBankStatementLayouts()
    .then((paths) => {
      console.log("Generated deterministic enterprise bank statement layouts:");
      paths.forEach((outputPath) => console.log(`- ${outputPath}`));
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : "Enterprise bank statement generation failed.");
      process.exitCode = 1;
    });
}

