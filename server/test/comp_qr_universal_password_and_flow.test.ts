import { prisma } from '../src/lib/prisma';
import { rbacService } from '../src/services/rbac.service';
import { db } from '../src/services/db.service';
import { buildSalesWorkbookData } from '../../src/utils/excelExport';

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

async function runCompQrTestSuite() {
  console.log('🧪 Starting Universal Comp Password & QR Flow Test Suite...\n');

  const testBizId = `test-comp-flow-${Date.now()}`;
  const ownerUser = { id: 'owner-01', name: 'Sita Sharma', email: 'sita@restaurant.com', role: 'OWNER' };
  const waiterUser = { id: 'waiter-01', name: 'Hari Rai', email: 'hari@restaurant.com', role: 'WAITER' };

  try {
    await db.ensureBusiness(testBizId, 'The Royal Gourmet');

    // =========================================================================
    // 1. Universal Complementary Password Management
    // =========================================================================
    console.log('🔑 1. Universal Complementary Password Setup & Verification');

    // Initial state: no comp password set
    const initialPass = await rbacService.getBusinessCompPassword(testBizId, ownerUser);
    assert(initialPass.has_comp_password === false, 'Initially has_comp_password is false');
    assert(initialPass.comp_password === null, 'Initially comp_password is null');

    // Update comp password
    const updated = await rbacService.updateBusinessCompPassword(testBizId, 'COMP-9482', ownerUser);
    assert(updated.success === true, 'updateBusinessCompPassword succeeds');
    assert(updated.comp_password === 'COMP-9482', 'Returns updated plaintext password to owner');

    // Fetch comp password
    const fetched = await rbacService.getBusinessCompPassword(testBizId, ownerUser);
    assert(fetched.has_comp_password === true, 'has_comp_password is true after setup');
    assert(fetched.comp_password === 'COMP-9482', 'comp_password matches saved password');

    // Verification tests
    const verifyValid = await rbacService.verifyCompPassword(testBizId, 'COMP-9482');
    assert(verifyValid.valid === true, 'verifyCompPassword returns valid: true for correct password');

    const verifyInvalid = await rbacService.verifyCompPassword(testBizId, 'COMP-WRONG');
    assert(verifyInvalid.valid === false, 'verifyCompPassword returns valid: false for wrong password');

    const verifyEmpty = await rbacService.verifyCompPassword(testBizId, '');
    assert(verifyEmpty.valid === false, 'verifyCompPassword returns valid: false for empty password');

    // Unauthorized role check
    let unauthorizedBlocked = false;
    try {
      await rbacService.updateBusinessCompPassword(testBizId, 'COMP-HACK', waiterUser);
    } catch {
      unauthorizedBlocked = true;
    }
    assert(unauthorizedBlocked, 'WAITER role is blocked from updating comp password');

    // =========================================================================
    // 2. Table Creation & Update with Orderer Name & Phone
    // =========================================================================
    console.log('\n📱 2. Table Creation & Update with Orderer Name & Phone');

    const table = await rbacService.createTable(testBizId, {
      table_number: 'VIP-1',
      capacity: 6,
      comp_enabled: true,
      comp_orderer_name: 'Director Rajesh',
      comp_orderer_phone: '9841234567',
    }, ownerUser);

    assert(table.comp_enabled === true, 'Table created with comp_enabled = true');
    assert(table.comp_orderer_name === 'Director Rajesh', 'Table created with comp_orderer_name = Director Rajesh');
    assert(table.comp_orderer_phone === '9841234567', 'Table created with comp_orderer_phone = 9841234567');

    // Verify scanTableCheckIn returns comp orderer fields
    const checkIn = await rbacService.scanTableCheckIn(testBizId, table.id);
    assert(checkIn.table.comp_enabled === true, 'scanTableCheckIn reflects comp_enabled');
    assert(checkIn.table.comp_orderer_name === 'Director Rajesh', 'scanTableCheckIn reflects comp_orderer_name');
    assert(checkIn.table.comp_orderer_phone === '9841234567', 'scanTableCheckIn reflects comp_orderer_phone');

    // Update orderer details
    await rbacService.updateTable(testBizId, table.id, {
      comp_orderer_name: 'Manager Kedar',
      comp_orderer_phone: '9811223344',
    }, ownerUser);
    const tablesAfterUpdate = await rbacService.getTables(testBizId);
    const updatedTable = tablesAfterUpdate.find(t => t.id === table.id);
    assert(updatedTable?.comp_orderer_name === 'Manager Kedar', 'updateTable successfully updates comp_orderer_name');
    assert(updatedTable?.comp_orderer_phone === '9811223344', 'updateTable successfully updates comp_orderer_phone');

    // =========================================================================
    // 3. Table Order Creation: Mixed & 100% Comp Orders
    // =========================================================================
    console.log('\n🛒 3. Table Order Creation with Complimentary Items');

    // Mixed Order: 1 comp Burger (Rs. 350) + 1 non-comp Cold Coffee (Rs. 180)
    const mixedOrder = await rbacService.createTableOrder(testBizId, {
      table_id: table.id,
      host_token: checkIn.host_token || undefined,
      customer_name: 'Director Table',
      items: [
        {
          item_id: 'burger-1',
          name: 'Classic Burger',
          price: 350,
          quantity: 1,
          is_comp: true,
          comp_qty: 1,
          comp_value: 350,
        },
        {
          item_id: 'coffee-1',
          name: 'Cold Coffee',
          price: 180,
          quantity: 1,
          is_comp: false,
          comp_qty: 0,
          comp_value: 0,
        },
      ],
    });

    assert(Boolean(mixedOrder.id), 'Mixed table order created successfully');
    assert(mixedOrder.items[0].is_comp === true, 'Burger is marked is_comp: true');
    assert(mixedOrder.items[0].comp_value === 350, 'Burger comp_value is 350');
    assert(mixedOrder.items[1].is_comp === false, 'Cold Coffee is marked is_comp: false');
    assert(mixedOrder.subtotal === 180, `Order subtotal reflects ONLY non-comped item: Rs. 180 (got ${mixedOrder.subtotal})`);
    assert(mixedOrder.total_amount === 203.4, `Order total_amount reflects 180 + 13% VAT = Rs. 203.4 (got ${mixedOrder.total_amount})`);

    // Create table 2 for standalone 100% comp order
    const table2 = await rbacService.createTable(testBizId, {
      table_number: 'VIP-2',
      capacity: 4,
      comp_enabled: true,
      comp_orderer_name: 'Chairman Pradeep',
      comp_orderer_phone: '9851000000',
    }, ownerUser);

    // 100% Comp Order: 2 Pizzas (Rs. 600 each) all comped
    const allCompOrder = await rbacService.createTableOrder(testBizId, {
      table_id: table2.id,
      customer_name: 'VIP Treat',
      items: [
        {
          item_id: 'pizza-1',
          name: 'Woodfired Margherita',
          price: 600,
          quantity: 2,
          is_comp: true,
          comp_qty: 2,
          comp_value: 1200,
        },
      ],
    });

    assert(Boolean(allCompOrder.id), '100% comp table order created successfully');
    assert(allCompOrder.subtotal === 0, `100% comp order has subtotal = 0 (got ${allCompOrder.subtotal})`);
    assert(allCompOrder.total_amount === 0, `100% comp order has total_amount = 0 (got ${allCompOrder.total_amount})`);
    assert(allCompOrder.status === 'RECEIVED', `100% comp order status is RECEIVED (fires directly to KOT/BOT, got ${allCompOrder.status})`);

    // =========================================================================
    // 4. Sale Settlement & CompRecord Orderer Details
    // =========================================================================
    console.log('\n🧾 4. Sale Settlement: Populating Orderer Name & Phone on CompRecord');

    const settledSale = await rbacService.createSale(testBizId, {
      table_id: table.id,
      table_number: 'VIP-1',
      customer_name: 'VIP Guest',
      sale_type: 'DINE_IN',
      payment_method: 'CASH',
      items: [
        {
          item_id: 'burger-1',
          name: 'Classic Burger',
          price: 350,
          unit_price: 350,
          quantity: 1,
          comp_qty: 1,
          is_comp: true,
          comp_value: 350,
          subtotal: 0,
          total_price: 0,
        } as any,
        {
          item_id: 'coffee-1',
          name: 'Cold Coffee',
          price: 180,
          unit_price: 180,
          quantity: 1,
          comp_qty: 0,
          is_comp: false,
          comp_value: 0,
          subtotal: 180,
          total_price: 180,
        } as any,
      ],
      subtotal: 180,
      total_amount: 180,
    }, ownerUser);

    assert(Boolean(settledSale.id), 'Sale created successfully');
    assert(settledSale.total_amount === 180, 'Sale total_amount is Rs. 180');

    const compRecords = await rbacService.getCompRecords(testBizId);
    assert(compRecords.length === 1, `1 CompRecord created (found ${compRecords.length})`);
    const compRec = compRecords[0];
    assert(compRec.orderer_name === 'Manager Kedar', `CompRecord has orderer_name "Manager Kedar" (got "${compRec.orderer_name}")`);
    assert(compRec.orderer_phone === '9811223344', `CompRecord has orderer_phone "9811223344" (got "${compRec.orderer_phone}")`);
    assert(Number(compRec.total_comp_value) === 350, `CompRecord total_comp_value is 350 (got ${compRec.total_comp_value})`);

    // =========================================================================
    // 5. Excel Export Verification (Item Sales Register & Complementary Ledger)
    // =========================================================================
    console.log('\n📊 5. Excel Export with Mixed Bill & Complementary Ledger');

    const workbookSheets = buildSalesWorkbookData([settledSale], [], 'NPR', compRecords);

    // Item Sales Register verification
    const itemSheet = workbookSheets.find(s => s.sheetName === 'Item Sales Register');
    assert(Boolean(itemSheet), 'Item Sales Register sheet exists');

    // Both items must be present in the same bill
    const compBurgerRow = itemSheet?.rows.find(r => String(r[5]).includes('Classic Burger'));
    const coffeeRow = itemSheet?.rows.find(r => String(r[5]).includes('Cold Coffee'));

    assert(Boolean(compBurgerRow), 'Main Item Sales Register holds the complementary item of the mixed bill');
    assert(String(compBurgerRow?.[5]).includes('(Complimentary)'), 'Comp item name reflects "(Complimentary)"');
    assert(compBurgerRow?.[9] === 1, 'Comp item quantity is 1');
    assert(Number(compBurgerRow?.[10]) === 350, 'Comp item unit price is 350.00');
    assert(Number(compBurgerRow?.[11]) === 0, 'Comp item total amount in Item Sales Register is 0.00');

    assert(Boolean(coffeeRow), 'Main Item Sales Register holds the non-complementary item of the mixed bill');
    assert(coffeeRow?.[9] === 1, 'Non-comp item quantity is 1');
    assert(Number(coffeeRow?.[11]) === 180, 'Non-comp item total amount is 180.00');

    // Complementary Ledger verification
    const compSheet = workbookSheets.find(s => s.sheetName === 'Complementary Ledger');
    assert(Boolean(compSheet), 'Complementary Ledger sheet exists');
    assert(compSheet?.headers.includes('Orderer Name'), 'Complementary Ledger headers include "Orderer Name"');
    assert(compSheet?.headers.includes('Orderer Phone'), 'Complementary Ledger headers include "Orderer Phone"');

    const ledgerBurgerRow = compSheet?.rows.find(r => String(r[4]).includes('Classic Burger'));
    assert(Boolean(ledgerBurgerRow), 'Complementary Ledger holds comped Classic Burger');
    assert(ledgerBurgerRow?.[11] === 'Manager Kedar', `Complementary Ledger row orderer name is "Manager Kedar" (got "${ledgerBurgerRow?.[11]}")`);
    assert(ledgerBurgerRow?.[12] === '9811223344', `Complementary Ledger row orderer phone is "9811223344" (got "${ledgerBurgerRow?.[12]}")`);
    assert(ledgerBurgerRow?.[6] === 1, 'Complementary Ledger row comp_qty is 1');
    assert(ledgerBurgerRow?.[8] === '350.00', 'Complementary Ledger row comp value is 350.00');

    // Cold Coffee (non-comp) must NOT be in Complementary Ledger
    const ledgerCoffeeRow = compSheet?.rows.find(r => String(r[4]).includes('Cold Coffee'));
    assert(!ledgerCoffeeRow, 'Non-complementary item (Cold Coffee) is NOT in Complementary Ledger');

    // =========================================================================
    // 6. Pay-First Venue Mixed Comp Order Bypass (Direct to KOT/BOT)
    // =========================================================================
    console.log('\n🚀 6. Pay-First Venue Mixed Comp Order Direct Kitchen Dispatch');

    const payFirstCompTable = await rbacService.createTable(testBizId, {
      table_number: 'PAYFIRST-COMP-1',
      pay_first_enabled: true,
      comp_enabled: true,
      comp_orderer_name: 'Director Sharma',
      comp_orderer_phone: '9800001111',
      status: 'ACTIVE',
    }, ownerUser);

    const mixedPayFirstOrder = await rbacService.createTableOrder(testBizId, {
      table_id: payFirstCompTable.id,
      customer_name: 'Director Sharma',
      items: [
        {
          item_id: 'momo-comp-1',
          name: 'Steamed Momo',
          price: 250,
          quantity: 1,
          is_comp: true,
          comp_qty: 1,
          comp_value: 250,
        },
        {
          item_id: 'tea-paid-1',
          name: 'Masala Tea',
          price: 50,
          quantity: 1,
          is_comp: false,
          comp_qty: 0,
          comp_value: 0,
        },
      ],
    });

    assert(Boolean(mixedPayFirstOrder.id), 'Mixed comp order on pay-first table created successfully');
    assert(mixedPayFirstOrder.pay_first === false, 'Mixed order on comp-enabled table has pay_first = false');
    assert(mixedPayFirstOrder.status === 'RECEIVED', `Mixed comp order fires directly to KOT/BOT with status RECEIVED (got ${mixedPayFirstOrder.status})`);
    assert(mixedPayFirstOrder.subtotal === 50, `Subtotal reflects ONLY non-comped item (got ${mixedPayFirstOrder.subtotal})`);

    // =========================================================================
    // 7. Appending Comp Items to an Existing Table Order
    // =========================================================================
    console.log('\n➕ 7. Appending Comp Items to an Existing Table Order');

    const appendedOrder = await rbacService.createTableOrder(testBizId, {
      table_id: payFirstCompTable.id,
      existing_order_id: mixedPayFirstOrder.id,
      customer_name: 'Director Sharma',
      items: [
        {
          item_id: 'dessert-comp-1',
          name: 'Gulab Jamun',
          price: 120,
          quantity: 2,
          is_comp: true,
          comp_qty: 2,
          comp_value: 240,
        },
      ],
    });

    assert(appendedOrder.items.length === 3, `Appended order contains all 3 items (got ${appendedOrder.items.length})`);
    assert(appendedOrder.status === 'RECEIVED', `Appended order status is RECEIVED for kitchen preparation (got ${appendedOrder.status})`);
    assert(appendedOrder.pay_first === false, 'Appended order retains pay_first = false');
    assert(appendedOrder.subtotal === 50, `Appended order subtotal remains unchanged at 50 since added items are comped (got ${appendedOrder.subtotal})`);

    // =========================================================================
    // 8. Password Regeneration & Immediate Session Invalidation
    // =========================================================================
    console.log('\n🔄 8. Password Regeneration & Invalidation Verification');

    // Currently active password is 'COMP-9482'
    const verifyOldBefore = await rbacService.verifyCompPassword(testBizId, 'COMP-9482');
    assert(verifyOldBefore.valid === true, 'Old password is valid before regeneration');

    // Regenerate to a new password
    await rbacService.updateBusinessCompPassword(testBizId, 'COMP-NEW-9999', ownerUser);

    // Old password MUST be immediately rejected
    const verifyOldAfter = await rbacService.verifyCompPassword(testBizId, 'COMP-9482');
    assert(verifyOldAfter.valid === false, 'Old password is immediately invalidated after regeneration');

    // New password MUST be accepted
    const verifyNew = await rbacService.verifyCompPassword(testBizId, 'COMP-NEW-9999');
    assert(verifyNew.valid === true, 'New regenerated password is valid');

    // =========================================================================
    // 9. Orderer Fallback from Linked TableOrder
    // =========================================================================
    console.log('\n🛡️ 9. Orderer Fallback from Linked TableOrder when Table Comp Disabled');

    // Disable comp on table before settling sale
    await rbacService.updateTable(testBizId, payFirstCompTable.id, { comp_enabled: false }, ownerUser);

    const fallbackSettledSale = await rbacService.createSale(testBizId, {
      table_id: payFirstCompTable.id,
      table_number: 'PAYFIRST-COMP-1',
      order_id: mixedPayFirstOrder.id,
      customer_name: 'Director Sharma',
      sale_type: 'DINE_IN',
      payment_method: 'CASH',
      items: [
        {
          item_id: 'momo-comp-1',
          name: 'Steamed Momo',
          price: 250,
          unit_price: 250,
          quantity: 1,
          comp_qty: 1,
          is_comp: true,
          comp_value: 250,
          subtotal: 0,
          total_price: 0,
        } as any,
      ],
      subtotal: 0,
      total_amount: 0,
    }, ownerUser);

    const updatedCompRecords = await rbacService.getCompRecords(testBizId);
    const fallbackRec = updatedCompRecords.find(r => r.sale_id === fallbackSettledSale.id);
    assert(Boolean(fallbackRec), 'CompRecord created for fallback sale');
    assert(fallbackRec?.orderer_name === 'Director Sharma', `CompRecord resolved orderer_name "Director Sharma" via TableOrder (got "${fallbackRec?.orderer_name}")`);

  } finally {
    // Cleanup
    console.log('\n🧹 Cleanup Test Business');
    await prisma.compRecord.deleteMany({ where: { business_id: testBizId } });
    await prisma.sale.deleteMany({ where: { business_id: testBizId } });
    await prisma.tableOrder.deleteMany({ where: { business_id: testBizId } });
    await prisma.restaurantTable.deleteMany({ where: { business_id: testBizId } });
    await prisma.business.deleteMany({ where: { id: testBizId } });
  }

  console.log('\n========================================');
  console.log(`🏁 Test Results: ${passed} Passed, ${failed} Failed`);
  console.log('========================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runCompQrTestSuite().catch((err) => {
  console.error('Test Suite encountered an error:', err);
  process.exit(1);
});
