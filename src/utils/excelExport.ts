import * as XLSX from 'xlsx';
import type { SaleRecord, GLAccountLink, CompRecord } from '../types/rbac';

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
  glAccounts: any[] = [],
  currencyOrCompRecords?: string | CompRecord[],
  optionalCompRecords?: CompRecord[]
): ExcelSheetData[] {
  let currency = 'Rs.';
  let compRecords: CompRecord[] | undefined = undefined;

  if (typeof currencyOrCompRecords === 'string') {
    currency = currencyOrCompRecords;
    compRecords = optionalCompRecords;
  } else if (Array.isArray(currencyOrCompRecords)) {
    compRecords = currencyOrCompRecords;
    if (typeof optionalCompRecords === 'string') {
      currency = optionalCompRecords;
    }
  }

  const isAllCompSale = (s: any) => {
    const items = Array.isArray(s.items) ? s.items : [];
    return items.length > 0 && items.every((i: any) => Boolean(i.is_comp || (Number(i.comp_qty) > 0 && Number(i.comp_qty) >= (Number(i.quantity) || 1))));
  };

  // -------------------------------------------------------------
  // Filter out CREDIT sales and 100% COMP sales from main Sales Register
  // -------------------------------------------------------------
  const nonCreditSales = (sales || []).filter((s) => (s.payment_method || '').toUpperCase() !== 'CREDIT' && !isAllCompSale(s));
  const creditSales = (sales || []).filter((s) => (s.payment_method || '').toUpperCase() === 'CREDIT' && !isAllCompSale(s));
  const depositSales = (sales || []).filter((s) => (s.payment_method || '').toUpperCase() === 'DEDUCT_FROM_DEPOSIT' && !isAllCompSale(s));

  // Compute aggregated totals for GL mapping (excluding credit sales totals here, we handle credit separately per account)
  let totalCash = 0;
  let totalCard = 0;
  let totalQR = 0;
  let totalDeposit = 0;
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
    else if (pm === 'UPI_QR' || pm === 'QR_CODE' || pm === 'ONLINE') totalQR += tot;
    else if (pm === 'DEDUCT_FROM_DEPOSIT') totalDeposit += tot;
    else totalCash += tot; // fallback

    let hasBeverage = false;
    let bevGross = 0;
    let itemsGross = 0;
    if (Array.isArray(s.items)) {
      for (const item of s.items) {
        const cat = (item.category || '').toLowerCase();
        const isBar = (item.station || '').toUpperCase() === 'BAR';
        const qty = Number(item.quantity) || 1;
        const compQty = Math.max(0, Math.min(qty, Number(item.comp_qty) || 0));
        const billedQty = item.is_comp ? 0 : Math.max(0, qty - compQty);
        const itemTot = Number(item.total_price ?? item.subtotal ?? (billedQty * (Number(item.price || item.unit_price) || 0)));
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
        const qty = Number(item.quantity) || 1;
        const compQty = Math.max(0, Math.min(qty, Number(item.comp_qty) || 0));
        const billedQty = item.is_comp ? 0 : Math.max(0, qty - compQty);
        const itemTot = Number(item.total_price ?? item.subtotal ?? (billedQty * (Number(item.price || item.unit_price) || 0)));
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

  // Calculate totals and group deposit sales by customer / GL account
  let totalDepositGrand = 0;
  const depositAccountsMap: {
    [key: string]: { id: string; number: string; name: string; total: number; count: number; sales: any[] };
  } = {};

  const depositMatch = (glAccounts || []).find(
    (a) => (a.mapping_key || '').toUpperCase() === 'DEPOSIT_CLEARING' || a.account_number === '2130'
  );
  const defaultDepositId = depositMatch?.id || '2130';
  const defaultDepositNumber = depositMatch?.account_number || '2130';
  const defaultDepositName = depositMatch?.account_name || 'Customer Advance & Deposit Clearing';

  depositAccountsMap[defaultDepositId] = {
    id: defaultDepositId,
    number: defaultDepositNumber,
    name: defaultDepositName,
    total: 0,
    count: 0,
    sales: [],
  };

  for (const s of depositSales) {
    const tot = Number(s.total_amount) || 0;
    totalDepositGrand = Number((totalDepositGrand + tot).toFixed(2));

    const accId = s.credit_gl_account_id;
    const accNumber = s.credit_gl_account_number;
    const accName = s.credit_gl_account_name;

    if (accId) {
      if (!depositAccountsMap[accId]) {
        const found = (glAccounts || []).find((a) => a.id === accId);
        depositAccountsMap[accId] = {
          id: accId,
          number: found?.account_number || accNumber || accId,
          name: found?.account_name || accName || `Account ${accNumber || accId}`,
          total: 0,
          count: 0,
          sales: [],
        };
      }
      depositAccountsMap[accId].total = Number((depositAccountsMap[accId].total + tot).toFixed(2));
      depositAccountsMap[accId].count += 1;
      depositAccountsMap[accId].sales.push(s);
    } else if (accNumber && accNumber !== defaultDepositNumber) {
      if (!depositAccountsMap[accNumber]) {
        const found = (glAccounts || []).find((a) => a.account_number === accNumber);
        depositAccountsMap[accNumber] = {
          id: found?.id || accNumber,
          number: accNumber,
          name: found?.account_name || accName || `Account ${accNumber}`,
          total: 0,
          count: 0,
          sales: [],
        };
      }
      depositAccountsMap[accNumber].total = Number((depositAccountsMap[accNumber].total + tot).toFixed(2));
      depositAccountsMap[accNumber].count += 1;
      depositAccountsMap[accNumber].sales.push(s);
    } else {
      depositAccountsMap[defaultDepositId].total = Number((depositAccountsMap[defaultDepositId].total + tot).toFixed(2));
      depositAccountsMap[defaultDepositId].count += 1;
      depositAccountsMap[defaultDepositId].sales.push(s);
    }
  }

  // -------------------------------------------------------------
  // 1. SHEET 1: Sales Register (NO CREDIT SALES)
  // -------------------------------------------------------------
  const salesHeaders = [
    'S.N.', 'Invoice Number', 'Order Number', 'Date & Time', 'Date (YYYY-MM-DD)',
    'Sale Type', 'Table #', 'Customer Name', 'Customer Phone', 'Customer PAN',
    'Items Summary', 'Total Items', 'Payment Method', 'Payment Status',
    'GL Account No.', 'GL Account Name', 'GL Category', 'Currency',
    'Subtotal', 'Packaging (Rs.)', 'Taxes Breakdown', 'Total Tax', 'Service Charge',
    'Discount Amount', 'Promo Code', 'Grand Total', 'Cashier / Billed By', 'Notes'
  ];

  const eligibleSales = (sales || []).filter((s) => !isAllCompSale(s));
  const salesRows: (string | number)[][] = eligibleSales.map((sale, idx) => {
    let formattedDate = sale.date_string || '';
    if (sale.created_at) {
      try {
        formattedDate = new Date(sale.created_at).toLocaleString('en-US', {
          year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: true,
        });
      } catch { formattedDate = String(sale.created_at); }
    }

    const itemsSummary = Array.isArray(sale.items)
      ? sale.items
          .map((i: any) => {
            const qty = Number(i.quantity) || 1;
            const compQty = Math.max(0, Math.min(qty, Number(i.comp_qty) || 0));
            const isComp = Boolean(i.is_comp || (compQty >= qty));
            const billedQty = isComp ? 0 : Math.max(0, qty - compQty);
            const pQty = Number(i.pack_qty) || (i.is_packaged ? qty : 0);
            const pSuffix = pQty > 0 ? ` [x${pQty} Pack]` : '';
            if (billedQty <= 0) {
              return `${i.name || i.item_name || 'Item'} (x${qty} Comp)${pSuffix}`;
            }
            if (compQty > 0) {
              return `${i.name || i.item_name || 'Item'} (x${billedQty}, +${compQty} Comp)${pSuffix}`;
            }
            return `${i.name || i.item_name || 'Item'} (x${billedQty})${pSuffix}`;
          })
          .filter(Boolean)
          .join('; ')
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
    } else if (normalizedPayment === 'QR_CODE' || normalizedPayment === 'UPI_QR' || normalizedPayment === 'ONLINE') {
      const match = (glAccounts || []).find((a) => (a.mapping_key || '').toUpperCase() === 'QR_SETTLEMENT' || a.account_number === '1030');
      glAccNumber = match?.account_number || '1030';
      glAccName = match?.account_name || 'QR Digital Payment Clearing';
      glAccCategory = match?.category || 'ASSET';
    } else if (normalizedPayment === 'DEDUCT_FROM_DEPOSIT') {
      const match = (glAccounts || []).find((a) => (a.mapping_key || '').toUpperCase() === 'DEPOSIT_CLEARING' || a.account_number === '2130');
      glAccNumber = match?.account_number || '2130';
      glAccName = match?.account_name || 'Customer Advance & Deposit Clearing';
      glAccCategory = match?.category || 'LIABILITY';
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
      Number((sale.packaging_charge || 0).toFixed(2)),
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
  const salesColWidths = [6, 18, 14, 22, 16, 14, 16, 20, 16, 16, 45, 14, 16, 14, 16, 30, 16, 10, 14, 14, 25, 12, 14, 15, 14, 15, 20, 25];

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
    'Packaged Qty',
    'Unit Price',
    'Packaging Charge (Rs.)',
    'Total Amount',
    'Payment Method',
    'Sale Type',
    'Table #',
    'Customer Name',
    'Customer Phone',
    'Customer PAN',
    'Cashier / Billed By',
  ];

  const itemRows: (string | number)[][] = [];
  let itemSn = 1;
  let totalItemUnits = 0;
  let totalItemPackUnits = 0;
  let totalItemPackagingCharge = 0;
  let totalItemRevenue = 0;

  for (const sale of sales || []) {
    if (isAllCompSale(sale)) continue;
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
        const compQty = Math.max(0, Math.min(qty, Number(item.comp_qty) || 0));
        const isComp = Boolean(item.is_comp || (compQty >= qty));
        const billedQty = isComp ? 0 : Math.max(0, qty - compQty);
        const unitPrice = Number(item.unit_price ?? item.price ?? 0);
        const itemPackQty = Math.max(0, Number(item.pack_qty ?? (item.is_packaged ? qty : 0)) || 0);
        const itemPackCharge = Number(item.packaging_charge ?? (itemPackQty * 10)) || 0;

        if (isComp) {
          totalItemUnits += qty;
          totalItemPackUnits += itemPackQty;
          totalItemPackagingCharge += itemPackCharge;
          itemRows.push([
            itemSn++,
            sale.invoice_number || sale.id || '-',
            sale.order_number || '-',
            formattedDate,
            dateYMD,
            `${unifiedName} (Complimentary)`,
            variantName,
            item.category || 'General',
            (item.station || 'KITCHEN').toUpperCase(),
            qty,
            itemPackQty,
            Number(unitPrice.toFixed(2)),
            Number(itemPackCharge.toFixed(2)),
            0,
            normalizedPayment,
            sale.sale_type || 'DINE_IN',
            sale.table_number || 'Counter / N/A',
            sale.customer_name || 'Walk-in Guest',
            sale.customer_phone || '-',
            sale.customer_pan || '-',
            sale.cashier_name || 'Staff',
          ]);
        } else if (compQty > 0 && billedQty > 0) {
          const paidLineTotal = Number((billedQty * unitPrice).toFixed(2));
          const billedPackQty = Math.min(billedQty, itemPackQty);
          const billedPackCharge = billedPackQty * (itemPackQty > 0 ? (itemPackCharge / itemPackQty) : 10);
          const compPackQty = Math.max(0, itemPackQty - billedPackQty);
          const compPackCharge = Math.max(0, itemPackCharge - billedPackCharge);

          totalItemUnits += billedQty;
          totalItemPackUnits += billedPackQty;
          totalItemPackagingCharge += billedPackCharge;
          totalItemRevenue = Number((totalItemRevenue + paidLineTotal).toFixed(2));
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
            billedQty,
            billedPackQty,
            Number(unitPrice.toFixed(2)),
            Number(billedPackCharge.toFixed(2)),
            paidLineTotal,
            normalizedPayment,
            sale.sale_type || 'DINE_IN',
            sale.table_number || 'Counter / N/A',
            sale.customer_name || 'Walk-in Guest',
            sale.customer_phone || '-',
            sale.customer_pan || '-',
            sale.cashier_name || 'Staff',
          ]);

          totalItemUnits += compQty;
          totalItemPackUnits += compPackQty;
          totalItemPackagingCharge += compPackCharge;
          itemRows.push([
            itemSn++,
            sale.invoice_number || sale.id || '-',
            sale.order_number || '-',
            formattedDate,
            dateYMD,
            `${unifiedName} (Complimentary)`,
            variantName,
            item.category || 'General',
            (item.station || 'KITCHEN').toUpperCase(),
            compQty,
            compPackQty,
            Number(unitPrice.toFixed(2)),
            Number(compPackCharge.toFixed(2)),
            0,
            normalizedPayment,
            sale.sale_type || 'DINE_IN',
            sale.table_number || 'Counter / N/A',
            sale.customer_name || 'Walk-in Guest',
            sale.customer_phone || '-',
            sale.customer_pan || '-',
            sale.cashier_name || 'Staff',
          ]);
        } else {
          const lineTotal = Number(item.total_price ?? item.subtotal ?? (billedQty * unitPrice));
          totalItemUnits += billedQty;
          totalItemPackUnits += itemPackQty;
          totalItemPackagingCharge += itemPackCharge;
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
            billedQty,
            itemPackQty,
            Number(unitPrice.toFixed(2)),
            Number(itemPackCharge.toFixed(2)),
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
      totalItemPackUnits,
      '',
      Number(totalItemPackagingCharge.toFixed(2)),
      Number(totalItemRevenue.toFixed(2)),
      '',
      '',
      '',
      '',
      '',
      '',
    ]);
  }

  const itemColWidths = [8, 16, 14, 22, 16, 28, 18, 16, 12, 10, 12, 14, 16, 16, 16, 14, 16, 18, 16, 16, 18];

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
    else if (key === 'DEPOSIT_CLEARING') mappedTotal = totalDeposit;
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
  if (totalDeposit > 0) journalRows.push(['2130', 'Customer Advance & Deposit Clearing', 'LIABILITY', Number(totalDeposit.toFixed(2)), 0, 'Sales settled against pre-paid customer deposits']);
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

  const totalDebits = totalCash + totalCard + totalQR + totalDeposit + journalCreditDebits + totalDiscounts;
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
    'Table #', 'Items Ordered', 'Subtotal', 'Total Tax', 'Service Charge', 'Discount Amount', 'Grand Total (Credit)',
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
        const itemsSummary = Array.isArray(sale.items)
          ? sale.items
              .map((i: any) => {
                const compQty = Math.max(0, Math.min(Number(i.quantity) || 1, Number(i.comp_qty) || 0));
                const billedQty = i.is_comp ? 0 : Math.max(0, (Number(i.quantity) || 1) - compQty);
                if (billedQty <= 0) return null;
                return `${i.name || i.item_name || 'Item'} (x${billedQty})`;
              })
              .filter(Boolean)
              .join('; ')
          : '';
        
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

  // -------------------------------------------------------------
  // 6. SHEET 6: Deduct from Deposit Sales (Grouped by Account Holder)
  // -------------------------------------------------------------
  const depositHeaders = [
    'S.N.', 'Invoice Number', 'Order Number', 'Date & Time', 'Customer GL Account No.', 'Customer GL Account Name',
    'Customer Name', 'Customer Address', 'Customer Phone', 'Extension No.', 'Office Name', 'Designation',
    'Table #', 'Items Ordered', 'Subtotal', 'Total Tax', 'Service Charge', 'Discount Amount', 'Grand Total (Deducted)',
    'Payment Status', 'Cashier / Billed By', 'Notes'
  ];
  const depositCols = depositHeaders.length;
  const padDepositRow = (first: string): (string | number)[] => [first, ...Array(depositCols - 1).fill('')];

  const depositRows: (string | number)[][] = [];

  for (const acc of Object.values(depositAccountsMap)) {
    if (acc.sales.length > 0) {
      // Summary block for customer / account holder
      depositRows.push(padDepositRow(`Customer GL Account: ${acc.number} - ${acc.name}`));
      depositRows.push(padDepositRow(`Total Deducted: ${currency} ${acc.total.toFixed(2)} (${acc.count} Deductions)`));
      const accMeta = (glAccounts || []).find((g) => g.id === acc.id || g.account_number === acc.number) || ({} as any);

      let accountSubtotal = 0;
      let sn = 1;

      acc.sales.forEach((sale) => {
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

        const itemsSummary = Array.isArray(sale.items)
          ? sale.items
              .map((i: any) => {
                const compQty = Math.max(0, Math.min(Number(i.quantity) || 1, Number(i.comp_qty) || 0));
                const billedQty = i.is_comp ? 0 : Math.max(0, (Number(i.quantity) || 1) - compQty);
                if (billedQty <= 0) return null;
                return `${i.name || i.item_name || 'Item'} (x${billedQty})`;
              })
              .filter(Boolean)
              .join('; ')
          : '';

        accountSubtotal += Number(sale.total_amount) || 0;

        depositRows.push([
          sn++,
          sale.invoice_number || sale.id,
          sale.order_number || '-',
          formattedDate,
          acc.number,
          acc.name,
          sale.customer_name || accMeta.customer_name || 'Registered Customer',
          accMeta.customer_address || '',
          sale.customer_phone || accMeta.customer_phone || '-',
          accMeta.customer_extension || '',
          accMeta.customer_office_name || '',
          accMeta.customer_designation || '',
          sale.table_number || 'Counter / N/A',
          itemsSummary,
          Number((sale.subtotal || 0).toFixed(2)),
          Number((sale.total_tax || 0).toFixed(2)),
          Number((sale.service_charge || 0).toFixed(2)),
          Number((sale.discount_amount || 0).toFixed(2)),
          Number((sale.total_amount || 0).toFixed(2)),
          sale.payment_status || 'PAID',
          sale.cashier_name || 'Staff',
          sale.notes || '',
        ]);
      });

      {
        const r = padDepositRow('');
        r[depositCols - 9] = 'ACCOUNT SUBTOTAL';
        r[depositCols - 4] = Number(accountSubtotal.toFixed(2));
        depositRows.push(r);
      }
      depositRows.push(padDepositRow('')); // blank spacer row
    }
  }

  if (depositRows.length === 0) {
    depositRows.push(padDepositRow('No deduct-from-deposit transactions recorded in this period'));
  } else {
    const g = padDepositRow('');
    g[depositCols - 9] = 'GRAND TOTAL DEDUCTED';
    g[depositCols - 4] = Number(totalDepositGrand.toFixed(2));
    depositRows.push(g);
  }

  const depositColWidths = [10, 18, 14, 22, 22, 28, 24, 28, 16, 14, 24, 20, 16, 45, 14, 14, 14, 15, 18, 14, 20, 25];

  const sheets: ExcelSheetData[] = [
    { sheetName: 'Sales Register', headers: salesHeaders, rows: salesRows, colWidths: salesColWidths },
    { sheetName: 'Item Sales Register', headers: itemHeaders, rows: itemRows, colWidths: itemColWidths },
    { sheetName: 'GL Links & Mapping', headers: glHeaders, rows: glRows, colWidths: glColWidths },
    { sheetName: 'GL Journal Summary', headers: journalHeaders, rows: journalRows, colWidths: journalColWidths },
    { sheetName: 'Credit Sales Register', headers: creditHeaders, rows: creditRows, colWidths: creditColWidths },
    { sheetName: 'Deduct from Deposit Sales', headers: depositHeaders, rows: depositRows, colWidths: depositColWidths },
  ];

  // Complementary Ledger Sheet
  if (compRecords && compRecords.length > 0) {
    const compHeaders = [
      'Date', 'Time', 'Table', 'Staff Name', 'Item Name', 'Category',
      'Comp Qty', 'Unit Price (Rs.)', 'Comp Value (Rs.)', 'Reason', 'Sale Ref',
      'Orderer Name', 'Orderer Phone'
    ];
    const compRows: (string | number)[][] = [];
    for (const rec of compRecords) {
      const items = Array.isArray(rec.items) ? rec.items : [];
      for (const item of items as any[]) {
        compRows.push([
          rec.date_string,
          rec.settled_at ? new Date(rec.settled_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '-',
          rec.table_number,
          rec.staff_name || '-',
          item.name ?? '',
          item.category ?? '',
          Number(item.comp_qty ?? 0),
          Number(item.unit_price ?? 0).toFixed(2),
          Number(item.comp_value ?? 0).toFixed(2),
          rec.reason ?? '',
          rec.sale_id ?? '',
          rec.orderer_name || '-',
          rec.orderer_phone || '-',
        ]);
      }
    }
    const compColWidths = [14, 12, 14, 20, 25, 16, 12, 16, 16, 25, 20, 20, 16];
    sheets.push({ sheetName: 'Complementary Ledger', headers: compHeaders, rows: compRows, colWidths: compColWidths });
  }

  return sheets;
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
  businessName = 'Business',
  compRecords?: CompRecord[]
): void {
  if (!sales || sales.length === 0) {
    throw new Error('No sales records to export');
  }

  const sheets = buildSalesWorkbookData(sales, glAccounts, sales[0]?.currency || 'Rs.', compRecords);
  exportSheetsToExcel(sheets, filenamePrefix, businessName);
}
