import React, { useState } from 'react';
import { CATEGORY_META, formatZar } from '../shared/auditEngine.ts';
import type { CategorySummary, MonthlyBreakdown, TransactionCategory } from '../shared/types.ts';

interface SpendingChartsProps {
  categorySummaries: CategorySummary[];
  monthlyBreakdowns: MonthlyBreakdown[];
  monthlyBaselineZar: number;
  totalDisbursedZar: number;
}

export const SpendingCharts: React.FC<SpendingChartsProps> = ({
  categorySummaries,
  monthlyBreakdowns,
  monthlyBaselineZar,
  totalDisbursedZar,
}) => {
  const [hoveredCategory, setHoveredCategory] = useState<TransactionCategory | null>(null);
  const [hoveredMonth, setHoveredMonth] = useState<MonthlyBreakdown | null>(null);

  const nonZeroCategories = categorySummaries.filter((c) => c.totalZar > 0);
  const totalOutflow = nonZeroCategories.reduce((sum, c) => sum + c.totalZar, 0);

  // Donut SVG geometry
  const size = 196;
  const strokeWidth = 28;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  let cumulativeOffset = 0;
  const slices = nonZeroCategories.map((cat) => {
    const fraction = totalOutflow > 0 ? cat.totalZar / totalOutflow : 0;
    const dashLength = fraction * circumference;
    const slice = {
      ...cat,
      color: CATEGORY_META[cat.category].color,
      dashArray: `${dashLength} ${circumference - dashLength}`,
      dashOffset: -cumulativeOffset,
    };
    cumulativeOffset += dashLength;
    return slice;
  });

  const activeSlice = hoveredCategory
    ? slices.find((s) => s.category === hoveredCategory) ?? null
    : null;

  // Bar Chart scaling
  const maxMonthSpend = Math.max(
    monthlyBaselineZar * 1.15,
    ...monthlyBreakdowns.map(
      (m) => m.permissibleSpendZar + m.prohibitedSpendZar + m.warningSpendZar
    )
  );

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
      {/* Category Breakdown Card */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 xl:col-span-5">
        <div className="mb-4 flex items-baseline justify-between gap-2">
          <div>
            <h2 className="font-display text-sm font-semibold text-slate-900">
              Spending by NSFAS Category
            </h2>
            <p className="text-xs text-slate-500">
              Share of {formatZar(totalDisbursedZar)} disbursed allowance
            </p>
          </div>
          <span className="font-mono text-xs text-slate-500 tabular-nums">
            Total Outflow: {formatZar(totalOutflow)}
          </span>
        </div>

        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
          {/* Interactive SVG Donut */}
          <div className="relative shrink-0" style={{ width: size, height: size }}>
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke="#f1f5f9"
                strokeWidth={strokeWidth}
              />
              {slices.map((slice) => {
                const isDimmed = hoveredCategory && hoveredCategory !== slice.category;
                return (
                  <circle
                    key={slice.category}
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke={slice.color}
                    strokeWidth={hoveredCategory === slice.category ? strokeWidth + 4 : strokeWidth}
                    strokeDasharray={slice.dashArray}
                    strokeDashoffset={slice.dashOffset}
                    opacity={isDimmed ? 0.35 : 1}
                    className="cursor-pointer transition-opacity duration-150"
                    onMouseEnter={() => setHoveredCategory(slice.category)}
                    onMouseLeave={() => setHoveredCategory(null)}
                  />
                );
              })}
            </svg>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-4 text-center">
              <span className="text-[11px] font-medium text-slate-500">
                {activeSlice ? CATEGORY_META[activeSlice.category].shortLabel : 'Total Spend'}
              </span>
              <span className="font-mono text-sm font-semibold text-slate-900 tabular-nums">
                {activeSlice ? formatZar(activeSlice.totalZar) : formatZar(totalOutflow)}
              </span>
              {activeSlice && (
                <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                  {activeSlice.percentOfAllowance.toFixed(1)}% allowance
                </span>
              )}
            </div>
          </div>

          {/* Tabular Category Legend */}
          <div className="w-full min-w-0 flex-1 divide-y divide-slate-100">
            {slices.map((slice) => (
              <div
                key={slice.category}
                onMouseEnter={() => setHoveredCategory(slice.category)}
                onMouseLeave={() => setHoveredCategory(null)}
                className={`flex cursor-default items-center justify-between gap-2 py-2 text-xs transition-colors ${
                  hoveredCategory === slice.category ? 'bg-slate-50' : ''
                }`}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-xs"
                    style={{ backgroundColor: slice.color }}
                    aria-hidden="true"
                  />
                  <span
                    className={`truncate font-medium ${
                      slice.isPermissible ? 'text-slate-700' : 'text-red-700'
                    }`}
                  >
                    {CATEGORY_META[slice.category].shortLabel}
                  </span>
                  <span className="shrink-0 text-[11px] text-slate-400 tabular-nums">
                    ({slice.transactionCount})
                  </span>
                </div>
                <div className="flex shrink-0 items-baseline gap-2.5 font-mono tabular-nums">
                  <span className="font-medium text-slate-900">{formatZar(slice.totalZar)}</span>
                  <span className="w-11 text-right text-[11px] text-slate-500">
                    {slice.percentOfAllowance.toFixed(1)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Monthly Allowance Utilization Chart */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 xl:col-span-7">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h2 className="font-display text-sm font-semibold text-slate-900">
              Monthly Allowance Utilization vs. {formatZar(monthlyBaselineZar)} Baseline
            </h2>
            <p className="text-xs text-slate-500">
              Permissible essentials stacked against flagged review and prohibited spending
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs text-slate-600">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-xs bg-[#0F4C3A]" aria-hidden="true" />
              Permissible
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-xs bg-amber-500" aria-hidden="true" />
              Review
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-xs bg-red-600" aria-hidden="true" />
              Prohibited
            </span>
          </div>
        </div>

        {monthlyBreakdowns.length === 0 ? (
          <div className="flex h-52 items-center justify-center text-xs text-slate-500">
            No monthly breakdown available.
          </div>
        ) : (
          <div className="space-y-3">
            {/* Hover Detail Strip */}
            <div className="flex h-7 items-center justify-between rounded-lg bg-slate-50 px-3 text-xs text-slate-600">
              {hoveredMonth ? (
                <>
                  <span className="font-semibold text-slate-900">{hoveredMonth.label}</span>
                  <div className="flex items-center gap-4 font-mono tabular-nums">
                    <span className="text-emerald-700">
                      Permissible: {formatZar(hoveredMonth.permissibleSpendZar)}
                    </span>
                    {hoveredMonth.warningSpendZar > 0 && (
                      <span className="text-amber-700">
                        Review: {formatZar(hoveredMonth.warningSpendZar)}
                      </span>
                    )}
                    {hoveredMonth.prohibitedSpendZar > 0 && (
                      <span className="text-red-700">
                        Prohibited: {formatZar(hoveredMonth.prohibitedSpendZar)}
                      </span>
                    )}
                    <span className="text-slate-700">
                      Util: {hoveredMonth.utilizationPct.toFixed(0)}%
                    </span>
                  </div>
                </>
              ) : (
                <span className="text-slate-500">
                  Hover over any month bar to inspect monthly allowance breakdown
                </span>
              )}
            </div>

            {/* Stacked Vertical Bars */}
            <div className="relative pt-4">
              {/* Baseline dashed reference line */}
              <div
                className="pointer-events-none absolute right-0 left-0 border-t border-dashed border-slate-300"
                style={{
                  bottom: `${Math.min(100, (monthlyBaselineZar / maxMonthSpend) * 100) * 1.76 + 24}px`,
                }}
              >
                <span className="absolute -top-4 right-0 bg-white px-1 font-mono text-[10px] text-slate-500 tabular-nums">
                  Cap {formatZar(monthlyBaselineZar)}
                </span>
              </div>

              <div
                className="grid items-end gap-2"
                style={{
                  gridTemplateColumns: `repeat(${monthlyBreakdowns.length}, minmax(0, 1fr))`,
                }}
              >
                {monthlyBreakdowns.map((m) => {
                  const permHeight = Math.round((m.permissibleSpendZar / maxMonthSpend) * 176);
                  const warnHeight = Math.round((m.warningSpendZar / maxMonthSpend) * 176);
                  const probHeight = Math.round((m.prohibitedSpendZar / maxMonthSpend) * 176);
                  return (
                    <div
                      key={m.monthKey}
                      onMouseEnter={() => setHoveredMonth(m)}
                      onMouseLeave={() => setHoveredMonth(null)}
                      className="flex flex-col items-center gap-1.5"
                    >
                      <div className="flex h-44 w-full max-w-10 flex-col justify-end overflow-hidden rounded-t-md bg-slate-100/60">
                        {probHeight > 0 && (
                          <div
                            style={{ height: `${probHeight}px` }}
                            className="w-full bg-red-600 transition-opacity"
                          />
                        )}
                        {warnHeight > 0 && (
                          <div
                            style={{ height: `${warnHeight}px` }}
                            className="w-full bg-amber-500 transition-opacity"
                          />
                        )}
                        {permHeight > 0 && (
                          <div
                            style={{ height: `${permHeight}px` }}
                            className="w-full bg-[#0F4C3A] transition-opacity"
                          />
                        )}
                      </div>
                      <span className="truncate font-mono text-[11px] text-slate-600 tabular-nums">
                        {m.monthKey}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
