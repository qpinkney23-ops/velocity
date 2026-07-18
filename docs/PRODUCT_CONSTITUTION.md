# Velocity Product Constitution

## Product identity

Velocity is an enterprise mortgage workflow, document-intelligence, and underwriting-assistance platform.

Velocity unifies loan-file intake, document processing, borrower data, evidence, calculations, conditions, assignments, readiness, reporting, auditability, and lender workflow.

Velocity assists accountable lending professionals. It does not replace legally responsible human underwriting, create mortgage policy, or present uncertain information as verified fact.

Velocity is being built as commercial enterprise software—not as a demo, prototype, or collection of disconnected AI features.

## Product mission

Velocity must help a lending organization:

* review mortgage files faster
* reduce manual document searching and repetitive data entry
* identify missing, conflicting, or risky information earlier
* produce consistent, explainable underwriting analysis
* generate actionable conditions and next steps
* maintain evidence, security, policy, and audit control
* integrate into the lender’s existing operating workflow

Every material product decision must increase at least one of:

* lender trust
* underwriting accuracy
* explainability
* workflow efficiency
* operational reliability
* enterprise readiness
* measurable customer value

Complexity without customer value is rejected.

## Core principles

1. **Evidence before conclusion.**
   Every material finding must trace to a source document, extracted field, approved configuration, deterministic calculation, governed rule, or explicitly labeled assumption. Missing, conflicting, stale, or low-confidence evidence remains visible.

2. **Determinism before interpretation.**
   Calculations, workflow gates, source precedence, condition precedence, rule matching, decision tiers, and readiness must be repeatable. AI may assist with extraction and explanation but may not silently change authoritative values, policy, or outcomes.

3. **One authoritative underwriting truth.**
   Velocity must have one canonical production pipeline for borrower data, liabilities, income, credit, DTI, PITIA, LTV, conditions, readiness, and decisioning. Pages, APIs, workers, queues, and reports consume that result rather than independently recalculating it.

4. **Fail closed.**
   Missing evidence, empty OCR, unsupported files, invalid configuration, unresolved conflicts, unavailable services, or hard-stop conditions produce review, conditions, referral, or a blocked state—not invented data or false approval.

5. **Human accountability is final.**
   Authorized lending professionals own approvals, denials, exceptions, overrides, condition clearance, and policy interpretation. Velocity must preserve the identity, time, reason, and evidence for each human action.

6. **Mortgage logic is governed.**
   Ratios, thresholds, liabilities, income treatment, credit treatment, housing assumptions, overlays, denial rules, compensating factors, and exceptions require verified existing behavior, approved product policy, controlled configuration, or a cited authoritative rule. Velocity never invents mortgage logic.

7. **Every material value is explainable.**
   A lender must be able to determine:

   * the value used
   * every candidate value found
   * the winning source
   * why that source won
   * the calculation or rule applied
   * confidence and conflicts
   * assumptions and limitations
   * the effect on conditions, readiness, or decision

8. **One canonical file state.**
   Borrower profile, evidence, calculations, conditions, decision, readiness, assignment, and status must agree across the application detail page, dashboard, queue, reports, exports, integrations, and persisted records.

9. **Conditions are operational objects.**
   Conditions require stable identity, category, severity, owner, lifecycle, supporting evidence, required action, required documents, blocking behavior, resolution requirements, clearance history, and source.

10. **Workflow is constrained and auditable.**
    Statuses, assignments, approvals, denials, document requests, overrides, and condition changes must follow explicit transitions. Important actions preserve who, what, when, where, and why.

11. **Security is product behavior.**
    Authentication, authorization, tenant isolation, least privilege, document access, secrets, logs, storage paths, service accounts, and administrative actions must be enforced server-side and in Firebase or infrastructure rules—not only through UI visibility.

12. **Speed cannot trade away correctness.**
    OCR, queues, workers, automation, and AI reduce effort while validation, bounds, retries, idempotency, leases, versioning, security, and regression tests protect the loan file.

13. **Reports are reproducible projections.**
    Reports consume persisted, versioned decision packages. Reports identify the application, inputs, evidence, assumptions, conflicts, calculations, rules, conditions, readiness, decision, engine versions, and generation time. Reports do not independently decide a loan.

14. **Degraded behavior is honest.**
    Estimates, partial OCR, missing integrations, unsupported documents, placeholders, and unavailable services are clearly labeled. Diagnostic or demo behavior is isolated from production paths.

15. **Enterprise trust outweighs flashy AI.**
    A simpler, traceable, deterministic result is preferred over a more impressive but less explainable result.

16. **Commercial value guides prioritization.**
    Prefer capabilities that:

    * reduce file-review time
    * reduce repetitive work
    * improve consistency
    * surface risk earlier
    * reduce missed conditions
    * improve auditability
    * accelerate lender decisions
    * strengthen customer retention and ROI

17. **Velocity must fit the lender’s workflow.**
    Architecture and product decisions must support integrations, imports, exports, APIs, webhooks, Encompass readiness, lender configuration, onboarding, support, and operational administration.

18. **Locked capabilities remain stable.**
    Once a roadmap capability is marked `LOCKED`, it may only be materially changed because of:

    * a verified defect
    * a regulatory or authoritative policy change
    * a security issue
    * an approved customer or integration requirement
    * an approved roadmap dependency

    Locked behavior is not redesigned casually.

19. **Every implementation follows the roadmap.**
    Material changes must correspond to an approved capability ID such as:

    * `TRUST-001`
    * `OCR-004`
    * `UW-006`
    * `SEC-003`
    * `INT-002`

    Unplanned feature work does not enter active development without product approval.

20. **Enterprise V1 has a finish line.**
    Enterprise V1 is complete when Velocity can securely, reproducibly, and explainably process supported mortgage files through intake, analysis, conditions, workflow, reporting, audit, and integration-ready outputs under defined production and operational controls.

21. **Underwriting intelligence must meet the elite standard.**
    [The Elite Underwriting Intelligence Standard](./ELITE_UNDERWRITING_INTELLIGENCE_STANDARD.md) is canonical product doctrine. Mathematical correctness, evidence and rule traceability, explainability, lawful and non-discriminatory use, and a maintainable program/overlay hierarchy are non-negotiable. Velocity may not present generic or unsupported analysis as underwriting intelligence, exercise autonomous final lending authority, or add intelligence features without measurable operational value.

## Product invariants

* No approval without an authorized and attributable human decision where required.
* A hard stop cannot be weakened through merging, formatting, persistence, UI presentation, report generation, export, or integration.
* Missing evidence cannot become a favorable verified value.
* DTI, LTV, income, credit, liabilities, assets, reserves, and PITIA retain their inputs, sources, calculations, assumptions, and versions.
* Supported mortgage calculations use named formulas, explicit units and rounding boundaries, governed program/overlay context, and reproducible authoritative results.
* Velocity does not infer protected or irrelevant personal characteristics, use demographic proxies, or manufacture speculative predictors for underwriting.
* Derived values must be identified as derived and must not falsely claim a single document as their complete source.
* Automation does not silently overwrite verified data, manual conditions, human decisions, exceptions, overrides, or clearance history.
* The canonical persisted condition set drives workflow gates, readiness, condition views, reports, and exports.
* The same input set, engine version, rule version, and configuration must reproduce the same authoritative result.
* Cross-tenant access must be impossible through pages, APIs, Firestore, Storage, workers, reports, exports, or integrations.
* Production code must not depend on dummy, placeholder, missing, or demo-only behavior.
* No capability is considered complete solely because the UI looks correct.
* No capability is marked `LOCKED` without implementation evidence and regression evidence.

## Enterprise Lock philosophy

Velocity is not finished when it merely looks impressive.

Velocity reaches Enterprise Lock when:

* underwriting behavior is deterministic and governed
* every material result is traceable and explainable
* security and tenant isolation are enforced
* document and job failures are observable and recoverable
* reports and decisions are reproducible
* critical behavior is protected by automated tests
* supported workflows are complete
* integration contracts are stable
* customer value can be demonstrated and measured
* no known issue would create an embarrassing loss of lender trust during normal supported use

After Enterprise Lock, development should primarily consist of:

* maintenance
* controlled policy updates
* customer configuration
* integrations
* security and compliance updates
* performance improvements
* approved customer-driven enhancements

Enterprise Lock must not be followed by another hidden foundational rebuild.

## Commercial success definition

Velocity succeeds when a lending organization concludes:

> Velocity saves meaningful underwriting and processing time, improves consistency, exposes risk earlier, explains its work, preserves human control, and fits into our existing workflow.

Velocity becomes painful not to buy when a lender can clearly measure that operating without it causes:

* more manual review time
* slower file movement
* more missed or inconsistent conditions
* weaker visibility into risk and bottlenecks
* higher operational cost
* less consistent borrower and loan-file analysis

The final measure of product quality is not the number of features or edits completed.

The measure is whether lenders trust Velocity, obtain measurable value from it, and prefer operating with it rather than without it.
