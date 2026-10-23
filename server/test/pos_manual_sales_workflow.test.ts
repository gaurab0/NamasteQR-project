import assert from 'assert';
import http from 'http';
import { createApp } from '../src/app';
import { db } from '../src/services/db.service';
import { rbacService } from '../src/services/rbac.service';
import { prisma } from '../src/lib/prisma';
import { realtimeEmitter } from '../src/lib/socket';

async function runTests() {
  console.log('🧪 Starting Manual POS Sales & Post-Settlement Kitchen Dispatch Test Suite...\n');
  let passed = 0;
  let failed = 0;

  const app = createApp();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));

  const defaultBiz = await db.getDefaultBusiness();
  const businessId = defaultBiz?.id || 'maya-forest-resort';

  // Ensure test table exists
  const testTableId = `test-tbl-pos-${Date.now()}`;
  const testTableNumber = `POS-99`;
  try {
    await prisma.restaurantTable.create({
      data: {
        id: testTableId,
        business_id: businessId,
        table_number: testTableNumber,
        capacity: 4,
        floor: 'Ground Floor',
        status: 'ACTIVE',
      },
    });
  } catch (e) {}

  // Test 1: Manual Dine-In POS Sale creates immediate Sale AND dispatches TableOrder to KDS
  try {
    console.log('📦 Test 1: Manual Dine-In POS Sale immediate settlement & automated KDS dispatch...');
    
    let emittedOrderCreated: any = null;
    let emittedOrderUpdated: any = null;
    let emittedTableUpdated: any = null;

    const originalOrderCreated = realtimeEmitter.orderCreated;
    const originalOrderUpdated = realtimeEmitter.orderUpdated;
    const originalTableUpdated = realtimeEmitter.tableUpdated;

    realtimeEmitter.orderCreated = (bId: string, order: any) => {
      if (bId === businessId) emittedOrderCreated = order;
      return true;
    };
    realtimeEmitter.orderUpdated = (bId: string, order: any) => {
      if (bId === businessId) emittedOrderUpdated = order;
      return true;
    };
    realtimeEmitter.tableUpdated = (bId: string, table: any) => {
      if (bId === businessId) emittedTableUpdated = table;
      return true;
    };

    const salePayload = {
      business_id: businessId,
      table_id: testTableId,
      table_number: testTableNumber,
      customer_name: 'POS Dine-In Guest',
      sale_type: 'DINE_IN' as const,
      payment_method: 'CASH' as const,
      payment_status: 'PAID' as const,
      subtotal: 550,
      total_amount: 550,
      total_tax: 0,
      taxes: [],
      items: [
        {
          id: 'item-burger-1',
          item_id: 'item-burger-1',
          name: 'Crispy Chicken Burger',
          price: 350,
          unit_price: 350,
          quantity: 1,
          category: 'Mains',
        },
        {
          id: 'item-drink-1',
          item_id: 'item-drink-1',
          name: 'Iced Lemon Mint Tea Beverage',
          price: 200,
          unit_price: 200,
          quantity: 1,
          category: 'Beverages',
        },
      ],
      source: 'POS_MANUAL',
      is_manual_pos: true,
      dispatch_kitchen: true,
    };

    const createdSale = await rbacService.createSale(businessId, salePayload as any, { email: 'cashier@test.com' });
    
    assert.ok(createdSale.id, 'Sale record must have an ID');
    assert.strictEqual(createdSale.payment_status, 'PAID', 'Sale must be settled immediately');
    assert.ok(createdSale.order_id, 'Sale must be linked to a generated table order ID');

    // Retrieve generated TableOrder from DB
    const generatedOrder = await prisma.tableOrder.findUnique({
      where: { id: createdSale.order_id },
    });

    assert.ok(generatedOrder, 'TableOrder must be created in PostgreSQL');
    assert.strictEqual(generatedOrder.status, 'RECEIVED', 'Dispatched order status must be RECEIVED');
    assert.strictEqual(generatedOrder.pay_first, true, 'Dispatched order must be marked pay_first: true');
    assert.strictEqual(generatedOrder.payment_status, 'PAID', 'Dispatched order payment_status must be PAID');
    assert.strictEqual(generatedOrder.source, 'POS_MANUAL', 'Dispatched order source must be POS_MANUAL');
    assert.strictEqual(generatedOrder.sale_id, createdSale.id, 'Dispatched order must link back to sale_id');

    // Verify item stations
    const items = generatedOrder.items as any[];
    assert.strictEqual(items.length, 2, 'Must have 2 items');
    const foodItem = items.find((i) => i.name.includes('Burger'));
    const drinkItem = items.find((i) => i.name.includes('Tea'));
    assert.strictEqual(foodItem.station, 'KITCHEN', 'Burger must be assigned to KITCHEN station');
    assert.strictEqual(drinkItem.station, 'BAR', 'Beverage must be assigned to BAR station');

    // Verify dining table status was updated to OCCUPIED
    const tableAfter = await prisma.restaurantTable.findUnique({ where: { id: testTableId } });
    assert.strictEqual(tableAfter?.status, 'OCCUPIED', 'Table must be set to OCCUPIED for dine-in POS sale');

    // Verify realtime events
    assert.ok(emittedOrderCreated, 'realtimeEmitter.orderCreated must be triggered');
    assert.ok(emittedOrderUpdated, 'realtimeEmitter.orderUpdated must be triggered');
    assert.ok(emittedTableUpdated, 'realtimeEmitter.tableUpdated must be triggered');

    // Restore emitters
    realtimeEmitter.orderCreated = originalOrderCreated;
    realtimeEmitter.orderUpdated = originalOrderUpdated;
    realtimeEmitter.tableUpdated = originalTableUpdated;

    console.log('  ✅ PASS: Manual Dine-In POS Sale settled and dispatched to KDS/BOT with correct stations.');
    passed++;
  } catch (e: any) {
    console.error('  ❌ FAIL Test 1:', e.message);
    failed++;
  }

  // Test 2: Manual Counter / Takeaway POS Sale
  try {
    console.log('📦 Test 2: Manual Counter POS Sale (Takeaway / no table selection)...');
    const counterSalePayload = {
      business_id: businessId,
      customer_name: 'Counter Guest',
      sale_type: 'TAKEAWAY' as const,
      payment_method: 'UPI_QR' as const,
      payment_status: 'PAID' as const,
      subtotal: 180,
      total_amount: 180,
      total_tax: 0,
      taxes: [],
      items: [
        {
          id: 'item-coffee-1',
          item_id: 'item-coffee-1',
          name: 'Hot Espresso Coffee',
          price: 180,
          unit_price: 180,
          quantity: 1,
          category: 'Coffee & Drinks',
        },
      ],
      source: 'POS_MANUAL',
      is_manual_pos: true,
      dispatch_kitchen: true,
    };

    const counterSale = await rbacService.createSale(businessId, counterSalePayload as any, { email: 'cashier@test.com' });
    assert.ok(counterSale.id, 'Counter sale record must have an ID');
    assert.ok(counterSale.order_id, 'Counter sale must have generated order_id');

    const counterOrder = await prisma.tableOrder.findUnique({
      where: { id: counterSale.order_id },
    });

    assert.ok(counterOrder, 'Counter order must exist in DB');
    assert.strictEqual(counterOrder.table_number, 'Counter', 'Counter order table_number should be Counter');
    assert.strictEqual(counterOrder.status, 'RECEIVED', 'Counter order status must be RECEIVED');
    assert.strictEqual(counterOrder.source, 'POS_MANUAL', 'Counter order source must be POS_MANUAL');

    console.log('  ✅ PASS: Manual Counter POS Sale successfully created and routed to counter KOT.');
    passed++;
  } catch (e: any) {
    console.error('  ❌ FAIL Test 2:', e.message);
    failed++;
  }

  // Test 3: Mark POS_MANUAL Order as Delivered
  try {
    console.log('📦 Test 3: Marking POS_MANUAL Order as Delivered transitions directly to COMPLETED...');
    
    // Create a manual POS sale on test table
    const sale = await rbacService.createSale(businessId, {
      business_id: businessId,
      table_id: testTableId,
      table_number: testTableNumber,
      customer_name: 'Delivery Test Guest',
      sale_type: 'DINE_IN' as const,
      payment_method: 'CASH' as const,
      subtotal: 300,
      total_amount: 300,
      taxes: [],
      total_tax: 0,
      items: [
        {
          id: 'dish-1',
          name: 'Steamed Veg MoMo',
          price: 300,
          quantity: 1,
        },
      ],
      source: 'POS_MANUAL',
    } as any, { email: 'cashier@test.com' });

    assert.ok(sale.order_id);
    const orderId = sale.order_id;

    // Delivery action (waiter or kitchen marks SERVED)
    const servedOrder = await rbacService.updateTableOrderStatus(businessId, orderId, 'SERVED');

    // Because pay_first is true on manual POS sales, marking SERVED auto-completes to COMPLETED
    assert.strictEqual(servedOrder.status, 'COMPLETED', 'Order status must become COMPLETED upon delivery');
    assert.ok(servedOrder.served_at, 'served_at timestamp must be recorded');

    // Check that table was released back to ACTIVE
    const tableFinal = await prisma.restaurantTable.findUnique({ where: { id: testTableId } });
    assert.strictEqual(tableFinal?.status, 'ACTIVE', 'Table must be reset to ACTIVE after delivery of pre-paid order');

    console.log('  ✅ PASS: Mark as Delivered auto-completes pay-first POS manual order and resets table.');
    passed++;
  } catch (e: any) {
    console.error('  ❌ FAIL Test 3:', e.message);
    failed++;
  }

  // Test 4: Safeguard Existing QR Table Order Settlement Flow
  try {
    console.log('📦 Test 4: Safeguarding Existing QR Table Order Settlement Flow...');
    
    // Create an ordinary QR table order
    const qrOrder = await rbacService.createTableOrder(businessId, {
      table_id: testTableId,
      table_number: testTableNumber,
      customer_name: 'QR Guest Seated',
      items: [
        {
          item_id: 'dish-qr-1',
          name: 'Pasta Alfredo',
          price: 450,
          currency: 'Rs.',
          quantity: 1,
        },
      ],
    });

    assert.ok(qrOrder.id, 'QR order must be created');
    assert.strictEqual(qrOrder.status, 'RECEIVED', 'QR order starts at RECEIVED');
    assert.strictEqual(qrOrder.pay_first, false, 'Standard QR order is not pay_first');

    // Step 2: Kitchen cooks & Waiter serves
    await rbacService.updateTableOrderStatus(businessId, qrOrder.id, 'PREPARING');
    await rbacService.updateTableOrderStatus(businessId, qrOrder.id, 'READY');
    await rbacService.updateTableOrderStatus(businessId, qrOrder.id, 'SERVED');

    // Step 3: Cashier settles the bill in POS (passing order_id)
    const settlementSale = await rbacService.createSale(businessId, {
      business_id: businessId,
      order_id: qrOrder.id,
      table_id: testTableId,
      table_number: testTableNumber,
      customer_name: 'QR Guest Seated',
      subtotal: 450,
      total_amount: 450,
      payment_method: 'CASH',
      payment_status: 'PAID',
      items: qrOrder.items as any,
      taxes: [],
      total_tax: 0,
    });

    assert.ok(settlementSale.id, 'Settlement sale recorded');
    
    // Check that the existing QR order is marked COMPLETED
    const completedQrOrder = await prisma.tableOrder.findUnique({ where: { id: qrOrder.id } });
    assert.strictEqual(completedQrOrder?.status, 'COMPLETED', 'Existing QR order must be marked COMPLETED');
    assert.strictEqual(completedQrOrder?.payment_status, 'PAID', 'QR order payment status must be PAID');

    console.log('  ✅ PASS: Existing QR table order settlement remains completely preserved and untouched.');
    passed++;
  } catch (e: any) {
    console.error('  ❌ FAIL Test 4:', e.message);
    failed++;
  }

  // Cleanup test table
  try {
    await prisma.restaurantTable.delete({ where: { id: testTableId } });
  } catch (e) {}

  server.close();

  console.log('\n========================================');
  console.log(`🏁 Manual POS Sales Suite Results: ${passed} Passed, ${failed} Failed`);
  console.log('========================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
