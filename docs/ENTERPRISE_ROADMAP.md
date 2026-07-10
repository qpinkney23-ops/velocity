# Velocity Enterprise Roadmap

## Current maturity

Velocity is a credible functional prototype/early product with substantial deterministic underwriting, workflow-condition, readiness, PDF, and regression logic. It is not enterprise-ready. The largest gaps are production-path consolidation, security/tenant isolation, governed mortgage policy, auditability, durable operations, and release evidence.

## Implemented capabilities

- Firebase email/password authentication and registration; real-time dashboard, application, borrower, queue, underwriter, admin, settings, and detail views.
- Application intake, notes, assignment, document upload/listing, manual/generated conditions, constrained statuses, and underwriter-required approval.
- Ranked work queue and deterministic workload-based smart assignment.
- Direct PDF extraction, isolated image Tesseract OCR, confidence/diagnostics, bounds/timeouts, and fail-closed behavior.
- Deterministic borrower/loan/income/asset/credit/liability extraction.
- Rich domain analysis for evidence/conflicts, liabilities, DTI/LTV, housing estimates, credit selection, compensating factors, decisions/guardrails, canonical conditions, ownership/actions, and readiness.
- Base rule packs plus program overlays in a separate background rules worker.
- Normalized underwriting reports and multi-page PDF rendering.
- Transactional one-job worker claims with expiring leases, conservative error outcomes, five-minute Vercel cron, and scripted DTI/workflow/report/OCR regressions.

## Capabilities requiring hardening

### P0 — Security and production truth

- Replace placeholder middleware and enforce authenticated, role-aware, tenant-aware authorization on every page, API, Firestore document, and Storage path.
- Prevent self-role escalation and broad signed-in access to all applications/documents.
- Remove, disable, or isolate dummy AI endpoints and references to missing deployment routes.
- Establish PII-safe secrets, logs, errors, environment separation, and access reviews.

### P0 — One underwriting pipeline

- Select and wire one versioned deterministic production engine.
- Consolidate route-local OCR/extraction with library extraction.
- Reconcile interactive scan, rules-worker artifacts, persisted fields, canonical conditions, readiness, and reports.
- Define precedence for verified data, manual conditions, automation, overrides, and human decisions.

### P1 — Reliability, audit, and testing

- Implement or remove missing watchdog/upload/create/requeue/seed/share routes; add retries, dead letters, idempotency, backpressure, poison-file handling, and queue metrics.
- Add scanned multipage PDF rasterization, preprocessing, page coordinates, encrypted-file handling, provider abstraction, and resource limits.
- Persist immutable audit events and reproducible decision packages with inputs, evidence, assumptions, user actions, and engine/rule/report versions.
- Put `velocity:check` in CI; add pure unit tests, Firebase emulator/rules tests, authenticated API integration tests, schema contracts, and critical browser tests.
- Archive immutable, access-controlled, versioned reports rather than only streaming them.

### P2 — Operational completeness

- Complete invitations, deactivation, recovery, MFA/SSO, granular roles, service accounts, and tenant administration.
- Add governed queue capacity/skills/availability, assignment rationale, supervisor overrides, SLA/escalation, notifications, and document-request collaboration.
- Complete Stripe webhooks, entitlements, subscription state, and plan enforcement.

## Missing enterprise capabilities

- Strong multi-tenancy across identity, Firestore, Storage, configuration, audit, and billing.
- SAML/OIDC SSO, MFA policy, SCIM, domain controls, and granular RBAC/ABAC.
- Controlled mortgage-policy lifecycle: ownership, approvals, effective dates, testing fixtures, rollback, exceptions, and recertification.
- Immutable audit ledger and reproducible decision/report packages.
- Compliance operations for retention/legal hold, privacy, consent, encryption/key governance, audit export, vendor controls, and security evidence.
- Production observability, SLOs, alerts, runbooks, incident response, backup/restore tests, DR, and regional/data-residency strategy.
- Data-quality and rule/model monitoring, benchmark datasets, drift and adverse-impact/fair-lending review.
- LOS/POS, credit, AUS, income/employment/assets, appraisal/title, DMS, notifications, webhooks, and stable versioned public APIs.
- Accessibility verification, localization, support tooling, sandboxes, and customer configuration management.

## Recommended implementation order

### Phase 1 — Safe baseline

Freeze canonical contracts; inventory live routes/fields; enforce server-side auth, role, and tenant isolation; remove production ambiguity from placeholders/missing routes; add CI and security/rules/browser smoke gates.

**Exit:** cross-tenant access is impossible, every production route is intentional, and current behavior is protected automatically.

### Phase 2 — Consolidated underwriting truth

Make one deterministic engine authoritative; unify OCR/extraction and interactive/worker contracts; persist evidence, assumptions, versions, overrides, and audit events; make reports consume an immutable decision package.

**Exit:** identical input and versions reproduce the same fields, conditions, decision, readiness, and report.

### Phase 3 — Durable document operations

Complete recovery/dead-letter behavior and observability; add production multipage OCR and page evidence; load-test workers/reports; implement idempotency, backpressure, recovery drills, and runbooks.

**Exit:** stuck, duplicate, corrupt, and oversized jobs are observable and recoverable without silent file corruption.

### Phase 4 — Governed mortgage policy

Add controlled rules/overlays/assumptions with approvals, effective dating, fixtures, rollback, exceptions, human overrides, validation, fair-lending review, and recertification.

**Exit:** every material result maps to approved policy/evidence and every override is attributable.

### Phase 5 — Enterprise operations and integrations

Add SSO/SCIM/MFA, retention/audit export, backup/DR, SLOs, incident processes, tenant/billing administration, then prioritized lending integrations and workflow collaboration on stable APIs.

**Exit:** Velocity can be securely operated, audited, integrated, recovered, and supported under enterprise obligations.

## Guardrail

Do not prioritize feature breadth ahead of Phases 1 and 2. Security isolation and a single reproducible underwriting truth are more valuable than additional screens or another analysis path.
