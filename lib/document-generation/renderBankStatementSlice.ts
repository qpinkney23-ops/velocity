import {
  AppliedPageArtifacts,
  ArtifactProfile,
  LayoutId,
  PopulatedBankStatement,
  ScenarioTruth,
  ValidationResult,
} from "./contracts";
import { planPageArtifacts, TYPICAL_PRODUCTION_SCAN } from "./artifacts/typicalProductionScan";
import { LAKEVIEW_COMMUNITY_BANK } from "./institutions/lakeviewCommunityBank";
import { BANK_STATEMENT_LAYOUTS } from "./layouts/bankStatementLayouts";
import { populateBankStatement } from "./population/bankStatementPopulation";
import { rasterizeBankStatement, RasterizedBankStatement } from "./raster/bankStatementRaster";
import { ENTERPRISE_BANK_STATEMENT_SCENARIO } from "./scenario/bankStatementScenario";
import { BANK_STATEMENT_TEMPLATE } from "./templates/bankStatement";
import { assertValidationPassed, validateBankStatement } from "./validation/bankStatementValidation";

export interface GeneratedBankStatementSlice {
  readonly scenario: ScenarioTruth;
  readonly document: PopulatedBankStatement;
  readonly artifactProfile: ArtifactProfile;
  readonly artifacts: readonly AppliedPageArtifacts[];
  readonly validationResults: readonly ValidationResult[];
  readonly raster: RasterizedBankStatement;
}

export async function renderBankStatementSlice(layoutId: LayoutId): Promise<GeneratedBankStatementSlice> {
  const scenario = ENTERPRISE_BANK_STATEMENT_SCENARIO;
  const layout = BANK_STATEMENT_LAYOUTS[layoutId];
  if (!layout) throw new Error(`Unsupported bank statement layout: ${layoutId}`);
  const document = populateBankStatement(scenario, LAKEVIEW_COMMUNITY_BANK, BANK_STATEMENT_TEMPLATE, layout);
  const validationResults = validateBankStatement(scenario, document);
  assertValidationPassed(validationResults);
  const artifacts = Object.freeze([1, 2].map((page) => planPageArtifacts(scenario.seed, page)));
  const raster = await rasterizeBankStatement(document, artifacts, scenario.seed);
  return Object.freeze({
    scenario,
    document,
    artifactProfile: TYPICAL_PRODUCTION_SCAN,
    artifacts,
    validationResults,
    raster,
  });
}

