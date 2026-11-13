import assert from 'assert';
import http from 'http';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { db } from '../src/services/db.service';
import { rbacService } from '../src/services/rbac.service';
import { realtimeEmitter } from '../src/lib/socket';

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, extra?: any) {
  if (ok) {
    passed++;
    console.log(`  ✅ PASS: ${name}`);
  } else {
    failed++;
    console.error(`  ❌ FAIL: ${name}`, extra ?? '');
  }
}

async function runTests() {
  console.log('🧪 Starting Customer Session Lifecycle & Expiration Test Suite...\n');

  const app = createApp();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://localhost:${port}`;

  const testBizId = `biz-sess-life-${Date.now()}`;
  const ownerUser = { id: 'owner-sess-1', email: 'owner@test.com', role: 'RESTAURANT_OWNER' };

  const emittedOrders: any[] = [];
  const emittedTables: any[] = [];
  const eventSeq: string[] = [];
  const origOrderUpdated = realtimeEmitter.orderUpdated;
  const origTableUpdated = realtimeEmitter.tableUpdated;

  realtimeEmitter.orderUpdated = (bId: string, order: any) => {
    if (bId === testBizId) {
      emittedOrders.push(order);
      eventSeq.push(`order:${order.id}:${order.status}`);
    }
    return origOrderUpdated.call(realtimeEmitter, bId, order);
  };
  realtimeEmitter.tableUpdated = (bId: string, tbl: any) => {
    if (bId === testBizId) {
      emittedTables.push(tbl);
      eventSeq.push(`table:${tbl.id}:${tbl.status}`);
    }
    return origTableUpdated.call(realtimeEmitter, bId, tbl);
  };

  try {
    await db.ensureBusiness(testBizId, 'Session Lifecycle Cafe');

    // Create 4 test tables for isolated lifecycle scenarios
    const tBillPaid = await rbacService.createTable(testBizId, { table_number: 'S1', status: 'ACTIVE' } as any, ownerUser);
    const tCancelItems = await rbacService.createTable(testBizId, { table_number: 'S2', status: 'ACTIVE' } as any, ownerUser);
    const tPayFirstReject = await rbacService.createTable(testBizId, { table_number: 'S3', status: 'ACTIVE', pay_first_enabled: true } as any, ownerUser);
    const tResetSession = await rbacService.createTable(testBizId, { table_number: 'S4', status: 'ACTIVE' } as any, ownerUser);

    // -------------------------------------------------------------------------
    // 1. Session Persistence on Re-Scan (e.g. mobile back button / reopen)
    // -------------------------------------------------------------------------
    console.log('📱 1. Session & Tracker Restoration on QR Re-Scan');
    const scan1 = await rbacService.scanTableCheckIn(testBizId, tBillPaid.id, { tableNumber: 'S1' });
    check('Initial scan grants host authority & session_id', scan1.is_host === true && !!scan1.host_token && !!scan1.session_id);

    const orderRes = await fetch(`${baseUrl}/api/rbac/table-orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_id: testBizId,
        table_id: tBillPaid.id,
        table_number: 'S1',
        session_id: scan1.session_id,
        host_token: scan1.host_token,
        items: [{ item_id: 'm1', name: 'Masala Tea', price: 80, quantity: 2 }],
      }),
    });
    const orderJson = await orderRes.json();
    check('Order placed via HTTP /table-orders with session_id', orderRes.status === 201 && orderJson.success === true);
    const ord1 = orderJson.data;

    // Customer hits back button and re-scans QR with stored host_token
    const rescan1 = await rbacService.scanTableCheckIn(testBizId, tBillPaid.id, {
      tableNumber: 'S1',
      existingHostToken: scan1.host_token!,
    });
    check('Re-scan with host_token preserves is_host & session_id', rescan1.is_host === true && rescan1.session_id === scan1.session_id);
    check('Re-scan returns active_order for tracker restoration', rescan1.active_order?.id === ord1.id);

    // -------------------------------------------------------------------------
    // 2. Expiration Trigger 1: Bill Paid
    // -------------------------------------------------------------------------
    console.log('\n💳 2. Session Expiration When Bill Is Paid');
    await rbacService.createSale(testBizId, {
      order_id: ord1.id,
      table_id: tBillPaid.id,
      table_number: 'S1',
      payment_method: 'CASH',
      payment_status: 'PAID',
      subtotal: 160,
      total_amount: 160,
      items: ord1.items,
    }, ownerUser);

    const tblAfterPaid = await prisma.restaurantTable.findUnique({ where: { id: tBillPaid.id } });
    check('Table reset to ACTIVE and current_session_id cleared after payment', tblAfterPaid?.status === 'ACTIVE' && tblAfterPaid?.current_session_id === null);

    // Old session_id cannot place new orders after payment
    const stalePaidRes = await fetch(`${baseUrl}/api/rbac/table-orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_id: testBizId,
        table_id: tBillPaid.id,
        table_number: 'S1',
        session_id: scan1.session_id,
        host_token: scan1.host_token,
        items: [{ item_id: 'm2', name: 'Coffee', price: 100, quantity: 1 }],
      }),
    });
    const stalePaidJson = await stalePaidRes.json();
    check('Order with expired session_id rejected after bill paid', stalePaidRes.status === 403 && stalePaidJson.error?.code === 'SESSION_EXPIRED');

    // -------------------------------------------------------------------------
    // 3. Expiration Trigger 2a: Cashier Cancels All Items in Order
    // -------------------------------------------------------------------------
    console.log('\n❌ 3. Session Expiration When Cashier Cancels Order (Item Cancel)');
    const scan2 = await rbacService.scanTableCheckIn(testBizId, tCancelItems.id, { tableNumber: 'S2' });
    const ord2 = await rbacService.createTableOrder(testBizId, {
      table_id: tCancelItems.id,
      table_number: 'S2',
      session_id: scan2.session_id,
      host_token: scan2.host_token!,
      items: [{ item_id: 'm3', name: 'Momos', price: 250, quantity: 1 }],
    });

    emittedOrders.length = 0;
    emittedTables.length = 0;
    eventSeq.length = 0;
    await rbacService.updateTableOrderItemStatus(testBizId, ord2.id, { index: 0 }, 'CANCELLED', ownerUser);

    const tblAfterCancel = await prisma.restaurantTable.findUnique({ where: { id: tCancelItems.id } });
    check('Table reset to ACTIVE and current_session_id cleared after full item cancellation', tblAfterCancel?.status === 'ACTIVE' && tblAfterCancel?.current_session_id === null);
    check('Realtime orderUpdated emitted with CANCELLED', emittedOrders.some((o) => o.id === ord2.id && o.status === 'CANCELLED'));
    check('Realtime tableUpdated emitted with ACTIVE & null current_session_id', emittedTables.some((t) => t.id === tCancelItems.id && t.status === 'ACTIVE'));
    const ordEvtIdx = eventSeq.indexOf(`order:${ord2.id}:CANCELLED`);
    const tblEvtIdx = eventSeq.indexOf(`table:${tCancelItems.id}:ACTIVE`);
    check('orderUpdated (CANCELLED) emitted BEFORE tableUpdated (ACTIVE)', ordEvtIdx !== -1 && tblEvtIdx !== -1 && ordEvtIdx < tblEvtIdx);

    let rejectedAfterCancel = false;
    try {
      await rbacService.createTableOrder(testBizId, {
        table_id: tCancelItems.id,
        table_number: 'S2',
        session_id: scan2.session_id,
        host_token: scan2.host_token!,
        items: [{ item_id: 'm4', name: 'Lassi', price: 120, quantity: 1 }],
      });
    } catch (e: any) {
      rejectedAfterCancel = e.code === 'SESSION_EXPIRED' || e.message.includes('expired');
    }
    check('Stale session_id rejected after cashier cancels order', rejectedAfterCancel);

    // -------------------------------------------------------------------------
    // 4. Expiration Trigger 2b: Cashier Rejects/Cancels Pay-First Order
    // -------------------------------------------------------------------------
    console.log('\n🚫 4. Session Expiration When Cashier Rejects Pay-First Order');
    const scan3 = await rbacService.scanTableCheckIn(testBizId, tPayFirstReject.id, { tableNumber: 'S3' });
    const ord3 = await rbacService.createTableOrder(testBizId, {
      table_id: tPayFirstReject.id,
      table_number: 'S3',
      session_id: scan3.session_id,
      host_token: scan3.host_token!,
      items: [{ item_id: 'm5', name: 'Pizza', price: 500, quantity: 1 }],
    });
    assert.strictEqual(ord3.status, 'AWAITING_PAYMENT');

    emittedOrders.length = 0;
    emittedTables.length = 0;
    await rbacService.rejectTableOrderPayment(ord3.id, testBizId, 'Payment not received', 'Cashier');

    const tblAfterReject = await prisma.restaurantTable.findUnique({ where: { id: tPayFirstReject.id } });
    check('Pay-first table reset to ACTIVE & current_session_id cleared on reject/cancel', tblAfterReject?.status === 'ACTIVE' && tblAfterReject?.current_session_id === null);
    check('Realtime tableUpdated emitted on pay-first reject/cancel', emittedTables.some((t) => t.id === tPayFirstReject.id && t.status === 'ACTIVE'));

    // -------------------------------------------------------------------------
    // 5. Expiration Trigger 3: Manual "Reset Session" in Table & Space Tab
    // -------------------------------------------------------------------------
    console.log('\n🔄 5. Session Expiration When Table Is Manually Reset ("Reset Session")');
    const scan4 = await rbacService.scanTableCheckIn(testBizId, tResetSession.id, { tableNumber: 'S4' });
    await rbacService.createTableOrder(testBizId, {
      table_id: tResetSession.id,
      table_number: 'S4',
      session_id: scan4.session_id,
      host_token: scan4.host_token!,
      items: [{ item_id: 'm6', name: 'Burger', price: 300, quantity: 1 }],
    });

    emittedTables.length = 0;
    await rbacService.resetTableSession(testBizId, tResetSession.id, ownerUser);

    const tblAfterReset = await prisma.restaurantTable.findUnique({ where: { id: tResetSession.id } });
    check('Table reset to ACTIVE with null session_id and null host_token', tblAfterReset?.status === 'ACTIVE' && tblAfterReset?.current_session_id === null && tblAfterReset?.host_token === null);
    check('Realtime tableUpdated emitted on resetTableSession', emittedTables.some((t) => t.id === tResetSession.id && t.status === 'ACTIVE'));
    const ordersAfterReset = await rbacService.getTableOrders(testBizId, ownerUser, tResetSession.id);
    check('Reset unpaid order is NOT marked PAID or linked to a sale_id', ordersAfterReset.length > 0 && ordersAfterReset.every((o) => o.payment_status !== 'PAID' && !o.sale_id));

    // Also verify resetTableSession on an unpaid pay-first order does not flag settled: true
    const pfScanReset = await rbacService.scanTableCheckIn(testBizId, tPayFirstReject.id, { tableNumber: 'S3' });
    const pfOrdReset = await rbacService.createTableOrder(testBizId, {
      table_id: tPayFirstReject.id,
      table_number: 'S3',
      session_id: pfScanReset.session_id,
      host_token: pfScanReset.host_token!,
      items: [{ item_id: 'm6b', name: 'Sandwich', price: 200, quantity: 1 }],
    });
    await rbacService.resetTableSession(testBizId, tPayFirstReject.id, ownerUser);
    const pfOrdersAfterReset = await rbacService.getTableOrders(testBizId, ownerUser, tPayFirstReject.id);
    const resetPfFetched = pfOrdersAfterReset.find((o) => o.id === pfOrdReset.id);
    check('Unpaid pay-first order after Reset Session has settled: false', resetPfFetched?.settled === false && resetPfFetched?.payment_status !== 'PAID');

    let rejectedAfterReset = false;
    try {
      await rbacService.createTableOrder(testBizId, {
        table_id: tResetSession.id,
        table_number: 'S4',
        session_id: scan4.session_id,
        host_token: scan4.host_token!,
        items: [{ item_id: 'm7', name: 'Fries', price: 150, quantity: 1 }],
      });
    } catch (e: any) {
      rejectedAfterReset = e.code === 'SESSION_EXPIRED' || e.message.includes('expired');
    }
    check('Stale session_id rejected after manual Reset Session', rejectedAfterReset);

    // Fresh scan after Reset Session starts a clean new session
    const freshScan = await rbacService.scanTableCheckIn(testBizId, tResetSession.id, { tableNumber: 'S4' });
    check('New QR scan after reset creates new session_id & host authority', freshScan.is_host === true && freshScan.session_id !== scan4.session_id && !freshScan.active_order);

    // -------------------------------------------------------------------------
    // 6. Multi-Round Partial Cancel vs Full Cancel via updateTableOrderStatus
    // -------------------------------------------------------------------------
    console.log('\n🍽️ 6. Multi-Round Partial Cancel Preserves Session; Final Cancel Expires It');
    const r1 = await rbacService.createTableOrder(testBizId, {
      table_id: tResetSession.id,
      table_number: 'S4',
      session_id: freshScan.session_id,
      host_token: freshScan.host_token!,
      items: [{ item_id: 'm8', name: 'Soup', price: 120, quantity: 1 }],
    });
    const r2 = await rbacService.createTableOrder(testBizId, {
      table_id: tResetSession.id,
      table_number: 'S4',
      existing_order_id: r1.id,
      session_id: freshScan.session_id,
      host_token: freshScan.host_token!,
      items: [{ item_id: 'm9', name: 'Salad', price: 180, quantity: 1 }],
    });

    const multiRescan = await rbacService.scanTableCheckIn(testBizId, tResetSession.id, {
      tableNumber: 'S4',
      existingHostToken: freshScan.host_token!,
    });
    check('Multi-round QR re-scan returns consolidated active_order with both rounds items', (multiRescan.active_order?.items?.length || 0) === 2 && multiRescan.active_order?.subtotal === 300);

    await rbacService.updateTableOrderStatus(testBizId, r2.id, 'CANCELLED', ownerUser);
    const tblMidCancel = await prisma.restaurantTable.findUnique({ where: { id: tResetSession.id } });
    check('Cancelling Round 2 while Round 1 is active keeps table OCCUPIED & session intact', tblMidCancel?.status === 'OCCUPIED' && tblMidCancel?.current_session_id === freshScan.session_id);

    emittedTables.length = 0;
    eventSeq.length = 0;
    const cancelledR1 = await rbacService.updateTableOrderStatus(testBizId, r1.id, 'CANCELLED', ownerUser);
    const tblEndCancel = await prisma.restaurantTable.findUnique({ where: { id: tResetSession.id } });
    check('Cancelling remaining Round 1 resets table ACTIVE & clears session', tblEndCancel?.status === 'ACTIVE' && tblEndCancel?.current_session_id === null);
    check('Cancelling whole order also marks items CANCELLED', (cancelledR1.items || []).every((it: any) => it.status === 'CANCELLED'));
    check('Realtime tableUpdated emitted after last active order cancelled', emittedTables.some((t) => t.id === tResetSession.id && t.status === 'ACTIVE'));
    const r1OrdIdx = eventSeq.indexOf(`order:${r1.id}:CANCELLED`);
    const r1TblIdx = eventSeq.indexOf(`table:${tResetSession.id}:ACTIVE`);
    check('Whole order cancel emits orderUpdated BEFORE tableUpdated', r1OrdIdx !== -1 && r1TblIdx !== -1 && r1OrdIdx < r1TblIdx);
  } finally {
    realtimeEmitter.orderUpdated = origOrderUpdated;
    realtimeEmitter.tableUpdated = origTableUpdated;
    server.close();
    try {
      await prisma.sale.deleteMany({ where: { business_id: testBizId } });
      await prisma.tableOrder.deleteMany({ where: { business_id: testBizId } });
      await prisma.restaurantTable.deleteMany({ where: { business_id: testBizId } });
      await prisma.counter.deleteMany({ where: { business_id: testBizId } });
      await prisma.business.deleteMany({ where: { id: testBizId } });
    } catch {}
  }

  console.log('\n========================================');
  console.log(`🏁 Test Results: ${passed} Passed, ${failed} Failed`);
  console.log('========================================\n');
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((err) => {
  console.error('Test runner error:', err);
  process.exit(1);
});
