import { AlertTriangle, Ban, CheckCircle2, RotateCcw, ShieldCheck } from 'lucide-react';
import React, { useState } from 'react';
import { CATEGORY_META, formatZar } from '../shared/auditEngine.ts';
import type { AuditedTransaction } from '../shared/types.ts';

interface FlaggedPanelProps {
  transactions: AuditedTransaction[];
  onOverrideTransaction: (txId: string, officerName: string, note: string) => void;
  onRestoreFlag: (txId: string) => void;
}

export const FlaggedPanel: React.FC<FlaggedPanelProps> = ({
  transactions,
  onOverrideTransaction,
  onRestoreFlag,
}) => {
  const [editingTxId, setEditingTxId] = useState<string | null>(null);
  const [officerName, setOfficerName] = useState('Bursary Compliance Officer');
  const [overrideNote, setOverrideNote] = useState('');

  const flaggedItems = transactions.filter(
    (t) => t.compliance_status !== 'PERMISSIBLE' || Boolean(t.override)
  );

  const handleSaveOverride = (txId: string) => {
    if (!overrideNote.trim()) return;
    onOverrideTransaction(txId, officerName.trim() || 'Compliance Officer', overrideNote.trim());
    setEditingTxId(null);
    setOverrideNote('');
  };

  if (flaggedItems.length === 0) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-5">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          <div className="space-y-1">
            <h2 className="font-display text-sm font-semibold text-emerald-950">
              No Flagged or Prohibited Transactions Detected
            </h2>
            <p className="text-xs leading-relaxed text-emerald-800">
              All extracted ledger rows conform to DHET/NSFAS living allowance guidelines with zero
              prohibited merchants or unverified high-risk transfers.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3.5">
        <div className="space-y-0.5">
          <h2 className="font-display text-sm font-semibold text-slate-900">
            Flagged Transactions & Officer Evidence ({flaggedItems.length})
          </h2>
          <p className="text-xs text-slate-500">
            Prohibited purchases and unverified cash-outs requiring bursary review or documented override
          </p>
        </div>
      </div>

      <div className="divide-y divide-slate-200">
        {flaggedItems.map((tx) => {
          const isProhibited = tx.compliance_status === 'PROHIBITED';
          const isOverridden = Boolean(tx.override);
          const isEditing = editingTxId === tx.id;

          return (
            <div
              key={tx.id}
              className={`px-5 py-4 transition-colors ${
                isOverridden
                  ? 'bg-slate-50/60'
                  : isProhibited
                    ? 'bg-red-50/35'
                    : 'bg-amber-50/35'
              }`}
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs">
                    {isOverridden ? (
                      <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                        <ShieldCheck className="h-3.5 w-3.5" />
                        Overridden · Permissible
                      </span>
                    ) : isProhibited ? (
                      <span className="inline-flex items-center gap-1 font-semibold text-red-700">
                        <Ban className="h-3.5 w-3.5" />
                        Prohibited
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 font-semibold text-amber-700">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        Review Required
                      </span>
                    )}
                    <span className="text-slate-300" aria-hidden="true">
                      ·
                    </span>
                    <span className="font-mono text-slate-600 tabular-nums">{tx.date}</span>
                    <span className="text-slate-300" aria-hidden="true">
                      ·
                    </span>
                    <span className="font-medium text-slate-700">
                      {CATEGORY_META[tx.category].label}
                    </span>
                    <span className="text-slate-300" aria-hidden="true">
                      ·
                    </span>
                    <span className="font-mono text-slate-500 tabular-nums">
                      Confidence {Math.round(tx.confidence_score * 100)}%
                    </span>
                  </div>

                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="font-display text-sm font-semibold text-slate-900">
                      {tx.normalized_merchant}
                    </span>
                    <span className="text-xs text-slate-500">{tx.raw_description}</span>
                  </div>

                  <p className="text-xs leading-relaxed text-slate-600">
                    {tx.flag_reason || tx.deterministic_rule_applied}
                  </p>

                  {tx.override && (
                    <p className="text-xs text-emerald-800">
                      <span className="font-semibold">Override Note ({tx.override.overriddenBy}):</span>{' '}
                      {tx.override.note}
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 items-center justify-between gap-4 lg:flex-col lg:items-end">
                  <span
                    className={`font-mono text-base font-semibold tabular-nums ${
                      isOverridden
                        ? 'text-slate-500 line-through'
                        : isProhibited
                          ? 'text-red-700'
                          : 'text-amber-700'
                    }`}
                  >
                    {formatZar(tx.amount)}
                  </span>

                  {isOverridden ? (
                    <button
                      type="button"
                      onClick={() => onRestoreFlag(tx.id)}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Restore Flag
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingTxId(isEditing ? null : tx.id);
                        setOverrideNote('');
                      }}
                      className="inline-flex h-8 items-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
                    >
                      {isEditing ? 'Cancel' : 'Officer Override'}
                    </button>
                  )}
                </div>
              </div>

              {isEditing && (
                <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3.5">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-700">
                        Officer Name
                      </label>
                      <input
                        type="text"
                        value={officerName}
                        onChange={(e) => setOfficerName(e.target.value)}
                        className="h-9 w-full rounded-lg border border-slate-300 px-3 text-xs text-slate-900 focus:border-emerald-700 focus:outline-none"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="mb-1 block text-xs font-medium text-slate-700">
                        Audit Justification (Required for PDF Report)
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={overrideNote}
                          onChange={(e) => setOverrideNote(e.target.value)}
                          placeholder="e.g., Verified till slip #4412 confirms staple groceries / transport fare"
                          className="h-9 flex-1 rounded-lg border border-slate-300 px-3 text-xs text-slate-900 focus:border-emerald-700 focus:outline-none"
                        />
                        <button
                          type="button"
                          disabled={!overrideNote.trim()}
                          onClick={() => handleSaveOverride(tx.id)}
                          className="inline-flex h-9 items-center rounded-lg bg-[#0F4C3A] px-4 text-xs font-medium text-white hover:bg-[#0B3B2D] disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap shrink-0"
                        >
                          Approve Override
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
