import { ThermalPrinterDriver, DriverType, PrinterConfig } from '../../types/printer.types';

// Standard Bluetooth thermal printer UUIDs (GATT Printing & Serial Services)
const BLUETOOTH_PRINT_SERVICES = [
  '000018f0-0000-1000-8000-00805f9b34fb', // Standard Printer Service
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2', // Commonly used BLE POS Thermal Service
  '49535343-fe7d-4ae5-8fa9-9fafd205e455', // ISSC Transparent Serial
  '0000fee7-0000-1000-8000-00805f9b34fb', // Tencent / Mobile POS
  '0000af30-0000-1000-8000-00805f9b34fb', // Generic BLE Serial
  '0000fff0-0000-1000-8000-00805f9b34fb', // Generic Mini Thermal Printer
  '0000ff00-0000-1000-8000-00805f9b34fb', // Vendor BLE
];

export class WebBluetoothDriver implements ThermalPrinterDriver {
  public readonly type: DriverType = 'bluetooth';
  private device: any = null;
  private server: any = null;
  private characteristic: any = null;
  private _isConnected: boolean = false;

  public get isConnected(): boolean {
    return this._isConnected && this.server !== null && this.server.connected;
  }

  public getName(): string {
    return this.device?.name || 'Bluetooth Thermal Printer';
  }

  public async requestNewDevice(): Promise<{ id: string; name?: string }> {
    if (!('bluetooth' in navigator)) {
      throw new Error(
        'Web Bluetooth is not supported in this browser. Please use Chrome or Edge on desktop or Android over HTTPS/localhost.'
      );
    }
    const bluetooth = (navigator as any).bluetooth;
    const device = await bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: BLUETOOTH_PRINT_SERVICES,
    });
    if (!device) {
      throw new Error('No Bluetooth device selected.');
    }
    this.device = device;
    return {
      id: device.id,
      name: device.name || 'Bluetooth Thermal Printer',
    };
  }

  /**
   * Scans and pairs with a Bluetooth thermal printer via Web Bluetooth API
   */
  public async connect(config?: Partial<PrinterConfig>): Promise<void> {
    if (!('bluetooth' in navigator)) {
      throw new Error(
        'Web Bluetooth is not supported in this browser. Please use Chrome or Edge on desktop or Android over HTTPS/localhost.'
      );
    }

    if (this.isConnected && this.characteristic) {
      return;
    }

    const bluetooth = (navigator as any).bluetooth;

    try {
      let targetDevice = this.device;

      // 1. If not yet set, attempt to find in already paired devices if supported
      if (!targetDevice && typeof bluetooth.getDevices === 'function') {
        try {
          const paired = await bluetooth.getDevices();
          if (config?.bluetoothDeviceId) {
            targetDevice = paired.find((d: any) => d.id === config.bluetoothDeviceId);
          } else if (paired.length > 0) {
            targetDevice = paired[0];
          }
        } catch {}
      }

      // 2. If still no device, launch native browser Bluetooth picker
      if (!targetDevice) {
        targetDevice = await bluetooth.requestDevice({
          acceptAllDevices: true,
          optionalServices: BLUETOOTH_PRINT_SERVICES,
        });
      }

      if (!targetDevice) {
        throw new Error('No Bluetooth device selected.');
      }

      this.device = targetDevice;

      // Handle spontaneous disconnects
      targetDevice.addEventListener('gattserverdisconnected', () => {
        console.warn(`[WebBluetooth] Device disconnected: ${this.getName()}`);
        this._isConnected = false;
        this.characteristic = null;
      });

      console.log(`[WebBluetooth] Connecting to GATT Server for ${targetDevice.name}...`);
      this.server = await targetDevice.gatt.connect();

      // Locate the writable characteristic for sending ESC/POS raw bytes
      let foundCharacteristic: any = null;

      // 1. Try known print services first
      for (const serviceUuid of BLUETOOTH_PRINT_SERVICES) {
        try {
          const service = await this.server.getPrimaryService(serviceUuid);
          const characteristics = await service.getCharacteristics();
          for (const char of characteristics) {
            if (char.properties.write || char.properties.writeWithoutResponse) {
              foundCharacteristic = char;
              break;
            }
          }
          if (foundCharacteristic) break;
        } catch {
          // Service not present on this specific hardware model, continue search
        }
      }

      // 2. If known services not found, iterate all primary services
      if (!foundCharacteristic) {
        try {
          const services = await this.server.getPrimaryServices();
          for (const s of services) {
            try {
              const chars = await s.getCharacteristics();
              for (const c of chars) {
                if (c.properties.write || c.properties.writeWithoutResponse) {
                  foundCharacteristic = c;
                  break;
                }
              }
              if (foundCharacteristic) break;
            } catch {}
          }
        } catch {}
      }

      if (!foundCharacteristic) {
        throw new Error(
          'Could not find a writable ESC/POS printing characteristic on this Bluetooth device. Make sure printer is powered on and supports BLE/GATT.'
        );
      }

      this.characteristic = foundCharacteristic;
      this._isConnected = true;
      console.log(`[WebBluetooth] Connected successfully to ${this.getName()}!`);
    } catch (err: any) {
      this._isConnected = false;
      this.characteristic = null;

      if (err.name === 'NotFoundError' || err.message?.includes('User cancelled')) {
        console.log('[WebBluetooth] User cancelled Bluetooth device selection.');
        throw new Error('Bluetooth device selection was cancelled.');
      }

      throw new Error(`Bluetooth connection failed: ${err.message || err}`);
    }
  }

  public async disconnect(): Promise<void> {
    try {
      if (this.server?.connected) {
        this.server.disconnect();
      }
    } catch (e) {
      console.warn('[WebBluetooth] Disconnect error:', e);
    } finally {
      this.device = null;
      this.server = null;
      this.characteristic = null;
      this._isConnected = false;
    }
  }

  /**
   * Transmits raw binary ESC/POS bytes safely chunked to fit Bluetooth MTU limits
   */
  public async sendRaw(data: Uint8Array): Promise<void> {
    if (!this.isConnected || !this.characteristic) {
      await this.connect();
    }

    if (!this.characteristic) {
      throw new Error('No active Bluetooth characteristic for printing.');
    }

    // BLE MTU payload size is typically 20-100 bytes.
    // 64 bytes is the sweet spot for reliable high-speed thermal streaming.
    const MTU_CHUNK_SIZE = 64;

    try {
      for (let offset = 0; offset < data.length; offset += MTU_CHUNK_SIZE) {
        const chunk = data.slice(offset, offset + MTU_CHUNK_SIZE);

        if (this.characteristic.properties.writeWithoutResponse && this.characteristic.writeValueWithoutResponse) {
          await this.characteristic.writeValueWithoutResponse(chunk);
        } else if (this.characteristic.writeValueWithResponse) {
          await this.characteristic.writeValueWithResponse(chunk);
        } else if (this.characteristic.writeValue) {
          await this.characteristic.writeValue(chunk);
        }

        // Brief delay between packets to prevent printer hardware buffer overflow
        await new Promise((resolve) => setTimeout(resolve, 15));
      }
    } catch (err: any) {
      console.error('[WebBluetooth] Print write error:', err);
      this._isConnected = false;
      throw new Error(`Failed to transmit data to Bluetooth printer: ${err.message || err}`);
    }
  }
}
