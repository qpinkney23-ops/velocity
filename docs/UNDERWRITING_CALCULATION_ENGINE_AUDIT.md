# Velocity Underwriting Calculation Engine Audit

Date: 2026-07-19  
Branch: `enterprise-v1-lock`  
Scope: extraction-derived inputs, canonical mortgage mathematics, underwriting policy/scoring, report generation, and application-detail fallbacks. UI was inspected as a consumer but was not changed.

## Executive conclusion

Velocity has a useful canonical arithmetic kernel in `lib/mortgage/canonicalCalculations.ts`, but it is not yet the single source of truth for a complete underwriting result. The arithmetic functions are reused in several places, while assumptions, completeness rules, metric semantics, thresholds, fallback calculations, and rounding are still duplicated in the analyzer, report builder, extraction layer, and application detail page.

The highest-risk divergence is PITIA: analysis uses 6.875% interest, 1.25% taxes, 0.35% insurance, and tiered MI, while report generation uses 6.75% interest, 1.8% taxes, $1,800 annual insurance, and 0.85% MI above 80% LTV. Therefore the report's displayed components can disagree with the payment and total DTI used for the decision. DTI is also overloaded: `normalized.dti` means consumer debt ratio, while factors and report `dti` commonly mean back-end DTI.

No behavior was changed during this audit. Three clear defects are documented below and should be fixed in small, regression-protected changes before structural consolidation.

## Calculation inventory and recommended authority

| Metric / transformation | Current implementations and consumers | Current definition | Finding | Recommended canonical owner |
|---|---|---|---|---|
| Annualized qualifying income | `extractFields.ts:577-609`; selected in `analyzeApplication.ts:1542-1755` | Hourly × 40 × 52; biweekly × 26; semimonthly × 24; weekly × 52; monthly × 12; otherwise selected annual evidence | Extraction heuristics are separate from calculation provenance and round to whole dollars. They do not model actual hours, variable income averaging, or program rules. | A dedicated `qualifyingIncome.ts` policy module returning annual income plus method, period, evidence, and confidence; canonical math should only convert the selected annual value to monthly. |
| Monthly qualifying income | `canonicalCalculations.ts:180-193`; analyzer wrapper at `analyzeApplication.ts:74-78`; page fallback at `page.tsx:885-893` | Annual qualifying income ÷ 12, unrounded | Arithmetic is consistent, but the page should consume the persisted calculation rather than calculate a fallback. | `calculateMonthlyQualifyingIncome`; prohibit consumer-side recomputation after migration. |
| Liability extraction and inclusion | `extractFields.ts:781, 853-915, 932-1096`; `analyzeApplication.ts:321-467, 1359-1436` | Parse monthly payments; classify included/review/excluded; select credit over 1003 over bank; dedupe; sum included | Two dedupe keys differ: extraction includes source, analyzer does not. Same creditor/payment across real distinct accounts can be collapsed; different OCR creditor spellings can double count. Inclusion policy is embedded in parsing and analysis. | A canonical liability-normalization module with stable account identity, source precedence, inclusion reason, review state, and calculation input output. |
| Monthly liabilities | `canonicalCalculations.ts:196-211`; analyzer at `1405` and `4466`; extraction `sumMoney`/`sumIncludedLiabilities` | Sum finite included values and round currency | Canonical sum is sound for positive debts, but it returns `null` when no inputs are included. The semantic distinction between “verified zero” and “unknown” is not represented. | `calculateMonthlyLiabilities`, extended with explicit completeness state (`known_zero`, `known_value`, `unknown`). |
| Consumer debt ratio | `canonicalCalculations.ts:213-235`; wrappers `computeDTI` and `computeConsumerDebtRatio`; stored as `normalized.dti` | Included monthly liabilities ÷ monthly qualifying income | Naming is misleading: `dti` is pre-housing consumer debt ratio, not underwriting back-end DTI. A verified zero debt produces `null`, not `0`. | Canonical field `consumerDebtRatio`; deprecate ambiguous `dti` after a compatibility period. |
| Housing ratio | `canonicalCalculations.ts:213-235`; canonical set at `analyzeApplication.ts:4485` | PITIA ÷ monthly qualifying income | Correct arithmetic, but only as reliable as PITIA completeness. | `calculateDebtToIncomeRatio` with typed obligation set and completeness requirements. |
| Back-end / total DTI | Analyzer calls at `497-506`, `804-810`, `1104-1114`, `4486`; report selection at `buildUnderwritingReport.ts:180-202`; page selection at `page.tsx:754-762` | (existing liabilities + proposed PITIA) ÷ monthly qualifying income | Multiple scenarios correctly reuse arithmetic, but `computeTotalDTI` converts missing debts/PITIA to zero. Report and page use precedence chains that can silently substitute consumer DTI for total DTI. | One `calculateUnderwritingRatios` orchestration returning named `housingRatio`, `consumerDebtRatio`, and `backEndDti`, each with completeness/provenance. Consumers read these exact fields only. |
| DTI reduction scenarios | `analyzeApplication.ts:469-534, 783-944`; page `885-920` | Recalculate DTI after reviewable-debt removal; page computes obligations above 50%/43% | Analyzer scenarios use canonical ratio math, but percentage display uses local rounding. Page independently derives target reductions from fallback values. | Server-side scenario module built from the canonical ratio input set; return target, reduction, affected liabilities, and provenance. |
| LTV | `canonicalCalculations.ts:238-252`; analyzer wrapper/canonical set; report recomputation; page action math | Loan amount ÷ property value | Base arithmetic is consistent and intentionally unrounded. Threshold comparisons vary (`>= 95%` vs `> 95%`) across policy and UI. | `calculateLtv`; move LTV bands and exact boundary semantics to a versioned policy registry. |
| Representative credit score | `extractFields.ts:501-554`; `analyzeApplication.ts:965-1058`; `canonicalCalculations.ts:254-268` | 3+ scores: median; 2: lower; 1: only | Extraction may honor an explicit representative score, but analysis later collects and deduplicates scores across documents. Deduplication makes `[680,700,700]` become `[680,700]` and returns 680 instead of the median 700. Borrower/bureau identity is lost, and multi-borrower rules are absent. | A typed credit-score selection module keyed by borrower and bureau. Select each borrower's middle/lower score, then apply the program's multi-borrower rule. Never dedupe by numeric value alone. |
| Principal and interest | `canonicalCalculations.ts:287-294` | Standard fixed-rate amortization; zero rate uses principal/months | Formula is centralized and currency-rounded. No validation for supported term/rate policy beyond positive values. | Keep in canonical math; accept explicit rate/term inputs from a versioned assumption/program context. |
| Taxes | Canonical PITIA; analysis assumptions at `analyzeApplication.ts:1080-1091` and `4470-4481`; report assumptions at `buildUnderwritingReport.ts:209-247` | Property value × annual rate ÷ 12 | Analysis assumes 1.25%; report assumes 1.8%. Missing value can contribute zero to total. | Canonical PITIA inputs resolved once from authoritative data or one versioned assumption set. |
| Insurance | Same PITIA call sites | Annual amount ÷ 12, else property value × annual rate ÷ 12 | Analysis assumes 0.35% of value; report assumes $1,800/year. Missing value can contribute zero. | Same PITIA orchestration and assumption registry as taxes. |
| Mortgage insurance | `estimatedAnnualMiRate` at `analyzeApplication.ts:1065-1073`; report at `buildUnderwritingReport.ts:242` | Analysis: tiered 0.50%-0.85% above 80% LTV; report: flat 0.85% above 80% | Direct decision/report divergence. These are product/program assumptions, not universal mathematics. | Versioned program/MI policy resolver; canonical PITIA consumes its resolved rate. |
| HOA | Analysis and report PITIA callers | Defaults to $0 | Unknown HOA is treated as verified zero, understating PITIA/DTI. | Preserve `unknown` unless authoritative zero; require completeness or mark estimated result incomplete. |
| PITIA total | `canonicalCalculations.ts:271-318`; analyzer calls; report recomputation | Authoritative total if positive; otherwise sum known components, treating missing taxes/insurance as zero | Formula code is central but input assumptions are not. An authoritative total can override while report components come from a different estimate, so components need not reconcile to total. | One persisted canonical PITIA result and component set, calculated once per analysis version; reports must not recompute it. |
| Compensating-factor score / strength | `analyzeApplication.ts:1123-1291` | Strong=2, moderate=1, weak=0; net factors minus risks; bands strong/moderate/limited/weak | Heuristic score and thresholds are embedded locally and recompute PITIA/DTI. `weak` factors carry zero weight, which may not match the label's intended risk meaning. | Versioned `underwritingPolicy.ts` consuming canonical metrics; document weights and reason codes. |
| Decision risk score | `analyzeApplication.ts:3659-3889` | Credit + DTI + LTV + income + asset + interaction risk − capped support adjustment, clamped 0-100 | A separate 0-100 score from decision score and readiness. Thresholds overlap but are not shared with conditions/guardrails. | Versioned policy evaluator returning component scores, rule IDs, and policy version. |
| Denial guardrails / decision tier | `analyzeApplication.ts:3898-4049` | Guardrails at 60% DTI and stacked-risk combinations; tiers based on hard stops and risk bands | Total-DTI hard stop elsewhere is >65%, while risk and denial logic use >60%. At exactly 60% no guardrail fires because comparisons use `>`. This may be intended, but it is undocumented. | Same policy registry; each threshold has an inclusive/exclusive operator and stable rule ID. |
| Decision score | `analyzeApplication.ts:4157-4214` | Starts 85; condition, credit, DTI, LTV, completeness, compensating adjustments; final verdict floors/caps | This is not the decision risk score, yet both are exposed as “score.” It recomputes PITIA/DTI and calls compensating factors without documents, changing current-income support. | Either retire it in favor of the policy risk result or rename to `fileQualityScore` and define its purpose/version explicitly. |
| Analysis confidence | `analyzeApplication.ts:4216-4234` | Starts .72; document/source/population bonuses; conflict and high-condition penalties; clamp .45-.99 | Uses local `round2`, not canonical rounding. It mixes evidence coverage with adverse underwriting conditions, so confidence can drop because a file is risky rather than uncertain. | Evidence-confidence module independent of credit risk; return a 0-1 ratio and component explanation. |
| Workflow readiness | Server `analyzeApplication.ts:2704-2755`; page fallback `page.tsx:810-880`; report normalization `buildUnderwritingReport.ts:277-328` | Server: 100 − 28/high − 12/med − 5/low − 18/blocking; page fallback omits blocking penalty | Duplicate implementations differ and label logic differs. Report defaults missing readiness to 0/high risk, which can fabricate a score rather than preserve unknown. | Server `computeReadinessState` as sole producer; consumers display persisted state or explicit unavailable status. |
| Display percentage and currency rounding | Canonical `roundHalfAwayFromZero`; analyzer `round2`; report `safePercent`; multiple `toFixed`; extraction `sumMoney` | Mixed half-away claim, `Math.round`, and string formatting | Rounding is inconsistent for negative/tie values. `Number.EPSILON` does not guarantee decimal half-away behavior for all binary floats. Display conversion and stored ratio semantics are mixed. | Decimal/fixed-point rounding primitive shared by canonical calculations; store ratios as fractions and convert only in serializers/presenters. |

## Confirmed defects

### P0 — DTI action factor uses the wrong unit

`analyzeApplication.ts:3214-3225` stores `normalized.dti` as a fraction but tests `normalized.dti > 50`. A 55% ratio is `0.55`, so the negative impact branch can never be reached for a valid ratio. The comparison should be against the documented policy threshold (currently likely `0.50`) or, preferably, consume the canonical back-end DTI and policy result.

### P0 — Verified zero debt is represented as unavailable

`calculateDebtToIncomeRatio` returns a result only when summed obligations are greater than zero. Safe reproduction with monthly income 10,000 and included obligation 0 returned `null`; the mathematically correct ratio is `0`. This contaminates consumer DTI, factors, completeness conditions, and tests that treat null as missing. The API must distinguish an explicit/verified zero from missing obligations.

### P0 — Credit-score deduplication can choose the wrong representative score

`canonicalCalculations.ts:255` and upstream `uniqueSortedCreditScores` deduplicate numeric scores before selection. Safe reproduction for `[680, 700, 700]` returned 680, while the three-score median is 700. Scores need borrower/bureau identity and must not be deduplicated by value.

## Material inconsistencies and risks

1. **PITIA/report divergence (P0):** different rates, tax, insurance, and MI assumptions can produce a report breakdown inconsistent with the decision. Report generation should consume `analysis.calculations.pitia` wholesale.
2. **Missing inputs silently become zero (P0):** `computeTotalDTI` uses `debts ?? 0` and `proposedHousingPayment ?? 0`; PITIA totals also sum missing taxes/insurance as zero. This can understate obligations while appearing calculated.
3. **Ambiguous DTI contract (P0):** `normalized.dti` is consumer-only, while `total_dti`, report `dti`, and UI “DTI” generally mean back-end DTI. Precedence fallbacks can substitute one for the other.
4. **Policy thresholds are duplicated (P1):** DTI bands at 43%, 50%, 55%, 56%, 60%, and 65%; LTV bands at 80%, 90%, 95%, and 97%; credit bands at 580, 620, 660, 680, 700, and 740 appear in multiple independent branches. Some variation is purposeful, but no registry explains purpose or boundary operators.
5. **Liability identity and source precedence are heuristic (P1):** deduplication can collapse distinct accounts or double-count the same account, directly changing DTI.
6. **Multiple unrelated scores share generic names (P1):** decision score, risk score, support score, readiness score, and confidence are separately computed and not consistently typed/versioned.
7. **Consumer recomputation (P1):** the application page calculates readiness fallback, DTI reductions, LTV targets, and risk labels. This is underwriting behavior in a UI file and can diverge from server analysis.
8. **Rounding contract is incomplete (P2):** canonical metadata says half-away-from-zero, but implementation relies on floating-point `Math.round`; other modules use different rounding. Most positive normal values agree, but tie and negative cases are not contract-tested.
9. **Unknown versus zero versus estimated is not preserved (P1):** HOA, liabilities, taxes, insurance, and report defaults conflate absent data with zero. Canonical metadata has `estimated`, but result completeness is not enforced.
10. **Test blind spots (P1):** current regressions cover representative happy paths, but not zero debt, duplicated equal bureau scores, missing PITIA components, exact threshold boundaries, analyzer/report component equality, or ratio/percentage unit misuse.

## Canonical target architecture

1. `inputNormalization`: produces typed annual income, liabilities, loan/value, credit scores, and housing inputs with identity, provenance, confidence, and explicit `known | estimated | unknown` state.
2. `mortgageMath`: pure, policy-neutral arithmetic for monthly income, liability sum, amortization/PITIA components, LTV, and ratios. This is the evolved role of `canonicalCalculations.ts`.
3. `programAssumptions`: one versioned resolver for interest term, taxes, insurance, MI, HOA treatment, and program/overlay context. No caller-local defaults.
4. `underwritingPolicy`: versioned thresholds, boundary operators, compensating factors, guardrails, and risk/decision rules consuming one canonical calculation set.
5. `workflowReadiness`: one server-owned calculation consuming canonical conditions. No UI fallback score calculation.
6. `serialization`: explicit ratio-to-percent conversion and compatibility aliases. Reports and UI consume persisted canonical values; they never recompute underwriting metrics.

Every output should include calculation/policy version, exact named inputs, completeness, assumption source, evidence references, and stable reason/rule IDs.

## Prioritized remediation plan

### Phase 0 — Protect current behavior and fix clear defects

1. Add edge regressions for zero debt, duplicate equal bureau scores, null versus zero obligations, and the DTI action factor unit.
2. Fix the three confirmed defects in isolated commits/changesets: ratio threshold unit, verified-zero DTI, and score selection without numeric deduplication.
3. Add a golden invariant test that analysis PITIA components, proposed-housing factor, back-end DTI, report values, and PDF values all reconcile exactly for the same analysis.
4. Add exact-boundary tests at every current DTI/LTV/credit threshold before deciding whether boundaries should change.

### Phase 1 — Stop divergent recomputation

1. Make the report consume the persisted canonical PITIA, LTV, and named DTI results; remove report-local assumption defaults.
2. Replace page underwriting fallbacks with canonical server values plus an explicit unavailable state. This can be done without visual/UI changes.
3. Introduce explicit `consumerDebtRatio`, `housingRatio`, and `backEndDti` fields; retain `dti` only as a documented compatibility alias during migration.
4. Represent result completeness and distinguish verified zero from missing/estimated data.

### Phase 2 — Centralize policy and inputs

1. Move PITIA assumptions and MI tiers to a versioned program-assumption resolver.
2. Move DTI/LTV/credit bands, guardrails, and boundary operators to a versioned policy registry with stable rule IDs.
3. Consolidate liability normalization/deduplication around account identity and source precedence.
4. Replace numeric-only credit score arrays with borrower/bureau records and implement program-specific multi-borrower selection.

### Phase 3 — Clarify scoring and rounding

1. Decide which of risk score and decision/file-quality score is authoritative; rename or retire the other.
2. Separate evidence confidence from underwriting risk.
3. Keep readiness as a workflow metric calculated only on the server.
4. Adopt fixed-point/decimal rounding, with separate stored-value and display rules, and add tie/negative/large-value tests.

## Validation performed for this audit

- `npm.cmd run velocity:math`: passed canonical mortgage mathematics and canonical analysis integration regressions.
- `npm.cmd run velocity:dti`: 4/4 cases passed.
- `npm.cmd run velocity:report`: passed report workflow regression and PDF generation.
- Safe edge reproduction: zero-debt DTI returned `null` (defect confirmed).
- Safe edge reproduction: scores `[680, 700, 700]` selected `680` (defect confirmed).

Passing current regressions does not mitigate the documented gaps because those edge cases and cross-layer reconciliation invariants are not asserted.
