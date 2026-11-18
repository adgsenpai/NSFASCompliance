import {
  AlertTriangle,
  CheckCircle2,
  FileCheck2,
  FileDown,
  FilePlus2,
  LayoutDashboard,
  ListOrdered,
  Menu,
  Scale,
  ShieldAlert,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { FlaggedPanel } from './components/FlaggedPanel.tsx';
import { IngestionPanel } from './components/IngestionPanel.tsx';
import { LedgerTable } from './components/LedgerTable.tsx';
import { PolicyRulesView } from './components/PolicyRulesView.tsx';
import { SpendingCharts } from './components/SpendingCharts.tsx';
import {
  DEFAULT_POLICY_CONFIG,
  formatZar,
  reevaluateAudit,
} from './shared/auditEngine.ts';
import type {
  AuditResult,
  PolicyConfig,
  SampleStatementInfo,
  TransactionOverride,
} from './shared/types.ts';
import { exportLedgerCsv } from './utils/csvExport.ts';
import { exportSignedAuditPdf } from './utils/pdfReport.ts';

type ActiveTab = 'overview' | 'flagged' | 'ledger' | 'policy';

const HISTORY_STORAGE_KEY = 'nsfas_audit_history_v1';
const POLICY_STORAGE_KEY = 'nsfas_policy_config_v1';

export default function App() {
  const [samples, setSamples] = useState<SampleStatementInfo[]>([]);
  const [auditHistory, setAuditHistory] = useState<AuditResult[]>(() => {
    try {
      const saved = localStorage.getItem(HISTORY_STORAGE_KEY);
      return saved ? (JSON.parse(saved) as AuditResult[]) : [];
    } catch {
      return [];
    }
  });
  const [activeAuditId, setActiveAuditId] = useState<string | null>(() => {
    try {
      const saved = localStorage.getItem(HISTORY_STORAGE_KEY);
      const parsed = saved ? (JSON.parse(saved) as AuditResult[]) : [];
      return parsed[0]?.auditId ?? null;
    } catch {
      return null;
    }
  });
  const [policyConfig, setPolicyConfig] = useState<PolicyConfig>(() => {
    try {
      const saved = localStorage.getItem(POLICY_STORAGE_KEY);
      return saved ? { ...DEFAULT_POLICY_CONFIG, ...JSON.parse(saved) } : DEFAULT_POLICY_CONFIG;
    } catch {
      return DEFAULT_POLICY_CONFIG;
    }
  });

  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');
  const [showIngestion, setShowIngestion] = useState<boolean>(false);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analysisLabel, setAnalysisLabel] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);

  const activeAudit = auditHistory.find((a) => a.auditId === activeAuditId) ?? null;

  useEffect(() => {
    fetch('/api/samples')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data.samples)) {
          setSamples(data.samples);
        }
      })
      .catch(() => {
        // Non-blocking fallback
      });
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(auditHistory.slice(0, 8)));
    } catch {
      // Ignore storage quota issues
    }
  }, [auditHistory]);

  useEffect(() => {
    try {
      localStorage.setItem(POLICY_STORAGE_KEY, JSON.stringify(policyConfig));
    } catch {
      // Ignore storage quota issues
    }
  }, [policyConfig]);

  const recordNewAudit = (result: AuditResult) => {
    setAuditHistory((prev) => [result, ...prev].slice(0, 8));
    setActiveAuditId(result.auditId);
    setShowIngestion(false);
    setActiveTab('overview');
  };

  const handleUploadFile = async (file: File) => {
    setError(null);
    setIsAnalyzing(true);
    setAnalysisLabel(`Extracting and auditing ${file.name}`);

    try {
      const formData = new FormData();
      formData.append('statement', file);
      formData.append('policyConfig', JSON.stringify(policyConfig));

      const response = await fetch('/api/audit/analyze', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to analyze statement.');
      }

      recordNewAudit(data as AuditResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Statement analysis failed.');
    } finally {
      setIsAnalyzing(false);
      setAnalysisLabel('');
    }
  };

  const handleRunSample = async (sampleId: 'compliant' | 'flagged') => {
    const sample = samples.find((s) => s.id === sampleId);
    setError(null);
    setIsAnalyzing(true);
    setAnalysisLabel(
      `Auditing ${sample?.title ?? sampleId} via multimodal PDF extraction`
    );

    try {
      const response = await fetch('/api/audit/sample', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sampleId, policyConfig }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to audit sample statement.');
      }

      recordNewAudit(data as AuditResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sample audit failed.');
    } finally {
      setIsAnalyzing(false);
      setAnalysisLabel('');
    }
  };

  const updateActiveAudit = (updated: AuditResult) => {
    setAuditHistory((prev) =>
      prev.map((item) => (item.auditId === updated.auditId ? updated : item))
    );
  };

  const handleOverrideTransaction = (txId: string, officerName: string, note: string) => {
    if (!activeAudit) return;
    const overridesMap: Record<string, TransactionOverride> = {};
    for (const tx of activeAudit.transactions) {
      if (tx.override) {
        overridesMap[tx.id] = tx.override;
      }
      if (tx.id === txId) {
        overridesMap[tx.id] = {
          overriddenBy: officerName,
          note,
          timestamp: new Date().toISOString(),
          previousStatus: tx.compliance_status,
        };
      }
    }
    updateActiveAudit(reevaluateAudit(activeAudit, activeAudit.policyConfig, overridesMap));
  };

  const handleRestoreFlag = (txId: string) => {
    if (!activeAudit) return;
    const overridesMap: Record<string, TransactionOverride> = {};
    for (const tx of activeAudit.transactions) {
      if (tx.override && tx.id !== txId) {
        overridesMap[tx.id] = tx.override;
      }
    }
    updateActiveAudit(reevaluateAudit(activeAudit, activeAudit.policyConfig, overridesMap));
  };

  const handleUpdatePolicy = (nextPolicy: PolicyConfig) => {
    setPolicyConfig(nextPolicy);
    if (activeAudit) {
      updateActiveAudit(reevaluateAudit(activeAudit, nextPolicy));
    }
  };

  const handleDeleteHistoryItem = (auditId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setAuditHistory((prev) => {
      const next = prev.filter((item) => item.auditId !== auditId);
      if (activeAuditId === auditId) {
        setActiveAuditId(next[0]?.auditId ?? null);
      }
      return next;
    });
  };

  const flaggedCount = activeAudit
    ? activeAudit.metrics.prohibitedCount + activeAudit.metrics.warningCount
    : 0;

  const isViewingIngestion = showIngestion || (!activeAudit && activeTab !== 'policy');

  const navItems: Array<{
    id: ActiveTab;
    label: string;
    icon: React.ReactNode;
    disabled?: boolean;
    count?: number;
  }> = [
    {
      id: 'overview',
      label: 'Audit Overview',
      icon: <LayoutDashboard className="h-4 w-4 shrink-0" />,
      disabled: !activeAudit,
    },
    {
      id: 'flagged',
      label: 'Flagged Items',
      icon: <ShieldAlert className="h-4 w-4 shrink-0" />,
      disabled: !activeAudit,
      count: activeAudit ? flaggedCount : undefined,
    },
    {
      id: 'ledger',
      label: 'Full Ledger',
      icon: <ListOrdered className="h-4 w-4 shrink-0" />,
      disabled: !activeAudit,
      count: activeAudit ? activeAudit.metrics.transactionCount : undefined,
    },
    {
      id: 'policy',
      label: 'Policy & Rules',
      icon: <SlidersHorizontal className="h-4 w-4 shrink-0" />,
    },
  ];

  const breadcrumbLabel = isViewingIngestion
    ? 'Statement Ingestion'
    : activeTab === 'overview'
      ? 'Audit Overview'
      : activeTab === 'flagged'
        ? 'Flagged Transactions'
        : activeTab === 'ledger'
          ? 'Full Transaction Ledger'
          : 'Policy & Rules';

  return (
    <div className="flex min-h-screen bg-[#F8FAFC] text-slate-900">
      {/* Mobile Sidebar Backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-950/40 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Left Institutional Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[260px] shrink-0 flex-col border-r border-slate-800 bg-[#0F2922] text-slate-100 transition-transform duration-200 lg:static lg:translate-x-0 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-16 items-center justify-between border-b border-white/10 px-5">
          <button
            type="button"
            onClick={() => {
              setShowIngestion(true);
              setMobileMenuOpen(false);
            }}
            className="font-display text-base font-bold tracking-tight text-white whitespace-nowrap shrink-0"
          >
            NSFAS Audit
          </button>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            className="rounded-lg p-1 text-slate-300 hover:bg-white/10 lg:hidden"
            aria-label="Close navigation"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="space-y-1 p-3">
          {navItems.map((item) => {
            const isActive = !isViewingIngestion && activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                disabled={item.disabled}
                onClick={() => {
                  setShowIngestion(false);
                  setActiveTab(item.id);
                  setMobileMenuOpen(false);
                }}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  isActive
                    ? 'bg-white/15 text-white'
                    : item.disabled
                      ? 'cursor-not-allowed text-slate-500'
                      : 'text-slate-300 hover:bg-white/10 hover:text-white'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  {item.icon}
                  <span>{item.label}</span>
                </span>
                {typeof item.count === 'number' && (
                  <span className="font-mono text-[11px] text-slate-300 tabular-nums">
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Recent Audits History */}
        <div className="mt-2 flex-1 overflow-y-auto border-t border-white/10 p-3">
          <div className="mb-2 flex items-center justify-between px-2">
            <span className="text-[11px] font-medium text-slate-400">Recent Audits</span>
            <button
              type="button"
              onClick={() => {
                setShowIngestion(true);
                setMobileMenuOpen(false);
              }}
              className="text-[11px] font-medium text-emerald-300 hover:text-emerald-200 whitespace-nowrap shrink-0"
            >
              + New
            </button>
          </div>

          {auditHistory.length === 0 ? (
            <p className="px-2 text-xs text-slate-400">
              No statements audited yet in this session.
            </p>
          ) : (
            <div className="space-y-1">
              {auditHistory.map((item) => {
                const selected = !isViewingIngestion && item.auditId === activeAuditId;
                return (
                  <div
                    key={item.auditId}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      setActiveAuditId(item.auditId);
                      setShowIngestion(false);
                      if (activeTab === 'policy') setActiveTab('overview');
                      setMobileMenuOpen(false);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setActiveAuditId(item.auditId);
                        setShowIngestion(false);
                        setMobileMenuOpen(false);
                      }
                    }}
                    className={`group flex cursor-pointer items-start justify-between gap-2 rounded-lg px-2.5 py-2 text-xs transition-colors ${
                      selected
                        ? 'bg-white/15 text-white'
                        : 'text-slate-300 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{item.fileName}</div>
                      <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[10px] text-slate-400 tabular-nums">
                        <span
                          className={
                            item.verdict === 'COMPLIANT'
                              ? 'text-emerald-300'
                              : item.verdict === 'NON_COMPLIANT'
                                ? 'text-red-300'
                                : 'text-amber-300'
                          }
                        >
                          {item.verdict}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{item.metrics.transactionCount} rows</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => handleDeleteHistoryItem(item.auditId, e)}
                      aria-label={`Remove ${item.fileName}`}
                      className="mt-0.5 hidden rounded p-1 text-slate-400 hover:bg-white/10 hover:text-white group-hover:block"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="border-t border-white/10 px-4 py-3 text-[11px] text-slate-400">
          DHET / NSFAS Living Allowance Guidelines
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top Bar Contract: Breadcrumb on Left, 1-2 Actions on Right */}
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-8 border-b border-slate-200 bg-white px-4 sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 lg:hidden"
              aria-label="Open navigation"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex min-w-0 items-center gap-2 text-xs sm:text-sm">
              <span className="hidden text-slate-500 sm:inline whitespace-nowrap shrink-0">
                Compliance Engine
              </span>
              <span className="hidden text-slate-300 sm:inline" aria-hidden="true">
                /
              </span>
              <span className="truncate font-display font-semibold text-slate-900">
                {breadcrumbLabel}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {activeAudit && !isViewingIngestion && (
              <button
                type="button"
                onClick={() => exportSignedAuditPdf(activeAudit)}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0"
              >
                <FileDown className="h-3.5 w-3.5" />
                Export Signed PDF
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowIngestion(true)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#0F4C3A] px-4 text-xs font-medium text-white transition-colors hover:bg-[#0B3B2D] whitespace-nowrap shrink-0"
            >
              <FilePlus2 className="h-3.5 w-3.5" />
              New Audit
            </button>
          </div>
        </header>

        {/* Main Viewport */}
        <main className="flex-1 p-4 sm:p-8">
          {isAnalyzing ? (
            /* Loading Skeleton State matching dashboard geometry */
            <div className="mx-auto max-w-6xl space-y-6">
              <div className="rounded-xl border border-slate-200 bg-white p-6">
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-1">
                    <h2 className="font-display text-base font-semibold text-slate-900">
                      Running Multimodal Statement Audit
                    </h2>
                    <p className="text-xs text-slate-600">{analysisLabel}</p>
                  </div>
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-[#0F4C3A]" />
                </div>
                <div className="mt-4 grid grid-cols-1 gap-3 border-t border-slate-100 pt-4 text-xs text-slate-600 sm:grid-cols-3">
                  <div>1. Parsing PDF ledger tables & merchant strings</div>
                  <div>2. Classifying against DHET/NSFAS guidelines</div>
                  <div>3. Reconciling opening & closing balances</div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="h-24 animate-pulse rounded-xl border border-slate-200 bg-white p-5"
                  >
                    <div className="h-3 w-24 rounded bg-slate-200" />
                    <div className="mt-4 h-6 w-32 rounded bg-slate-200" />
                  </div>
                ))}
              </div>
              <div className="h-72 animate-pulse rounded-xl border border-slate-200 bg-white p-5" />
            </div>
          ) : isViewingIngestion ? (
            <IngestionPanel
              samples={samples}
              isAnalyzing={isAnalyzing}
              error={error}
              onUploadFile={handleUploadFile}
              onRunSample={handleRunSample}
              onClearError={() => setError(null)}
            />
          ) : activeTab === 'policy' ? (
            <PolicyRulesView
              policyConfig={policyConfig}
              hasActiveAudit={Boolean(activeAudit)}
              onUpdatePolicy={handleUpdatePolicy}
            />
          ) : activeAudit ? (
            <div className="mx-auto max-w-7xl space-y-6">
              {activeTab === 'overview' && (
                <>
                  {/* Compliance Verdict & Mathematical Reconciliation Header */}
                  <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-2.5">
                        <div className="flex flex-wrap items-center gap-3">
                          {activeAudit.verdict === 'COMPLIANT' ? (
                            <span className="inline-flex items-center gap-2 font-display text-lg font-bold text-emerald-700">
                              <CheckCircle2 className="h-5 w-5 shrink-0" />
                              COMPLIANT
                            </span>
                          ) : activeAudit.verdict === 'NON_COMPLIANT' ? (
                            <span className="inline-flex items-center gap-2 font-display text-lg font-bold text-red-700">
                              <ShieldAlert className="h-5 w-5 shrink-0" />
                              NON-COMPLIANT
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-2 font-display text-lg font-bold text-amber-700">
                              <AlertTriangle className="h-5 w-5 shrink-0" />
                              FLAGGED FOR REVIEW
                            </span>
                          )}
                          <span className="text-slate-300" aria-hidden="true">
                            ·
                          </span>
                          <span className="font-mono text-xs text-slate-500 tabular-nums">
                            {activeAudit.auditId}
                          </span>
                          <span className="text-slate-300" aria-hidden="true">
                            ·
                          </span>
                          <span className="text-xs text-slate-600">{activeAudit.fileName}</span>
                        </div>

                        <div className="space-y-1 text-sm text-slate-700">
                          {activeAudit.verdictReasons.map((reason, idx) => (
                            <p key={idx}>{reason}</p>
                          ))}
                        </div>

                        {/* Unboxed Metadata Line with typographic separators */}
                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 pt-1 text-xs text-slate-500">
                          <span>
                            Holder:{' '}
                            <strong className="font-medium text-slate-800">
                              {activeAudit.account_metadata.account_holder}
                            </strong>
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{activeAudit.account_metadata.bank_name}</span>
                          <span aria-hidden="true">·</span>
                          <span>{activeAudit.account_metadata.statement_period}</span>
                          {activeAudit.account_metadata.account_number_masked && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono">
                                {activeAudit.account_metadata.account_number_masked}
                              </span>
                            </>
                          )}
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">
                            Processed in {(activeAudit.processingTimeMs / 1000).toFixed(1)}s
                          </span>
                        </div>
                      </div>

                      {/* Mathematical Reconciliation Strip */}
                      <div className="shrink-0 rounded-lg border border-slate-200 bg-slate-50 p-4 lg:w-96">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                            <Scale className="h-3.5 w-3.5 text-slate-600" />
                            Ledger Reconciliation
                          </span>
                          {activeAudit.reconciliation.status === 'RECONCILED' ? (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                              <FileCheck2 className="h-3.5 w-3.5" />
                              Reconciled
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700">
                              <AlertTriangle className="h-3.5 w-3.5" />
                              Variance {formatZar(activeAudit.reconciliation.discrepancyZar)}
                            </span>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                          <span className="text-slate-500">Opening Balance</span>
                          <span className="text-right font-mono text-slate-800 tabular-nums">
                            {formatZar(activeAudit.reconciliation.openingBalance)}
                          </span>
                          <span className="text-slate-500">Total Credits</span>
                          <span className="text-right font-mono text-emerald-700 tabular-nums">
                            +{formatZar(activeAudit.reconciliation.totalCredits)}
                          </span>
                          <span className="text-slate-500">Debits (Excl. Fees)</span>
                          <span className="text-right font-mono text-slate-800 tabular-nums">
                            −{formatZar(activeAudit.reconciliation.totalDebitsExclFees)}
                          </span>
                          <span className="text-slate-500">Bank / Wallet Fees</span>
                          <span className="text-right font-mono text-slate-800 tabular-nums">
                            −{formatZar(activeAudit.reconciliation.totalFees)}
                          </span>
                          <span className="border-t border-slate-200 pt-1 font-medium text-slate-900">
                            Stated Closing Balance
                          </span>
                          <span className="border-t border-slate-200 pt-1 text-right font-mono font-semibold text-slate-900 tabular-nums">
                            {formatZar(activeAudit.reconciliation.statedClosingBalance)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </section>

                  {/* 4-Column KPI Strip */}
                  <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-xl border border-slate-200 bg-white p-5">
                      <div className="text-xs font-medium text-slate-500">
                        Total Allowance Disbursed
                      </div>
                      <div className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
                        {formatZar(activeAudit.metrics.totalDisbursedZar)}
                      </div>
                      <div className="mt-1 text-xs text-slate-500 tabular-nums">
                        {activeAudit.monthlyBreakdowns.length} statement period
                        {activeAudit.monthlyBreakdowns.length === 1 ? '' : 's'} ·{' '}
                        {activeAudit.metrics.transactionCount} transactions
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-white p-5">
                      <div className="text-xs font-medium text-slate-500">
                        Permissible Spend & Fees
                      </div>
                      <div className="mt-2 font-mono text-2xl font-semibold text-emerald-700 tabular-nums">
                        {formatZar(activeAudit.metrics.totalPermissibleSpendZar)}
                      </div>
                      <div className="mt-1 text-xs text-slate-500 tabular-nums">
                        Includes {formatZar(activeAudit.metrics.totalFeesZar)} in service fees
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-white p-5">
                      <div className="text-xs font-medium text-slate-500">
                        Prohibited & Flagged Spend
                      </div>
                      <div
                        className={`mt-2 font-mono text-2xl font-semibold tabular-nums ${
                          activeAudit.metrics.totalProhibitedSpendZar > 0
                            ? 'text-red-700'
                            : activeAudit.metrics.totalWarningSpendZar > 0
                              ? 'text-amber-700'
                              : 'text-slate-900'
                        }`}
                      >
                        {formatZar(
                          activeAudit.metrics.totalProhibitedSpendZar +
                            activeAudit.metrics.totalWarningSpendZar
                        )}
                      </div>
                      <div className="mt-1 text-xs text-slate-500 tabular-nums">
                        {activeAudit.metrics.nonPermissiblePct.toFixed(1)}% of disbursed allowance ·{' '}
                        {flaggedCount} flagged row{flaggedCount === 1 ? '' : 's'}
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-white p-5">
                      <div className="text-xs font-medium text-slate-500">
                        Closing Account Balance
                      </div>
                      <div className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
                        {formatZar(activeAudit.reconciliation.statedClosingBalance)}
                      </div>
                      <div className="mt-1 text-xs text-slate-500 tabular-nums">
                        {activeAudit.metrics.overriddenCount > 0
                          ? `${activeAudit.metrics.overriddenCount} officer override(s) applied`
                          : 'Zero manual overrides applied'}
                      </div>
                    </div>
                  </section>

                  {/* Charts */}
                  <SpendingCharts
                    categorySummaries={activeAudit.categorySummaries}
                    monthlyBreakdowns={activeAudit.monthlyBreakdowns}
                    monthlyBaselineZar={activeAudit.policyConfig.monthlyBaselineZar}
                    totalDisbursedZar={activeAudit.metrics.totalDisbursedZar}
                  />

                  {/* Pinned Flagged Transactions Panel */}
                  <FlaggedPanel
                    transactions={activeAudit.transactions}
                    onOverrideTransaction={handleOverrideTransaction}
                    onRestoreFlag={handleRestoreFlag}
                  />

                  {/* Full Ledger Table */}
                  <LedgerTable
                    transactions={activeAudit.transactions}
                    onExportCsv={() => exportLedgerCsv(activeAudit)}
                  />
                </>
              )}

              {activeTab === 'flagged' && (
                <FlaggedPanel
                  transactions={activeAudit.transactions}
                  onOverrideTransaction={handleOverrideTransaction}
                  onRestoreFlag={handleRestoreFlag}
                />
              )}

              {activeTab === 'ledger' && (
                <LedgerTable
                  transactions={activeAudit.transactions}
                  onExportCsv={() => exportLedgerCsv(activeAudit)}
                />
              )}
            </div>
          ) : null}
        </main>
      </div>
    </div>
  );
}
