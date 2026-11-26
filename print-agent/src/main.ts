import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { EscPosEncoder } from '../../src/utils/escpos';
import { checkPrinter, printRaw } from '../../server/src/services/printer.service';

export type PrinterRole = 'KOT' | 'BOT' | 'BILL';
export type PrinterConfig = {
  host: string;
  port?: number;
  paperWidth?: '58mm' | '80mm';
  autoCut?: boolean;
  feedLines?: number;
  openCashDrawer?: boolean;
};
export type AgentConfig = {
  apiBaseUrl: string;
  token: string;
  pollIntervalMs?: number;
  printers: Partial<Record<PrinterRole, PrinterConfig>>;
};
export type PrintJob = {
  id: string;
  printer_role: string;
  payload_type: string;
  payload: { order?: Record<string, any>; base64?: string; host?: string; port?: number };
  attempt_count: number;
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isPrivateIPv4(host: string): boolean {
  const octets = host.split('.').map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return octets[0] === 10 ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168);
}

export function validateConfig(config: AgentConfig): AgentConfig {
  if (!config || typeof config !== 'object') throw new Error('Agent config must be a JSON object.');
  if (typeof config.apiBaseUrl !== 'string' || !config.apiBaseUrl.trim()) throw new Error('apiBaseUrl is required.');
  const api = new URL(config.apiBaseUrl);
  if (api.username || api.password || api.search || api.hash) throw new Error('apiBaseUrl cannot include credentials, a query, or a fragment.');
  if (api.protocol !== 'https:' && !(api.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(api.hostname))) {
    throw new Error('apiBaseUrl must use HTTPS except for localhost development.');
  }
  if (typeof config.token !== 'string' || !/^nqr_pa_[A-Za-z0-9_-]{43}$/.test(config.token)) {
    throw new Error('A valid provisioned printer-agent token is required.');
  }
  if (!config.printers || typeof config.printers !== 'object' || Array.isArray(config.printers)) {
    throw new Error('printers must be an object mapping KOT, BOT, or BILL to a local printer.');
  }
  const entries = Object.entries(config.printers);
  if (!entries.length || entries.every(([, printer]) => !printer)) throw new Error('Configure at least one local printer role.');
  for (const [role, printer] of entries) {
    if (!['KOT', 'BOT', 'BILL'].includes(role)) throw new Error(`Unsupported printer role '${role}'.`);
    if (!printer) continue;
    if (typeof printer.host !== 'string') throw new Error(`${role} host must be a private IPv4 address.`);
    if (!isPrivateIPv4(printer.host)) throw new Error(`${role} host must be a private IPv4 address (10/8, 172.16/12, or 192.168/16).`);
    const port = printer.port ?? 9100;
    if (port !== 9100) throw new Error(`${role} must use raw ESC/POS TCP port 9100.`);
    if (printer.paperWidth && !['58mm', '80mm'].includes(printer.paperWidth)) throw new Error(`${role} paperWidth must be 58mm or 80mm.`);
    if (printer.feedLines !== undefined && (!Number.isInteger(printer.feedLines) || printer.feedLines < 0 || printer.feedLines > 20)) {
      throw new Error(`${role} feedLines must be an integer between 0 and 20.`);
    }
  }
  if (config.pollIntervalMs !== undefined && (!Number.isFinite(config.pollIntervalMs) || config.pollIntervalMs < 1_000 || config.pollIntervalMs > 30_000)) {
    throw new Error('pollIntervalMs must be between 1000 and 30000.');
  }
  return config;
}

function loadConfig(): AgentConfig {
  const configPath = process.env.PRINT_AGENT_CONFIG || path.resolve('print-agent/agent.config.json');
  if (!fs.existsSync(configPath)) {
    throw new Error(`Agent config not found at ${configPath}. Copy print-agent/config.example.json to that path and fill it in.`);
  }
  return validateConfig(JSON.parse(fs.readFileSync(configPath, 'utf8')) as AgentConfig);
}

export function toPrintBytes(job: PrintJob, printer: PrinterConfig): Buffer {
  if (job.payload_type === 'RAW_ESCPOS') {
    const base64 = job.payload?.base64;
    if (!base64 || base64.length > 4_000_000 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64)) {
      throw new Error('Invalid or oversized raw ESC/POS payload.');
    }
    const bytes = Buffer.from(base64, 'base64');
    if (!bytes.length || bytes.length > 3_000_000 || bytes.toString('base64') !== base64) {
      throw new Error('Raw ESC/POS payload is empty, malformed, or oversized.');
    }
    return bytes;
  }
  if (job.payload_type !== 'ORDER' || !job.payload?.order) throw new Error(`Unsupported print payload type '${job.payload_type}'.`);

  const role = job.printer_role === 'BOT' ? 'BAR' : job.printer_role === 'BOTH' ? 'KOT' : job.printer_role;
  if (!['KOT', 'BAR', 'BILL'].includes(role)) throw new Error(`Unsupported printer role '${job.printer_role}'.`);
  const bytes = EscPosEncoder.buildReceipt(job.payload.order, {
    role: role as 'KOT' | 'BAR' | 'BILL',
    paperWidth: printer.paperWidth || '80mm',
    autoCut: printer.autoCut ?? true,
    feedLines: printer.feedLines ?? 3,
    openCashDrawer: printer.openCashDrawer ?? role === 'BILL',
  });
  return Buffer.from(bytes);
}

export function sendToPrinter(printer: PrinterConfig, bytes: Buffer): Promise<void> {
  if (bytes.length === 0 || bytes.length > 4_000_000) return Promise.reject(new Error('Print payload is empty or exceeds 4 MB.'));
  const port = printer.port ?? 9100;
  return printRaw(bytes, { host: printer.host, port });
}

export function probePrinter(printer: PrinterConfig, timeoutMs = 3_500): Promise<number> {
  const port = printer.port ?? 9100;
  return checkPrinter({ host: printer.host, port }, { holdMs: timeoutMs }).then((result) => {
    if (!result.ok) throw new Error(result.error || `Could not reach printer at ${printer.host}:${port}.`);
    return result.ms;
  });
}

async function apiRequest(config: AgentConfig, route: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${config.token}`);
  headers.set('Content-Type', 'application/json');
  return fetch(new URL(route, config.apiBaseUrl), {
    ...init,
    headers,
    signal: AbortSignal.timeout(20_000),
  });
}

async function acknowledge(config: AgentConfig, jobId: string, success: boolean, error?: string, latencyMs?: number) {
  const response = await apiRequest(config, `/api/print-agent/jobs/${encodeURIComponent(jobId)}/ack`, {
    method: 'POST',
    body: JSON.stringify({ success, error, latencyMs }),
  });
  if (!response.ok) throw new Error(`Job acknowledgement returned HTTP ${response.status}.`);
}

async function processJob(config: AgentConfig, job: PrintJob): Promise<{ latencyMs?: number }> {
  if (job.payload_type === 'PRINTER_PROBE') {
    const host = job.payload?.host;
    const port = job.payload?.port ?? 9100;
    if (!host || port !== 9100) throw new Error('The printer check has an invalid host or port.');
    const printer = Object.values(config.printers).find((candidate) => candidate?.host === host && (candidate.port ?? 9100) === port);
    if (!printer) throw new Error(`Printer ${host}:${port} is not configured in this local print agent. Update print-agent/agent.config.json.`);
    return { latencyMs: await probePrinter(printer) };
  }
  const role = (job.printer_role === 'BAR' ? 'BOT' : job.printer_role) as PrinterRole;
  const printer = config.printers[role];
  if (!printer) throw new Error(`No local printer is configured for role ${role}.`);
  const bytes = toPrintBytes(job, printer);
  await sendToPrinter(printer, bytes);
  return {};
}

async function run() {
  const config = loadConfig();
  const pollMs = Math.max(1_000, Math.min(30_000, config.pollIntervalMs ?? 2_500));
  console.log(`[PrintAgent] Started for ${new URL(config.apiBaseUrl).origin}; printer roles: ${Object.keys(config.printers).filter((key) => config.printers[key as PrinterRole]).join(', ') || 'none'}.`);

  let stopping = false;
  process.once('SIGINT', () => { stopping = true; });
  process.once('SIGTERM', () => { stopping = true; });
  let errorBackoff = 1_000;

  while (!stopping) {
    try {
      const response = await apiRequest(config, '/api/print-agent/jobs/claim', { method: 'POST', body: '{}' });
      if (response.status === 401) throw new Error('Agent token was rejected or revoked.');
      if (response.status === 429) {
        await wait(5_000);
        continue;
      }
      if (!response.ok) throw new Error(`Job poll returned HTTP ${response.status}.`);
      const body = await response.json() as { job?: PrintJob | null };
      errorBackoff = 1_000;
      if (!body.job) {
        await wait(pollMs);
        continue;
      }

      let result: { latencyMs?: number };
      try {
        result = await processJob(config, body.job);
      } catch (jobError) {
        const message = jobError instanceof Error ? jobError.message : String(jobError);
        console.error(`[PrintAgent] Job ${body.job.id} failed: ${message}`);
        try {
          await acknowledge(config, body.job.id, false, message);
        } catch (ackError) {
          console.error('[PrintAgent] Could not report job failure; it will be reclaimed after its lease expires.', ackError);
        }
        continue;
      }

      try {
        await acknowledge(config, body.job.id, true, undefined, result.latencyMs);
        console.log(`[PrintAgent] Completed ${body.job.payload_type === 'PRINTER_PROBE' ? 'printer check' : 'print job'} ${body.job.id}.`);
      } catch (ackError) {
        console.error(`[PrintAgent] The success acknowledgement failed for ${body.job.id}. The job will be reclaimed after its lease expires.`, ackError);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[PrintAgent] Poll error: ${message}`);
      if (message.includes('token was rejected')) {
        process.exitCode = 1;
        stopping = true;
      }
      await wait(errorBackoff);
      errorBackoff = Math.min(30_000, errorBackoff * 2);
    }
  }
  console.log('[PrintAgent] Stopped.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  run().catch((error) => {
    console.error('[PrintAgent] Fatal startup error:', error);
    process.exitCode = 1;
  });
}
