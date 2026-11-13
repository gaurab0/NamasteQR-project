/**
 * Verification suite for Exclusive of VAT% vs. Inclusive of VAT% modes,
 * Grand-Total-only discount deduction, and Excel GL Journal Summary balance.
 *
 * Run: node ./node_modules/tsx/dist/cli.mjs server/test/vat_inclusive_exclusive.test.ts
 */
import { calculateBillTotals, computeOrderBillableAmounts } from '../../src/utils/taxCalculations';
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
  // Discount applies on Subtotal (353.98 -> 35.40 off -> taxableSubtotal 318.58), VAT 13% on 318.58 = 41.42, Grand Total = 360.00
  const inDisc = calculateBillTotals({
    itemsMenuTotal: 400,
    taxConfig: inclusiveConfig,
    promoDiscountPercent: 10,
  });
  check(
    'Inclusive 400 @ 13% VAT + 10% promo on subtotal -> Subtotal 353.98, Discount 35.40, Taxable 318.58, VAT 41.42, Grand Total 360',
    inDisc.subtotal === 353.98 &&
      inDisc.promoDiscountAmount === 35.4 &&
      inDisc.totalDiscountAmount === 35.4 &&
      inDisc.taxableSubtotal === 318.58 &&
      inDisc.totalTax === 41.42 &&
      inDisc.grandTotal === 360,
    inDisc
  );

  // 1d. Discount in Exclusive mode (10% promo + Rs. 12 flat on Rs. 400 @ 13% VAT):
  // Discount applies on Subtotal (400 -> 40 + 12 = 52 off -> taxableSubtotal 348), VAT 13% on 348 = 45.24, Grand Total = 393.24
  const exDisc = calculateBillTotals({
    itemsMenuTotal: 400,
    taxConfig: exclusiveConfig,
    promoDiscountPercent: 10,
    manualFlatDiscount: 12,
  });
  check(
    'Exclusive 400 @ 13% VAT + 10% promo + Rs. 12 flat on subtotal -> Subtotal 400, Discount 52, Taxable 348, VAT 45.24, Grand Total 393.24',
    exDisc.subtotal === 400 &&
      exDisc.promoDiscountAmount === 40 &&
      exDisc.manualDiscountAmount === 12 &&
      exDisc.totalDiscountAmount === 52 &&
      exDisc.taxableSubtotal === 348 &&
      exDisc.totalTax === 45.24 &&
      exDisc.grandTotal === 393.24,
    exDisc
  );

  // 1e. Inclusive mode with multiple taxes (13% VAT + 10% Service Charge = 23% total)
  // Subtotal = 325.20; Rs. 50 flat off subtotal -> taxableSubtotal = 275.20; VAT = 35.78, SC = 27.52, TotalTax = 63.30, Grand Total = 338.50
  const inMulti = calculateBillTotals({
    itemsMenuTotal: 400,
    taxConfig: inclusiveWithServiceChargeConfig,
    manualFlatDiscount: 50,
  });
  check(
    'Inclusive 400 @ 13% VAT + 10% SC + Rs. 50 flat on subtotal -> Taxable 275.20, TotalTax 63.30, Grand Total 338.50',
    inMulti.subtotal === 325.2 &&
      inMulti.totalDiscountAmount === 50 &&
      inMulti.taxableSubtotal === 275.2 &&
      inMulti.serviceChargeAmount === 27.52 &&
      inMulti.totalTax === 63.3 &&
      Number((inMulti.subtotal + inMulti.totalTax - inMulti.totalDiscountAmount).toFixed(2)) ===
        inMulti.grandTotal &&
      inMulti.grandTotal === 338.5,
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

  // 1g. computeOrderBillableAmounts edge cases (0-safe packaging & cancelled items)
  const billableZeroPkg = computeOrderBillableAmounts(
    [
      { price: 200, quantity: 2, comp_qty: 2, is_comp: true, pack_qty: 2, packaging_charge: 0 },
      { price: 100, quantity: 1, comp_qty: 0, is_comp: false, pack_qty: 1, status: 'CANCELLED' },
    ],
    { packagingFeeRate: 10, explicitPackagingCharge: 0, explicitPackagingQty: 2 }
  );
  check(
    'computeOrderBillableAmounts excludes CANCELLED items and preserves explicit packaging_charge = 0',
    billableZeroPkg.itemsMenuTotal === 0 &&
      billableZeroPkg.packagingQty === 2 &&
      billableZeroPkg.packagingTotal === 0 &&
      billableZeroPkg.compPackagingQty === 2 &&
      billableZeroPkg.isAllComp === true,
    billableZeroPkg
  );

  const billablePartialPkg = computeOrderBillableAmounts(
    [{ price: 200, quantity: 2, comp_qty: 1, is_comp: false, pack_qty: 2 }],
    { packagingFeeRate: 10 }
  );
  check(
    'computeOrderBillableAmounts auto-comps packaging matching comp_qty (1 of 2 packs free, 1 billed)',
    billablePartialPkg.itemsMenuTotal === 200 &&
      billablePartialPkg.packagingQty === 2 &&
      billablePartialPkg.compPackagingQty === 1 &&
      billablePartialPkg.packagingTotal === 10 &&
      billablePartialPkg.compPackagingValue === 10,
    billablePartialPkg
  );

  const billableOverridePkg = computeOrderBillableAmounts(
    [{ price: 200, quantity: 2, comp_qty: 1, is_comp: false, pack_qty: 2 }],
    { packagingFeeRate: 10, isPackagingComp: true }
  );
  check(
    'computeOrderBillableAmounts waives 100% packaging when isPackagingComp = true while keeping packagingQty = 2',
    billableOverridePkg.itemsMenuTotal === 200 &&
      billableOverridePkg.packagingQty === 2 &&
      billableOverridePkg.compPackagingQty === 2 &&
      billableOverridePkg.packagingTotal === 0,
    billableOverridePkg
  );

  const billableForcedBilled = computeOrderBillableAmounts(
    [{ price: 200, quantity: 2, comp_qty: 1, is_comp: false, pack_qty: 2 }],
    { packagingFeeRate: 10, explicitPackagingCharge: 20 }
  );
  check(
    'computeOrderBillableAmounts zeroes compPackagingQty when explicitPackagingCharge equals grossPackagingTotal',
    billableForcedBilled.packagingQty === 2 &&
      billableForcedBilled.compPackagingQty === 0 &&
      billableForcedBilled.packagingTotal === 20 &&
      billableForcedBilled.compPackagingValue === 0,
    billableForcedBilled
  );

  const billableZeroRate = computeOrderBillableAmounts(
    [{ price: 200, quantity: 1, comp_qty: 0, is_comp: false, pack_qty: 1 }],
    { packagingFeeRate: 0 }
  );
  check(
    'computeOrderBillableAmounts honors packagingFeeRate = 0 without 0 || 10 coercion',
    billableZeroRate.packagingQty === 1 &&
      billableZeroRate.packagingTotal === 0 &&
      billableZeroRate.grossPackagingTotal === 0,
    billableZeroRate
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
    'Workbook preserves all required sheets and accurate column structures',
    sheets.some(s => s.sheetName === 'Sales Register' && s.headers.length >= 26) &&
      sheets.some(s => s.sheetName === 'Item Sales Register' && s.headers.length >= 18) &&
      sheets.some(s => s.sheetName === 'GL Links & Mapping' && s.headers.length === 14) &&
      sheets.some(s => s.sheetName === 'GL Journal Summary' && s.headers.length === 6) &&
      sheets.some(s => s.sheetName === 'Credit Sales Register' && s.headers.length === 22),
    sheets.map((s) => ({ name: s.sheetName, cols: s.headers.length }))
  );

  const journalSummaryRow = sheets[3].rows[sheets[3].rows.length - 1];
  check(
    'GL Journal Summary is strictly balanced (Debits === Credits) even when Service Charge + Inclusive/Exclusive VAT + Discounts are active',
    journalSummaryRow[0] === 'TOTAL' &&
      journalSummaryRow[3] === journalSummaryRow[4] &&
      journalSummaryRow[5] === 'Balanced (Debits = Credits)',
    journalSummaryRow
  );

  const bevRow = sheets[3].rows.find((r) => r[0] === '4020');
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
        tax_amount: 46.8,
        taxes: [{ id: 'vat', name: 'VAT', rate_percent: 13, amount: 46.8, is_inclusive: false }],
        promo_code: 'WELCOME10',
        promo_discount: 40,
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
      'Switching to Inclusive mode recalculates unsettled order: Subtotal=353.98, WELCOME10 Promo=35.40, VAT=41.42, Total=360.00',
      Number(od1?.subtotal) === 353.98 &&
        Number(od1?.tax_amount) === 41.42 &&
        Number(od1?.promo_discount) === 35.4 &&
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
      'Switching back to Exclusive mode recalculates unsettled order: Subtotal=400, WELCOME10 Promo=40.00, VAT=46.80, Total=406.80',
      Number(od2?.subtotal) === 400 &&
        Number(od2?.tax_amount) === 46.8 &&
        Number(od2?.promo_discount) === 40 &&
        Number(od2?.total_amount) === 406.8,
      od2
    );

    // Verify updateTaxConfig preserves comp_qty and complimentary 0 packaging_charge on unsettled partial-comp order
    const compOrderId = `ORD-COMP-PKG-${Date.now()}`;
    await prisma.tableOrder.create({
      data: {
        id: compOrderId,
        order_number: 'ORD-02',
        business_id: BIZ,
        table_id: null,
        table_number: 'Table 2',
        items: [
          {
            item_id: 'd2',
            name: 'Veg Momo',
            price: 200,
            quantity: 2,
            comp_qty: 1,
            is_comp: false,
            pack_qty: 2,
            comp_pack_qty: 2,
            is_packaging_comp: true,
            packaging_charge: 0,
            status: 'SERVED',
          },
        ],
        subtotal: 200,
        tax_amount: 26,
        total_amount: 226,
        packaging_qty: 2,
        packaging_charge: 0,
        status: 'SERVED',
        payment_status: 'UNPAID',
      },
    });
    await rbacService.updateTaxConfig(BIZ, {
      tax_enabled: true,
      tax_inclusive: false,
      packaging_fee: 15,
      rates: [{ id: 'vat', name: 'VAT', rate_percent: 13, enabled: true, is_inclusive: false }],
    });
    const odComp = await prisma.tableOrder.findUnique({ where: { id: compOrderId } });
    check(
      'updateTaxConfig preserves comp_qty and 0 complimentary packaging_charge on unsettled order',
      Number(odComp?.subtotal) === 200 &&
        Number(odComp?.packaging_charge) === 0 &&
        Number(odComp?.packaging_qty) === 2 &&
        Number(odComp?.total_amount) === 226,
      odComp
    );
    await prisma.tableOrder.deleteMany({ where: { id: compOrderId } }).catch(() => {});
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
