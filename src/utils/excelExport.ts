import * as XLSX from 'xlsx';
import type { SaleRecord, GLAccountLink } from '../types/rbac';

export interface ExcelSheetData {
  sheetName: string;
  headers: string[];
  rows: (string | number)[][];
  colWidths?: number[];
}

/**
 * Builds the complete multi-sheet dataset for the Excel export workbook,
 * including Sales Register, GL Links & Chart of Accounts, and GL Journal Summary.
 */
export function buildSalesWorkbookData(
  sales: any[],
  glAccounts: any[],
  currency: string = 'Rs.'
): ExcelSheetData[] {
  // -------------------------------------------------------------
  // Filter out CREDIT sales from main Sales Register
  // -------------------------------------------------------------
  const nonCreditSales = (sales || []).filter((s) => (s.payment_method || '').toUpperCase() !== 'CREDIT');
  const creditSales = (sales || []).filter((s) => (s.payment_method || '').toUpperCase() === 'CREDIT');

  // Compute aggregated totals for GL mapping (excluding credit sales totals here, we handle credit separately per account)
  let totalCash = 0;
  let totalCard = 0;
  let totalQR = 0;
  let totalOnline = 0;
  let totalRoomBill = 0;
  let totalDiscounts = 0;
  let totalTax = 0;
  let totalServiceCharge = 0;
  let totalFoodSales = 0;
  let totalBeverageSales = 0;

  for (const s of nonCreditSales) {
    const sub = Number(s.subtotal) || 0;
    const tot = Number(s.total_amount) || 0;
    const disc = Number(s.discount_amount) || 0;
    const tax = Number(s.total_tax) || 0;
    const sc = Number(s.service_charge) || 0;
    const taxIncludesSc = sc > 0 && Math.abs(sub + tax - disc - tot) < 0.05;
    const pureTax = taxIncludesSc ? Math.max(0, Number((tax - sc).toFixed(2))) : tax;

    totalDiscounts = Number((totalDiscounts + disc).toFixed(2));
    totalTax = Number((totalTax + pureTax).toFixed(2));
    totalServiceCharge = Number((totalServiceCharge + sc).toFixed(2));

    const pm = (s.payment_method || '').toUpperCase();
    if (pm === 'CASH') totalCash += tot;
    else if (pm === 'CARD') totalCard += tot;
    else if (pm === 'UPI_QR' || pm === 'QR_CODE') totalQR += tot;
    else if (pm === 'ONLINE') totalOnline += tot;
    else if (pm === 'ROOM_BILL') totalRoomBill += tot;
    else totalCash += tot; // fallback

    let hasBeverage = false;
    let bevGross = 0;
    let itemsGross = 0;
    if (Array.isArray(s.items)) {
      for (const item of s.items) {
        const cat = (item.category || '').toLowerCase();
        const isBar = (item.station || '').toUpperCase() === 'BAR';
        const itemTot = (Number(item.price || item.unit_price) || 0) * (Number(item.quantity) || 1);
        itemsGross += itemTot;
        if (isBar || cat.includes('bev') || cat.includes('drink') || cat.includes('bar') || cat.includes('tea') || cat.includes('coffee') || cat.includes('juice')) {
          bevGross += itemTot;
          hasBeverage = true;
        }
      }
    }
    if (hasBeverage && itemsGross > 0) {
      const bevSub = Math.min(sub, Number(((bevGross / itemsGross) * sub).toFixed(2)));
      const foodSub = Math.max(0, Number((sub - bevSub).toFixed(2)));
      totalBeverageSales = Number((totalBeverageSales + bevSub).toFixed(2));
      totalFoodSales = Number((totalFoodSales + foodSub).toFixed(2));
    } else {
      totalFoodSales = Number((totalFoodSales + sub).toFixed(2));
    }
  }

  // Calculate totals for CREDIT sales as well to add to total revenue, tax, etc.
  let totalCreditTotal = 0;
  let creditAccountsMap: { [key: string]: { id: string, number: string, name: string, total: number, count: number, sales: any[] } } = {};
  
  // Initialize creditAccountsMap with active GL accounts mapped to CREDIT_SETTLEMENT
  const creditGLAccounts = (glAccounts || []).filter(a => a.mapping_key === 'CREDIT_SETTLEMENT');
  creditGLAccounts.forEach(acc => {
    creditAccountsMap[acc.id] = {
      id: acc.id,
      number: acc.account_number,
      name: acc.account_name,
      total: 0,
      count: 0,
      sales: []
    };
  });
  // Fallback account 1120
  if (!creditAccountsMap['1120']) {
    creditAccountsMap['1120'] = { id: '1120', number: '1120', name: 'Accounts Receivable (Unassigned Credit)', total: 0, count: 0, sales: [] };
  }

  for (const s of creditSales) {
    const sub = Number(s.subtotal) || 0;
    const tot = Number(s.total_amount) || 0;
    const disc = Number(s.discount_amount) || 0;
    const tax = Number(s.total_tax) || 0;
    const sc = Number(s.service_charge) || 0;
    const taxIncludesSc = sc > 0 && Math.abs(sub + tax - disc - tot) < 0.05;
    const pureTax = taxIncludesSc ? Math.max(0, Number((tax - sc).toFixed(2))) : tax;

    totalDiscounts = Number((totalDiscounts + disc).toFixed(2));
    totalTax = Number((totalTax + pureTax).toFixed(2));
    totalServiceCharge = Number((totalServiceCharge + sc).toFixed(2));
    totalCreditTotal = Number((totalCreditTotal + tot).toFixed(2));

    let hasBeverage = false;
    let bevGross = 0;
    let itemsGross = 0;
    if (Array.isArray(s.items)) {
      for (const item of s.items) {
        const cat = (item.category || '').toLowerCase();
        const isBar = (item.station || '').toUpperCase() === 'BAR';
        const itemTot = (Number(item.price || item.unit_price) || 0) * (Number(item.quantity) || 1);
        itemsGross += itemTot;
        if (isBar || cat.includes('bev') || cat.includes('drink') || cat.includes('bar') || cat.includes('tea') || cat.includes('coffee') || cat.includes('juice')) {
          bevGross += itemTot;
          hasBeverage = true;
        }
      }
    }
    if (hasBeverage && itemsGross > 0) {
      const bevSub = Math.min(sub, Number(((bevGross / itemsGross) * sub).toFixed(2)));
      const foodSub = Math.max(0, Number((sub - bevSub).toFixed(2)));
      totalBeverageSales = Number((totalBeverageSales + bevSub).toFixed(2));
      totalFoodSales = Number((totalFoodSales + foodSub).toFixed(2));
    } else {
      totalFoodSales = Number((totalFoodSales + sub).toFixed(2));
    }

    let accId = s.credit_gl_account_id;
    if (!accId || !creditAccountsMap[accId]) {
      // Find fallback 1120
      const fb = creditGLAccounts.find(a => a.account_number === '1120');
      accId = fb ? fb.id : '1120';
    }
    creditAccountsMap[accId].total += tot;
    creditAccountsMap[accId].count += 1;
    creditAccountsMap[accId].sales.push(s);
  }

  // -------------------------------------------------------------
  // 1. SHEET 1: Sales Register (NO CREDIT SALES)
  // -------------------------------------------------------------
  const salesHeaders = [
    'S.N.', 'Invoice Number', 'Order Number', 'Date & Time', 'Date (YYYY-MM-DD)',
    'Sale Type', 'Table # / Room', 'Customer Name', 'Customer Phone', 'Customer PAN',
    'Items Summary', 'Total Items', 'Payment Method', 'Payment Status',
    'GL Account No.', 'GL Account Name', 'GL Category', 'Currency',
    'Subtotal', 'Taxes Breakdown', 'Total Tax', 'Service Charge',
    'Discount Amount', 'Promo Code', 'Grand Total', 'Cashier / Billed By', 'Notes'
  ];

  const salesRows: (string | number)[][] = sales.map((sale, idx) => {
    let formattedDate = sale.date_string || '';
    if (sale.created_at) {
      try {
        formattedDate = new Date(sale.created_at).toLocaleString('en-US', {
          year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: true,
        });
      } catch { formattedDate = String(sale.created_at); }
    }

    const itemsSummary = Array.isArray(sale.items)
      ? sale.items.map((i: any) => `${i.name || i.item_name || 'Item'} (x${i.quantity || 1})`).join('; ')
      : '';
    const totalItemsCount = Array.isArray(sale.items)
      ? sale.items.reduce((sum: number, i: any) => sum + (Number(i.quantity) || 1), 0)
      : 0;

    const taxesSummary = Array.isArray(sale.taxes)
      ? sale.taxes.map((t: any) => `${t.name} (${t.rate_percent ?? t.rate ?? 0}%): ${sale.currency || currency}${(Number(t.amount) || 0).toFixed(2)}`).join(' | ')
      : '';

    const normalizedPayment = (sale.payment_method || 'CASH').toUpperCase();
    let glAccNumber = '1010';
    let glAccName = 'POS Till Cash on Hand';
    let glAccCategory = 'ASSET';

    if (normalizedPayment === 'CASH') {
      const match = (glAccounts || []).find((a) => (a.mapping_key || '').toUpperCase() === 'CASH_SETTLEMENT' || a.account_number === '1010');
      glAccNumber = match?.account_number || '1010';
      glAccName = match?.account_name || 'POS Till Cash on Hand';
      glAccCategory = match?.category || 'ASSET';
    } else if (normalizedPayment === 'CARD') {
      const match = (glAccounts || []).find((a) => (a.mapping_key || '').toUpperCase() === 'CARD_SETTLEMENT' || a.account_number === '1020');
      glAccNumber = match?.account_number || '1020';
      glAccName = match?.account_name || 'Credit & Debit Card Clearing';
      glAccCategory = match?.category || 'ASSET';
    } else if (normalizedPayment === 'QR_CODE' || normalizedPayment === 'UPI_QR') {
      const match = (glAccounts || []).find((a) => (a.mapping_key || '').toUpperCase() === 'QR_SETTLEMENT' || a.account_number === '1030');
      glAccNumber = match?.account_number || '1030';
      glAccName = match?.account_name || 'QR Digital Payment Clearing';
      glAccCategory = match?.category || 'ASSET';
    } else if (normalizedPayment === 'ONLINE') {
      const match = (glAccounts || []).find((a) => (a.mapping_key || '').toUpperCase() === 'ONLINE_SETTLEMENT' || a.account_number === '1040');
      glAccNumber = match?.account_number || '1040';
      glAccName = match?.account_name || 'Online Payment Gateway Clearing';
      glAccCategory = match?.category || 'ASSET';
    } else if (normalizedPayment === 'ROOM_BILL' || normalizedPayment === 'ROOM_CHARGE') {
      const match = (glAccounts || []).find((a) => (a.mapping_key || '').toUpperCase() === 'ROOM_CHARGE' || a.account_number === '1110');
      glAccNumber = match?.account_number || '1110';
      glAccName = match?.account_name || 'Guest Room Folio Receivable';
      glAccCategory = match?.category || 'ASSET';
    } else if (normalizedPayment === 'CREDIT') {
      let accId = sale.credit_gl_account_id;
      if (!accId || !creditAccountsMap[accId]) {
        const fb = creditGLAccounts.find(a => a.account_number === '1120');
        accId = fb ? fb.id : '1120';
      }
      glAccNumber = creditAccountsMap[accId]?.number || '1120';
      glAccName = creditAccountsMap[accId]?.name || 'Accounts Receivable (Unassigned Credit)';
      glAccCategory = 'ASSET';
    }

    return [
      idx + 1,
      sale.invoice_number || sale.id,
      sale.order_number || '-',
      formattedDate,
      sale.date_string || (sale.created_at ? new Date(sale.created_at).toISOString().split('T')[0] : ''),
      sale.sale_type || 'COUNTER',
      sale.table_number || 'Counter / N/A',
      sale.customer_name || 'Walk-in Guest',
      sale.customer_phone || '-',
      sale.customer_pan || '-',
      itemsSummary,
      totalItemsCount,
      normalizedPayment,
      sale.payment_status || 'PAID',
      glAccNumber,
      glAccName,
      glAccCategory,
      sale.currency || currency,
      Number((sale.subtotal || 0).toFixed(2)),
      taxesSummary,
      Number((sale.total_tax || 0).toFixed(2)),
      Number((sale.service_charge || 0).toFixed(2)),
      Number((sale.discount_amount || 0).toFixed(2)),
      sale.promo_code || '-',
      Number((sale.total_amount || 0).toFixed(2)),
      sale.cashier_name || 'Staff',
      sale.notes || '',
    ];
  });
  const salesColWidths = [6, 18, 14, 22, 16, 14, 16, 20, 16, 16, 45, 14, 16, 14, 16, 30, 16, 10, 14, 25, 12, 14, 15, 14, 15, 20, 25];

  // -------------------------------------------------------------
  // 2. SHEET 2: Item Sales Register (Individual Line-Item Transactions)
  // -------------------------------------------------------------
  const itemHeaders = [
    'S.N.',
    'Invoice Number',
    'Order Number',
    'Date & Time',
    'Date (YYYY-MM-DD)',
    'Item Name',
    'Variant / Size',
    'Category',
    'Station',
    'Quantity',
    'Unit Price',
    'Total Amount',
    'Payment Method',
    'Sale Type',
    'Table # / Room',
    'Customer Name',
    'Customer Phone',
    'Customer PAN',
    'Cashier / Billed By',
  ];

  const itemRows: (string | number)[][] = [];
  let itemSn = 1;
  let totalItemUnits = 0;
  let totalItemRevenue = 0;

  for (const sale of sales || []) {
    let formattedDate = sale.date_string || '';
    if (sale.created_at) {
      try {
        formattedDate = new Date(sale.created_at).toLocaleString('en-US', {
          year: 'numeric',
          month: 'short',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        });
      } catch {
        formattedDate = String(sale.created_at);
      }
    }
    const dateYMD =
      sale.date_string ||
      (sale.created_at ? new Date(sale.created_at).toISOString().split('T')[0] : '');
    const normalizedPayment = (sale.payment_method || 'CASH').toUpperCase();

    if (Array.isArray(sale.items) && sale.items.length > 0) {
      for (const item of sale.items) {
        const rawName = (item.name || item.item_name || 'Item').trim();
        const variantName = (
          item.variant_name ||
          item.variant?.name ||
          item.selected_variant?.name ||
          (rawName.includes('(') ? rawName.match(/\((.*?)\)/)?.[1] : '') ||
          '-'
        ).trim();

        const cleanBase = rawName.replace(/\s*\([^)]*\)\s*/g, '').trim() || rawName;
        const unifiedName =
          variantName && variantName !== '-' ? `${cleanBase} (${variantName})` : cleanBase;

        const qty = Number(item.quantity) || 1;
        const unitPrice = Number(item.unit_price ?? item.price ?? 0);
        const lineTotal = Number(item.total_price ?? item.subtotal ?? qty * unitPrice);

        totalItemUnits += qty;
        totalItemRevenue = Number((totalItemRevenue + lineTotal).toFixed(2));

        itemRows.push([
          itemSn++,
          sale.invoice_number || sale.id || '-',
          sale.order_number || '-',
          formattedDate,
          dateYMD,
          unifiedName,
          variantName,
          item.category || 'General',
          (item.station || 'KITCHEN').toUpperCase(),
          qty,
          Number(unitPrice.toFixed(2)),
          Number(lineTotal.toFixed(2)),
          normalizedPayment,
          sale.sale_type || 'DINE_IN',
          sale.table_number || 'Counter / N/A',
          sale.customer_name || 'Walk-in Guest',
          sale.customer_phone || '-',
          sale.customer_pan || '-',
          sale.cashier_name || 'Staff',
        ]);
      }
    }
  }

  if (itemRows.length === 0) {
    itemRows.push([
      1,
      '-',
      '-',
      '-',
      '-',
      '-',
      'No item sales recorded in this period',
      '-',
      '-',
      '-',
      0,
      0,
      0,
      '-',
      '-',
      '-',
      '-',
      '-',
      '-',
    ]);
  } else {
    itemRows.push([
      '',
      '',
      '',
      '',
      '',
      'GRAND TOTAL',
      '',
      '',
      '',
      totalItemUnits,
      '',
      Number(totalItemRevenue.toFixed(2)),
      '',
      '',
      '',
      '',
      '',
      '',
    ]);
  }

  const itemColWidths = [8, 16, 14, 22, 16, 28, 18, 16, 12, 10, 14, 16, 16, 14, 16, 18, 16, 18];

  // -------------------------------------------------------------
  // 3. SHEET 3: GL Links & Mapping
  // -------------------------------------------------------------
  const glHeaders = [
    'S.N.', 'Account Number', 'Account Name', 'Category', 'ERP Mapping Function', 'Current Register Total', 'Status', 'Description',
    'Customer Name', 'Customer Address', 'Customer Phone', 'Extension No.', 'Office Name', 'Designation',
  ];
  const glRows: (string | number)[][] = (glAccounts || []).map((acc, idx) => {
    let mappedTotal = 0;
    const key = (acc.mapping_key || '').toUpperCase();

    if (key === 'FOOD_SALES') mappedTotal = totalFoodSales;
    else if (key === 'BEVERAGE_SALES') mappedTotal = totalBeverageSales;
    else if (key === 'DISCOUNTS_ALLOWED') mappedTotal = totalDiscounts;
    else if (key === 'VAT_COLLECTED') mappedTotal = totalTax;
    else if (key === 'SERVICE_CHARGE') mappedTotal = totalServiceCharge;
    else if (key === 'CASH_SETTLEMENT') mappedTotal = totalCash;
    else if (key === 'CARD_SETTLEMENT') mappedTotal = totalCard;
    else if (key === 'QR_SETTLEMENT') mappedTotal = totalQR;
    else if (key === 'ONLINE_SETTLEMENT') mappedTotal = totalOnline;
    else if (key === 'ROOM_CHARGE') mappedTotal = totalRoomBill;
    else if (key === 'CREDIT_SETTLEMENT') {
      mappedTotal = creditAccountsMap[acc.id]?.total || 0;
    }

    return [
      idx + 1, acc.account_number, acc.account_name, acc.category,
      acc.mapping_key || 'CUSTOM_MAPPING', Number(mappedTotal.toFixed(2)),
      acc.is_active ? 'ACTIVE' : 'INACTIVE', acc.description || '',
      acc.customer_name || '', acc.customer_address || '', acc.customer_phone || '',
      acc.customer_extension || '', acc.customer_office_name || '', acc.customer_designation || '',
    ];
  });
  const glColWidths = [6, 16, 32, 16, 24, 22, 12, 45, 24, 28, 16, 14, 24, 20];

  // -------------------------------------------------------------
  // 3. SHEET 3: GL Journal Summary
  // -------------------------------------------------------------
  const journalHeaders = ['Account No.', 'Account Name', 'Category', `Debit (${currency})`, `Credit (${currency})`, 'Notes / Transaction Basis'];
  const journalRows: (string | number)[][] = [];

  // Debits
  if (totalCash > 0) journalRows.push(['1010', 'POS Till Cash on Hand', 'ASSET', Number(totalCash.toFixed(2)), 0, 'Physical cash collections in POS till']);
  if (totalCard > 0) journalRows.push(['1020', 'Credit & Debit Card Clearing', 'ASSET', Number(totalCard.toFixed(2)), 0, 'POS card swipe settlements']);
  if (totalQR > 0) journalRows.push(['1030', 'QR Digital Payment Clearing', 'ASSET', Number(totalQR.toFixed(2)), 0, 'QR digital payments settled']);
  if (totalOnline > 0) journalRows.push(['1040', 'Online Payment Gateway Clearing', 'ASSET', Number(totalOnline.toFixed(2)), 0, 'Direct online checkout settlement']);
  if (totalRoomBill > 0) journalRows.push(['1110', 'Guest Room Folio Receivable', 'ASSET', Number(totalRoomBill.toFixed(2)), 0, 'Dining bills transferred to hotel guest folio']);
  if (totalDiscounts > 0) journalRows.push(['4090', 'Sales Discounts & Rebates', 'EXPENSE', Number(totalDiscounts.toFixed(2)), 0, 'Customer discounts allowed on billing']);

  // Add individual credit account debits
  let journalCreditDebits = 0;
  for (const acc of Object.values(creditAccountsMap)) {
    if (acc.total > 0) {
      journalRows.push([acc.number, acc.name, 'ASSET', Number(acc.total.toFixed(2)), 0, `Credit sales pending collection - ${acc.name}`]);
      journalCreditDebits += acc.total;
    }
  }

  // Credits
  if (totalFoodSales > 0) journalRows.push(['4010', 'Food Sales Revenue', 'REVENUE', 0, Number(totalFoodSales.toFixed(2)), 'Gross revenue from kitchen food dishes']);
  if (totalBeverageSales > 0) journalRows.push(['4020', 'Beverage Sales Revenue', 'REVENUE', 0, Number(totalBeverageSales.toFixed(2)), 'Gross revenue from bar & drinks']);
  if (totalTax > 0) journalRows.push(['2110', 'Sales Tax / VAT Payable (13%)', 'TAX_LIABILITY', 0, Number(totalTax.toFixed(2)), 'Collected government tax liability']);
  if (totalServiceCharge > 0) journalRows.push(['2120', 'Hospitality Service Charge Payable', 'LIABILITY', 0, Number(totalServiceCharge.toFixed(2)), '10% Service charge pool for staff']);

  const totalDebits = totalCash + totalCard + totalQR + totalOnline + totalRoomBill + journalCreditDebits + totalDiscounts;
  const totalCredits = totalFoodSales + totalBeverageSales + totalTax + totalServiceCharge;
  const variance = Math.abs(totalDebits - totalCredits);

  journalRows.push([
    'TOTAL', 'TOTAL BALANCED JOURNAL', 'SUMMARY', Number(totalDebits.toFixed(2)), Number(totalCredits.toFixed(2)),
    variance < 0.05 ? 'Balanced (Debits = Credits)' : `Imbalance: ${variance.toFixed(2)}`,
  ]);
  const journalColWidths = [14, 34, 16, 18, 18, 38];

  // -------------------------------------------------------------
  // 4. SHEET 4: Credit Sales Register (Grouped by Customer)
  // -------------------------------------------------------------
  const creditHeaders = [
    'S.N.', 'Invoice Number', 'Order Number', 'Date & Time', 'Customer GL Account No.', 'Customer GL Account Name',
    'Customer Name', 'Customer Address', 'Customer Phone', 'Extension No.', 'Office Name', 'Designation',
    'Table # / Room', 'Items Ordered', 'Subtotal', 'Total Tax', 'Service Charge', 'Discount Amount', 'Grand Total (Credit)',
    'Payment Status', 'Cashier / Billed By', 'Notes'
  ];
  const creditCols = creditHeaders.length;
  const padRow = (first: string): (string | number)[] => [first, ...Array(creditCols - 1).fill('')];

  const creditRows: (string | number)[][] = [];
  
  for (const acc of Object.values(creditAccountsMap)) {
    if (acc.sales.length > 0) {
      // Summary block for customer
      creditRows.push(padRow(`Customer GL Account: ${acc.number} - ${acc.name}`));
      creditRows.push(padRow(`Total Outstanding: ${currency} ${acc.total.toFixed(2)} (${acc.count} Sales)`));
      const accMeta = creditGLAccounts.find((g) => g.id === acc.id) || ({} as any);
      
      let customerSubtotal = 0;
      let sn = 1;
      
      acc.sales.forEach(sale => {
        let formattedDate = sale.date_string || '';
        if (sale.created_at) {
          try { formattedDate = new Date(sale.created_at).toLocaleString('en-US', { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: true }); }
          catch { formattedDate = String(sale.created_at); }
        }
        const itemsSummary = Array.isArray(sale.items) ? sale.items.map((i: any) => `${i.name || i.item_name || 'Item'} (x${i.quantity || 1})`).join('; ') : '';
        
        customerSubtotal += Number(sale.total_amount) || 0;
        
        creditRows.push([
          sn++, sale.invoice_number || sale.id, sale.order_number || '-', formattedDate, acc.number, acc.name,
          accMeta.customer_name || '', accMeta.customer_address || '', accMeta.customer_phone || '',
          accMeta.customer_extension || '', accMeta.customer_office_name || '', accMeta.customer_designation || '',
          sale.table_number || 'Counter', itemsSummary, Number((sale.subtotal || 0).toFixed(2)), Number((sale.total_tax || 0).toFixed(2)),
          Number((sale.service_charge || 0).toFixed(2)), Number((sale.discount_amount || 0).toFixed(2)), Number((sale.total_amount || 0).toFixed(2)),
          sale.payment_status || 'PENDING', sale.cashier_name || 'Staff', sale.notes || ''
        ]);
      });
      
      {
        const r = padRow('');
        r[creditCols - 9] = 'CUSTOMER SUBTOTAL';
        r[creditCols - 4] = Number(customerSubtotal.toFixed(2));
        creditRows.push(r);
      }
      creditRows.push(padRow('')); // blank spacer row
    }
  }
  
  if (creditRows.length === 0) {
    creditRows.push(padRow('No credit sales recorded in this period'));
  } else {
    const g = padRow('');
    g[creditCols - 9] = 'GRAND TOTAL OUTSTANDING';
    g[creditCols - 4] = Number(totalCreditTotal.toFixed(2));
    creditRows.push(g);
  }

  const creditColWidths = [10, 18, 14, 22, 22, 28, 24, 28, 16, 14, 24, 20, 16, 45, 14, 14, 14, 15, 18, 14, 20, 25];

  return [
    { sheetName: 'Sales Register', headers: salesHeaders, rows: salesRows, colWidths: salesColWidths },
    { sheetName: 'Item Sales Register', headers: itemHeaders, rows: itemRows, colWidths: itemColWidths },
    { sheetName: 'GL Links & Mapping', headers: glHeaders, rows: glRows, colWidths: glColWidths },
    { sheetName: 'GL Journal Summary', headers: journalHeaders, rows: journalRows, colWidths: journalColWidths },
    { sheetName: 'Credit Sales Register', headers: creditHeaders, rows: creditRows, colWidths: creditColWidths },
  ];
}

export function exportSheetsToExcel(
  sheets: ExcelSheetData[],
  filenamePrefix = 'Sales_GL_Register',
  businessName = 'NamasteQR'
): void {
  if (!sheets || sheets.length === 0) {
    throw new Error('No sheets data provided for Excel export');
  }

  const workbook = XLSX.utils.book_new();

  for (const sheet of sheets) {
    const aoa: (string | number)[][] = [sheet.headers, ...sheet.rows];
    const worksheet = XLSX.utils.aoa_to_sheet(aoa);

    if (sheet.colWidths && sheet.colWidths.length > 0) {
      worksheet['!cols'] = sheet.colWidths.map((w) => ({ wch: w }));
    }

    // Sanitize sheet name (Excel limit is 31 chars and no special chars : \ / ? * [ ])
    const sanitizedSheetName = sheet.sheetName
      .replace(/[:\\/?*\[\]]/g, '')
      .substring(0, 31);

    XLSX.utils.book_append_sheet(workbook, worksheet, sanitizedSheetName);
  }

  const dateStr = new Date().toISOString().split('T')[0];
  const sanitizedBusiness = (businessName || 'NamasteQR').replace(/[^a-zA-Z0-9_-]/g, '_');
  const fullFilename = `${sanitizedBusiness}_${filenamePrefix}_${dateStr}.xlsx`;

  XLSX.writeFile(workbook, fullFilename);
}

/**
 * Direct export helper that automatically compiles Sales, GL Links, and Journal into Excel.
 */
export function exportSalesToExcel(
  sales: SaleRecord[],
  glAccounts: GLAccountLink[] = [],
  filenamePrefix = 'Sales_Register',
  businessName = 'Business'
): void {
  if (!sales || sales.length === 0) {
    throw new Error('No sales records to export');
  }

  const sheets = buildSalesWorkbookData(sales, glAccounts, sales[0]?.currency || 'Rs.');
  exportSheetsToExcel(sheets, filenamePrefix, businessName);
}
