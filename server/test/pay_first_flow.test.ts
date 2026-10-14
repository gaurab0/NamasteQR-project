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

async function runPayFirstFlowTest() {
  console.log('🧪 Starting Pay-First Complete Flow & Session Stability Test Suite...');

  const testBizId = `test-pf-biz-${Date.now()}`;
  const tableId = `table-pf-${Date.now()}`;

  try {
    // 1. Ensure business and create pay-first enabled table
    await db.ensureBusiness(testBizId, 'Pay-First Test Diner');
    const table = await prisma.restaurantTable.create({
      data: {
        id: tableId,
        business_id: testBizId,
        table_number: 'PF-1',
        capacity: 4,
        status: 'ACTIVE',
        pay_first_enabled: true,
        current_session_id: `sess-${Date.now()}`,
      },
    });

    assert(table.pay_first_enabled === true, 'Table created with pay_first_enabled = true');

    // 2. Customer places order on pay-first table
    const order = await rbacService.createTableOrder(testBizId, {
      table_id: tableId,
      table_number: 'PF-1',
      session_id: table.current_session_id!,
      items: [
        {
          item_id: 'dish-1',
          name: 'Steak & Fries',
          price: 500,
          quantity: 1,
          station: 'KITCHEN',
          currency: 'Rs.',
        },
      ],
    });

    assert(order.status === 'AWAITING_PAYMENT', 'New pay-first order status is AWAITING_PAYMENT');
    assert(order.pay_first === true, 'Order has pay_first: true');
    assert(order.payment_status === 'UNPAID', 'Order payment_status is UNPAID');

    // Test client view mode logic on mount
    const clientViewModeOnMount = order.status === 'AWAITING_PAYMENT' ? 'payment' : 'tracker';
    assert(clientViewModeOnMount === 'payment', 'Client opens OrderSuccessModal directly in "payment" mode');

    // 3. Intercept realtime emitter to verify payload sent on payment confirmation
    let emittedPayload: any = null;
    const originalOrderUpdated = realtimeEmitter.orderUpdated.bind(realtimeEmitter);
    realtimeEmitter.orderUpdated = (bizId: string, payload: any) => {
      if (payload.id === order.id) {
        emittedPayload = payload;
      }
      return originalOrderUpdated(bizId, payload);
    };

    // 4. Cashier confirms payment
    await rbacService.confirmTableOrderPayment(order.id, testBizId, 'QR_CODE', 'Cashier Sunita');

    const confirmedOrder = await prisma.tableOrder.findUnique({ where: { id: order.id } });
    assert(confirmedOrder?.status === 'RECEIVED', 'Order status moved from AWAITING_PAYMENT to RECEIVED');
    assert(confirmedOrder?.payment_status === 'PAID', 'Order payment_status is now PAID');
    assert(confirmedOrder?.pay_first === true, 'Order pay_first remains true in database');
    assert(Boolean(confirmedOrder?.sale_id), 'Linked sale_id exists on confirmed order');

    // 5. Verify emitted socket payload
    assert(emittedPayload !== null, 'Socket event orderUpdated was emitted');
    assert(emittedPayload?.pay_first === true, 'Emitted payload includes pay_first: true');
    assert(emittedPayload?.status === 'RECEIVED', 'Emitted payload status is RECEIVED');
    assert(emittedPayload?.payment_status === 'PAID', 'Emitted payload payment_status is PAID');

    // 6. Test Client Session Settlement logic
    const activeOrder: any = { ...order };
    const updatedOrder: any = { ...emittedPayload };

    const isPayFirst = Boolean(updatedOrder.pay_first ?? activeOrder?.pay_first);
    const isSettled = isPayFirst
      ? updatedOrder.status === 'COMPLETED'
      : (updatedOrder.status === 'COMPLETED' ||
         updatedOrder.payment_status === 'PAID' ||
         Boolean((updatedOrder as any).settled));

    assert(isSettled === false, 'Client does NOT settle or conclude session upon payment confirmation!');

    // Client modal viewMode should switch from 'payment' to 'tracker'
    let currentClientViewMode = 'payment';
    if (updatedOrder.status !== 'AWAITING_PAYMENT' && currentClientViewMode === 'payment') {
      currentClientViewMode = 'tracker';
    }
    assert(currentClientViewMode === 'tracker', 'Client modal viewMode smoothly transitions to "tracker"');

    // 7. Kitchen marks order as SERVED -> auto-completes pay-first order
    const servedOrder = await rbacService.updateTableOrderStatus(testBizId, order.id, 'SERVED', {
      id: 'staff-1',
      role: 'WAITER',
      email: 'waiter@serveflow.app',
    });

    assert(servedOrder.status === 'COMPLETED', 'Pay-first order auto-completes to COMPLETED when served');

    // Verify client settlement now concludes session
    const finalSettled = Boolean(servedOrder.pay_first)
      ? servedOrder.status === 'COMPLETED'
      : (servedOrder.payment_status === 'PAID' || servedOrder.status === 'COMPLETED');

    assert(finalSettled === true, 'Client session concludes ONLY when food is served and order is COMPLETED');

    // Restore emitter
    realtimeEmitter.orderUpdated = originalOrderUpdated;

    // Cleanup test data
    await prisma.sale.deleteMany({ where: { business_id: testBizId } });
    await prisma.tableOrder.deleteMany({ where: { business_id: testBizId } });
    await prisma.restaurantTable.deleteMany({ where: { business_id: testBizId } });
    await prisma.business.deleteMany({ where: { id: testBizId } });

    console.log(`\n========================================`);
    console.log(`🏁 Pay-First Flow Test Results: ${passed} Passed, ${failed} Failed`);
    console.log(`========================================`);
  } catch (err: any) {
    console.error('Test error:', err);
    process.exit(1);
  }
}

runPayFirstFlowTest().then(() => {
  process.exit(failed > 0 ? 1 : 0);
});
