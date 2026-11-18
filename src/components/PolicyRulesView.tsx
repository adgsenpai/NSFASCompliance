import { Plus, RotateCcw, X } from 'lucide-react';
import React, { useState } from 'react';
import { DEFAULT_POLICY_CONFIG, formatZar } from '../shared/auditEngine.ts';
import type { PolicyConfig } from '../shared/types.ts';

interface PolicyRulesViewProps {
  policyConfig: PolicyConfig;
  hasActiveAudit: boolean;
  onUpdatePolicy: (nextPolicy: PolicyConfig) => void;
}

export const PolicyRulesView: React.FC<PolicyRulesViewProps> = ({
  policyConfig,
  hasActiveAudit,
  onUpdatePolicy,
}) => {
  const [draft, setDraft] = useState<PolicyConfig>(policyConfig);
  const [newProhibited, setNewProhibited] = useState('');
  const [newPermissible, setNewPermissible] = useState('');
  const [savedNotice, setSavedNotice] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdatePolicy(draft);
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2500);
  };

  const handleReset = () => {
    setDraft(DEFAULT_POLICY_CONFIG);
    onUpdatePolicy(DEFAULT_POLICY_CONFIG);
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2500);
  };

  const addKeyword = (kind: 'prohibited' | 'permissible') => {
    const val = (kind === 'prohibited' ? newProhibited : newPermissible).trim();
    if (!val) return;
    if (kind === 'prohibited') {
      if (!draft.customProhibitedKeywords.includes(val)) {
        setDraft({
          ...draft,
          customProhibitedKeywords: [...draft.customProhibitedKeywords, val],
        });
      }
      setNewProhibited('');
    } else {
      if (!draft.customPermissibleKeywords.includes(val)) {
        setDraft({
          ...draft,
          customPermissibleKeywords: [...draft.customPermissibleKeywords, val],
        });
      }
      setNewPermissible('');
    }
  };

  const removeKeyword = (kind: 'prohibited' | 'permissible', kw: string) => {
    if (kind === 'prohibited') {
      setDraft({
        ...draft,
        customProhibitedKeywords: draft.customProhibitedKeywords.filter((item) => item !== kw),
      });
    } else {
      setDraft({
        ...draft,
        customPermissibleKeywords: draft.customPermissibleKeywords.filter((item) => item !== kw),
      });
    }
  };

  return (
    <form onSubmit={handleSave} className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-xl font-semibold text-slate-900">
            Deterministic Compliance Rules & Thresholds
          </h1>
          <p className="text-xs text-slate-600">
            Configure institutional allowance caps, P2P cash-out warning triggers, and custom
            merchant keyword rules.{' '}
            {hasActiveAudit
              ? 'Saving immediately re-evaluates the active statement.'
              : 'Changes apply to all subsequent audits.'}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset Defaults
          </button>
          <button
            type="submit"
            className="inline-flex h-9 items-center rounded-lg bg-[#0F4C3A] px-4 text-xs font-medium text-white hover:bg-[#0B3B2D] whitespace-nowrap shrink-0"
          >
            {savedNotice ? 'Rules Applied' : 'Apply Policy Rules'}
          </button>
        </div>
      </div>

      {/* Numeric Thresholds */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-4 font-display text-sm font-semibold text-slate-900">
          Allowance & Risk Thresholds
        </h2>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-700">
              Monthly Living Allowance Baseline (ZAR)
            </label>
            <input
              type="number"
              step="10"
              min="100"
              value={draft.monthlyBaselineZar}
              onChange={(e) =>
                setDraft({ ...draft, monthlyBaselineZar: Number(e.target.value) || 1760 })
              }
              className="h-10 w-full rounded-lg border border-slate-300 px-3 font-mono text-sm text-slate-900 focus:border-emerald-700 focus:outline-none tabular-nums"
            />
            <p className="mt-1 text-[11px] text-slate-500">
              Standard DHET/NSFAS baseline is {formatZar(1760)} per academic month.
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-700">
              Unverified Cash / P2P Review Trigger (%)
            </label>
            <input
              type="number"
              step="1"
              min="0"
              max="100"
              value={draft.cashP2pWarningPct}
              onChange={(e) =>
                setDraft({ ...draft, cashP2pWarningPct: Number(e.target.value) || 0 })
              }
              className="h-10 w-full rounded-lg border border-slate-300 px-3 font-mono text-sm text-slate-900 focus:border-emerald-700 focus:outline-none tabular-nums"
            />
            <p className="mt-1 text-[11px] text-slate-500">
              Statements exceeding this % of unverified cash-outs trigger FLAGGED_REVIEW.
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-700">
              Non-Permissible Spend Failure Threshold (%)
            </label>
            <input
              type="number"
              step="0.5"
              min="0"
              max="100"
              value={draft.nonPermissibleFailPct}
              onChange={(e) =>
                setDraft({ ...draft, nonPermissibleFailPct: Number(e.target.value) || 0 })
              }
              className="h-10 w-full rounded-lg border border-slate-300 px-3 font-mono text-sm text-slate-900 focus:border-emerald-700 focus:outline-none tabular-nums"
            />
            <p className="mt-1 text-[11px] text-slate-500">
              Any confirmed gambling/alcohol spend or cumulative prohibited spend above this % triggers NON_COMPLIANT.
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-700">
              Minimum Classification Confidence (0.50 – 1.00)
            </label>
            <input
              type="number"
              step="0.05"
              min="0.5"
              max="1"
              value={draft.confidenceThreshold}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  confidenceThreshold: Math.min(1, Math.max(0.5, Number(e.target.value) || 0.8)),
                })
              }
              className="h-10 w-full rounded-lg border border-slate-300 px-3 font-mono text-sm text-slate-900 focus:border-emerald-700 focus:outline-none tabular-nums"
            />
            <p className="mt-1 text-[11px] text-slate-500">
              Ambiguous merchants below this score are routed to WARNING_REVIEW.
            </p>
          </div>
        </div>
      </div>

      {/* Custom Merchant Keyword Lists */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Prohibited Blacklist */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="font-display text-sm font-semibold text-slate-900">
            Custom Prohibited Merchant Keywords
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Merchants matching these strings are deterministically flagged as PROHIBITED.
          </p>

          <div className="mt-3 flex gap-2">
            <input
              type="text"
              value={newProhibited}
              onChange={(e) => setNewProhibited(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addKeyword('prohibited');
                }
              }}
              placeholder="e.g., Nightclub, TicketPro"
              className="h-9 flex-1 rounded-lg border border-slate-300 px-3 text-xs text-slate-900 focus:border-emerald-700 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => addKeyword('prohibited')}
              className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              <Plus className="h-3.5 w-3.5" />
              Add
            </button>
          </div>

          <div className="mt-4 divide-y divide-slate-100">
            {draft.customProhibitedKeywords.length === 0 ? (
              <p className="text-xs text-slate-400">
                No custom prohibited keywords configured (using built-in gambling, liquor, tobacco & gaming rules).
              </p>
            ) : (
              draft.customProhibitedKeywords.map((kw) => (
                <div key={kw} className="flex items-center justify-between py-2 text-xs">
                  <span className="font-mono text-red-700">{kw}</span>
                  <button
                    type="button"
                    onClick={() => removeKeyword('prohibited', kw)}
                    className="text-slate-400 hover:text-red-700"
                    aria-label={`Remove ${kw}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Permissible Whitelist */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="font-display text-sm font-semibold text-slate-900">
            Custom Permissible Merchant Whitelist
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Approved campus canteens or local transport vendors exempt from review flags.
          </p>

          <div className="mt-3 flex gap-2">
            <input
              type="text"
              value={newPermissible}
              onChange={(e) => setNewPermissible(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addKeyword('permissible');
                }
              }}
              placeholder="e.g., UCT Campus Tuckshop"
              className="h-9 flex-1 rounded-lg border border-slate-300 px-3 text-xs text-slate-900 focus:border-emerald-700 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => addKeyword('permissible')}
              className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              <Plus className="h-3.5 w-3.5" />
              Add
            </button>
          </div>

          <div className="mt-4 divide-y divide-slate-100">
            {draft.customPermissibleKeywords.length === 0 ? (
              <p className="text-xs text-slate-400">
                No custom whitelist overrides configured.
              </p>
            ) : (
              draft.customPermissibleKeywords.map((kw) => (
                <div key={kw} className="flex items-center justify-between py-2 text-xs">
                  <span className="font-mono text-emerald-700">{kw}</span>
                  <button
                    type="button"
                    onClick={() => removeKeyword('permissible', kw)}
                    className="text-slate-400 hover:text-red-700"
                    aria-label={`Remove ${kw}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </form>
  );
};
