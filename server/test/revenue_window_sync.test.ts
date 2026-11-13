import assert from 'assert';
import http from 'http';
import axios from 'axios';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { db } from '../src/services/db.service';
import { generateToken } from '../src/middleware/auth.middleware';
import { getActiveRevenueWindow, isSaleInRevenueWindow } from '../../src/utils/revenueWindow';
import { evaluateStoreStatusDetailed } from '../../src/utils/operationalDay';

async function runTest() {
  console.log('🧪 Starting Synchronized Revenue Reset & Closed-Day Order Guard Test Suite...');

  // ---------------------------------------------------------------------------
  // PART 1: Pure Revenue Window & Rollover Unit Tests
  // ---------------------------------------------------------------------------
  console.log('\n📋 1. Testing Revenue Window Boundaries (UTC+05:45 & Configurable Reset Time)');
  const nepalConfigDefault = {
    enabled: false,
    openTime: '09:00',
    closeTime: '23:00',
    autoDateAdvance: true,
    dailyResetTime: '00:00',
    timezoneOffsetMinutes: -345, // UTC+05:45
  };

  // 2026-11-12 23:59:59.500+05:45 === 2026-11-12T18:14:59.500Z
  const beforeMidnight = new Date('2026-11-12T18:14:59.500Z');
  const winBefore = getActiveRevenueWindow(nepalConfigDefault, beforeMidnight);
  assert.strictEqual(winBefore.businessDate, '2026-11-12', 'Just before local midnight stays on Nov 12');

  // 2026-11-13 00:00:00.500+05:45 === 2026-11-12T18:15:00.500Z
  const afterMidnight = new Date('2026-11-12T18:15:00.500Z');
  const winAfter = getActiveRevenueWindow(nepalConfigDefault, afterMidnight);
  assert.strictEqual(winAfter.businessDate, '2026-11-13', 'Just after local midnight flips to Nov 13');
  assert.strictEqual(winBefore.endMs, winAfter.startMs, 'Contiguous rollover boundary with zero gap/overlap');

  // Sale made at 2026-11-12 23:55+05:45 is inside winBefore, NOT inside winAfter
  const lateSale = { created_at: '2026-11-12T18:10:00.000Z', date_string: '2026-11-12' };
  assert.strictEqual(isSaleInRevenueWindow(lateSale, winBefore), true);
  assert.strictEqual(isSaleInRevenueWindow(lateSale, winAfter), false, 'Late sale resets out at exact midnight');

  // Custom dailyResetTime = 04:00 AM (+05:45)
  const lateNightConfig = { ...nepalConfigDefault, dailyResetTime: '04:00' };
  // 2026-11-13 02:15:00+05:45 === 2026-11-12T20:30:00.000Z
  const twoFifteenAm = new Date('2026-11-12T20:30:00.000Z');
  const winTwoFifteen = getActiveRevenueWindow(lateNightConfig, twoFifteenAm);
  assert.strictEqual(winTwoFifteen.businessDate, '2026-11-12', '02:15 AM before 04:00 reset belongs to Nov 12 shift');

  // 2026-11-13 04:00:00.500+05:45 === 2026-11-12T22:15:00.500Z
  const fourAmRollover = new Date('2026-11-12T22:15:00.500Z');
  const winFourAm = getActiveRevenueWindow(lateNightConfig, fourAmRollover);
  assert.strictEqual(winFourAm.businessDate, '2026-11-13', '04:00 AM triggers rollover to Nov 13');
  assert.strictEqual(isSaleInRevenueWindow({ created_at: twoFifteenAm.toISOString(), date_string: '2026-11-12' }, winTwoFifteen), true);
  assert.strictEqual(isSaleInRevenueWindow({ created_at: twoFifteenAm.toISOString(), date_string: '2026-11-12' }, winFourAm), false);
  console.log('  ✅ PASS: Default midnight and custom 04:00 AM rollover boundaries verified');

  // ---------------------------------------------------------------------------
  // PART 2: Store Status Evaluation Unit Tests
  // ---------------------------------------------------------------------------
  console.log('\n📋 2. Testing Store Open/Closed Evaluation Rules');
  assert.strictEqual(evaluateStoreStatusDetailed(null, null).isOpen, true, 'Unconfigured business defaults open');
  assert.strictEqual(
    evaluateStoreStatusDetailed(lateNightConfig, null).isOpen,
    true,
    'Saving dailyResetTime with enabled=false & no day record does not lock store'
  );
  const closedCheck = evaluateStoreStatusDetailed(nepalConfigDefault, { businessDate: '2026-11-12', status: 'CLOSED' });
  assert.strictEqual(closedCheck.isOpen, false);
  assert.strictEqual(closedCheck.code, 'DAY_CLOSED');
  assert.strictEqual(
    evaluateStoreStatusDetailed(nepalConfigDefault, { businessDate: '2026-11-12', status: 'REOPENED' }).isOpen,
    true
  );

  // Night shift auto-schedule 18:00 -> 02:00 (+05:45)
  const nightSchedule = { ...nepalConfigDefault, enabled: true, openTime: '18:00', closeTime: '02:00' };
  // 01:00 AM +05:45 === 19:15 UTC prev day -> OPEN
  assert.strictEqual(evaluateStoreStatusDetailed(nightSchedule, null, new Date('2026-11-12T19:15:00.000Z')).isOpen, true);
  // 03:00 AM +05:45 === 21:15 UTC prev day -> CLOSED
  const outsideNight = evaluateStoreStatusDetailed(nightSchedule, null, new Date('2026-11-12T21:15:00.000Z'));
  assert.strictEqual(outsideNight.isOpen, false);
  assert.strictEqual(outsideNight.code, 'OUTSIDE_HOURS');
  console.log('  ✅ PASS: Manual close/reopen & auto-schedule night shift rules verified');

  // ---------------------------------------------------------------------------
  // PART 3: Live Express + PostgreSQL Integration Tests
  // ---------------------------------------------------------------------------
  console.log('\n💾 3. Testing Live Timestamp Sales Queries & Closed-Day Order Blocking');
  const app = createApp();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://localhost:${port}/api/rbac`;

  const testBizId = 'test-rev-sync-' + Date.now();
  const ownerEmail = `owner_${Date.now()}@sync.test`;
  const cashierAEmail = `cashierA_${Date.now()}@sync.test`;

  try {
    await db.ensureBusiness(testBizId, 'Revenue Sync Restaurant', 'RESTAURANT');
    const ownerUser = await db.ensureUser({
      id: `usr-owner-${Date.now()}`,
      business_id: testBizId,
      email: ownerEmail,
      role: 'RESTAURANT_OWNER',
      name: 'Sync Owner',
    });
    const cashierA = await db.ensureUser({
      id: `usr-cashier-${Date.now()}`,
      business_id: testBizId,
      email: cashierAEmail,
      role: 'CASHIER',
      name: 'Cashier A',
    });

    const ownerHeaders = {
      Authorization: `Bearer ${generateToken({ userId: ownerUser.id, email: ownerEmail, role: 'RESTAURANT_OWNER', businessId: testBizId })}`,
    };
    const cashierHeaders = {
      Authorization: `Bearer ${generateToken({ userId: cashierA.id, email: cashierAEmail, role: 'CASHIER', businessId: testBizId })}`,
    };

    // Seed table + menu item for valid order tests
    const tableId = `tbl-${Date.now()}`;
    await prisma.restaurantTable.create({
      data: { id: tableId, business_id: testBizId, table_number: 'T-10', status: 'ACTIVE', capacity: 4 },
    });
    await prisma.menuItem.create({
      data: { id: `menu-${Date.now()}`, business_id: testBizId, name: 'Masala Tea', category: 'Drinks', price: 100, is_available: true, status: 'available' },
    });

    // Save configurable reset time
    const localOffset = new Date().getTimezoneOffset();
    const cfgRes = await axios.put(
      `${baseUrl}/businesses/${testBizId}/operations/config`,
      {
        config: {
          enabled: false,
          openTime: '08:00',
          closeTime: '23:00',
          autoDateAdvance: true,
          dailyResetTime: '00:00',
          timezoneOffsetMinutes: localOffset,
        },
      },
      { headers: ownerHeaders }
    );
    assert.strictEqual(cfgRes.data.success, true);

    // Start operational day OPEN
    const activeWin = getActiveRevenueWindow({ enabled: false, openTime: '08:00', closeTime: '23:00', autoDateAdvance: true, dailyResetTime: '00:00', timezoneOffsetMinutes: localOffset });
    const dayCreateRes = await axios.post(
      `${baseUrl}/businesses/${testBizId}/operations/days`,
      {
        businessDate: activeWin.businessDate,
        status: 'OPEN',
        openedAt: new Date().toISOString(),
        openedBy: ownerUser.id,
      },
      { headers: ownerHeaders }
    );
    const createdDayId = dayCreateRes.data.data.id;
    assert(createdDayId, 'Operational day created');

    // Place a customer table order while OPEN
    const openOrderRes = await axios.post(`${baseUrl}/orders`, {
      businessId: testBizId,
      table_id: tableId,
      table_number: 'T-10',
      items: [{ name: 'Masala Tea', price: 100, quantity: 2 }],
    });
    assert.strictEqual(openOrderRes.status, 201, 'Order allowed while business day is OPEN');
    const preExistingOrderId = openOrderRes.data.data.id;

    // Seed one older pre-cutoff sale directly in Prisma (same UTC day string edge case check, created 2h before window start)
    await prisma.sale.create({
      data: {
        id: `sale-old-${Date.now()}`,
        invoice_number: 'INV-OLD-1',
        business_id: testBizId,
        customer_name: 'Old Guest',
        sale_type: 'DINE_IN',
        items: [],
        subtotal: 500,
        taxes: [],
        total_tax: 0,
        total_amount: 500,
        payment_method: 'CASH',
        cashier_id: cashierA.id,
        cashier_name: 'Cashier A',
        date_string: activeWin.businessDate,
        created_at: new Date(activeWin.startMs - 2 * 60 * 60 * 1000),
      },
    });

    // Create a counter POS sale right now as Cashier A
    const nowSaleRes = await axios.post(
      `${baseUrl}/sales?businessId=${testBizId}`,
      {
        customer_name: 'Counter Guest',
        sale_type: 'TAKEAWAY',
        items: [{ name: 'Masala Tea', price: 100, quantity: 1 }],
        subtotal: 100,
        total_tax: 0,
        total_amount: 100,
        payment_method: 'CASH',
        cashier_id: cashierA.id,
        cashier_name: 'Cashier A',
      },
      { headers: cashierHeaders }
    );
    assert.strictEqual(nowSaleRes.status, 201);
    assert.strictEqual(nowSaleRes.data.data.date_string, activeWin.businessDate, 'Sale stamped with venue local businessDate');

    // Dashboard timestamp query MUST exclude pre-cutoff sale even if date_string matches!
    const dashSalesRes = await axios.get(
      `${baseUrl}/sales?businessId=${testBizId}&startDate=${encodeURIComponent(activeWin.startIso)}&endDate=${encodeURIComponent(activeWin.endIso)}`,
      { headers: ownerHeaders }
    );
    assert.strictEqual(dashSalesRes.data.data.length, 1, 'Timestamp filter excludes pre-window sale cleanly');
    assert.strictEqual(dashSalesRes.data.data[0].total_amount, 100);
    console.log('  ✅ PASS: Timestamp window query & venue businessDate stamping verified');

    // Close the Business Day -> orders must be blocked (403 STORE_CLOSED)
    await axios.put(
      `${baseUrl}/businesses/${testBizId}/operations/days/${createdDayId}`,
      {
        id: createdDayId,
        businessDate: activeWin.businessDate,
        status: 'CLOSED',
        closedAt: new Date().toISOString(),
        closedBy: ownerUser.id,
      },
      { headers: ownerHeaders }
    );

    const expectStoreClosed = async (fn: () => Promise<any>, label: string) => {
      let caught403 = false;
      try {
        await fn();
      } catch (err: any) {
        if (err.response?.status === 403 && err.response?.data?.error?.code === 'STORE_CLOSED') {
          caught403 = true;
        }
      }
      assert(caught403, `${label} must reject with HTTP 403 STORE_CLOSED when business day is closed`);
    };

    await expectStoreClosed(
      () => axios.post(`${baseUrl}/orders`, { businessId: testBizId, table_id: tableId, table_number: 'T-10', items: [{ name: 'Masala Tea', price: 100, quantity: 1 }] }),
      'POST /api/rbac/orders'
    );
    await expectStoreClosed(
      () => axios.post(`${baseUrl}/table-orders`, { businessId: testBizId, table_id: tableId, table_number: 'T-10', items: [{ name: 'Masala Tea', price: 100, quantity: 1 }] }),
      'POST /api/rbac/table-orders'
    );
    await expectStoreClosed(
      () => axios.post(`${baseUrl}/sales?businessId=${testBizId}`, {
        customer_name: 'Walk-in',
        sale_type: 'TAKEAWAY',
        items: [{ name: 'Masala Tea', price: 100, quantity: 1 }],
        subtotal: 100,
        total_amount: 100,
        payment_method: 'CASH',
      }, { headers: cashierHeaders }),
      'New Counter POS POST /api/rbac/sales'
    );

    // Pre-existing open table order CAN still be settled during closing
    const settleExistingRes = await axios.post(
      `${baseUrl}/sales?businessId=${testBizId}`,
      {
        order_id: preExistingOrderId,
        table_id: tableId,
        table_number: 'T-10',
        customer_name: 'Existing Table Guest',
        sale_type: 'DINE_IN',
        items: [{ name: 'Masala Tea', price: 100, quantity: 2 }],
        subtotal: 200,
        total_tax: 0,
        total_amount: 200,
        payment_method: 'CARD',
      },
      { headers: cashierHeaders }
    );
    assert.strictEqual(settleExistingRes.status, 201, 'Settling already-placed table bill remains allowed when closing');

    // Reopen Day -> new orders allowed again
    await axios.put(
      `${baseUrl}/businesses/${testBizId}/operations/days/${createdDayId}`,
      {
        id: createdDayId,
        businessDate: activeWin.businessDate,
        status: 'REOPENED',
        reopenedAt: new Date().toISOString(),
        reopenedBy: ownerUser.id,
        reopenReason: 'Late group arrived',
      },
      { headers: ownerHeaders }
    );
    const reopenOrderRes = await axios.post(`${baseUrl}/orders`, {
      businessId: testBizId,
      table_id: tableId,
      table_number: 'T-10',
      items: [{ name: 'Masala Tea', price: 100, quantity: 1 }],
    });
    assert.strictEqual(reopenOrderRes.status, 201, 'Orders allowed again after day reopened');
    console.log('  ✅ PASS: Closed-day blocking (/orders, /table-orders, new /sales) + open-tab settlement exception verified');

    console.log('\n========================================');
    console.log('🎉 ALL TESTS PASSED SUCCESSFULLY!');
    console.log('========================================');
  } finally {
    await prisma.tableOrder.deleteMany({ where: { business_id: testBizId } }).catch(() => {});
    await prisma.sale.deleteMany({ where: { business_id: testBizId } }).catch(() => {});
    await prisma.operationalDay.deleteMany({ where: { business_id: testBizId } }).catch(() => {});
    await prisma.counter.deleteMany({ where: { business_id: testBizId } }).catch(() => {});
    await prisma.restaurantTable.deleteMany({ where: { business_id: testBizId } }).catch(() => {});
    await prisma.menuItem.deleteMany({ where: { business_id: testBizId } }).catch(() => {});
    await prisma.user.deleteMany({ where: { business_id: testBizId } }).catch(() => {});
    await prisma.business.delete({ where: { id: testBizId } }).catch(() => {});
    server.close();
  }
}

runTest()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ TEST FAILED:', err);
    process.exit(1);
  });
