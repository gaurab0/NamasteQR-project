import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { CashierSalesSheetData } from './cashierSalesSheet';

export interface CashierSalesPdfMeta {
  businessName: string;
  cashierLabel: string;
  periodLabel: string;
  currencySymbol?: string;
  fileDateTag?: string;
}

const fmtAmt = (val: number): string =>
  val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const sanitizePdfCurrency = (symbol?: string): string => {
  const s = (symbol || 'Rs.').trim();
  if (!s || s === '₹') return 'Rs.';
  // Helvetica standard WinAnsi encoding lacks glyphs outside basic Latin-1
  return /^[\x20-\xFF]+$/.test(s) ? s : 'Rs.';
};

const sanitizeSlug = (val: string): string =>
  (val || 'Sheet')
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'Sheet';

export function buildCashierSalesPdfDoc(
  sheet: CashierSalesSheetData,
  meta: CashierSalesPdfMeta
): { doc: jsPDF; filename: string } {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const currency = sanitizePdfCurrency(meta.currencySymbol);
  const generatedAt = new Date().toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  // Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(24, 24, 27);
  doc.text(`${meta.businessName || 'Restaurant'} - Cashier Sales Sheet`, 20, 30);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(82, 82, 91);
  doc.text(
    `Cashier: ${meta.cashierLabel}   |   Period: ${meta.periodLabel}   |   Currency: ${currency}   |   Generated: ${generatedAt}`,
    20,
    46
  );

  const head = [[
    '#',
    'Invoice #',
    'Table #',
    'Item',
    'Guest Name',
    'Time',
    'DATE',
    'Discount',
    'Cash',
    'QR',
    'Card',
    'Credit',
    'Deduct from Deposit',
    'Day End Total',
  ]];

  const bodyRows: (string | number)[][] = sheet.rows.map((r) => [
    r.sn,
    r.invoiceNumber,
    r.tableNumber,
    r.itemsText,
    r.guestName,
    r.timeText,
    r.dateText,
    r.discount > 0 ? fmtAmt(r.discount) : '0',
    r.cash > 0 ? fmtAmt(r.cash) : '0',
    r.qr > 0 ? fmtAmt(r.qr) : '0',
    r.card > 0 ? fmtAmt(r.card) : '0',
    r.credit > 0 ? fmtAmt(r.credit) : '0',
    r.deductFromDeposit > 0 ? fmtAmt(r.deductFromDeposit) : '0',
    fmtAmt(r.dayEndTotal),
  ]);

  const { summary } = sheet;
  const summaryStartIdx = bodyRows.length;

  bodyRows.push([
    '',
    '',
    '',
    'Total',
    '',
    '',
    '',
    fmtAmt(summary.totalDiscount),
    fmtAmt(summary.totalCash),
    fmtAmt(summary.totalQr),
    fmtAmt(summary.totalCard),
    fmtAmt(summary.totalCredit),
    fmtAmt(summary.totalDeductFromDeposit),
    fmtAmt(summary.dayEndTotal),
  ]);

  bodyRows.push([
    '',
    '',
    '',
    'Opening Cash',
    '',
    '',
    '',
    '',
    fmtAmt(summary.openingCash),
    '',
    '',
    '',
    '',
    '',
  ]);

  bodyRows.push([
    '',
    '',
    '',
    'Cash Total',
    '',
    '',
    '',
    '',
    fmtAmt(summary.cashTotal),
    '',
    '',
    '',
    '',
    '',
  ]);

  // A4 landscape width = 841.89pt; with 20pt left/right margins printable width = 801.89pt.
  // Total configured widths = 790pt so autoTable never overflows the right margin.
  autoTable(doc, {
    startY: 58,
    margin: { left: 20, right: 20, top: 28, bottom: 28 },
    head,
    body: bodyRows,
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 7.5,
      cellPadding: 3.5,
      lineColor: [212, 212, 216],
      lineWidth: 0.5,
      textColor: [24, 24, 27],
      overflow: 'linebreak',
      valign: 'middle',
    },
    headStyles: {
      fillColor: [24, 24, 27],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7.5,
      halign: 'center',
    },
    columnStyles: {
      0: { cellWidth: 22, halign: 'center' },
      1: { cellWidth: 54 },
      2: { cellWidth: 46 },
      3: { cellWidth: 'auto', minCellWidth: 120 },
      4: { cellWidth: 70 },
      5: { cellWidth: 44, halign: 'center' },
      6: { cellWidth: 52, halign: 'center' },
      7: { cellWidth: 46, halign: 'right' },
      8: { cellWidth: 52, halign: 'right' },
      9: { cellWidth: 52, halign: 'right' },
      10: { cellWidth: 52, halign: 'right' },
      11: { cellWidth: 52, halign: 'right' },
      12: { cellWidth: 54, halign: 'right' },
      13: { cellWidth: 54, halign: 'right' },
    },
    didParseCell: (data) => {
      if (data.section === 'body') {
        const rowIdx = data.row.index;
        if (rowIdx === summaryStartIdx) {
          // Total row
          data.cell.styles.fillColor = [244, 244, 245];
          data.cell.styles.fontStyle = 'bold';
        } else if (rowIdx === summaryStartIdx + 1) {
          // Opening Cash row
          data.cell.styles.fillColor = [254, 249, 195];
          data.cell.styles.fontStyle = 'bold';
        } else if (rowIdx === summaryStartIdx + 2) {
          // Cash Total row
          data.cell.styles.fillColor = [209, 250, 229];
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.textColor = [6, 95, 70];
        }
      }
    },
  });

  const totalPages = doc.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(113, 113, 122);
    doc.text(`Page ${p} of ${totalPages}`, pageWidth - 20, pageHeight - 12, { align: 'right' });
  }

  const dateTag = sanitizeSlug(meta.fileDateTag || new Date().toISOString().split('T')[0]);
  const filename = `${sanitizeSlug(meta.businessName)}_Cashier_Sales_${sanitizeSlug(meta.cashierLabel)}_${dateTag}.pdf`;
  return { doc, filename };
}

export function exportCashierSalesSheetToPdf(
  sheet: CashierSalesSheetData,
  meta: CashierSalesPdfMeta
): string {
  const { doc, filename } = buildCashierSalesPdfDoc(sheet, meta);
  doc.save(filename);
  return filename;
}
