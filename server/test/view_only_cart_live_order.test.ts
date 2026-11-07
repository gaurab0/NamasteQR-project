import assert from 'assert';
import http from 'http';
import { createApp } from '../src/app';
import { db } from '../src/services/db.service';
import { prisma } from '../src/lib/prisma';
import { rbacService } from '../src/services/rbac.service';

async function runTests() {
  console.log('🧪 Starting View-Only Guest Cart & Live Table Order Test Suite...\n');
  let passed = 0;
  let failed = 0;

  const app = createApp();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://localhost:${port}`;

  const defaultBiz = await db.getDefaultBusiness();
  const testBizId = defaultBiz?.id || 'maya-forest-resort';
  const uniqueSuffix = Date.now().toString().slice(-6);
  const testTableNumber = `VO-${uniqueSuffix}`;

  let createdTable: any = null;
  let activeOrder: any = null;

  try {
    // 1. Create a test dining table
    console.log('📦 1. Create Dine-In Table for Multi-Guest Session Testing');
    createdTable = await prisma.restaurantTable.create({
      data: {
        business_id: testBizId,
        table_number: testTableNumber,
        floor: 'Ground Floor',
        building: 'Main Hall',
        status: 'AVAILABLE',
        capacity: 4,
      },
    });
    assert(createdTable && createdTable.id, 'Table successfully created in DB');
    console.log(`  ✅ PASS: Table #${testTableNumber} created (ID: ${createdTable.id})`);
    passed++;

    // 2. First Guest scans table QR -> Becomes Table Host
    console.log('\n📱 2. First Guest Scans Table QR (Host Check-In)');
    const hostCheckIn = await rbacService.scanTableCheckIn(testBizId, createdTable.id, {
      tableNumber: createdTable.table_number,
      customerName: 'Host Alice',
    });
    assert.strictEqual(hostCheckIn.is_host, true, 'First guest must be granted Table Host authority');
    assert(hostCheckIn.host_token, 'Host must be issued a secure host_token');
    assert(hostCheckIn.session_id, 'Host must receive active session_id');
    const hostToken = hostCheckIn.host_token;
    const tableSessionId = hostCheckIn.session_id;
    console.log(`  ✅ PASS: First guest is assigned Table Host (Token: ${hostToken?.slice(0, 8)}..., Session: ${tableSessionId})`);
    passed++;

    // 3. Table Host places an active table order with multiple dishes
    console.log('\n🛒 3. Table Host Places Live Table Order with Items & Variants');
    activeOrder = await rbacService.createTableOrder(testBizId, {
      table_id: createdTable.id,
      table_number: createdTable.table_number,
      session_id: tableSessionId,
      host_token: hostToken,
      customer_name: 'Host Alice',
      order_notes: 'Please serve drinks first and make momo spicy',
      items: [
        {
          item_id: 'dish-momo-1',
          name: 'Steamed Chicken Momo',
          price: 350,
          quantity: 2,
          food_type: 'non_veg',
          variant_name: 'Spicy Dip',
          special_instructions: 'Extra achar please',
        },
        {
          item_id: 'dish-paneer-1',
          name: 'Paneer Butter Masala',
          price: 450,
          quantity: 1,
          food_type: 'veg',
          special_instructions: 'Less butter',
        },
      ],
    });

    assert(activeOrder && activeOrder.id, 'Active order placed successfully');
    assert.strictEqual(activeOrder.items.length, 2, 'Order must contain 2 line items');
    assert.strictEqual(activeOrder.subtotal, 1150, 'Order subtotal must equal (350*2) + (450*1) = 1150');
    console.log(`  ✅ PASS: Order #${activeOrder.order_number || activeOrder.id.slice(0, 8)} created. Subtotal: Rs. ${activeOrder.subtotal}`);
    passed++;

    // 4. Second Guest scans the active table QR -> Assigned View-Only Mode
    console.log('\n👥 4. Second Guest Scans the Active Table QR (View-Only Mode)');
    const secondGuestCheckIn = await rbacService.scanTableCheckIn(testBizId, createdTable.id, {
      tableNumber: createdTable.table_number,
      customerName: 'Guest Bob',
      // No existingHostToken provided
    });
    assert.strictEqual(secondGuestCheckIn.is_host, false, 'Second guest MUST NOT have host authority (is_host = false)');
    assert.strictEqual(secondGuestCheckIn.host_token, null, 'Second guest MUST NOT receive host token');
    assert.strictEqual(secondGuestCheckIn.session_id, tableSessionId, 'Second guest joins the same dining session');
    console.log('  ✅ PASS: Second guest successfully restricted to View-Only mode (is_host: false, host_token: null)');
    passed++;

    // 5. View-Only Guest fetches Table Orders -> Live order items and totals are visible
    console.log('\n👀 5. View-Only Guest Views Table Cart & Live Order');
    const tableOrders = await rbacService.getTableOrders(testBizId, { id: 'guest-2', role: 'CUSTOMER' }, createdTable.id);
    assert(Array.isArray(tableOrders) && tableOrders.length > 0, 'View-only guest can access table orders');
    const currentTableOrder = tableOrders.find((o) => o.status !== 'CANCELLED' && o.status !== 'COMPLETED');
    assert(currentTableOrder, 'Active live order is found for the table');
    assert.strictEqual(currentTableOrder?.items?.length, 2, 'Live table order displays all 2 dishes to view-only guest');
    assert.strictEqual(currentTableOrder?.subtotal, 1150, 'View-only guest sees table subtotal of 1150');
    assert.strictEqual(currentTableOrder?.items[0].name, 'Steamed Chicken Momo', 'Dish name matches Steamed Chicken Momo');
    assert.strictEqual(currentTableOrder?.items[0].quantity, 2, 'Quantity matches 2');
    assert.strictEqual(currentTableOrder?.items[0].variant_name, 'Spicy Dip', 'Variant matches Spicy Dip');
    assert.strictEqual(currentTableOrder?.items[0].special_instructions, 'Extra achar please', 'Special instructions visible');
    assert.strictEqual(currentTableOrder?.order_notes, 'Please serve drinks first and make momo spicy', 'Kitchen instructions visible');

    // Also verify via HTTP API endpoint (/api/rbac/orders?tableId=...&businessId=...)
    const httpRes = await fetch(`${baseUrl}/api/rbac/orders?tableId=${createdTable.id}&businessId=${testBizId}`, {
      headers: {
        'x-business-id': testBizId,
      },
    });
    const httpData = await httpRes.json();
    assert.strictEqual(httpRes.status, 200, 'HTTP endpoint returns 200');
    assert(Array.isArray(httpData.data) && httpData.data.length > 0, 'HTTP endpoint returns table orders for guest view');
    const httpOrder = httpData.data[0];
    assert.strictEqual(httpOrder.items.length, 2, 'HTTP payload contains all 2 items');
    assert.strictEqual(httpOrder.subtotal, 1150, 'HTTP payload contains subtotal of 1150');
    console.log('  ✅ PASS: Live order items, dishes, variants, quantities, and subtotal are fully visible to View-Only guest via both Service and HTTP API.');
    passed++;

    // 6. View-Only Guest attempting to submit order writes is strictly blocked
    console.log('\n🔒 6. Security Enforcement: View-Only Guest Write Actions Blocked');
    let guestWriteBlocked = false;
    try {
      await rbacService.createTableOrder(testBizId, {
        table_id: createdTable.id,
        table_number: createdTable.table_number,
        session_id: tableSessionId,
        host_token: 'fake-guest-token', // Invalid / unauthorized token
        customer_name: 'Guest Bob',
        items: [
          {
            item_id: 'dish-beer-1',
            name: 'Craft Beer',
            price: 600,
            quantity: 1,
          },
        ],
      });
    } catch (err: any) {
      guestWriteBlocked = true;
      assert(
        err.message.includes('host') || err.message.includes('authority') || err.message.includes('token') || err.message.includes('Forbidden') || err.status === 403,
        `Expected host authority error, got: ${err.message}`
      );
    }
    assert(guestWriteBlocked, 'Backend strictly rejects order submission from non-host without valid host_token');
    console.log('  ✅ PASS: Unauthorized order write action correctly rejected by server.');
    passed++;

    // 7. Real-Time Order Update (Kitchen updates dish status / host adds item)
    console.log('\n⚡ 7. Real-Time Updates Synced to Table Order');
    await prisma.tableOrder.update({
      where: { id: activeOrder.id },
      data: {
        items: [
          ...activeOrder.items,
          {
            item_id: 'dish-lassi-1',
            name: 'Sweet Lassi',
            price: 180,
            quantity: 1,
            food_type: 'veg',
            status: 'PREPARING',
          },
        ],
        subtotal: 1150 + 180,
        total_amount: 1150 + 180,
      },
    });

    const updatedOrders = await rbacService.getTableOrders(testBizId, { id: 'guest-2', role: 'CUSTOMER' }, createdTable.id);
    const updatedActiveOrder = updatedOrders.find((o) => o.id === activeOrder.id);
    assert.strictEqual(updatedActiveOrder?.items?.length, 3, 'Updated table order contains 3 items');
    assert.strictEqual(updatedActiveOrder?.subtotal, 1330, 'Updated subtotal reflects 1330');
    console.log('  ✅ PASS: Real-time additions immediately reflected in live table order (3 items, subtotal: Rs. 1330).');
    passed++;

    // 8. View-Only Guest Scan returns active_order directly in scan check-in payload
    console.log('\n📦 8. Second Guest QR Scan Returns Active Order in Check-In Response');
    const guestScanWithOrder = await rbacService.scanTableCheckIn(testBizId, createdTable.id, {
      tableNumber: createdTable.table_number,
    });
    assert.strictEqual(guestScanWithOrder.is_host, false, 'Guest is still view-only');
    assert(guestScanWithOrder.active_order, 'Scan check-in must return active_order directly');
    assert.strictEqual(guestScanWithOrder.active_order?.id, activeOrder.id, 'active_order id matches');
    assert.strictEqual(guestScanWithOrder.active_order?.items?.length, 3, 'Direct active_order contains 3 items');
    assert.strictEqual(guestScanWithOrder.active_order?.subtotal, 1330, 'Direct active_order has subtotal 1330');
    console.log('  ✅ PASS: Direct scan response includes active_order for instant cart rendering without secondary roundtrip.');
    passed++;

    // 9. View-Only Guest Bill Request Rejection (Security check)
    console.log('\n🔒 9. Security Enforcement: View-Only Guest Bill Request Rejected');
    const unauthorizedBillRes = await fetch(`${baseUrl}/api/rbac/orders/${activeOrder.id}/request-bill`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-business-id': testBizId,
      },
      body: JSON.stringify({
        businessId: testBizId,
        payment_method: 'cash',
        // No host_token provided (View-only guest attempt)
      }),
    });
    const unauthorizedBillData = await unauthorizedBillRes.json();
    assert.strictEqual(unauthorizedBillRes.status, 403, 'Unauthorized bill request must return HTTP 403 Forbidden');
    assert.strictEqual(unauthorizedBillData.error?.code, 'VIEW_ONLY_GUEST', 'Error code must be VIEW_ONLY_GUEST');
    console.log('  ✅ PASS: Unauthorized bill request from non-host correctly rejected with HTTP 403.');
    passed++;

    // 10. Table Host Authorized Bill Request
    console.log('\n🧾 10. Table Host Requests Final Bill with Valid Host Token');
    const hostBillRes = await fetch(`${baseUrl}/api/rbac/orders/${activeOrder.id}/request-bill`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-business-id': testBizId,
        'x-host-token': hostToken,
      },
      body: JSON.stringify({
        businessId: testBizId,
        payment_method: 'cash',
        host_token: hostToken,
      }),
    });
    const hostBillData = await hostBillRes.json();
    assert.strictEqual(hostBillRes.status, 200, 'Host bill request must return HTTP 200 OK');
    assert(hostBillData.success, 'Host bill request must succeed');
    assert.strictEqual(hostBillData.data?.bill_requested, true, 'Order bill_requested must be true');
    console.log('  ✅ PASS: Table Host with valid host token successfully requested final bill.');
    passed++;

  } catch (err: any) {
    console.error('  ❌ FAIL:', err.message);
    failed++;
  } finally {
    // Cleanup test records
    console.log('\n🧹 Cleaning up test database records...');
    try {
      if (activeOrder?.id) {
        await prisma.tableOrder.deleteMany({ where: { id: activeOrder.id } });
      }
      if (createdTable?.id) {
        await prisma.restaurantTable.deleteMany({ where: { id: createdTable.id } });
      }
    } catch (cleanErr: any) {
      console.warn('Cleanup warning:', cleanErr.message);
    }
    server.close();
  }

  console.log('\n========================================');
  console.log(`🏁 Test Results: ${passed} Passed, ${failed} Failed`);
  console.log('========================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((e) => {
  console.error('Fatal test error:', e);
  process.exit(1);
});
