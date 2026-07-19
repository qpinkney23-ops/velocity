import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  GroundTruthPackage,
  LayoutId,
  RenderedDocumentManifest,
  ValidationResult,
} from "../contracts";
import { sha256, stableStringify } from "../deterministic";
import { GeneratedBankStatementSlice } from "../renderBankStatementSlice";

export interface BankStatementPackageFiles {
  readonly relativeRoot: string;
  readonly files: Readonly<Record<string, Uint8Array>>;
  readonly manifest: RenderedDocumentManifest;
}

const bytes = (value: unknown): Uint8Array => Buffer.from(stableStringify(value), "utf8");

export function buildBankStatementPackage(generated: GeneratedBankStatementSlice): BankStatementPackageFiles {
  const groundTruth: GroundTruthPackage = Object.freeze({
    schemaVersion: generated.scenario.schemaVersion,
    scenario: generated.scenario,
    documentId: generated.document.documentId,
    layoutId: generated.document.layout.id,
    expected: Object.freeze({
      beginningBalanceCents: generated.document.account.beginningBalanceCents,
      depositsCents: generated.document.depositsCents,
      withdrawalsCents: generated.document.withdrawalsCents,
      feesCents: generated.document.feesCents,
      endingBalanceCents: generated.document.endingBalanceCents,
      transactionCount: generated.document.transactions.length,
    }),
    provenance: generated.document.provenance,
  });
  const groundTruthBytes = bytes(groundTruth);
  const validationBytes = bytes({
    schemaVersion: generated.scenario.schemaVersion,
    documentId: generated.document.documentId,
    passed: generated.validationResults.every((item) => item.status === "PASS"),
    results: generated.validationResults,
  });
  const manifest: RenderedDocumentManifest = Object.freeze({
    schemaVersion: generated.scenario.schemaVersion,
    generatorVersion: "1.0.0",
    scenarioId: generated.scenario.id,
    seed: generated.scenario.seed,
    documentId: generated.document.documentId,
    documentFamily: "BANK_STATEMENT",
    institution: Object.freeze({ id: generated.document.institution.id, version: generated.document.institution.version }),
    template: Object.freeze({ id: generated.document.template.id, version: generated.document.template.version }),
    layout: Object.freeze({ id: generated.document.layout.id, version: generated.document.layout.version }),
    artifactProfile: Object.freeze({ id: generated.artifactProfile.id, version: generated.artifactProfile.version }),
    pageCount: generated.raster.pageImageBytes.length,
    artifacts: generated.artifacts,
    pageImageSha256: Object.freeze(generated.raster.pageImageBytes.map(sha256)),
    borrowerFacingPdfSha256: sha256(generated.raster.pdfBytes),
    groundTruthSha256: sha256(groundTruthBytes),
    validationResultsSha256: sha256(validationBytes),
    binaryDeterminism: "BYTE_IDENTICAL_WITHIN_PINNED_RUNTIME",
    binaryDeterminismNote:
      "PDF metadata is normalized and replay is byte-identical in the pinned runtime. Native canvas, JPEG, or font-engine version changes may change raster bytes across environments and must be treated as a renderer version change.",
  });
  const manifestBytes = bytes(manifest);
  const fileMap: Record<string, Uint8Array> = {
    "borrower-facing/bank-statement.pdf": generated.raster.pdfBytes,
    "engineering/ground-truth.json": groundTruthBytes,
    "engineering/generation-manifest.json": manifestBytes,
    "engineering/validation-results.json": validationBytes,
  };
  const checksumLines = Object.entries(fileMap)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([file, content]) => `${sha256(content)}  ${file}`)
    .join("\n");
  fileMap["engineering/checksums.sha256"] = Buffer.from(`${checksumLines}\n`, "utf8");
  return Object.freeze({
    relativeRoot: generated.document.layout.id,
    files: Object.freeze(fileMap),
    manifest,
  });
}

export async function writeBankStatementPackage(outputRoot: string, packageFiles: BankStatementPackageFiles): Promise<string> {
  const packageRoot = path.resolve(outputRoot, packageFiles.relativeRoot);
  for (const [relativeFile, content] of Object.entries(packageFiles.files)) {
    const target = path.resolve(packageRoot, relativeFile);
    if (!target.startsWith(`${packageRoot}${path.sep}`)) throw new Error(`Unsafe package path: ${relativeFile}`);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content);
  }
  return packageRoot;
}

export async function validateWrittenBankStatementPackage(
  packageRoot: string,
  expected: BankStatementPackageFiles,
): Promise<readonly ValidationResult[]> {
  const results: ValidationResult[] = [];
  const expectedNames = Object.keys(expected.files).sort();
  const actualNames = [
    ...(await readdir(path.join(packageRoot, "borrower-facing"))).map((name) => `borrower-facing/${name}`),
    ...(await readdir(path.join(packageRoot, "engineering"))).map((name) => `engineering/${name}`),
  ].sort();
  results.push({
    ruleId: "package.filesPresent",
    status: expectedNames.every((name) => actualNames.includes(name)) ? "PASS" : "ERROR",
    message: "All required borrower-facing and engineering files are present.",
  });
  const borrowerFiles = actualNames.filter((name) => name.startsWith("borrower-facing/"));
  results.push({
    ruleId: "package.groundTruthIsolation",
    status: borrowerFiles.length === 1 && borrowerFiles[0] === "borrower-facing/bank-statement.pdf" ? "PASS" : "ERROR",
    message: "Borrower-facing output contains only the rasterized bank statement PDF.",
  });
  let hashesMatch = true;
  for (const [relativeFile, expectedBytes] of Object.entries(expected.files)) {
    const actualBytes = await readFile(path.join(packageRoot, relativeFile));
    if (sha256(actualBytes) !== sha256(expectedBytes)) hashesMatch = false;
  }
  results.push({
    ruleId: "package.checksums",
    status: hashesMatch ? "PASS" : "ERROR",
    message: "Written files match their deterministic in-memory checksums.",
  });
  const pdfBytes = await readFile(path.join(packageRoot, "borrower-facing", "bank-statement.pdf"));
  const pdfStructure = pdfBytes.toString("latin1");
  results.push({
    ruleId: "raster.imageOnlyPdf",
    status: pdfStructure.includes("/Subtype /Image") && !pdfStructure.includes("ground-truth.json") ? "PASS" : "ERROR",
    message: "PDF pages contain raster image resources and do not reference hidden ground truth.",
  });
  return Object.freeze(results);
}

export function assertPackagesByteIdentical(left: BankStatementPackageFiles, right: BankStatementPackageFiles): void {
  const leftNames = Object.keys(left.files).sort();
  const rightNames = Object.keys(right.files).sort();
  if (stableStringify(leftNames) !== stableStringify(rightNames)) throw new Error("Deterministic replay produced different file sets.");
  for (const name of leftNames) {
    if (sha256(left.files[name]!) !== sha256(right.files[name]!)) {
      throw new Error(`Deterministic replay mismatch for ${name}.`);
    }
  }
}
