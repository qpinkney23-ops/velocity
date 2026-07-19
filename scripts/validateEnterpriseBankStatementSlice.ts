import { LayoutId } from "../lib/document-generation/contracts";
import {
  assertPackagesByteIdentical,
  buildBankStatementPackage,
  validateWrittenBankStatementPackage,
  writeBankStatementPackage,
} from "../lib/document-generation/packaging/bankStatementPackage";
import { renderBankStatementSlice } from "../lib/document-generation/renderBankStatementSlice";
import { ENTERPRISE_BANK_STATEMENT_OUTPUT } from "./generateEnterpriseBankStatementSlice";

async function main(): Promise<void> {
  const layouts: readonly LayoutId[] = ["lakeview-traditional-v1", "lakeview-modern-v1"];
  const outputPaths: string[] = [];
  for (const layout of layouts) {
    const first = buildBankStatementPackage(await renderBankStatementSlice(layout));
    const replay = buildBankStatementPackage(await renderBankStatementSlice(layout));
    assertPackagesByteIdentical(first, replay);
    const outputPath = await writeBankStatementPackage(ENTERPRISE_BANK_STATEMENT_OUTPUT, first);
    const packageResults = await validateWrittenBankStatementPackage(outputPath, first);
    const failures = packageResults.filter((item) => item.status === "ERROR");
    if (failures.length > 0) {
      throw new Error(`${layout} package validation failed: ${failures.map((item) => item.ruleId).join(", ")}`);
    }
    outputPaths.push(outputPath);
    console.log(`PASS ${layout}: math, provenance, raster PDF, isolation, checksums, and byte-identical replay`);
  }
  console.log("Enterprise bank statement renderer vertical slice passed.");
  console.log("Output paths:");
  outputPaths.forEach((outputPath) => console.log(`- ${outputPath}`));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Enterprise bank statement validation failed.");
  process.exitCode = 1;
});

