import type {
  AccountMetadata,
  AuditedTransaction,
  AuditResult,
  CategorySummary,
  ComplianceStatus,
  MonthlyBreakdown,
  OverallVerdict,
  PolicyConfig,
  RawExtractedTransaction,
  RawExtractionPayload,
  TransactionCategory,
  TransactionOverride,
  TransactionType,
} from './types.ts';

export const DEFAULT_POLICY_CONFIG: PolicyConfig = {
  monthlyBaselineZar: 1760,
  cashP2pWarningPct: 15,
  nonPermissibleFailPct: 5,
  confidenceThreshold: 0.8,
  customProhibitedKeywords: [],
  customPermissibleKeywords: [],
};

export const CATEGORY_META: Record<
  TransactionCategory,
  { label: string; isPermissible: boolean; shortLabel: string; color: string }
> = {
  NSFAS_DISBURSEMENT: {
    label: 'NSFAS Allowance Disbursements',
    shortLabel: 'Disbursements',
    isPermissible: true,
    color: '#0F4C3A',
  },
  FOOD_GROCERIES: {
    label: 'Food & Groceries',
    shortLabel: 'Groceries',
    isPermissible: true,
    color: '#16A34A',
  },
  PERSONAL_CARE_HYGIENE: {
    label: 'Personal Care & Hygiene',
    shortLabel: 'Personal Care',
    isPermissible: true,
    color: '#0D9488',
  },
  ACADEMIC_DATA_PRINTING: {
    label: 'Academic, Data & Printing',
    shortLabel: 'Academic & Data',
    isPermissible: true,
    color: '#2563EB',
  },
  LOCAL_COMMUTE: {
    label: 'Local Commuting',
    shortLabel: 'Commuting',
    isPermissible: true,
    color: '#4F46E5',
  },
  BANK_FEES: {
    label: 'Bank & Card Service Fees',
    shortLabel: 'Bank Fees',
    isPermissible: true,
    color: '#64748B',
  },
  GAMBLING_BETTING: {
    label: 'Gambling & Sports Betting',
    shortLabel: 'Gambling',
    isPermissible: false,
    color: '#DC2626',
  },
  ALCOHOL_TOBACCO: {
    label: 'Alcohol, Liquor & Tobacco',
    shortLabel: 'Alcohol & Tobacco',
    isPermissible: false,
    color: '#B91C1C',
  },
  LUXURY_NON_ESSENTIAL: {
    label: 'Luxury & Entertainment',
    shortLabel: 'Luxury / Gaming',
    isPermissible: false,
    color: '#EA580C',
  },
  UNVERIFIED_CASH_P2P: {
    label: 'Unverified Cash-Out / P2P',
    shortLabel: 'Cash / P2P',
    isPermissible: false,
    color: '#D97706',
  },
};

const GAMBLING_KEYWORDS = [
  'hollywoodbets',
  'betway',
  'supabets',
  'lottostar',
  'sportingbet',
  'sunbet',
  'playabets',
  'gbets',
  'yesplay',
  'world sports betting',
  'bet.co.za',
  'casino',
  'sportsbook',
  'lottery',
  'lotto',
];

const ALCOHOL_TOBACCO_KEYWORDS = [
  'tops at spar',
  'tops spar',
  'liquorcity',
  'liquor city',
  'ultra liquors',
  'bottle store',
  'liquor',
  'vape',
  'tobacco',
  'smoke shop',
  'tavern',
  'nightclub',
];

const LUXURY_GAMING_KEYWORDS = [
  'playstation',
  'steam games',
  'xbox live',
  'nintendo eshop',
  'epic games',
  'netflix',
  'showmax',
  'dstv premium',
  'louis vuitton',
  'gucci',
];

const UNVERIFIED_CASH_P2P_KEYWORDS = [
  'atm cash withdrawal',
  'cash withdrawal',
  'p2p cash send',
  'immediate p2p',
  'cash send',
  'ewallet send',
  'send money',
];

const FEE_KEYWORDS = [
  'monthly account & card service fee',
  'account & card service fee',
  'service fee',
  'monthly account fee',
  'bank charge',
  'card fee',
];

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function formatZar(amount: number): string {
  const abs = Math.abs(amount);
  const formatted = abs.toLocaleString('en-ZA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return amount < 0 ? `-R ${formatted}` : `R ${formatted}`;
}

function extractMonthInfo(dateStr: string): { monthKey: string; monthLabel: string } {
  const clean = (dateStr || '').trim();

  // Pattern 1: 01/[M01] or M01
  const mBracket = clean.match(/M(\d{1,2})/i);
  if (mBracket) {
    const num = parseInt(mBracket[1], 10);
    const padded = String(num).padStart(2, '0');
    return { monthKey: `M${padded}`, monthLabel: `Month ${num}` };
  }

  // Pattern 2: ISO YYYY-MM-DD
  const isoMatch = clean.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const year = isoMatch[1];
    const monthNum = parseInt(isoMatch[2], 10);
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const name = monthNames[monthNum - 1] ?? `M${isoMatch[2]}`;
    return { monthKey: `${year}-${isoMatch[2]}`, monthLabel: `${name} ${year}` };
  }

  // Pattern 3: DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = clean.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (dmyMatch) {
    const monthNum = parseInt(dmyMatch[2], 10);
    const year = dmyMatch[3].length === 2 ? `20${dmyMatch[3]}` : dmyMatch[3];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const name = monthNames[monthNum - 1] ?? `M${dmyMatch[2]}`;
    return {
      monthKey: `${year}-${String(monthNum).padStart(2, '0')}`,
      monthLabel: `${name} ${year}`,
    };
  }

  // Pattern 4: DD/MM
  const dmMatch = clean.match(/^(\d{1,2})[/-](\d{1,2})$/);
  if (dmMatch) {
    const monthNum = parseInt(dmMatch[2], 10);
    const padded = String(monthNum).padStart(2, '0');
    return { monthKey: `M${padded}`, monthLabel: `Month ${monthNum}` };
  }

  return { monthKey: 'OTHER', monthLabel: 'Statement Period' };
}

function cleanMerchantName(raw: string, aiMerchant?: string): string {
  if (aiMerchant && aiMerchant.trim().length > 0) {
    return aiMerchant.trim();
  }
  return raw
    .replace(/^(POS Purchase|POS PURCHASE|ONLINE CARD PAYMENT|EFT DEBIT|ONLINE PURCHASE)\s*[–-]\s*/i, '')
    .trim();
}

function applyDeterministicRules(
  tx: RawExtractedTransaction,
  rowIndex: number,
  policy: PolicyConfig,
  existingOverride?: TransactionOverride
): AuditedTransaction {
  const rawLower = tx.raw_description.toLowerCase();
  const merchant = cleanMerchantName(tx.raw_description, tx.normalized_merchant);
  const merchantLower = merchant.toLowerCase();
  const combined = `${rawLower} ${merchantLower}`;

  let type: TransactionType = tx.type;
  let category: TransactionCategory = tx.category;
  let status: ComplianceStatus = tx.compliance_status;
  let flagReason = tx.flag_reason?.trim() || '';
  const confidence = typeof tx.confidence_score === 'number' ? tx.confidence_score : 0.95;
  let deterministicRule: string | undefined;

  // 1. Check custom permissible whitelist
  const matchedCustomPermissible = policy.customPermissibleKeywords.find(
    (kw) => kw.trim() && combined.includes(kw.trim().toLowerCase())
  );

  // 2. Check custom prohibited blacklist
  const matchedCustomProhibited = policy.customProhibitedKeywords.find(
    (kw) => kw.trim() && combined.includes(kw.trim().toLowerCase())
  );

  if (matchedCustomProhibited) {
    category = 'LUXURY_NON_ESSENTIAL';
    status = 'PROHIBITED';
    deterministicRule = `Matched custom prohibited keyword: "${matchedCustomProhibited}"`;
    flagReason =
      flagReason ||
      `Matched institutional prohibited merchant rule ("${matchedCustomProhibited}").`;
  } else if (type === 'CREDIT' || combined.includes('nsfas living allowance disbursement')) {
    type = 'CREDIT';
    category = 'NSFAS_DISBURSEMENT';
    status = 'PERMISSIBLE';
    flagReason = '';
  } else if (type === 'FEE' || FEE_KEYWORDS.some((kw) => combined.includes(kw))) {
    type = 'FEE';
    category = 'BANK_FEES';
    status = 'PERMISSIBLE';
    flagReason = '';
  } else if (GAMBLING_KEYWORDS.some((kw) => combined.includes(kw))) {
    category = 'GAMBLING_BETTING';
    status = 'PROHIBITED';
    deterministicRule = 'Prohibited Merchant Rule: Gambling & Sports Betting';
    if (!flagReason) {
      flagReason =
        'Prohibited under DHET/NSFAS Financial Conduct guidelines: online sports betting and gambling operators are strictly disallowed.';
    }
  } else if (ALCOHOL_TOBACCO_KEYWORDS.some((kw) => combined.includes(kw))) {
    category = 'ALCOHOL_TOBACCO';
    status = 'PROHIBITED';
    deterministicRule = 'Prohibited Merchant Rule: Liquor, Alcohol or Tobacco';
    if (!flagReason) {
      flagReason =
        'Prohibited under DHET/NSFAS Food & Groceries guidelines: alcoholic beverages, bottle stores, tobacco, and vaping products are non-permissible.';
    }
  } else if (LUXURY_GAMING_KEYWORDS.some((kw) => combined.includes(kw))) {
    category = 'LUXURY_NON_ESSENTIAL';
    status = 'PROHIBITED';
    deterministicRule = 'Prohibited Merchant Rule: Gaming / Non-Essential Entertainment';
    if (!flagReason) {
      flagReason =
        'Prohibited under DHET/NSFAS Academic & Living Allowance guidelines: gaming credits and non-essential entertainment subscriptions are disallowed.';
    }
  } else if (UNVERIFIED_CASH_P2P_KEYWORDS.some((kw) => combined.includes(kw))) {
    category = 'UNVERIFIED_CASH_P2P';
    status = 'WARNING_REVIEW';
    deterministicRule = 'Review Trigger: Unverified Cash Withdrawal or P2P Transfer';
    if (!flagReason) {
      flagReason =
        'Flagged for compliance verification: unverified ATM cash withdrawals (especially in nightlife districts) or P2P cash-sends lack merchant receipts.';
    }
  } else if (matchedCustomPermissible) {
    status = 'PERMISSIBLE';
    deterministicRule = `Whitelisted merchant keyword: "${matchedCustomPermissible}"`;
    flagReason = '';
  } else {
    // Enforce category-to-status alignment from AI output
    if (
      category === 'GAMBLING_BETTING' ||
      category === 'ALCOHOL_TOBACCO' ||
      category === 'LUXURY_NON_ESSENTIAL'
    ) {
      status = 'PROHIBITED';
      deterministicRule = `Enforced prohibited status for category ${category}`;
    } else if (category === 'UNVERIFIED_CASH_P2P') {
      status = 'WARNING_REVIEW';
      deterministicRule = 'Enforced review trigger for unverified cash/P2P';
    } else if (confidence < policy.confidenceThreshold && status === 'PERMISSIBLE') {
      status = 'WARNING_REVIEW';
      deterministicRule = `Low extraction confidence (${Math.round(confidence * 100)}% < ${Math.round(policy.confidenceThreshold * 100)}%)`;
      if (!flagReason) {
        flagReason = `Flagged for manual review due to low merchant classification confidence (${Math.round(confidence * 100)}%).`;
      }
    }
  }

  // Apply officer override if present
  let finalStatus = status;
  if (existingOverride) {
    finalStatus = 'PERMISSIBLE';
  }

  const { monthKey, monthLabel } = extractMonthInfo(tx.date);

  return {
    id: `tx-${rowIndex + 1}`,
    rowIndex: rowIndex + 1,
    date: tx.date,
    monthKey,
    monthLabel,
    raw_description: tx.raw_description,
    normalized_merchant: merchant,
    type,
    amount: round2(Math.abs(tx.amount)),
    balance: typeof tx.balance === 'number' ? round2(tx.balance) : null,
    category,
    ai_category: tx.category,
    compliance_status: finalStatus,
    ai_compliance_status: tx.compliance_status,
    flag_reason: flagReason,
    confidence_score: round2(confidence),
    deterministic_rule_applied: deterministicRule,
    override: existingOverride,
  };
}

export function evaluateAudit(params: {
  auditId: string;
  fileName: string;
  analyzedAt: string;
  processingTimeMs: number;
  modelUsed: string;
  payload: RawExtractionPayload;
  policyConfig?: PolicyConfig;
  overrides?: Record<string, TransactionOverride>;
}): AuditResult {
  const policy: PolicyConfig = {
    ...DEFAULT_POLICY_CONFIG,
    ...(params.policyConfig ?? {}),
  };
  const overrides = params.overrides ?? {};

  const metadata: AccountMetadata = {
    ...params.payload.account_metadata,
    opening_balance: round2(params.payload.account_metadata.opening_balance ?? 0),
    closing_balance: round2(params.payload.account_metadata.closing_balance ?? 0),
  };

  const auditedTransactions: AuditedTransaction[] = params.payload.transactions.map(
    (tx, idx) => applyDeterministicRules(tx, idx, policy, overrides[`tx-${idx + 1}`])
  );

  // Mathematical Reconciliation (FR-4.1)
  let totalCredits = 0;
  let totalDebitsExclFees = 0;
  let totalFees = 0;
  let rowDiscrepanciesCount = 0;
  let runningBalance = metadata.opening_balance;

  for (const tx of auditedTransactions) {
    if (tx.type === 'CREDIT') {
      totalCredits += tx.amount;
      runningBalance = round2(runningBalance + tx.amount);
    } else if (tx.type === 'FEE') {
      totalFees += tx.amount;
      runningBalance = round2(runningBalance - tx.amount);
    } else {
      totalDebitsExclFees += tx.amount;
      runningBalance = round2(runningBalance - tx.amount);
    }

    if (tx.balance !== null && Math.abs(runningBalance - tx.balance) > 0.05) {
      rowDiscrepanciesCount += 1;
      // Re-anchor running balance to stated row balance to prevent cascading false discrepancies
      runningBalance = tx.balance;
    }
  }

  totalCredits = round2(totalCredits);
  totalDebitsExclFees = round2(totalDebitsExclFees);
  totalFees = round2(totalFees);
  const totalOutflows = round2(totalDebitsExclFees + totalFees);
  const expectedClosingBalance = round2(
    metadata.opening_balance + totalCredits - totalOutflows
  );
  const discrepancyZar = round2(expectedClosingBalance - metadata.closing_balance);
  const reconciliationStatus =
    Math.abs(discrepancyZar) <= 0.05 ? 'RECONCILED' : 'RECONCILIATION_WARNING';

  // Metrics & Category Breakdown
  let totalDisbursedZar = 0;
  let totalPermissibleSpendZar = 0;
  let totalProhibitedSpendZar = 0;
  let totalWarningSpendZar = 0;
  let unverifiedCashP2pZar = 0;
  let prohibitedCount = 0;
  let warningCount = 0;
  let overriddenCount = 0;

  const categoryTotals: Record<
    TransactionCategory,
    { totalZar: number; transactionCount: number }
  > = {
    NSFAS_DISBURSEMENT: { totalZar: 0, transactionCount: 0 },
    FOOD_GROCERIES: { totalZar: 0, transactionCount: 0 },
    PERSONAL_CARE_HYGIENE: { totalZar: 0, transactionCount: 0 },
    ACADEMIC_DATA_PRINTING: { totalZar: 0, transactionCount: 0 },
    LOCAL_COMMUTE: { totalZar: 0, transactionCount: 0 },
    BANK_FEES: { totalZar: 0, transactionCount: 0 },
    GAMBLING_BETTING: { totalZar: 0, transactionCount: 0 },
    ALCOHOL_TOBACCO: { totalZar: 0, transactionCount: 0 },
    LUXURY_NON_ESSENTIAL: { totalZar: 0, transactionCount: 0 },
    UNVERIFIED_CASH_P2P: { totalZar: 0, transactionCount: 0 },
  };

  const monthMap = new Map<string, MonthlyBreakdown>();

  for (const tx of auditedTransactions) {
    categoryTotals[tx.category].totalZar = round2(
      categoryTotals[tx.category].totalZar + tx.amount
    );
    categoryTotals[tx.category].transactionCount += 1;

    if (!monthMap.has(tx.monthKey)) {
      monthMap.set(tx.monthKey, {
        monthKey: tx.monthKey,
        label: tx.monthLabel,
        disbursedZar: 0,
        permissibleSpendZar: 0,
        prohibitedSpendZar: 0,
        warningSpendZar: 0,
        feesZar: 0,
        utilizationPct: 0,
      });
    }
    const m = monthMap.get(tx.monthKey)!;

    if (tx.override) {
      overriddenCount += 1;
    }

    if (tx.type === 'CREDIT') {
      totalDisbursedZar = round2(totalDisbursedZar + tx.amount);
      m.disbursedZar = round2(m.disbursedZar + tx.amount);
    } else if (tx.type === 'FEE') {
      m.feesZar = round2(m.feesZar + tx.amount);
      totalPermissibleSpendZar = round2(totalPermissibleSpendZar + tx.amount);
      m.permissibleSpendZar = round2(m.permissibleSpendZar + tx.amount);
    } else {
      if (tx.compliance_status === 'PROHIBITED') {
        totalProhibitedSpendZar = round2(totalProhibitedSpendZar + tx.amount);
        prohibitedCount += 1;
        m.prohibitedSpendZar = round2(m.prohibitedSpendZar + tx.amount);
      } else if (tx.compliance_status === 'WARNING_REVIEW') {
        totalWarningSpendZar = round2(totalWarningSpendZar + tx.amount);
        warningCount += 1;
        m.warningSpendZar = round2(m.warningSpendZar + tx.amount);
        if (tx.category === 'UNVERIFIED_CASH_P2P') {
          unverifiedCashP2pZar = round2(unverifiedCashP2pZar + tx.amount);
        }
      } else {
        totalPermissibleSpendZar = round2(totalPermissibleSpendZar + tx.amount);
        m.permissibleSpendZar = round2(m.permissibleSpendZar + tx.amount);
      }
    }
  }

  const allowanceDenominator = totalDisbursedZar > 0 ? totalDisbursedZar : totalCredits;
  const unverifiedCashP2pPct =
    allowanceDenominator > 0
      ? round2((unverifiedCashP2pZar / allowanceDenominator) * 100)
      : 0;
  const nonPermissiblePct =
    allowanceDenominator > 0
      ? round2(
          ((totalProhibitedSpendZar + totalWarningSpendZar) / allowanceDenominator) * 100
        )
      : 0;

  const monthlyBreakdowns: MonthlyBreakdown[] = Array.from(monthMap.values()).map((m) => {
    const denom = m.disbursedZar > 0 ? m.disbursedZar : policy.monthlyBaselineZar;
    const totalSpent = m.permissibleSpendZar + m.prohibitedSpendZar + m.warningSpendZar;
    return {
      ...m,
      utilizationPct: denom > 0 ? round2((totalSpent / denom) * 100) : 0,
    };
  });

  const categorySummaries: CategorySummary[] = (
    Object.keys(CATEGORY_META) as TransactionCategory[]
  )
    .filter((cat) => cat !== 'NSFAS_DISBURSEMENT')
    .map((cat) => {
      const meta = CATEGORY_META[cat];
      const entry = categoryTotals[cat];
      return {
        category: cat,
        label: meta.label,
        isPermissible: meta.isPermissible,
        totalZar: entry.totalZar,
        percentOfAllowance:
          allowanceDenominator > 0
            ? round2((entry.totalZar / allowanceDenominator) * 100)
            : 0,
        percentOfSpend:
          totalOutflows > 0 ? round2((entry.totalZar / totalOutflows) * 100) : 0,
        transactionCount: entry.transactionCount,
      };
    })
    .filter((c) => c.transactionCount > 0 || !c.isPermissible)
    .sort((a, b) => b.totalZar - a.totalZar);

  // Compliance Verdict (FR-4.2)
  const hasHighRiskProhibitedCategory = auditedTransactions.some(
    (t) =>
      t.compliance_status === 'PROHIBITED' &&
      (t.category === 'GAMBLING_BETTING' || t.category === 'ALCOHOL_TOBACCO')
  );

  const verdictReasons: string[] = [];
  let verdict: OverallVerdict = 'COMPLIANT';

  if (
    prohibitedCount > 0 ||
    hasHighRiskProhibitedCategory ||
    (allowanceDenominator > 0 &&
      (totalProhibitedSpendZar / allowanceDenominator) * 100 >
        policy.nonPermissibleFailPct)
  ) {
    verdict = 'NON_COMPLIANT';
    if (prohibitedCount > 0) {
      verdictReasons.push(
        `${prohibitedCount} confirmed prohibited transaction${prohibitedCount === 1 ? '' : 's'} totaling ${formatZar(totalProhibitedSpendZar)} detected.`
      );
    }
    if (warningCount > 0) {
      verdictReasons.push(
        `${warningCount} unverified cash-out / review transaction${warningCount === 1 ? '' : 's'} totaling ${formatZar(totalWarningSpendZar)} require documentation.`
      );
    }
  } else if (
    warningCount > 0 ||
    unverifiedCashP2pPct > policy.cashP2pWarningPct ||
    reconciliationStatus === 'RECONCILIATION_WARNING'
  ) {
    verdict = 'FLAGGED_REVIEW';
    if (warningCount > 0) {
      verdictReasons.push(
        `${warningCount} transaction${warningCount === 1 ? '' : 's'} (${formatZar(totalWarningSpendZar)}) flagged for officer verification.`
      );
    }
    if (unverifiedCashP2pPct > policy.cashP2pWarningPct) {
      verdictReasons.push(
        `Unverified cash/P2P transfers (${unverifiedCashP2pPct.toFixed(1)}%) exceed the ${policy.cashP2pWarningPct}% policy threshold.`
      );
    }
    if (reconciliationStatus === 'RECONCILIATION_WARNING') {
      verdictReasons.push(
        `Ledger reconciliation variance of ${formatZar(Math.abs(discrepancyZar))} detected against stated closing balance.`
      );
    }
  } else {
    verdict = 'COMPLIANT';
    verdictReasons.push(
      'Zero prohibited merchants detected and all disbursements align with DHET/NSFAS living allowance guidelines.'
    );
    if (overriddenCount > 0) {
      verdictReasons.push(
        `${overriddenCount} transaction${overriddenCount === 1 ? '' : 's'} cleared via documented compliance officer override.`
      );
    }
  }

  return {
    auditId: params.auditId,
    fileName: params.fileName,
    analyzedAt: params.analyzedAt,
    processingTimeMs: params.processingTimeMs,
    modelUsed: params.modelUsed,
    account_metadata: metadata,
    verdict,
    verdictReasons,
    reconciliation: {
      status: reconciliationStatus,
      openingBalance: metadata.opening_balance,
      totalCredits,
      totalDebitsExclFees,
      totalFees,
      totalOutflows,
      expectedClosingBalance,
      statedClosingBalance: metadata.closing_balance,
      discrepancyZar,
      rowDiscrepanciesCount,
    },
    metrics: {
      totalDisbursedZar: allowanceDenominator,
      totalPermissibleSpendZar,
      totalProhibitedSpendZar,
      totalWarningSpendZar,
      totalFeesZar: totalFees,
      unverifiedCashP2pZar,
      unverifiedCashP2pPct,
      nonPermissiblePct,
      transactionCount: auditedTransactions.length,
      prohibitedCount,
      warningCount,
      overriddenCount,
    },
    categorySummaries,
    monthlyBreakdowns,
    transactions: auditedTransactions,
    policyConfig: policy,
  };
}

export function reevaluateAudit(
  existing: AuditResult,
  nextPolicy?: PolicyConfig,
  nextOverrides?: Record<string, TransactionOverride>
): AuditResult {
  const overridesMap: Record<string, TransactionOverride> = nextOverrides ?? {};
  if (!nextOverrides) {
    for (const tx of existing.transactions) {
      if (tx.override) {
        overridesMap[tx.id] = tx.override;
      }
    }
  }

  const rawPayload: RawExtractionPayload = {
    account_metadata: existing.account_metadata,
    transactions: existing.transactions.map((tx) => ({
      date: tx.date,
      raw_description: tx.raw_description,
      normalized_merchant: tx.normalized_merchant,
      type: tx.type,
      amount: tx.amount,
      balance: tx.balance,
      category: tx.ai_category,
      compliance_status: tx.ai_compliance_status,
      flag_reason: tx.flag_reason,
      confidence_score: tx.confidence_score,
    })),
  };

  return evaluateAudit({
    auditId: existing.auditId,
    fileName: existing.fileName,
    analyzedAt: existing.analyzedAt,
    processingTimeMs: existing.processingTimeMs,
    modelUsed: existing.modelUsed,
    payload: rawPayload,
    policyConfig: nextPolicy ?? existing.policyConfig,
    overrides: overridesMap,
  });
}
