# Elite Underwriting Intelligence Standard

Status: Canonical product doctrine
Task: `PRODUCT-DOCTRINE-ELITE-UNDERWRITING-INTELLIGENCE-01`
Scope: Underwriting intelligence, evidence, calculations, program and overlay analysis, conditions, risk indicators, readiness, reports, and related quality controls

## Purpose and authority

Velocity targets an expert-quality first-pass mortgage review that an experienced processor or underwriter can inspect, challenge, understand, and trust as an elite second set of eyes. It is decision support. It does not replace authorized human underwriting judgment and does not guarantee approval, eligibility, closing, salability, compliance, or investor acceptance.

This document is the canonical quality standard for all present and future underwriting-intelligence work. It governs product requirements and acceptance; it does not itself supply mortgage policy, legal advice, investor guidance, or authority to change runtime behavior.

## 1. Functional is not enough

Returning JSON, generating a score, completing a calculation, emitting a condition, rendering a report, or passing a narrow regression proves only that a mechanism ran. An acceptable result must also be factually and mathematically correct, evidence-backed, reproducible, explainable, internally consistent, program- and overlay-aware, appropriately cautious, operationally useful, and materially better than a generic document summary.

Generic summaries, arbitrary scores, vague conditions, unexplained calculations, simplistic pass/fail logic, unsupported conclusions, hidden assumptions, lender-specific rules represented as universal, speculative or discriminatory predictions, and feature bloat presented as intelligence are unacceptable.

Every proposed intelligence feature must measurably improve at least one of accuracy, consistency, explainability, processing speed, review quality, exception identification, auditability, customer control, or risk visibility. Otherwise it must be rejected.

## 2. Evidence-backed material conclusions

Every material finding must retain or resolve to:

- source evidence, including document and page or location when available;
- the extracted or human-entered value and its verification state;
- calculation inputs and their units, when applicable;
- the rule or policy basis and version, when applicable;
- competing values and conflicts;
- every material assumption;
- uncertainty and limitations;
- the basis for confidence, not merely a confidence number; and
- a recommended human action.

Derived values must identify all material inputs and may not falsely attribute the complete result to one source document. Missing evidence must not become a favorable verified value. Unsupported material conclusions fail to review, referral, a precise condition, or a blocked state rather than becoming an approval signal.

## 3. Confidence, classification, and scoring

Velocity must not produce a single unexplained “AI score.” Separate measures must be used where relevant: extraction confidence, document completeness, evidence consistency, identity confidence, employment confidence, income confidence, asset confidence, liability confidence, credit confidence, calculation confidence, program-fit status, underwriting readiness, and risk severity.

Every score or classification must define what it measures, which inputs affect it, which facts do not affect it, why the current result was produced, how a corrected fact would change it, and whether it is deterministic, heuristic, statistical, or human-entered.

Confidence must be calibrated against an approved benchmark for its stated purpose. It may not substitute for evidence quality, rule applicability, completeness, or human judgment. Readiness, risk, program fit, and extraction confidence are distinct concepts and must not be blended into a persuasive but uninterpretable number.

## 4. Visible assumptions and uncertainty

Any assumption affecting qualifying income, monthly obligations, PITIA, DTI, housing ratio, LTV, CLTV, HCLTV, cash to close, required reserves, assets, credit selection, occupancy, program eligibility, conditions, risk, or readiness must be visible and reviewable.

The system must distinguish:

- **Verified** — confirmed by authoritative evidence under the applicable source-precedence rule;
- **Strongly supported** — consistent, persuasive evidence exists but verification is not complete;
- **Partially supported** — some required support exists and material support remains absent;
- **Conflicting** — credible evidence disagrees;
- **Missing** — required evidence is absent;
- **Unreadable** — evidence exists but cannot be reliably interpreted;
- **Stale** — evidence is outside the applicable freshness requirement;
- **Unsupported** — a value or conclusion lacks adequate evidence or rule basis; and
- **Requires human judgment** — an authorized person must interpret policy, resolve an exception, or decide the file.

Weak, incomplete, unreadable, stale, or conflicting evidence must never be expressed with high confidence. An uncertainty state must show its downstream effects and required human action.

## 5. Elite conditions

A condition must be precise, necessary, non-duplicative, and proportionate. Where applicable it contains a precise title and exact requirement; reason; triggering and missing evidence; applicable rule source and version; program and tenant-overlay context; severity and blocking status; owner or responsible party; acceptable resolution examples; lifecycle status; and attributable audit history.

Velocity must favor the smallest set of conditions that resolves material uncertainty, policy requirements, or risk. The objective is not to ask for everything; it is to identify what materially matters. A condition may not silently weaken a hard stop or auto-clear solely because a later process omitted the underlying evidence.

## 6. Cross-document reasoning

Analysis must reason across the complete supported loan package, including:

- URLA/1003 identity data against identity evidence;
- URLA/1003 income against paystubs, W-2s, tax returns, and verification of employment;
- liabilities against credit reports and disclosures;
- assets against statements, required funds, cash to close, and reserves;
- purchase agreement against price, property, parties, dates, and loan terms;
- appraisal against collateral value and LTV calculations;
- housing obligations against PITIA and DTI;
- borrower names and addresses across all evidence;
- dates and document freshness across the transaction; and
- employment identity and history across all relevant documents.

Reconciliation must preserve candidates, applicable source precedence, conflicts, freshness, and unresolved questions. Silence in one document does not automatically disprove a fact supported elsewhere, and superficial text similarity is not verification.

## 7. Elite mortgage mathematics

Mortgage calculations are a critical control surface, not a cosmetic feature. Expert-grade correctness is required for supported calculations involving qualifying monthly income (base, overtime, bonus, commission, self-employment, variable, rental, and other income); liabilities (installment, revolving, student-loan, lease, and lawfully applicable alimony or support obligations); housing expense and PITIA; front-end housing ratio where applicable and back-end DTI; LTV, CLTV, and HCLTV; cash to close and reserves; credit-score selection; and borrower-level and loan-level qualifying logic.

Every material calculation must preserve:

1. a named formula and calculation version;
2. visible inputs and the source or authority for each input;
3. units and percentage representation;
4. precision and rounding policies;
5. inclusion and exclusion reasoning;
6. program, overlay, and exception context;
7. the final authoritative result; and
8. enough information to reproduce it.

Financial rounding must occur only at explicitly defined boundaries. Intermediate precision must be preserved where required. Display rounding is a projection and must not silently change the authoritative value. Displayed, stored, reported, engine, eligibility, and condition values must not have unexplained discrepancies. Estimated values must remain visibly labeled end to end.

## 8. Guideline, program, and overlay hierarchy

Rules must be maintainable, versioned, scoped, and deterministic. Velocity must not hardcode each lender's interpretation as a universal rule. The default precedence, from foundational to most specifically authorized, is:

1. canonical calculation primitives;
2. applicable law and prohibited-use constraints, which cannot be waived by configuration;
3. base agency, government, investor, or program guidance;
4. product configuration;
5. tenant configuration;
6. lender overlay;
7. authorized exception or waiver within its lawful delegated scope;
8. compensating-factor review, where controlling guidance permits it; and
9. attributable human underwriting judgment.

Later layers may modify an earlier layer only with explicit authority and scope. Lawful prohibitions, mathematical identities, evidence facts, and immutable history are not overridable policy preferences. Same-precedence conflicts or ambiguous authority/scope must fail explicitly to human review.

Each applied rule must preserve source, authority type, version, effective date, expiration where applicable, program, product, tenant, scope, precedence, overridden rule, exception authority, evidence requirements, and audit history. The system must distinguish a base guideline, investor requirement, product rule, lender overlay, temporary policy, authorized exception, compensating factor, and manual-review requirement.

## 9. Overlay excellence

An elite overlay system supports tenant, product, and program scope; effective and expiration dates; immutable versions; draft and published states; approval workflow; conflict detection; deterministic precedence; pre-publication simulation; rollback; audit history; impact explanations; affected-rule inventory; test cases; exception authority; safe defaults; and explicit failure when configuration is ambiguous.

An overlay must explain the base rule it modifies, why and where it applies, its effective period, the impact on analysis, its authorizer, whether an exception is permitted, and required evidence. It is not merely a replacement number.

Repository evidence currently shows base rule packs and optional program/active overlays in a separate regex worker, but not the complete governance capabilities above. Current overlay support is therefore **Prototype**, not elite. Publication workflow, authoritative sourcing, effective dating, conflict analysis, simulation, rollback, immutable lifecycle history, exception authority, and production-path unification remain acceptance requirements.

## 10. Rule traceability

Every material conclusion must eventually expose a navigable rule chain:

`borrower facts → normalized evidence → authoritative calculation inputs → base guideline → program/product rule → tenant/lender overlay → authorized exception → permitted compensating factors → resulting status → human action`

A reviewer must be able to answer why a rule applied, which version was effective, which evidence triggered it, which base rule existed, whether an overlay modified it, whether an exception applied, and what fact or authorized rule change would alter the result.

## 11. Controlled scenario analysis

What-if analysis is permitted only when mathematically deterministic, based on lawful mortgage inputs, clearly hypothetical, separated from authoritative file facts, fully traceable, and not presented as an approval guarantee. Appropriate examples include liability-payoff impact, income exclusion, property-tax or insurance changes, loan-amount or purchase-price changes, additional reserve requirements, and alternative program comparison.

Each scenario must identify changed inputs, held-constant inputs, applicable rule/version set, recalculated outputs, limitations, and the fact that no authoritative file fact was mutated. Speculative human-behavior prediction is prohibited.

## 12. Prohibited AI magic and discriminatory inference

Velocity must use lawful, documented, mortgage-relevant evidence and configured rules. It must not infer, predict, score, proxy, or use speculative conclusions about protected or irrelevant personal characteristics, including:

- race, color, religion, national origin, sex, sexual orientation, or gender identity;
- marital or familial assumptions beyond lawful documented requirements;
- pregnancy or intention to have children;
- disability;
- age, except where lawfully required for a specific calculation or program;
- receipt of public assistance, except where lawfully relevant and properly handled;
- exercise of protected consumer rights;
- neighborhood demographic proxies;
- likelihood of divorce, pregnancy, or job loss based on personal stereotypes;
- personality-based creditworthiness;
- unsupported lifestyle predictions; or
- social-media-derived underwriting judgments.

Velocity must not invent pseudo-scientific predictors or use a seemingly neutral proxy to recreate prohibited inference. Where legal or compliance interpretation is required, the system must surface the issue for authorized human review. Product, compliance, legal, and fair-lending review are required before any feature that could materially affect treatment, risk classification, conditions, readiness, or recommendations.

## 13. Human review, correction, and override

Authorized users must be able to inspect where a value came from, supporting and conflicting evidence, the reason for each condition, the applicable rule, every assumption, and the effect of a correction. Human corrections, exceptions, waivers, and overrides must preserve actor, authority, time, reason, prior and new values or status, evidence, scope, downstream recalculation, and audit history.

An override does not erase source evidence, the original result, conflicts, or history. It cannot exceed the actor's authority or waive law, a prohibited-use constraint, or a mathematical identity. Final lending decisions remain with authorized accountable humans.

## 14. Underwriting Knowledge Engine direction

Velocity's long-term direction is an Underwriting Knowledge Engine that knows and preserves what rule applies, why and when it applies, supporting evidence, available exceptions, overlay modifications, effective versions, performed calculations, remaining uncertainty, and mandatory human-review points.

This is not a mandate to encode every mortgage product at once. The maintainable strategy is canonical calculation primitives, bounded versioned rule packs, tenant-scoped overlays, explicit exceptions, and human-review triggers. Features that sound impressive but do not improve a defined operational outcome are AI theater and must not be pursued.

## 15. Quality acceptance framework

Future release-quality evaluation must use privacy-safe, versioned, expert-reviewed gold-standard loan files containing known correct calculations and expected findings. Coverage must include conflicting, incomplete, unreadable, and stale evidence; multiple borrowers and income sources; complex liabilities and properties; difficult income scenarios; program and overlay variations; exceptions and compensating factors; incorrect and corrected user edits; and regression against accepted outputs.

Tests must evaluate extraction accuracy, mathematical correctness, evidence and rule correctness, condition relevance, severity, confidence calibration, conflict detection, explanation quality, false positives, false negatives, reproducibility, and human usefulness—not only code execution.

The expert benchmark is:

> An experienced mortgage professional may not agree with every conclusion, but can understand exactly how Velocity reached it, verify the inputs, identify the applicable rule, and regard the analysis as a high-quality second set of eyes.

No capability may be called elite based only on architecture, file existence, a rendered UI, or narrow tests. Elite status requires representative production-path evidence, an approved source register, broad gold-standard results, calibration evidence where applicable, and mortgage-SME acceptance.

## 16. Current-state capability assessment

These ratings are documentation-grounded and intentionally conservative. Evidence comes from the Enterprise Bible, Enterprise Roadmap, Capability Registry, and SEC-002 closeout audit. Runtime behavior beyond that evidence is classified as unknown. `Elite` means the complete standard is proven; `Strong` means substantial and useful with important hardening remaining; `Functional` means usable baseline behavior exists; `Partial` means material pieces exist but the capability is incomplete; `Prototype` means exploratory or isolated behavior exists; `Missing` means documentation identifies no meaningful implementation; and `Unknown without runtime evidence` means documentation cannot substantiate behavior.

| Category | Rating | Repository evidence and principal quality improvement |
|---|---|---|
| Income extraction | Functional | Deterministic extraction is documented, but production paths diverge and broad benchmark accuracy is absent. Unify extraction and add source-located gold files. |
| Income qualification | Partial | Rich analysis exists, while governed treatment, variable/self-employed formulas, source register, and SME-approved corpus remain incomplete. |
| Liability extraction | Functional | Extraction, enrichment, deduplication, and review states exist in the deterministic engine; production unification and broader fixtures are needed. |
| PITIA | Partial | Proposed housing estimates exist; documented assumptions are not governed authoritative policy and complete PITIA traceability is not proven. |
| DTI | Strong | Deterministic DTI, uncertain-debt handling, scenarios, and regressions are documented; governed formulas, rounding corpus, SME approval, and production parity remain. |
| Housing ratio | Partial | Housing calculations are referenced, but a governed front-end ratio contract and program applicability are not established. |
| LTV | Functional | Deterministic LTV and regression foundations exist; appraisal/source precedence, rounding, and program governance need proof. |
| CLTV | Missing | No documented implementation evidence establishes a canonical CLTV calculation. |
| HCLTV | Missing | No documented implementation evidence establishes a canonical HCLTV calculation. |
| Cash to close | Missing | No documented canonical calculation, provenance, or regression corpus. |
| Reserves | Partial | Registry contracts and plans mention reserves, but current authoritative computation is not evidenced. |
| Credit-score selection | Functional | Deterministic credit representation/selection is documented; policy source, multi-borrower rules, and SME-approved fixtures remain. |
| Program modeling | Prototype | Optional programs participate in the separate regex worker; versioned authoritative rule packs and production integration are not proven. |
| Overlay modeling | Prototype | Active overlays can be merged in the separate worker; governance, dates, scope, simulation, conflict detection, rollback, and authority are incomplete. |
| Rule precedence | Partial | Condition/hard-stop behavior and some merge precedence exist, but complete guideline/program/tenant/overlay/exception precedence is not documented as implemented. |
| Rule traceability | Partial | Evidence and factors exist in parts of the deterministic engine; a complete persisted rule chain is planned. |
| Exception handling | Missing | Registry calls for governed exceptions/overrides, but no complete underwriting exception authority and lifecycle is evidenced. |
| Compensating factors | Prototype | Factors are produced by the richer engine, but approved applicability, effect, evidence, and production use are not established. |
| Evidence traceability | Partial | Evidence references and conflicts exist in parts of the engine; uniform persistence, page/region lineage, display, and downstream trace are incomplete. |
| Confidence calibration | Prototype | Heuristic confidence exists; benchmark calibration, distinct confidence dimensions, and correction workflow are absent. |
| Condition quality | Strong | Canonical conditions have category, severity, owner, actions/documents, blocking, and resolution strategy; production unification, rule citation, audit lifecycle, and expert relevance measures remain. |
| Red-flag quality | Unknown without runtime evidence | Risk assessment and hard stops are documented, but representative precision, recall, severity, and expert review are not. |
| Cross-document consistency | Partial | Candidate selection and conflicts exist; complete package-wide relationship checks and a broad conflict corpus are not evidenced. |
| Scenario analysis | Prototype | DTI scenarios/action plans exist; controlled immutable what-if contracts across other calculations are not established. |
| Human overrides | Partial | Security/evidence-review command foundations exist and governance is planned; complete underwriting correction/override propagation is not evidenced. |
| Audit | Partial | Substantial immutable security/evidence audit foundations are documented, but reproducible underwriting decision packages and complete cross-path audit remain incomplete. |
| Non-discrimination controls | Partial | Constitution and roadmap require governed/fair-lending behavior; complete prohibited-inference enforcement and adverse-impact validation evidence do not exist. |
| Regression quality | Functional | Deterministic DTI/workflow/report/OCR scripts and substantial security matrices exist; broad CI-gated underwriting boundaries and seeded-defect evidence are incomplete. |
| Expert benchmark coverage | Partial | Synthetic regression cases exist and QA-002 is Partial; broad privacy-safe, mortgage-SME-approved gold-file coverage is not evidenced. |

No category is currently **Elite**. **Strong** areas are DTI and condition-object foundations. **Functional** areas are income extraction, liability extraction, LTV, credit-score selection, and regression foundations. Most governance, traceability, and cross-package capabilities are **Partial**; program/overlay modeling, compensating factors, confidence, and scenario analysis remain **Prototype**; CLTV, HCLTV, cash to close, and complete exception handling are **Missing**; red-flag quality is **Unknown without runtime evidence**.

## 17. Highest-value improvements and rejected complexity

The highest-value improvements are, in order: one authoritative deterministic production engine; canonical versioned calculation primitives; evidence normalization and provenance; a sourced guideline/program hierarchy; governed tenant/lender overlays; persisted rule traces and attributable corrections/exceptions; precise measurable conditions; distinct calibrated confidence measures; cross-document reconciliation; and expert-reviewed release gates.

Do not pursue another analysis path, a universal opaque AI score, free-form AI approvals or denials, speculative borrower-behavior prediction, social-media underwriting, demographic or proxy scoring, autonomous condition clearance, ungoverned scraping of guideline text, encoding every product or lender at once, a general-purpose overlay language before core precedence is proven, cosmetic dashboards that obscure missing provenance, or scenario generation that mutates authoritative facts.

## 18. Sequenced future implementation roadmap

This roadmap begins only after the current security phase is completed and does not authorize implementation now.

1. **Canonical Mortgage Mathematics and Provenance.** Define supported calculation primitives, authoritative inputs, formulas, units, precision/rounding boundaries, inclusion/exclusion reasons, evidence links, and versioned outputs. Start with a bounded supported product scope and mortgage-SME-approved gold fixtures. This is the exact next underwriting-quality implementation bundle recommended after security completion.
2. **Evidence normalization and verification.** Unify candidates, winning-source rules, page/region provenance, freshness, conflicts, verification states, attributable corrections, and deterministic downstream recalculation.
3. **Guideline and program rule packs.** Add a source register and bounded, versioned rules with authority, scope, effective dates, applicability, evidence requirements, and human-review triggers.
4. **Overlay governance and precedence.** Add scoped overlays, lifecycle approvals, deterministic conflict handling, simulation, rollback, immutable history, exception authority, and tests.
5. **End-to-end rule traceability.** Persist and display the complete fact-to-human-action rule chain, including change explanations.
6. **Elite condition system.** Canonicalize requirements, triggers, rule sources, evidence gaps, ownership, lifecycle, and audit; measure relevance and hard-stop preservation.
7. **Confidence calibration.** Separate confidence dimensions, define inputs/exclusions, calibrate against approved corpora, and map low confidence to human review.
8. **Cross-document reasoning.** Implement bounded relationship checks for the supported package, with freshness and conflict rules.
9. **Controlled scenario analysis.** Add immutable, traceable what-if packages that never alter authoritative facts or guarantee approval.
10. **Expert benchmark and release gate.** Expand the privacy-safe corpus and require calculation, rule, explanation, relevance, calibration, false-positive/negative, reproducibility, and SME acceptance thresholds.

## 19. Change control

Every future prompt, design, or implementation touching underwriting intelligence must inspect and comply with this standard, the Product Constitution, Codex Rules, Enterprise Bible, Enterprise Roadmap, Capability Registry, applicable security doctrine, and approved mortgage-policy sources. This standard must not be used to overstate implementation status.
