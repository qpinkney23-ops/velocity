import { AppliedPageArtifacts, ArtifactProfile, SCHEMA_VERSION } from "../contracts";
import { DeterministicRandom } from "../deterministic";

export const TYPICAL_PRODUCTION_SCAN: ArtifactProfile = Object.freeze({
  id: "typical-production-scan-v1",
  schemaVersion: SCHEMA_VERSION,
  version: "1.0.0",
  rotationDegrees: [-0.35, 0.35] as const,
  skewPixels: [-2.2, 2.2] as const,
  noiseDensity: 0.0014,
  jpegQuality: 82,
  foldShadowProbability: 0.35,
  allowedDpi: [144, 150, 160] as const,
});

export function planPageArtifacts(seed: string, pageNumber: number, profile = TYPICAL_PRODUCTION_SCAN): AppliedPageArtifacts {
  const random = new DeterministicRandom(`${seed}:artifact:${profile.version}:page:${pageNumber}`);
  return Object.freeze({
    pageNumber,
    dpi: random.pick(profile.allowedDpi),
    rotationDegrees: Number(random.between(...profile.rotationDegrees).toFixed(4)),
    skewPixels: Number(random.between(...profile.skewPixels).toFixed(4)),
    noiseDensity: profile.noiseDensity,
    jpegQuality: profile.jpegQuality,
    foldShadowApplied: random.next() < profile.foldShadowProbability,
  });
}
