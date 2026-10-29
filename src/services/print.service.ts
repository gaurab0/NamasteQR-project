import { renderFormattedDate } from '../utils/dateFormatter';
import {
  PrinterConfig,
  PrinterRole,
  ConnectionType,
  DriverType,
  ThermalPrinterDriver,
} from '../types/printer.types';
import { EscPosEncoder } from '../utils/escpos';
import {
  WebUsbDriver,
  WebBluetoothDriver,
  NetworkLanDriver,
  BrowserPrintDriver,
} from './printer-drivers';

function escapeHtml(val: any): string {
  if (val === null || val === undefined) return '';
  return String(val)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

class PrintService {
  private usbDriver = new WebUsbDriver();
  private bluetoothDriver = new WebBluetoothDriver();
  private lanDriver = new NetworkLanDriver();
  private browserDriver = new BrowserPrintDriver();

  /**
   * Resolves driver instance based on connection type
   */
  public getDriver(type: ConnectionType | DriverType): ThermalPrinterDriver {
    const normalized = String(type).toUpperCase();
    switch (normalized) {
      case 'USB':
        return this.usbDriver;
      case 'BLUETOOTH':
        return this.bluetoothDriver;
      case 'NETWORK':
      case 'LAN':
        return this.lanDriver;
      case 'SYSTEM':
      case 'BROWSER':
      default:
        return this.browserDriver;
    }
  }

  public isWebUsbSupported(): boolean {
    return typeof navigator !== 'undefined' && 'usb' in navigator;
  }

  public isWebBluetoothSupported(): boolean {
    return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
  }

  public async requestUsbDevice() {
    return this.usbDriver.requestNewDevice();
  }

  public async requestBluetoothDevice() {
    return this.bluetoothDriver.requestNewDevice();
  }

  /**
   * Dispatches a print task to the designated physical printer
   */
  public async printTask(
    taskType: PrinterRole,
    orderData: any,
    printerConfig?: PrinterConfig
  ): Promise<boolean> {
    if (!printerConfig) {
      if (this.usbDriver.isConnected) {
        return this.printTask(taskType, orderData, {
          id: 'connected_usb',
          name: this.usbDriver.getName(),
          role: taskType,
          connectionType: 'USB',
          targetAddress: 'Direct USB',
          paperWidth: '80mm',
          enabled: true,
          autoPrintKds: true,
        });
      }
      if (this.bluetoothDriver.isConnected) {
        return this.printTask(taskType, orderData, {
          id: 'connected_ble',
          name: this.bluetoothDriver.getName(),
          role: taskType,
          connectionType: 'BLUETOOTH',
          targetAddress: 'Direct BLE',
          paperWidth: '80mm',
          enabled: true,
          autoPrintKds: true,
        });
      }
      if (this.lanDriver.isConnected) {
        return this.printTask(taskType, orderData, {
          id: 'connected_lan',
          name: this.lanDriver.getName(),
          role: taskType,
          connectionType: 'NETWORK',
          targetAddress: this.lanDriver.getName(),
          paperWidth: '80mm',
          enabled: true,
          autoPrintKds: true,
        });
      }
      console.warn(`[PrintService] No printer configured for ${taskType}. Falling back to universal browser print.`);
      const html = this.generateHtml(taskType, orderData);
      return this.browserDriver.printHtml(html);
    }

    if (!printerConfig.enabled) {
      console.log(`[PrintService] Printer ${printerConfig.name} is disabled. Skipping print.`);
      return false;
    }

    // Direct hardware thermal printing for USB, Bluetooth, and Network/LAN
    if (printerConfig.connectionType !== 'SYSTEM') {
      try {
        const driver = this.getDriver(printerConfig.connectionType);

        if (printerConfig.connectionType === 'NETWORK') {
          this.lanDriver.configure(
            printerConfig.targetAddress || printerConfig.name,
            printerConfig.port || 9100
          );
        }

        // Build ESC/POS binary buffer
        const rawPayload = EscPosEncoder.buildReceipt(orderData, {
          paperWidth: printerConfig.paperWidth,
          role: taskType,
          autoCut: printerConfig.autoCut ?? true,
          feedLines: printerConfig.feedLines ?? 3,
          openCashDrawer: printerConfig.openCashDrawer ?? (taskType === 'BILL'),
        });

        this.showToast(`Printing to ${printerConfig.name} via ${printerConfig.connectionType}...`);
        await driver.sendRaw(rawPayload);
        this.showToast(`Successfully printed on ${printerConfig.name}!`);
        return true;
      } catch (hardwareErr: any) {
        console.error(`[PrintService] Direct thermal print error for ${printerConfig.name}:`, hardwareErr);
        this.showToast(
          `Hardware print error: ${hardwareErr.message || 'Printer not reached'}. Falling back to system print...`,
          true
        );

        // Fail-safe fallback: Never lose a customer receipt or KOT ticket!
        const html = this.generateHtml(taskType, orderData);
        return this.browserDriver.printHtml(html);
      }
    }

    // Standard Browser / System Spooler print (Universal fallback for Canon, HP, Epson, PDF, etc.)
    const htmlPayload = this.generateHtml(taskType, orderData);
    return await this.browserDriver.printHtml(htmlPayload);
  }

  /**
   * Tests a specific printer profile with a formatted diagnostic test slip
   */
  public async testPrinter(config: PrinterConfig): Promise<boolean> {
    if (config.connectionType === 'SYSTEM') {
      const mockData = {
        id: 'TEST-1234',
        table_number: 'T-01',
        waiter_name: 'POS Diagnostic',
        items: [
          { name: 'System Print Test Item', quantity: 1, price: 100.0, notes: 'Alignment and formatting test' },
        ],
        subtotal: 100.0,
        tax: 13.0,
        total_amount: 113.0,
      };
      const html = this.generateHtml(config.role, mockData);
      return this.browserDriver.printHtml(html);
    }

    try {
      const driver = this.getDriver(config.connectionType);

      if (config.connectionType === 'NETWORK') {
        this.lanDriver.configure(config.targetAddress || '', config.port || 9100);
      }

      const testPayload = EscPosEncoder.buildTestPrint({
        name: config.name,
        connectionType: config.connectionType,
        targetAddress: config.targetAddress,
        paperWidth: config.paperWidth,
        feedLines: config.feedLines,
        autoCut: config.autoCut,
      });

      this.showToast(`Sending test pattern to ${config.name}...`);
      await driver.sendRaw(testPayload);
      this.showToast(`Test pattern printed on ${config.name}!`);
      return true;
    } catch (err: any) {
      console.error(`[PrintService] Test print failed on ${config.name}:`, err);
      this.showToast(`Test print failed: ${err.message || err}`, true);
      throw err;
    }
  }

  /**
   * Temporary visual toast notification
   */
  public showToast(message: string, isError: boolean = false) {
    if (typeof document === 'undefined') return;

    const toast = document.createElement('div');
    toast.textContent = (isError ? '⚠️ ' : '🖨️ ') + message;
    toast.style.position = 'fixed';
    toast.style.bottom = '24px';
    toast.style.right = '24px';
    toast.style.backgroundColor = isError ? '#991b1b' : '#18181b';
    toast.style.color = '#fff';
    toast.style.padding = '12px 20px';
    toast.style.borderRadius = '10px';
    toast.style.boxShadow = '0 10px 25px -5px rgba(0, 0, 0, 0.25)';
    toast.style.fontSize = '14px';
    toast.style.fontWeight = '500';
    toast.style.zIndex = '999999';
    toast.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    toast.style.transform = 'translateY(20px)';
    toast.style.opacity = '0';

    document.body.appendChild(toast);

    requestAnimationFrame(() => {
      toast.style.transform = 'translateY(0)';
      toast.style.opacity = '1';
    });

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => {
        if (document.body.contains(toast)) {
          document.body.removeChild(toast);
        }
      }, 300);
    }, 3500);
  }

  /**
   * Generates printable HTML string for system browser spooler
   */
  public generateHtml(taskType: PrinterRole, data: any): string {
    const isKot = taskType === 'KOT';
    const isBill = taskType === 'BILL';

    const orderNumber = data.order_number || (data.id ? String(data.id).slice(0, 8).toUpperCase() : 'ORD');
    let tableNo = data.table_number;
    if (!tableNo) {
      if (data.sale_type === 'TAKEAWAY') {
        tableNo = 'Takeaway';
      } else if (data.sale_type === 'DELIVERY') {
        tableNo = 'Delivery';
      } else if (data.sale_type === 'ROOM_SERVICE') {
        tableNo = 'Room Service';
      } else {
        tableNo = 'Dine-In Restaurant';
      }
    } else if (/^\d+$/.test(String(tableNo).trim())) {
      tableNo = `Table ${tableNo}`;
    }
    const serverName = data.waiter_name || 'System';
    let billingFormat: any = 'ENGLISH';

    try {
      if (data?.date_format_billing) {
        billingFormat = data.date_format_billing;
      } else {
        const cached = localStorage.getItem('serveflow_cached_user');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed?.business?.date_format_billing) {
            billingFormat = parsed.business.date_format_billing;
          }
        }
      }
    } catch {}

    const time = renderFormattedDate(data.created_at || new Date(), billingFormat);

    let html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <style>
            @media print {
              @page { margin: 0; }
              body { margin: 4mm; }
            }
            body {
              font-family: monospace;
              width: 290px;
              margin: 0 auto;
              padding: 10px;
              color: #000;
              background: #fff;
            }
            .header { text-align: center; margin-bottom: 12px; border-bottom: 1px dashed #000; padding-bottom: 8px; }
            .header h1 { font-size: 18px; margin: 4px 0; }
            .header h2 { font-size: 15px; margin: 2px 0; }
            .row { display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 13px; }
            .item { font-size: 13px; margin-bottom: 6px; }
            .item-qty { font-weight: bold; }
            .notes { font-size: 11px; font-style: italic; margin-left: 12px; color: #333; }
            .divider { border-bottom: 1px dashed #000; margin: 8px 0; }
            .footer { text-align: center; font-size: 11px; margin-top: 12px; border-top: 1px dashed #000; padding-top: 8px; }
            .total-row { font-size: 15px; font-weight: bold; }
          </style>
        </head>
        <body>
    `;

    if (isKot) {
      html += `
          <div class="header">
            <h2>KITCHEN ORDER TICKET</h2>
            <h1>Order #${escapeHtml(orderNumber)}</h1>
            <div>Table: ${escapeHtml(tableNo)}</div>
            <div>Time: ${escapeHtml(time)} | Server: ${escapeHtml(serverName)}</div>
          </div>
      `;

      const items = (data.items || []).filter((item: any) => item && (item.name || '').trim().length > 0);
      items.forEach((item: any) => {
        html += `
          <div class="item">
            <span class="item-qty">${Number(item.quantity) || 1}x</span> ${escapeHtml(item.name)}
            ${item.notes ? `<div class="notes">- ${escapeHtml(item.notes)}</div>` : ''}
          </div>
        `;
      });
    }

    if (isBill) {
      html += `
          <div class="header">
            <h2>TAX INVOICE / RECEIPT</h2>
            <h1>Order #${escapeHtml(orderNumber)}</h1>
            ${data.invoice_number ? `<div>Invoice: ${escapeHtml(data.invoice_number)}</div>` : ''}
            <div>Table: ${escapeHtml(tableNo)}</div>
            <div>Time: ${escapeHtml(time)} | Server: ${escapeHtml(serverName)}</div>
          </div>
      `;

      const items = (data.items || []).filter((item: any) => item && (item.name || '').trim().length > 0);
      items.forEach((item: any) => {
        html += `
          <div class="item">
            <div class="row">
              <span>${Number(item.quantity) || 1}x ${escapeHtml(item.name)}</span>
              <span>Rs ${(Number(item.quantity || 1) * (Number(item.price) || 0)).toFixed(2)}</span>
            </div>
            ${item.notes ? `<div class="notes">- ${escapeHtml(item.notes)}</div>` : ''}
          </div>
        `;
      });

      html += `<div class="divider"></div>`;

      const subtotal = data.subtotal || 0;
      const tax = data.total_tax ?? data.tax_amount ?? data.tax ?? 0;
      const discount = data.discount_amount ?? data.promo_discount ?? 0;
      const total = data.total_amount || 0;

      html += `
          <div class="row"><span>Subtotal:</span> <span>Rs ${Number(subtotal).toFixed(2)}</span></div>
          <div class="row"><span>Tax / VAT:</span> <span>Rs ${Number(tax).toFixed(2)}</span></div>
          ${Number(discount) > 0 ? `<div class="row"><span>Discount:</span> <span>-Rs ${Number(discount).toFixed(2)}</span></div>` : ''}
          <div class="divider"></div>
          <div class="row total-row"><span>TOTAL:</span> <span>Rs ${Number(total).toFixed(2)}</span></div>
          
          <div class="footer">
            Thank you for dining with us!
          </div>
      `;
    }

    html += `
        </body>
      </html>
    `;

    return html;
  }
}

export const printService = new PrintService();
