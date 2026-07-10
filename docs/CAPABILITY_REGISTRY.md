# Velocity Enterprise Capability Registry

Task: `PLAN-002`  
Target: Enterprise V1 Lock  
Registry size estimate: **39 major capabilities**. These are planning units; implementation may create smaller engineering tasks without changing the permanent IDs.

This registry is dependency-ordered. IDs are permanent and are never renumbered or reused. Status values are `Partial` or `Planned`; nothing in this registry is `LOCKED`. Mortgage-policy behavior requires approved rules or authoritative sources and is never inferred from this plan.

---

## CORE-001 — Canonical Enterprise Data Contracts

ID: `CORE-001`  
Title: Canonical Enterprise Data Contracts  
Category: CORE  
Priority: P0  
Status: Partial  
Customer Value: One consistent loan file across every screen and output.  
Business Value: Removes rework and creates a stable development/integration foundation.  
Problem Solved: Application, extraction, analysis, condition, readiness, and report shapes currently overlap and diverge.  
Description: Version canonical schemas, identifiers, nullability, provenance, and compatibility rules for tenant, user, application, document, evidence, normalized value, calculation, condition, decision, readiness, job, audit event, and report artifact.  
Dependencies: None.  
Likely Files: `lib/ai/applicationAnalysisSchema.ts`, `lib/workflow.ts`, new schema/migration modules, Firestore documentation.  
Acceptance Tests: Every production producer and consumer validates the same versioned contracts; invalid payloads fail closed; persisted legacy records have an explicit compatibility path.  
Regression Tests: Schema fixtures, round-trip serialization, backward-compatibility corpus, contract tests across UI/API/worker/report.  
Complexity: Very High  
Definition of Done: Contracts, ownership, versions, migrations, validators, and deprecation policy are implemented and documented.  
Lock Criteria: No competing production schema; all supported fixtures pass; architecture and QA approvals recorded.  
Evidence Required: Schema definitions, compatibility matrix, migration results, contract-test output, architecture sign-off.  
Notes: Foundation for all later capabilities.

## CORE-002 — Tenant-Scoped Application System of Record

ID: `CORE-002`  
Title: Tenant-Scoped Application System of Record  
Category: CORE  
Priority: P0  
Status: Partial  
Customer Value: A reliable, complete, isolated loan record.  
Business Value: Enables enterprise onboarding and eliminates competing state.  
Problem Solved: `applications` is operationally central but lacks enforced tenancy, versioning, and canonical write ownership.  
Description: Define tenant-scoped application identity, lifecycle, optimistic concurrency, authoritative fields, derived fields, and safe migration from current Firestore records.  
Dependencies: CORE-001.  
Likely Files: application pages, `lib/firebase*.ts`, Firestore rules/indexes, new repositories/services/migrations.  
Acceptance Tests: All reads/writes require tenant context; stale writes are detected; all views display the same canonical state.  
Regression Tests: CRUD, concurrency, migration, cross-tenant negative, realtime-view consistency tests.  
Complexity: Very High  
Definition of Done: Canonical repository/service owns application persistence and legacy records migrate safely.  
Lock Criteria: Zero cross-tenant access and zero state divergence in supported workflows.  
Evidence Required: Migration report, emulator tests, concurrency results, UI/API parity evidence.  
Notes: Does not define mortgage policy.

## CORE-003 — Production Route and Feature-Surface Integrity

ID: `CORE-003`  
Title: Production Route and Feature-Surface Integrity  
Category: CORE  
Priority: P0  
Status: Planned  
Customer Value: No dummy, missing, or misleading production behavior.  
Business Value: Prevents trust-damaging demonstrations and support incidents.  
Problem Solved: Dummy AI routes and references to absent watchdog/debug/upload routes create ambiguous behavior.  
Description: Inventory routes/features, classify production versus diagnostic, remove or isolate placeholders, and make unsupported features explicit.  
Dependencies: CORE-001.  
Likely Files: `app/api/**`, `app/debug/**`, `app/upload/**`, `vercel.json`, navigation/config.  
Acceptance Tests: Every linked/called production route exists, is authorized, and returns its documented contract; diagnostics are unavailable in production by default.  
Regression Tests: Route inventory, broken-link, environment-gating, production smoke tests.  
Complexity: Medium  
Definition of Done: Approved route catalog matches deployed behavior with no placeholder dependency.  
Lock Criteria: Production smoke suite passes and security/product approve the catalog.  
Evidence Required: Route matrix, deployment scan, smoke logs, approvals.  
Notes: Preserve useful diagnostics behind explicit controls.

## TRUST-001 — Evidence and Provenance Graph

ID: `TRUST-001`  
Title: Evidence and Provenance Graph  
Category: TRUST  
Priority: P0  
Status: Partial  
Customer Value: Users can verify where every material value and finding came from.  
Business Value: Differentiates Velocity on explainability and reduces review time.  
Problem Solved: Evidence exists in parts of the deterministic engine but is not uniformly persisted or displayed.  
Description: Persist document/page/region, extraction engine, candidate values, winning source, calculation inputs, rule/version, confidence, conflicts, and downstream effects.  
Dependencies: CORE-001, CORE-002.  
Likely Files: `applicationAnalysisSchema.ts`, `analyzeApplication.ts`, `extractFields.ts`, application detail UI, report modules.  
Acceptance Tests: Every material normalized value, condition, ratio, and decision factor has resolvable provenance; missing evidence is visibly unverified.  
Regression Tests: Evidence-link integrity, source-precedence, missing-source, derived-value lineage tests.  
Complexity: Very High  
Definition of Done: Provenance survives extraction through report/export without loss.  
Lock Criteria: Representative files have complete, reviewable lineage and no false source claims.  
Evidence Required: Trace screenshots, persisted fixtures, lineage test output, underwriting QA review.  
Notes: Required before decision lock.

## TRUST-002 — Canonical Conflict and Verification Workflow

ID: `TRUST-002`  
Title: Canonical Conflict and Verification Workflow  
Category: TRUST  
Priority: P0  
Status: Partial  
Customer Value: Conflicting borrower data is surfaced and resolved predictably.  
Business Value: Reduces incorrect decisions and manual searching.  
Problem Solved: Candidate conflicts are calculated but lack a complete persisted human verification lifecycle.  
Description: Add deterministic source precedence, conflict objects, verification status, authorized resolution, reason, evidence, and downstream recalculation.  
Dependencies: TRUST-001.  
Likely Files: `analyzeApplication.ts`, schema modules, application detail, audit service.  
Acceptance Tests: Conflicts never silently disappear; authorized resolution records actor/reason/evidence and deterministically recomputes dependent outputs.  
Regression Tests: Source precedence, conflicting identity/income/credit, override, reopen, concurrency tests.  
Complexity: High  
Definition of Done: Supported conflicts can be reviewed, resolved, audited, and reproduced.  
Lock Criteria: Underwriting QA signs off on conflict corpus and audit replay.  
Evidence Required: Test corpus, resolution records, before/after traces, QA approval.  
Notes: No new precedence rule without approval.

## TRUST-003 — Reproducible Decision Package

ID: `TRUST-003`  
Title: Reproducible Decision Package  
Category: TRUST  
Priority: P0  
Status: Planned  
Customer Value: A past result can be independently explained and reproduced.  
Business Value: Supports audits, disputes, support, and regulated change control.  
Problem Solved: Current results do not form one immutable package of inputs, versions, rules, assumptions, and outputs.  
Description: Create immutable, content-addressed/versioned decision packages with canonical inputs, evidence, configuration, engine/rule versions, outputs, and human actions.  
Dependencies: TRUST-001, TRUST-002.  
Likely Files: new decision-package service/schema, Firestore/Storage repositories, worker/analyze/report routes.  
Acceptance Tests: Replaying a package yields the same deterministic result or a documented version incompatibility; package mutation is rejected.  
Regression Tests: Replay, hashing, tamper, legacy-version, report-consistency tests.  
Complexity: Very High  
Definition of Done: Every authoritative analysis persists and references an immutable package.  
Lock Criteria: Golden package corpus reproduces exactly across clean builds.  
Evidence Required: Package manifests, hashes, replay logs, tamper tests, architecture/QA approval.  
Notes: Reports and integrations consume this artifact.

## SEC-001 — Server-Side Authentication and Session Enforcement

ID: `SEC-001`  
Title: Server-Side Authentication and Session Enforcement  
Category: SEC  
Priority: P0  
Status: Partial  
Customer Value: Protected loan data cannot be reached by unauthenticated callers.  
Business Value: Removes a critical enterprise blocker.  
Problem Solved: Client redirects and placeholder middleware do not secure server APIs.  
Description: Validate Firebase sessions server-side for pages/actions/APIs, standardize session expiry/revocation, CSRF controls where applicable, and secure Stripe/report/analyze routes.  
Dependencies: CORE-001, CORE-003.  
Likely Files: `middleware.ts`, `components/auth/**`, `lib/firebase-admin.ts`, `app/api/**`, new auth middleware.  
Acceptance Tests: Anonymous, expired, revoked, and forged credentials fail; authorized sessions succeed; no client-only bypass exists.  
Regression Tests: Auth matrix for every route, token expiry/revocation, CSRF and direct-URL tests.  
Complexity: High  
Definition of Done: One audited server auth mechanism protects every nonpublic surface.  
Lock Criteria: Automated route matrix and independent security review pass.  
Evidence Required: Route/auth matrix, test logs, security review, deployment configuration.  
Notes: Worker secrets remain separate service authentication.

## SEC-002 — Tenant Isolation and Least-Privilege Authorization

ID: `SEC-002`  
Title: Tenant Isolation and Least-Privilege Authorization  
Category: SEC  
Priority: P0  
Status: Planned  
Customer Value: Users only access their organization’s permitted loans and documents.  
Business Value: Enables safe multi-customer deployment.  
Problem Solved: Current Firestore/Storage rules broadly authorize any signed-in user.  
Description: Enforce tenant membership and role/action authorization in server services, Firestore rules, Storage rules/paths, workers, reports, exports, and billing. Prevent self-role escalation.  
Dependencies: CORE-002, SEC-001.  
Likely Files: `firestore.rules`, `storage.rules`, `lib/roles.ts`, auth/admin UI, application/storage/API services.  
Acceptance Tests: Cross-tenant and unauthorized role operations fail through every access path; permitted matrix succeeds.  
Regression Tests: Firebase emulator rule suite, API/UI/storage negative matrix, role-escalation tests.  
Complexity: Very High  
Definition of Done: Tenant and role scope is mandatory and centrally enforced.  
Lock Criteria: Zero known bypasses after security review and penetration testing.  
Evidence Required: Authorization matrix, emulator output, pen-test report, remediation closure.  
Notes: Highest-priority commercial gate.

## SEC-003 — Enterprise Identity, Secrets, and PII Controls

ID: `SEC-003`  
Title: Enterprise Identity, Secrets, and PII Controls  
Category: SEC  
Priority: P1  
Status: Planned  
Customer Value: Enterprise identity policies and sensitive-data protections fit lender requirements.  
Business Value: Unlocks security review and larger customers.  
Problem Solved: Invitations, MFA/SSO/SCIM, service accounts, redaction, key/secrets lifecycle, and access reviews are incomplete.  
Description: Implement governed provisioning/deactivation, MFA policy, SAML/OIDC readiness, SCIM plan, service identities, secret rotation, log/error redaction, encryption/key controls, and periodic access review.  
Dependencies: SEC-001, SEC-002.  
Likely Files: auth/admin/settings, Firebase/identity configuration, logging/error utilities, deployment docs/config.  
Acceptance Tests: Provisioning/deprovisioning and MFA policies enforce correctly; secrets/PII never enter client bundles or normal logs.  
Regression Tests: Identity lifecycle, redaction, secret-scan, service-account scope tests.  
Complexity: Very High  
Definition of Done: Documented controls operate in production with named owners.  
Lock Criteria: Security/customer identity acceptance and access-review evidence complete.  
Evidence Required: Control procedures, scans, identity test output, access-review record.  
Notes: Exact IdP support may be phased by customer demand.

## OCR-001 — Unified Document Intake and Validation

ID: `OCR-001`  
Title: Unified Document Intake and Validation  
Category: OCR  
Priority: P0  
Status: Partial  
Customer Value: Documents enter one reliable, visible processing flow.  
Business Value: Reduces support failures and duplicate pipelines.  
Problem Solved: Interactive upload/analyze and worker parsing have different contracts and limits.  
Description: Define supported types/limits, secure upload, checksum/deduplication, malware scanning, document identity/version, validation, and canonical job creation.  
Dependencies: CORE-001, CORE-002, SEC-002.  
Likely Files: `lib/storage.ts`, `app/applications/[id]`, upload/API routes, Storage rules, new document/job services.  
Acceptance Tests: Valid documents create exactly one tenant-scoped record/job; invalid, duplicate, oversized, or unsafe files fail visibly.  
Regression Tests: Type/size/signature, duplicate, malware-stub, interrupted upload, tenant-path tests.  
Complexity: High  
Definition of Done: All production uploads use one validated intake contract.  
Lock Criteria: Supported-file matrix passes and no bypass route remains.  
Evidence Required: Matrix results, security scan integration evidence, job records, UX screenshots.  
Notes: Supported document catalog is explicit.

## OCR-002 — Production Multipage OCR Pipeline

ID: `OCR-002`  
Title: Production Multipage OCR Pipeline  
Category: OCR  
Priority: P0  
Status: Partial  
Customer Value: Native and scanned mortgage PDFs are processed consistently.  
Business Value: Expands usable file coverage and lowers manual transcription.  
Problem Solved: Image-only PDFs are not rasterized and current OCR models one page.  
Description: Add safe multipage PDF rasterization, rotation/deskew/preprocessing, bounded OCR execution, encrypted/corrupt handling, provider abstraction, and page results.  
Dependencies: OCR-001, OPS-001.  
Likely Files: `lib/ocr.ts`, OCR child scripts, files worker, new provider/preprocessor modules.  
Acceptance Tests: Supported native/scanned/mixed PDFs return ordered page text/confidence; corrupt/encrypted/oversized files fail closed.  
Regression Tests: Golden native/scanned/rotated/mixed/corrupt/encrypted corpus, timeout/memory tests.  
Complexity: Very High  
Definition of Done: Production-safe OCR meets documented coverage, latency, and resource bounds.  
Lock Criteria: Accuracy/coverage benchmark and soak test meet approved targets.  
Evidence Required: Benchmark dataset/results, resource profiles, failure logs, operations approval.  
Notes: Provider choice is an engineering decision, not mortgage policy.

## OCR-003 — Page-Level Extraction Quality and Review

ID: `OCR-003`  
Title: Page-Level Extraction Quality and Review  
Category: OCR  
Priority: P1  
Status: Partial  
Customer Value: Low-quality extraction is easy to find and correct.  
Business Value: Improves downstream accuracy and user trust.  
Problem Solved: Confidence is heuristic and lacks page regions, benchmark calibration, and a complete review workflow.  
Description: Persist page/region coordinates, calibrated confidence, quality warnings, document classification, review thresholds, corrected values, and reprocessing lineage.  
Dependencies: OCR-002, TRUST-001.  
Likely Files: `lib/ocr.ts`, `lib/extractFields.ts`, schemas, document viewer/detail UI.  
Acceptance Tests: Evidence opens to the correct page/region; low-confidence fields require review; corrections are attributed and retained.  
Regression Tests: Coordinate mapping, confidence calibration, classification, correction/reprocess tests.  
Complexity: Very High  
Definition of Done: OCR quality and corrections are measurable, reviewable, and auditable.  
Lock Criteria: Approved benchmark precision/recall and reviewer workflow pass.  
Evidence Required: Annotated corpus, metrics, review recordings/screenshots, QA sign-off.  
Notes: Do not present confidence as certainty.

## UW-001 — Authoritative Deterministic Underwriting Pipeline

ID: `UW-001`  
Title: Authoritative Deterministic Underwriting Pipeline  
Category: UW  
Priority: P0  
Status: Partial  
Customer Value: One consistent, explainable analysis result.  
Business Value: Converts existing engine depth into a production product.  
Problem Solved: Rich library analysis, route-local scan logic, and regex worker decisions are separate paths.  
Description: Make one versioned domain engine authoritative; adapters supply canonical inputs and every UI/worker/report consumes its persisted result.  
Dependencies: CORE-001, TRUST-001, OCR-001.  
Likely Files: `lib/ai/analyzeApplication.ts`, analyze/worker routes, `extractFields.ts`, application detail, schemas.  
Acceptance Tests: Same package produces identical outputs across API, worker, UI, and report; alternate decision paths are removed or nonauthoritative.  
Regression Tests: Golden replay corpus, cross-entry-point parity, deterministic repeatability, legacy migration.  
Complexity: Very High  
Definition of Done: One production pipeline owns normalized values, calculations, conditions, readiness, and recommendation.  
Lock Criteria: Zero unexplained parity differences and underwriting/architecture approval.  
Evidence Required: Parity report, golden outputs, version manifest, approvals.  
Notes: Consolidates behavior; does not add policy.

## UW-002 — Governed Calculation and Liability Engine

ID: `UW-002`  
Title: Governed Calculation and Liability Engine  
Category: UW  
Priority: P0  
Status: Partial  
Customer Value: DTI, LTV, PITIA, credit, income, assets, reserves, and liabilities are traceable and consistent.  
Business Value: Protects the core underwriting value proposition.  
Problem Solved: Current calculations are substantial but include coded assumptions without a complete governance layer.  
Description: Separate approved rule/configuration inputs from calculation mechanics; preserve candidates, sources, formulas, rounding, assumptions, inclusion/exclusion rationale, and versions.  
Dependencies: UW-001, TRUST-002.  
Likely Files: `analyzeApplication.ts`, schema/config modules, settings/admin, regression scripts.  
Acceptance Tests: Approved fixtures reproduce expected calculations and explanations; missing policy/config fails to review, not approval.  
Regression Tests: DTI/LTV/PITIA/credit/income/liability boundary and rounding corpus.  
Complexity: Very High  
Definition of Done: Each supported calculation is governed, versioned, explainable, and tested.  
Lock Criteria: Mortgage SMEs approve rule sources and golden results.  
Evidence Required: Rule-source register, formulas, fixtures, regression output, SME approval.  
Notes: No threshold or treatment may originate in implementation guesswork.

## UW-003 — Governed Conditions, Decision, and Readiness

ID: `UW-003`  
Title: Governed Conditions, Decision, and Readiness  
Category: UW  
Priority: P0  
Status: Partial  
Customer Value: Clear blockers, conditions, owners, and next actions without false certainty.  
Business Value: Improves consistency and file movement.  
Problem Solved: Canonical conditions/readiness exist, but full lifecycle, policy governance, and production unification are incomplete.  
Description: Govern hard stops, condition identity/deduplication, severity, ownership, resolution documents/actions, readiness scoring, recommendation tiers, human decisions, exceptions, and overrides.  
Dependencies: UW-001, UW-002, TRUST-003.  
Likely Files: analysis/schema modules, application detail, workflow, report, new policy/override services.  
Acceptance Tests: Hard stops never weaken; manual/human actions retain precedence; every recommendation is evidence/rule-backed; uncertain policy refers to review.  
Regression Tests: Hard-stop hierarchy, dedupe, lifecycle, readiness, override/exception, clean-file false-positive tests.  
Complexity: Very High  
Definition of Done: One persisted condition/decision/readiness set drives every consumer.  
Lock Criteria: Golden workflow corpus, SME review, and audit replay pass.  
Evidence Required: Condition matrix, decision traces, regression logs, SME/QA approvals.  
Notes: Velocity assists; authorized humans own final decisions.

## WORKFLOW-001 — Auditable Loan and Condition State Machines

ID: `WORKFLOW-001`  
Title: Auditable Loan and Condition State Machines  
Category: WORKFLOW  
Priority: P0  
Status: Partial  
Customer Value: Predictable file movement and condition clearance.  
Business Value: Reduces operational errors and training burden.  
Problem Solved: Basic status gates exist, but condition/document/decision transitions and concurrency are incomplete.  
Description: Centralize authorized state transitions, prerequisites, reasons, optimistic concurrency, reopen/rollback rules, and immutable events.  
Dependencies: CORE-002, UW-003, AUDIT-001.  
Likely Files: `lib/workflow.ts`, application detail, queue, new workflow service, rules.  
Acceptance Tests: Invalid transitions fail server-side; valid transitions record actor/reason/version; approval honors assignment and open blocker gates.  
Regression Tests: Transition matrix, race, stale client, reopen, blocker/assignment gate tests.  
Complexity: High  
Definition of Done: All material transitions use one tested server-side state machine.  
Lock Criteria: Complete matrix passes under concurrency and audit replay.  
Evidence Required: State diagrams, test logs, event samples, operations approval.  
Notes: Existing transition names remain unless separately approved.

## WORKFLOW-002 — Assignment, Capacity, and Priority Queue

ID: `WORKFLOW-002`  
Title: Assignment, Capacity, and Priority Queue  
Category: WORKFLOW  
Priority: P1  
Status: Partial  
Customer Value: Work reaches the right person with visible rationale.  
Business Value: Increases throughput and supervisor control.  
Problem Solved: Smart assignment is client-side and based on limited workload signals.  
Description: Server-authoritative queue priority and assignment using governed capacity, role, skill, availability, SLA, override, and rationale—not mortgage eligibility policy.  
Dependencies: SEC-002, WORKFLOW-001.  
Likely Files: `app/queue/page.tsx`, underwriters/admin pages, new queue/assignment services, Firestore indexes.  
Acceptance Tests: Eligible assignees and priority are deterministic; manual override is authorized/audited; unavailable users are excluded.  
Regression Tests: Load balancing, tie-break, capacity, absence, override, concurrency, tenant tests.  
Complexity: High  
Definition of Done: Queue and assignment are persisted, explainable, and consistent across users.  
Lock Criteria: Operations simulation meets approved fairness/throughput rules.  
Evidence Required: Scenario results, assignment traces, supervisor sign-off.  
Notes: Assignment rules must not invent underwriting policy.

## WORKFLOW-003 — Tasks, Requests, SLAs, and Collaboration

ID: `WORKFLOW-003`  
Title: Tasks, Requests, SLAs, and Collaboration  
Category: WORKFLOW  
Priority: P1  
Status: Planned  
Customer Value: Teams know the next action, owner, due date, and required document.  
Business Value: Makes Velocity operationally sticky and measurable.  
Problem Solved: Conditions have actions, but end-to-end tasks, document requests, notifications, escalation, and collaboration are absent.  
Description: Add tenant-configured tasks, document requests, owners, due dates, comments, notification preferences, SLA timers, escalation, and completion links to conditions/evidence.  
Dependencies: WORKFLOW-001, WORKFLOW-002, SEC-002.  
Likely Files: application detail, dashboard/queue, new task/notification services and APIs.  
Acceptance Tests: Task/request lifecycle is authorized, auditable, tenant-local, and linked to canonical conditions without silent auto-clear.  
Regression Tests: Due-date/SLA, notification dedupe, reassignment, completion, permission tests.  
Complexity: Very High  
Definition of Done: Supported action workflows work end to end with reliable notifications.  
Lock Criteria: Operations UAT and delivery/retry evidence pass.  
Evidence Required: UAT scripts, event/notification logs, SLA reports, approval.  
Notes: External borrower delivery requires approved channels and consent.

## REPORT-001 — Canonical Versioned Underwriting Report

ID: `REPORT-001`  
Title: Canonical Versioned Underwriting Report  
Category: REPORT  
Priority: P0  
Status: Partial  
Customer Value: A trustworthy, consistent summary of the file.  
Business Value: Creates a reviewable customer deliverable.  
Problem Solved: Current PDF is generated from request inputs and is not an immutable archived projection.  
Description: Generate reports only from decision packages, with evidence, conflicts, calculations, assumptions, conditions, readiness, human decision, and engine/rule/report versions.  
Dependencies: TRUST-003, UW-003.  
Likely Files: report route, `buildUnderwritingReport.ts`, `renderUnderwritingPdf.ts`, schemas.  
Acceptance Tests: Report matches its package exactly; missing package fails; no report-side decision logic exists.  
Regression Tests: Package-to-report mapping, snapshot/text extraction, pagination, hard-stop parity tests.  
Complexity: High  
Definition of Done: Versioned report schema and renderer produce deterministic supported output.  
Lock Criteria: Golden reports pass underwriting, legal, accessibility, and QA review.  
Evidence Required: Golden PDFs, mapping tests, approvals, version manifest.  
Notes: Estimates are visibly labeled.

## REPORT-002 — Immutable Report Archive and Access

ID: `REPORT-002`  
Title: Immutable Report Archive and Access  
Category: REPORT  
Priority: P1  
Status: Planned  
Customer Value: Users can retrieve the exact report issued at a point in time.  
Business Value: Supports audit, support, and defensible records.  
Problem Solved: Reports are streamed on demand without durable version history or integrity proof.  
Description: Store immutable report artifacts with checksum, package/version references, tenant access, generation actor/time, retention, supersession, and download audit.  
Dependencies: REPORT-001, SEC-002, AUDIT-001.  
Likely Files: report route, Storage/Firestore services/rules, application detail report history.  
Acceptance Tests: Archived bytes/checksum never change; access is tenant/role-controlled; regeneration creates a new version.  
Regression Tests: Immutability, checksum, access, supersession, retention/legal-hold tests.  
Complexity: High  
Definition of Done: Every issued report is durable, attributable, and retrievable.  
Lock Criteria: Archive recovery and access-control tests pass.  
Evidence Required: Artifact manifests, hash verification, recovery logs, security approval.  
Notes: Retention behavior depends on approved policy.

## REPORT-003 — Accessible Export and Integration Outputs

ID: `REPORT-003`  
Title: Accessible Export and Integration Outputs  
Category: REPORT  
Priority: P1  
Status: Planned  
Customer Value: Results can be read, shared, and consumed in lender workflows.  
Business Value: Improves adoption and integration value.  
Problem Solved: Output is primarily one PDF format with no governed machine-readable export.  
Description: Add accessible PDF validation and stable JSON/CSV exports from the same package, with redaction profiles and export provenance.  
Dependencies: REPORT-001, SEC-002, INT-001.  
Likely Files: report/export modules, APIs, schemas, application UI.  
Acceptance Tests: Formats agree semantically; accessibility checks pass; redaction and permissions apply consistently.  
Regression Tests: Cross-format contract, accessibility, redaction, large-report tests.  
Complexity: High  
Definition of Done: Approved human and machine-readable outputs share one versioned contract.  
Lock Criteria: Accessibility and integration conformance pass.  
Evidence Required: Checker reports, export fixtures, contract logs, approvals.  
Notes: No additional decision logic in exporters.

## AUDIT-001 — Immutable Enterprise Audit Ledger

ID: `AUDIT-001`  
Title: Immutable Enterprise Audit Ledger  
Category: AUDIT  
Priority: P0  
Status: Planned  
Customer Value: Material actions are attributable and reviewable.  
Business Value: Essential for enterprise trust, investigations, and compliance.  
Problem Solved: Timestamps exist, but there is no comprehensive immutable event ledger.  
Description: Record tenant, actor/service, action, target, before/after references, reason, evidence, request correlation, source, and time for security and loan events.  
Dependencies: CORE-001, SEC-001.  
Likely Files: new audit schema/service, API/workflow/worker/report integrations, Firestore rules.  
Acceptance Tests: Every defined material action emits one immutable ordered event; unauthorized mutation/deletion fails.  
Regression Tests: Event coverage, ordering, idempotency, tamper, actor attribution, tenant isolation tests.  
Complexity: Very High  
Definition of Done: Event catalog and ledger cover all Enterprise V1 material actions.  
Lock Criteria: Coverage audit and tamper/security review pass.  
Evidence Required: Event catalog, sample timelines, automated coverage, security approval.  
Notes: Avoid unnecessary sensitive payload duplication.

## AUDIT-002 — Policy, Configuration, and Override Governance

ID: `AUDIT-002`  
Title: Policy, Configuration, and Override Governance  
Category: AUDIT  
Priority: P0  
Status: Partial  
Customer Value: Rules and exceptions are controlled and explainable.  
Business Value: Prevents accidental policy drift and supports lender configuration.  
Problem Solved: Rule packs/overlays exist without complete approvals, effective dates, rollback, exception authority, and recertification.  
Description: Add draft/review/approve/publish/retire lifecycle, ownership, source citations, effective dating, fixtures, change impact, rollback, overrides/exceptions, and periodic review.  
Dependencies: UW-002, AUDIT-001.  
Likely Files: rule worker, company/program/overlay admin, new governance services/schemas.  
Acceptance Tests: Only approved effective versions execute; changes are attributable; rollback and exception scopes are deterministic.  
Regression Tests: Lifecycle, effective-date, rollback, unauthorized publish, fixture-gate, override tests.  
Complexity: Very High  
Definition of Done: Production policy/config cannot change outside governed workflow.  
Lock Criteria: Mortgage SME, security, and release approvals with passing fixtures.  
Evidence Required: Source register, approval records, version history, test output.  
Notes: Registry itself supplies no mortgage policy.

## AUDIT-003 — Retention, Privacy, Legal Hold, and Audit Export

ID: `AUDIT-003`  
Title: Retention, Privacy, Legal Hold, and Audit Export  
Category: AUDIT  
Priority: P1  
Status: Planned  
Customer Value: Records can be governed according to customer obligations.  
Business Value: Supports security/compliance procurement.  
Problem Solved: Retention, deletion, privacy requests, legal hold, and controlled audit export are undefined.  
Description: Implement configurable approved retention schedules, holds, deletion/anonymization workflows, data inventory, export authorization, and proof of execution.  
Dependencies: AUDIT-001, SEC-003, REPORT-002.  
Likely Files: new compliance services/jobs/admin UI, Firestore/Storage indexes/rules, runbooks.  
Acceptance Tests: Hold prevents deletion; authorized retention/deletion/export is complete, tenant-scoped, audited, and retry-safe.  
Regression Tests: Retention clock, hold, partial failure/retry, privacy export, authorization tests.  
Complexity: Very High  
Definition of Done: Approved policies are operational with customer configuration and evidence.  
Lock Criteria: Legal/security/operations approve end-to-end drills.  
Evidence Required: Policy mappings, drill results, export samples, approvals.  
Notes: Exact legal schedules require counsel/customer direction.

## OPS-001 — Durable Job State Machine and Recovery

ID: `OPS-001`  
Title: Durable Job State Machine and Recovery  
Category: OPS  
Priority: P0  
Status: Partial  
Customer Value: Files do not remain silently stuck or process twice.  
Business Value: Makes document processing supportable at scale.  
Problem Solved: Workers have leases but lack complete watchdog, retries, dead letters, idempotency, and recovery tools.  
Description: Centralize job states, claims, heartbeats/leases, idempotency keys, retry/backoff, dead-letter, cancellation, requeue authority, poison-file handling, and recovery.  
Dependencies: CORE-001, AUDIT-001.  
Likely Files: files/AI worker routes, cron, new job service/watchdog/admin tools.  
Acceptance Tests: Crash, timeout, duplicate tick, stale lease, and poison files recover without duplicate authoritative output.  
Regression Tests: Fault injection, concurrency, retry exhaustion, requeue, idempotency, stage-transition tests.  
Complexity: Very High  
Definition of Done: Every job has a bounded, observable, recoverable lifecycle.  
Lock Criteria: Chaos/soak tests meet approved recovery objectives.  
Evidence Required: State diagram, fault logs, dead-letter/recovery demonstrations, ops approval.  
Notes: Replaces references to missing watchdog behavior.

## OPS-002 — Observability, SLOs, Alerts, and Runbooks

ID: `OPS-002`  
Title: Observability, SLOs, Alerts, and Runbooks  
Category: OPS  
Priority: P0  
Status: Planned  
Customer Value: Failures are detected and resolved before files are lost or delayed.  
Business Value: Enables production support and contractual reliability.  
Problem Solved: Structured logs, metrics, traces, queue dashboards, alerts, SLOs, and runbooks are incomplete.  
Description: Instrument correlated PII-safe telemetry for routes, jobs, OCR, analysis, reports, integrations, auth, and audit; define SLIs/SLOs and incident runbooks.  
Dependencies: SEC-003, OPS-001.  
Likely Files: shared telemetry/error modules, API/workers, deployment monitoring config, runbooks.  
Acceptance Tests: Known failures emit correlated safe telemetry and actionable alerts; SLO dashboards calculate correctly.  
Regression Tests: Telemetry schema, redaction, alert synthetic, trace propagation, dashboard tests.  
Complexity: High  
Definition of Done: On-call can detect, diagnose, and recover supported failures using documented procedures.  
Lock Criteria: Incident simulations and alert coverage review pass.  
Evidence Required: Dashboards, alerts, traces, runbooks, game-day results.  
Notes: No borrower PII in default telemetry.

## OPS-003 — Backup, Disaster Recovery, Capacity, and Cost Controls

ID: `OPS-003`  
Title: Backup, Disaster Recovery, Capacity, and Cost Controls  
Category: OPS  
Priority: P1  
Status: Planned  
Customer Value: Service and records survive failures at predictable performance.  
Business Value: Supports enterprise commitments and sustainable margins.  
Problem Solved: RPO/RTO, restore testing, regional strategy, load limits, and cost controls are undefined.  
Description: Establish backup/restore, RPO/RTO, DR procedures, capacity/load models, rate/backpressure limits, storage lifecycle, cost budgets, and recovery drills.  
Dependencies: OPS-001, OPS-002, AUDIT-003.  
Likely Files: infrastructure/deployment config, worker limits, storage lifecycle, operational docs.  
Acceptance Tests: Representative tenant/application/document/package/report data restores within approved objectives; load degrades safely.  
Regression Tests: Restore verification, load/soak, rate limit, backpressure, cost-threshold tests.  
Complexity: Very High  
Definition of Done: Tested recovery and capacity plans have owners and schedules.  
Lock Criteria: Full restore/DR and peak-load exercises pass.  
Evidence Required: Drill reports, RPO/RTO measures, load profiles, cost dashboard, approvals.  
Notes: Regional commitments follow customer/legal requirements.

## INT-001 — Versioned Enterprise API and Webhooks

ID: `INT-001`  
Title: Versioned Enterprise API and Webhooks  
Category: INT  
Priority: P1  
Status: Planned  
Customer Value: Lenders can automate Velocity within existing workflows.  
Business Value: Enables scalable integrations and ecosystem adoption.  
Problem Solved: Current routes are application-internal and lack a stable external contract.  
Description: Provide tenant-authenticated versioned APIs, idempotency, pagination, validation, rate limits, webhook subscriptions/signatures/retries, event catalog, and sandbox.  
Dependencies: CORE-001, SEC-002, AUDIT-001, OPS-002.  
Likely Files: new `/api/v1`, auth/rate-limit/webhook services, schemas, docs.  
Acceptance Tests: Contract, auth, idempotency, rate limit, signature, ordering/retry, and tenant isolation meet specification.  
Regression Tests: Consumer contract, webhook replay/dedupe, pagination, compatibility, abuse tests.  
Complexity: Very High  
Definition of Done: Published supported API/webhook surface has lifecycle and support policy.  
Lock Criteria: Reference client and partner conformance suite pass.  
Evidence Required: OpenAPI/event specs, test results, sandbox demo, security review.  
Notes: External API exposes canonical artifacts only.

## INT-002 — LOS/POS Import and Export Framework

ID: `INT-002`  
Title: LOS/POS Import and Export Framework  
Category: INT  
Priority: P1  
Status: Planned  
Customer Value: Loan data moves without rekeying.  
Business Value: Reduces implementation friction and improves retention.  
Problem Solved: No governed mapping/sync framework exists for lender systems such as Encompass.  
Description: Build connector framework, canonical mappings, external IDs, incremental sync, conflict ownership, replay, error queue, and first prioritized LOS/POS adapter.  
Dependencies: INT-001, TRUST-002, OPS-001.  
Likely Files: new integration services/connectors, admin mapping UI, job/audit modules.  
Acceptance Tests: Approved fields round-trip without silent loss; conflicts/errors are visible and retryable; tenant credentials are isolated.  
Regression Tests: Mapping fixtures, duplicate/replay, conflict, partial failure, credential-scope tests.  
Complexity: Very High  
Definition of Done: First approved connector completes supported import/export scenarios in sandbox and production.  
Lock Criteria: Customer/partner UAT and reconciliation report pass.  
Evidence Required: Mapping spec, UAT results, reconciliation logs, support runbook.  
Notes: Exact first system is a commercial decision.

## INT-003 — Verification and Mortgage Ecosystem Connector Framework

ID: `INT-003`  
Title: Verification and Mortgage Ecosystem Connector Framework  
Category: INT  
Priority: P2  
Status: Planned  
Customer Value: Verified credit, income, employment, assets, AUS, appraisal, title, and documents can enter with provenance.  
Business Value: Expands automation and customer value.  
Problem Solved: External verification/provider integrations and authoritative-source handling are absent.  
Description: Add provider-neutral connector contracts, consent, credential isolation, normalized evidence, status/retry, provider audit, reconciliation, and prioritized adapters.  
Dependencies: INT-001, TRUST-001, SEC-003, OPS-001.  
Likely Files: new provider adapters/services, evidence schemas, settings/admin, audit/job modules.  
Acceptance Tests: Provider data retains source/time/version/consent; failures do not invent values; duplicates and updates reconcile deterministically.  
Regression Tests: Provider contract mocks, consent, timeout/retry, mapping, reconciliation, fail-closed tests.  
Complexity: Very High  
Definition of Done: Approved initial providers operate through a common governed framework.  
Lock Criteria: Provider/customer certification and security review pass.  
Evidence Required: Certifications, mapping fixtures, security assessment, runbooks.  
Notes: Provider results do not create unapproved mortgage policy.

## QA-001 — CI Quality Gate and Test Architecture

ID: `QA-001`  
Title: CI Quality Gate and Test Architecture  
Category: QA  
Priority: P0  
Status: Partial  
Customer Value: Releases preserve trusted behavior.  
Business Value: Reduces regressions and enables controlled velocity.  
Problem Solved: Valuable scripts exist but are not visibly CI-gated and lack standard unit/integration/browser layers.  
Description: Establish protected CI for build, lint/type checks, deterministic regressions, unit tests, Firebase emulator/rules tests, API contracts, browser smoke, security scans, and artifacts.  
Dependencies: CORE-001, SEC-002.  
Likely Files: `package.json`, `scripts/**`, new tests/fixtures, CI configuration.  
Acceptance Tests: Required checks run on clean environment, fail on seeded defects, and block merge/release.  
Regression Tests: Meta-tests for test discovery, fixture integrity, flake quarantine, artifact retention.  
Complexity: High  
Definition of Done: Branch/release policy requires a reproducible green quality gate.  
Lock Criteria: Sustained reliable runs and seeded-defect validation pass.  
Evidence Required: CI history, protection config, test inventory, mutation/seed results.  
Notes: Existing `velocity:check` becomes one layer, not the whole gate.

## QA-002 — Golden Mortgage File and Document Benchmark Corpus

ID: `QA-002`  
Title: Golden Mortgage File and Document Benchmark Corpus  
Category: QA  
Priority: P0  
Status: Partial  
Customer Value: Supported files produce consistently validated outcomes.  
Business Value: Enables safe engine and OCR changes.  
Problem Solved: Current synthetic cases do not provide broad, approved, privacy-safe coverage.  
Description: Create governed de-identified/synthetic documents and expected evidence, extraction, calculation, condition, readiness, and report outputs with provenance and SME approval.  
Dependencies: UW-001, OCR-002, AUDIT-002.  
Likely Files: test fixtures outside production data, regression scripts/framework, benchmark manifests.  
Acceptance Tests: Corpus covers approved supported scenarios, edge/failure cases, and policy versions without real borrower PII.  
Regression Tests: Fixture checksum, expected-output diff, coverage and benchmark trend tests.  
Complexity: Very High  
Definition of Done: Versioned corpus is the release baseline for OCR and underwriting behavior.  
Lock Criteria: SME/privacy/security approval and stable benchmark results.  
Evidence Required: Corpus manifest, approvals, coverage map, benchmark reports.  
Notes: Expected mortgage outcomes require authoritative SME input.

## QA-003 — End-to-End, Security, Performance, and Fairness Validation

ID: `QA-003`  
Title: End-to-End, Security, Performance, and Fairness Validation  
Category: QA  
Priority: P1  
Status: Planned  
Customer Value: Normal and adverse use is reliable, secure, responsive, and monitored for harmful inconsistency.  
Business Value: Supplies enterprise release evidence.  
Problem Solved: Browser flows, penetration, load, accessibility, recovery, and adverse-impact validation are incomplete.  
Description: Validate complete tenant journeys, authorization, OWASP risks, accessibility, load/soak, chaos/recovery, data quality, outcome consistency, and appropriate fair-lending/adverse-impact monitoring.  
Dependencies: QA-001, QA-002, SEC-003, OPS-003.  
Likely Files: e2e/performance/security test suites, accessibility config, monitoring/reporting tools.  
Acceptance Tests: Approved journeys and nonfunctional thresholds pass; critical security/accessibility issues are closed; review metrics have documented interpretation.  
Regression Tests: Automated e2e, DAST/dependency scan, load, chaos, accessibility, consistency suites.  
Complexity: Very High  
Definition of Done: Repeatable release validation covers functional and nonfunctional Enterprise V1 risks.  
Lock Criteria: Independent QA/security and designated compliance reviewers approve evidence.  
Evidence Required: Test reports, pen test, accessibility report, load/chaos results, review memo.  
Notes: Monitoring does not itself define legal or mortgage policy.

## SALES-001 — Tenant Provisioning, Plans, and Entitlements

ID: `SALES-001`  
Title: Tenant Provisioning, Plans, and Entitlements  
Category: SALES  
Priority: P1  
Status: Partial  
Customer Value: Customers receive a controlled, correctly configured workspace.  
Business Value: Enables repeatable paid onboarding and plan enforcement.  
Problem Solved: Stripe routes exist without complete tenant subscription/webhook/entitlement lifecycle.  
Description: Implement tenant provisioning, invitations, plan catalog, Stripe webhook state, entitlements, trial/suspension/reactivation, quotas, and billing audit.  
Dependencies: SEC-002, SEC-003, INT-001.  
Likely Files: Stripe routes, new webhook/entitlement services, admin/settings/auth UI.  
Acceptance Tests: Billing events idempotently update the correct tenant; entitlements enforce server-side; suspension preserves records safely.  
Regression Tests: Stripe webhook replay/order, plan change, quota, tenant isolation, failure recovery tests.  
Complexity: Very High  
Definition of Done: Approved commercial plans can be provisioned, billed, changed, and supported.  
Lock Criteria: Finance/security/customer-ops UAT and reconciliation pass.  
Evidence Required: Billing reconciliation, entitlement matrix, webhook logs, approvals.  
Notes: Pricing is outside this registry.

## SALES-002 — Customer Configuration and Onboarding

ID: `SALES-002`  
Title: Customer Configuration and Onboarding  
Category: SALES  
Priority: P1  
Status: Planned  
Customer Value: Lenders can adopt Velocity with controlled organization-specific setup.  
Business Value: Reduces implementation cost and time to value.  
Problem Solved: Company profiles exist, but onboarding, sandbox, configuration validation, and promotion are incomplete.  
Description: Provide guided tenant setup, roles, programs, governed rules/overlays, integrations, branding/report settings, sandbox validation, readiness checklist, and promotion controls.  
Dependencies: AUDIT-002, SALES-001, INT-002.  
Likely Files: admin/settings, company/program/overlay services, onboarding workflow, docs.  
Acceptance Tests: A new tenant can be configured and validated without direct database edits; invalid configuration cannot reach production.  
Regression Tests: Onboarding journey, config validation, clone/promote/rollback, tenant isolation tests.  
Complexity: Very High  
Definition of Done: Repeatable onboarding produces a verified production-ready tenant.  
Lock Criteria: Internal implementation and pilot-customer onboarding meet approved time/quality targets.  
Evidence Required: Checklist results, configuration manifests, UAT, onboarding metrics.  
Notes: Customer rules require governance and authoritative sources.

## SALES-003 — Demonstrable ROI, Support, and Adoption Operations

ID: `SALES-003`  
Title: Demonstrable ROI, Support, and Adoption Operations  
Category: SALES  
Priority: P1  
Status: Planned  
Customer Value: Customers can prove value and obtain effective support.  
Business Value: Improves conversion, retention, expansion, and referenceability.  
Problem Solved: Review-time savings, throughput, condition consistency, adoption, support tooling, and health metrics are not governed.  
Description: Define privacy-safe value metrics, baseline methodology, adoption/health dashboards, support diagnostics, escalation, knowledge base, training, and customer-success reviews.  
Dependencies: OPS-002, AUDIT-001, SALES-002.  
Likely Files: analytics/telemetry services, admin/support views, documentation/runbooks.  
Acceptance Tests: Metrics are reproducible and tenant-scoped; support access is authorized/audited; claims map to measured evidence.  
Regression Tests: Metric definition, aggregation, privacy, support impersonation/access, export tests.  
Complexity: High  
Definition of Done: Pilot customers receive reliable value reports and supported operating procedures.  
Lock Criteria: Product/sales/customer-success approve measurement and support readiness.  
Evidence Required: Metric dictionary, pilot baseline/result, support drills, training artifacts.  
Notes: Avoid unsubstantiated marketing claims.

## RELEASE-001 — Enterprise V1 Scope and Lock Governance

ID: `RELEASE-001`  
Title: Enterprise V1 Scope and Lock Governance  
Category: RELEASE  
Priority: P0  
Status: Planned  
Customer Value: The shipped product has a clear, stable support boundary.  
Business Value: Prevents endless foundational rebuilds and unmanaged scope.  
Problem Solved: Capability lock evidence, change authority, supported scope, and exception process need formal control.  
Description: Govern registry ownership, status changes, acceptance/evidence review, supported document/workflow matrix, lock board, post-lock change criteria, and release exceptions.  
Dependencies: CORE-001, QA-001.  
Likely Files: `docs/CAPABILITY_REGISTRY.md`, roadmap/release docs, evidence repository/process.  
Acceptance Tests: No capability can become locked without all template evidence and approvals; IDs remain immutable; scope changes are attributable.  
Regression Tests: Registry validation/lint, dependency-cycle, duplicate-ID, missing-evidence checks.  
Complexity: Medium  
Definition of Done: Named owners operate a documented capability review and lock process.  
Lock Criteria: Governance process completes a dry run and receives executive/product/engineering/QA approval.  
Evidence Required: Review records, validator output, approval matrix, dry-run report.  
Notes: This document intentionally marks nothing locked.

## RELEASE-002 — Production Release, Rollback, and Change Management

ID: `RELEASE-002`  
Title: Production Release, Rollback, and Change Management  
Category: RELEASE  
Priority: P0  
Status: Planned  
Customer Value: Releases are controlled, recoverable, and minimally disruptive.  
Business Value: Reduces incident and customer-churn risk.  
Problem Solved: Deployment promotion, migrations, feature flags, rollback, approvals, and release evidence are not fully defined.  
Description: Implement environment separation, protected promotion, signed/versioned artifacts, migration gates, feature flags, rollback, change log, maintenance communication, and release approvals.  
Dependencies: QA-001, OPS-002, OPS-003, RELEASE-001.  
Likely Files: CI/deployment config, migration tooling, feature configuration, release/runbook docs.  
Acceptance Tests: Candidate promotes only after gates; failed deploy and schema migration rollback safely; deployed versions are identifiable.  
Regression Tests: Staging promotion, rollback drill, migration compatibility, feature-flag, artifact-integrity tests.  
Complexity: High  
Definition of Done: Repeatable release process produces auditable, recoverable deployments.  
Lock Criteria: Multiple production-like release/rollback exercises pass.  
Evidence Required: Pipeline history, signed manifests, drill logs, approvals.  
Notes: No direct production hotfix bypass without documented emergency process.

## RELEASE-003 — Enterprise V1 Acceptance and Commercial Launch

ID: `RELEASE-003`  
Title: Enterprise V1 Acceptance and Commercial Launch  
Category: RELEASE  
Priority: P0  
Status: Planned  
Customer Value: Customers receive a secure, supported, explainable product with known limits.  
Business Value: Establishes the Enterprise V1 finish line and launch decision.  
Problem Solved: Technical completion alone does not prove commercial, operational, security, or customer readiness.  
Description: Execute final capability review, supported-scope UAT, security/compliance closure, DR/incident exercises, pilot acceptance, documentation/training/support readiness, launch decision, and residual-risk acceptance.  
Dependencies: All preceding Enterprise V1 capabilities, especially RELEASE-001 and RELEASE-002.  
Likely Files: Registry/release evidence, product/admin/support docs; application files only through their owning capability work.  
Acceptance Tests: All launch-blocking capabilities meet lock criteria; supported end-to-end journeys and nonfunctional gates pass; no unresolved critical risk remains.  
Regression Tests: Full release suite, production smoke, tenant isolation, golden corpus, report replay, DR and incident drills.  
Complexity: Very High  
Definition of Done: Authorized executives and product, engineering, QA, security, operations, and pilot customer representatives approve launch.  
Lock Criteria: Signed launch checklist, capability evidence index, and residual-risk record complete.  
Evidence Required: Full evidence index, UAT, security/QA/ops reports, pilot acceptance, signed go/no-go.  
Notes: This capability also remains unlocked until execution is complete.

---

## Critical Path

`CORE-001` → `CORE-002` → `SEC-001` → `SEC-002` → `TRUST-001` → `AUDIT-001` → `OCR-001` → `UW-001` → `UW-002` → `UW-003` → `TRUST-003` → `REPORT-001` → `QA-001` → `QA-002` → `OPS-001` → `OPS-002` → `RELEASE-001` → `RELEASE-002` → `RELEASE-003`.

Parallel work is possible, but tenant isolation, canonical contracts, one underwriting truth, reproducibility, and automated release evidence are non-negotiable gates.

## Recommended first 15 capabilities

1. `CORE-001` — Canonical Enterprise Data Contracts
2. `CORE-003` — Production Route and Feature-Surface Integrity
3. `SEC-001` — Server-Side Authentication and Session Enforcement
4. `CORE-002` — Tenant-Scoped Application System of Record
5. `SEC-002` — Tenant Isolation and Least-Privilege Authorization
6. `QA-001` — CI Quality Gate and Test Architecture
7. `TRUST-001` — Evidence and Provenance Graph
8. `AUDIT-001` — Immutable Enterprise Audit Ledger
9. `OCR-001` — Unified Document Intake and Validation
10. `UW-001` — Authoritative Deterministic Underwriting Pipeline
11. `TRUST-002` — Canonical Conflict and Verification Workflow
12. `UW-002` — Governed Calculation and Liability Engine
13. `UW-003` — Governed Conditions, Decision, and Readiness
14. `TRUST-003` — Reproducible Decision Package
15. `OPS-001` — Durable Job State Machine and Recovery

## Completion estimates

**Estimated Enterprise V1 completion: approximately 24%.** Velocity has meaningful UI, Firebase, OCR, deterministic underwriting, workflow, report, lease, and regression foundations, but most enterprise capabilities remain partial or planned and none has lock evidence.

**Estimated Commercial completion: approximately 34%.** The demonstrable product experience and core analytical value are ahead of enterprise controls, but repeatable onboarding, entitlements, integrations, support operations, measured ROI, security review, and launch evidence are incomplete.

These are repository-based planning estimates, not earned-value measurements. They should be recalculated only from capability evidence and approved status reviews.
