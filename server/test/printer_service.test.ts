import assert from 'node:assert/strict';
import net from 'node:net';
import { printRaw, PrinterError } from '../src/services/printer.service';

async function run() {
  const old = {
    host: process.env.PRINTER_RELAY_HOST,
    port: process.env.PRINTER_RELAY_PORT,
    proxy: process.env.PRINTER_PROXY,
    attempts: process.env.PRINTER_ATTEMPTS,
    timeout: process.env.PRINTER_TIMEOUT_MS,
    linger: process.env.PRINTER_LINGER_MS,
  };
  process.env.PRINTER_PROXY = '';
  process.env.PRINTER_ATTEMPTS = '1';
  process.env.PRINTER_TIMEOUT_MS = '1000';
  process.env.PRINTER_LINGER_MS = '100';

  let received = Buffer.alloc(0);
  const printer = net.createServer((socket) => {
    socket.on('data', (chunk) => { received = Buffer.concat([received, chunk]); });
    socket.on('end', () => socket.end());
  });
  await new Promise<void>((resolve) => printer.listen(0, '127.0.0.1', resolve));
  const port = (printer.address() as net.AddressInfo).port;
  process.env.PRINTER_RELAY_HOST = '127.0.0.1';
  process.env.PRINTER_RELAY_PORT = String(port);
  const expected = Buffer.from([0x1b, 0x40, 0x48, 0x69, 0x0a]);
  await printRaw(expected);
  assert.deepEqual(received, expected, 'fake printer receives the exact ESC/POS bytes');
  await new Promise<void>((resolve, reject) => printer.close((error) => error ? reject(error) : resolve()));

  const closingPrinter = net.createServer((socket) => socket.destroy());
  await new Promise<void>((resolve) => closingPrinter.listen(0, '127.0.0.1', resolve));
  process.env.PRINTER_RELAY_PORT = String((closingPrinter.address() as net.AddressInfo).port);
  await assert.rejects(
    printRaw(Buffer.from('drop')),
    (error: unknown) => error instanceof PrinterError && error.message === 'The restaurant PC answered, but the connection to the printer was dropped. Check the printer\'s power and network cable.',
  );
  await new Promise<void>((resolve, reject) => closingPrinter.close((error) => error ? reject(error) : resolve()));

  const stoppedProxy = net.createServer();
  await new Promise<void>((resolve) => stoppedProxy.listen(0, '127.0.0.1', resolve));
  const stoppedProxyPort = (stoppedProxy.address() as net.AddressInfo).port;
  await new Promise<void>((resolve, reject) => stoppedProxy.close((error) => error ? reject(error) : resolve()));
  process.env.PRINTER_PROXY = `127.0.0.1:${stoppedProxyPort}`;
  process.env.PRINTER_RELAY_PORT = '9100';
  await assert.rejects(
    printRaw(Buffer.from('proxy-down')),
    (error: unknown) => error instanceof PrinterError && error.message === 'The VPN proxy is not running on this server (Tailscale did not start).',
  );

  const refusingProxy = net.createServer((socket) => {
    let receivedGreeting = false;
    socket.on('data', () => {
      if (!receivedGreeting) {
        receivedGreeting = true;
        socket.write(Buffer.from([0x05, 0x00]));
      } else {
        socket.write(Buffer.from([0x05, 0x05, 0x00, 0x01, 127, 0, 0, 1, 0, 0]));
      }
    });
  });
  await new Promise<void>((resolve) => refusingProxy.listen(0, '127.0.0.1', resolve));
  process.env.PRINTER_PROXY = `127.0.0.1:${(refusingProxy.address() as net.AddressInfo).port}`;
  await assert.rejects(
    printRaw(Buffer.from('printer-refused')),
    (error: unknown) => error instanceof PrinterError && error.message === 'The restaurant PC refused the connection. Check the port-forwarding and firewall rules.',
  );
  await new Promise<void>((resolve, reject) => refusingProxy.close((error) => error ? reject(error) : resolve()));

  for (const [key, value] of Object.entries({
    PRINTER_RELAY_HOST: old.host,
    PRINTER_RELAY_PORT: old.port,
    PRINTER_PROXY: old.proxy,
    PRINTER_ATTEMPTS: old.attempts,
    PRINTER_TIMEOUT_MS: old.timeout,
    PRINTER_LINGER_MS: old.linger,
  })) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  console.log('Printer service fake TCP checks passed.');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
