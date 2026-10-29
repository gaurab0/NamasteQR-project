import { Router, Request, Response } from 'express';
import net from 'net';
import { printerLimiter } from '../middleware/rateLimit.middleware';
import { authenticate } from '../middleware/auth.middleware';
import { config } from '../config/env';

const router = Router();

// Apply dedicated hardware & LAN printer bridge rate limiting
router.use(printerLimiter);

/**
 * Restricted system ports: prevent TCP port scanning or SSRF against internal databases/services
 */
const BLOCKED_SYSTEM_PORTS = new Set([
  20, 21, 22, 23, 25, 53, 80, 110, 135, 137, 138, 139, 143, 443, 445,
  465, 587, 993, 995, 1433, 1434, 1521, 2049, 2375, 2376, 3000, 3306,
  3389, 5432, 5900, 6379, 8000, 8080, 8443, 8888, 11211, 27017,
]);

export function isRestrictedPort(port: number): boolean {
  return BLOCKED_SYSTEM_PORTS.has(port);
}

/**
 * Validates that host is not targeting dangerous cloud metadata or link-local endpoints
 */
export function isRestrictedHost(host: string): boolean {
  const normalized = host.toLowerCase().trim();
  if (
    normalized === '169.254.169.254' ||
    normalized === 'metadata.google.internal' ||
    normalized === 'metadata' ||
    normalized === 'instance-data' ||
    normalized.startsWith('169.254.') ||
    normalized.includes('169.254.169.254') ||
    normalized === 'fd00:ec2::254' ||
    normalized === '0.0.0.0' ||
    normalized.includes('::ffff:169.254')
  ) {
    return true;
  }
  if (config.isProduction) {
    if (
      normalized === 'localhost' ||
      normalized === '127.0.0.1' ||
      normalized === '::1' ||
      normalized.startsWith('127.') ||
      normalized.includes('::ffff:127.')
    ) {
      return true;
    }
  }
  return false;
}


export function validateTestConnectionInput(req: Request, res: Response, next: () => void) {
  let host = (req.body?.host || req.query?.host || '').toString().trim();
  let port = Number(req.body?.port || req.query?.port) || 9100;

  if (host.includes(':') && !host.includes('[')) {
    const parts = host.split(':');
    host = parts[0].trim();
    if (parts[1]) port = Number(parts[1]) || port;
  }

  if (!host) {
    return res.status(400).json({
      success: false,
      error: 'Missing required "host" (IP address or hostname) for printer connection test.',
    });
  }

  if (isRestrictedHost(host)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid host: connections to cloud metadata or loopback endpoints are strictly prohibited.',
    });
  }

  if (port < 1 || port > 65535) {
    return res.status(400).json({
      success: false,
      error: 'Invalid port: must be between 1 and 65535.',
    });
  }

  if (isRestrictedPort(port)) {
    return res.status(400).json({
      success: false,
      error: `Invalid port: port ${port} is restricted to protect internal services.`,
    });
  }

  next();
}

export function validateLanPrintInput(req: Request, res: Response, next: () => void) {
  let host = '';
  let port = 9100;
  let buffer: Buffer | null = null;

  if (Buffer.isBuffer(req.body)) {
    buffer = req.body;
    host = (req.query.host as string) || (req.headers['x-printer-host'] as string) || '';
    port = Number(req.query.port || req.headers['x-printer-port']) || 9100;
  } else if (req.body && typeof req.body === 'object') {
    host = (req.body.host || req.query.host || '').toString().trim();
    port = Number(req.body.port || req.query.port) || 9100;

    if (Array.isArray(req.body.data)) {
      buffer = Buffer.from(req.body.data);
    } else if (typeof req.body.data === 'string') {
      buffer = Buffer.from(req.body.data, req.body.isBase64 ? 'base64' : 'utf-8');
    }
  }

  if (host.includes(':') && !host.includes('[')) {
    const parts = host.split(':');
    host = parts[0].trim();
    if (parts[1]) port = Number(parts[1]) || port;
  }

  if (!host) {
    return res.status(400).json({
      success: false,
      error: 'Missing printer IP address (host parameter). Please provide printer IP.',
    });
  }

  if (isRestrictedHost(host)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid host: connections to cloud metadata endpoints are strictly prohibited.',
    });
  }

  if (port < 1 || port > 65535) {
    return res.status(400).json({
      success: false,
      error: 'Invalid port: must be between 1 and 65535.',
    });
  }

  if (isRestrictedPort(port)) {
    return res.status(400).json({
      success: false,
      error: `Invalid port: port ${port} is restricted to protect internal services.`,
    });
  }

  if (!buffer || buffer.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Print payload buffer is empty. Nothing to print.',
    });
  }

  if (buffer.length > 5 * 1024 * 1024) {
    return res.status(413).json({
      success: false,
      error: 'Print payload buffer exceeds 5MB size limit.',
    });
  }

  next();
}

/**
 * Health check & hardware bridge status
 */
router.get('/status', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'ServeFlow Hardware & LAN Printer Engine',
    capabilities: ['escpos', 'tcp-socket-stream', 'raw-binary-bridge'],
    defaultPort: 9100,
    timestamp: new Date().toISOString(),
  });
});

/**
 * Quick socket test to verify IP/port reachability
 */
router.post('/test-connection', authenticate, validateTestConnectionInput, (req: Request, res: Response) => {
  let host = (req.body?.host || req.query?.host || '').toString().trim();
  let port = Number(req.body?.port || req.query?.port) || 9100;
  const timeout = Math.min(Math.max(Number(req.body?.timeout) || 4000, 100), 30000);

  if (host.includes(':') && !host.includes('[')) {
    const parts = host.split(':');
    host = parts[0].trim();
    if (parts[1]) port = Number(parts[1]) || port;
  }

  if (!host) {
    return res.status(400).json({
      success: false,
      error: 'Missing required "host" (IP address or hostname) for printer connection test.',
    });
  }

  if (isRestrictedHost(host)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid host: connections to cloud metadata or loopback endpoints are strictly prohibited.',
    });
  }

  if (port < 1 || port > 65535) {
    return res.status(400).json({
      success: false,
      error: 'Invalid port: must be between 1 and 65535.',
    });
  }

  if (isRestrictedPort(port)) {
    return res.status(400).json({
      success: false,
      error: `Invalid port: port ${port} is restricted to protect internal services.`,
    });
  }

  const startTime = Date.now();
  const socket = new net.Socket();
  socket.setTimeout(timeout);
  let finished = false;

  const cleanup = () => {
    socket.removeAllListeners();
    socket.destroy();
  };

  socket.connect(port, host, () => {
    if (finished) return;
    finished = true;
    const latencyMs = Date.now() - startTime;
    cleanup();
    return res.json({
      success: true,
      reachable: true,
      host,
      port,
      latencyMs,
      message: `Successfully connected to printer at ${host}:${port} (${latencyMs}ms)`,
    });
  });

  socket.on('error', (err: Error) => {
    if (finished) return;
    finished = true;
    cleanup();
    return res.status(502).json({
      success: false,
      reachable: false,
      host,
      port,
      error: `Could not reach printer at ${host}:${port}: ${err.message}`,
    });
  });

  socket.on('timeout', () => {
    if (finished) return;
    finished = true;
    cleanup();
    return res.status(504).json({
      success: false,
      reachable: false,
      host,
      port,
      error: `Connection timed out after ${timeout}ms while contacting ${host}:${port}`,
    });
  });
});

/**
 * Direct LAN printer endpoint: pipes raw ESC/POS binary buffer directly
 * to printer's static IP over TCP port 9100 (Raw 9100 / JetDirect protocol)
 */
router.post('/lan', authenticate, validateLanPrintInput, (req: Request, res: Response) => {
  let host = '';
  let port = 9100;
  let timeout = 6000;
  let buffer: Buffer | null = null;

  // Handle binary body or JSON body
  if (Buffer.isBuffer(req.body)) {
    buffer = req.body;
    host = (req.query.host as string) || (req.headers['x-printer-host'] as string) || '';
    port = Number(req.query.port || req.headers['x-printer-port']) || 9100;
  } else if (req.body && typeof req.body === 'object') {
    host = (req.body.host || req.query.host || '').toString().trim();
    port = Number(req.body.port || req.query.port) || 9100;
    timeout = Math.min(Math.max(Number(req.body.timeout) || 6000, 100), 30000);

    if (Array.isArray(req.body.data)) {
      buffer = Buffer.from(req.body.data);
    } else if (typeof req.body.data === 'string') {
      // Support base64 or raw string
      buffer = Buffer.from(req.body.data, req.body.isBase64 ? 'base64' : 'utf-8');
    }
  }

  if (host.includes(':') && !host.includes('[')) {
    const parts = host.split(':');
    host = parts[0].trim();
    if (parts[1]) port = Number(parts[1]) || port;
  }

  if (!host) {
    return res.status(400).json({
      success: false,
      error: 'Missing printer IP address (host parameter). Please provide printer IP.',
    });
  }

  if (isRestrictedHost(host)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid host: connections to cloud metadata endpoints are strictly prohibited.',
    });
  }

  if (port < 1 || port > 65535) {
    return res.status(400).json({
      success: false,
      error: 'Invalid port: must be between 1 and 65535.',
    });
  }

  if (isRestrictedPort(port)) {
    return res.status(400).json({
      success: false,
      error: `Invalid port: port ${port} is restricted to protect internal services.`,
    });
  }

  if (!buffer || buffer.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Print payload buffer is empty. Nothing to print.',
    });
  }

  if (buffer.length > 5 * 1024 * 1024) {
    return res.status(413).json({
      success: false,
      error: 'Print payload buffer exceeds 5MB size limit.',
    });
  }

  const socket = new net.Socket();
  socket.setTimeout(timeout);
  let completed = false;

  const cleanup = () => {
    socket.removeAllListeners();
    socket.destroy();
  };

  socket.connect(port, host, () => {
    socket.write(buffer as Buffer, () => {
      socket.end();
    });
  });

  socket.on('close', () => {
    if (completed) return;
    completed = true;
    cleanup();
    return res.json({
      success: true,
      message: `Transmitted ${buffer!.length} bytes to thermal printer at ${host}:${port}`,
      bytes: buffer!.length,
    });
  });

  socket.on('error', (err: Error) => {
    if (completed) return;
    completed = true;
    cleanup();
    console.error(`[LAN Printer Error] Failed sending to ${host}:${port}:`, err.message);
    return res.status(502).json({
      success: false,
      error: `Failed to print to ${host}:${port}: ${err.message}`,
    });
  });

  socket.on('timeout', () => {
    if (completed) return;
    completed = true;
    cleanup();
    console.error(`[LAN Printer Timeout] Timeout printing to ${host}:${port}`);
    return res.status(504).json({
      success: false,
      error: `Printer socket timed out after ${timeout}ms connecting to ${host}:${port}`,
    });
  });
});

export default router;
