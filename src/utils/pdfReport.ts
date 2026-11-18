import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { CATEGORY_META, formatZar } from '../shared/auditEngine.ts';
import type { AuditResult } from '../shared/types.ts';

export function exportSignedAuditPdf(audit: AuditResult, officerName = 'Compliance Officer'): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  // Institutional header bar
  doc.setFillColor(15, 41, 34); // #0F2922
  doc.rect(0, 0, pageWidth, 26, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('NSFAS LIVING ALLOWANCE COMPLIANCE AUDIT REPORT', 14, 12);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(
    `Audit ID: ${audit.auditId}   |   Generated: ${new Date().toLocaleString('en-ZA')}   |   Statement: ${audit.fileName}`,
    14,
    19
  );

  // Verdict Banner
  let verdictColor: [number, number, number] = [22, 163, 74];
  let verdictTitle = 'COMPLIANT';
  if (audit.verdict === 'NON_COMPLIANT') {
    verdictColor = [220, 38, 38];
    verdictTitle = 'NON-COMPLIANT';
  } else if (audit.verdict === 'FLAGGED_REVIEW') {
    verdictColor = [217, 119, 6];
    verdictTitle = 'FLAGGED FOR OFFICER REVIEW';
  }

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.rect(14, 32, pageWidth - 28, 24, 'FD');

  doc.setTextColor(verdictColor[0], verdictColor[1], verdictColor[2]);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(`COMPLIANCE VERDICT: ${verdictTitle}`, 18, 40);

  doc.setTextColor(51, 65, 85);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const reasonLine = audit.verdictReasons.join(' ');
  const splitReason = doc.splitTextToSize(reasonLine, pageWidth - 36);
  doc.text(splitReason.slice(0, 2), 18, 46);

  // Account Metadata & Reconciliation Summary
  autoTable(doc, {
    startY: 61,
    head: [['Account & Statement Profile', 'Value', 'Mathematical Reconciliation (ZAR)', 'Amount / Status']],
    body: [
      [
        'Account Holder',
        audit.account_metadata.account_holder,
        'Opening Balance',
        formatZar(audit.reconciliation.openingBalance),
      ],
      [
        'Bank / Wallet Provider',
        audit.account_metadata.bank_name,
        'Total Credits (Disbursements)',
        formatZar(audit.reconciliation.totalCredits),
      ],
      [
        'Statement Period',
        audit.account_metadata.statement_period,
        'Total Debits (Excl. Fees)',
        formatZar(audit.reconciliation.totalDebitsExclFees),
      ],
      [
        'Student / ID No.',
        audit.account_metadata.student_id || 'Not specified',
        'Bank / Wallet Service Fees',
        formatZar(audit.reconciliation.totalFees),
      ],
      [
        'Institution',
        audit.account_metadata.institution || 'Not specified',
        'Stated Closing Balance',
        formatZar(audit.reconciliation.statedClosingBalance),
      ],
      [
        'Transactions Parsed',
        String(audit.metrics.transactionCount),
        'Reconciliation Check',
        `${audit.reconciliation.status} (Diff: ${formatZar(audit.reconciliation.discrepancyZar)})`,
      ],
    ],
    theme: 'grid',
    headStyles: { fillColor: [15, 41, 34], fontSize: 8.5, fontStyle: 'bold' },
    bodyStyles: { fontSize: 8.5, textColor: [30, 41, 59] },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 42 },
      1: { cellWidth: 48 },
      2: { fontStyle: 'bold', cellWidth: 48 },
      3: { halign: 'right', cellWidth: 44 },
    },
    margin: { left: 14, right: 14 },
  });

  // Category Breakdown
  const afterMetaY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(15, 23, 42);
  doc.text('Spending Breakdown by DHET/NSFAS Category', 14, afterMetaY);

  autoTable(doc, {
    startY: afterMetaY + 3,
    head: [['Category', 'Policy Classification', 'Tx Count', 'Amount (ZAR)', '% of Allowance']],
    body: audit.categorySummaries.map((cat) => [
      cat.label,
      cat.isPermissible ? 'Permissible' : 'Prohibited / Review',
      String(cat.transactionCount),
      formatZar(cat.totalZar),
      `${cat.percentOfAllowance.toFixed(1)}%`,
    ]),
    theme: 'striped',
    headStyles: { fillColor: [30, 41, 59], fontSize: 8.5 },
    bodyStyles: { fontSize: 8.5 },
    columnStyles: {
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' },
    },
    margin: { left: 14, right: 14 },
  });

  // Flagged / Overridden Transactions Evidence
  const flaggedOrOverridden = audit.transactions.filter(
    (t) => t.compliance_status !== 'PERMISSIBLE' || Boolean(t.override)
  );

  const afterCatY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(15, 23, 42);
  doc.text(
    `Flagged & Audited Exception Transactions (${flaggedOrOverridden.length})`,
    14,
    afterCatY
  );

  if (flaggedOrOverridden.length > 0) {
    autoTable(doc, {
      startY: afterCatY + 3,
      head: [['Date', 'Merchant / Description', 'Category', 'Amount', 'Status & Rationale']],
      body: flaggedOrOverridden.map((tx) => {
        const statusText = tx.override
          ? `OVERRIDDEN -> PERMISSIBLE (${tx.override.overriddenBy}: ${tx.override.note})`
          : `${tx.compliance_status}: ${tx.flag_reason}`;
        return [
          tx.date,
          tx.normalized_merchant || tx.raw_description,
          CATEGORY_META[tx.category].shortLabel,
          formatZar(tx.amount),
          statusText,
        ];
      }),
      theme: 'grid',
      headStyles: { fillColor: [153, 27, 27], fontSize: 8 },
      bodyStyles: { fontSize: 7.8 },
      columnStyles: {
        0: { cellWidth: 20 },
        1: { cellWidth: 46 },
        2: { cellWidth: 28 },
        3: { halign: 'right', cellWidth: 22 },
        4: { cellWidth: 66 },
      },
      margin: { left: 14, right: 14 },
    });
  } else {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(22, 163, 74);
    doc.text(
      'No prohibited, unverified, or flagged exception transactions were detected on this statement.',
      14,
      afterCatY + 7
    );
  }

  // Officer Sign-off Footer Block
  const finalY = Math.min(
    ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? afterCatY + 12) + 12,
    265
  );
  doc.setDrawColor(203, 213, 225);
  doc.line(14, finalY, pageWidth - 14, finalY);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text('Institutional Bursary Officer Sign-Off', 14, finalY + 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text(
    `Reviewed By: ${officerName}   |   Extraction Engine: ${audit.modelUsed}   |   Overrides Applied: ${audit.metrics.overriddenCount}`,
    14,
    finalY + 12
  );
  doc.text(
    'Signature: ______________________________________       Date: ____________________',
    14,
    finalY + 20
  );

  const safeFile = audit.fileName.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
  doc.save(`NSFAS_Audit_Report_${safeFile}_${audit.auditId}.pdf`);
}
