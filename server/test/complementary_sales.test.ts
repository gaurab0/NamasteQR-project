import { prisma } from '../src/lib/prisma';
import { rbacService } from '../src/services/rbac.service';
import { db } from '../src/services/db.service';
import { buildSalesWorkbookData, exportSalesToExcel } from '../../src/utils/excelExport';
import { EscPosEncoder } from '../../src/utils/escpos';

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

async function runComplementarySalesTestSuite() {
  console.log('🧪 Starting Complementary Sales End-to-End Workflow Test Suite...\n');

  const testBizId = `test-comp-sales-${Date.now()}`;
  const staffUser = { id: 'staff-comp-01', name: 'Alina Shrestha', email: 'alina@restaurant.com', role: 'OWNER' };

  try {
    await db.ensureBusiness(testBizId, 'The Himalayan Grill');

    // =========================================================================
    // 1. Table Creation & Comp Mode Persistence
    // =========================================================================
    console.log('🍽️ 1. Table Creation with Complementary Mode (comp_enabled)');
    const table1 = await rbacService.createTable(testBizId, {
      table_number: 'T-10',
      capacity: 4,
      comp_enabled: true,
    }, staffUser);

    assert(table1.comp_enabled === true, 'Table created with comp_enabled = true');

    const fetchedTables = await rbacService.getTables(testBizId);
    const fetchedT10 = fetchedTables.find(t => t.id === table1.id);
    assert(Boolean(fetchedT10?.comp_enabled) === true, 'getTables() preserves comp_enabled = true');

    // =========================================================================
    // 2. Toggle Comp Mode OFF and ON
    // =========================================================================
    console.log('\n🔄 2. Toggle Comp Mode OFF & ON via updateTable()');
    await rbacService.updateTable(testBizId, table1.id, { comp_enabled: false }, staffUser);
    const tablesAfterOff = await rbacService.getTables(testBizId);
    const t10Off = tablesAfterOff.find(t => t.id === table1.id);
    assert(Boolean(t10Off?.comp_enabled) === false, 'updateTable({ comp_enabled: false }) turns comp mode off');

    await rbacService.updateTable(testBizId, table1.id, { comp_enabled: true }, staffUser);
    const tablesAfterOn = await rbacService.getTables(testBizId);
    const t10On = tablesAfterOn.find(t => t.id === table1.id);
    assert(Boolean(t10On?.comp_enabled) === true, 'updateTable({ comp_enabled: true }) turns comp mode back on');

    // =========================================================================
    // 3. Normal Sale (No Comp Items) -> No CompRecord Created
    // =========================================================================
    console.log('\n💵 3. Normal Sale Settlement (No Comp Items)');
    const normalSale = await rbacService.createSale(testBizId, {
      table_id: table1.id,
      table_number: 'T-10',
      customer_name: 'Regular Guest',
      sale_type: 'DINE_IN',
      payment_method: 'CASH',
      items: [
        { item_id: 'dish-1', name: 'Steamed Chicken Momo', price: 200, unit_price: 200, quantity: 2, subtotal: 400, total_price: 400, comp_qty: 0, is_comp: false } as any
      ],
      subtotal: 400,
      total_amount: 400,
    }, staffUser);

    assert(Boolean(normalSale.id), 'Normal sale created successfully');
    const compRecordsAfterNormal = await rbacService.getCompRecords(testBizId);
    assert(compRecordsAfterNormal.length === 0, 'No CompRecord created for normal sale with comp_qty = 0');

    // =========================================================================
    // 4. Partial Quantity Comp Sale
    // =========================================================================
    console.log('\n🎁 4. Partial Comp Sale Settlement (e.g. 1 of 2 Momos Comped)');
    const partialSale = await rbacService.createSale(testBizId, {
      table_id: table1.id,
      table_number: 'Table 10',
      customer_name: 'VIP Guest',
      sale_type: 'DINE_IN',
      payment_method: 'CASH',
      comp_reason: 'Quality Courtesy — Momo Delay',
      items: [
        {
          item_id: 'dish-1',
          name: 'Steamed Chicken Momo',
          category: 'Momo & Dumplings',
          price: 200,
          unit_price: 200,
          quantity: 2,
          comp_qty: 1,
          is_comp: false,
          comp_value: 200,
          subtotal: 200,
          total_price: 200
        } as any,
        {
          item_id: 'dish-2',
          name: 'Masala Milk Tea',
          category: 'Beverages',
          price: 60,
          unit_price: 60,
          quantity: 1,
          comp_qty: 0,
          is_comp: false,
          comp_value: 0,
          subtotal: 60,
          total_price: 60
        } as any
      ],
      subtotal: 260,
      total_amount: 260,
    }, staffUser);

    assert(Boolean(partialSale.id), 'Partial comp sale created');
    assert(partialSale.total_amount === 260, 'Sale total_amount reflects only non-comped units (Rs. 260 instead of 460)');

    const compRecordsAfterPartial = await rbacService.getCompRecords(testBizId);
    assert(compRecordsAfterPartial.length === 1, 'Exactly 1 CompRecord created');
    const rec1 = compRecordsAfterPartial[0];
    assert(rec1.staff_name === 'Alina Shrestha', `Staff name correctly recorded: "${rec1.staff_name}"`);
    assert(rec1.table_number === 'Table 10', `Table number correctly recorded: "${rec1.table_number}"`);
    assert(rec1.reason === 'Quality Courtesy — Momo Delay', `Comp reason recorded: "${rec1.reason}"`);
    assert(Number(rec1.total_comp_value) === 200, `Total comp value is Rs. 200 (was ${rec1.total_comp_value})`);

    const recItems = rec1.items as any[];
    assert(recItems.length === 1, 'CompRecord items array only contains the comped item');
    assert(recItems[0].name === 'Steamed Chicken Momo', 'Comped item name matches');
    assert(recItems[0].comp_qty === 1, 'Comp qty is 1');
    assert(recItems[0].unit_price === 200, 'Original unit price is 200');
    assert(recItems[0].comp_value === 200, 'Comp value is 200');

    // =========================================================================
    // 5. 100% Complimentary Sale (All Items Comped -> Price = 0)
    // =========================================================================
    console.log('\n👑 5. 100% Complimentary Sale (Grand Total = Rs. 0)');
    const allCompSale = await rbacService.createSale(testBizId, {
      table_id: table1.id,
      table_number: 'Table 10',
      customer_name: 'Owner Guest Table',
      sale_type: 'DINE_IN',
      payment_method: 'CASH',
      comp_reason: 'Executive Director Treat',
      items: [
        {
          item_id: 'dish-3',
          name: 'Himalayan Thali Deluxe',
          category: 'Mains',
          price: 500,
          unit_price: 500,
          quantity: 2,
          comp_qty: 2,
          is_comp: true,
          comp_value: 1000,
          subtotal: 0,
          total_price: 0
        } as any
      ],
      subtotal: 0,
      total_amount: 0,
    }, staffUser);

    assert(allCompSale.total_amount === 0, 'All-comp sale has grand total = Rs. 0');
    const compRecordsAfterAll = await rbacService.getCompRecords(testBizId);
    assert(compRecordsAfterAll.length === 2, 'Comp records count is now 2');

    const rec2 = compRecordsAfterAll.find(r => r.sale_id === allCompSale.id);
    assert(Boolean(rec2), 'CompRecord found for 100% comp sale');
    assert(Number(rec2?.total_comp_value) === 1000, 'All-comp record has total_comp_value = Rs. 1000');
    assert(rec2?.staff_name === 'Alina Shrestha', 'Staff name correctly recorded for all-comp sale');
    assert(rec2?.reason === 'Executive Director Treat', 'Reason correctly recorded');

    // =========================================================================
    // 6. Multi-Tab Excel Workbook Export Verification
    // =========================================================================
    console.log('\n📊 6. Excel Workbook Export Verification');
    const allSales = [normalSale, partialSale, allCompSale];
    const sheets = buildSalesWorkbookData(allSales, [], 'Rs.', compRecordsAfterAll);

    // A. Main Sales Register Sheet
    const salesRegSheet = sheets.find(s => s.sheetName === 'Sales Register');
    assert(Boolean(salesRegSheet), 'Sheet "Sales Register" exists in export');
    
    // Check that all-comp sale is NOT in main Sales Register rows
    const allCompInMain = salesRegSheet?.rows.some(r => r[1] === allCompSale.invoice_number);
    assert(!allCompInMain, 'Requirement: 100% complimentary sale is EXCLUDED from main Sales Register');

    const normalInMain = salesRegSheet?.rows.some(r => r[1] === normalSale.invoice_number);
    assert(Boolean(normalInMain), 'Normal sale is PRESENT in main Sales Register');

    const partialInMain = salesRegSheet?.rows.some(r => r[1] === partialSale.invoice_number);
    assert(Boolean(partialInMain), 'Partial sale is PRESENT in main Sales Register');

    // For the partial sale, verify items summary reflects only billed count (1 Momo, not 2)
    const partialRow = salesRegSheet?.rows.find(r => r[1] === partialSale.invoice_number);
    const partialItemsSummary = String(partialRow?.[10] || '');
    assert(partialItemsSummary.includes('x1'), `Partial sale items summary shows non-comped quantity: "${partialItemsSummary}"`);

    // B. Item Sales Register Sheet
    const itemRegSheet = sheets.find(s => s.sheetName === 'Item Sales Register');
    assert(Boolean(itemRegSheet), 'Sheet "Item Sales Register" exists in export');
    
    // 100% comp dish ("Himalayan Thali Deluxe") must NOT be in Item Sales Register
    const thaliInItemReg = itemRegSheet?.rows.some(r => String(r[5]).includes('Himalayan Thali Deluxe'));
    assert(!thaliInItemReg, 'Requirement: Fully comped items are NOT in main Item Sales Register');

    // Partial comp Momo should be in Item Sales Register with billed quantity = 1, total = 200
    const momoRow = itemRegSheet?.rows.find(r => String(r[5]).includes('Steamed Chicken Momo') && r[1] === partialSale.invoice_number);
    assert(Boolean(momoRow), 'Partially comped item is in Item Sales Register');
    assert(momoRow?.[9] === 1, `Partially comped item shows billed quantity 1 (was ${momoRow?.[9]})`);
    assert(Number(momoRow?.[11]) === 200, `Partially comped item shows billed total 200 (was ${momoRow?.[11]})`);

    // C. Complementary Ledger Sheet
    const compSheet = sheets.find(s => s.sheetName === 'Complementary Ledger');
    assert(Boolean(compSheet), 'Requirement: Sheet "Complementary Ledger" exists in workbook export');
    assert((compSheet?.rows.length || 0) >= 2, `Complementary Ledger contains rows (found ${compSheet?.rows.length})`);

    // Check Momo comp row
    const compMomoRow = compSheet?.rows.find(r => String(r[4]).includes('Steamed Chicken Momo'));
    assert(Boolean(compMomoRow), 'Complementary Ledger contains comped Momo');
    assert(compMomoRow?.[2] === 'Table 10', 'Complementary Ledger row shows correct table');
    assert(compMomoRow?.[3] === 'Alina Shrestha', 'Complementary Ledger row shows correct settling staff name');
    assert(compMomoRow?.[6] === 1, 'Complementary Ledger row shows comp_qty = 1');
    assert(compMomoRow?.[7] === '200.00', 'Complementary Ledger row shows unit price Rs. 200.00');
    assert(compMomoRow?.[8] === '200.00', 'Complementary Ledger row shows comp value Rs. 200.00');
    assert(compMomoRow?.[9] === 'Quality Courtesy — Momo Delay', 'Complementary Ledger row shows reason');

    // Check Thali comp row
    const compThaliRow = compSheet?.rows.find(r => String(r[4]).includes('Himalayan Thali Deluxe'));
    assert(Boolean(compThaliRow), 'Complementary Ledger contains 100% comp Thali');
    assert(compThaliRow?.[6] === 2, 'Thali comp_qty is 2');
    assert(compThaliRow?.[8] === '1000.00', 'Thali comp value is Rs. 1000.00');
    assert(compThaliRow?.[9] === 'Executive Director Treat', 'Thali reason matches');

    // =========================================================================
    // 7. Date Filtering on Comp Records
    // =========================================================================
    console.log('\n📅 7. Date Filtering on Comp Records');
    const todayStr = new Date().toISOString().split('T')[0];
    const filteredToday = await rbacService.getCompRecords(testBizId, { start_date: todayStr, end_date: todayStr });
    assert(filteredToday.length === 2, `Filtering for today (${todayStr}) returns all 2 records`);

    const filteredPast = await rbacService.getCompRecords(testBizId, { start_date: '2020-01-01', end_date: '2020-01-02' });
    assert(filteredPast.length === 0, 'Filtering for non-existent date range returns 0 records');

    // =========================================================================
    // 8. Security Enforcement: Disallowed Comp on Non-Comp Table
    // =========================================================================
    console.log('\n🛡️ 8. Security Enforcement (Reject Comp on Non-Comp Table)');
    const table2 = await rbacService.createTable(testBizId, {
      table_number: 'T-99',
      capacity: 2,
      comp_enabled: false,
    }, staffUser);

    let securityRejected = false;
    try {
      await rbacService.createSale(testBizId, {
        table_id: table2.id,
        table_number: 'T-99',
        customer_name: 'Sneaky Client',
        sale_type: 'DINE_IN',
        payment_method: 'CASH',
        items: [
          { item_id: 'dish-1', name: 'Momo', price: 200, unit_price: 200, quantity: 1, comp_qty: 1, is_comp: true } as any
        ],
        subtotal: 0,
        total_amount: 0,
      }, staffUser);
    } catch (e: any) {
      if (e.message && e.message.includes('Complementary sales mode is disabled on this table')) {
        securityRejected = true;
      }
    }
    assert(securityRejected, 'Backend rejects comp sale on table where comp_enabled is false');

    let noTableRejected = false;
    try {
      await rbacService.createSale(testBizId, {
        customer_name: 'Takeaway Comp Attempt',
        sale_type: 'TAKEAWAY',
        payment_method: 'CASH',
        items: [
          { item_id: 'dish-1', name: 'Momo', price: 200, unit_price: 200, quantity: 1, comp_qty: 1, is_comp: true } as any
        ],
        subtotal: 0,
        total_amount: 0,
      }, staffUser);
    } catch (e: any) {
      if (e.message && e.message.includes('requires a valid table')) {
        noTableRejected = true;
      }
    }
    assert(noTableRejected, 'Backend rejects comp sale without a valid table');

    // =========================================================================
    // 9. Boundary Clamping: comp_qty > quantity
    // =========================================================================
    console.log('\n📏 9. Boundary Clamping (comp_qty > quantity clamped to quantity)');
    const overCompSale = await rbacService.createSale(testBizId, {
      table_id: table1.id,
      table_number: 'Table 10',
      customer_name: 'Boundary Test Guest',
      sale_type: 'DINE_IN',
      payment_method: 'CASH',
      items: [
        {
          item_id: 'dish-1',
          name: 'Steamed Chicken Momo',
          price: 200,
          unit_price: 200,
          quantity: 2,
          comp_qty: 99, // exceeds quantity 2
          is_comp: true,
          comp_value: 400,
          subtotal: 0,
          total_price: 0,
        } as any
      ],
      subtotal: 0,
      total_amount: 0,
    }, staffUser);

    const compRecordsAfterOver = await rbacService.getCompRecords(testBizId);
    const overRec = compRecordsAfterOver.find(r => r.sale_id === overCompSale.id);
    const overItem = (overRec?.items as any[])?.[0];
    assert(overItem?.comp_qty === 2, `comp_qty clamped to quantity (expected 2, got ${overItem?.comp_qty})`);
    assert(Number(overItem?.comp_value) === 400, `comp_value clamped to 400 (got ${overItem?.comp_value})`);

    // =========================================================================
    // 10. Thermal Receipt Hardware Output (ESC/POS Binary Buffer Verification)
    // =========================================================================
    console.log('\n🖨️ 10. ESC/POS Thermal Receipt Builder Verification');
    const escposPartialBuf = EscPosEncoder.buildReceipt(partialSale, { paperWidth: '80mm' });
    const escposPartialStr = Buffer.from(escposPartialBuf).toString('utf-8');
    assert(escposPartialStr.includes('[1x COMP]'), 'ESC/POS thermal binary includes [1x COMP] badge');
    assert(escposPartialStr.includes('Comp Reason: Quality Courtesy — Momo Delay'), 'ESC/POS thermal binary includes Comp Reason line');

    const escposAllCompBuf = EscPosEncoder.buildReceipt(allCompSale, { paperWidth: '80mm' });
    const escposAllCompStr = Buffer.from(escposAllCompBuf).toString('utf-8');
    assert(escposAllCompStr.includes('[COMPLIMENTARY]'), 'ESC/POS thermal binary includes [COMPLIMENTARY] badge');
    assert(escposAllCompStr.includes('0.00'), 'ESC/POS thermal binary line total displays 0.00 for complimentary items');

    // =========================================================================
    // 11. Accounting & GL Balance with Comped Beverages vs Food
    // =========================================================================
    console.log('\n⚖️ 11. GL Balance & Category Ratio Accuracy with Comped Items');
    const compedBevSale: any = {
      id: 'sale-bev-comp-test',
      invoice_number: 'INV-TEST-BEV',
      date_string: todayStr,
      created_at: new Date().toISOString(),
      sale_type: 'DINE_IN',
      payment_method: 'CASH',
      items: [
        { name: 'Momo', category: 'Food', price: 200, unit_price: 200, quantity: 1, comp_qty: 0, is_comp: false, subtotal: 200, total_price: 200 },
        { name: 'Cold Coffee', category: 'Beverages', price: 150, unit_price: 150, quantity: 1, comp_qty: 1, is_comp: true, subtotal: 0, total_price: 0 },
      ],
      subtotal: 200,
      total_amount: 200,
    };
    const glAccounts = [
      { id: 'gl-food', account_number: '4010', account_name: 'Food Sales', mapping_key: 'FOOD_SALES', category: 'REVENUE' },
      { id: 'gl-bev', account_number: '4020', account_name: 'Beverage Sales', mapping_key: 'BEVERAGE_SALES', category: 'REVENUE' },
    ];
    const glSheets = buildSalesWorkbookData([compedBevSale], glAccounts, 'Rs.');
    const glMappingSheet = glSheets.find(s => s.sheetName === 'GL Links & Mapping');
    const foodRow = glMappingSheet?.rows.find(r => r[1] === '4010');
    const bevRow = glMappingSheet?.rows.find(r => r[1] === '4020');
    assert(Number(foodRow?.[5]) === 200, `Food sales correctly attributed Rs. 200 (was ${foodRow?.[5]})`);
    assert(Number(bevRow?.[5]) === 0, `100% comped beverage sales attributed Rs. 0, not distorted (was ${bevRow?.[5]})`);

    // =========================================================================
    // 12. Sales Deletion Cascading to Comp Records
    // =========================================================================
    console.log('\n🗑️ 12. Sales Deletion Cascades to Comp Records');
    // Test deleteSale cleans up linked compRecord
    const singleSaleToDel = await rbacService.createSale(testBizId, {
      table_id: table1.id,
      table_number: 'Table 10',
      customer_name: 'Single Delete Test',
      sale_type: 'DINE_IN',
      payment_method: 'CASH',
      items: [
        { item_id: 'dish-1', name: 'Momo', price: 200, unit_price: 200, quantity: 1, comp_qty: 1, is_comp: true } as any
      ],
      subtotal: 0,
      total_amount: 0,
    }, staffUser);

    const compBeforeDel = await rbacService.getCompRecords(testBizId);
    const hasSingleRec = compBeforeDel.some(r => r.sale_id === singleSaleToDel.id);
    assert(hasSingleRec, 'CompRecord exists before deleteSale');

    await rbacService.deleteSale(testBizId, singleSaleToDel.id, staffUser);
    const compAfterDel = await rbacService.getCompRecords(testBizId);
    const hasSingleRecAfter = compAfterDel.some(r => r.sale_id === singleSaleToDel.id);
    assert(!hasSingleRecAfter, 'deleteSale cleans up linked CompRecord');

    // Test deleteAllSales cleans up all compRecords for the business
    await rbacService.deleteAllSales(testBizId, staffUser);
    const compAfterDeleteAll = await rbacService.getCompRecords(testBizId);
    assert(compAfterDeleteAll.length === 0, 'deleteAllSales cleans up all comp records for business');

    // =========================================================================
    // 13. Cleanup Throwaway Test Data
    // =========================================================================
    console.log('\n🧹 13. Cleanup Test Business');
    await prisma.compRecord.deleteMany({ where: { business_id: testBizId } });
    await prisma.sale.deleteMany({ where: { business_id: testBizId } });
    await prisma.restaurantTable.deleteMany({ where: { business_id: testBizId } });
    await prisma.business.deleteMany({ where: { id: testBizId } });
    console.log(`  Cleaned up throwaway business ${testBizId}`);

  } catch (err: any) {
    console.error('Unexpected test error:', err);
    failed++;
  }

  console.log('\n========================================');
  console.log(`🏁 Complementary Sales Test Results: ${passed} Passed, ${failed} Failed`);
  console.log('========================================\n');

  if (failed > 0) process.exit(1);
}

runComplementarySalesTestSuite().catch((e) => {
  console.error(e);
  process.exit(1);
});
