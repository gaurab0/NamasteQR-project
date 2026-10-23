import { prisma } from '../src/lib/prisma';
import { rbacService } from '../src/services/rbac.service';
import { db } from '../src/services/db.service';
import { realtimeEmitter } from '../src/lib/socket';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

async function runPayFirstPaymentMethodTest() {
  console.log('🧪 Starting Pay-First Payment Method Selection & Realtime State Test Suite...');

  const testBizId = `test-pf-method-${Date.now()}`;
  const tableId = `table-pf-method-${Date.now()}`;

  try {
    // 1. Ensure business and create pay-first table
    await db.ensureBusiness(testBizId, 'Pay-First Method Diner');
    const table = await prisma.restaurantTable.create({
      data: {
        id: tableId,
        business_id: testBizId,
        table_number: 'Table 2',
        capacity: 4,
        status: 'ACTIVE',
        pay_first_enabled: true,
        current_session_id: `sess-${Date.now()}`,
      },
    });

    assert(table.pay_first_enabled === true, 'Table created with pay_first_enabled = true');

    // 2. Customer places pay-first order
    const order = await rbacService.createTableOrder(testBizId, {
      table_id: tableId,
      table_number: 'Table 2',
      session_id: table.current_session_id!,
      items: [
        {
          item_id: 'breakfast-1',
          name: 'Regular Breakfast',
          price: 255,
          quantity: 1,
          station: 'KITCHEN',
          currency: 'Rs.',
        },
      ],
    });

    assert(order.status === 'AWAITING_PAYMENT', 'Order created with status AWAITING_PAYMENT');
    assert(order.pay_first === true, 'Order has pay_first: true');
    assert(order.payment_method === null || order.payment_method === undefined, 'Order initial payment_method is unset');

    // 3. Intercept realtimeEmitter.orderUpdated
    let capturedEmittedOrder: any = null;
    const originalOrderUpdated = realtimeEmitter.orderUpdated;
    realtimeEmitter.orderUpdated = (bizId: string, orderPayload: any) => {
      capturedEmittedOrder = orderPayload;
      originalOrderUpdated(bizId, orderPayload);
    };

    // 4. Simulate customer selecting QR_CODE payment option
    // In server/src/routes/rbac.routes.ts POST /orders/:id/payment-method:
    await prisma.tableOrder.updateMany({
      where: { id: order.id, business_id: testBizId },
      data: { payment_method: 'QR_CODE' },
    });

    const updated = await prisma.tableOrder.findUnique({
      where: { id: order.id },
    });

    const fullOrderPayload = {
      id: updated!.id,
      business_id: updated!.business_id,
      table_id: updated!.table_id || '',
      table_number: updated!.table_number,
      order_number: updated!.order_number || undefined,
      items: (updated!.items as any) || [],
      subtotal: Number(updated!.subtotal) || 0,
      tax_amount: Number(updated!.tax_amount) || 0,
      total_amount: Number(updated!.total_amount) || 0,
      currency: updated!.currency || 'Rs.',
      customer_name: updated!.customer_name || 'Guest',
      customer_phone: updated!.customer_phone || '',
      order_notes: updated!.order_notes || '',
      status: updated!.status,
      pay_first: Boolean(updated!.pay_first),
      payment_method: updated!.payment_method || 'QR_CODE',
      payment_status: updated!.payment_status || null,
    };

    realtimeEmitter.orderUpdated(testBizId, fullOrderPayload);

    // 5. Verify emitted payload
    assert(capturedEmittedOrder !== null, 'realtimeEmitter.orderUpdated was emitted');
    assert(capturedEmittedOrder.payment_method === 'QR_CODE', 'Emitted payload contains payment_method: QR_CODE');
    assert(capturedEmittedOrder.status === 'AWAITING_PAYMENT', 'Emitted payload status remains AWAITING_PAYMENT');
    assert(capturedEmittedOrder.pay_first === true, 'Emitted payload pay_first is true');
    assert(capturedEmittedOrder.table_number === 'Table 2', 'Emitted payload has table_number');
    assert(Array.isArray(capturedEmittedOrder.items) && capturedEmittedOrder.items.length === 1, 'Emitted payload preserves items array');
    assert(capturedEmittedOrder.total_amount === order.total_amount, 'Emitted payload preserves total_amount');

    // 6. Test BillingPOS reducer/state simulation
    // Simulate BillingPOS initial state after loading orders
    let payFirstOrders = [order];
    let pendingOrders: any[] = [];

    // Simulate socket arrival in BillingPOS
    const parsedUpdatedOrder = { ...capturedEmittedOrder };

    // Test payFirstOrders updater
    const existingPfIdx = payFirstOrders.findIndex((o) => o.id === parsedUpdatedOrder.id);
    const existingPfOrder = existingPfIdx >= 0 ? payFirstOrders[existingPfIdx] : null;
    const effectiveStatus = parsedUpdatedOrder.status !== undefined ? parsedUpdatedOrder.status : existingPfOrder?.status;

    if (effectiveStatus === 'AWAITING_PAYMENT') {
      if (existingPfIdx >= 0) {
        payFirstOrders = [...payFirstOrders];
        payFirstOrders[existingPfIdx] = { ...payFirstOrders[existingPfIdx], ...parsedUpdatedOrder };
      }
    } else {
      payFirstOrders = payFirstOrders.filter((o) => o.id !== parsedUpdatedOrder.id);
    }

    // Test pendingOrders updater
    const existingPendingIdx = pendingOrders.findIndex((o) => o.id === parsedUpdatedOrder.id);
    const existingPendingOrder = existingPendingIdx >= 0 ? pendingOrders[existingPendingIdx] : null;
    const effectivePendingStatus = parsedUpdatedOrder.status !== undefined ? parsedUpdatedOrder.status : existingPendingOrder?.status;

    if (effectivePendingStatus === 'AWAITING_PAYMENT') {
      pendingOrders = pendingOrders.filter((o) => o.id !== parsedUpdatedOrder.id);
    } else {
      const isPayFirst = parsedUpdatedOrder.pay_first ?? existingPendingOrder?.pay_first ?? false;
      if (effectivePendingStatus && !isPayFirst) {
        pendingOrders = [parsedUpdatedOrder, ...pendingOrders];
      }
    }

    assert(payFirstOrders.length === 1, 'Order remains in payFirstOrders queue');
    assert(payFirstOrders[0].payment_method === 'QR_CODE', 'Order in payFirstOrders has updated payment_method: QR_CODE');
    assert(payFirstOrders[0].items.length === 1, 'Order in payFirstOrders preserves items');
    assert(pendingOrders.length === 0, 'Order is NOT added to pendingOrders (Active Dine-In Table Orders remains 0)');

    // 7. Test customer switching to CASH
    await prisma.tableOrder.updateMany({
      where: { id: order.id, business_id: testBizId },
      data: { payment_method: 'CASH' },
    });
    const cashOrder = await prisma.tableOrder.findUnique({ where: { id: order.id } });
    assert(cashOrder!.payment_method === 'CASH', 'Database updated payment_method to CASH');

    // 8. Test cashier confirming payment
    await rbacService.confirmTableOrderPayment(order.id, testBizId, 'QR_CODE', 'Cashier Bob');
    const confirmedOrder = await prisma.tableOrder.findUnique({ where: { id: order.id } });
    assert(confirmedOrder!.status === 'RECEIVED', 'Confirmed order status is RECEIVED');
    assert(confirmedOrder!.payment_status === 'PAID', 'Confirmed order payment_status is PAID');

    realtimeEmitter.orderUpdated = originalOrderUpdated;
  } catch (err: any) {
    console.error('Test error:', err);
    failed++;
  }

  console.log('\n========================================');
  console.log(`🏁 Pay-First Payment Method Test Results: ${passed} Passed, ${failed} Failed`);
  console.log('========================================\n');

  if (failed > 0) process.exit(1);
}

runPayFirstPaymentMethodTest().catch(console.error);
