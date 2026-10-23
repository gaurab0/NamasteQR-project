import { ThermalPrinterDriver, DriverType, PrinterConfig } from '../../types/printer.types';

export class WebUsbDriver implements ThermalPrinterDriver {
  public readonly type: DriverType = 'usb';
  private device: any = null;
  private endpointNumber: number = 1;
  private interfaceNumber: number = 0;
  private _isConnected: boolean = false;

  public get isConnected(): boolean {
    return this._isConnected && this.device !== null && this.device.opened;
  }

  public getName(): string {
    if (this.device?.productName) {
      return `${this.device.productName} (USB)`;
    }
    return 'USB Thermal Printer';
  }

  public async requestNewDevice(): Promise<{
    vendorId: number;
    productId: number;
    productName?: string;
    manufacturerName?: string;
  }> {
    if (!('usb' in navigator)) {
      throw new Error(
        'WebUSB is not supported in this browser. Please use Google Chrome, Microsoft Edge, or Opera over HTTPS or localhost.'
      );
    }
    const usb = (navigator as any).usb;
    const device = await usb.requestDevice({ filters: [] });
    if (!device) {
      throw new Error('No USB device selected.');
    }
    this.device = device;
    return {
      vendorId: device.vendorId,
      productId: device.productId,
      productName: device.productName || 'USB Thermal Printer',
      manufacturerName: device.manufacturerName || 'Generic',
    };
  }

  /**
   * Connects to a WebUSB device.
   * If config provides vendorId/productId, checks already paired devices first.
   * Otherwise launches native browser USB permission selector.
   */
  public async connect(config?: Partial<PrinterConfig>): Promise<void> {
    if (!('usb' in navigator)) {
      throw new Error(
        'WebUSB is not supported in this browser. Please use Google Chrome, Microsoft Edge, or Opera over HTTPS or localhost.'
      );
    }

    if (this.isConnected) {
      return;
    }

    const usb = (navigator as any).usb;

    try {
      // 1. Try to reuse already paired device or target configuration
      let targetDevice: any = null;
      let pairedDevices: any[] = [];
      try {
        pairedDevices = await usb.getDevices();
      } catch {}

      if (config?.usbVendorId && config?.usbProductId) {
        targetDevice = pairedDevices.find(
          (d) => d.vendorId === config.usbVendorId && d.productId === config.usbProductId
        );
      }
      if (!targetDevice && this.device) {
        targetDevice = this.device;
      }
      if (!targetDevice && pairedDevices.length > 0) {
        targetDevice = pairedDevices[0];
      }

      // 2. If no paired device found, request device picker
      if (!targetDevice) {
        targetDevice = await usb.requestDevice({ filters: [] });
      }

      if (!targetDevice) {
        throw new Error('No USB device selected.');
      }

      this.device = targetDevice;

      // 3. Open device session
      if (!this.device.opened) {
        await this.device.open();
      }

      // 4. Select configuration
      if (this.device.configuration === null) {
        await this.device.selectConfiguration(1);
      }

      // 5. Locate interface with bulkOut endpoint
      let foundEndpoint = false;
      const conf = this.device.configuration;
      if (conf && conf.interfaces) {
        for (const iface of conf.interfaces) {
          const alternate = iface.alternates?.[0] || iface.alternate;
          if (alternate && alternate.endpoints) {
            const outEp = alternate.endpoints.find(
              (ep: any) => ep.direction === 'out' && ep.type === 'bulk'
            );
            if (outEp) {
              this.interfaceNumber = iface.interfaceNumber;
              this.endpointNumber = outEp.endpointNumber;
              foundEndpoint = true;
              break;
            }
          }
        }
      }

      // Fallback defaults for standard POS ESC/POS USB devices
      if (!foundEndpoint) {
        this.interfaceNumber = 0;
        this.endpointNumber = 1;
      }

      // 6. Claim interface
      try {
        await this.device.claimInterface(this.interfaceNumber);
      } catch (err: any) {
        console.warn(`[WebUSB] Claim interface notice:`, err?.message);
      }

      this._isConnected = true;
      console.log(`[WebUSB] Successfully connected to ${this.getName()} (Endpoint #${this.endpointNumber})`);
    } catch (err: any) {
      this._isConnected = false;
      this.device = null;

      // Handle user cancellation gracefully
      if (err.name === 'NotFoundError' || err.message?.includes('No device selected')) {
        console.log('[WebUSB] Device selection cancelled by user.');
        throw new Error('USB device selection was cancelled.');
      }

      if (err.name === 'SecurityError') {
        throw new Error('Access to USB device was blocked by browser security policy. Ensure HTTPS or localhost.');
      }

      throw new Error(`WebUSB connection error: ${err.message || err}`);
    }
  }

  /**
   * Closes USB session and releases interface
   */
  public async disconnect(): Promise<void> {
    if (this.device) {
      try {
        if (this.device.opened) {
          await this.device.releaseInterface(this.interfaceNumber);
          await this.device.close();
        }
      } catch (e) {
        console.warn('[WebUSB] Error during disconnect:', e);
      } finally {
        this.device = null;
        this._isConnected = false;
      }
    }
  }

  /**
   * Transmits raw binary ESC/POS byte buffer to USB bulkOut endpoint
   */
  public async sendRaw(data: Uint8Array): Promise<void> {
    if (!this.isConnected) {
      await this.connect();
    }

    if (!this.device || !this.device.opened) {
      throw new Error('USB printer is not connected or session is closed.');
    }

    try {
      // Chunk into 4KB transfers if buffer is very large to avoid buffer overrun
      const CHUNK_SIZE = 4096;
      for (let offset = 0; offset < data.length; offset += CHUNK_SIZE) {
        const slice = data.slice(offset, offset + CHUNK_SIZE);
        const result = await this.device.transferOut(this.endpointNumber, slice);
        if (result.status === 'stall') {
          console.warn(`[WebUSB] Endpoint stalled. Clearing halt...`);
          try {
            await this.device.clearHalt('out', this.endpointNumber);
          } catch {}
        } else if (result.status !== 'ok') {
          console.warn(`[WebUSB] Transfer out returned status: ${result.status}`);
        }
      }
    } catch (err: any) {
      console.error('[WebUSB] Transfer error:', err);
      this._isConnected = false;
      throw new Error(`Failed to transmit data to USB printer: ${err.message || err}`);
    }
  }
}
