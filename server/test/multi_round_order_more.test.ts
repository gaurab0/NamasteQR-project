import { prisma } from '../src/lib/prisma';
import { rbacService } from '../src/services/rbac.service';
import { db } from '../src/services/db.service';

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

async function runMultiRoundTest() {
  console.log('🧪 Starting Multi-Round "Order More" Test Suite...\n');

  const testBizId = `test-biz-rounds-${Date.now()}`;
  const ownerUser = { id: 'owner-01', name: 'Chef Owner', email: 'owner@test.com', role: 'OWNER' };

  try {
    await db.ensureBusiness(testBizId, 'Multi-Round Cafe');

    // 1. Create a dine-in table
    const tableId = `tbl-round-${Date.now()}`;
    await prisma.restaurantTable.create({
      data: {
        id: tableId,
        business_id: testBizId,
        table_number: 'Cabin 901',
        status: 'ACTIVE',
      },
    });

    // 2. Place Initial Order (Round 1)
    console.log('📦 1. Initial Order Placement (Round 1)');
    const round1Order = await rbacService.createTableOrder(testBizId, {
      table_id: tableId,
      table_number: 'Cabin 901',
      items: [
        {
          item_id: 'item-tea',
          name: 'Black Tea',
          price: 35,
          currency: 'Rs.',
          quantity: 2,
          is_packageable: true,
          is_packaged: true,
          pack_qty: 1,
          packaging_charge: 10,
        } as any,
      ],
      customer_name: 'Sarah',
    });

    assert(Boolean(round1Order.id), 'Round 1 order created successfully');
    assert(Boolean(round1Order.order_number), `Round 1 order has order_number: ${round1Order.order_number}`);
    assert(round1Order.items.length === 1, 'Round 1 has 1 line item');

    // 3. Place Follow-up Order ("Order More" - Round 2)
    console.log('📦 2. Follow-Up Order Placement (Round 2)');
    const round2Order = await rbacService.createTableOrder(testBizId, {
      table_id: tableId,
      table_number: 'Cabin 901',
      existing_order_id: round1Order.id,
      items: [
        {
          item_id: 'item-coffee',
          name: 'Black Coffee',
          price: 60,
          currency: 'Rs.',
          quantity: 1,
        } as any,
      ],
      customer_name: 'Sarah',
      order_notes: 'No sugar',
    });

    assert(round2Order.id !== round1Order.id, 'Round 2 order has distinct ID from Round 1');
    assert(round2Order.is_follow_up === true, 'Round 2 order is marked as is_follow_up: true');
    assert(round2Order.round_number === 2, 'Round 2 order has round_number: 2');
    assert(
      (round2Order.order_number || '').includes('(Round 2)'),
      `Round 2 order_number contains '(Round 2)': ${round2Order.order_number}`
    );
    assert(round2Order.items.length === 1, 'Round 2 ticket contains ONLY the new item');
    assert(round2Order.items[0].name === 'Black Coffee', 'Round 2 item is Black Coffee');
    assert(round2Order.items[0].round_number === 2, 'Item is tagged with round_number: 2');

    // 4. Place 3rd Round ("Order More" - Round 3)
    console.log('📦 3. Sibling Round Placement (Round 3)');
    const round3Order = await rbacService.createTableOrder(testBizId, {
      table_id: tableId,
      table_number: 'Cabin 901',
      existing_order_id: round1Order.id,
      items: [
        {
          item_id: 'item-dessert',
          name: 'Brownie',
          price: 150,
          currency: 'Rs.',
          quantity: 1,
        } as any,
      ],
    });

    assert(round3Order.round_number === 3, 'Round 3 order has round_number: 3');
    assert(
      (round3Order.order_number || '').includes('(Round 3)'),
      `Round 3 order_number contains '(Round 3)': ${round3Order.order_number}`
    );

    // 5. Query active orders for this table
    console.log('📋 4. Station Order Retrieval for Kitchen/Bar/Waiter');
    const tableOrders = await rbacService.getTableOrders(testBizId, ownerUser, tableId);
    assert(tableOrders.length >= 3, `Table has 3 separate discrete cards for KDS (found ${tableOrders.length})`);

    const r2InList = tableOrders.find((o) => o.id === round2Order.id);
    assert(Boolean(r2InList), 'Round 2 order present in KDS order list');
    assert(r2InList?.is_follow_up === true, 'Round 2 in list is_follow_up is true');
    assert(r2InList?.round_number === 2, 'Round 2 in list has round_number: 2');

    // 6. Cashier Settle Table (Unified Table Tab)
    console.log('💳 5. Cashier Bill Settlement Consolidates All Rounds');
    const settledSale = await rbacService.createSale(testBizId, {
      table_id: tableId,
      order_id: round1Order.id,
      payment_method: 'CASH',
      items: [
        { name: 'Black Tea', quantity: 2, price: 35, subtotal: 70, total_price: 70 },
        { name: 'Black Coffee', quantity: 1, price: 60, subtotal: 60, total_price: 60 },
        { name: 'Brownie', quantity: 1, price: 150, subtotal: 150, total_price: 150 },
      ] as any,
      subtotal: 280,
      total_amount: 280,
      sale_type: 'DINE_IN',
    }, ownerUser);

    assert(Boolean(settledSale.id), 'Settlement sale created successfully');

    // Verify all 3 orders are marked COMPLETED
    const afterSettleOrders = await rbacService.getTableOrders(testBizId, ownerUser, tableId);
    const unsettledAfter = afterSettleOrders.filter((o) => o.status !== 'COMPLETED' && o.status !== 'CANCELLED' && !o.settled);
    assert(unsettledAfter.length === 0, 'All rounds for Table Cabin 901 are completed after table settlement');

  } catch (err: any) {
    console.error('Test execution error:', err);
    failed++;
  } finally {
    // Cleanup test data
    try {
      await prisma.tableOrder.deleteMany({ where: { business_id: testBizId } });
      await prisma.sale.deleteMany({ where: { business_id: testBizId } });
      await prisma.restaurantTable.deleteMany({ where: { business_id: testBizId } });
      await prisma.business.deleteMany({ where: { id: testBizId } });
    } catch {}
  }

  console.log('\n========================================');
  console.log(`🏁 Test Results: ${passed} Passed, ${failed} Failed`);
  console.log('========================================\n');

  if (failed > 0) process.exit(1);
}

runMultiRoundTest();
