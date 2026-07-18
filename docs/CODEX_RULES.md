# Codex Engineering Rules for Velocity

## Scope and architecture

1. Never modify unrelated files. Inspect the branch, working tree, applicable instructions, call sites, schemas, Firebase rules, and tests before editing.
2. Preserve user changes. Do not reset, overwrite, reformat, or “clean up” files outside the explicit scope.
3. State the intended file list and report the actual changed file list.
4. Preserve the current architecture unless acceptance criteria require a change; explain any moved boundary and migration impact.
5. Do not create competing sources of truth. Reuse canonical application, evidence, condition, decision, and readiness contracts.
6. Keep mortgage calculations, workflow gates, condition precedence, and decision logic in deterministic domain modules—not UI components or API glue.
7. Never invent mortgage logic. Do not guess thresholds, investor/agency rules, income treatment, liability exclusions, credit treatment, rates, taxes, insurance, MI, or approval criteria. Require an approved rule, cited source, or explicitly locked behavior.
8. Prioritize deterministic, explicit, testable behavior over cleverness or generative inference.
9. Fail closed when evidence, configuration, parsing, authentication, or authorization is missing. Never turn uncertainty into approval.
10. Preserve evidence lineage, conflicts, assumption labels, confidence, and hard-stop severity end to end.
10a. Before changing underwriting extraction, calculations, ratios, scoring, program or overlay behavior, conditions, evidence, confidence, risk, readiness, scenarios, decisions, or reports, read and comply with [the Elite Underwriting Intelligence Standard](./ELITE_UNDERWRITING_INTELLIGENCE_STANDARD.md).
10b. Do not describe a capability as elite without production-path evidence, approved rule sources, representative benchmark results, and required mortgage-SME acceptance. Keep extraction confidence, completeness, consistency, program fit, readiness, and risk conceptually separate.
10c. Never introduce prohibited inference, protected-class or proxy scoring, speculative borrower-behavior prediction, autonomous final lending authority, or a generic unsupported “AI score.”

## Quality and regression control

11. Make the smallest coherent change and retain persisted-shape compatibility where practical.
12. Explain every change: what, why, affected flow, assumptions, risks, and verification.
13. Satisfy every acceptance test and map each criterion to an observable check.
14. Add proportional regressions for behavior changes, especially DTI/LTV, liabilities, credit, hard stops, workflow, readiness, OCR, leases, authorization, and reports.
15. Run focused checks while developing and `npm run velocity:check` before handoff when possible. Never claim an unrun test passed.
16. A build alone is insufficient: verify behavior, persisted shape, failure paths, security rules, and relevant UI/API integration.

## Firebase, APIs, workers, OCR, and reports

17. Enforce authentication, authorization, role, and tenant boundaries server-side and in Firestore/Storage rules. UI hiding is not authorization.
18. Firebase Admin is server-only. Never expose credentials, secrets, borrower PII, or raw internal artifacts in clients, logs, errors, or docs.
19. Validate all API inputs and external URLs; return stable, non-sensitive errors.
20. Workers are idempotent and single-owner: claim transactionally, use bounded leases, re-read authoritative state, and make retries safe.
21. Treat `processingStage` as a state machine; do not skip or silently repair stages without a tested recovery rule.
22. Version rule packs, overlays, analysis, assumptions, and report schemas. Persist enough provenance to reproduce a result.
23. Never fabricate OCR text or fields. Preserve source, page/location when available, engine, confidence, and warnings; bound size, time, memory, and temporary files.
24. Maintain one authoritative extraction and underwriting pipeline. Prove parity before consolidating duplicate paths.
25. Reports project persisted, versioned analysis and introduce no new decision or unlabeled assumption.
26. Do not add placeholder/demo behavior to production paths; isolate existing diagnostic routes.

## Definition of done

- Only authorized files changed.
- Acceptance checks pass or limitations are disclosed.
- Architecture and persisted contracts remain coherent.
- Mortgage behavior is sourced and deterministic.
- Security, tenancy, failure, and retry behavior were considered.
- The handoff explains every file, effect, risk, and test.
