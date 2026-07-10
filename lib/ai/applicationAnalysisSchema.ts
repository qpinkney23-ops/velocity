export type ParsedLiability = {
  creditor: string;
  accountType?: string;
  balance?: number | null;
  monthlyPayment: number | null;
  status?: string;
  includeInDti: boolean;
  reviewRequired: boolean;
  confidence: "low" | "medium" | "high";
  source: "credit" | "1003" | "bank" | "unknown";
  sourceDocName?: string;
  sourceDocType?: ParsedAnalysisDocType;
  reason?: string;
};

export type ParsedAnalysisDocType =
  | "1003"
  | "w2"
  | "paystub"
  | "bank"
  | "credit"
  | "id"
  | "employment"
  | "purchase"
  | "unknown";

export type ParsedAnalysisDocExtracted = {
  borrower?: string;
  fullName?: string;
  email?: string;
  dob?: string;
  ssnLast4?: string;
  loanNumber?: string;
  income?: number | null;
  creditScore?: number | null;
  address?: string;
  employerAddress?: string;
  loanAmount?: number | null;
  propertyValue?: number | null;
  assets?: number | null;
  debts?: number | null;
  liabilities?: ParsedLiability[];
};

export type ParsedAnalysisDoc = {
  type: ParsedAnalysisDocType;
  name: string;
  text: string;
  extracted: ParsedAnalysisDocExtracted;
};

export type ApplicationFieldKey =
  | "borrower"
  | "fullName"
  | "email"
  | "dob"
  | "ssnLast4"
  | "loanNumber"
  | "address"
  | "employerAddress"
  | "loanAmount"
  | "propertyValue"
  | "income"
  | "creditScore"
  | "assets"
  | "debts"
  | "dti"
  | "ltv";

export type EvidenceReference = {
  id: string;
  docName: string;
  docType: ParsedAnalysisDocType;
  field?: ApplicationFieldKey | string;
  snippet: string;
  confidence?: number | null;
  page?: number | null;
};

export type BorrowerProfileField<T = string | number | null> = {
  key: ApplicationFieldKey;
  value: T;
  displayValue: string;
  confidence: number | null;
  verified: boolean;
  winningSource: {
    docName: string;
    docType: ParsedAnalysisDocType;
    method: "extracted" | "derived" | "manual" | "fallback";
  } | null;
  competingValues: Array<{
    value: string | number | null;
    docName: string;
    docType: ParsedAnalysisDocType;
  }>;
  evidenceRefs: string[];
  overridden: boolean;
  overrideReason?: string;
  updatedAt?: string;
};

export type BorrowerProfile = {
  borrower: BorrowerProfileField<string>;
  fullName: BorrowerProfileField<string>;
  email: BorrowerProfileField<string>;
  dob: BorrowerProfileField<string>;
  ssnLast4: BorrowerProfileField<string>;
  loanNumber: BorrowerProfileField<string>;
  address: BorrowerProfileField<string>;
  employerAddress: BorrowerProfileField<string>;
  loanAmount: BorrowerProfileField<number | null>;
  propertyValue: BorrowerProfileField<number | null>;
  income: BorrowerProfileField<number | null>;
  creditScore: BorrowerProfileField<number | null>;
  assets: BorrowerProfileField<number | null>;
  debts: BorrowerProfileField<number | null>;
  dti: BorrowerProfileField<number | null>;
  ltv: BorrowerProfileField<number | null>;
};


export type ConditionOwner =
  | "loan_officer"
  | "processor"
  | "underwriter"
  | "borrower"
  | "system";

export type ConditionCategory =
  | "identity"
  | "income"
  | "assets"
  | "credit"
  | "liabilities"
  | "property"
  | "compliance"
  | "documentation"
  | "fraud"
  | "underwriting"
  | "closing";

export type ConditionLifecycleStatus =
  | "open"
  | "in_review"
  | "pending_borrower"
  | "cleared"
  | "waived"
  | "rejected";

export type ConditionResolutionStrategy =
  | "document_upload"
  | "manual_underwriter_review"
  | "borrower_explanation"
  | "recalculate_metrics"
  | "payoff_liability"
  | "verify_information"
  | "policy_exception_review"
  | "system_reanalysis"
  | "other";

export type ConditionEvidence = {
  sourceDoc: string;
  sourceType: ParsedAnalysisDocType;
  snippet: string;
  confidence: number | null;
  relatedField?: ApplicationFieldKey | string;
  page?: number | null;
};

export type VelocityCondition = {
  id: string;

  title: string;
  summary: string;

  category: ConditionCategory;

  severity: AnalysisConditionSeverity;

  blocking: boolean;

  status: ConditionLifecycleStatus;

  owner: ConditionOwner;

  borrowerVisible: boolean;

  autoClearEligible: boolean;

  confidence: number | null;

  relatedFields: Array<ApplicationFieldKey | string>;

  evidence: ConditionEvidence[];

  evidenceRefs: string[];

  requiredActions: string[];

  requiredDocuments: string[];

  dependencyConditions: string[];

  resolutionStrategy: ConditionResolutionStrategy;

  source:
    | "borrower_profile"
    | "credit"
    | "income"
    | "loan"
    | "debts"
    | "assets"
    | "policy"
    | "ai"
    | "manual"
    | "conflict";

  createdAt?: string;
  updatedAt?: string;
  clearedAt?: string;
};

export type ReadinessState = {
  readinessScore: number;
  readinessLabel:
    | "not_ready"
    | "high_risk"
    | "needs_conditions"
    | "near_ready"
    | "clear_to_close";

  unresolvedBlockingConditions: number;

  unresolvedConditions: number;

  borrowerActionCount: number;

  processorActionCount: number;

  underwriterActionCount: number;

  estimatedCloseability:
    | "low"
    | "medium"
    | "high";

  topBlockingReasons: string[];

  nextBestActions: string[];

  workflowRisk:
    | "low"
    | "medium"
    | "high";
};


export type AnalysisConditionSeverity = "low" | "med" | "high";

export type AnalysisConditionSource =
  | "borrower_profile"
  | "credit"
  | "income"
  | "loan"
  | "debts"
  | "assets"
  | "policy"
  | "ai"
  | "manual"
  | "conflict";

export type AnalysisConditionStatus =
  | "open"
  | "done"
  | "waived"
  | "reopened";

export type AnalysisCondition = {
  id: string;
  label: string;
  severity: AnalysisConditionSeverity;
  status: AnalysisConditionStatus;
  source: AnalysisConditionSource;
  evidence?: string;
  evidenceRefs: string[];
  createdAt?: string;
  updatedAt?: string;
};

export type AnalysisFactorImpact = "positive" | "neutral" | "negative";

export type AnalysisFactor = {
  key: string;
  label: string;
  value?: number | string | null;
  impact: AnalysisFactorImpact;
  summary: string;
  source?: string;
  evidenceRefs?: string[];
};

export type FieldConflict = {
  field: ApplicationFieldKey;
  winnerValue: string | number | null;
  winnerReason: string;
  losingValues: Array<{
    value: string | number | null;
    docName: string;
    docType: ParsedAnalysisDocType;
  }>;
  severity: "info" | "warning" | "blocking";
  requiresManualReview: boolean;
  evidenceRefs: string[];
};

export type FinalDecisionState =
  | "approved"
  | "approve_with_conditions"
  | "blocked"
  | "denied";

export type FinalDecision = {
  state: FinalDecisionState;
  label: "Approved" | "Approve With Conditions" | "Blocked" | "Denied";
  risk: "low" | "medium" | "high";
  confidence: number;
  score: number;
  reason: string;
  blockingReasons: string[];
  nextActions: string[];
  advisoryRecommendation?: string;
};

export type WorkflowStage =
  | "new"
  | "uw_review"
  | "conditions"
  | "approved"
  | "denied"
  | "exception_review"
  | "rescan_required"
  | "missing_docs";

export type WorkflowState = {
  stage: WorkflowStage;
  blockedActions: string[];
  allowedTransitions: WorkflowStage[];
  nextStepSummary: string;
};

export type NormalizedMetrics = {
  borrower: string;
  fullName: string;
  email: string;
  dob: string;
  ssnLast4: string;
  loanNumber: string;
  address: string;
  employerAddress: string;
  loanAmount: number | null;
  propertyValue: number | null;
  income: number | null;
  creditScore: number | null;
  assets: number | null;
  debts: number | null;
  liabilityDetails: ParsedLiability[];
  dti: number | null;
  ltv: number | null;
};

export type ApplicationAnalysisResult = {
  applicationId?: string;
  analysisVersion: string;
  analyzedAt: string;
  docsAnalyzed: Array<{
    name: string;
    type: ParsedAnalysisDocType;
  }>;
  borrowerProfile: BorrowerProfile;
  normalized: NormalizedMetrics;
  conflicts: FieldConflict[];

  // Legacy conditions (temporary compatibility layer)
  conditions: AnalysisCondition[];

  // Canonical workflow-native conditions
  canonicalConditions?: VelocityCondition[];

  factors: AnalysisFactor[];

  decision: FinalDecision;

  workflow: WorkflowState;

  readiness?: ReadinessState;

  evidence: EvidenceReference[];
};