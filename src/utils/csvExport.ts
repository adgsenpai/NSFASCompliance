import { CATEGORY_META } from '../shared/auditEngine.ts';
import type { AuditResult } from '../shared/types.ts';

function escapeCsv(value: string | number | null | undefined): string {
  const str = value === null || value === undefined ? '' : String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportLedgerCsv(audit: AuditResult): void {
  const headers = [
    'Row',
    'Date',
    'Month',
    'Raw Description',
    'Normalized Merchant',
    'Type',
    'Amount (ZAR)',
    'Balance (ZAR)',
    'Category',
    'Compliance Status',
    'Confidence',
    'Flag Reason / Policy Rationale',
    'Officer Override Note',
  ];

  const rows = audit.transactions.map((tx) => [
    tx.rowIndex,
    tx.date,
    tx.monthLabel,
    tx.raw_description,
    tx.normalized_merchant,
    tx.type,
    tx.amount.toFixed(2),
    tx.balance !== null ? tx.balance.toFixed(2) : '',
    CATEGORY_META[tx.category].label,
    tx.compliance_status,
    `${Math.round(tx.confidence_score * 100)}%`,
    tx.flag_reason,
    tx.override ? `${tx.override.overriddenBy}: ${tx.override.note}` : '',
  ]);

  const csvContent = [
    headers.map(escapeCsv).join(','),
    ...rows.map((r) => r.map(escapeCsv).join(',')),
  ].join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const safeFile = audit.fileName.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
  link.href = url;
  link.download = `NSFAS_Ledger_${safeFile}_${audit.auditId}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
