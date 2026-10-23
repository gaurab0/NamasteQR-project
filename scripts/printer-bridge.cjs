/**
 * ServeFlow Local Thermal Printer Hardware Bridge
 * 
 * Lightweight standalone Node.js bridge service that accepts raw binary
 * ESC/POS commands via HTTP POST from browser apps and streams them over
 * direct TCP sockets (net.Socket) to thermal receipt printers on port 9100.
 * 
 * Usage:
 *   node scripts/printer-bridge.cjs
 *   or with custom port:
 *   PORT=9100 PRINTER_HOST=192.168.1.100 node scripts/printer-bridge.cjs
 */

const express = require('express');
const cors = require('cors');
const net = require('net');

const app = express();
const PORT = process.env.BRIDGE_PORT || process.env.PORT || 9100;
const DEFAULT_PRINTER_HOST = process.env.PRINTER_HOST || '127.0.0.1';
const DEFAULT_PRINTER_PORT = Number(process.env.PRINTER_PORT) || 9100;

app.use(cors({ origin: true, credentials: true }));
app.use(express.raw({ type: '*/*', limit: '10mb' }));

app.get('/', (_req, res) => {
  res.json({
    status: 'online',
    service: 'ServeFlow Thermal Printer Hardware Bridge',
    port: PORT,
    defaultPrinter: `${DEFAULT_PRINTER_HOST}:${DEFAULT_PRINTER_PORT}`,
    endpoints: {
      print: 'POST /print?host=192.168.1.100&port=9100',
      ping: 'GET /ping?host=192.168.1.100',
    },
    version: '1.0.0',
  });
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Ping / probe printer reachability
app.get('/ping', (req, res) => {
  let host = req.query.host || DEFAULT_PRINTER_HOST;
  let port = Number(req.query.port) || DEFAULT_PRINTER_PORT;
  const timeout = Number(req.query.timeout) || 3000;

  if (typeof host === 'string' && host.includes(':') && !host.includes('[')) {
    const parts = host.split(':');
    host = parts[0].trim();
    if (parts[1]) port = Number(parts[1]) || port;
  }

  const socket = new net.Socket();
  socket.setTimeout(timeout);

  let done = false;
  socket.connect(port, host, () => {
    if (done) return;
    done = true;
    socket.destroy();
    res.json({ success: true, reachable: true, host, port });
  });

  socket.on('error', (err) => {
    if (done) return;
    done = true;
    socket.destroy();
    res.status(502).json({ success: false, reachable: false, host, port, error: err.message });
  });

  socket.on('timeout', () => {
    if (done) return;
    done = true;
    socket.destroy();
    res.status(504).json({ success: false, reachable: false, host, port, error: 'Connection timed out' });
  });
});

// Print raw binary buffer to target printer
app.post('/print', (req, res) => {
  let host = req.query.host || req.headers['x-printer-host'] || DEFAULT_PRINTER_HOST;
  let port = Number(req.query.port || req.headers['x-printer-port']) || DEFAULT_PRINTER_PORT;
  const timeout = Number(req.query.timeout) || 6000;

  if (typeof host === 'string' && host.includes(':') && !host.includes('[')) {
    const parts = host.split(':');
    host = parts[0].trim();
    if (parts[1]) port = Number(parts[1]) || port;
  }

  let buffer = req.body;
  if (!Buffer.isBuffer(buffer)) {
    if (typeof buffer === 'string') {
      buffer = Buffer.from(buffer, 'utf-8');
    } else {
      buffer = Buffer.from([]);
    }
  }

  if (buffer.length === 0) {
    return res.status(400).json({ success: false, error: 'No print payload received in request body.' });
  }

  console.log(`[Bridge] Relaying ${buffer.length} bytes to printer at ${host}:${port}...`);

  const socket = new net.Socket();
  socket.setTimeout(timeout);
  let completed = false;

  const cleanup = () => {
    socket.removeAllListeners();
    socket.destroy();
  };

  socket.connect(port, host, () => {
    socket.write(buffer, () => {
      socket.end();
    });
  });

  socket.on('close', () => {
    if (completed) return;
    completed = true;
    cleanup();
    console.log(`[Bridge] Done: Sent ${buffer.length} bytes to ${host}:${port}`);
    return res.json({ success: true, bytesSent: buffer.length, host, port });
  });

  socket.on('error', (err) => {
    if (completed) return;
    completed = true;
    cleanup();
    console.error(`[Bridge Error] Socket error for ${host}:${port}:`, err.message);
    return res.status(502).json({ success: false, error: `Printer socket error: ${err.message}` });
  });

  socket.on('timeout', () => {
    if (completed) return;
    completed = true;
    cleanup();
    console.error(`[Bridge Timeout] Timeout connecting to ${host}:${port}`);
    return res.status(504).json({ success: false, error: `Socket timeout after ${timeout}ms connecting to ${host}:${port}` });
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🖨️ ServeFlow Thermal Printer Bridge listening on http://0.0.0.0:${PORT}`);
  console.log(`👉 POST raw ESC/POS binary data to http://localhost:${PORT}/print?host=<PRINTER_IP>&port=9100`);
});
