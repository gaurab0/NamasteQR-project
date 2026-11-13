import assert from 'assert';
import http from 'http';
import axios from 'axios';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { db } from '../src/services/db.service';
import { generateToken } from '../src/middleware/auth.middleware';
import {
  isBusinessOwnerRole,
  isManagerRole,
  normalizeLegacyBusinessType,
  normalizeLegacyRole,
} from '../src/services/tabAccess';
import { isBusinessOwner as isClientBusinessOwner } from '../../src/utils/tabAccess';
import { buildCashierSalesSheet } from '../../src/utils/cashierSalesSheet';
import { buildCashierSalesPdfDoc } from '../../src/utils/cashierSalesPdf';
import { getActiveRevenueWindow } from '../../src/utils/revenueWindow';
import type { CashierRegisterSession, SaleRecord } from '../../src/types/rbac';

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, extra?: unknown) {
  if (ok) {
    passed++;
    console.log(`  ✅ PASS: ${name}`);
  } else {
    failed++;
    console.error(`  ❌ FAIL: ${name}`, extra !== undefined ? extra : '');
  }
}

function makeSale(overrides: Partial<SaleRecord>): SaleRecord {
  return {
    id: overrides.id || `sale-${Math.random().toString(36).slice(2, 8)}`,
    invoice_number: overrides.invoice_number || 'INV-1001',
    business_id: 'biz-test',
    table_number: overrides.table_number ?? 'Table 1',
    customer_name: overrides.customer_name ?? 'Guest',
    sale_type: overrides.sale_type ?? 'DINE_IN',
    items: overrides.items ?? [
      { item_id: 'i1', name: 'Momo', price: 250, quantity: 2, subtotal: 500 },
    ],
    subtotal: overrides.subtotal ?? 500,
    discount_amount: overrides.discount_amount ?? 0,
    promo_discount: overrides.promo_discount ?? 0,
    taxes: [],
    total_tax: 0,
    total_amount: overrides.total_amount ?? 500,
    currency: 'Rs.',
    payment_method: overrides.payment_method ?? 'CASH',
    payment_status: overrides.payment_status ?? 'PAID',
    cashier_id: overrides.cashier_id ?? 'cashier-1',
    cashier_name: overrides.cashier_name ?? 'Aarav',
    created_at: overrides.created_at ?? '2026-11-12T08:15:00.000Z',
    date_string: overrides.date_string ?? '2026-11-12',
    comp_reason: overrides.comp_reason,
  };
}

function makeSession(overrides: Partial<CashierRegisterSession>): CashierRegisterSession {
  return {
    id: overrides.id || `sess-${Math.random().toString(36).slice(2, 8)}`,
    business_id: 'biz-test',
    cashier_id: overrides.cashier_id ?? 'cashier-1',
    cashier_name: overrides.cashier_name ?? 'Aarav',
    date_string: overrides.date_string ?? '2026-11-12',
    status: overrides.status ?? 'OPEN',
    opening_float: overrides.opening_float ?? 2000,
    opened_at: overrides.opened_at ?? '2026-11-12T06:00:00.000Z',
  };
}

async function runTests() {
  console.log('====================================================');
  console.log('🧪 CASHIER SALES SHEET & LEGACY CLEANUP TEST SUITE');
  console.log('====================================================\n');

  const opsConfig = {
    enabled: true,
    openTime: '07:00',
    closeTime: '23:00',
    autoDateAdvance: false,
    dailyResetTime: '00:00',
    timezoneOffsetMinutes: -345, // UTC+05:45
  };
  const revenueWindow = getActiveRevenueWindow(opsConfig, new Date('2026-11-12T10:00:00.000Z'));

  // -------------------------------------------------------------------------
  // 1. Unit Tests: Payment Column Mapping, Comp Rows, Extra Columns, Summary
  // -------------------------------------------------------------------------
  console.log('📊 1. Pure Sheet Builder: Payment Columns, Comp, Discounts & Summary');

  const sales: SaleRecord[] = [
    makeSale({
      id: 's1',
      invoice_number: 'INV-101',
      table_number: 'Table 4',
      customer_name: 'Sita Sharma',
      payment_method: 'CASH',
      total_amount: 1200,
      discount_amount: 100,
      promo_discount: 50, // discount_amount already includes promo_discount
      items: [
        { item_id: '1', name: 'Momo', price: 300, quantity: 2, subtotal: 600 },
        { item_id: '2', name: 'Pizza', price: 700, quantity: 1, subtotal: 700 },
      ],
      cashier_id: 'cashier-1',
      cashier_name: 'Aarav',
      created_at: '2026-11-12T06:30:00.000Z',
      date_string: '2026-11-12',
    }),
    makeSale({
      id: 's2',
      invoice_number: 'INV-102',
      table_number: 'Takeaway',
      sale_type: 'TAKEAWAY',
      customer_name: 'Rohan',
      payment_method: 'ONLINE', // maps to QR
      total_amount: 450,
      discount_amount: 0,
      promo_discount: 50, // promo only when discount_amount is 0
      items: [{ item_id: '3', name: 'Latte', price: 500, quantity: 1, subtotal: 500 }],
      cashier_id: 'cashier-1',
      cashier_name: 'Aarav',
      created_at: '2026-11-12T07:00:00.000Z',
      date_string: '2026-11-12',
    }),
    makeSale({
      id: 's3',
      invoice_number: 'INV-103',
      table_number: 'Table 2',
      customer_name: 'Nisha',
      payment_method: 'QR_CODE',
      total_amount: 350,
      cashier_id: 'cashier-1',
      cashier_name: 'Aarav',
      created_at: '2026-11-12T07:15:00.000Z',
      date_string: '2026-11-12',
    }),
    makeSale({
      id: 's4',
      invoice_number: 'INV-104',
      table_number: 'Table 8',
      customer_name: 'Bikash',
      payment_method: 'CARD',
      total_amount: 900,
      cashier_id: 'cashier-1',
      cashier_name: 'Aarav',
      created_at: '2026-11-12T08:00:00.000Z',
      date_string: '2026-11-12',
    }),
    makeSale({
      id: 's5',
      invoice_number: 'INV-105',
      table_number: 'Table 9',
      customer_name: 'Corp Guest',
      payment_method: 'CREDIT',
      total_amount: 1500,
      cashier_id: 'cashier-1',
      cashier_name: 'Aarav',
      created_at: '2026-11-12T09:00:00.000Z',
      date_string: '2026-11-12',
    }),
    makeSale({
      id: 's6',
      invoice_number: 'INV-106',
      table_number: 'Table 5',
      customer_name: 'Deposit Member',
      payment_method: 'DEDUCT_FROM_DEPOSIT',
      total_amount: 600,
      cashier_id: 'cashier-1',
      cashier_name: 'Aarav',
      created_at: '2026-11-12T09:30:00.000Z',
      date_string: '2026-11-12',
    }),
    makeSale({
      id: 's7-comp',
      invoice_number: 'INV-107',
      table_number: 'Table 3',
      customer_name: 'VIP Comp',
      payment_method: 'CASH',
      total_amount: 0,
      items: [{ item_id: '4', name: 'Dessert', price: 250, quantity: 1, subtotal: 0, is_comp: true, comp_qty: 1 }],
      cashier_id: 'cashier-1',
      cashier_name: 'Aarav',
      created_at: '2026-11-12T09:45:00.000Z',
      date_string: '2026-11-12',
    }),
    makeSale({
      id: 's8-refunded',
      invoice_number: 'INV-108',
      payment_status: 'REFUNDED',
      payment_method: 'CASH',
      total_amount: 9999,
      cashier_id: 'cashier-1',
      cashier_name: 'Aarav',
      created_at: '2026-11-12T09:50:00.000Z',
      date_string: '2026-11-12',
    }),
    // Second cashier today
    makeSale({
      id: 's9-c2',
      invoice_number: 'INV-201',
      table_number: 'Table 11',
      customer_name: 'Other Shift Guest',
      payment_method: 'CASH',
      total_amount: 800,
      cashier_id: 'cashier-2',
      cashier_name: 'Aarav', // Same display name, different ID!
      created_at: '2026-11-12T11:00:00.000Z',
      date_string: '2026-11-12',
    }),
    // Yesterday's sale for cashier-1
    makeSale({
      id: 's10-prev',
      invoice_number: 'INV-050',
      table_number: 'Table 1',
      customer_name: 'Yesterday Guest',
      payment_method: 'UPI_QR',
      total_amount: 700,
      cashier_id: 'cashier-1',
      cashier_name: 'Aarav',
      created_at: '2026-11-11T09:00:00.000Z',
      date_string: '2026-11-11',
    }),
  ];

  const sessions: CashierRegisterSession[] = [
    makeSession({ id: 'sess-1', cashier_id: 'cashier-1', date_string: '2026-11-12', opening_float: 2500 }),
    makeSession({ id: 'sess-2', cashier_id: 'cashier-2', date_string: '2026-11-12', opening_float: 1500 }),
    makeSession({ id: 'sess-3', cashier_id: 'cashier-1', date_string: '2026-11-11', opening_float: 2000 }),
  ];

  const c1Today = buildCashierSalesSheet(sales, sessions, {
    cashierId: 'cashier-1',
    cashierName: 'Aarav',
    dateMode: 'TODAY',
    revenueWindow,
    opsConfig,
  });

  check('Cashier 1 Today includes 7 bills (excludes refunded, excludes cashier-2 even with same name, excludes yesterday)', c1Today.rows.length === 7, c1Today.rows.length);
  check('Row 1 Invoice #, Table #, Item formatting, Guest Name populate accurately',
    c1Today.rows[0].invoiceNumber === 'INV-101' &&
    c1Today.rows[0].tableNumber === 'Table 4' &&
    c1Today.rows[0].itemsText === 'Momo(x2), Pizza(x1)' &&
    c1Today.rows[0].guestName === 'Sita Sharma'
  );
  check('Discount avoids double-counting when discount_amount already includes promo_discount, and uses promo_discount when discount_amount is 0',
    c1Today.rows[0].discount === 100 && c1Today.rows[1].discount === 50 && c1Today.summary.totalDiscount === 150
  );
  check('ONLINE and QR_CODE both map to QR column',
    c1Today.rows[1].qr === 450 && c1Today.rows[2].qr === 350 && c1Today.summary.totalQr === 800
  );
  check('CARD, CREDIT, and DEDUCT_FROM_DEPOSIT map to their respective columns',
    c1Today.summary.totalCard === 900 &&
    c1Today.summary.totalCredit === 1500 &&
    c1Today.summary.totalDeductFromDeposit === 600
  );
  check('100% Comp Rs. 0 bill is included and tagged [COMP] with 0 in all payment columns',
    c1Today.rows[6].isComp === true &&
    c1Today.rows[6].itemsText.includes('[COMP]') &&
    c1Today.rows[6].dayEndTotal === 0
  );
  check('Day End Total sums all 5 payment columns (1200 + 800 + 900 + 1500 + 600 = 5000)',
    c1Today.summary.dayEndTotal === 5000, c1Today.summary
  );
  check('Opening Cash pulls only Cashier 1 today float (2500) and Cash Total = Total Cash (1200) + Opening Cash (2500) = 3700',
    c1Today.summary.openingCash === 2500 && c1Today.summary.cashTotal === 3700
  );

  // Combined All Cashiers view for Today
  const allToday = buildCashierSalesSheet(sales, sessions, {
    cashierId: 'ALL',
    dateMode: 'TODAY',
    revenueWindow,
    opsConfig,
  });
  check('ALL Cashiers Today combines Cashier 1 + Cashier 2 sales (8 rows) and floats (2500 + 1500 = 4000)',
    allToday.rows.length === 8 &&
    allToday.summary.totalCash === 2000 &&
    allToday.summary.openingCash === 4000 &&
    allToday.summary.cashTotal === 6000 &&
    allToday.summary.dayEndTotal === 5800
  );

  // Date Range & All Time & Search Query filters
  const c1Range = buildCashierSalesSheet(sales, sessions, {
    cashierId: 'cashier-1',
    dateMode: 'RANGE',
    startDate: '2026-11-11',
    endDate: '2026-11-12',
    revenueWindow,
    opsConfig,
  });
  check('Date Range (2026-11-11..12) for Cashier 1 includes yesterday UPI_QR sale and both opening floats (4500)',
    c1Range.rows.length === 8 &&
    c1Range.summary.totalQr === 1500 &&
    c1Range.summary.openingCash === 4500 &&
    c1Range.summary.cashTotal === 5700
  );

  const searchRes = buildCashierSalesSheet(sales, sessions, {
    cashierId: 'ALL',
    dateMode: 'ALL',
    searchQuery: 'INV-105',
    revenueWindow,
    opsConfig,
  });
  check('Search query filters rows cleanly while retaining scope',
    searchRes.rows.length === 1 && searchRes.rows[0].invoiceNumber === 'INV-105'
  );

  // Edge cases: UPI payment method & comped items with non-zero packaging charge
  const edgeSales: SaleRecord[] = [
    makeSale({
      id: 'edge-upi',
      invoice_number: 'INV-E1',
      payment_method: 'UPI' as any,
      total_amount: 750,
      cashier_id: 'cashier-1',
      date_string: '2026-11-12',
    }),
    makeSale({
      id: 'edge-comp-pkg',
      invoice_number: 'INV-E2',
      payment_method: 'CASH',
      total_amount: 20, // packaging charge billed even though item is comped
      items: [{ item_id: 'i9', name: 'Gift Cake', price: 300, quantity: 1, subtotal: 0, is_comp: true, comp_qty: 1 }],
      cashier_id: 'cashier-1',
      date_string: '2026-11-12',
    }),
  ];
  const edgeSheet = buildCashierSalesSheet(edgeSales, sessions, {
    cashierId: 'cashier-1',
    dateMode: 'DATE',
    dateValue: '2026-11-12',
    revenueWindow,
    opsConfig,
  });
  check('UPI payment method maps to QR column (never falls back to Cash)',
    edgeSheet.rows[0].qr === 750 && edgeSheet.rows[0].cash === 0 && edgeSheet.summary.totalQr === 750
  );
  check('Comped item with non-zero packaging total_amount > 0 preserves collected cash instead of zeroing to [COMP]',
    edgeSheet.rows[1].isComp === false && edgeSheet.rows[1].cash === 20 && edgeSheet.summary.totalCash === 20
  );

  // PDF generation & A4 landscape width fit verification
  const manyRows = Array.from({ length: 35 }, (_, idx) => ({
    ...c1Today.rows[0],
    sn: idx + 1,
    saleId: `pdf-${idx}`,
    invoiceNumber: `INV-${200 + idx}`,
    itemsText: 'Steamed Chicken Momo(x2), Woodfired Margherita Pizza(x1), Fresh Lime Soda(x3)',
  }));
  const { doc, filename } = buildCashierSalesPdfDoc(
    { rows: manyRows, summary: c1Today.summary },
    {
      businessName: 'Namaste Bistro',
      cashierLabel: 'Aarav',
      periodLabel: 'Today (2026-11-12)',
      currencySymbol: '₹',
      fileDateTag: '2026-11-12',
    }
  );
  const pdfBytes = new Uint8Array(doc.output('arraybuffer'));
  const pdfHeader = String.fromCharCode(...pdfBytes.slice(0, 5));
  const tableWidth = ((doc as any).lastAutoTable?.columns || []).reduce((s: number, c: any) => s + Number(c.width || 0), 0);
  const printableWidth = doc.internal.pageSize.getWidth() - 40;
  check('PDF builder produces valid %PDF- binary with >= 2 pages for 35 rows and safe filename',
    pdfHeader === '%PDF-' && doc.getNumberOfPages() >= 2 && filename === 'Namaste_Bistro_Cashier_Sales_Aarav_2026-11-12.pdf',
    { pdfHeader, pages: doc.getNumberOfPages(), filename }
  );
  check('PDF table column widths fit inside A4 landscape printable area without horizontal overflow',
    tableWidth > 0 && tableWidth <= printableWidth,
    { tableWidth, printableWidth }
  );

  // -------------------------------------------------------------------------
  // 2. Legacy Hotel Role & BusinessType Runtime Normalization
  // -------------------------------------------------------------------------
  console.log('\n🏨 2. Legacy HOTEL / HOTEL_OWNER Runtime Resilience');
  check("normalizeLegacyRole('HOTEL_OWNER') -> 'RESTAURANT_OWNER'", normalizeLegacyRole('HOTEL_OWNER') === 'RESTAURANT_OWNER');
  check("normalizeLegacyRole('HOTEL_MANAGER') -> 'RESTAURANT_MANAGER'", normalizeLegacyRole('HOTEL_MANAGER') === 'RESTAURANT_MANAGER');
  check("normalizeLegacyBusinessType('HOTEL') -> 'RESTAURANT'", normalizeLegacyBusinessType('HOTEL') === 'RESTAURANT');
  check("normalizeLegacyBusinessType('RESORT') -> 'RESTAURANT'", normalizeLegacyBusinessType('RESORT') === 'RESTAURANT');
  check("normalizeLegacyBusinessType('CAFE') -> 'CAFE'", normalizeLegacyBusinessType('CAFE') === 'CAFE');
  check('isBusinessOwnerRole / isManagerRole / client isBusinessOwner handle legacy hotel roles seamlessly',
    isBusinessOwnerRole('HOTEL_OWNER') && isManagerRole('HOTEL_MANAGER') && isClientBusinessOwner('HOTEL_OWNER')
  );

  // -------------------------------------------------------------------------
  // 3. Backend API Verification: GET /api/rbac/cashier-session/all
  // -------------------------------------------------------------------------
  console.log('\n🔌 3. Backend API: GET /api/rbac/cashier-session/all Date Range & Role Scoping');

  const app = createApp();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://localhost:${port}/api`;
  const ts = Date.now();
  const bizId = `test-cashier-sheet-${ts}`;
  const ownerId = `usr-owner-${ts}`;
  const c1Id = `usr-c1-${ts}`;
  const c2Id = `usr-c2-${ts}`;

  try {
    await db.ensureBusiness(bizId, 'Sheet Test Bistro', 'RESTAURANT');
    await prisma.user.createMany({
      data: [
        {
          id: ownerId,
          business_id: bizId,
          email: `owner-${ts}@test.local`,
          name: 'Owner Test',
          password_hash: 'x',
          role: 'HOTEL_OWNER', // legacy persisted role in DB!
          status: 'ACTIVE',
          allowed_tabs: ['overview', 'billing'],
        },
        {
          id: c1Id,
          business_id: bizId,
          email: `c1-${ts}@test.local`,
          name: 'Cashier One',
          password_hash: 'x',
          role: 'CASHIER',
          status: 'ACTIVE',
          allowed_tabs: ['billing'],
        },
        {
          id: c2Id,
          business_id: bizId,
          email: `c2-${ts}@test.local`,
          name: 'Cashier Two',
          password_hash: 'x',
          role: 'CASHIER',
          status: 'ACTIVE',
          allowed_tabs: ['billing'],
        },
      ],
    });

    await prisma.cashierRegisterSession.createMany({
      data: [
        {
          id: `cs-1-${ts}`,
          business_id: bizId,
          cashier_id: c1Id,
          cashier_name: 'Cashier One',
          date_string: '2026-11-10',
          status: 'CLOSED',
          opening_float: 1000,
        },
        {
          id: `cs-2-${ts}`,
          business_id: bizId,
          cashier_id: c1Id,
          cashier_name: 'Cashier One',
          date_string: '2026-11-12',
          status: 'OPEN',
          opening_float: 2200,
        },
        {
          id: `cs-3-${ts}`,
          business_id: bizId,
          cashier_id: c2Id,
          cashier_name: 'Cashier Two',
          date_string: '2026-11-12',
          status: 'OPEN',
          opening_float: 3300,
        },
      ],
    });

    const ownerToken = generateToken({ userId: ownerId, role: 'HOTEL_OWNER' as any, businessId: bizId });
    const c1Token = generateToken({ userId: c1Id, role: 'STAFF', businessId: bizId });

    // Owner with legacy HOTEL_OWNER token can query all dates and filter by cashier_id
    const resAll = await axios.get(`${baseUrl}/rbac/cashier-session/all`, {
      params: { businessId: bizId, all_dates: 'true' },
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    check('Owner (even with legacy HOTEL_OWNER DB/JWT role) fetches all historical sessions with all_dates=true',
      resAll.status === 200 && resAll.data?.data?.length === 3
    );

    const resRange = await axios.get(`${baseUrl}/rbac/cashier-session/all`, {
      params: { businessId: bizId, start_date: '2026-11-12', end_date: '2026-11-12', cashier_id: c2Id },
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    check('Owner can filter cashier-session/all by start_date, end_date, and cashier_id',
      resRange.data?.data?.length === 1 && resRange.data.data[0].cashier_id === c2Id && resRange.data.data[0].opening_float === 3300
    );

    // Cashier cannot override cashier_id to peek at another cashier's float
    const resCashier = await axios.get(`${baseUrl}/rbac/cashier-session/all`, {
      params: { businessId: bizId, all_dates: 'true', cashier_id: c2Id },
      headers: { Authorization: `Bearer ${c1Token}` },
    });
    check('Cashier role is strictly scoped to own sessions even if cashier_id param targets another cashier',
      resCashier.status === 200 &&
      resCashier.data?.data?.length === 2 &&
      resCashier.data.data.every((s: any) => s.cashier_id === c1Id)
    );

    // Seed sales for both cashiers and verify GET /api/rbac/sales cashier RBAC scoping
    await prisma.sale.createMany({
      data: [
        {
          id: `sale-c1-${ts}`,
          invoice_number: `INV-C1-${ts}`,
          business_id: bizId,
          customer_name: 'Guest 1',
          sale_type: 'DINE_IN',
          items: [{ name: 'Momo', price: 200, quantity: 1 }] as any,
          taxes: [] as any,
          subtotal: 200,
          total_tax: 0,
          total_amount: 200,
          currency: 'Rs.',
          payment_method: 'CASH',
          payment_status: 'PAID',
          cashier_id: c1Id,
          cashier_name: 'Cashier One',
          date_string: '2026-11-12',
        },
        {
          id: `sale-c2-${ts}`,
          invoice_number: `INV-C2-${ts}`,
          business_id: bizId,
          customer_name: 'Guest 2',
          sale_type: 'DINE_IN',
          items: [{ name: 'Pizza', price: 500, quantity: 1 }] as any,
          taxes: [] as any,
          subtotal: 500,
          total_tax: 0,
          total_amount: 500,
          currency: 'Rs.',
          payment_method: 'CARD',
          payment_status: 'PAID',
          cashier_id: c2Id,
          cashier_name: 'Cashier Two',
          date_string: '2026-11-12',
        },
      ],
    });

    const ownerSalesAll = await axios.get(`${baseUrl}/rbac/sales`, {
      params: { businessId: bizId },
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    const ownerSalesC2 = await axios.get(`${baseUrl}/rbac/sales`, {
      params: { businessId: bizId, cashierId: c2Id },
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    const c1Sales = await axios.get(`${baseUrl}/rbac/sales`, {
      params: { businessId: bizId, cashierId: c2Id },
      headers: { Authorization: `Bearer ${c1Token}` },
    });
    check('Owner gets all sales by default and can filter GET /api/rbac/sales by cashierId',
      ownerSalesAll.data?.data?.length === 2 &&
      ownerSalesC2.data?.data?.length === 1 &&
      ownerSalesC2.data.data[0].cashier_id === c2Id
    );
    check('Cashier-only user calling GET /api/rbac/sales is strictly scoped to own sales',
      c1Sales.data?.data?.length === 1 &&
      c1Sales.data.data[0].cashier_id === c1Id
    );
  } finally {
    await prisma.sale.deleteMany({ where: { business_id: bizId } }).catch(() => {});
    await prisma.cashierRegisterSession.deleteMany({ where: { business_id: bizId } }).catch(() => {});
    await prisma.user.deleteMany({ where: { business_id: bizId } }).catch(() => {});
    await prisma.business.deleteMany({ where: { id: bizId } }).catch(() => {});
    server.close();
  }

  console.log('\n====================================================');
  console.log(`🏁 Test Results: ${passed} Passed, ${failed} Failed`);
  console.log('====================================================');
  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
