import assert from 'assert';
import http from 'http';
import net from 'net';
import { createApp } from '../src/app';
import { EscPosEncoder, ESCPOS } from '../../src/utils/escpos';
import { BrowserPrintDriver } from '../../src/services/printer-drivers/BrowserPrintDriver';

async function runPrinterTests() {
  console.log('🧪 Starting ServeFlow Hardware & Printer Driver Test Suite...\n');
  let passed = 0;
  let failed = 0;

  // Test 1: ESC/POS Builder - Basics & Control Bytes
  try {
    console.log('📦 Test 1: ESC/POS Command Encoder & Buffer Compiling...');
    const encoder = EscPosEncoder.create();
    encoder
      .align('center')
      .bold(true)
      .line('ServeFlow POS')
      .bold(false)
      .align('left')
      .divider('-', 48)
      .row('Chicken MoMo', 'Rs 250.00', 48)
      .feed(3)
      .cut(true);

    const buffer = encoder.encode();
    assert(buffer instanceof Uint8Array, 'Output must be Uint8Array');
    assert(buffer.length > 20, 'Buffer must contain commands and text');

    // Check INIT command 0x1B, 0x40
    assert.strictEqual(buffer[0], 0x1b);
    assert.strictEqual(buffer[1], 0x40);

    // Check partial cut command 0x1D, 0x56, 0x41, 0x03
    const hasCut = buffer.some((b, idx) => 
      b === 0x1d && buffer[idx + 1] === 0x56 && buffer[idx + 2] === 0x41 && buffer[idx + 3] === 0x03
    );
    assert.strictEqual(hasCut, true, 'Buffer must contain ESC/POS partial cut sequence');

    console.log('  ✅ PASS: ESC/POS command sequences compiled correctly.');
    passed++;
  } catch (e: any) {
    console.error('  ❌ FAIL:', e.message);
    failed++;
  }

  // Test 2: ESC/POS Receipt Builder (KOT, BILL, 80mm & 58mm)
  try {
    console.log('\n📦 Test 2: Receipt and KOT Builder...');
    const billData = {
      order_number: 'ORD-1001',
      table_number: 'Table 4',
      waiter_name: 'Bikash',
      items: [
        { name: 'Veg Chowmein', quantity: 2, price: 150, total: 300, notes: 'Less spicy' },
        { name: 'Cold Beer', quantity: 1, price: 350, total: 350 },
      ],
      subtotal: 650,
      tax_amount: 84.5,
      total_amount: 734.5,
    };

    const bill80 = EscPosEncoder.buildReceipt(billData, { paperWidth: '80mm', role: 'BILL', autoCut: true });
    assert(bill80.length > 50, '80mm bill receipt should compile');

    const kot58 = EscPosEncoder.buildReceipt(billData, { paperWidth: '58mm', role: 'KOT', autoCut: true });
    assert(kot58.length > 30, '58mm KOT receipt should compile');

    const testSlip = EscPosEncoder.buildTestPrint({
      name: 'Kitchen POS-80',
      connectionType: 'NETWORK',
      targetAddress: '192.168.1.150:9100',
      paperWidth: '80mm',
    });
    assert(testSlip.length > 50, 'Diagnostic test slip should compile');

    console.log('  ✅ PASS: Receipt & test patterns built for 80mm & 58mm.');
    passed++;
  } catch (e: any) {
    console.error('  ❌ FAIL:', e.message);
    failed++;
  }

  // Test 3: Backend Express Print Routes API
  const app = createApp();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as net.AddressInfo).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    console.log('\n📦 Test 3: Express Print Status Route (/api/print/status)...');
    const res = await fetch(`${baseUrl}/api/print/status`);
    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.status, 'ok');
    assert(Array.isArray(json.capabilities), 'Capabilities must be an array');
    console.log('  ✅ PASS: Status endpoint online with printer capabilities.');
    passed++;
  } catch (e: any) {
    console.error('  ❌ FAIL:', e.message);
    failed++;
  }

  // Test 4: Test Connection Validation (/api/print/test-connection)
  try {
    console.log('\n📦 Test 4: Socket Reachability Validation (/api/print/test-connection)...');
    // Validation on missing host
    const badRes = await fetch(`${baseUrl}/api/print/test-connection`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.strictEqual(badRes.status, 400);

    // Validation with unreachable host with short timeout
    const timeoutRes = await fetch(`${baseUrl}/api/print/test-connection`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host: '192.0.2.1', port: 9100, timeout: 500 }),
    });
    assert(timeoutRes.status === 504 || timeoutRes.status === 502);
    console.log('  ✅ PASS: Socket connection validation and error boundaries active.');
    passed++;
  } catch (e: any) {
    console.error('  ❌ FAIL:', e.message);
    failed++;
  }

  // Test 5: LAN Print Stream with Mock Printer TCP Socket
  try {
    console.log('\n📦 Test 5: Direct LAN TCP Socket Print Bridge (/api/print/lan)...');

    // Create a mock thermal printer socket server on localhost
    let receivedPayload: Buffer = Buffer.from([]);
    const mockPrinterServer = net.createServer((socket) => {
      socket.on('data', (chunk) => {
        receivedPayload = Buffer.concat([receivedPayload, chunk]);
      });
      socket.on('end', () => {
        socket.end();
      });
    });

    await new Promise<void>((resolve) => mockPrinterServer.listen(0, '127.0.0.1', () => resolve()));
    const mockPrinterPort = (mockPrinterServer.address() as net.AddressInfo).port;

    // Send binary ESC/POS payload via POST /api/print/lan
    const testData = new Uint8Array([0x1b, 0x40, 0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x0a]); // ESC @ Hello LF
    const printRes = await fetch(`${baseUrl}/api/print/lan?host=127.0.0.1&port=${mockPrinterPort}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'x-printer-host': '127.0.0.1',
        'x-printer-port': String(mockPrinterPort),
      },
      body: testData,
    });

    assert.strictEqual(printRes.status, 200);
    const printJson = await printRes.json();
    assert.strictEqual(printJson.success, true);
    assert.strictEqual(printJson.bytes, testData.length);

    // Verify mock printer socket received the exact binary bytes
    assert.strictEqual(receivedPayload.length, testData.length);
    assert.deepStrictEqual(Array.from(receivedPayload), Array.from(testData));

    console.log('  ✅ PASS: Raw ESC/POS buffer transmitted seamlessly over TCP socket port.');
    passed++;

    // Test 6: Host:port string parsing in /api/print/lan
    console.log('\n📦 Test 6: Host:Port String Parsing in Backend Router...');
    let hostPortReceived: Buffer = Buffer.from([]);
    const hostPortServer = net.createServer((sock) => {
      sock.on('data', (c) => { hostPortReceived = Buffer.concat([hostPortReceived, c]); });
      sock.on('end', () => sock.end());
    });
    await new Promise<void>((r) => hostPortServer.listen(0, '127.0.0.1', () => r()));
    const hpPort = (hostPortServer.address() as net.AddressInfo).port;

    const hpRes = await fetch(`${baseUrl}/api/print/lan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        host: `127.0.0.1:${hpPort}`, // Combined IP:port format
        data: [0x1b, 0x40, 0x54, 0x45, 0x53, 0x54],
      }),
    });
    assert.strictEqual(hpRes.status, 200);
    assert.strictEqual(hostPortReceived.length, 6);
    console.log('  ✅ PASS: Combined host:port address parsed and routed accurately.');
    passed++;
    hostPortServer.close();

    // Test 7: Monospace formatting and Browser text cleaning
    console.log('\n📦 Test 7: Universal Browser Driver Text Cleaner & Row Bounds...');
    const rawPattern = '\x1b\x40ServeFlow POS\n\x1b\x61\x01Table: 5          Rs 500.00\n\x1d\x56\x00';
    const cleaned = BrowserPrintDriver.cleanEscPosText(rawPattern);
    assert(!cleaned.includes('\x1b\x40'), 'Must strip ESC/POS commands');
    assert(!cleaned.includes('\x1d\x56'), 'Must strip cut commands');
    assert(cleaned.includes('\n'), 'Must preserve newlines');
    assert(cleaned.includes('          '), 'Must preserve multi-space column padding');

    // Test EscPosEncoder row boundary truncation
    const enc = EscPosEncoder.create();
    enc.row('Super Extra Long Dish Name That Definitely Exceeds Standard Roll Column Length', 'Rs 999.00', 32);
    const rowBuf = enc.encode();
    const rowStr = new TextDecoder().decode(rowBuf);
    assert(rowStr.includes('…'), 'Left text must truncate with ellipsis');
    assert(rowStr.includes('Rs 999.00'), 'Right text must be preserved');
    console.log('  ✅ PASS: Text cleaner & row bounds preserve layout integrity.');
    passed++;

    mockPrinterServer.close();
  } catch (e: any) {
    console.error('  ❌ FAIL:', e.message);
    failed++;
  } finally {
    server.close();
  }

  console.log(`\n========================================`);
  console.log(`🏁 Printer Suite Results: ${passed} Passed, ${failed} Failed`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runPrinterTests().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
