# Velocity Enterprise Bible

## Architecture overview

Velocity is a TypeScript/React application on Next.js 14 App Router. Browsers use Firebase Authentication, Cloud Firestore, and Firebase Storage; server routes use Firebase Admin. Vercel hosts the app and schedules a five-minute cron tick. Firestore real-time listeners drive the dashboard, applications, borrowers, queue, underwriters, and application detail views.

Three analysis surfaces currently coexist:

1. The interactive application flow uploads documents, calls `POST /api/applications/{id}/analyze`, persists scan/profile/condition data, and generates a PDF on demand.
2. A background pipeline advances `processingStage` from `parsing` to `analyzing` to `ai_completed`, using Firestore leases and configured regex rule packs/program overlays.
3. A richer deterministic domain engine in `lib/ai/analyzeApplication.ts` produces normalized data, evidence, conflicts, ratios, decisions, canonical conditions, and readiness. It is exercised by regression/replay scripts but is not called by the audited live API routes.

These paths are related but not yet a single production source of truth.

## Modules

- `app/applications/[id]/page.tsx`: primary loan workspace; real-time application/underwriter subscriptions, status, notes, assignment, upload, scan, borrower profile, conditions, decision, readiness, and report UI.
- `lib/workflow.ts`: statuses and allowed transitions; approval requires an assigned underwriter.
- `app/queue/page.tsx`: flags and ranks active files and assigns underwriters manually or by deterministic workload (files, conditions, volume).
- `lib/firebase.ts` / `lib/firebase-admin.ts`: client and privileged server Firebase initialization.
- `components/auth/*`: client Firebase auth state and redirects. Registration creates `/users/{uid}` with default `processor` role.
- `lib/roles.ts`: intended roles (`admin`, `loan_officer`, `processor`, `underwriter`) and page access.
- `lib/storage.ts`: uploads to `applications/{applicationId}/{timestamp}__{safeName}`, reports progress, times out after 60 seconds, and lists files.
- `lib/ocr.ts`: direct PDF text extraction; isolated Tesseract child OCR for supported images up to 8 MB; timeouts, cleanup, confidence, and fail-closed diagnostics. Image-only PDFs are not rasterized and multipage/page-coordinate OCR is absent.
- `lib/extractFields.ts`: deterministic identity, address, loan, income, assets, credit, liability, monthly-debt, and document parsing with noise/source handling.
- `lib/ai/analyzeApplication.ts`: deterministic underwriting domain engine.
- `lib/ai/buildUnderwritingReport.ts`: normalized report projection; labels extracted versus estimated housing-payment values.
- `lib/ai/renderUnderwritingPdf.ts`: paginated letter-size PDF via `pdf-lib`.

## Data model and Firebase usage

Observed collections are `applications`, `users`, `underwriters`, `companyProfiles`, `rulePacks`, `programs`, and `overlays`. Applications hold operational fields, documents, extraction/analysis, conditions, decision artifacts, processing stage, timestamps, and `workerLease`. Storage holds binaries beneath the application path.

Current rules are not enterprise-isolated: any signed-in user can read/write applications and all application Storage objects; users may update their own profile (including its role field); no tenant boundary is enforced. `middleware.ts` uses placeholder `isLoggedIn = true`, while the client `AuthGuard` performs redirects. API authorization is inconsistent: worker/cron/debug routes use secrets, but analysis/report and Stripe routes lack a consistent authenticated, tenant-aware server guard.

## Underwriting pipeline

The deterministic engine:

1. Prioritizes document types and attaches evidence references.
2. Selects normalized borrower/loan values while retaining conflicts.
3. Enriches and deduplicates liabilities as included, excluded, or review-required.
4. Calculates consumer debt ratio, proposed housing payment, total DTI, LTV, mortgage credit representation, confidence, and compensating factors.
5. Builds DTI scenarios/action plans without silently resolving uncertain debt.
6. Creates, normalizes, merges, and sorts conditions while preserving enterprise hard stops.
7. Applies risk assessment, denial guardrails, decision tiers, score, and confidence.
8. Produces canonical conditions with category, severity, owner, actions/documents, blocking status, and resolution strategy.
9. Computes readiness score/label, workflow risk, closeability, blockers, and next actions.

Housing-payment and policy thresholds encoded in this engine are current implementation assumptions, not automatically authoritative mortgage policy. Changes require governance and regression evidence.

The separate rule worker loads `companyProfile.rulePackId`, optional program/active overlay, merges regex rules, and emits findings, conditions, or blockers. A blocker yields `fail`, a condition `conditional`, otherwise `pass`. It saves public/raw decision artifacts. It does not call an LLM. The installed OpenAI dependency is unused in audited TypeScript, and `/api/ai-scan` plus `/api/ai/scan` return hard-coded dummy results.

## Data flows

### Interactive

Application creation (`New`, unassigned) → Firestore real-time views → Storage upload and application document metadata → analyze route downloads document → OCR and route-local heuristics → scan/profile/conditions persisted from the detail page → assignment/notes/condition lifecycle/status updates → report route builds and streams PDF.

### Background queue

`parsing` application → files worker transactionally claims one five-minute lease → downloads PDF, parses with `pdf-parse`, optionally repairs likely xref errors with `pdf-lib` → saves combined text and advances to `analyzing` (or `parsing_failed`) → rules worker claims lease → loads company/rules/program/overlay → evaluates text → persists artifacts and advances to `ai_completed` → releases lease.

Cron calls watchdog, files, and AI workers. The repository lacks the referenced watchdog and several debug upload/create/requeue/seed/share routes, so those orchestration calls are incomplete in this branch.

## Report generation

`POST /api/applications/{id}/report` maps application and analysis inputs into a report, merges workflow payload, renders decision, borrower, loan, DTI/LTV, housing traceability, conditions, readiness, canonical conditions, and factors, then returns a PDF attachment. Reports are generated on demand rather than stored as immutable versioned artifacts.

## APIs observed

- `POST /api/applications/{id}/analyze`: OCR and heuristic scan.
- `POST /api/applications/{id}/report`: PDF generation.
- `POST /api/worker/files/process`: claim/parse one file.
- `POST /api/worker/ai/process`: claim/evaluate one rules job.
- `GET|POST /api/cron/tick`: secret-protected orchestration.
- Debug overlay/run routes; dummy AI-scan routes; Stripe checkout/portal routes.

## Regression scripts

- `velocityRegression.ts`: representative decision cases.
- `velocityDtiRegression.ts`: liability, DTI, decision, and denial-guardrail behavior.
- `velocityWorkflowRegression.ts`: canonical condition contract, ownership, blockers, readiness, and clean-file protection.
- `velocityReportRegression.ts`: report mapping and non-empty PDF.
- `velocityOcrRegression.ts`: fail-closed OCR behavior.
- `velocityRegressionSuite.ts`: sequential DTI, workflow, report, and OCR checks, stopping on first failure.
- Replay/Tesseract probes support local diagnosis. `npm run velocity:check` runs build plus suite.

The suite is a strong deterministic foundation but is script-based, not visibly wired to CI, and does not cover Firebase rules, authenticated APIs, or browser workflows.

## Boundaries to preserve

Firestore applications are the operational record; Storage holds binaries. Client and Admin Firebase remain separated. Domain decisions live in deterministic libraries, workers claim transactionally and fail conservatively, and reports consume rather than create decisions. New work should converge duplicate paths onto one versioned contract instead of adding another analysis path.
