import { prisma } from '../src/lib/prisma';
import { realtimeEmitter } from '../src/lib/socket';
import { formatKdsTableName } from '../../src/components/kds/KitchenDisplaySystem';
import axios from 'axios';
import { createServer } from 'http';
import express from 'express';
import rbacRoutes from '../src/routes/rbac.routes';

console.log('🧪 Starting Acknowledge Table Ping Tests...');

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${msg}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${msg}`);
    failed++;
  }
}

async function runTests() {
  const testBizId = `test-biz-ack-${Date.now()}`;
  const testTableNumber = 'Table 4 (VIP)';

  // 1. Table Name Formatting for KDS Card
  assert(formatKdsTableName(testTableNumber) === 'Table 4 (VIP)', 'Cleanly formats Table 4 (VIP)');
  assert(formatKdsTableName('Table #Table 4 (VIP)') === 'Table 4 (VIP)', 'Strips duplicate Table #Table prefix');

  // Set up ephemeral express app with rbacRoutes
  const app = express();
  app.use(express.json());
  app.use('/api/rbac', rbacRoutes);

  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://localhost:${port}/api/rbac`;

  try {
    // 2. Setup DB entities: Business + Table + ServiceRequests
    await prisma.business.create({
      data: {
        id: testBizId,
        name: 'Ping Test Cafe',
        currency: 'Rs.',
      },
    });

    const createdTable = await prisma.restaurantTable.create({
      data: {
        business_id: testBizId,
        table_number: testTableNumber,
        status: 'ACTIVE',
        capacity: 4,
        waiter_ping: {
          active: true,
          timestamp: '2024-10-26T12:00:00.000Z', // Old call from previous session
        },
      },
    });

    await prisma.serviceRequest.create({
      data: {
        id: `sr-1-${Date.now()}`,
        business_id: testBizId,
        table_id: createdTable.id,
        table_number: createdTable.table_number,
        type: 'CALL_WAITER',
        status: 'PENDING',
      },
    });

    await prisma.serviceRequest.create({
      data: {
        id: `sr-2-${Date.now()}`,
        business_id: testBizId,
        table_id: createdTable.id,
        table_number: createdTable.table_number,
        type: 'WAITER_CALL',
        status: 'PENDING',
      },
    });

    // Track realtime emitter calls
    const emittedTableEvents: any[] = [];
    const emittedRequestEvents: any[] = [];
    const origTableUpdated = realtimeEmitter.tableUpdated;
    const origRequestUpdated = realtimeEmitter.serviceRequestUpdated;

    realtimeEmitter.tableUpdated = (bId: string, tbl: any) => {
      emittedTableEvents.push({ businessId: bId, table: tbl });
      origTableUpdated(bId, tbl);
    };
    realtimeEmitter.serviceRequestUpdated = (bId: string, req: any) => {
      emittedRequestEvents.push({ businessId: bId, request: req });
      origRequestUpdated(bId, req);
    };

    // Test Case A: Standard call by tableId with businessId in body & query
    console.log('\n--- Test Case A: Acknowledge by tableId ---');
    const resA = await axios.post(`${baseUrl}/tables/${createdTable.id}/acknowledge-ping`, {
      businessId: testBizId,
      tableNumber: createdTable.table_number,
    });
    assert(resA.data.success === true, 'Response returns success: true');

    const tableAfterA = await prisma.restaurantTable.findUnique({ where: { id: createdTable.id } });
    assert((tableAfterA?.waiter_ping as any)?.active === false, 'Table waiter_ping is set to active: false');

    const srv1AfterA = await prisma.serviceRequest.findFirst({
      where: { business_id: testBizId, type: 'CALL_WAITER' },
    });
    assert(srv1AfterA?.status === 'ATTENDED' && !!srv1AfterA?.resolved_at, 'CALL_WAITER ServiceRequest is marked ATTENDED with resolved_at');

    const srv2AfterA = await prisma.serviceRequest.findFirst({
      where: { business_id: testBizId, type: 'WAITER_CALL' },
    });
    assert(srv2AfterA?.status === 'ATTENDED' && !!srv2AfterA?.resolved_at, 'WAITER_CALL ServiceRequest is also marked ATTENDED with resolved_at');

    assert(
      emittedTableEvents.some((e) => e.businessId === testBizId && e.table.id === createdTable.id && e.table.waiter_ping?.active === false),
      'Emitted tableUpdated realtime event with waiter_ping.active: false'
    );
    assert(
      emittedRequestEvents.some((e) => e.businessId === testBizId && e.request.status === 'ATTENDED'),
      'Emitted serviceRequestUpdated realtime event with status ATTENDED'
    );

    // Test Case B: Acknowledge by table_number (when tableId is table_number)
    console.log('\n--- Test Case B: Acknowledge by table_number ---');
    // Reactivate ping
    await prisma.restaurantTable.update({
      where: { id: createdTable.id },
      data: { waiter_ping: { active: true, timestamp: new Date().toISOString() } },
    });
    await prisma.serviceRequest.updateMany({
      where: { business_id: testBizId },
      data: { status: 'PENDING', resolved_at: null },
    });

    const resB = await axios.post(`${baseUrl}/tables/${encodeURIComponent(createdTable.table_number)}/acknowledge-ping?businessId=${testBizId}`, {
      businessId: testBizId,
    });
    assert(resB.data.success === true, 'Response returns success: true when table_number is in URL');

    const tableAfterB = await prisma.restaurantTable.findUnique({ where: { id: createdTable.id } });
    assert((tableAfterB?.waiter_ping as any)?.active === false, 'Table waiter_ping is set to active: false after acknowledgement by table_number');

    // Test Case C: Swapped arguments fallback (when route receives businessId in URL and tableId in body)
    console.log('\n--- Test Case C: Swapped arguments recovery ---');
    // Reactivate ping
    await prisma.restaurantTable.update({
      where: { id: createdTable.id },
      data: { waiter_ping: { active: true, timestamp: new Date().toISOString() } },
    });

    const resC = await axios.post(`${baseUrl}/tables/${testBizId}/acknowledge-ping`, {
      businessId: createdTable.id,
    });
    assert(resC.data.success === true, 'Response handles swapped arguments gracefully');

    const tableAfterC = await prisma.restaurantTable.findUnique({ where: { id: createdTable.id } });
    assert((tableAfterC?.waiter_ping as any)?.active === false, 'Table waiter_ping is set to active: false even with swapped arguments');

    // Test Case D: Modified / Renamed Table (stored as "4 (VIP)" in DB, acknowledged as "Table 4 (VIP)")
    console.log('\n--- Test Case D: Modified/Renamed table ("4 (VIP)" in DB, acknowledged with "Table 4 (VIP)") ---');
    const tableD = await prisma.restaurantTable.create({
      data: {
        business_id: testBizId,
        table_number: '4 (VIP)',
        status: 'ACTIVE',
        capacity: 4,
        waiter_ping: { active: true, timestamp: '2026-10-26T10:00:00.000Z' },
      },
    });

    const resD = await axios.post(`${baseUrl}/tables/active/acknowledge-ping`, {
      businessId: testBizId,
      tableNumber: 'Table 4 (VIP)',
    });
    assert(resD.data.success === true, 'Response returns success: true for renamed table');

    const tableAfterD = await prisma.restaurantTable.findUnique({ where: { id: tableD.id } });
    assert((tableAfterD?.waiter_ping as any)?.active === false, 'Table "4 (VIP)" waiter_ping cleared when acknowledged as "Table 4 (VIP)"');

    // Test Case E: Stripped table number variation (stored as "Table 4 (VIP)", acknowledged as "4")
    console.log('\n--- Test Case E: Stripped table number acknowledgment ("Table 4 (VIP)" in DB, acknowledged as "4") ---');
    await prisma.restaurantTable.update({
      where: { id: createdTable.id },
      data: { waiter_ping: { active: true, timestamp: new Date().toISOString() } },
    });

    const resE = await axios.post(`${baseUrl}/tables/active/acknowledge-ping`, {
      businessId: testBizId,
      tableNumber: '4',
    });
    assert(resE.data.success === true, 'Response returns success: true when acknowledged with bare number "4"');

    const tableAfterE = await prisma.restaurantTable.findUnique({ where: { id: createdTable.id } });
    assert((tableAfterE?.waiter_ping as any)?.active === false, 'Table "Table 4 (VIP)" waiter_ping cleared when acknowledged with bare number "4"');

    // Test Case F: Business ID resolved from x-business-id header
    console.log('\n--- Test Case F: Business ID from x-business-id header ---');
    await prisma.restaurantTable.update({
      where: { id: createdTable.id },
      data: { waiter_ping: { active: true, timestamp: new Date().toISOString() } },
    });

    const resF = await axios.post(
      `${baseUrl}/tables/${createdTable.id}/acknowledge-ping`,
      {},
      { headers: { 'x-business-id': testBizId } }
    );
    assert(resF.data.success === true, 'Response returns success: true using x-business-id header');

    const tableAfterF = await prisma.restaurantTable.findUnique({ where: { id: createdTable.id } });
    assert((tableAfterF?.waiter_ping as any)?.active === false, 'Table waiter_ping cleared via x-business-id header');

    // Test Case G: Deleted / Non-existent table graceful dismissal & individual SR ID emission
    console.log('\n--- Test Case G: Deleted/Orphaned table dismissal ---');
    const orphanSrId = `orphan-sr-${Date.now()}`;
    await prisma.serviceRequest.create({
      data: {
        id: orphanSrId,
        business_id: testBizId,
        table_id: 'deleted-table-id-999',
        table_number: 'Table 999',
        type: 'CALL_WAITER',
        status: 'PENDING',
      },
    });

    emittedRequestEvents.length = 0; // reset
    const resG = await axios.post(`${baseUrl}/tables/deleted-table-id-999/acknowledge-ping`, {
      businessId: testBizId,
      tableNumber: 'Table 999',
    });
    assert(resG.data.success === true, 'Response returns success: true for permanently deleted table');

    const orphanSrAfter = await prisma.serviceRequest.findUnique({ where: { id: orphanSrId } });
    assert(orphanSrAfter?.status === 'ATTENDED', 'Orphaned ServiceRequest status updated to ATTENDED');
    assert(
      emittedRequestEvents.some((e) => e.request.id === orphanSrId && e.request.status === 'ATTENDED'),
      'Emitted serviceRequestUpdated with exact service request ID for real-time KDS clients'
    );

    // Restore original emitter functions
    realtimeEmitter.tableUpdated = origTableUpdated;
    realtimeEmitter.serviceRequestUpdated = origRequestUpdated;

  } finally {
    // Cleanup
    server.close();
    await prisma.serviceRequest.deleteMany({ where: { business_id: testBizId } }).catch(() => {});
    await prisma.restaurantTable.deleteMany({ where: { business_id: testBizId } }).catch(() => {});
    await prisma.business.deleteMany({ where: { id: testBizId } }).catch(() => {});
  }

  console.log(`\n==================================================`);
  console.log(`🏁 TESTS COMPLETED: ${passed} PASSED, ${failed} FAILED`);
  console.log(`==================================================`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test run error:', err);
  process.exit(1);
});
