export type TransactionCategory =
  | 'NSFAS_DISBURSEMENT'
  | 'FOOD_GROCERIES'
  | 'PERSONAL_CARE_HYGIENE'
  | 'ACADEMIC_DATA_PRINTING'
  | 'LOCAL_COMMUTE'
  | 'BANK_FEES'
  | 'GAMBLING_BETTING'
  | 'ALCOHOL_TOBACCO'
  | 'LUXURY_NON_ESSENTIAL'
  | 'UNVERIFIED_CASH_P2P';

export type ComplianceStatus = 'PERMISSIBLE' | 'PROHIBITED' | 'WARNING_REVIEW';

export type OverallVerdict = 'COMPLIANT' | 'FLAGGED_REVIEW' | 'NON_COMPLIANT';

export type ReconciliationStatus = 'RECONCILED' | 'RECONCILIATION_WARNING';

export type TransactionType = 'CREDIT' | 'DEBIT' | 'FEE';

export interface PolicyConfig {
  monthlyBaselineZar: number;
  cashP2pWarningPct: number;
  nonPermissibleFailPct: number;
  confidenceThreshold: number;
  customProhibitedKeywords: string[];
  customPermissibleKeywords: string[];
}

export interface TransactionOverride {
  overriddenBy: string;
  note: string;
  timestamp: string;
  previousStatus: ComplianceStatus;
}

export interface RawExtractedTransaction {
  date: string;
  raw_description: string;
  normalized_merchant?: string;
  type: TransactionType;
  amount: number;
  balance?: number | null;
  category: TransactionCategory;
  compliance_status: ComplianceStatus;
  flag_reason?: string;
  confidence_score?: number;
}

export interface AccountMetadata {
  bank_name: string;
  account_holder: string;
  account_number_masked?: string;
  student_id?: string;
  institution?: string;
  statement_period: string;
  monthly_allowance_stated?: number;
  opening_balance: number;
  closing_balance: number;
}

export interface RawExtractionPayload {
  account_metadata: AccountMetadata;
  transactions: RawExtractedTransaction[];
}

export interface AuditedTransaction {
  id: string;
  rowIndex: number;
  date: string;
  monthKey: string;
  monthLabel: string;
  raw_description: string;
  normalized_merchant: string;
  type: TransactionType;
  amount: number;
  balance: number | null;
  category: TransactionCategory;
  ai_category: TransactionCategory;
  compliance_status: ComplianceStatus;
  ai_compliance_status: ComplianceStatus;
  flag_reason: string;
  confidence_score: number;
  deterministic_rule_applied?: string;
  override?: TransactionOverride;
}

export interface CategorySummary {
  category: TransactionCategory;
  label: string;
  isPermissible: boolean;
  totalZar: number;
  percentOfAllowance: number;
  percentOfSpend: number;
  transactionCount: number;
}

export interface MonthlyBreakdown {
  monthKey: string;
  label: string;
  disbursedZar: number;
  permissibleSpendZar: number;
  prohibitedSpendZar: number;
  warningSpendZar: number;
  feesZar: number;
  utilizationPct: number;
}

export interface ReconciliationSummary {
  status: ReconciliationStatus;
  openingBalance: number;
  totalCredits: number;
  totalDebitsExclFees: number;
  totalFees: number;
  totalOutflows: number;
  expectedClosingBalance: number;
  statedClosingBalance: number;
  discrepancyZar: number;
  rowDiscrepanciesCount: number;
}

export interface AuditMetrics {
  totalDisbursedZar: number;
  totalPermissibleSpendZar: number;
  totalProhibitedSpendZar: number;
  totalWarningSpendZar: number;
  totalFeesZar: number;
  unverifiedCashP2pZar: number;
  unverifiedCashP2pPct: number;
  nonPermissiblePct: number;
  transactionCount: number;
  prohibitedCount: number;
  warningCount: number;
  overriddenCount: number;
}

export interface AuditResult {
  auditId: string;
  fileName: string;
  analyzedAt: string;
  processingTimeMs: number;
  modelUsed: string;
  account_metadata: AccountMetadata;
  verdict: OverallVerdict;
  verdictReasons: string[];
  reconciliation: ReconciliationSummary;
  metrics: AuditMetrics;
  categorySummaries: CategorySummary[];
  monthlyBreakdowns: MonthlyBreakdown[];
  transactions: AuditedTransaction[];
  policyConfig: PolicyConfig;
}

export interface SampleStatementInfo {
  id: 'compliant' | 'flagged';
  title: string;
  subtitle: string;
  expectedOutcome: string;
  fileName: string;
}
