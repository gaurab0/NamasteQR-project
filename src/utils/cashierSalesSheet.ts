import type { BusinessOperatingHours } from '../types/auth';
import type { CashierRegisterSession, SaleRecord } from '../types/rbac';
import {
  formatVenueDateStr,
  getActiveRevenueWindow,
  getVenueOffsetMinutes,
  isSaleInRevenueWindow,
  toVenueWallClock,
  type RevenueDayWindow,
} from './revenueWindow';

export type CashierSheetDateMode = 'TODAY' | 'DATE' | 'RANGE' | 'ALL';

export interface CashierSalesSheetOptions {
  cashierId?: string; // 'ALL' or specific cashier ID
  cashierName?: string;
  cashierEmail?: string;
  dateMode: CashierSheetDateMode;
  dateValue?: string; // YYYY-MM-DD when dateMode === 'DATE'
  startDate?: string; // YYYY-MM-DD when dateMode === 'RANGE'
  endDate?: string; // YYYY-MM-DD when dateMode === 'RANGE'
  revenueWindow?: RevenueDayWindow;
  opsConfig?: BusinessOperatingHours | null;
  searchQuery?: string;
}

export interface CashierSalesSheetRow {
  sn: number;
  saleId: string;
  invoiceNumber: string;
  tableNumber: string;
  itemsText: string;
  isComp: boolean;
  guestName: string;
  timeText: string;
  dateText: string;
  discount: number;
  cash: number;
  qr: number;
  card: number;
  credit: number;
  deductFromDeposit: number;
  dayEndTotal: number;
  cashierId?: string;
  cashierName?: string;
}

export interface CashierSalesSheetSummary {
  totalDiscount: number;
  totalCash: number;
  totalQr: number;
  totalCard: number;
  totalCredit: number;
  totalDeductFromDeposit: number;
  dayEndTotal: number;
  openingCash: number;
  cashTotal: number;
}

export interface CashierSalesSheetData {
  rows: CashierSalesSheetRow[];
  summary: CashierSalesSheetSummary;
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export function formatSaleTime12(
  createdAt?: string | Date | null,
  opsConfig?: Pick<BusinessOperatingHours, 'timezoneOffsetMinutes'> | null
): string {
  if (!createdAt) return '-';
  const parsed = new Date(createdAt);
  if (Number.isNaN(parsed.getTime())) return '-';
  const wall = toVenueWallClock(parsed, getVenueOffsetMinutes(opsConfig, parsed));
  const hours24 = wall.getUTCHours();
  const minutes = String(wall.getUTCMinutes()).padStart(2, '0');
  const period = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 || 12;
  return `${String(hours12).padStart(2, '0')}:${minutes} ${period}`;
}

export function getSaleVenueDate(
  sale: Pick<SaleRecord, 'date_string' | 'created_at'>,
  opsConfig?: BusinessOperatingHours | null
): string {
  if (sale.date_string) return sale.date_string;
  if (sale.created_at) {
    const d = new Date(sale.created_at);
    if (!Number.isNaN(d.getTime())) {
      return opsConfig ? getActiveRevenueWindow(opsConfig, d).businessDate : formatVenueDateStr(d, opsConfig);
    }
  }
  return '';
}

function isSaleAllComp(sale: SaleRecord): boolean {
  if ((Number(sale.total_amount) || 0) > 0) return false;
  const items = Array.isArray(sale.items) ? sale.items : [];
  if (
    items.length > 0 &&
    items.every((i: any) =>
      Boolean(i.is_comp || (Number(i.comp_qty) > 0 && Number(i.comp_qty) >= (Number(i.quantity) || 1)))
    )
  ) {
    return true;
  }
  const hasAnyCompItem = items.some((i: any) => Boolean(i.is_comp || (Number(i.comp_qty) || 0) > 0));
  return hasAnyCompItem || Boolean(sale.comp_reason);
}

function formatSaleItemsText(sale: SaleRecord, isComp: boolean): string {
  const items = Array.isArray(sale.items) ? sale.items : [];
  if (items.length === 0) {
    return isComp ? 'POS Sale [COMP]' : 'POS Sale';
  }
  const formatted = items
    .map((item: any) => {
      const name = String(item.name || item.item_name || 'Item').trim();
      const qty = Math.max(1, Number(item.quantity) || 1);
      const compQty = Math.max(0, Math.min(qty, Number(item.comp_qty) || 0));
      if (!isComp && compQty > 0 && compQty < qty) {
        return `${name}(x${qty}, ${compQty} comp)`;
      }
      return `${name}(x${qty})`;
    })
    .filter(Boolean)
    .join(', ');

  return isComp ? `${formatted} [COMP]` : formatted;
}

function matchesCashierIdentity(
  recordCashierId: string | undefined | null,
  recordCashierName: string | undefined | null,
  targetCashierId: string,
  targetCashierName?: string,
  targetCashierEmail?: string
): boolean {
  if (recordCashierId) {
    return recordCashierId === targetCashierId;
  }
  const saleName = (recordCashierName || '').trim().toLowerCase();
  if (!saleName) return false;
  const targetName = (targetCashierName || '').trim().toLowerCase();
  const targetPrefix = (targetCashierEmail ? targetCashierEmail.split('@')[0] : '').trim().toLowerCase();
  return Boolean((targetName && saleName === targetName) || (targetPrefix && saleName === targetPrefix));
}

export function buildCashierSalesSheet(
  sales: SaleRecord[],
  sessions: CashierRegisterSession[],
  options: CashierSalesSheetOptions
): CashierSalesSheetData {
  const activeWindow = options.revenueWindow || getActiveRevenueWindow(options.opsConfig);
  const todayStr = activeWindow.businessDate;
  const targetCashierId = options.cashierId && options.cashierId !== 'ALL' ? options.cashierId : undefined;
  const query = (options.searchQuery || '').trim().toLowerCase();

  const filteredSales = (sales || []).filter((sale) => {
    const status = (sale.payment_status || 'PAID').toUpperCase();
    if (status === 'REFUNDED' || status === 'CANCELLED') return false;

    if (options.opsConfig?.exclude_comp_from_sales_register && isSaleAllComp(sale)) {
      return false;
    }

    const saleDate = getSaleVenueDate(sale, options.opsConfig);
    if (options.dateMode === 'TODAY') {
      if (!isSaleInRevenueWindow(sale, activeWindow)) return false;
    } else if (options.dateMode === 'DATE') {
      if (!options.dateValue || saleDate !== options.dateValue) return false;
    } else if (options.dateMode === 'RANGE') {
      if (options.startDate && saleDate < options.startDate) return false;
      if (options.endDate && saleDate > options.endDate) return false;
    }

    if (targetCashierId) {
      if (
        !matchesCashierIdentity(
          sale.cashier_id,
          sale.cashier_name,
          targetCashierId,
          options.cashierName,
          options.cashierEmail
        )
      ) {
        return false;
      }
    }

    if (query) {
      const itemsMatch = (sale.items || []).some((i: any) =>
        String(i.name || '').toLowerCase().includes(query)
      );
      const hit =
        String(sale.invoice_number || '').toLowerCase().includes(query) ||
        String(sale.table_number || sale.sale_type || '').toLowerCase().includes(query) ||
        String(sale.customer_name || '').toLowerCase().includes(query) ||
        String(sale.cashier_name || '').toLowerCase().includes(query) ||
        itemsMatch;
      if (!hit) return false;
    }

    return true;
  });

  // Chronological order for spreadsheet ledger readability
  const sortedSales = [...filteredSales].sort((a, b) => {
    const tA = a.created_at ? new Date(a.created_at).getTime() : 0;
    const tB = b.created_at ? new Date(b.created_at).getTime() : 0;
    return tA - tB;
  });

  let totalDiscount = 0;
  let totalCash = 0;
  let totalQr = 0;
  let totalCard = 0;
  let totalCredit = 0;
  let totalDeductFromDeposit = 0;

  const rows: CashierSalesSheetRow[] = sortedSales.map((sale, index) => {
    const isComp = isSaleAllComp(sale);
    const amount = isComp ? 0 : Math.max(0, round2(Number(sale.total_amount) || 0));
    const discRaw =
      Number(sale.discount_amount) > 0
        ? Math.max(Number(sale.discount_amount) || 0, Number(sale.promo_discount) || 0)
        : Number(sale.promo_discount) || 0;
    const discount = Math.max(0, round2(discRaw));

    const method = (sale.payment_method || 'CASH').toUpperCase();
    let cash = 0;
    let qr = 0;
    let card = 0;
    let credit = 0;
    let deductFromDeposit = 0;

    if (!isComp) {
      if (method === 'CASH') cash = amount;
      else if (
        method === 'UPI_QR' ||
        method === 'QR_CODE' ||
        method === 'ONLINE' ||
        method === 'UPI' ||
        method === 'QR'
      ) {
        qr = amount;
      } else if (method === 'CARD') card = amount;
      else if (method === 'CREDIT') credit = amount;
      else if (method === 'DEDUCT_FROM_DEPOSIT') deductFromDeposit = amount;
      else cash = amount;
    }

    const dayEndTotal = round2(cash + qr + card + credit + deductFromDeposit);

    totalDiscount = round2(totalDiscount + discount);
    totalCash = round2(totalCash + cash);
    totalQr = round2(totalQr + qr);
    totalCard = round2(totalCard + card);
    totalCredit = round2(totalCredit + credit);
    totalDeductFromDeposit = round2(totalDeductFromDeposit + deductFromDeposit);

    return {
      sn: index + 1,
      saleId: sale.id,
      invoiceNumber: sale.invoice_number || sale.id,
      tableNumber: sale.table_number || sale.sale_type || 'POS',
      itemsText: formatSaleItemsText(sale, isComp),
      isComp,
      guestName: sale.customer_name || 'Guest',
      timeText: formatSaleTime12(sale.created_at, options.opsConfig),
      dateText: getSaleVenueDate(sale, options.opsConfig),
      discount,
      cash,
      qr,
      card,
      credit,
      deductFromDeposit,
      dayEndTotal,
      cashierId: sale.cashier_id,
      cashierName: sale.cashier_name,
    };
  });

  // Aggregate Opening Cash from matching CashierRegisterSession records
  const seenSessionKeys = new Set<string>();
  let openingCash = 0;

  for (const sess of sessions || []) {
    if (!sess) continue;
    if (options.dateMode === 'TODAY') {
      if (sess.date_string !== todayStr) continue;
    } else if (options.dateMode === 'DATE') {
      if (!options.dateValue || sess.date_string !== options.dateValue) continue;
    } else if (options.dateMode === 'RANGE') {
      if (options.startDate && sess.date_string < options.startDate) continue;
      if (options.endDate && sess.date_string > options.endDate) continue;
    }

    if (targetCashierId) {
      if (
        !matchesCashierIdentity(
          sess.cashier_id,
          sess.cashier_name,
          targetCashierId,
          options.cashierName,
          options.cashierEmail
        )
      ) {
        continue;
      }
    }

    const dedupeKey = `${sess.cashier_id || sess.cashier_name || sess.id}::${sess.date_string}`;
    if (seenSessionKeys.has(dedupeKey)) continue;
    seenSessionKeys.add(dedupeKey);
    openingCash = round2(openingCash + Math.max(0, Number(sess.opening_float) || 0));
  }

  const dayEndTotal = round2(totalCash + totalQr + totalCard + totalCredit + totalDeductFromDeposit);
  const cashTotal = round2(totalCash + openingCash);

  return {
    rows,
    summary: {
      totalDiscount,
      totalCash,
      totalQr,
      totalCard,
      totalCredit,
      totalDeductFromDeposit,
      dayEndTotal,
      openingCash,
      cashTotal,
    },
  };
}
