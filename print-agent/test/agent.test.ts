import assert from 'node:assert/strict';
import net from 'node:net';
import {
  AgentConfig,
  PrintJob,
  PrinterConfig,
  sendToPrinter,
  toPrintBytes,
  validateConfig,
} from '../src/main';

const validConfig: AgentConfig = {
  apiBaseUrl: 'https://namasteqr.example',
  token: `nqr_pa_${'a'.repeat(43)}`,
  pollIntervalMs: 2500,
  printers: { KOT: { host: '192.168.1.50', port: 9100 } },
};

async function run(): Promise<void> {
  assert.equal(validateConfig(validConfig), validConfig);
  assert.throws(() => validateConfig({ ...validConfig, apiBaseUrl: 'http://namasteqr.example' }), /HTTPS/);
  assert.throws(() => validateConfig({ ...validConfig, token: 'nqr_pa_bad' }), /valid provisioned/);
  assert.throws(() => validateConfig({ ...validConfig, printers: { KOT: { host: '8.8.8.8' } } }), /private IPv4/);
  assert.throws(() => validateConfig({ ...validConfig, printers: { KOT: { host: '192.168.1.50', port: 9101 } } }), /port 9100/);
  assert.throws(() => validateConfig({ ...validConfig, printers: {} }), /at least one/);

  const rawBytes = Buffer.from([0x1b, 0x40, 0x0a, 0x1d, 0x56, 0x00]);
  const rawJob: PrintJob = {
    id: 'raw-job', printer_role: 'KOT', payload_type: 'RAW_ESCPOS',
    payload: { base64: rawBytes.toString('base64') }, attempt_count: 1,
  };
  assert.deepEqual(toPrintBytes(rawJob, validConfig.printers.KOT!), rawBytes);
  assert.throws(() => toPrintBytes({ ...rawJob, payload: { base64: 'not base64!' } }, validConfig.printers.KOT!), /Invalid or oversized/);

  const orderJob: PrintJob = {
    id: 'order-job', printer_role: 'KOT', payload_type: 'ORDER', attempt_count: 1,
    payload: {
      order: {
        id: 'order-1', order_number: 'A-100', table_number: '3',
        created_at: '2026-01-02T03:04:05.000Z', restaurant_name: 'Test Cafe',
        items: [{ name: 'Tea', station: 'KITCHEN', quantity: 2, price: 50 }], subtotal: 100,
        tax_amount: 13, total_amount: 113, currency: 'Rs.',
      },
    },
  };
  const encodedOrder = toPrintBytes(orderJob, validConfig.printers.KOT!);
  assert.ok(encodedOrder.length > 2);
  assert.deepEqual([...encodedOrder.subarray(0, 2)], [0x1b, 0x40]);
  assert.notEqual(encodedOrder.indexOf(Buffer.from('Tea')), -1);

  let receive!: (bytes: Buffer) => void;
  const received = new Promise<Buffer>((resolve) => { receive = resolve; });
  const server = net.createServer((socket) => {
    const parts: Buffer[] = [];
    socket.on('data', (part) => parts.push(part));
    socket.on('end', () => {
      receive(Buffer.concat(parts));
      socket.end();
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  try {
    const port = (server.address() as net.AddressInfo).port;
    await sendToPrinter({ host: '127.0.0.1', port }, rawBytes);
    assert.deepEqual(await received, rawBytes);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  console.log('Print-agent config, ESC/POS encoding, payload validation, and TCP delivery checks passed.');
}

run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
