import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { normalizePrinterSettings, resolvePrinter, splitOrderByStation } from '../../src/services/printer-routing';
import { PrintQueue } from '../../src/services/print-queue';
import { PrinterProfile, PrinterSettings } from '../../src/types/printer.types';
import { EscPosEncoder } from '../../src/utils/escpos';

const kitchen: PrinterProfile = {
  id: 'kitchen', name: 'Kitchen', connection: 'LAN', address: { lan: { host: '192.168.1.50', port: 9100 } },
  paperWidthMm: 80, paperWidth: '80mm', enabled: true, autoPrintKds: true,
};
const bill: PrinterProfile = {
  id: 'bill', name: 'Counter', connection: 'USB', address: { usb: { vendorId: 1, productId: 2 } },
  paperWidthMm: 58, paperWidth: '58mm', enabled: true, autoPrintKds: false,
};
const settings: PrinterSettings = {
  schemaVersion: 2,
  printers: [kitchen, bill],
  assignments: { KOT: 'kitchen', BOT: null, BILL: 'bill', defaultPrinterId: 'bill' },
};

async function run(): Promise<void> {
  const override = resolvePrinter(settings, 'KOT', 'bill');
  assert.equal('printer' in override && override.printer.id, 'bill');
  assert.equal('printer' in override && override.reason, 'override');
  const byRole = resolvePrinter(settings, 'KOT');
  assert.equal('printer' in byRole && byRole.printer.id, 'kitchen');
  assert.equal('printer' in byRole && byRole.reason, 'role');
  const byDefault = resolvePrinter({ ...settings, assignments: { ...settings.assignments, BOT: null } }, 'BOT');
  assert.equal('printer' in byDefault && byDefault.printer.id, 'bill');
  assert.equal('printer' in byDefault && byDefault.reason, 'default');
  const browser = resolvePrinter({ ...settings, printers: [], assignments: { KOT: null, BOT: null, BILL: null, defaultPrinterId: null } }, 'BILL');
  assert.equal('printer' in browser && browser.printer.connection, 'BROWSER');
  assert.equal('printer' in browser && browser.reason, 'browser-fallback');
  assert.ok('error' in resolvePrinter(settings, 'BILL', 'missing'));
  assert.ok('error' in resolvePrinter({ ...settings, printers: [{ ...bill, enabled: false }] }, 'BILL'));
  assert.ok('error' in resolvePrinter({ ...settings, printers: [{ ...bill, status: 'disconnected' }] }, 'BILL'));

  const migrated = normalizePrinterSettings([{
    id: 'old-printer', name: 'Old printer', role: 'BILL', connectionType: 'NETWORK', targetAddress: '192.168.1.20',
    paperWidth: '80mm', port: 9100, enabled: true, autoPrintKds: true,
  }]);
  assert.equal(migrated.assignments.defaultPrinterId, 'old-printer');
  assert.equal(migrated.assignments.BILL, 'old-printer');
  assert.equal(migrated.printers[0].connection, 'LAN');
  assert.deepEqual(normalizePrinterSettings(migrated), migrated);
  assert.deepEqual(normalizePrinterSettings({ corrupted: true }).printers, []);

  const split = splitOrderByStation({
    id: 'mixed-order',
    items: [
      { name: 'Dal Bhat', category: 'Mains', quantity: 2, station: 'KITCHEN' },
      { name: 'Lassi', category: 'Drinks', quantity: 1, station: 'BAR' },
      { name: 'Water', category: 'Drinks', quantity: 1, station: 'BOTH' },
      { name: 'Uncategorized item', quantity: 1 },
    ],
  });
  assert.deepEqual((split.KOT?.items as Array<{ name: string }>).map((item) => item.name), ['Dal Bhat', 'Water', 'Uncategorized item']);
  assert.deepEqual((split.BOT?.items as Array<{ name: string }>).map((item) => item.name), ['Lassi', 'Water']);
  assert.deepEqual(split.unclassifiedItems, ['Uncategorized item']);

  const queue = new PrintQueue();
  const sequence: string[] = [];
  const first = queue.enqueue('same-printer', 'a', async () => {
    sequence.push('a-start');
    await new Promise((resolve) => setTimeout(resolve, 25));
    sequence.push('a-end');
  }, { bypassDuplicateGuard: true });
  const second = queue.enqueue('same-printer', 'b', async () => { sequence.push('b'); }, { bypassDuplicateGuard: true });
  await Promise.all([first, second]);
  assert.deepEqual(sequence, ['a-start', 'a-end', 'b']);

  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let otherPrinterFinished = false;
  const blocked = queue.enqueue('printer-one', 'blocked', async () => gate, { bypassDuplicateGuard: true });
  const independent = queue.enqueue('printer-two', 'independent', async () => { otherPrinterFinished = true; }, { bypassDuplicateGuard: true });
  await independent;
  assert.equal(otherPrinterFinished, true);
  release();
  await blocked;

  await assert.rejects(queue.enqueue('printer-three', 'failure', async () => { throw new Error('offline'); }, { bypassDuplicateGuard: true }));
  const afterFailure = await queue.enqueue('printer-three', 'next', async () => 'ok', { bypassDuplicateGuard: true });
  assert.equal(afterFailure.value, 'ok');
  const duplicate = await queue.enqueue('printer-four', 'same-job', async () => 'unexpected');
  const duplicateAgain = await queue.enqueue('printer-four', 'same-job', async () => 'unexpected');
  assert.equal(duplicate.skippedDuplicate, false);
  assert.equal(duplicateAgain.skippedDuplicate, true);

  let timedOutDriverDisconnected = false;
  const hanging = new Promise<void>(() => undefined);
  await assert.rejects(queue.enqueue('printer-five', 'hung', async () => hanging, {
    timeoutMs: 10,
    bypassDuplicateGuard: true,
    onTimeout: () => { timedOutDriverDisconnected = true; },
  }));
  assert.equal(timedOutDriverDisconnected, true);
  const afterTimeout = await queue.enqueue('printer-five', 'after-timeout', async () => 'recovered', { bypassDuplicateGuard: true });
  assert.equal(afterTimeout.value, 'recovered');

  const legacyBill = EscPosEncoder.buildReceipt({
    id: 'legacy-order', order_number: 'A-100', table_number: '3', created_at: '2026-01-02T03:04:05.000Z',
    restaurant_name: 'Test Cafe', items: [{ name: 'Tea', quantity: 2, price: 50 }], subtotal: 100,
    tax_amount: 13, total_amount: 113, currency: 'Rs.',
  }, { role: 'BILL', paperWidth: '80mm', autoCut: true, feedLines: 3 });
  const legacyBillDigest = createHash('sha256').update(legacyBill).digest('hex');
  assert.equal(legacyBillDigest, '982be84b66712f3ec57e8322fb387f45d9ba64da605d6f86acf01ef56cc2dfe7');
  console.log('Printer routing, migration, queue, split, and bill regression checks passed. Bill digest:', legacyBillDigest);
}

run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
