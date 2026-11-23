import assert from 'node:assert';
import http from 'node:http';
import net from 'node:net';
import { createApp } from '../src/app';
import { db } from '../src/services/db.service';
import { generateToken } from '../src/middleware/auth.middleware';
import { config } from '../src/config/env';

async function runPrintSecurityTests() {
  console.log('\n======================================================');
  console.log('🖨️  SERVEFLOW PRINT BRIDGE SECURITY TEST SUITE');
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
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as net.AddressInfo).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const testBiz = 'print-security-biz';
  await db.ensureBusiness(testBiz, 'Print Security Biz', 'RESTAURANT');

  const owner = await db.ensureUser({
    id: `print-owner-${Date.now()}`,
    business_id: testBiz,
    email: `print-owner-${Date.now()}@print-test.app`,
    role: 'RESTAURANT_OWNER',
  });

  const validToken = generateToken({
    userId: owner.id,
    businessId: testBiz,
    role: owner.role,
  });

  // Create a mock thermal printer socket server
  let mockReceivedBytes = 0;
  const mockPrinter = net.createServer((sock) => {
    sock.on('data', (d) => { mockReceivedBytes += d.length; });
    sock.on('end', () => sock.end());
  });
  await new Promise<void>((resolve) => mockPrinter.listen(0, '127.0.0.1', () => resolve()));
  const mockPrinterPort = (mockPrinter.address() as net.AddressInfo).port;
  process.env.NAMASTEQR_PRINTER_ALLOWED_HOSTS = '127.0.0.1';
  process.env.NAMASTEQR_PRINTER_ALLOWED_PORTS = String(mockPrinterPort);

  try {
    // -------------------------------------------------------------
    // Test 1: Authenticated Input Validation blocks malicious hosts
    // -------------------------------------------------------------
    console.log('📦 Test 1: Cloud metadata & restricted ports rejection');
    const metaRes = await fetch(`${baseUrl}/api/print/test-connection`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${validToken}`,
      },
      body: JSON.stringify({ host: '169.254.169.254', port: 9100 }),
    });
    assert.strictEqual(metaRes.status, 400);
    pass('Targeting cloud metadata IP returns 400');

    const publicHostRes = await fetch(`${baseUrl}/api/print/test-connection`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${validToken}` },
      body: JSON.stringify({ host: '8.8.8.8', port: 9100 }),
    });
    assert.strictEqual(publicHostRes.status, 400);
    pass('Public IP target returns 400');

    const unsafePortRes = await fetch(`${baseUrl}/api/print/test-connection`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${validToken}` },
      body: JSON.stringify({ host: '192.168.1.50', port: 5432 }),
    });
    assert.strictEqual(unsafePortRes.status, 400);
    pass('Non-printer port returns 400');

    const sysPortRes = await fetch(`${baseUrl}/api/print/test-connection`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${validToken}`,
      },
      body: JSON.stringify({ host: '192.168.1.100', port: 5432 }),
    });
    assert.strictEqual(sysPortRes.status, 400);
    pass('Targeting restricted database port returns 400');

    // -------------------------------------------------------------
    // Test 2: Unauthenticated print requests return 401
    // -------------------------------------------------------------
    console.log('\n📦 Test 2: Authentication enforcement on all callers');
    const unauthTestRes = await fetch(`${baseUrl}/api/print/test-connection`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host: '192.168.1.50', port: 9100 }),
    });
    assert.strictEqual(unauthTestRes.status, 401);
    pass('Unauthenticated POST /api/print/test-connection rejected with 401');

    const unauthLanRes = await fetch(`${baseUrl}/api/print/lan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host: '192.168.1.50', port: 9100, data: [0x1b, 0x40] }),
    });
    assert.strictEqual(unauthLanRes.status, 401);
    pass('Unauthenticated POST /api/print/lan rejected with 401');

    // -------------------------------------------------------------
    // Test 3: Authenticated print requests succeed with live printer
    // -------------------------------------------------------------
    console.log('\n📦 Test 3: Authenticated requests succeed with live printer');
    const authTestRes = await fetch(`${baseUrl}/api/print/test-connection`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${validToken}`,
      },
      body: JSON.stringify({ host: '127.0.0.1', port: mockPrinterPort }),
    });
    assert.strictEqual(authTestRes.status, 200);
    pass('Authenticated POST /api/print/test-connection with valid token succeeds (200)');

    const authLanRes = await fetch(`${baseUrl}/api/print/lan`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${validToken}`,
      },
      body: JSON.stringify({ host: '127.0.0.1', port: mockPrinterPort, data: [0x1b, 0x40, 0x0a] }),
    });
    assert.strictEqual(authLanRes.status, 200);
    pass('Authenticated POST /api/print/lan with valid token transmits print job (200)');

    const hangingPrinter = net.createServer(() => undefined);
    await new Promise<void>((resolve) => hangingPrinter.listen(0, '127.0.0.1', () => resolve()));
    const hangingPort = (hangingPrinter.address() as net.AddressInfo).port;
    process.env.NAMASTEQR_PRINTER_ALLOWED_PORTS = `${mockPrinterPort},${hangingPort}`;
    const timeoutRes = await fetch(`${baseUrl}/api/print/lan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${validToken}` },
      body: JSON.stringify({ host: '127.0.0.1', port: hangingPort, timeout: 100, data: [0x1b, 0x40] }),
    });
    assert.strictEqual(timeoutRes.status, 504);
    pass('Hung printer connection is stopped by timeout');
    hangingPrinter.close();

  } catch (err: any) {
    fail('Unhandled print security test error', err);
  } finally {
    mockPrinter.close();
    server.close();
  }

  console.log('\n======================================================');
  console.log(`🏁 Print Security Suite: ${passed} Passed, ${failed} Failed`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runPrintSecurityTests().catch((err) => {
  console.error('Fatal print security test crash:', err);
  process.exit(1);
});
