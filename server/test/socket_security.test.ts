import assert from 'node:assert';
import http from 'node:http';
import net from 'node:net';
import { io as ClientSocket, Socket as ClientSocketType } from 'socket.io-client';
import { createApp } from '../src/app';
import { initSocketServer, realtimeEmitter } from '../src/lib/socket';
import { db } from '../src/services/db.service';
import { prisma } from '../src/lib/prisma';
import { generateToken } from '../src/middleware/auth.middleware';

async function runSocketSecurityTests() {
  console.log('\n======================================================');
  console.log('⚡  SERVEFLOW SOCKET.IO SECURITY AUDIT TEST SUITE');
  console.log('======================================================\n');

  let passed = 0;
  let failed = 0;

  function pass(desc: string) {
    passed++;
    console.log(`  ✅ PASS: ${desc}`);
  }

  function fail(desc: string, err: any) {
    failed++;
    console.error(`  ❌ FAIL: ${desc} ->`, err?.message || err);
  }

  const app = createApp();
  const server = http.createServer(app);
  const ioServer = initSocketServer(server);

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as net.AddressInfo).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const testBiz1 = 'test-socket-biz-1';
  const testBiz2 = 'test-socket-biz-2';

  // Seed test businesses and users
  await db.ensureBusiness(testBiz1, 'Socket Biz 1', 'RESTAURANT');
  await db.ensureBusiness(testBiz2, 'Socket Biz 2', 'RESTAURANT');

  const owner1 = await db.ensureUser({
    id: `socket-owner-1-${Date.now()}`,
    business_id: testBiz1,
    email: `owner1-${Date.now()}@socket-test.app`,
    role: 'RESTAURANT_OWNER',
  });

  const owner2 = await db.ensureUser({
    id: `socket-owner-2-${Date.now()}`,
    business_id: testBiz2,
    email: `owner2-${Date.now()}@socket-test.app`,
    role: 'RESTAURANT_OWNER',
  });

  const token1 = generateToken({
    userId: owner1.id,
    businessId: testBiz1,
    role: owner1.role,
  });

  const token2 = generateToken({
    userId: owner2.id,
    businessId: testBiz2,
    role: owner2.role,
  });

  // Seed a valid table for testBiz1
  const testTable1 = await prisma.restaurantTable.upsert({
    where: { id: `table-sock-1-${Date.now()}` },
    update: {},
    create: {
      id: `table-sock-1-${Date.now()}`,
      business_id: testBiz1,
      table_number: 'T-101',
      capacity: 4,
      status: 'VACANT',
    },
  });

  function createClient(options?: any): ClientSocketType {
    return ClientSocket(baseUrl, {
      transports: ['websocket'],
      forceNew: true,
      ...options,
    });
  }

  try {
    // -------------------------------------------------------------
    // Test 1: Unauthenticated join:business is rejected
    // -------------------------------------------------------------
    console.log('📦 Test 1: Unauthenticated join:business rejection');
    await new Promise<void>((resolve, reject) => {
      const client = createClient();
      client.on('connect', () => {
        client.emit('join:business', testBiz1);
      });
      client.on('socket:error', (err) => {
        try {
          assert.strictEqual(err.code, 'UNAUTHORIZED');
          pass('Unauthenticated socket is rejected with UNAUTHORIZED when attempting join:business');
          client.disconnect();
          resolve();
        } catch (e) {
          client.disconnect();
          reject(e);
        }
      });
      client.on('joined:business', () => {
        client.disconnect();
        reject(new Error('Unauthenticated client unexpectedly allowed to join:business!'));
      });
      setTimeout(() => {
        client.disconnect();
        reject(new Error('Timeout waiting for socket:error on unauthenticated join:business'));
      }, 4000);
    });

    // -------------------------------------------------------------
    // Test 2: Cross-tenant join:business is rejected
    // -------------------------------------------------------------
    console.log('\n📦 Test 2: Cross-tenant join:business rejection (IDOR)');
    await new Promise<void>((resolve, reject) => {
      // Client 2 connects with token2 (belongs to testBiz2) and tries to join testBiz1
      const client = createClient({
        auth: { token: token2 },
      });
      client.on('connect', () => {
        client.emit('join:business', testBiz1);
      });
      client.on('socket:error', (err) => {
        try {
          assert.strictEqual(err.code, 'FORBIDDEN');
          pass('Tenant from Biz 2 is rejected with FORBIDDEN when attempting to join Biz 1 room');
          client.disconnect();
          resolve();
        } catch (e) {
          client.disconnect();
          reject(e);
        }
      });
      client.on('joined:business', () => {
        client.disconnect();
        reject(new Error('Cross-tenant client unexpectedly allowed to join:business!'));
      });
      setTimeout(() => {
        client.disconnect();
        reject(new Error('Timeout waiting for socket:error on cross-tenant join:business'));
      }, 4000);
    });

    // -------------------------------------------------------------
    // Test 3: Authorized join:business succeeds
    // -------------------------------------------------------------
    console.log('\n📦 Test 3: Legitimate business staff/owner joins business room');
    await new Promise<void>((resolve, reject) => {
      const client = createClient({
        auth: { token: token1 },
      });
      client.on('connect', () => {
        client.emit('join:business', testBiz1);
      });
      client.on('joined:business', (data) => {
        try {
          assert.strictEqual(data.businessId, testBiz1);
          pass('Legitimate owner successfully authenticated and joined business room');
          client.disconnect();
          resolve();
        } catch (e) {
          client.disconnect();
          reject(e);
        }
      });
      client.on('socket:error', (err) => {
        client.disconnect();
        reject(new Error(`Unexpected socket:error: ${JSON.stringify(err)}`));
      });
      setTimeout(() => {
        client.disconnect();
        reject(new Error('Timeout waiting for joined:business'));
      }, 4000);
    });

    // -------------------------------------------------------------
    // Test 4: join:table validates database tables
    // -------------------------------------------------------------
    console.log('\n📦 Test 4: join:table validation against DB tables');
    // 4.1 Non-existent table fails
    await new Promise<void>((resolve, reject) => {
      const client = createClient();
      client.on('connect', () => {
        client.emit('join:table', { businessId: testBiz1, tableId: 'non-existent-table-999' });
      });
      client.on('socket:error', (err) => {
        try {
          assert.strictEqual(err.code, 'TABLE_NOT_FOUND');
          pass('Fake table join rejected with TABLE_NOT_FOUND');
          client.disconnect();
          resolve();
        } catch (e) {
          client.disconnect();
          reject(e);
        }
      });
      client.on('joined:table', () => {
        client.disconnect();
        reject(new Error('Fake table was unexpectedly joined!'));
      });
      setTimeout(() => {
        client.disconnect();
        reject(new Error('Timeout waiting for socket:error on non-existent table'));
      }, 4000);
    });

    // 4.2 Existing table succeeds
    await new Promise<void>((resolve, reject) => {
      const client = createClient();
      client.on('connect', () => {
        client.emit('join:table', { businessId: testBiz1, tableId: testTable1.id });
      });
      client.on('joined:table', (data) => {
        try {
          assert.strictEqual(data.tableId, testTable1.id);
          pass('Valid database table joined successfully');
          client.disconnect();
          resolve();
        } catch (e) {
          client.disconnect();
          reject(e);
        }
      });
      client.on('socket:error', (err) => {
        client.disconnect();
        reject(new Error(`Unexpected socket:error on valid table: ${JSON.stringify(err)}`));
      });
      setTimeout(() => {
        client.disconnect();
        reject(new Error('Timeout waiting for joined:table'));
      }, 4000);
    });

    // -------------------------------------------------------------
    // Test 5: Table-only diner does NOT receive business-wide orders
    // -------------------------------------------------------------
    console.log('\n📦 Test 5: Eavesdropping prevention: diners only receive their own table events');
    await new Promise<void>((resolve, reject) => {
      const dinerClient = createClient();
      const staffClient = createClient({ auth: { token: token1 } });

      let dinerReceivedOtherOrder = false;
      let staffReceivedOrder = false;

      dinerClient.on('connect', () => {
        dinerClient.emit('join:table', { businessId: testBiz1, tableId: testTable1.id });
      });

      staffClient.on('connect', () => {
        staffClient.emit('join:business', testBiz1);
      });

      dinerClient.on('order:created', (order) => {
        if (order.id === 'takeaway-order-biz1') {
          dinerReceivedOtherOrder = true;
        }
      });

      staffClient.on('order:created', (order) => {
        if (order.id === 'takeaway-order-biz1') {
          staffReceivedOrder = true;
        }
      });

      // Wait 300ms for joins to complete
      setTimeout(() => {
        // Emit an order that has no table or different table (e.g. takeaway)
        realtimeEmitter.orderCreated(testBiz1, { id: 'takeaway-order-biz1', total_amount: 1500 });

        setTimeout(() => {
          try {
            assert.strictEqual(staffReceivedOrder, true, 'Staff client must receive business order');
            assert.strictEqual(dinerReceivedOtherOrder, false, 'Diner client MUST NOT receive business order');
            pass('Diner at table did NOT overhear business-wide order (eavesdropping prevented)');
            dinerClient.disconnect();
            staffClient.disconnect();
            resolve();
          } catch (e) {
            dinerClient.disconnect();
            staffClient.disconnect();
            reject(e);
          }
        }, 500);
      }, 300);
    });

    // -------------------------------------------------------------
    // Test 6: Public menu channel receives menu updates
    // -------------------------------------------------------------
    console.log('\n📦 Test 6: Public menu channel receives menu updates safely');
    await new Promise<void>((resolve, reject) => {
      const publicClient = createClient();
      let menuUpdatedReceived = false;

      publicClient.on('connect', () => {
        publicClient.emit('join:menu', testBiz1);
      });

      publicClient.on('joined:menu', () => {
        realtimeEmitter.menuUpdated(testBiz1);
      });

      publicClient.on('menu:updated', (data) => {
        if (data.businessId === testBiz1) {
          menuUpdatedReceived = true;
        }
      });

      setTimeout(() => {
        try {
          assert.strictEqual(menuUpdatedReceived, true, 'Public menu listener must receive menu:updated');
          pass('Public diner safely received menu:updated event');
          publicClient.disconnect();
          resolve();
        } catch (e) {
          publicClient.disconnect();
          reject(e);
        }
      }, 500);
    });

  } catch (err: any) {
    fail('Unhandled socket security test error', err);
  } finally {
    // Cleanup seeded data
    try {
      await prisma.restaurantTable.deleteMany({ where: { business_id: testBiz1 } });
      await prisma.user.deleteMany({ where: { business_id: { in: [testBiz1, testBiz2] } } });
      await prisma.business.deleteMany({ where: { id: { in: [testBiz1, testBiz2] } } });
    } catch {}
    server.close();
    ioServer.close();
  }

  console.log('\n======================================================');
  console.log(`🏁 Socket Security Suite: ${passed} Passed, ${failed} Failed`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runSocketSecurityTests().catch((err) => {
  console.error('Fatal socket security suite crash:', err);
  process.exit(1);
});
