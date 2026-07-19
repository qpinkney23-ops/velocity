# Velocity Enterprise Document Rendering Architecture

Status: Permanent architectural reference  
Governing authority: `docs/ENTERPRISE_DOCUMENT_BIBLE.md`  
Companion references: `docs/ENTERPRISE_TEMPLATE_LIBRARY.md` and `docs/ENTERPRISE_INSTITUTION_LIBRARY.md`

## 1. Mission

This document defines how Velocity's future enterprise synthetic-document rendering system must transform canonical mortgage truth into realistic, image-based validation packs. It is an engineering blueprint, not an implementation.

The architecture must produce documents that are visually and structurally representative of production mortgage files while remaining entirely synthetic, deterministic, auditable, mathematically consistent, and safe. Rendering concerns must remain separate from underwriting, OCR, and application behavior.

All implementations governed by this architecture must also comply with the Enterprise Document Bible, Enterprise Template Library, and Enterprise Institution Library. If those references conflict, the Document Bible is authoritative.

## 2. Architectural Principles

1. **Canonical truth before presentation.** A scenario owns facts; templates and layouts may express facts but may not redefine them.
2. **Independent stages.** Each stage has a typed input, typed output, explicit validation contract, and no hidden dependency on later stages.
3. **Deterministic generation.** A scenario, configuration, library version set, and seed must reproduce the same logical documents and artifacts.
4. **Internal consistency over randomness.** Random variation operates only within validated constraints and must never alter canonical truth.
5. **Structural diversity.** Institution, template, and layout selection are separate decisions. Color changes alone do not constitute independent layouts.
6. **Artifacts are presentation effects.** Scan degradation must not mutate ground truth, source values, or document chronology.
7. **Validation is fail-closed.** A package with unresolved consistency, chronology, pagination, or rendering errors must not be released.
8. **Explainable provenance.** Every field, layout decision, artifact, and output page must be traceable to its source and configuration.
9. **Safe synthesis.** Generated identities, institutions, account identifiers, signatures, marks, and addresses must follow approved synthetic-data and noninfringement rules.
10. **Engine isolation.** Underwriting calculations, OCR interpretation, and product application code remain consumers or external evaluators—not renderer dependencies.

## 3. System Boundaries

The rendering system accepts a versioned generation request and approved library definitions. It returns a validation pack, a private ground-truth manifest, validation evidence, and provenance metadata.

The renderer must not:

- determine credit eligibility or underwriting recommendations;
- infer missing canonical facts from rendered output;
- call OCR to populate or correct documents;
- borrow authentication, tenant, or application state;
- copy protected real-institution forms, logos, or signatures;
- silently repair inconsistent scenarios;
- release intermediate source layers as borrower-facing documents.

## 4. End-to-End Pipeline

Every generation run passes through nine ordered stages. Stages may parallelize work internally only when ordering and deterministic output are preserved.

### Stage 1: Scenario

The Scenario Engine constructs or accepts the canonical borrower and transaction truth. The scenario includes identities, relationships, employment, income, assets, liabilities, property, loan terms, dates, and all derived values required by the document set.

Input: versioned generation request, scenario profile, deterministic seed.  
Output: immutable `CanonicalScenario`.  
Gate: schema validity, mathematical consistency, chronology, uniqueness, and synthetic-data safety.

No downstream stage may mutate the canonical scenario. Corrections require a new scenario revision and a new generation run.

### Stage 2: Institution Selection

The Institution Engine selects approved fictional issuer identities appropriate to each document role. Selection considers institution category, supported document families, geography, product compatibility, diversity targets, and requested institution profile.

Input: canonical scenario, institution profile, Institution Library version.  
Output: versioned `InstitutionAssignment` records.  
Gate: all issuer roles are covered, identities are fictional and approved, and selected institutions support the assigned templates.

### Stage 3: Template Family

The Template Engine selects the approved document families and versions needed to express the scenario. It establishes required sections, expected pages, disclosures, attachments, continuation behavior, and field bindings.

Input: canonical scenario, package manifest, institution assignments, Template Library version.  
Output: ordered `DocumentPlan` entries with template family and version.  
Gate: package completeness, product applicability, date applicability, and institution-template compatibility.

### Stage 4: Layout Variant

The Layout Engine chooses an independent approved layout for each document plan. Layout selection resolves page geometry, regions, grids, typography, headers, footers, tables, signatures, disclosures, machine-readable marks, continuation pages, and overflow behavior.

Input: document plans, institution assignments, layout constraints, deterministic seed.  
Output: immutable `LayoutPlan` for every logical document.  
Gate: layout approval, version compatibility, structural independence, pagination feasibility, and accessibility of required content before degradation.

### Stage 5: Document Population

The Population Engine binds canonical facts to template fields and produces pristine semantic documents. Formatting adapters may represent the same truth differently—such as abbreviated addresses, masked account numbers, or year-to-date tables—but must retain source lineage.

Input: canonical scenario, document plans, layout plans.  
Output: populated semantic pages and a field-level provenance map.  
Gate: required-field coverage, formatting constraints, arithmetic reconciliation, continuation integrity, and no unbound or invented values.

### Stage 6: Consistency Validation

The Validation Engine validates each populated document and the complete cross-document set before any visual degradation occurs. It compares all expressed values to canonical truth and checks chronology, math, balances, document coverage, and intentional-conflict declarations.

Input: canonical scenario, populated documents, provenance map.  
Output: signed or integrity-protected `ValidationReport`.  
Gate: zero unresolved errors. Warnings require an approved rule, explicit disposition, and preserved audit evidence.

### Stage 7: Artifact Engine

The Artifact Engine applies a deterministic, layered artifact plan to pristine pages. Artifacts simulate office scanners, phones, faxes, handling, annotation, and image compression without changing semantic truth.

Input: validated pristine pages, artifact profile, page-specific constraints, deterministic seed.  
Output: artifact-enhanced page surfaces plus an artifact manifest.  
Gate: profile compliance, legibility budget, artifact compatibility, protected-region checks, and absence of semantic alteration.

### Stage 8: Rasterization

The Raster Engine converts each artifact-enhanced page into a flattened, image-based representation at the configured resolution and quality. It normalizes color space and orientation while retaining the intended degradation and page dimensions.

Input: artifact-enhanced page surfaces, raster configuration.  
Output: ordered raster pages with checksums and technical metadata.  
Gate: page count, dimensions, resolution, color space, decodability, checksum generation, and pixel-level safety checks.

Rasterization is distinct from final container encoding. A future PDF container may package raster pages, but no selectable semantic text layer may be introduced unless a separately approved validation use case requires one.

### Stage 9: Packaging

The Packaging Engine groups rasterized documents into a versioned validation pack. It creates deterministic names, ordering, manifests, checksums, package metadata, validation evidence, and a separately controlled ground-truth bundle.

Input: raster pages, document metadata, validation report, provenance, ground truth.  
Output: release candidate package and private engineering bundle.  
Gate: manifest completeness, checksum verification, expected-document coverage, naming safety, separation of ground truth, and release checklist approval.

## 5. Renderer Components

### 5.1 Scenario Engine

Owns canonical scenario construction and validation. It must model parties, employers, income streams, accounts, liabilities, properties, loan structures, events, dates, and expected document evidence. It publishes immutable, versioned truth and derived-value lineage.

### 5.2 Institution Engine

Resolves fictional identities and institution roles from the Institution Library. It owns identity assets, issuer capabilities, category constraints, diversity policy, and approved bindings. It must never synthesize an unregistered production identity at runtime.

### 5.3 Template Engine

Resolves document-family definitions from the Template Library. It owns semantic sections, field requirements, page expectations, disclosures, attachment rules, and template version compatibility—not visual placement.

### 5.4 Layout Engine

Transforms semantic document plans into independent page compositions. It owns grids, geometry, styles, overflow, pagination, headers, footers, signatures, machine-readable elements, and layout-specific constraints.

### 5.5 Population Engine

Binds canonical values to semantic fields and layout regions. It owns approved display transformations, masking, formatting, table expansion, continuation generation, and field-level provenance. It may not perform underwriting inference.

### 5.6 Validation Engine

Executes schema, mathematical, chronological, cross-document, layout, and package rules. Rules must have stable identifiers, severity, version, evidence, and remediation guidance. Validation results must be machine-readable and human-reviewable.

### 5.7 Artifact Engine

Builds and applies ordered artifact layers. It owns artifact compatibility, intensity ranges, protected content regions, interaction rules, legibility budgets, and deterministic page-level variation.

### 5.8 Raster Engine

Flattens page compositions and artifacts into image-based pages. It owns output dimensions, DPI, interpolation, antialiasing, color conversion, compression preparation, orientation, and image integrity.

### 5.9 Packaging Engine

Creates the deliverable package, document index, naming scheme, checksums, and release manifest. It enforces isolation between test inputs and hidden engineering truth.

### 5.10 Ground Truth Engine

Produces the private reference against which extraction, OCR, calculations, conditions, explainability, and reporting are evaluated. It records canonical values, derived-value formulas, expected evidence locations, expected document classifications, intentional conflicts, and package lineage.

The Ground Truth Engine reads canonical and provenance data; it must not derive truth from rasterized documents. Its output must remain separate from the package presented to the system under test.

## 6. Shared Data Contracts

Implementations should define language-neutral, versioned contracts for at least:

- `GenerationRequest`: requested scenario, pack, difficulty, profiles, versions, seed, and output policy.
- `CanonicalScenario`: immutable facts, derived values, chronology, and relationship graph.
- `InstitutionAssignment`: approved fictional institution identity, role, version, and capabilities.
- `DocumentPlan`: document family, evidence purpose, issuer, dates, required sections, and attachments.
- `LayoutPlan`: layout version, page geometry, regions, styles, overflow, and rendering constraints.
- `PopulatedDocument`: semantic pages, display values, source references, and continuation relationships.
- `ProvenanceMap`: field-to-truth bindings, transformations, formulas, and page locations.
- `ArtifactPlan`: ordered layers, parameters, masks, protected regions, and seed derivation.
- `RasterManifest`: page order, dimensions, DPI, color space, encoding, and checksums.
- `ValidationReport`: rule results, evidence, severity, dispositions, and version set.
- `GroundTruthManifest`: expected values and evidence, kept outside the test package.
- `PackageManifest`: files, document order, versions, hashes, configuration fingerprint, and lineage.

Contracts must reject unknown required fields, preserve backward-readable versions where feasible, and use explicit units, currencies, time zones, percentage representations, and rounding rules.

## 7. Artifact Pipeline

### 7.1 Layer model

Artifacts must be composable layers applied in a declared order. A typical order is physical-page effects, capture geometry, optical effects, device noise, compression, and post-capture annotations. Profiles may alter the order only when modeling a credible workflow.

Each layer records type, version, parameters, random sub-seed, page target, coordinate system, masks, and measured impact. Page-to-page variance must be constrained by the selected profile.

### 7.2 Supported artifacts

| Artifact | Configuration requirements | Guardrails |
|---|---|---|
| Scanner skew | angle range, axis, page variance | Preserve page content bounds or model clipping explicitly. |
| Phone perspective | corner displacement, camera angle, lens distortion | Avoid impossible geometry and protect required identifiers from total loss. |
| Fax degradation | resolution, thresholding, streaking, header behavior | Maintain credible fax characteristics and declared legibility. |
| Compression | codec class, quality range, generation count | Prevent uncontrolled cumulative loss. |
| Rotation | angle, direction, page variance | Separate intentional orientation from deskew noise. |
| Noise | distribution, density, color behavior | Do not fabricate glyph-like marks in protected numeric regions. |
| Blur | radius, motion direction, focal pattern | Respect the profile's legibility budget. |
| Staple shadows | anchor, size, opacity, page depth | Keep placement physically plausible. |
| Fold marks | line path, width, shading, crease count | Model interaction with ink without changing source content. |
| Page curl | edge, radius, shadow, perspective | Preserve credible page boundaries. |
| Watermarks | approved synthetic mark, angle, opacity, repetition | Never use protected real-institution marks. |
| Mixed DPI | allowed per-page DPI set, resampling method | Record effective DPI for every output page. |
| Ink variation | channel drift, density, fading, print-region masks | Apply to print layers, not canonical values. |
| Handwritten initials | approved synthetic style, location, ink | Use only where the template authorizes initials. |
| Digital signatures | approved synthetic signature style and metadata | Must be conspicuously synthetic in internal provenance. |
| Wet signatures | approved synthetic stroke asset, pressure, ink | Never imitate a real person's signature. |
| Highlighting | color, opacity, path, bleed | Must not intentionally conceal required truth unless the profile declares occlusion. |
| Sticky notes | size, text policy, placement, shadow | Generated note text must be synthetic and validated for data safety. |

### 7.3 Compatibility and realism

Artifact profiles must define allowed, prohibited, and conditional combinations. For example, a fax profile should not simultaneously preserve pristine full-color digital signatures, and a phone capture should use coherent perspective, lighting, curl, and shadow geometry.

The engine must enforce an artifact budget per page and per critical region. Extreme profiles may create controlled unreadability only when the expected loss is documented in ground truth and the validation objective requires it.

### 7.4 Nondestructive provenance

The pristine semantic page, artifact plan, and raster result must be independently identifiable by checksum. Artifacts must be replayable from the same inputs and seed. Debug previews may exist in an implementation environment but must not leak into released packages.

## 8. Validation Pipeline

### 8.1 Validation phases

Validation occurs at multiple gates:

1. **Scenario validation:** completeness, units, math, relationships, chronology, and safety.
2. **Selection validation:** institution, template, layout, and product compatibility.
3. **Population validation:** field coverage, display transformations, page flow, and arithmetic.
4. **Cross-document validation:** agreement among every expression of canonical truth.
5. **Artifact validation:** profile adherence, physical plausibility, and legibility budget.
6. **Raster validation:** page integrity, technical metadata, ordering, and checksums.
7. **Package validation:** completeness, separation, manifest accuracy, and release policy.

### 8.2 Required consistency domains

The engine must validate:

- borrower identity, aliases, co-borrower relationships, and address history;
- employer identity, position, start dates, pay periods, and employment status;
- base, variable, bonus, commission, self-employment, and other income;
- asset ownership, account masking, balances, deposits, withdrawals, and reserves;
- liabilities, balances, payment amounts, ownership, and payoff treatment;
- loan amount, product, term, occupancy, purpose, interest rate, and payment terms;
- purchase price, earnest money, seller credits, closing costs, and cash to close;
- property address, legal description, type, units, occupancy, and appraised value;
- application, document, statement, purchase, appraisal, disclosure, and closing dates;
- PITIA components and total;
- housing ratio and back-end DTI using the scenario's declared canonical definitions;
- LTV and CLTV using declared loan and value inputs;
- bank and asset running balances, including every posted transaction;
- document chronology and permissible lookback periods;
- all repeated values across documents and package metadata.

The renderer validates declared expected values but does not replace Velocity's underwriting engine. Canonical formulas, rounding modes, input provenance, and units must be recorded so independent evaluators can compare results without ambiguity.

### 8.3 Rule outcomes

Rules return `pass`, `warning`, or `error`. Errors block release. Warnings require an allowlisted rationale and reviewer disposition. Suppression by free-form text is prohibited.

Intentional contradictions used for advanced validation packs must be declared in the scenario with expected detection behavior. Undeclared contradictions are errors.

### 8.4 Evidence and auditability

Every rule result must identify the rule version, relevant canonical paths, affected documents and fields, expected and observed normalized values, and safe remediation guidance. Validation evidence must contain no secret or non-synthetic personal information.

## 9. Configuration Architecture

Configuration is immutable for a generation run and resolved before Stage 1. The effective configuration and every library version must be fingerprinted in the package manifest.

### 9.1 Required profiles

- **Difficulty level:** maps the package to the Document Bible's clean, typical, poor-OCR, conflict, or stress tier and establishes global limits.
- **Institution profile:** defines permitted categories, diversity targets, issuer capabilities, regional behavior, and identity versions.
- **Template version:** pins every document family and semantic contract.
- **OCR profile:** defines target readability, expected recognition challenges, protected regions, and measurable difficulty goals; it does not run OCR.
- **Artifact profile:** defines artifact layers, intensity ranges, compatibility rules, and page variation.
- **Output resolution:** defines physical page dimensions, target DPI, orientation, and per-page exceptions.
- **Raster quality:** defines color space, bit depth, interpolation, encoding preparation, and compression targets.

### 9.2 Precedence

Configuration should resolve in this order, from least to most specific:

1. architecture defaults;
2. validation-pack profile;
3. difficulty profile;
4. institution and template constraints;
5. document-family profile;
6. page-specific approved override.

An override may narrow a constraint but may not violate constitutional, safety, or consistency requirements. The resolved value and its source must be recorded.

### 9.3 Seed hierarchy

A root seed must derive stable sub-seeds for scenario, institution, document, layout, page, and artifact decisions. Adding an unrelated document should not unexpectedly rerandomize existing documents. Seed derivation must be versioned.

### 9.4 Environment separation

Configuration must distinguish development, validation, and controlled release environments without changing logical scenario truth. Secrets must never be embedded in profiles, manifests, seeds, document metadata, or output filenames.

## 10. Error Handling and Observability

Each stage must emit structured, safe events containing run ID, correlation ID, stage, component version, rule or error code, severity, and timing. Events must not contain rendered document contents, synthetic signatures, hidden ground truth, or any credentials.

Stage failures must be explicit and resumability must be conservative. A run may resume only from a verified immutable checkpoint whose inputs and configuration hashes still match. Packaging must never include partial or failed artifacts.

Metrics should cover throughput, stage latency, validation failures, artifact distribution, raster characteristics, layout overflow, package completeness, and deterministic replay success.

## 11. Storage and Artifact Lifecycle

An implementation must separate:

- immutable canonical scenarios;
- approved library assets and versions;
- pristine semantic intermediates;
- artifact-enhanced intermediates;
- rasterized test documents;
- private ground truth and provenance;
- release packages and validation reports.

Access to hidden ground truth must be more restrictive than access to test packages. Retention, deletion, encryption, and audit policies must be configurable by artifact class. Temporary intermediates must have explicit expiration and must not be placed in application data stores by default.

## 12. Future Extensibility

### 12.1 New document types

Add a versioned semantic template, field bindings, continuation behavior, layout variants, institution capabilities, validation rules, OCR matrix entries, and ground-truth mappings before activation.

### 12.2 New institutions

Add a fictional approved identity, category metadata, capabilities, multiple independent layouts, legal-language style, OCR characteristics, and safety review. Institution additions must not require changes to canonical scenario logic.

### 12.3 New layouts

Register a structurally independent layout against an existing template and compatible institution family. New layouts must pass overflow, pagination, visual, artifact, and cross-document validation.

### 12.4 New artifact profiles

Add versioned layers or compositions with parameter schemas, compatibility rules, protected-region behavior, difficulty mappings, replay tests, and plausibility review.

### 12.5 International lending

Extend contracts with locale, language, script, currency, address, date, tax, identity, privacy, and jurisdictional disclosure models. International support must be introduced through profiles and versioned schemas, not country-specific conditionals scattered across engines.

### 12.6 Commercial lending

Add entity, guarantor, ownership, rent-roll, operating-statement, collateral, covenant, and commercial appraisal models while retaining the same staged pipeline and provenance requirements.

### 12.7 HELOC

Support revolving terms, draw periods, repayment periods, line limits, combined liens, variable-rate indices, margins, and HELOC-specific disclosures through new canonical and template extensions.

### 12.8 Construction loans

Support budgets, draws, inspections, retainage, interest reserves, completion milestones, conversion terms, builders, and project chronology without coupling those concepts to artifact or raster engines.

## 13. Implementation Sequence

A future implementation should proceed in bounded increments:

1. Define contracts, versioning, seed hierarchy, and validation rule format.
2. Implement canonical scenario and ground-truth engines with no rendering.
3. Implement institution, template, layout, and population resolution for one clean document family.
4. Add pre-artifact consistency validation and provenance.
5. Add artifact layers individually with deterministic replay and protected-region tests.
6. Add rasterization and technical image validation.
7. Add packaging, checksum, release, and ground-truth separation controls.
8. Expand document families and institutions only after the vertical slice passes enterprise quality gates.

Large numbers of templates must not precede stable contracts, validation, and deterministic replay.

## 14. Required Quality Gates

Before any renderer implementation is considered production-ready, it must demonstrate:

- identical logical and raster output for identical pinned inputs and seeds;
- no mutation of canonical truth after scenario approval;
- complete field-level provenance and ground-truth coverage;
- zero unresolved cross-document validation errors;
- independent institution, template, and layout selection;
- credible artifact combinations at every supported difficulty;
- correct raster page order, dimensions, resolution, and checksums;
- strict separation of public test package and hidden engineering truth;
- safe synthetic identities and noninfringing visual assets;
- backward-readable manifests and explicit migration for breaking versions;
- failure isolation with no partial-package release;
- conformance with all three governing enterprise document references.

## 15. Governance

This architecture is a permanent engineering reference. All future document-rendering implementations must use the Enterprise Document Bible for constitutional quality rules, the Enterprise Template Library for document-family behavior, the Enterprise Institution Library for issuer identities and diversity, and this architecture for generation stages and component boundaries.

No implementation may collapse canonical truth, population, artifacts, and rasterization into an untraceable operation. No renderer may invent production-facing templates, institutions, layouts, or artifact behavior outside the governing specifications. Architectural changes require versioned documentation, compatibility assessment, deterministic validation coverage, and review before implementation.

