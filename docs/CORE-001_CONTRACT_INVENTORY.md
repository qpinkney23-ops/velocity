# CORE-001 Contract Inventory

Task: `CORE-001-PREP`  
Branch inspected: `enterprise-v1-lock`  
Capability: `CORE-001 — Canonical Enterprise Data Contracts`  
Scope: Read-only implementation inventory; no capability status change and no mortgage-policy proposal.

## 1. Executive finding

Velocity does not currently have one production data contract. The closest canonical candidate is `lib/ai/applicationAnalysisSchema.ts`, especially `ApplicationAnalysisResult` and its constituent types. It is the most complete typed representation of documents, evidence, borrower fields, normalized financial values, conflicts, conditions, decisions, workflow, and readiness. However, it is not the live persisted contract: the interactive application route returns a different scan shape, the application detail page defines and persists its own local shapes, the background rules worker writes another decision artifact, and the report layer widens/reinterprets several values.

The safest CORE-001 start is therefore contract extraction and compile-time adoption—not a persisted-data migration and not a whole-repository rewrite. First establish small shared primitives and non-transforming compatibility parsers around current behavior. Do not change calculations, field precedence, Firestore writes, statuses, or route payloads in the first slice.

## 2. Inspection scope and method

The audit inspected all tracked application/source surfaces returned by `rg --files` under `app/`, `components/`, `lib/`, and `scripts/`, plus `package.json`, `firestore.rules`, `storage.rules`, `middleware.ts`, `vercel.json`, and the five governing documents. Detailed contract tracing focused on every exported/local type, Firestore/Storage producer, API request/response, worker state write, report normalizer, UI calculation, and regression fixture. Generated `.next`, dependencies in `node_modules`, binary assets, fonts, and the sample PDF were inventoried as repository artifacts but not treated as source contracts. Backup `*.bak` files were not treated as production producers.

No `AGENTS.md` exists in the inspected repository. The working tree was clean before this document was created.

## 3. Persistence map

| Store/path | Observed shape and producers | Consumers | Contract assessment |
|---|---|---|---|
| Firestore `users/{uid}` | Registration writes `{email, name, role: "processor", createdAt, updatedAt}` in `app/auth/register/page.tsx`. | Firestore rules read `role`; UI auth uses Firebase Auth user rather than a typed profile. | Persisted, unversioned, partial. No exported `UserProfile`; no tenant ID; user can update own document under current rules, including role. High migration/security risk. |
| Firestore `underwriters/{id}` | `app/underwriters/page.tsx` writes `{name,email,active,createdAt}`. | Application list/detail, queue, dashboard/admin use several local `Underwriter` shapes. | Persisted, duplicated, unversioned. Relationship to `users` is absent/unknown. Medium-high migration risk. |
| Firestore `applications/{id}` | Created by `app/applications/new/page.tsx`; mutated by detail, queue, admin and both workers. | Nearly every operational page, workers, and client report request. | De facto operational system of record but entirely implicit, unversioned, and written by unrelated producers. Very high migration risk. |
| Storage `applications/{applicationId}/...` | Detail page uses `{timestamp}_{name}` and `lib/storage.ts` uses `{timestamp}__{name}`. | Detail UI, analyze route via submitted URL, files worker via separate `objectPath`. | Persisted binary path with two naming conventions and no tenant prefix. Metadata shapes compete. High migration/security risk. |
| Firestore `companyProfiles/{id}` | No normal producer found; worker expects `rulePackId`. | AI/rules worker. | Persisted implicit shape, tenant-like configuration but not an actual ownership contract. Unknown authority; high risk. |
| Firestore `rulePacks/{id}` | No normal producer found; worker expects `{rules, rulePackVersion}`. | AI/rules worker. | Persisted implicit policy/config contract; unvalidated and only partially versioned. Very high policy/migration risk. |
| Firestore `programs/{id}` | Debug overlay route reads/updates `activeOverlayId`; producer not present. | AI/rules worker and debug overlay route. | Persisted implicit/unversioned shape. High risk. |
| Firestore `overlays/{id}` | Debug route writes overlay metadata and rules. | AI/rules worker. | Persisted debug-produced configuration; version is a string field but schema is unvalidated. High risk. |
| Firestore `debug_pings/{id}` | `app/firebase-test/page.tsx`. | Test page only. | Diagnostic, not a production domain contract. |

There is no observed persisted tenant record, borrower collection, co-borrower collection, document collection, job collection, audit-event collection, or report-artifact collection. Those concepts are embedded in applications, derived in UI, represented only in memory, or absent.

## 4. Contract inventory

Classification terms: **authoritative candidate** means closest available typed domain shape, not proven production authority; **operational** means currently persisted/consumed in live UI; **derived** means recalculated/projected; **duplicated** means a competing representation exists; **legacy** follows an explicit code comment; **unknown** means authority cannot be proven from implementation.

### 4.1 Tenants, users, roles, and underwriters

| Contract/shape | Exact path; symbol/function | Producer → consumers | Persistence/authority | Incompatibilities and migration risk |
|---|---|---|---|---|
| Tenant/company profile | `app/api/worker/ai/process/route.ts`; inline `company` read and `companyProfileId` application field | External/unknown producer → rules worker | `companyProfiles/{id}`; unknown | Only `rulePackId` is assumed. No tenant ownership appears on users, applications, Storage, rules, reports, or APIs. `companyProfileId` behaves as rule configuration, not proven tenant ID. Very high risk. |
| User role enum | `lib/roles.ts`; `UserRole`, `ROLE_LABELS`, `PAGE_ACCESS` | Static module → intended navigation/access consumers | Not persisted itself; authoritative candidate for role vocabulary | Sidebar duplicates `Role` without `processor`; registration/rules persist arbitrary strings. `PAGE_ACCESS` omits queue/admin/upload. Medium risk. |
| User profile | `app/auth/register/page.tsx`; `onRegister` inline write | Registration → Firestore rules/admin intent | `users/{uid}`; operational implicit | No type/schema/version/tenant/status. `createdAt`/`updatedAt` are Firestore timestamps; Auth `User` is a separate identity shape. High risk. |
| Auth context | `components/auth/AuthProvider.tsx`; local `AuthCtx`; duplicated in `app/(dashboard)/layout.tsx` | Firebase Auth listener → UI | Memory only; duplicated derived | Contains only `User|null`, loading, logout; no role or tenant. Low data migration risk, medium integration risk. |
| Sidebar role | `components/sidebar/Sidebar.tsx`; local `Role = admin|underwriter|loan_officer` | Component props → navigation | Memory only; duplicated | Missing `processor`, incompatible with `UserRole`. Low migration/high authorization-confusion risk. |
| Underwriter directory | Local `Underwriter`/`UnderwriterDoc` in application detail/list, queue, admin; untyped `any[]` in underwriters page | Underwriters page writes → multiple UI readers/assignment | `underwriters/{id}`; operational | Optional fields vary; detail/queue duplicate identity; no user UID, role, tenant, capacity, or updated timestamp. High migration risk if linked to user accounts. |

### 4.2 Applications, borrowers, co-borrowers, documents

| Contract/shape | Exact path; symbol/function | Producer → consumers | Persistence/authority | Incompatibilities and migration risk |
|---|---|---|---|---|
| Initial application | `app/applications/new/page.tsx`; `onCreate` inline payload | New application form → all application readers | `applications/{id}`; operational seed | Writes `borrowerName,email,loanAmount,status:"New",underwriterId:"",notes:"",createdAt,updatedAt`. No schema/version/tenant/loan number. High risk because later producers append unrelated fields. |
| Detail application | `app/applications/[id]/page.tsx`; local `AppDoc` | Snapshot cast from Firestore → detail UI and write handlers | `applications/{id}`; operational but partial | Omits worker fields, rule artifacts, `companyProfileId`, `objectPath`, `decision`; `conditions:any[]`; timestamps `any`. Very high risk. |
| List/dashboard/admin/queue applications | Local `AppRow`/`AppDoc` in `app/applications/page.tsx`, `app/dashboard/page.tsx`, `app/admin/page.tsx`, `app/queue/page.tsx`, `app/borrowers/page.tsx` | Same Firestore docs → local calculations/views | Derived local projections | Each defines different optional subset and status assumptions. Queue declares `borrowerProfileVerified?: boolean` while detail persists `Record<string,boolean>`. High regression risk. |
| Borrower normalized profile | `lib/ai/applicationAnalysisSchema.ts`; `BorrowerProfile`, `BorrowerProfileField`, `ApplicationFieldKey` | `buildBorrowerProfile` in `analyzeApplication.ts` → analysis result/regressions | Memory unless caller persists; authoritative candidate | Rich provenance/candidates, but no co-borrower array, stable party ID, manual actor, or Firestore timestamp representation. Medium-high migration risk. |
| Persisted borrower profile | `app/applications/[id]/page.tsx`; local `BorrowerProfileFS`, `BorrowerProfileField`, `BorrowerProfileFlat` and scan-save handlers | Analyze response/UI merge → application detail/UI | `applications/{id}.borrowerProfile` plus flattened root fields; operational/duplicated | Field wrapper is `{value:any,status?,source?,updatedAtMs?}`, incompatible with domain `BorrowerProfileField`. Separate `borrowerProfileVerified` map. Root `borrowerName,email,loanNumber,loanAmount` are another copy. Very high risk. |
| Borrower directory row | `app/borrowers/page.tsx`; `BorrowerRow` | Client groups applications by lowercased email/name → borrower page | Not persisted; UI-derived | Borrower identity is heuristic grouping, not a stable borrower ID. No co-borrower support. High correctness risk. |
| Co-borrower | `app/applications/[id]/page.tsx`; only `ScanResult.extracted.coBorrower?` | No observed route producer → scan UI shape | Not persisted as canonical party | Absent from `ApplicationFieldKey`, `BorrowerProfile`, normalized metrics, initial app, reports, and workers. Authority unknown; very high future migration risk. |
| Storage helper document | `lib/storage.ts`; exported `UploadedDoc`, `uploadApplicationFile`, `listApplicationFiles` | Helper upload/list → potential callers (detail implements its own upload instead) | Storage object; memory return | `{name,fullPath,downloadURL}` conflicts with persisted `StoredDoc`. Double-underscore naming differs. Medium risk. |
| Persisted detail document | `app/applications/[id]/page.tsx`; local `StoredDoc`; `handleUpload` | Detail upload → `.storedDocs`, analyze request, document UI | `applications/{id}.storedDocs[]` and Storage | `{name,url,path,uploadedAtMs}` lacks ID, checksum, type, size, tenant, page count, version, status. Deletion can desynchronize object and metadata. High risk. |
| Worker document pointer | Files worker inline `objectPath`; `.extractedTextCombined`, `.extractor`, `.fallbackUsed` | Unknown queue producer → files/rules workers | Root fields on `applications/{id}` | Separate from `storedDocs`; worker assumes one `objectPath`. No typed link to document. Very high incompatibility risk. |

### 4.3 OCR, extraction, evidence, and provenance

| Contract/shape | Exact path; symbol/function | Producer → consumers | Persistence/authority | Incompatibilities and migration risk |
|---|---|---|---|---|
| OCR result | `lib/ocr.ts`; `OcrEngine`, `OcrConfidence`, `OcrInputType`, `OcrPageResult`, `OcrResult`, `runOcr` | `runOcr` → analyze route and OCR regressions | Memory; typed authoritative candidate for current OCR | Always reports one page; confidence 0–1 heuristic; provider enum includes unimplemented engines; PDF direct extraction collapses whitespace. Medium risk. |
| OCR child result | `scripts/velocityOcrChild.ts`; inline JSON `{ok,text,confidence}`; probe `TesseractProbeResult` duplicated in two scripts | Child process → `parseLastJsonLine` | Process boundary only; unvalidated | Parsed as `any`, last JSON line wins, raw Tesseract confidence may be 0–100 then normalized. Medium risk. |
| Route OCR diagnostics | Analyze route inline response and detail-local `AnalyzeResponse.runtimeDocDebug`, `ScanDiagnostics` | Analyze route → detail UI → persisted within `.scan.diagnostics` | Persisted indirectly/unversioned | Duplicated debug arrays; string-widened engine/type/label; error fallback differs from `OcrResult.pages`. Medium-high risk. |
| Extraction document | `lib/ai/applicationAnalysisSchema.ts`; `ParsedAnalysisDocType`, `ParsedAnalysisDocExtracted`, `ParsedAnalysisDoc` | `extractFields`/fixtures/adapters → `analyzeApplication` | Memory; authoritative candidate | Document types omit several real mortgage doc classes; no document ID/page evidence; text is whole-document. Medium risk. |
| Extraction result | `lib/extractFields.ts`; local `ExtractedFields`, local `ParsedLiability`, exported `extractFieldsFromBuffer` inferred return | PDF parser → scripts/possible callers | Memory only | Types are not exported and duplicate schema types; return lacks parser/version/confidence/pages/errors. Local liability lacks source document fields. High consolidation risk. |
| Route-local extraction | `app/api/applications/[id]/analyze/route.ts`; `pick*`, classifier/builders, inline `extracted` response | Analyze route → detail UI persistence | `.scan.extracted`, `.borrowerProfile`, root app fields | Does not call `extractFieldsFromBuffer` or `analyzeApplication`; omits liabilities, sets assets/debts/propertyValue null, and uses route-specific identity handling. Very high risk. |
| Evidence reference | `applicationAnalysisSchema.ts`; `EvidenceReference`, `ConditionEvidence`; `createEvidence` in `analyzeApplication.ts` | Deterministic engine → borrower fields/conflicts/conditions/result | Memory in current production path | IDs are generated from content seeds; page usually unavailable; no document stable ID/region/hash/extraction version. Best current provenance shape, medium-high evolution risk. |
| UI source confidence | Detail page local `SourceConfidence`, `SourceConfidenceMap` and conversion helpers | Analyze response/borrower profile → UI/scan persistence | `.scan.sourceConfidence`; derived/duplicated | Capitalized confidence labels versus domain lowercase; summary reason is UI-derived; not a complete evidence object. Medium risk. |

### 4.4 Income, assets, liabilities, credit, PITIA, DTI, and LTV

| Contract/shape | Exact path; symbol/function | Producer → consumers | Persistence/authority | Incompatibilities and migration risk |
|---|---|---|---|---|
| Financial extracted fields | `ParsedAnalysisDocExtracted`, `NormalizedMetrics`, `BorrowerProfile` in schema | Extraction + `buildNormalized` → analysis | Memory unless adapted | `income`, `assets`, `debts`, loan/property values are bare `number|null`; unit/time basis/currency absent. `debts` means monthly debt in engine usage but name is ambiguous. Very high semantic risk. |
| Liability | Schema `ParsedLiability`; duplicated local type in `extractFields.ts` | Extraction → `buildLiabilityDecision`, DTI scenarios/action plan | Memory; candidate | Balance/payment are numbers, source vocabulary fixed, inclusion/review booleans; no liability ID, borrower owner, currency, verified status, remaining term, or explicit rule version. High risk. |
| Credit | `creditScore:number|null` in extracted/profile/normalized shapes; score collection functions in `analyzeApplication.ts` | Documents → representative score → factors/decision | Memory; derived | Multiple scores are extracted from text internally but canonical contract retains one score and evidence/candidates. Route only extracts one score. Credit worker rules use text matches rather than this shape. High risk. |
| DTI/LTV | Schema `ApplicationFieldKey`, `BorrowerProfile`, `NormalizedMetrics`; functions `computeDTI`, `computeTotalDTI`, `computeLTV` | Deterministic engine → decision/readiness/report/regressions | Memory; derived candidate | Engine ratios are fractions (e.g. 0.43). Report `safePercent` converts fractions to percentage points (43); detail UI types do not encode units; report route may accept either request value. Very high risk. |
| PITIA/housing payment | Internal functions `estimateMonthlyPrincipalAndInterest`, taxes, insurance, MI, `estimateProposedHousingPayment` in `analyzeApplication.ts`; report `HousingPaymentBreakdown` | Analysis factors/normalized access → report builder → PDF/UI | Mostly derived; report-only contract | Not present in `NormalizedMetrics`; report reconstructs breakdown using its own constants and accepts extracted proposed payment. Two calculation sites and coded assumptions can diverge. Very high mortgage-policy/regression risk. |
| Report financials | `lib/ai/buildUnderwritingReport.ts`; `UnderwritingReport.financials`, `HousingPaymentBreakdown` | `buildUnderwritingReport` → renderer, report route, report regression | Memory/request response; derived | Missing values become `0` for income/assets/loan/value; optional/null differs from detail-local report types; DTI/LTV become percentage points. High risk of false-zero and unit confusion. |
| UI financial derivations | Detail helpers, dashboard/queue/admin `money`, queue score/workload, condition/readiness fallbacks | Firestore/scan → display and queue behavior | UI-only derived | Multiple zero fallbacks, local rounding, queue `loanAmount >= 500000`, and client-built readiness/condition summaries. Not canonical. High behavior-regression risk. |

### 4.5 Conditions, decisions, readiness, workflow, and assignment

| Contract/shape | Exact path; symbol/function | Producer → consumers | Persistence/authority | Incompatibilities and migration risk |
|---|---|---|---|---|
| Legacy analysis condition | Schema `AnalysisCondition`, severity/source/status enums; `ApplicationAnalysisResult.conditions` explicitly commented legacy | Deterministic engine → regressions/report normalizer | Memory; explicit legacy | Status `open|done|waived|reopened`; canonical lifecycle uses six different values. Label versus title/summary. High migration risk. |
| Canonical condition | Schema `VelocityCondition` and enums | `buildCanonicalConditions` → analysis/readiness/report regressions | Memory in deterministic path; authoritative candidate | Richest condition shape, but optional timestamps are ISO strings and ID stability depends on generation inputs. Current live UI does not persist it as its canonical condition set. High migration risk. |
| Route scan condition | Analyze route inline `{label,severity,evidence?}`; detail `ScanCondition` | Route → `.scan.conditions` → UI condition merge | Persisted inside scan; duplicated | No ID/status/source/owner/lifecycle. Conditions gain identity later in UI using generated keys/timestamps. Very high unstable-identity risk. |
| UI underwriting condition | Detail local `UWCondition` and client merge/lock helpers | Scan/profile/manual actions → `.uwConditions` and duplicate `.conditions` | Persisted operational | Only `open|done`; source only `ai|borrower_profile|manual`; millisecond timestamps; lacks canonical owner/category/actions. Both fields are written with same array but other producers may differ. Very high risk. |
| Detail canonical workflow condition | Detail local `CanonicalWorkflowCondition` | Optional analyze payload → scan/UI/report request | Persisted only within `.scan.canonicalConditions` when present | Nearly every field optional/string-widened, unlike `VelocityCondition`. Current analyze route does not produce it. High risk. |
| Final deterministic decision | Schema `FinalDecisionState`, `FinalDecision`; `computeDecision` | Deterministic engine → analysis/regressions/report | Memory; authoritative candidate | States `approved|approve_with_conditions|blocked|denied`. Not the application status and not the worker decision vocabulary. High risk. |
| Interactive scan AI decision | Detail `ScanResult.ai`; analyze route inline payload | Analyze route → `.scan.ai`, UI/report request | Persisted operational/unversioned | Route emits `review_required`, risk, confidence, score, null DTI/LTV; all fields optional in UI. Incompatible with `FinalDecision`. Very high risk. |
| Rules-worker decision artifacts | AI worker local `Rule`; inline `decisionArtifactPublic`, `decisionArtifactRaw` | Worker → root `.decision` and artifacts | Persisted operational/unversioned artifact shape | Decision `pass|conditional|fail`; conditions/findings/blockers are rule match objects, not `VelocityCondition`; public duplicates `matchedFindings` as `findings`; raw timestamp is Firestore, public ISO. Very high risk. |
| Readiness | Schema `ReadinessState`, `computeReadinessState` | Deterministic canonical conditions/decision → result/regressions | Memory in engine; candidate | Report widens labels to `string`; detail makes all fields optional and has client fallback derivation; report route invents `needs_review`/`review`, outside schema enums. High risk. |
| Application workflow status | `lib/workflow.ts`; `APP_STATUSES`, `AppStatus`, transition functions | Detail status UI → `.status`; lists/queue | Persisted operational string | Title-case states differ from `WorkflowStage`, processing stages, and decisions. Detail `saveStatus` writes draft directly in observed block; server validation is absent. Queue also treats `completed` as terminal though not in enum. High risk. |
| Analysis workflow | Schema `WorkflowStage`, `WorkflowState`, `computeWorkflow` | Deterministic engine → result | Memory only | Lowercase stages differ from application status and processing stages. No shared transition contract. High risk. |
| Assignment | Application fields `underwriterId`, optional `underwriterName`; queue/detail write handlers | Client UI → application | Persisted operational | Detail writes only ID; queue writes ID and denormalized name. No assignment ID, actor, time, rationale, tenant, or history. High audit/migration risk. |

### 4.6 Processing jobs, audit events, and reports

| Contract/shape | Exact path; symbol/function | Producer → consumers | Persistence/authority | Incompatibilities and migration risk |
|---|---|---|---|---|
| Processing stage/job | Files and AI worker routes; inline `processingStage`, `workerLease`, timestamps/errors | Unknown enqueuer + workers + cron | Root fields on application; operational implicit | Stages `parsing|parsing_failed|analyzing|ai_completed`; lease `{holder,stage,claimedAt,expiresAt}` duplicated in both routes. No job ID, attempts, document ID, schema version, heartbeat, dead letter. Very high risk. |
| Worker errors | `errToObj`, `.parsingError`, `.lastError`, `.error`, release reason | Workers → application/admin diagnostics | Persisted implicit | Error shapes differ (object versus string), may include stack, and successful conditional states can carry failure meaning. High risk. |
| Audit event | No domain type/collection found. Scattered `createdAt`, `updatedAt`, `uploadedAtMs`, processing timestamps, condition timestamps, lease release fields | Many producers → local display/debug | Embedded timestamps only | No actor, action, reason, before/after, correlation, immutability, or tenant. Not an audit ledger. Very high risk. |
| Report contract | `lib/ai/buildUnderwritingReport.ts`; exported `UnderwritingReport`, `HousingPaymentBreakdown`, `WorkflowReadinessReport`, `CanonicalWorkflowReportCondition` | Builder → PDF renderer/report route/regression | Memory; derived projection | String-widens enums, loses condition evidence/status, uses zero defaults, percentage-point conversion, and independently estimates PITIA. High risk. |
| Detail report contract | `app/applications/[id]/page.tsx`; local `UnderwritingReport`, `HousingPaymentBreakdown`, `ReportFactor` | Report/analyze payload → detail UI | `.scan.report` if supplied; current analyze returns null | Incompatible nullability: LTV/debts/DTI required numbers versus library nullable; omits workflow/readiness/canonical conditions. High risk. |
| Report API boundary | `app/api/applications/[id]/report/route.ts`; route-local `normalizeWorkflowPayload`, `mergeWorkflowIntoReport` | Unvalidated client body → builder/renderer | Not archived; PDF response only | Accepts `any`, accepts existing report wholesale, chooses among body locations, defaults invalid readiness to new strings/zero, and reinterprets conditions. Very high risk. |
| PDF artifact | `renderUnderwritingPdf` | Report object → HTTP bytes | Not persisted | Generation time is locale string inside PDF; no report/schema/engine/package version, checksum, immutable ID, or archive metadata. High risk. |

## 5. Cross-cutting incompatibility register

### Competing schemas

1. Application: initial inline payload, detail `AppDoc`, list/dashboard/admin/queue/borrower local projections, and worker implicit root fields.
2. Borrower: root application fields, `.scan.extracted`, `.borrowerProfile`, `.borrowerProfileVerified`, deterministic `BorrowerProfile`, and client-derived borrower directory.
3. Document: `UploadedDoc`, `StoredDoc`, request `documents/storedDocs`, and worker `objectPath` plus root extracted text.
4. Analysis: route `AnalyzeResponse`/`ScanResult`, deterministic `ApplicationAnalysisResult`/`AnalysisResult`, and rules-worker decision artifacts.
5. Conditions: `ScanCondition`, `AnalysisCondition` (legacy), `VelocityCondition`, `UWCondition`, string arrays in AI/report, and rule-match condition objects.
6. Decisions: deterministic `approved|approve_with_conditions|blocked|denied`; interactive `review_required`; worker `pass|conditional|fail`; application `Approved|Denied` status.
7. Workflow: application status, analysis `WorkflowStage`, processing stage, readiness label, and client approval-path derivations.
8. Reports: library report, detail-local report, arbitrary existing report accepted by route, and PDF display projection.

### Duplicated enums

- Roles: `UserRole`, sidebar `Role`, arbitrary persisted role string.
- Status/stage: `AppStatus`, `WorkflowStage`, processing strings, queue-only `completed` handling.
- Condition severity/status/source: canonical and legacy schema enums, route/UI subsets, worker `info|warn|error`.
- Decision states and readiness strings as listed above.
- Confidence: lowercase OCR/domain values, capitalized UI labels, raw numeric Tesseract scale.

### Duplicated calculations and reinterpretations

- Route extraction duplicates `extractFields.ts` and does not use its liability/debt logic.
- DTI/LTV/PITIA logic exists in `analyzeApplication.ts`; report builder searches factors and independently estimates housing components.
- Detail page merges/deduplicates/locks conditions and derives readiness/approval state client-side.
- Dashboard/queue/admin/borrower pages independently default, aggregate, rank, round, and infer file completeness.
- Report builder converts ratio fractions to percentage points; UI types do not encode the unit.

### Boundary and persistence weaknesses

- Analyze and report request bodies are parsed as `any`; no schema validation, size/field allowlist, tenant ownership, or version negotiation.
- Firestore snapshots are routinely spread/cast from `any`; writes are inline and unvalidated.
- Persisted application, scan, borrower profile, condition, worker, and decision artifacts have no schema version.
- Optional properties, `any`, empty strings, zero defaults, `null`, missing fields, and deleted fields all express “unknown” differently.
- Money lacks currency and basis; income lacks monthly/annual basis; debts is semantically ambiguous; percentages alternate between fractions and percentage points.
- Condition identity is unstable across route/UI conversion and deduplication; canonical IDs are not the operational persisted IDs.
- Reports accept and merge caller-provided report/workflow data and can create false zeros or out-of-enum readiness values.
- Tenant ownership is absent from paths and contracts. `companyProfileId` cannot safely be assumed to be tenant identity.

## 6. Recommended canonical starting point

Use `lib/ai/applicationAnalysisSchema.ts` as the **source material closest to canonical v1**, not as a drop-in production contract. Preserve these concepts: `ParsedAnalysisDoc`, `EvidenceReference`, `BorrowerProfileField`, `BorrowerProfile`, `VelocityCondition`, `ReadinessState`, `FieldConflict`, `FinalDecision`, `WorkflowState`, `NormalizedMetrics`, and `ApplicationAnalysisResult`.

Before designating it canonical:

- add explicit contract/version discriminators;
- separate stable identity from display/source names;
- define money and ratio units without changing current numerical behavior;
- represent timestamps consistently at domain boundaries;
- introduce party/borrower identity capable of co-borrowers without forcing an immediate migration;
- reference stable document IDs in evidence;
- distinguish missing, unknown, not applicable, zero, and unverified;
- separate application workflow, processing job state, and underwriting recommendation vocabularies;
- keep legacy adapters for current condition, scan, and worker artifacts.

No mortgage thresholds, liability treatments, income rules, credit rules, PITIA assumptions, or decision mappings should be changed by CORE-001 unless separately sourced and approved.

## 7. Proposed `lib/contracts/` structure

```text
lib/contracts/
  primitives.ts          # ContractVersion, TenantId, IDs, ISO timestamps, Money, Ratio
  tenant.ts              # TenantRef and ownership envelope (shape only; SEC-002 enforces)
  identity.ts            # UserProfile, UserRole, UnderwriterProfile, assignment references
  party.ts               # ApplicantParty/borrower/co-borrower identities and roles
  application.ts         # ApplicationRecordV1 and application workflow state
  document.ts            # DocumentRecordV1, storage reference, processing linkage
  ocr.ts                 # OCR request/result/page/diagnostic contracts
  extraction.ts          # Parsed document, extracted candidates, confidence
  evidence.ts            # EvidenceReferenceV1 and provenance links
  financial.ts           # Income, asset, liability, credit, money/ratio/calculation inputs
  condition.ts           # Canonical condition and lifecycle
  decision.ts            # Recommendation/decision package output and readiness
  job.ts                 # ProcessingJobV1, lease, attempt, error
  audit.ts               # AuditEventV1 contract only
  report.ts              # ReportModelV1 and ReportArtifactMetadataV1
  api.ts                 # Versioned request/response/error envelopes
  adapters/
    legacyApplication.ts
    legacyScan.ts
    legacyConditions.ts
    legacyWorkerDecision.ts
    legacyReport.ts
  validators/            # Runtime parsers paired with each external/persisted boundary
  index.ts                # Public exports only
```

Do not create all modules in one initial change. The structure is a target boundary; slices below introduce it incrementally.

## 8. Safest migration sequence

1. **Freeze evidence:** capture representative current Firestore/application/scan/condition/worker/report fixtures and current regression output without changing behavior.
2. **Define primitives:** introduce version/ID/timestamp/money/ratio type conventions and document current runtime representations. Do not migrate persisted values.
3. **Extract shared leaf contracts:** move or re-export exact current OCR, uploaded document, role, application status, and analysis schema types behind `lib/contracts` without runtime changes.
4. **Add non-throwing read adapters:** parse legacy application/scan/condition/worker/report shapes into typed compatibility results that retain unknown fields and diagnostics.
5. **Migrate first consumer:** application list (read-only projection) consumes a legacy application adapter. It has a small field set and no writes.
6. **Migrate first producer:** new application creation uses an `ApplicationCreateV1` builder that emits byte-for-byte/current-shape-equivalent fields plus no new persisted version until fixtures prove compatibility.
7. **Adopt route response validation:** validate analyze response at its producer and consumer while keeping the current wire shape.
8. **Unify document metadata:** establish stable document IDs/adapters before changing Storage paths or worker `objectPath`.
9. **Adopt canonical analysis result:** connect the deterministic engine only after parity tests cover route scan behavior and approved compatibility decisions.
10. **Migrate conditions and decisions:** dual-read legacy shapes; write canonical only after ID/lifecycle/mapping questions are approved. Avoid long-term dual-write.
11. **Migrate reports:** consume a persisted/versioned analysis package; remove report reinterpretation only with golden PDF and ratio/PITIA parity evidence.
12. **Tenant/job/audit persistence:** coordinate with CORE-002, SEC-002, OPS-001, and AUDIT-001; CORE-001 defines contracts but must not silently implement ownership or policy.

### First producer and consumer

- **First consumer:** `app/applications/page.tsx` through a read-only `parseLegacyApplicationSummary` adapter. It reads a narrow projection (`id`, borrower/email, loan amount, status, underwriter, scan extraction, timestamps), making it the safest place to prove adapters without changing writes or underwriting behavior.
- **First producer:** `app/applications/new/page.tsx` only after the read adapter and fixture tests pass. A pure builder should preserve its current exact payload. Do not start with analyze, conditions, workers, or reports.

### Required compatibility adapters

1. Firestore timestamp/number/string-to-domain time adapter.
2. Legacy root application plus worker-field adapter.
3. `StoredDoc` ↔ document reference adapter; separately support `UploadedDoc` and `objectPath`.
4. `.scan.extracted`/`.borrowerProfile`/root borrower-field adapter preserving all candidates.
5. `ScanCondition` and `UWCondition` read adapters into a compatibility union; do not fabricate canonical owners/status/history.
6. Rules-worker `pass|conditional|fail` artifact adapter that retains its vocabulary rather than pretending it equals `FinalDecision`.
7. Ratio adapter explicitly tagging fraction versus percentage points.
8. Report adapter that records false-zero/default provenance until report semantics can be migrated.

## 9. Tests required before implementation

- Contract fixture snapshots for every observed Firestore collection/path and application variant.
- Compile-time type tests for enums, discriminated versions, nullability, money, ratios, and timestamp boundaries.
- Runtime validator tests for valid, missing, legacy, unknown-field, malformed, and future-version payloads.
- Adapter round-trip tests proving no loss of unknown legacy fields and no mutation of source data.
- Application summary adapter tests against current list/dashboard/queue/admin fixture variations.
- Exact initial application payload test before migrating the create producer.
- Analyze request/response contract fixtures, including OCR failure and ID-document cases.
- Condition identity/merge/hard-stop regression tests before any condition contract write change.
- DTI/LTV fraction-versus-percent tests and PITIA parity/golden tests before financial/report migration.
- Worker state/lease/error/decision artifact fixtures before job contract migration.
- Report model/PDF golden tests that detect false zeros, missing evidence, enum widening, and calculation drift.
- Firebase emulator tests for schema/version writes when persistence changes begin.
- Existing `velocity:dti`, `velocity:workflow`, `velocity:report`, `velocity:ocr`, and `velocity:check` must remain green for applicable slices.

## 10. Files that must not change in the first implementation slice

The first slice should not change:

- `lib/ai/analyzeApplication.ts`
- `lib/extractFields.ts`
- `lib/ocr.ts`
- `lib/ai/buildUnderwritingReport.ts`
- `lib/ai/renderUnderwritingPdf.ts`
- `app/api/applications/[id]/analyze/route.ts`
- `app/api/applications/[id]/report/route.ts`
- `app/api/worker/files/process/route.ts`
- `app/api/worker/ai/process/route.ts`
- `app/applications/[id]/page.tsx`
- `app/queue/page.tsx`
- `firestore.rules`, `storage.rules`, `middleware.ts`
- `package.json`, lockfiles, deployment/configuration files
- existing product documentation and capability status

The first slice should be limited to new contract/adapter/test files plus the one narrow read-only consumer only when its tests demonstrate identical rendered inputs.

## 11. Proposed CORE-001 implementation slices

1. **CORE-001-A — Legacy fixture freeze and contract test harness.** Capture de-identified/synthetic representations of every current persisted/wire shape. No application-code behavior changes.
2. **CORE-001-B — Contract primitives.** Add version, IDs, time, money, ratio, and validation-result primitives; document current units.
3. **CORE-001-C — Read-only application summary contract and adapter.** Parse current application projections without changing Firestore.
4. **CORE-001-D — Exact application-create contract/builder.** Migrate only new-application producer with byte-equivalent fixture proof.
5. **CORE-001-E — Document/OCR/extraction contracts.** Re-export/adapt current types; retain separate legacy document metadata paths.
6. **CORE-001-F — Evidence and borrower/party contracts.** Add stable references and co-borrower-capable party model without persistence migration.
7. **CORE-001-G — Financial calculation contracts.** Encode money/basis/ratio units and calculation provenance; no policy or formula changes.
8. **CORE-001-H — Condition/decision/readiness compatibility contracts.** Preserve distinct vocabularies and add explicit adapters after product mappings are approved.
9. **CORE-001-I — Job and audit contracts.** Define boundaries for OPS-001/AUDIT-001 without implementing their persistence.
10. **CORE-001-J — Report and API contracts.** Validate input/output and remove `any` incrementally after golden parity.
11. **CORE-001-K — Persisted versioning/migrations.** Only after all readers are compatibility-capable and CORE-002/SEC-002 dependencies are ready.

## 12. Exact dependency order

`CORE-001-A` → `CORE-001-B` → `CORE-001-C` → `CORE-001-D` → `CORE-001-E` → `CORE-001-F` → `CORE-001-G` → `CORE-001-H` → (`CORE-001-I` in coordination with OPS-001/AUDIT-001) → `CORE-001-J` → `CORE-001-K` in coordination with CORE-002 and SEC-002.

Do not begin persisted version migration (`K`) until every deployed reader supports legacy and versioned records and rollback has been tested.

## 13. Highest-risk regression points

1. Changing DTI/LTV between fractional and percentage-point representations.
2. Turning missing financial data into zero, or zero into missing.
3. Changing income/debt time basis or meaning of `debts`.
4. Changing PITIA constants, formula, MI/tax/insurance treatment, or extracted-versus-estimated precedence.
5. Weakening or duplicating hard-stop conditions during ID/status/source mapping.
6. Mapping worker `fail`/`conditional`/`pass` directly to underwriting decisions without approved semantics.
7. Mapping application status directly to analysis workflow or processing stage.
8. Losing manual conditions, verification flags, unknown legacy fields, or timestamp history.
9. Changing condition IDs and making resolved items reappear or duplicate.
10. Breaking Storage metadata/object paths or worker `objectPath` during document normalization.
11. Changing queue eligibility/priority because local optional fields are normalized differently.
12. Changing report contents through null/default/percentage normalization even when underwriting output is unchanged.
13. Adding tenant IDs without dual-read/authorization coordination, causing either data invisibility or cross-tenant leakage.

## 14. Unresolved product or mortgage-policy questions

These require product, mortgage SME, security, or operations decisions; implementation must not guess:

- Is `companyProfileId` a tenant identifier, a policy profile, or both? What is the permanent tenant ownership key?
- Is an underwriter always a `users/{uid}` member, or can the directory contain non-login assignees?
- What is the canonical party model for borrower, co-borrower, and multiple applicants, including field ownership?
- Is income stored annually, monthly, or as sourced components? What currency support is required?
- Does `debts` mean total monthly included liability payment, all observed monthly payment, balance, or another approved measure?
- Which ratio representation is canonical at rest and on APIs: fraction or percentage points?
- Which PITIA inputs may be estimated, which must be sourced, and which assumptions/configuration versions are approved?
- What authoritative sources and precedence govern income, assets, liabilities, credit scores, exclusions, and conflicts?
- How do `review_required`, `pass|conditional|fail`, `FinalDecision`, application status, and human final decision relate? No mapping is currently authoritative.
- Which condition lifecycle values, owners, waiver/reopen authority, stable-ID rules, and auto-clear rules are approved?
- What is the supported application and processing state machine, including retry, cancellation, exception, and closure?
- What report values may display zero versus blank/unknown, and which report becomes an issued immutable record?
- What schema/version retention and backward-compatibility window is required for integrations and historical decisions?

## 15. Recommended first coding slice

Implement only `CORE-001-A` plus the non-runtime part of `CORE-001-B`:

1. Add de-identified/synthetic fixture objects representing current initial application, detail application with scan/profile/conditions, worker parsing/analyzing/completed variants, rule artifacts, and report input/output.
2. Add `lib/contracts/primitives.ts` with compile-time-only branded IDs, `ContractVersion`, timestamp boundary aliases, and explicit `RatioFraction`/`PercentagePoints` names. Do not add conversion behavior yet.
3. Add contract tests that document the current shapes and fail if fields/enums/units drift unintentionally.
4. Do not change any producer, consumer, Firestore record, API payload, calculation, status, rule, condition, or report.

This is the smallest coherent change because it creates a reviewable vocabulary and regression baseline without asserting that any currently competing shape is already canonical. The next slice can then introduce the read-only application summary adapter with evidence that behavior remains identical.
