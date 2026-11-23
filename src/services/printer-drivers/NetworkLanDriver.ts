import { ThermalPrinterDriver, DriverType, PrinterConfig } from '../../types/printer.types';

function getAuthHeader(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const token = localStorage.getItem('serveflow_auth_token') || sessionStorage.getItem('serveflow_auth_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

export class NetworkLanDriver implements ThermalPrinterDriver {
  public readonly type: DriverType = 'lan';
  private host: string = '';
  private port: number = 9100;
  private role: string = 'KOT';
  private _isConnected: boolean = false;

  constructor(host: string = '', port: number = 9100) {
    this.host = host;
    this.port = port;
  }

  public get isConnected(): boolean {
    return this._isConnected;
  }

  public getName(): string {
    return this.host ? `Network Printer (${this.host}:${this.port})` : 'LAN Thermal Printer';
  }

  public configure(host: string, port: number = 9100, role: string = 'KOT') {
    let cleanHost = host.trim();
    let cleanPort = port || 9100;
    if (cleanHost.includes(':') && !cleanHost.includes('[')) {
      const parts = cleanHost.split(':');
      cleanHost = parts[0].trim();
      cleanPort = Number(parts[1]) || cleanPort;
    }
    this.host = cleanHost;
    this.port = cleanPort;
    this.role = role.toUpperCase() === 'BAR' ? 'BOT' : role.toUpperCase();
  }

  /**
   * Validates and verifies connectivity to target printer IP over TCP port 9100
   */
  public async connect(config?: Partial<PrinterConfig>): Promise<void> {
    if (config?.targetAddress) {
      let addr = config.targetAddress.trim();
      if (addr.includes(':') && !addr.includes('[')) {
        const parts = addr.split(':');
        addr = parts[0].trim();
        if (parts[1]) this.port = Number(parts[1]) || this.port;
      }
      this.host = addr;
    }
    if (config?.port) {
      this.port = config.port;
    }

    if (!this.host) {
      throw new Error('Please specify an IP address or hostname for the Network/LAN printer.');
    }

    // A cloud deployment cannot probe a restaurant's private LAN. The local agent
    // reports its presence; its local config owns the actual printer addresses.
    try {
      const agentResponse = await fetch('/api/print/agent-status', {
        headers: getAuthHeader(),
        credentials: 'include',
      });
      if (agentResponse.ok) {
        const status = await agentResponse.json();
        if (status.available) {
          this._isConnected = true;
          return;
        }
      }
      const response = await fetch('/api/print/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        credentials: 'include',
        body: JSON.stringify({ host: this.host, port: this.port, timeout: 3500 }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errMsg = typeof errorData.error === 'object' && errorData.error !== null
          ? errorData.error.message || errorData.error.code
          : (errorData.error || `Failed to reach printer at ${this.host}:${this.port}`);
        throw new Error(errMsg);
      }

      this._isConnected = true;
      console.log(`[NetworkLanDriver] Printer reachable at ${this.host}:${this.port}`);
    } catch {
      this._isConnected = false;
      throw new Error(
        `Unable to reach thermal printer at ${this.host}:${this.port}. Check printer power and local network connection.`
      );
    }
  }

  public async disconnect(): Promise<void> {
    this._isConnected = false;
  }

  /**
   * Transmits raw binary ESC/POS payload to LAN printer via TCP socket bridge
   */
  public async sendRaw(data: Uint8Array): Promise<void> {
    if (!this.host) {
      throw new Error('Printer IP address is not configured. Please enter the LAN printer IP address.');
    }

    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), 15000);
    try {
      const response = await fetch('/api/print/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        credentials: 'include',
        body: JSON.stringify({
          role: this.role,
          base64: bytesToBase64(data),
          idempotencyKey: `web-${crypto.randomUUID()}`,
        }),
        signal: abortController.signal,
      });
      const payload = await response.json().catch(() => ({}));
      if (response.ok && payload.queued) {
        this._isConnected = true;
        return;
      }
      if (response.status !== 409 || payload.code !== 'NO_PRINT_AGENT') {
        const message = typeof payload.error === 'string' ? payload.error : `HTTP ${response.status} from print service`;
        throw new Error(message);
      }

      // Compatibility for self-hosted deployments without an on-site agent.
      const queryParams = new URLSearchParams({ host: this.host, port: String(this.port) });
      const localResponse = await fetch(`/api/print/lan?${queryParams.toString()}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'x-printer-host': this.host,
          'x-printer-port': String(this.port),
          ...getAuthHeader(),
        },
        credentials: 'include',
        body: data,
        signal: abortController.signal,
      });
      if (!localResponse.ok) {
        const payload = await localResponse.json().catch(() => ({}));
        const message = typeof payload.error === 'string' ? payload.error : `HTTP ${localResponse.status} from print service`;
        throw new Error(message);
      }
      this._isConnected = true;
    } catch (error) {
      this._isConnected = false;
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`LAN print failed for ${this.host}:${this.port}: ${message}`);
    } finally {
      clearTimeout(timeout);
    }
  }
}
