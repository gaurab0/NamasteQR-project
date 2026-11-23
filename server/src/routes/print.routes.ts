import { Router, Request, Response } from 'express';
import net from 'net';
import { isIP } from 'net';
import { printerLimiter } from '../middleware/rateLimit.middleware';
import { authenticate, AuthenticatedRequest } from '../middleware/auth.middleware';
import { enqueueRawPrintJob } from '../services/print-job.service';
import { prisma } from '../lib/prisma';

const router = Router();

// Apply dedicated hardware & LAN printer bridge rate limiting
router.use(printerLimiter);

/**
 * Restricted system ports: prevent TCP port scanning or SSRF against internal databases/services
 */
export function isRestrictedPort(port: number): boolean {
  const configured = (process.env.NAMASTEQR_PRINTER_ALLOWED_PORTS || '')
    .split(',').map((value) => Number(value.trim())).filter((value) => Number.isInteger(value) && value > 0 && value <= 65535);
  return port !== 9100 && !configured.includes(port);
}

/**
 * Validates that host is not targeting dangerous cloud metadata or link-local endpoints
 */
export function isRestrictedHost(host: string): boolean {
  const normalized = host.toLowerCase().trim();
  const explicitHosts = (process.env.NAMASTEQR_PRINTER_ALLOWED_HOSTS || '')
    .split(',').map((value) => value.trim().toLowerCase()).filter(Boolean);
  if (explicitHosts.includes(normalized)) return false;
  if (isIP(normalized) === 4) {
    const octets = normalized.split('.').map(Number);
    return !(octets[0] === 10 || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
      (octets[0] === 192 && octets[1] === 168));
  }
  if (isIP(normalized) === 6) {
    const address = normalized.replace(/^\[|\]$/g, '');
    return !(address.startsWith('fc') || address.startsWith('fd') || address.startsWith('fe8') ||
      address.startsWith('fe9') || address.startsWith('fea') || address.startsWith('feb'));
  }
  return true;
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
    error: 'Invalid host: only private LAN addresses or explicitly allowlisted hosts are permitted.',
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
    error: 'Invalid host: only private LAN addresses or explicitly allowlisted hosts are permitted.',
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
 * Queues a browser-generated ESC/POS payload for the on-site agent. The browser sends only a
 * logical role; private printer addresses are kept in the agent's local config.
 */
router.post('/queue', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  const role = String(req.body?.role || '').toUpperCase();
  const base64 = req.body?.base64;
  const idempotencyKey = String(req.body?.idempotencyKey || '');
  const allowedRoles = new Set(['KOT', 'BOT', 'BAR', 'BILL', 'BOTH']);
  if (!allowedRoles.has(role)) {
    return res.status(400).json({ success: false, error: 'A supported printer role is required.' });
  }
  if (typeof base64 !== 'string' || !base64 || base64.length > 4_000_000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) {
    return res.status(413).json({ success: false, error: 'Print payload is missing, malformed, or too large.' });
  }
  const decoded = Buffer.from(base64, 'base64');
  if (!decoded.length || decoded.length > 3_000_000) {
    return res.status(413).json({ success: false, error: 'Print payload is empty or exceeds the 3 MB limit.' });
  }
  if (!/^[A-Za-z0-9:_-]{8,160}$/.test(idempotencyKey)) {
    return res.status(400).json({ success: false, error: 'A valid idempotencyKey is required.' });
  }
  const businessId = req.user?.business?.id;
  if (!businessId) return res.status(401).json({ success: false, error: 'Business session is required.' });

  try {
    const job = await enqueueRawPrintJob({
      businessId,
      role: role === 'BAR' || role === 'BOTH' ? 'BOT' : role,
      base64,
      idempotencyKey,
    });
    if (!job) {
      return res.status(409).json({ success: false, code: 'NO_PRINT_AGENT', error: 'No active print agent is registered for this business.' });
    }
    return res.status(202).json({ success: true, queued: true, jobId: job.id });
  } catch (error) {
    console.error('[PrintRoute] Could not queue print job:', error);
    return res.status(503).json({ success: false, error: 'Could not queue print job. Retry shortly.' });
  }
});

/** Reports whether this business has an active on-site print agent. */
router.get('/agent-status', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  const businessId = req.user?.business?.id;
  if (!businessId) return res.status(401).json({ success: false, error: 'Business session is required.' });
  try {
    const agent = await prisma.printerAgent.findFirst({
      where: { business_id: businessId, revoked_at: null },
      select: { id: true, last_seen_at: true },
      orderBy: { last_seen_at: 'desc' },
    });
    return res.json({ success: true, available: Boolean(agent), lastSeenAt: agent?.last_seen_at || null });
  } catch (error) {
    console.error('[PrintRoute] Could not check print agent:', error);
    return res.status(503).json({ success: false, error: 'Could not check print agent status.' });
  }
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
