# Velocity Product Constitution

Velocity is a mortgage workflow and underwriting-assistance platform. It unifies intake, borrower data, documents, assignment, conditions, deterministic analysis, readiness, and reporting. It assists accountable lending professionals; it does not replace human underwriting or create mortgage policy.

## Principles

1. **Evidence before conclusion.** Material findings must trace to a document, extracted field, configured rule, or explicit assumption. Missing, conflicting, stale, or low-confidence evidence stays visible.
2. **Determinism before interpretation.** Calculations, gates, condition precedence, rule matching, and decision tiers must be repeatable. AI may assist with explanation but may not silently change authoritative values or policy.
3. **Fail closed.** Missing evidence, empty OCR, unsupported files, invalid configuration, and unresolved hard stops produce review, conditions, or a blocked state—not invented data or false approval.
4. **Human accountability is final.** Authorized lending staff own approvals, denials, exceptions, overrides, and condition clearance.
5. **One canonical file state.** Borrower profile, metrics, conditions, decision, and readiness must agree across detail, queue, dashboard, and report views.
6. **Mortgage logic is governed.** Ratios, thresholds, liabilities, credit treatment, housing assumptions, overlays, and denial rules require verified existing behavior, approved configuration, or a cited business rule. Never invent mortgage logic.
7. **Conditions are operational objects.** They require stable identity, category, severity, owner, lifecycle, evidence, required actions/documents, blocking behavior, and resolution strategy.
8. **Workflow is constrained and auditable.** Status follows `New` → `In Review` → `Approved`/`Denied` → `Closed`; approval requires an assigned underwriter. Important changes must preserve who, what, when, and why.
9. **Security is product behavior.** Authentication, least privilege, role and tenant isolation, document access, and secrets must be enforced server-side and in Firebase rules—not only in UI navigation.
10. **Speed cannot trade away correctness.** Real-time queues and workers reduce effort while validation, idempotency, leases, and regressions protect the file.
11. **Reports are reproducible projections.** Reports identify the application, versions, inputs, assumptions, evidence, decision, conditions, readiness, and generation time; they do not independently decide a loan.
12. **Degraded behavior is honest.** Placeholder endpoints, estimates, partial OCR, and missing integrations are clearly labeled and never presented as production completion.

## Invariants

- No approval without an underwriter assignment.
- A hard stop cannot be weakened by merging, formatting, persistence, or reporting.
- Missing evidence cannot become a favorable value.
- DTI, LTV, credit, liabilities, and housing payment retain their inputs and assumptions.
- Automation does not silently overwrite manual conditions, human decisions, verified data, or clearance history.
- The same persisted condition set drives workflow gates, readiness, condition views, and reports.

Velocity succeeds when a lending team can understand a file, trace every material conclusion, identify the next responsible action, and advance the loan without losing policy, security, or audit control.
