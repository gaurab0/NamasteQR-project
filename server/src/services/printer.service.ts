import net, { Socket } from 'net';

export type PrinterTarget = { host?: string; port?: number };
export type PrinterCheckResult = {
  ok: boolean;
  stage: 'relay' | 'printer';
  error?: string;
  confirmed: boolean;
  ms: number;
};

export class PrinterError extends Error {
  code: string;
  cause?: unknown;

  constructor(message: string, code = 'PRINT_FAILED', cause?: unknown) {
    super(message);
    this.name = 'PrinterError';
    this.code = code;
    this.cause = cause;
  }
}

type ResolvedTarget = { host: string; port: number };
const queues = new Map<string, Promise<void>>();
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function numberEnv(name: string, fallback: number, minimum = 0): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed >= minimum ? parsed : fallback;
}

function resolveTarget(target?: PrinterTarget): ResolvedTarget {
  const host = target?.host || process.env.PRINTER_RELAY_HOST || '';
  const port = target?.port ?? numberEnv('PRINTER_RELAY_PORT', 9100, 1);
  if (!host) throw new PrinterError('Printing failed: no printer relay host is configured.', 'NO_TARGET');
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new PrinterError('Printing failed: printer relay port is invalid.', 'INVALID_TARGET');
  }
  return { host, port };
}

async function serialized<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = queues.get(key) || Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  const queued = previous.then(() => current);
  queues.set(key, queued);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (queues.get(key) === queued) queues.delete(key);
  }
}

function connectDirect(target: ResolvedTarget, timeoutMs: number): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let settled = false;
    const timer = setTimeout(() => {
      const error = Object.assign(new Error(`Connection timed out after ${timeoutMs}ms.`), { code: 'ETIMEDOUT' });
      finish(error);
    }, timeoutMs);
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) { socket.destroy(); reject(error); }
      else resolve(socket);
    };
    socket.once('error', finish);
    socket.once('connect', () => finish());
    socket.connect(target.port, target.host);
  });
}

async function connectPrinter(target: ResolvedTarget, timeoutMs: number): Promise<Socket> {
  const proxy = process.env.PRINTER_PROXY?.trim();
  if (!proxy) return connectDirect(target, timeoutMs);
  const match = /^(\[[^\]]+\]|[^:]+):(\d+)$/.exec(proxy);
  if (!match) throw new PrinterError('Printing failed: PRINTER_PROXY must be host:port.', 'INVALID_PROXY');
  const proxyHost = match[1].replace(/^\[|\]$/g, '');
  const proxyPort = Number(match[2]);
  if (proxyPort < 1 || proxyPort > 65535) {
    throw new PrinterError('Printing failed: PRINTER_PROXY port is invalid.', 'INVALID_PROXY');
  }
  try {
    // Lazy load so direct local development does not require the optional SOCKS dependency.
    const { SocksClient } = await import('socks');
    const { socket } = await SocksClient.createConnection({
      command: 'connect',
      destination: { host: target.host, port: target.port },
      proxy: { host: proxyHost, port: proxyPort, type: 5 },
      timeout: timeoutMs,
    });
    return socket as Socket;
  } catch (error) {
    const cause = error as NodeJS.ErrnoException;
    const details = String(cause?.message || error);
    const proxyOptions = (error as { options?: { proxy?: { host?: string; port?: number } } })?.options?.proxy;
    const proxyOptionsMatch = proxyOptions?.host === proxyHost && Number(proxyOptions.port) === proxyPort;
    const proxyMessageMatch = details.includes(`${proxyHost}:${proxyPort}`) ||
      new RegExp(`(?:^|\\D)${proxyPort}(?:$|\\D)`).test(details);
    if (/ECONNREFUSED/i.test(details) && (proxyOptionsMatch || proxyMessageMatch)) {
      throw new PrinterError('The VPN proxy is not running on this server (Tailscale did not start).', 'PROXY_UNAVAILABLE', error);
    }
    throw error;
  }
}

function friendlyError(error: unknown, connected: boolean): PrinterError {
  if (error instanceof PrinterError) return error;
  const err = error as NodeJS.ErrnoException;
  const code = String(err?.code || 'PRINT_FAILED').toUpperCase();
  const detail = err?.message || String(error);
  if (code === 'PROXY_UNAVAILABLE') {
    return new PrinterError('The VPN proxy is not running on this server (Tailscale did not start).', code, error);
  }
  if (['ETIMEDOUT', 'EHOSTUNREACH', 'EHOSTDOWN', 'ENETUNREACH', 'EHOSTUNREACH', 'EAI_AGAIN', 'EHOSTUNREACH'].includes(code) || /ttl expired|host unreachable|network is unreachable/i.test(detail)) {
    return new PrinterError('Cannot reach the restaurant PC. Check that it is on and Tailscale is connected.', code, error);
  }
  if (code === 'ECONNREFUSED' || /Socks5 proxy rejected connection\s*-\s*ConnectionRefused/i.test(detail)) {
    return new PrinterError('The restaurant PC refused the connection. Check the port-forwarding and firewall rules.', code, error);
  }
  if (connected || ['ECONNRESET', 'EPIPE', 'ERR_STREAM_PREMATURE_CLOSE'].includes(code)) {
    return new PrinterError('The restaurant PC answered, but the connection to the printer was dropped. Check the printer\'s power and network cable.', code, error);
  }
  return new PrinterError(`Printing failed: ${detail}`, code, error);
}

function waitForPeerClose(socket: Socket, timeoutMs: number): Promise<void> {
  if (socket.destroyed || socket.readableEnded) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => { clearTimeout(timer); socket.removeListener('close', done); resolve(); };
    const timer = setTimeout(done, timeoutMs);
    socket.once('close', done);
  });
}

async function sendOnce(target: ResolvedTarget, data: Buffer, timeoutMs: number, lingerMs: number, deadline: number): Promise<void> {
  let socket: Socket | undefined;
  let connected = false;
  let overallTimer: NodeJS.Timeout | undefined;
  try {
    const connectBudget = Math.max(1, Math.min(timeoutMs, deadline - Date.now()));
    socket = await connectPrinter(target, connectBudget);
    connected = true;
    const remaining = Math.max(1, deadline - Date.now());
    const failure = await new Promise<Error | undefined>((resolve, reject) => {
      let settled = false;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(overallTimer);
        socket!.removeListener('error', onError);
        socket!.removeListener('close', onClose);
        if (error) reject(error); else resolve(undefined);
      };
      const onError = (error: Error) => finish(error);
      const onClose = () => finish(Object.assign(new Error('Connection closed during print.'), { code: 'ECONNRESET' }));
      socket!.once('error', onError);
      socket!.once('close', onClose);
      overallTimer = setTimeout(() => finish(Object.assign(new Error('Printing timed out.'), { code: 'ETIMEDOUT' })), remaining);
      socket!.write(data, (error?: Error | null) => {
        if (error) return finish(error);
        const watchMs = Math.min(lingerMs, Math.max(0, deadline - Date.now()));
        const halfClose = () => {
          if (settled) return;
          socket!.removeListener('close', onClose);
          socket!.removeListener('error', onError);
          // Errors after the configured linger window do not fail the job, but must be consumed.
          socket!.on('error', () => undefined);
          clearTimeout(overallTimer);
          socket!.end();
          void waitForPeerClose(socket!, Math.min(1000, Math.max(0, deadline - Date.now()))).then(() => finish());
        };
        if (watchMs === 0) halfClose();
        else setTimeout(halfClose, watchMs);
      });
    });
    if (failure) throw failure;
  } catch (error) {
    socket?.destroy();
    throw friendlyError(error, connected);
  } finally {
    clearTimeout(overallTimer);
    if (socket && !socket.destroyed) socket.destroy();
  }
}

export async function printRaw(data: Buffer | Uint8Array | string, target?: PrinterTarget): Promise<void> {
  const resolved = resolveTarget(target);
  const bytes = typeof data === 'string' ? Buffer.from(data) : Buffer.from(data);
  if (!bytes.length) throw new PrinterError('Printing failed: print payload is empty.', 'EMPTY_PAYLOAD');
  return serialized(`${resolved.host}:${resolved.port}`, async () => {
    const attempts = Math.max(1, Math.floor(numberEnv('PRINTER_ATTEMPTS', 3, 1)));
    const timeoutMs = numberEnv('PRINTER_TIMEOUT_MS', 5000, 1);
    const lingerMs = numberEnv('PRINTER_LINGER_MS', 500, 0);
    const deadline = Date.now() + 15_000;
    let lastError: PrinterError | undefined;
    for (let attempt = 1; attempt <= attempts && Date.now() < deadline; attempt++) {
      try {
        await sendOnce(resolved, bytes, timeoutMs, lingerMs, deadline);
        return;
      } catch (error) {
        lastError = friendlyError(error, error instanceof PrinterError && error.code === 'ECONNRESET');
        console.error(`[Printer] Attempt ${attempt}/${attempts} failed for ${resolved.host}:${resolved.port}: ${lastError.code} ${lastError.message}`);
        if (attempt < attempts && Date.now() < deadline) await delay(Math.min(attempt === 1 ? 1000 : 3000, Math.max(0, deadline - Date.now())));
      }
    }
    throw lastError || new PrinterError('Printing failed: 15 second send timeout exceeded.', 'ETIMEDOUT');
  });
}

export async function checkPrinter(target?: PrinterTarget, options: { holdMs?: number; statusQuery?: boolean } = {}): Promise<PrinterCheckResult> {
  const started = Date.now();
  let resolved: ResolvedTarget;
  try { resolved = resolveTarget(target); }
  catch (error) { return { ok: false, stage: 'relay', error: (error as Error).message, confirmed: false, ms: Date.now() - started }; }
  return serialized(`${resolved.host}:${resolved.port}`, async () => {
    const timeout = numberEnv('PRINTER_TIMEOUT_MS', 5000, 1);
    let socket: Socket | undefined;
    let connected = false;
    try {
      socket = await connectPrinter(resolved, timeout);
      connected = true;
      let confirmed = false;
      let dropped: Error | undefined;
      socket.on('data', () => { confirmed = true; });
      socket.once('error', (error) => { dropped = error; });
      socket.once('close', () => { if (!dropped) dropped = Object.assign(new Error('Connection closed during printer check.'), { code: 'ECONNRESET' }); });
      if (options.statusQuery) socket.write(Buffer.from([0x10, 0x04, 0x01]));
      await delay(Math.min(Math.max(0, options.holdMs ?? 2000), 15_000));
      if (dropped) throw dropped;
      socket.end();
      return { ok: true, stage: 'printer', confirmed, ms: Date.now() - started };
    } catch (error) {
      const friendly = friendlyError(error, connected);
      return { ok: false, stage: connected ? 'printer' : 'relay', error: friendly.message, confirmed: false, ms: Date.now() - started };
    } finally {
      socket?.destroy();
    }
  });
}

export function testReceipt(text = 'NamasteQR printer test'): Buffer {
  return Buffer.concat([
    Buffer.from([0x1b, 0x40]),
    Buffer.from(`${text}\n${new Date().toISOString()}\n\n\n`, 'utf8'),
    Buffer.from([0x1d, 0x56, 0x42, 0x00]),
  ]);
}
