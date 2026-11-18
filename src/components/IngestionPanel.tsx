import { FileText, ShieldCheck, ShieldAlert, Upload, ArrowUpRight, AlertCircle } from 'lucide-react';
import React, { useRef, useState } from 'react';
import type { SampleStatementInfo } from '../shared/types.ts';

interface IngestionPanelProps {
  samples: SampleStatementInfo[];
  isAnalyzing: boolean;
  error: string | null;
  onUploadFile: (file: File) => void;
  onRunSample: (sampleId: 'compliant' | 'flagged') => void;
  onClearError: () => void;
}

const MAX_SIZE_BYTES = 25 * 1024 * 1024;
const ALLOWED_EXTENSIONS = ['.pdf', '.png', '.jpg', '.jpeg'];

export const IngestionPanel: React.FC<IngestionPanelProps> = ({
  samples,
  isAnalyzing,
  error,
  onUploadFile,
  onRunSample,
  onClearError,
}) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const validateAndDispatch = (file: File | undefined) => {
    if (!file) return;
    setLocalError(null);
    onClearError();

    const lowerName = file.name.toLowerCase();
    const validExt = ALLOWED_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
    if (!validExt) {
      setLocalError('Unsupported format. Upload a .pdf, .png, or .jpg student bank statement.');
      return;
    }

    if (file.size > MAX_SIZE_BYTES) {
      setLocalError('File exceeds the 25 MB limit. Please compress or split the statement.');
      return;
    }

    onUploadFile(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (isAnalyzing) return;
    validateAndDispatch(e.dataTransfer.files[0]);
  };

  const activeError = localError || error;

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="space-y-2">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          NSFAS Living Allowance Statement Audit
        </h1>
        <p className="max-w-3xl text-sm leading-relaxed text-slate-600 sm:text-base">
          Upload a student bank or digital wallet statement to extract line-item transactions,
          reconcile opening and closing balances, and evaluate spending against DHET/NSFAS
          living allowance guidelines.
        </p>
      </div>

      {activeError && (
        <div
          role="alert"
          className="flex items-start justify-between gap-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          <div className="flex items-start gap-2.5">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
            <span>{activeError}</span>
          </div>
          <button
            type="button"
            onClick={() => {
              setLocalError(null);
              onClearError();
            }}
            className="shrink-0 text-xs font-medium text-red-700 underline underline-offset-2 hover:text-red-900"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Primary Upload Zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!isAnalyzing) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`rounded-xl border border-dashed bg-white p-8 text-center transition-colors sm:p-12 ${
          isDragging
            ? 'border-emerald-700 bg-emerald-50/40'
            : 'border-slate-300 hover:border-slate-400'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
          className="sr-only"
          onChange={(e) => {
            validateAndDispatch(e.target.files?.[0]);
            e.target.value = '';
          }}
        />

        <div className="mx-auto flex max-w-md flex-col items-center space-y-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700">
            <Upload className="h-5 w-5" />
          </div>
          <div className="space-y-1.5">
            <h2 className="font-display text-base font-semibold text-slate-900">
              Drop student statement here to begin audit
            </h2>
            <p className="text-xs text-slate-500">
              PDF, PNG, or JPEG up to 25 MB · Multi-page 12-month ledgers supported
            </p>
          </div>
          <button
            type="button"
            disabled={isAnalyzing}
            onClick={() => inputRef.current?.click()}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#0F4C3A] px-5 text-sm font-medium text-white transition-colors hover:bg-[#0B3B2D] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            Select Statement File
          </button>
        </div>
      </div>

      {/* QA Benchmark Test Statements */}
      <div className="space-y-3">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="font-display text-base font-semibold text-slate-900">
            QA Verification Statements
          </h2>
          <span className="text-xs text-slate-500">
            Run live extraction against reference 12-month PDF test cases
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {samples.map((sample) => {
            const isCompliantCase = sample.id === 'compliant';
            return (
              <div
                key={sample.id}
                className="flex flex-col justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1.5 font-medium text-slate-700">
                      {isCompliantCase ? (
                        <ShieldCheck className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <ShieldAlert className="h-4 w-4 text-red-600" />
                      )}
                      {isCompliantCase ? 'Baseline Compliant Case' : 'Non-Compliant Red-Flag Case'}
                    </span>
                    <span className="font-mono text-[11px] text-slate-500">
                      Expected: {sample.expectedOutcome}
                    </span>
                  </div>
                  <h3 className="font-display text-sm font-semibold text-slate-900">
                    {sample.title}
                  </h3>
                  <p className="text-xs leading-relaxed text-slate-600">{sample.subtitle}</p>
                </div>

                <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
                  <a
                    href={`/api/samples/${sample.id}/download`}
                    download={sample.fileName}
                    className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 whitespace-nowrap shrink-0"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    Download PDF
                    <ArrowUpRight className="h-3 w-3" />
                  </a>
                  <button
                    type="button"
                    disabled={isAnalyzing}
                    onClick={() => onRunSample(sample.id)}
                    className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap shrink-0"
                  >
                    Run Live Audit
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* DHET / NSFAS Policy Matrix Reference */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="border-b border-slate-200 px-5 py-3.5">
          <h2 className="font-display text-sm font-semibold text-slate-900">
            DHET & NSFAS Living Allowance Classification Policy (R 1,760.00 / Month Baseline)
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
              <tr>
                <th className="px-5 py-2.5 font-semibold">Category</th>
                <th className="px-5 py-2.5 font-semibold">Permissible Expenditures</th>
                <th className="px-5 py-2.5 font-semibold">Prohibited / Flagged Triggers</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              <tr>
                <td className="px-5 py-3 font-medium text-slate-900 whitespace-nowrap">
                  Food & Groceries
                </td>
                <td className="px-5 py-3">
                  Staple groceries, fresh produce, pantry items, meat/dairy, basic campus meals.
                </td>
                <td className="px-5 py-3 text-red-700">
                  Alcoholic beverages, bottle stores (Tops, LiquorCity, Ultra Liquors), tobacco, vaping.
                </td>
              </tr>
              <tr>
                <td className="px-5 py-3 font-medium text-slate-900 whitespace-nowrap">
                  Personal Care & Hygiene
                </td>
                <td className="px-5 py-3">
                  Essential toiletries, sanitary products, detergent, OTC pharmacy essentials (Clicks, Dis-Chem).
                </td>
                <td className="px-5 py-3 text-red-700">
                  Luxury cosmetics, high-end fragrances, designer apparel, non-essential salon spend.
                </td>
              </tr>
              <tr>
                <td className="px-5 py-3 font-medium text-slate-900 whitespace-nowrap">
                  Academic & Data Costs
                </td>
                <td className="px-5 py-3">
                  Supplementary stationery, printing/binding credits, mobile data bundles for study portals.
                </td>
                <td className="px-5 py-3 text-red-700">
                  Entertainment streaming subscriptions, PlayStation/Steam gaming credits.
                </td>
              </tr>
              <tr>
                <td className="px-5 py-3 font-medium text-slate-900 whitespace-nowrap">
                  Financial Conduct & Transit
                </td>
                <td className="px-5 py-3">
                  Direct POS swipes at registered merchants, municipal bus/Metrorail commuter smartcards.
                </td>
                <td className="px-5 py-3 text-amber-700">
                  Sports betting (Betway, Hollywoodbets, Supabets, LottoStar) and unverified P2P / ATM cash-outs.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
