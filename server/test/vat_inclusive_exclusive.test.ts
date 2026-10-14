/**
 * Verification suite for Exclusive of VAT% vs. Inclusive of VAT% modes,
 * Grand-Total-only discount deduction, and Excel GL Journal Summary balance.
 *
 * Run: node ./node_modules/tsx/dist/cli.mjs server/test/vat_inclusive_exclusive.test.ts
 */
import { calculateBillTotals } from '../../src/utils/taxCalculations';
import { buildSalesWorkbookData } from '../../src/utils/excelExport';
import { rbacService } from '../src/services/rbac.service';
import { prisma } from '../src/lib/prisma';
import { db } from '../src/services/db.service';
import type { BusinessTaxConfig } from '../../src/types/rbac';

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, extra?: any) {
  if (ok) {
    passed++;
    console.log(`  ✅ PASS: ${name}`);
  } else {
    failed++;
    console.log(`  ❌ FAIL: ${name}`, extra ?? '');
  }
}

const exclusiveConfig: BusinessTaxConfig = {
  business_id: 'biz-test',
  tax_enabled: true,
  tax_inclusive: false,
  currency: 'NPR',
  currency_symbol: 'Rs.',
  updated_at: new Date().toISOString(),
  rates: [
    { id: 'vat', name: 'VAT', rate_percent: 13, enabled: true, is_inclusive: false },
    { id: 'sc', name: 'Service Charge', rate_percent: 10, enabled: false, is_inclusive: false },
  ],
  active_promo_enabled: true,
  active_promo_code: 'WELCOME10',
  active_promo_percent: 10,
};

const inclusiveConfig: BusinessTaxConfig = {
  ...exclusiveConfig,
  tax_inclusive: true,
  rates: [
    { id: 'vat', name: 'VAT', rate_percent: 13, enabled: true, is_inclusive: true },
    { id: 'sc', name: 'Service Charge', rate_percent: 10, enabled: false, is_inclusive: true },
  ],
};

const inclusiveWithServiceChargeConfig: BusinessTaxConfig = {
  ...inclusiveConfig,
  rates: [
    { id: 'vat', name: 'VAT', rate_percent: 13, enabled: true, is_inclusive: true },
    { id: 'sc', name: 'Service Charge', rate_percent: 10, enabled: true, is_inclusive: true },
  ],
};

const exclusiveWithServiceChargeConfig: BusinessTaxConfig = {
  ...exclusiveConfig,
  rates: [
    { id: 'vat', name: 'VAT', rate_percent: 13, enabled: true, is_inclusive: false },
    { id: 'sc', name: 'Service Charge', rate_percent: 10, enabled: true, is_inclusive: false },
  ],
};

async function main() {
  console.log('🧪 1. Testing calculateBillTotals (Exclusive vs. Inclusive of VAT% & Discounts)');

  // 1a. Exclusive of VAT% (Rs. 400 @ 13% VAT)
  const ex1 = calculateBillTotals({
    itemsMenuTotal: 400,
    taxConfig: exclusiveConfig,
  });
  check(
    'Exclusive 400 @ 13% VAT -> Subtotal 400, VAT 52, Grand Total 452',
    ex1.isInclusive === false &&
      ex1.subtotal === 400 &&
      ex1.totalTax === 52 &&
      ex1.grossTotal === 452 &&
      ex1.grandTotal === 452,
    ex1
  );

  // 1b. Inclusive of VAT% (Rs. 400 @ 13% VAT -> Subtotal 353.98, VAT 46.02, Grand Total 400)
  const in1 = calculateBillTotals({
    itemsMenuTotal: 400,
    taxConfig: inclusiveConfig,
  });
  check(
    'Inclusive 400 @ 13% VAT -> Subtotal 353.98, VAT 46.02, Grand Total 400.00',
    in1.isInclusive === true &&
      in1.subtotal === 353.98 &&
      in1.totalTax === 46.02 &&
      in1.grossTotal === 400 &&
      in1.grandTotal === 400 &&
      Number((in1.subtotal + in1.totalTax).toFixed(2)) === 400,
    in1
  );

  // 1c. Discount in Inclusive mode (10% promo on Rs. 400 @ 13% VAT):
  // Subtotal and VAT must NOT change; discount (40) is deducted from Grand Total (400 -> 360)
  const inDisc = calculateBillTotals({
    itemsMenuTotal: 400,
    taxConfig: inclusiveConfig,
    promoDiscountPercent: 10,
  });
  check(
    'Inclusive 400 @ 13% VAT + 10% promo -> Subtotal 353.98, VAT 46.02, Discount 40, Final Grand Total 360',
    inDisc.subtotal === 353.98 &&
      inDisc.totalTax === 46.02 &&
      inDisc.promoDiscountAmount === 40 &&
      inDisc.totalDiscountAmount === 40 &&
      inDisc.grandTotal === 360,
    inDisc
  );

  // 1d. Discount in Exclusive mode (10% promo + Rs. 12 flat on Rs. 400 @ 13% VAT):
  // Subtotal (400) and VAT (52) must NOT change; discount (45.20 + 12 = 57.20) is deducted from Pre-Discount Grand Total (452 -> 394.80)
  const exDisc = calculateBillTotals({
    itemsMenuTotal: 400,
    taxConfig: exclusiveConfig,
    promoDiscountPercent: 10,
    manualFlatDiscount: 12,
  });
  check(
    'Exclusive 400 @ 13% VAT + 10% promo + Rs. 12 flat -> Subtotal 400, VAT 52, Discount 57.20, Final Grand Total 394.80',
    exDisc.subtotal === 400 &&
      exDisc.totalTax === 52 &&
      exDisc.promoDiscountAmount === 45.2 &&
      exDisc.manualDiscountAmount === 12 &&
      exDisc.totalDiscountAmount === 57.2 &&
      exDisc.grandTotal === 394.8,
    exDisc
  );

  // 1e. Inclusive mode with multiple taxes (13% VAT + 10% Service Charge = 23% total)
  const inMulti = calculateBillTotals({
    itemsMenuTotal: 400,
    taxConfig: inclusiveWithServiceChargeConfig,
    manualFlatDiscount: 50,
  });
  check(
    'Inclusive 400 @ 13% VAT + 10% SC + Rs. 50 flat discount -> Subtotal + TotalTax == 400, Grand Total == 350',
    inMulti.subtotal === 325.2 &&
      inMulti.totalTax === 74.8 &&
      inMulti.serviceChargeAmount === 32.52 &&
      Number((inMulti.subtotal + inMulti.totalTax - inMulti.totalDiscountAmount).toFixed(2)) ===
        inMulti.grandTotal &&
      inMulti.grandTotal === 350,
    inMulti
  );

  // 1f. Edge cases: zero total and discount exceeding total
  const zeroBill = calculateBillTotals({
    itemsMenuTotal: 0,
    taxConfig: inclusiveConfig,
    manualFlatDiscount: 100,
  });
  check(
    'Zero itemsMenuTotal clamps subtotal, tax, discount, and grandTotal to 0',
    zeroBill.subtotal === 0 &&
      zeroBill.totalTax === 0 &&
      zeroBill.totalDiscountAmount === 0 &&
      zeroBill.grandTotal === 0,
    zeroBill
  );

  console.log('\n🧪 2. Testing Excel Export & GL Journal Summary Balance (src/utils/excelExport.ts)');

  // Build sales records covering:
  // - Inclusive sale with Service Charge + Beverage item + Discount
  // - Exclusive sale with Service Charge + Credit settlement
  const glAccounts = rbacService.getDefaultGLAccounts('biz-test');
  const creditAcc = {
    id: 'gl-cust-1',
    business_id: 'biz-test',
    account_number: '1125',
    account_name: 'Corporate Guest Credit A/C',
    category: 'ASSET',
    mapping_key: 'CREDIT_SETTLEMENT',
  };

  const sale1Calc = calculateBillTotals({
    itemsMenuTotal: 400,
    taxConfig: inclusiveWithServiceChargeConfig,
    promoDiscountPercent: 10,
  });
  const sale2Calc = calculateBillTotals({
    itemsMenuTotal: 500,
    taxConfig: exclusiveWithServiceChargeConfig,
    manualFlatDiscount: 25,
  });

  const sampleSales = [
    {
      id: 'sale-1',
      invoice_number: 'INV-001',
      order_number: 'ORD-001',
      created_at: new Date().toISOString(),
      sale_type: 'DINE_IN',
      table_number: 'Table 1',
      customer_name: 'Walk-in Guest',
      items: [
        { name: 'Thakali Set', category: 'Mains', price: 250, quantity: 1 },
        { name: 'Fresh Lime Soda', station: 'BAR', price: 150, quantity: 1 }, // station BAR without category keyword
      ],
      payment_method: 'CASH',
      payment_status: 'PAID',
      subtotal: sale1Calc.subtotal,
      taxes: sale1Calc.taxesList,
      total_tax: sale1Calc.totalTax,
      service_charge: sale1Calc.serviceChargeAmount,
      discount_amount: sale1Calc.totalDiscountAmount,
      promo_code: 'WELCOME10',
      promo_discount: sale1Calc.promoDiscountAmount,
      total_amount: sale1Calc.grandTotal,
      currency: 'Rs.',
    },
    {
      id: 'sale-2',
      invoice_number: 'INV-002',
      order_number: 'ORD-002',
      created_at: new Date().toISOString(),
      sale_type: 'DINE_IN',
      table_number: 'Table 2',
      customer_name: 'Corporate Guest',
      items: [{ name: 'Grilled Trout', category: 'Food', price: 500, quantity: 1 }],
      payment_method: 'CREDIT',
      credit_gl_account_id: 'gl-cust-1',
      credit_gl_account_name: 'Corporate Guest Credit A/C',
      credit_gl_account_number: '1125',
      payment_status: 'PAID',
      subtotal: sale2Calc.subtotal,
      taxes: sale2Calc.taxesList,
      total_tax: sale2Calc.totalTax,
      service_charge: sale2Calc.serviceChargeAmount,
      discount_amount: sale2Calc.totalDiscountAmount,
      total_amount: sale2Calc.grandTotal,
      currency: 'Rs.',
    },
  ];

  const sheets = buildSalesWorkbookData(sampleSales, [...glAccounts, creditAcc], 'Rs.');
  check(
    'Workbook preserves all 4 sheets and exact column counts (26, 14, 6, 22)',
    sheets.length === 4 &&
      sheets[0].sheetName === 'Sales Register' &&
      sheets[0].headers.length === 26 &&
      sheets[1].sheetName === 'GL Links & Mapping' &&
      sheets[1].headers.length === 14 &&
      sheets[2].sheetName === 'GL Journal Summary' &&
      sheets[2].headers.length === 6 &&
      sheets[3].sheetName === 'Credit Sales Register' &&
      sheets[3].headers.length === 22,
    sheets.map((s) => ({ name: s.sheetName, cols: s.headers.length }))
  );

  const journalSummaryRow = sheets[2].rows[sheets[2].rows.length - 1];
  check(
    'GL Journal Summary is strictly balanced (Debits === Credits) even when Service Charge + Inclusive/Exclusive VAT + Discounts are active',
    journalSummaryRow[0] === 'TOTAL' &&
      journalSummaryRow[3] === journalSummaryRow[4] &&
      journalSummaryRow[5] === 'Balanced (Debits = Credits)',
    journalSummaryRow
  );

  const bevRow = sheets[2].rows.find((r) => r[0] === '4020');
  check(
    'Bar item with station="BAR" is accurately classified into 4020 Beverage Sales Revenue',
    Boolean(bevRow) && Number(bevRow![4]) === 121.95,
    bevRow
  );

  console.log('\n🧪 3. Testing Server-Side Tax & Promo Recalculation (rbacService + PostgreSQL)');
  const BIZ = `test-vat-mode-${Date.now()}`;
  const orderId = `ORD-TEST-${Date.now()}`;
  try {
    await db.ensureBusiness(BIZ);
    // Seed an unsettled order with Rs. 400 menu items and WELCOME10 promo applied
    await prisma.tableOrder.create({
      data: {
        id: orderId,
        order_number: 'ORD-01',
        business_id: BIZ,
        table_id: null,
        table_number: 'Table 1',
        items: [
          { item_id: 'd1', name: 'Chicken Momo', price: 200, quantity: 2, status: 'SERVED', station: 'KITCHEN' },
        ],
        subtotal: 400,
        tax_amount: 52,
        taxes: [{ id: 'vat', name: 'VAT', rate_percent: 13, amount: 52, is_inclusive: false }],
        promo_code: 'WELCOME10',
        promo_discount: 45.2,
        total_amount: 406.8,
        status: 'SERVED',
        payment_status: 'UNPAID',
      },
    });

    // Switch business to Inclusive of VAT% mode
    const updatedCfg = await rbacService.updateTaxConfig(BIZ, {
      tax_enabled: true,
      tax_inclusive: true,
      active_promo_enabled: true,
      active_promo_code: 'WELCOME10',
      active_promo_percent: 10,
      rates: [
        { id: 'vat', name: 'VAT', rate_percent: 13, enabled: true, is_inclusive: true },
      ],
    });

    check('updateTaxConfig persists tax_inclusive=true and syncs rates', updatedCfg.tax_inclusive === true && updatedCfg.rates[0].is_inclusive === true);

    const od1 = await prisma.tableOrder.findUnique({ where: { id: orderId } });
    check(
      'Switching to Inclusive mode recalculates unsettled order: Subtotal=353.98, VAT=46.02, WELCOME10 Promo=40.00, Total=360.00',
      Number(od1?.subtotal) === 353.98 &&
        Number(od1?.tax_amount) === 46.02 &&
        Number(od1?.promo_discount) === 40 &&
        Number(od1?.total_amount) === 360,
      od1
    );

    // Switch back to Exclusive of VAT% mode
    await rbacService.updateTaxConfig(BIZ, {
      tax_enabled: true,
      tax_inclusive: false,
      rates: [
        { id: 'vat', name: 'VAT', rate_percent: 13, enabled: true, is_inclusive: false },
      ],
    });

    const od2 = await prisma.tableOrder.findUnique({ where: { id: orderId } });
    check(
      'Switching back to Exclusive mode recalculates unsettled order: Subtotal=400, VAT=52, WELCOME10 Promo=45.20, Total=406.80',
      Number(od2?.subtotal) === 400 &&
        Number(od2?.tax_amount) === 52 &&
        Number(od2?.promo_discount) === 45.2 &&
        Number(od2?.total_amount) === 406.8,
      od2
    );
  } finally {
    await prisma.tableOrder.deleteMany({ where: { id: orderId } }).catch(() => {});
    await prisma.taxConfig.deleteMany({ where: { business_id: BIZ } }).catch(() => {});
    await prisma.business.deleteMany({ where: { id: BIZ } }).catch(() => {});
  }

  console.log(`\n📊 Summary: ${passed} passed, ${failed} failed.`);
  if (failed > 0) process.exit(1);
  process.exit(0);
}

main().catch((err) => {
  console.error('Unhandled error in test suite:', err);
  process.exit(1);
});
