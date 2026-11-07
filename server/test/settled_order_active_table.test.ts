import assert from 'assert';
import { prisma } from '../src/lib/prisma';
import { rbacService } from '../src/services/rbac.service';
import { db } from '../src/services/db.service';
import { realtimeEmitter } from '../src/lib/socket';

async function runSettledOrderActiveTableTest() {
  console.log('🧪 Starting Settled Table Order Visibility & Race Condition Test Suite...');

  const testBizId = 'biz-settled-test-' + Date.now();
  const testTableId = 'tbl-patio-6-' + Date.now();
  const testOrderId = 'order-ord-95-' + Date.now();

  let passed = 0;
  let failed = 0;

  try {
    // Setup Business & Table 6 (Patio)
    await db.ensureBusiness(testBizId, 'Patio Dine-In Resort');
    await prisma.restaurantTable.create({
      data: {
        id: testTableId,
        business_id: testBizId,
        table_number: '6 (Patio)',
        floor: 'Ground Floor',
        capacity: 4,
        status: 'OCCUPIED',
        current_session_id: testOrderId,
      },
    });

    // Capture realtime events
    const emittedOrderUpdates: any[] = [];
    const emittedTableUpdates: any[] = [];
    const origOrderUpdated = realtimeEmitter.orderUpdated;
    const origTableUpdated = realtimeEmitter.tableUpdated;

    realtimeEmitter.orderUpdated = (bId: string, order: any) => {
      if (bId === testBizId) emittedOrderUpdates.push(order);
      return true;
    };
    realtimeEmitter.tableUpdated = (bId: string, tbl: any) => {
      if (bId === testBizId) emittedTableUpdates.push(tbl);
      return true;
    };

    // Step 1: Create active Dine-In Table Order (ORD-95)
    const initialOrder = await prisma.tableOrder.create({
      data: {
        id: testOrderId,
        business_id: testBizId,
        table_id: testTableId,
        table_number: '6 (Patio)',
        order_number: 'ORD-95',
        status: 'SERVED',
        pay_first: false,
        subtotal: 950,
        tax_amount: 123.5,
        total_amount: 1073.5,
        currency: 'Rs.',
        customer_name: 'Dine-In Customer',
        items: [
          {
            item_id: 'item-pasta-1',
            name: 'Penne Arrabiata',
            price: 550,
            quantity: 1,
            status: 'SERVED',
          },
          {
            item_id: 'item-drink-1',
            name: 'Fresh Mint Lemonade',
            price: 400,
            quantity: 1,
            status: 'READY',
          },
        ],
      },
    });

    console.log('📦 Step 1: Order ORD-95 created on Table 6 (Patio)');
    assert.strictEqual(initialOrder.status, 'SERVED');
    assert.strictEqual(initialOrder.payment_status, null);
    passed++;

    // Step 2: Cashier 1 settles the bill
    console.log('💳 Step 2: Cashier 1 settles the bill via createSale...');
    const sale = await rbacService.createSale(testBizId, {
      order_id: testOrderId,
      table_id: testTableId,
      table_number: '6 (Patio)',
      customer_name: 'Dine-In Customer',
      subtotal: 950,
      total_amount: 1073.5,
      payment_method: 'CASH',
      payment_status: 'PAID',
      items: initialOrder.items as any,
    });

    assert.ok(sale.id, 'Sale created successfully');
    
    // Check order status in DB
    const orderAfterSettlement = await prisma.tableOrder.findUnique({ where: { id: testOrderId } });
    assert.strictEqual(orderAfterSettlement?.status, 'COMPLETED', 'Order status must be COMPLETED');
    assert.strictEqual(orderAfterSettlement?.payment_status, 'PAID', 'Order payment_status must be PAID');
    assert.strictEqual(orderAfterSettlement?.sale_id, sale.id, 'Order must link to sale_id');

    // All active items in order should now be SERVED
    const itemsAfter = (orderAfterSettlement?.items as any[]) || [];
    assert.ok(itemsAfter.every((it) => it.status === 'SERVED'), 'All active items in settled order must be SERVED');

    // Table must be reset to ACTIVE with current_session_id null
    const tableAfterSettlement = await prisma.restaurantTable.findUnique({ where: { id: testTableId } });
    assert.strictEqual(tableAfterSettlement?.status, 'ACTIVE', 'Table status must be reset to ACTIVE');
    assert.strictEqual(tableAfterSettlement?.current_session_id, null, 'Table session must be cleared');

    console.log('  ✅ PASS: Bill settled, order COMPLETED & PAID, table reset to ACTIVE');
    passed++;

    // Step 3: Verify realtime event was emitted with COMPLETED, PAID, and settled: true
    console.log('📡 Step 3: Checking realtime orderUpdated emission...');
    const settlementEmission = emittedOrderUpdates.find((e) => e.id === testOrderId && e.status === 'COMPLETED');
    assert.ok(settlementEmission, 'Must emit orderUpdated with status COMPLETED');
    assert.strictEqual(settlementEmission.payment_status, 'PAID', 'Emission must have payment_status PAID');
    assert.strictEqual(settlementEmission.settled, true, 'Emission must have settled: true');
    console.log('  ✅ PASS: Realtime broadcast includes COMPLETED, PAID, and settled: true');
    passed++;

    // Step 4: Verify updateTableOrderItemStatus DOES NOT revert COMPLETED status
    console.log('🛡️ Step 4: Testing updateTableOrderItemStatus on settled order...');
    const itemUpdateResult = await rbacService.updateTableOrderItemStatus(
      testBizId,
      testOrderId,
      { index: 0 },
      'SERVED'
    );
    assert.strictEqual(itemUpdateResult.status, 'COMPLETED', 'Status must stay COMPLETED, never revert to SERVED');
    assert.strictEqual(itemUpdateResult.payment_status, 'PAID', 'payment_status must remain PAID');
    assert.strictEqual(itemUpdateResult.settled, true, 'settled flag must remain true');

    const orderInDbAfterItemUpdate = await prisma.tableOrder.findUnique({ where: { id: testOrderId } });
    assert.strictEqual(orderInDbAfterItemUpdate?.status, 'COMPLETED', 'Database status must remain COMPLETED');
    console.log('  ✅ PASS: updateTableOrderItemStatus preserves COMPLETED status on settled order');
    passed++;

    // Step 5: Verify updateTableOrderStatus rejects reverting settled order back to SERVED
    console.log('🛡️ Step 5: Testing updateTableOrderStatus on settled order...');
    let threwRevertError = false;
    try {
      await rbacService.updateTableOrderStatus(testBizId, testOrderId, 'SERVED');
    } catch (e: any) {
      threwRevertError = true;
      assert.ok(e.message.includes('already been settled'), 'Error message mentions already settled');
    }
    assert.ok(threwRevertError, 'Must throw error when attempting to revert settled order to SERVED');
    console.log('  ✅ PASS: updateTableOrderStatus rejects reverting settled order to SERVED');
    passed++;

    // Step 6: Verify getTableOrders normalizes any settled order to COMPLETED
    console.log('📋 Step 6: Testing getTableOrders returns COMPLETED and settled: true...');
    const ordersList = await rbacService.getTableOrders(testBizId, { id: 'admin', role: 'ADMIN' });
    const fetchedOrd95 = ordersList.find((o) => o.id === testOrderId);
    assert.ok(fetchedOrd95, 'Order found in list');
    assert.strictEqual(fetchedOrd95.status, 'COMPLETED', 'getTableOrders returns status COMPLETED');
    assert.strictEqual(fetchedOrd95.payment_status, 'PAID', 'getTableOrders returns payment_status PAID');
    assert.strictEqual(fetchedOrd95.settled, true, 'getTableOrders returns settled: true');
    console.log('  ✅ PASS: getTableOrders returns normalized COMPLETED status with settled: true');
    passed++;

    // Step 7: Test Frontend Filter Logic (Active Dine-In Table Orders list)
    console.log('🖥️ Step 7: Testing frontend unsettled table orders filtering...');
    // Exact filter from BillingPOS.tsx:
    const filterUnsettled = (orders: any[]) => orders.filter((o) => {
      if (o.status === 'AWAITING_PAYMENT') return false;
      if (o.status === 'COMPLETED' || o.status === 'CANCELLED') return false;
      if ((o as any).settled || o.payment_status === 'PAID' || Boolean(o.sale_id)) return false;
      if (o.pay_first && (o.payment_status === 'PAID' || Boolean(o.payment_confirmed_at))) return false;
      return true;
    });

    const pendingOrders = filterUnsettled(ordersList);
    assert.strictEqual(
      pendingOrders.some((o) => o.id === testOrderId),
      false,
      'Settled order ORD-95 must NOT appear in Active Dine-In Table Orders!'
    );
    console.log('  ✅ PASS: ORD-95 is cleanly excluded from Active Dine-In Table Orders');
    passed++;

    // Step 8: Concurrency / Race Condition Guard - Second cashier attempting to settle ORD-95
    console.log('⚡ Step 8: Testing second cashier settlement attempt (First-come first-served guard)...');
    let threwConflict = false;
    try {
      await rbacService.createSale(testBizId, {
        order_id: testOrderId,
        table_id: testTableId,
        table_number: '6 (Patio)',
        customer_name: 'Cashier 2 Duplicate',
        subtotal: 950,
        total_amount: 1073.5,
        payment_method: 'CASH',
        payment_status: 'PAID',
        items: initialOrder.items as any,
      });
    } catch (e: any) {
      threwConflict = true;
      assert.strictEqual(e.statusCode, 409, 'Conflict must have statusCode 409');
      assert.ok(e.message.includes('already been settled'), 'Error message matches exact user screenshot text');
    }
    assert.ok(threwConflict, 'Must throw 409 conflict when order is already settled');
    console.log('  ✅ PASS: Second cashier receives 409 Conflict with exact error message');
    passed++;

    // Step 9: Concurrency Guard when Cashier 2 attempts settlement by table_id (without order_id)
    console.log('⚡ Step 9: Testing second cashier settlement attempt by table_id...');
    let threwTableConflict = false;
    try {
      await rbacService.createSale(testBizId, {
        table_id: testTableId,
        table_number: '6 (Patio)',
        customer_name: 'Cashier 2 By Table',
        subtotal: 950,
        total_amount: 1073.5,
        payment_method: 'CASH',
        payment_status: 'PAID',
        items: initialOrder.items as any,
      });
    } catch (e: any) {
      threwTableConflict = true;
      assert.strictEqual(e.statusCode, 409, 'Conflict must have statusCode 409');
      assert.ok(e.message.includes('already been settled'), 'Error message matches exact user screenshot text');
    }
    assert.ok(threwTableConflict, 'Must throw 409 conflict when settling by table_id if table orders already settled');
    console.log('  ✅ PASS: Table-level settlement attempt also receives 409 Conflict');
    passed++;

    // Step 10: Multi-Order Table Settlement - Clearing table only when all orders are settled
    console.log('🍽️ Step 10: Testing multi-order table session preservation...');
    const multiTableId = 'tbl-multi-' + Date.now();
    const multiOrderId1 = 'ord-m1-' + Date.now();
    const multiOrderId2 = 'ord-m2-' + Date.now();

    await prisma.restaurantTable.create({
      data: {
        id: multiTableId,
        business_id: testBizId,
        table_number: '12 (Garden)',
        status: 'OCCUPIED',
        current_session_id: 'session-garden-12',
      },
    });

    await prisma.tableOrder.createMany({
      data: [
        {
          id: multiOrderId1,
          business_id: testBizId,
          table_id: multiTableId,
          table_number: '12 (Garden)',
          order_number: 'ORD-101',
          status: 'SERVED',
          pay_first: false,
          subtotal: 500,
          total_amount: 500,
          items: [{ item_id: 'i1', name: 'Appetizer', price: 500, quantity: 1, status: 'SERVED' }],
        },
        {
          id: multiOrderId2,
          business_id: testBizId,
          table_id: multiTableId,
          table_number: '12 (Garden)',
          order_number: 'ORD-102',
          status: 'PREPARING',
          pay_first: false,
          subtotal: 800,
          total_amount: 800,
          items: [{ item_id: 'i2', name: 'Main Course', price: 800, quantity: 1, status: 'PREPARING' }],
        },
      ],
    });

    // Settle Order 1 only
    await rbacService.createSale(testBizId, {
      order_id: multiOrderId1,
      table_id: multiTableId,
      table_number: '12 (Garden)',
      total_amount: 500,
      payment_method: 'CASH',
      payment_status: 'PAID',
      items: [{ item_id: 'i1', name: 'Appetizer', price: 500, quantity: 1 }],
    });

    // Table should STILL be OCCUPIED with session-garden-12 because Order 2 is PREPARING!
    const tableAfterFirstOrderSettled = await prisma.restaurantTable.findUnique({ where: { id: multiTableId } });
    assert.strictEqual(tableAfterFirstOrderSettled?.current_session_id, 'session-garden-12', 'Table session must NOT be cleared while Order 2 is active');
    console.log('  ✅ PASS: Multi-order table session preserved while another order is active');
    passed++;

    // Now settle Order 2
    await rbacService.createSale(testBizId, {
      order_id: multiOrderId2,
      table_id: multiTableId,
      table_number: '12 (Garden)',
      total_amount: 800,
      payment_method: 'CASH',
      payment_status: 'PAID',
      items: [{ item_id: 'i2', name: 'Main Course', price: 800, quantity: 1 }],
    });

    // Now table should be reset to ACTIVE and session cleared
    const tableAfterAllOrdersSettled = await prisma.restaurantTable.findUnique({ where: { id: multiTableId } });
    assert.strictEqual(tableAfterAllOrdersSettled?.status, 'ACTIVE', 'Table status reset to ACTIVE once all orders settled');
    assert.strictEqual(tableAfterAllOrdersSettled?.current_session_id, null, 'Table session cleared once all orders settled');
    console.log('  ✅ PASS: Table session cleared after final order on table is settled');
    passed++;

    // Step 11: Pay-First Order settled safety test
    console.log('🛒 Step 11: Testing pay-first order settled flag does NOT break diner live tracking...');
    const payFirstOrderId = 'ord-pf-' + Date.now();
    await prisma.tableOrder.create({
      data: {
        id: payFirstOrderId,
        business_id: testBizId,
        table_id: testTableId,
        table_number: '6 (Patio)',
        order_number: 'ORD-PF-1',
        status: 'RECEIVED',
        pay_first: true,
        payment_status: 'PAID',
        sale_id: 'sale-pf-test',
        subtotal: 450,
        total_amount: 450,
        items: [{ item_id: 'ipf', name: 'Burger', price: 450, quantity: 1, status: 'RECEIVED' }],
      },
    });

    const pfOrders = await rbacService.getTableOrders(testBizId, { id: 'admin', role: 'ADMIN' });
    const fetchedPf = pfOrders.find((o) => o.id === payFirstOrderId);
    assert.ok(fetchedPf, 'Pay-first order returned');
    assert.strictEqual(fetchedPf.status, 'RECEIVED', 'Pay-first order status remains RECEIVED while cooking');
    assert.strictEqual(fetchedPf.settled, false, 'Pay-first order must NOT have settled: true before food is served');

    // Verify CustomerMenuPreviewPage filter keeps it active
    const dinerActiveOrder = pfOrders.find((o) => o.id === payFirstOrderId && o.status !== 'CANCELLED' && o.status !== 'COMPLETED' && !o.settled);
    assert.ok(dinerActiveOrder, 'Diner active order view preserved on refresh!');
    console.log('  ✅ PASS: Pay-first order preserves settled: false and active tracking on page refresh');
    passed++;

    // Step 12: Database self-healing of line-item status
    console.log('🏥 Step 12: Testing database self-healing heals item status to SERVED on settled order...');
    const unhealedOrderId = 'ord-unhealed-' + Date.now();
    await prisma.tableOrder.create({
      data: {
        id: unhealedOrderId,
        business_id: testBizId,
        table_id: testTableId,
        table_number: '6 (Patio)',
        order_number: 'ORD-UNHEALED',
        status: 'SERVED',
        pay_first: false,
        payment_status: 'PAID',
        sale_id: 'sale-legacy-1',
        subtotal: 300,
        total_amount: 300,
        items: [{ item_id: 'i-raw', name: 'Soup', price: 300, quantity: 1, status: 'PREPARING' }],
      },
    });

    const healedOrders = await rbacService.getTableOrders(testBizId, { id: 'admin', role: 'ADMIN' });
    const fetchedHealed = healedOrders.find((o) => o.id === unhealedOrderId);
    assert.ok(fetchedHealed, 'Healed order returned');
    assert.strictEqual(fetchedHealed.status, 'COMPLETED', 'Order status healed to COMPLETED');
    assert.strictEqual(fetchedHealed.settled, true, 'Order settled is true');
    assert.strictEqual((fetchedHealed.items as any[])[0].status, 'SERVED', 'Line item healed to SERVED');
    console.log('  ✅ PASS: Line item status healed to SERVED and order to COMPLETED');
    passed++;

    // Cleanup mocks
    realtimeEmitter.orderUpdated = origOrderUpdated;
    realtimeEmitter.tableUpdated = origTableUpdated;

    // Cleanup test data
    await prisma.restaurantTable.deleteMany({ where: { business_id: testBizId } });
    await prisma.tableOrder.deleteMany({ where: { business_id: testBizId } });
    await prisma.sale.deleteMany({ where: { business_id: testBizId } });

  } catch (err: any) {
    console.error('❌ Test failure:', err);
    failed++;
  }

  console.log('\n========================================');
  console.log(`🏁 Settled Order Active Table Results: ${passed} Passed, ${failed} Failed`);
  console.log('========================================\n');

  if (failed > 0) process.exit(1);
}

runSettledOrderActiveTableTest();
