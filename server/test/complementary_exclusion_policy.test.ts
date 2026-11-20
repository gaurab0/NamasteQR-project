import { prisma } from '../src/lib/prisma';
import { rbacService } from '../src/services/rbac.service';
import { db } from '../src/services/db.service';
import { EscPosEncoder } from '../../src/utils/escpos';
import { computeOrderBillableAmounts, isSaleAllComp } from '../../src/utils/taxCalculations';
import { buildCashierSalesSheet } from '../../src/utils/cashierSalesSheet';
import type { SaleRecord } from '../../src/types/rbac';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string, extra?: any) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`, extra ?? '');
    failed++;
  }
}

async function runTestSuite() {
  console.log('🧪 Starting Complementary Inclusion/Exclusion Policy Test Suite...\n');

  // =========================================================================
  // 1. isSaleAllComp utility verification
  // =========================================================================
  console.log('🔍 1. isSaleAllComp Detection Logic');
  const compPaymentSale: Partial<SaleRecord> = {
    total_amount: 0,
    payment_method: 'COMPLIMENTARY',
    items: [{ name: 'MoMo', quantity: 1, price: 200, comp_qty: 1, is_comp: true } as any]
  };
  assert(isSaleAllComp(compPaymentSale), 'Identifies sale as comp when payment_method is COMPLIMENTARY');

  const allItemsCompSale: Partial<SaleRecord> = {
    total_amount: 0,
    payment_method: 'CASH',
    items: [
      { name: 'MoMo', quantity: 2, price: 200, comp_qty: 2, is_comp: false } as any,
      { name: 'Coke', quantity: 1, price: 100, comp_qty: 1, is_comp: true } as any
    ]
  };
  assert(isSaleAllComp(allItemsCompSale), 'Identifies sale as comp when 100% of line items are comped');

  const partialCompSale: Partial<SaleRecord> = {
    total_amount: 200,
    payment_method: 'CASH',
    items: [
      { name: 'MoMo', quantity: 2, price: 200, comp_qty: 1, is_comp: false } as any
    ]
  };
  assert(!isSaleAllComp(partialCompSale), 'Does not treat partial comp sale as 100% comp sale');

  const paidSale: Partial<SaleRecord> = {
    total_amount: 500,
    payment_method: 'CASH',
    items: [{ name: 'Pizza', quantity: 1, price: 500, comp_qty: 0, is_comp: false } as any]
  };
  assert(!isSaleAllComp(paidSale), 'Does not treat normal paid sale as comp sale');

  // =========================================================================
  // 2. ESC/POS Bill Printing Exclusion Policy
  // =========================================================================
  console.log('\n🖨️ 2. ESC/POS Bill Printing: exclude_comp_from_bills');
  const testSale = {
    business_name: 'Himalayan Bistro',
    items: [
      { name: 'Veg MoMo', quantity: 2, price: 200, comp_qty: 0, is_comp: false },
      { name: 'Complimentary Tea', quantity: 1, price: 50, comp_qty: 1, is_comp: true },
      { name: 'Cold Drink', quantity: 3, price: 100, comp_qty: 1, is_comp: false } // 2 paid, 1 comp
    ],
    subtotal: 400,
    total_amount: 400,
  };

  // A. With exclude_comp_from_bills = false (Default/Included)
  const defaultBuf = EscPosEncoder.buildReceipt(testSale, {
    paperWidth: '80mm',
    role: 'BILL',
    opsConfig: { exclude_comp_from_bills: false }
  });
  const defaultText = Buffer.from(defaultBuf).toString('utf-8');
  assert(defaultText.includes('Complimentary Tea'), 'Default receipt includes 100% comp items');
  assert(defaultText.includes('[COMPLIMENTARY]'), 'Default receipt tags 100% comp item with [COMPLIMENTARY]');
  assert(defaultText.includes('[1x COMP]'), 'Default receipt shows partial comp badge [1x COMP]');

  // B. With exclude_comp_from_bills = true (Excluded)
  const excludedBuf = EscPosEncoder.buildReceipt(testSale, {
    paperWidth: '80mm',
    role: 'BILL',
    opsConfig: { exclude_comp_from_bills: true }
  });
  const excludedText = Buffer.from(excludedBuf).toString('utf-8');
  assert(!excludedText.includes('Complimentary Tea'), 'Excluded receipt completely omits 100% comp items');
  assert(!excludedText.includes('[COMPLIMENTARY]'), 'Excluded receipt does NOT show [COMPLIMENTARY] tag');
  assert(!excludedText.includes('[1x COMP]'), 'Excluded receipt does NOT show comp tag on partially comped items');
  assert(excludedText.includes('Cold Drink'), 'Excluded receipt retains partially comped item under paid quantity');

  // C. All items comped with exclude_comp_from_bills = true -> Courtesy Slip
  const allCompSale = {
    business_name: 'Himalayan Bistro',
    items: [
      { name: 'Guest Welcome Drink', quantity: 2, price: 150, comp_qty: 2, is_comp: true }
    ],
    subtotal: 0,
    total_amount: 0,
  };
  const courtesyBuf = EscPosEncoder.buildReceipt(allCompSale, {
    paperWidth: '80mm',
    role: 'BILL',
    opsConfig: { exclude_comp_from_bills: true }
  });
  const courtesyText = Buffer.from(courtesyBuf).toString('utf-8');
  assert(courtesyText.toUpperCase().includes('COURTESY SLIP'), 'Generates Courtesy Slip when all items are comped');
  assert(courtesyText.toUpperCase().includes('COURTESY OF MANAGEMENT'), 'Courtesy slip contains management courtesy notice');

  // =========================================================================
  // 3. Cashier Sales Sheet Exclusion Policy
  // =========================================================================
  console.log('\n📊 3. Cashier Sales Sheet: exclude_comp_from_sales_register');
  const dummySales: SaleRecord[] = [
    {
      id: 'sale-01',
      invoice_number: 'INV-001',
      date_string: '2026-11-20',
      created_at: new Date('2026-11-20T12:00:00Z'),
      total_amount: 500,
      subtotal: 500,
      payment_method: 'CASH',
      payment_status: 'PAID',
      items: [{ name: 'Pizza', quantity: 1, price: 500, comp_qty: 0, is_comp: false }]
    } as any,
    {
      id: 'sale-02',
      invoice_number: 'INV-002',
      date_string: '2026-11-20',
      created_at: new Date('2026-11-20T12:30:00Z'),
      total_amount: 0,
      subtotal: 0,
      payment_method: 'COMPLIMENTARY',
      payment_status: 'PAID',
      items: [{ name: 'Dessert', quantity: 1, price: 150, comp_qty: 1, is_comp: true }]
    } as any
  ];

  // A. With exclude_comp_from_sales_register = false
  const sheetDefault = buildCashierSalesSheet(dummySales, [], {
    dateMode: 'ALL',
    opsConfig: { exclude_comp_from_sales_register: false } as any
  });
  assert(sheetDefault.rows.length === 2, 'Default sheet includes all 2 sales (paid + comp)');
  assert(sheetDefault.rows.some(r => r.saleId === 'sale-02'), 'Comp sale row is present when toggle is false');

  // B. With exclude_comp_from_sales_register = true
  const sheetExcluded = buildCashierSalesSheet(dummySales, [], {
    dateMode: 'ALL',
    opsConfig: { exclude_comp_from_sales_register: true } as any
  });
  assert(sheetExcluded.rows.length === 1, 'Excluded sheet filters out 100% comp sale, leaving 1 row');
  assert(sheetExcluded.rows[0].saleId === 'sale-01', 'Retained row is the paid sale (sale-01)');

  // =========================================================================
  // 4. Persistence of operations_config with toggles
  // =========================================================================
  console.log('\n💾 4. Business operations_config Persistence');
  const testBizId = `test-biz-comp-policy-${Date.now()}`;
  await db.ensureBusiness(testBizId, 'Policy Verification Cafe');

  const bizBefore = await prisma.business.findUnique({ where: { id: testBizId } });
  const opsBefore = ((bizBefore as any)?.operations_config || {}) as any;
  assert(opsBefore.exclude_comp_from_bills === undefined || opsBefore.exclude_comp_from_bills === false, 'Default exclude_comp_from_bills is false/undefined');

  const updatedOps = {
    ...opsBefore,
    exclude_comp_from_bills: true,
    exclude_comp_from_sales_register: true
  };
  await prisma.business.update({
    where: { id: testBizId },
    data: { operations_config: updatedOps }
  });

  const bizAfter = await prisma.business.findUnique({ where: { id: testBizId } });
  const opsAfter = ((bizAfter as any)?.operations_config || {}) as any;
  assert(opsAfter.exclude_comp_from_bills === true, 'exclude_comp_from_bills persists as true in database');
  assert(opsAfter.exclude_comp_from_sales_register === true, 'exclude_comp_from_sales_register persists as true in database');

  // Cleanup
  await prisma.business.delete({ where: { id: testBizId } });

  console.log('\n====================================================');
  console.log(`Summary: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
