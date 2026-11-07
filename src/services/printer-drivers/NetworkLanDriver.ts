import { ThermalPrinterDriver, DriverType, PrinterConfig } from '../../types/printer.types';

function getAuthHeader(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const token = localStorage.getItem('serveflow_auth_token') || sessionStorage.getItem('serveflow_auth_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export class NetworkLanDriver implements ThermalPrinterDriver {
  public readonly type: DriverType = 'lan';
  private host: string = '';
  private port: number = 9100;
  private bridgeUrl: string = '/api/print/lan';
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

  public configure(host: string, port: number = 9100, bridgeUrl?: string) {
    let cleanHost = host.trim();
    let cleanPort = port || 9100;
    if (cleanHost.includes(':') && !cleanHost.includes('[')) {
      const parts = cleanHost.split(':');
      cleanHost = parts[0].trim();
      cleanPort = Number(parts[1]) || cleanPort;
    }
    this.host = cleanHost;
    this.port = cleanPort;
    if (bridgeUrl) this.bridgeUrl = bridgeUrl;
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

    // Ping test through backend socket endpoint
    try {
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
    } catch (err: any) {
      // If backend test route fails, check if local bridge is running on 9100
      try {
        const bridgeRes = await fetch(`http://localhost:9100/ping?host=${this.host}&port=${this.port}`, {
          method: 'GET',
        });
        if (bridgeRes.ok) {
          this.bridgeUrl = 'http://localhost:9100/print';
          this._isConnected = true;
          return;
        }
      } catch {}

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

    const payloadArray = Array.from(data);

    // 1. Try ServeFlow backend direct socket route with binary ArrayBuffer payload
    try {
      const queryParams = new URLSearchParams({
        host: this.host,
        port: String(this.port),
      });

      const response = await fetch(`/api/print/lan?${queryParams.toString()}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'x-printer-host': this.host,
          'x-printer-port': String(this.port),
          ...getAuthHeader(),
        },
        credentials: 'include',
        body: data,
      });

      if (response.ok) {
        this._isConnected = true;
        return;
      }

      // Fallback: try JSON array payload
      const jsonRes = await fetch('/api/print/lan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        credentials: 'include',
        body: JSON.stringify({
          host: this.host,
          port: this.port,
          data: Array.from(data),
        }),
      });

      if (jsonRes.ok) {
        this._isConnected = true;
        return;
      }

      const errJson = await jsonRes.json().catch(() => ({}));
      const errMsg = typeof errJson.error === 'object' && errJson.error !== null
        ? errJson.error.message || errJson.error.code
        : (errJson.error || `HTTP ${jsonRes.status} from print service`);
      throw new Error(errMsg);
    } catch (backendErr: any) {
      // 2. Fallback to local desktop bridge if running on localhost:9100
      try {
        const bridgeRes = await fetch(`http://localhost:9100/print?host=${this.host}&port=${this.port}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: data,
        });

        if (bridgeRes.ok) {
          this._isConnected = true;
          return;
        }
      } catch {}

      this._isConnected = false;
      throw new Error(
        `LAN print failed for ${this.host}:${this.port}: ${backendErr.message || backendErr}`
      );
    }
  }
}
