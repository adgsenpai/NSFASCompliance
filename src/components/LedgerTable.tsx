import { AlertTriangle, Ban, Check, Download, Search } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { CATEGORY_META, formatZar } from '../shared/auditEngine.ts';
import type { AuditedTransaction, ComplianceStatus, TransactionCategory } from '../shared/types.ts';

interface LedgerTableProps {
  transactions: AuditedTransaction[];
  onExportCsv: () => void;
}

type StatusFilter = 'ALL' | ComplianceStatus;

export const LedgerTable: React.FC<LedgerTableProps> = ({ transactions, onExportCsv }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<TransactionCategory | 'ALL'>('ALL');

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return transactions.filter((tx) => {
      if (statusFilter !== 'ALL' && tx.compliance_status !== statusFilter) return false;
      if (categoryFilter !== 'ALL' && tx.category !== categoryFilter) return false;
      if (q) {
        const hay = `${tx.date} ${tx.raw_description} ${tx.normalized_merchant} ${CATEGORY_META[tx.category].label}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [transactions, searchQuery, statusFilter, categoryFilter]);

  const counts = useMemo(() => {
    let permissible = 0;
    let warning = 0;
    let prohibited = 0;
    for (const tx of transactions) {
      if (tx.compliance_status === 'PROHIBITED') prohibited += 1;
      else if (tx.compliance_status === 'WARNING_REVIEW') warning += 1;
      else permissible += 1;
    }
    return { all: transactions.length, permissible, warning, prohibited };
  }, [transactions]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      {/* Table Toolbar */}
      <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="font-display text-sm font-semibold text-slate-900">
            Extracted Transaction Ledger
          </h2>
          <p className="text-xs text-slate-500">
            Showing {filtered.length} of {transactions.length} chronological entries
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Segmented Status Filter */}
          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
            {(
              [
                { id: 'ALL', label: `All (${counts.all})` },
                { id: 'PERMISSIBLE', label: `Permissible (${counts.permissible})` },
                { id: 'WARNING_REVIEW', label: `Review (${counts.warning})` },
                { id: 'PROHIBITED', label: `Prohibited (${counts.prohibited})` },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  statusFilter === tab.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search Input */}
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search merchant or description..."
              className="h-8 w-52 rounded-lg border border-slate-300 bg-white pr-3 pl-8 text-xs text-slate-900 placeholder:text-slate-400 focus:border-emerald-700 focus:outline-none"
            />
          </div>

          {/* Category Dropdown */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as TransactionCategory | 'ALL')}
            aria-label="Filter by category"
            className="h-8 rounded-lg border border-slate-300 bg-white px-2.5 text-xs text-slate-700 focus:border-emerald-700 focus:outline-none"
          >
            <option value="ALL">All Categories</option>
            {(Object.keys(CATEGORY_META) as TransactionCategory[]).map((cat) => (
              <option key={cat} value={cat}>
                {CATEGORY_META[cat].label}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={onExportCsv}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </button>
        </div>
      </div>

      {/* High-Density Data Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
            <tr>
              <th className="w-10 px-4 py-2.5 font-semibold">#</th>
              <th className="px-4 py-2.5 font-semibold whitespace-nowrap">Date</th>
              <th className="px-4 py-2.5 font-semibold">Merchant & Description</th>
              <th className="px-4 py-2.5 font-semibold whitespace-nowrap">Category</th>
              <th className="px-4 py-2.5 font-semibold whitespace-nowrap">Compliance</th>
              <th className="px-4 py-2.5 text-right font-semibold whitespace-nowrap">Debit (R)</th>
              <th className="px-4 py-2.5 text-right font-semibold whitespace-nowrap">Credit (R)</th>
              <th className="px-4 py-2.5 text-right font-semibold whitespace-nowrap">Balance (R)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-xs text-slate-500">
                  No transactions match the current search or filter criteria.
                </td>
              </tr>
            ) : (
              filtered.map((tx) => {
                const isProhibited = tx.compliance_status === 'PROHIBITED';
                const isWarning = tx.compliance_status === 'WARNING_REVIEW';
                const isCredit = tx.type === 'CREDIT';

                return (
                  <tr
                    key={tx.id}
                    className={`transition-colors hover:bg-slate-50 ${
                      isProhibited
                        ? 'bg-red-50/40 hover:bg-red-50/70'
                        : isWarning
                          ? 'bg-amber-50/40 hover:bg-amber-50/70'
                          : ''
                    }`}
                  >
                    <td className="px-4 py-2.5 font-mono text-[11px] text-slate-400 tabular-nums">
                      {tx.rowIndex}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-slate-600 whitespace-nowrap tabular-nums">
                      {tx.date}
                    </td>
                    <td className="max-w-md px-4 py-2.5">
                      <div className="font-medium text-slate-900">{tx.normalized_merchant}</div>
                      {tx.raw_description !== tx.normalized_merchant && (
                        <div className="truncate text-[11px] text-slate-500">
                          {tx.raw_description}
                        </div>
                      )}
                      {tx.flag_reason && tx.compliance_status !== 'PERMISSIBLE' && (
                        <div className="mt-0.5 text-[11px] text-red-700">{tx.flag_reason}</div>
                      )}
                      {tx.override && (
                        <div className="mt-0.5 text-[11px] text-emerald-700">
                          Overridden by {tx.override.overriddenBy}: {tx.override.note}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-slate-700 whitespace-nowrap">
                      {CATEGORY_META[tx.category].shortLabel}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      {isProhibited ? (
                        <span className="inline-flex items-center gap-1 font-medium text-red-700">
                          <Ban className="h-3.5 w-3.5 shrink-0" />
                          Prohibited
                        </span>
                      ) : isWarning ? (
                        <span className="inline-flex items-center gap-1 font-medium text-amber-700">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                          Review
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 font-medium text-emerald-700">
                          <Check className="h-3.5 w-3.5 shrink-0" />
                          {tx.override ? 'Overridden' : 'Permissible'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-slate-900 whitespace-nowrap tabular-nums">
                      {!isCredit ? formatZar(tx.amount) : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-emerald-700 whitespace-nowrap tabular-nums">
                      {isCredit ? formatZar(tx.amount) : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-slate-700 whitespace-nowrap tabular-nums">
                      {tx.balance !== null ? formatZar(tx.balance) : '—'}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
