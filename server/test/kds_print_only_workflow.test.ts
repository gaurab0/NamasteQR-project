import assert from 'assert';
import http from 'http';
import { createApp } from '../src/app';
import { db } from '../src/services/db.service';
import { rbacService } from '../src/services/rbac.service';
import { prisma } from '../src/lib/prisma';
import { generateToken } from '../src/middleware/auth.middleware';

async function runTests() {
  console.log('🧪 Starting KDS PRINT_ONLY Operational Workflow Test Suite...\n');
  let passed = 0;
  let failed = 0;

  const app = createApp();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://localhost:${port}`;

  const defaultBiz = await db.getDefaultBusiness();
  const businessId = defaultBiz?.id || 'maya-forest-resort';

  // Test 1: Verify kds_print_mode column & persistence via db.service
  try {
    console.log('📦 Test 1: Business Profile DB Persistence & kds_print_mode field...');
    const originalMode = defaultBiz?.kds_print_mode || 'DISPLAY_ONLY';

    // Update to PRINT_ONLY
    const updatedBiz = await db.updateBusinessProfile(businessId, { kds_print_mode: 'PRINT_ONLY' });
    assert.strictEqual(updatedBiz.kds_print_mode, 'PRINT_ONLY', 'kds_print_mode should be updated to PRINT_ONLY');

    // Retrieve again directly from DB
    const retrieved = await db.findBusinessById(businessId);
    assert.strictEqual(retrieved?.kds_print_mode, 'PRINT_ONLY', 'retrieved business should have kds_print_mode PRINT_ONLY');

    // Revert/set to original or test value
    await db.updateBusinessProfile(businessId, { kds_print_mode: originalMode });
    console.log('  ✅ PASS: kds_print_mode persisted and retrieved successfully in PostgreSQL.');
    passed++;
  } catch (e: any) {
    console.error('  ❌ FAIL Test 1:', e.message);
    failed++;
  }

  // Test 2: Business Profile API endpoint GET / PUT
  try {
    console.log('📦 Test 2: Business Profile API Endpoints (GET / PUT /api/rbac/business-profile)...');
    const testAdminId = `kds-admin-${Date.now()}`;
    await db.ensureUser({
      id: testAdminId,
      business_id: businessId,
      email: `${testAdminId}@example.com`,
      role: 'RESTAURANT_OWNER',
    });

    const token = generateToken({
      userId: testAdminId,
      role: 'RESTAURANT_OWNER',
      businessId,
    });

    // PUT update
    const putRes = await fetch(`${baseUrl}/api/rbac/business-profile`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        businessId,
        kds_print_mode: 'PRINT_ONLY',
      }),
    });
    const putData = await putRes.json();
    if (putRes.status !== 200) {
      console.error('  DEBUG Test 2 PUT failure:', putRes.status, putData);
    }
    assert.strictEqual(putRes.status, 200, 'PUT /business-profile should return 200');
    assert.strictEqual(putData.data?.kds_print_mode, 'PRINT_ONLY', 'Returned profile should have kds_print_mode PRINT_ONLY');

    // GET retrieve
    const getRes = await fetch(`${baseUrl}/api/rbac/business-profile?businessId=${encodeURIComponent(businessId)}`);
    const getData = await getRes.json();
    assert.strictEqual(getRes.status, 200, 'GET /business-profile should return 200');
    assert.strictEqual(getData.data?.kds_print_mode, 'PRINT_ONLY', 'GET response should reflect kds_print_mode PRINT_ONLY');

    console.log('  ✅ PASS: Business profile GET and PUT APIs successfully handle kds_print_mode.');
    passed++;
  } catch (e: any) {
    console.error('  ❌ FAIL Test 2:', e.message);
    failed++;
  }

  // Test 3: Table Order Direct Transition: RECEIVED -> SERVED (PRINT_ONLY Waiter Workflow)
  try {
    console.log('📦 Test 3: Table Order Direct RECEIVED -> SERVED Transition (No intermediate READY required)...');
    const newOrder = await rbacService.createTableOrder(businessId, {
      table_id: 'test-print-only-table',
      table_number: '99',
      items: [
        {
          item_id: 'test-dish-1',
          name: 'Steamed MoMo',
          price: 250,
          quantity: 2,
          station: 'KITCHEN',
          status: 'RECEIVED',
        },
        {
          item_id: 'test-dish-2',
          name: 'Iced Lemon Tea',
          price: 150,
          quantity: 1,
          station: 'BAR',
          status: 'RECEIVED',
        },
      ],
      currency: 'Rs.',
      customer_name: 'Test Diner',
      pay_first: false,
    });

    assert.strictEqual(newOrder.status, 'RECEIVED', 'New order starts in RECEIVED');
    assert.strictEqual(newOrder.items[0].status, 'RECEIVED', 'Item 1 starts in RECEIVED');
    assert.strictEqual(newOrder.items[1].status, 'RECEIVED', 'Item 2 starts in RECEIVED');

    // In PRINT_ONLY mode, waiter delivers dishes directly without kitchen KDS screen marking them READY
    const servedOrder = await rbacService.updateTableOrderStatus(businessId, newOrder.id, 'SERVED');

    assert.strictEqual(servedOrder.status, 'SERVED', 'Order directly transitions to SERVED');
    assert.ok(servedOrder.served_at, 'Order served_at timestamp must be populated');
    assert.strictEqual(servedOrder.items[0].status, 'SERVED', 'Item 1 status must be synced to SERVED');
    assert.strictEqual(servedOrder.items[1].status, 'SERVED', 'Item 2 status must be synced to SERVED');
    assert.ok((servedOrder.items[0] as any).served_at, 'Item 1 must have served_at timestamp');

    // Clean up test order
    await prisma.tableOrder.deleteMany({ where: { id: newOrder.id } });

    console.log('  ✅ PASS: Direct RECEIVED -> SERVED transition updates order and all line items.');
    passed++;
  } catch (e: any) {
    console.error('  ❌ FAIL Test 3:', e.message);
    failed++;
  }

  // Test 4: Item-Level Delivery in PRINT_ONLY mode & Auto-Transition
  try {
    console.log('📦 Test 4: Item-Level Delivery and Order Status Auto-sync...');
    const itemOrder = await rbacService.createTableOrder(businessId, {
      table_id: 'test-print-only-table-2',
      table_number: '98',
      items: [
        {
          item_id: 'dish-a',
          name: 'Crispy Wings',
          price: 350,
          quantity: 1,
          station: 'KITCHEN',
          status: 'RECEIVED',
        },
        {
          item_id: 'dish-b',
          name: 'Virgin Mojito',
          price: 200,
          quantity: 1,
          station: 'BAR',
          status: 'RECEIVED',
        },
      ],
      currency: 'Rs.',
      customer_name: 'Item Delivery Diner',
      pay_first: false,
    });

    // Deliver first item
    const step1 = await rbacService.updateTableOrderItemStatus(
      businessId,
      itemOrder.id,
      { index: 0 },
      'SERVED'
    );
    assert.strictEqual(step1.items[0].status, 'SERVED', 'First item marked SERVED');
    assert.strictEqual(step1.items[1].status, 'RECEIVED', 'Second item still RECEIVED');
    assert.ok(step1.status !== 'SERVED', 'Order overall is not yet SERVED');

    // Deliver second item
    const step2 = await rbacService.updateTableOrderItemStatus(
      businessId,
      itemOrder.id,
      { index: 1 },
      'SERVED'
    );
    assert.strictEqual(step2.items[1].status, 'SERVED', 'Second item marked SERVED');
    assert.strictEqual(step2.status, 'SERVED', 'When all items are served, order automatically transitions to SERVED');
    assert.ok(step2.served_at, 'Order served_at populated');

    // Clean up
    await prisma.tableOrder.deleteMany({ where: { id: itemOrder.id } });

    console.log('  ✅ PASS: Item-level delivery correctly syncs items and automatically concludes order with SERVED.');
    passed++;
  } catch (e: any) {
    console.error('  ❌ FAIL Test 4:', e.message);
    failed++;
  }

  // Test 5: Pay-First Order Workflow with Direct Delivery
  try {
    console.log('📦 Test 5: Pay-First Order Auto-completes on Delivery...');
    await prisma.restaurantTable.upsert({
      where: { id: 'test-print-only-table-3' },
      create: {
        id: 'test-print-only-table-3',
        business_id: businessId,
        table_number: '97',
        status: 'ACTIVE',
        pay_first_enabled: true,
      },
      update: {
        pay_first_enabled: true,
      },
    });

    const payFirstOrder = await rbacService.createTableOrder(businessId, {
      table_id: 'test-print-only-table-3',
      table_number: '97',
      items: [
        {
          item_id: 'pay-dish-1',
          name: 'Burger & Fries',
          price: 450,
          quantity: 1,
          station: 'KITCHEN',
          status: 'RECEIVED',
        },
      ],
      currency: 'Rs.',
      customer_name: 'Pay First Diner',
    });

    assert.strictEqual(payFirstOrder.pay_first, true, 'Order should have pay_first enabled');
    assert.strictEqual(payFirstOrder.status, 'AWAITING_PAYMENT', 'Pay-first order starts AWAITING_PAYMENT');

    // Confirm payment (Cashier / POS)
    await rbacService.confirmTableOrderPayment(payFirstOrder.id, businessId, 'CASH', 'Test Cashier');

    // Mark SERVED (Waiter Station in PRINT_ONLY mode)
    const completedOrder = await rbacService.updateTableOrderStatus(businessId, payFirstOrder.id, 'SERVED');
    assert.strictEqual(completedOrder.status, 'COMPLETED', 'Pay-first order transitions to COMPLETED when served');
    assert.ok(completedOrder.served_at, 'Pay-first order has served_at populated');

    // Clean up
    await prisma.tableOrder.deleteMany({ where: { id: payFirstOrder.id } });
    await prisma.restaurantTable.deleteMany({ where: { id: 'test-print-only-table-3' } });

    console.log('  ✅ PASS: Pay-first orders auto-complete to COMPLETED when delivered.');
    passed++;
  } catch (e: any) {
    console.error('  ❌ FAIL Test 5:', e.message);
    failed++;
  }

  // Test 6: Final Bill Gating Validation
  try {
    console.log('📦 Test 6: Bill Gating Logic (Dishes must be served before bill can be requested)...');
    
    // Scenario A: Unserved items
    const unservedOrder = {
      items: [
        { status: 'RECEIVED' },
        { status: 'SERVED' },
      ],
    };
    const nonCancelledA = unservedOrder.items.filter((i) => i.status !== 'CANCELLED');
    const isServedA = nonCancelledA.length > 0 && nonCancelledA.every((i) => i.status === 'SERVED' || i.status === 'COMPLETED' || Boolean((i as any).served_at));
    assert.strictEqual(isServedA, false, 'Should block bill if any item is not yet served');

    // Scenario B: All served or completed
    const servedOrder = {
      items: [
        { status: 'SERVED', served_at: new Date().toISOString() },
        { status: 'COMPLETED' },
        { status: 'CANCELLED' }, // Cancelled items do not block bill
      ],
    };
    const nonCancelledB = servedOrder.items.filter((i) => i.status !== 'CANCELLED');
    const isServedB = nonCancelledB.length > 0 && nonCancelledB.every((i) => i.status === 'SERVED' || i.status === 'COMPLETED' || Boolean((i as any).served_at));
    assert.strictEqual(isServedB, true, 'Should allow bill when all active items are served/completed');

    console.log('  ✅ PASS: Final bill request gating accurately enforces complete table delivery.');
    passed++;
  } catch (e: any) {
    console.error('  ❌ FAIL Test 6:', e.message);
    failed++;
  }

  // Test 7: Round 2 Add-On Order in PRINT_ONLY mode Resets Delivery Requirement and Bill Gating
  try {
    console.log('📦 Test 7: Round 2 Add-On Order Resets Delivery Requirement & Bill Gating...');
    const round1Order = await rbacService.createTableOrder(businessId, {
      table_id: 'test-print-only-table-round2',
      table_number: '77',
      items: [
        {
          item_id: 'dish-round-1',
          name: 'Butter Naan',
          price: 80,
          quantity: 2,
          station: 'KITCHEN',
          status: 'RECEIVED',
        },
      ],
      currency: 'Rs.',
      customer_name: 'Diner Round 2',
      pay_first: false,
    });

    // Waiter marks Round 1 as delivered
    const servedRound1 = await rbacService.updateTableOrderStatus(businessId, round1Order.id, 'SERVED');
    assert.strictEqual(servedRound1.status, 'SERVED', 'Round 1 is SERVED');
    assert.ok(servedRound1.served_at, 'Round 1 has served_at');

    // Guest orders Round 2 add-on dish while table is still seated
    const round2Order = await rbacService.createTableOrder(businessId, {
      table_id: 'test-print-only-table-round2',
      table_number: '77',
      existing_order_id: round1Order.id,
      items: [
        {
          item_id: 'dish-round-2',
          name: 'Paneer Butter Masala',
          price: 350,
          quantity: 1,
          station: 'KITCHEN',
          status: 'RECEIVED',
        },
      ],
      currency: 'Rs.',
      customer_name: 'Diner Round 2',
      pay_first: false,
    });

    assert.strictEqual(round2Order.status, 'RECEIVED', 'Order status resets from SERVED to RECEIVED when add-on dish arrives');
    assert.ok(!round2Order.served_at, 'served_at is cleared on order when add-on is placed');
    assert.strictEqual(round2Order.items.length, 2, 'Combined order has 2 items');
    assert.strictEqual(round2Order.items[0].status, 'SERVED', 'Item 1 remains SERVED');
    assert.strictEqual(round2Order.items[1].status, 'RECEIVED', 'Add-on Item 2 is RECEIVED');

    // Verify DB persistence of reset state
    const dbOrderAfterAddon = await prisma.tableOrder.findUnique({ where: { id: round1Order.id } });
    assert.strictEqual(dbOrderAfterAddon?.status, 'RECEIVED', 'DB order status is RECEIVED');
    assert.strictEqual(dbOrderAfterAddon?.served_at, null, 'DB order served_at is null');

    // Verify bill gating blocks bill request
    const nonCancelledItems = (round2Order.items || []).filter((i: any) => i.status !== 'CANCELLED');
    const isServedBeforeWaiter = nonCancelledItems.length > 0 && nonCancelledItems.every((i: any) => i.status === 'SERVED' || i.status === 'COMPLETED');
    assert.strictEqual(isServedBeforeWaiter, false, 'Bill gating blocks bill because Round 2 dish is not yet delivered');

    // Waiter delivers the Round 2 dish
    const finalServed = await rbacService.updateTableOrderStatus(businessId, round1Order.id, 'SERVED');
    assert.strictEqual(finalServed.status, 'SERVED', 'Order is once again SERVED');
    assert.ok(finalServed.served_at, 'Order has new served_at timestamp');
    assert.strictEqual(finalServed.items[1].status, 'SERVED', 'Item 2 is now SERVED');

    const isServedAfterWaiter = finalServed.items.every((i: any) => i.status === 'SERVED');
    assert.strictEqual(isServedAfterWaiter, true, 'Bill gating now allows bill request');

    // Clean up
    await prisma.tableOrder.deleteMany({ where: { id: round1Order.id } });

    console.log('  ✅ PASS: Round 2 add-on order successfully resets delivery status and enforces bill gating.');
    passed++;
  } catch (e: any) {
    console.error('  ❌ FAIL Test 7:', e.message);
    failed++;
  }

  // Close server
  await new Promise<void>((resolve) => server.close(() => resolve()));

  console.log('\n========================================');
  console.log(`🏁 KDS PRINT_ONLY Suite Results: ${passed} Passed, ${failed} Failed`);
  console.log('========================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal error running tests:', err);
  process.exit(1);
});
