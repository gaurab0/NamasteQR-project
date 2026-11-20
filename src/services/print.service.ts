import { renderFormattedDate } from '../utils/dateFormatter';
import { computeOrderBillableAmounts } from '../utils/taxCalculations';
import { amountToWords } from '../utils/numberToWords';
import { determineItemStation } from '../utils/menuUtils';
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
    const isBar = taskType === 'BAR';
    const isBoth = taskType === 'BOTH';
    const isBill = taskType === 'BILL';

    const rawOrderNumber = data.order_number || (data.id ? String(data.id).slice(0, 8).toUpperCase() : 'ORD');
    const orderNumber = isBill ? rawOrderNumber.replace(/\s*\(Round\s*\d+\)/gi, '').trim() : rawOrderNumber;
    let tableNo = data.table_number;
    if (!tableNo) {
      if (data.sale_type === 'TAKEAWAY') {
        tableNo = 'Takeaway';
      } else if (data.sale_type === 'DELIVERY') {
        tableNo = 'Delivery';
      } else {
        tableNo = 'Dine-In Restaurant';
      }
    } else if (/^\d+$/.test(String(tableNo).trim())) {
      tableNo = `Table ${tableNo}`;
    }
    const serverName = data.waiter_name || 'System';
    let billingFormat: any = 'ENGLISH';
    let orderLabel = 'Order No:';
    let invoiceLabel = 'Invoice:';

    try {
      const taxCfg = data?.tax_config || data?.business?.tax_config;
      if (taxCfg?.order_label) {
        orderLabel = taxCfg.order_label.trim();
      }
      if (taxCfg?.invoice_label) {
        invoiceLabel = taxCfg.invoice_label.trim();
      } else if (taxCfg?.invoice_prefix) {
        invoiceLabel = `${taxCfg.invoice_prefix} Invoice:`;
      }
      if (data?.date_format_billing) {
        billingFormat = data.date_format_billing;
      }
      const cached = localStorage.getItem('serveflow_cached_user');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed?.business?.date_format_billing && !data?.date_format_billing) {
          billingFormat = parsed.business.date_format_billing;
        }
        if (parsed?.business?.tax_config) {
          if (!taxCfg?.order_label && parsed.business.tax_config.order_label) {
            orderLabel = parsed.business.tax_config.order_label.trim();
          }
          if (!taxCfg?.invoice_label && parsed.business.tax_config.invoice_label) {
            invoiceLabel = parsed.business.tax_config.invoice_label.trim();
          } else if (!taxCfg?.invoice_label && parsed.business.tax_config.invoice_prefix) {
            invoiceLabel = `${parsed.business.tax_config.invoice_prefix} Invoice:`;
          }
        }
      }
    } catch {}

    const time = renderFormattedDate(data.created_at || new Date(), billingFormat, ' | ');

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
            .kot-header-line { font-size: 15px; font-weight: bold; margin: 2px 0; }
            .kot-item { font-size: 16px; font-weight: bold; line-height: 1.35; margin-bottom: 8px; }
            .kot-item-qty { font-weight: 800; font-size: 16px; margin-right: 4px; }
            .notes { font-size: 11px; font-style: italic; margin-left: 12px; color: #333; }
            .divider { border-bottom: 1px dashed #000; margin: 8px 0; }
            .footer { text-align: center; font-size: 11px; margin-top: 12px; border-top: 1px dashed #000; padding-top: 8px; }
            .total-row { font-size: 15px; font-weight: bold; }
          </style>
        </head>
        <body>
    `;

    const roundMatch = String(orderNumber || data.id || '').match(/\(Round\s*(\d+)\)/i);
    const roundNum = data.round_number || (roundMatch ? parseInt(roundMatch[1], 10) : (data.is_follow_up ? 2 : 1));
    const isOrderMore = Boolean(data.is_follow_up || roundNum > 1 || roundMatch);

    const rawItems = (data.items || []).filter((item: any) => item && (item.name || '').trim().length > 0);
    const hasKitchenItems = rawItems.some((it: any) => {
      const st = determineItemStation(it);
      return st === 'KITCHEN' || st === 'BOTH';
    });
    const hasBarItems = rawItems.some((it: any) => {
      const st = determineItemStation(it);
      return st === 'BAR' || st === 'BOTH';
    });

    if (isKot || isBar || isBoth) {
      let ticketTitle = '';
      if (isBoth) {
        if (hasKitchenItems && hasBarItems) {
          ticketTitle = isOrderMore
            ? `KITCHEN &amp; BAR ORDER TICKET (KOT / BOT - ROUND ${roundNum})`
            : 'KITCHEN &amp; BAR ORDER TICKET (KOT / BOT)';
        } else if (hasBarItems && !hasKitchenItems) {
          ticketTitle = isOrderMore
            ? `BAR ORDER TICKET (BOT - ROUND ${roundNum})`
            : 'BAR ORDER TICKET (BOT)';
        } else {
          ticketTitle = isOrderMore
            ? `KITCHEN ORDER TICKET (KOT - ROUND ${roundNum})`
            : 'KITCHEN ORDER TICKET (KOT)';
        }
      } else if (isBar) {
        ticketTitle = isOrderMore ? `BAR ORDER TICKET (BOT - ROUND ${roundNum})` : 'BAR ORDER TICKET (BOT)';
      } else {
        ticketTitle = isOrderMore ? `KITCHEN ORDER TICKET (KOT - ROUND ${roundNum})` : 'KITCHEN ORDER TICKET (KOT)';
      }

      html += `
          <div class="header">
            <h2 class="kot-header-line">${ticketTitle}</h2>
            ${isOrderMore ? '<div style="font-weight: bold; font-size: 13px; color: #6b21a8; margin: 2px 0;">[ORDER MORE / FOLLOW-UP]</div>' : ''}
            <div class="kot-header-line">${escapeHtml(orderLabel)} ${escapeHtml(orderNumber)}</div>
            <div class="kot-header-line">Table: ${escapeHtml(tableNo)}</div>
            <div style="font-size: 12px; margin-top: 3px;">Time: ${escapeHtml(time)} | Server: ${escapeHtml(serverName)}</div>
          </div>
      `;

      const items = rawItems.filter((item: any) => {
        if (isBoth) return true;
        const st = determineItemStation(item);
        if (isKot) return st === 'KITCHEN' || st === 'BOTH';
        if (isBar) return st === 'BAR' || st === 'BOTH';
        return true;
      });

      items.forEach((item: any) => {
        let tagHtml = '';
        if (isBoth) {
          const itemStation = determineItemStation(item);
          const tag = itemStation === 'BOTH' ? '[KITCHEN &amp; BAR]' : itemStation === 'BAR' ? '[BAR]' : '[KITCHEN]';
          const tagColor = itemStation === 'BAR' ? '#6b21a8' : '#b45309';
          tagHtml = `<span style="font-weight: bold; font-size: 11px; margin-right: 4px; color: ${tagColor};">${tag}</span>`;
        }

        html += `
          <div class="item kot-item">
            <span class="item-qty kot-item-qty">{${Number(item.quantity) || 1}}</span> ${tagHtml}${escapeHtml(item.name)}
            ${(() => {
              const q = Number(item.quantity) || 1;
              const pq = Math.max(0, Number(item.pack_qty ?? (item.is_packaged ? q : 0)) || 0);
              if (pq <= 0 && !item.is_packaged) return '';
              const lbl = pq > 1 && pq < q ? `&gt;&gt;&gt; [PACKAGING REQUIRED: ${pq} of ${q}] &lt;&lt;&lt;` : pq > 1 ? `&gt;&gt;&gt; [PACKAGING REQUIRED: ${pq}x] &lt;&lt;&lt;` : '&gt;&gt;&gt; [PACKAGING REQUIRED] &lt;&lt;&lt;';
              return `<div style="font-weight: bold; font-size: 11px; margin-left: 8px; color: #b45309;">${lbl}</div>`;
            })()}
            ${(item.special_instructions || item.notes) ? `<div class="notes" style="font-weight: bold; color: #1e293b;">* Request: ${escapeHtml(item.special_instructions || item.notes)}</div>` : ''}
          </div>
        `;
      });

      const additionalInstructions = data.order_notes || data.general_notes || data.notes || '';
      if (additionalInstructions) {
        html += `
          <div class="divider"></div>
          <div style="margin-top: 6px; padding: 6px; border: 1px dashed #000; background: #fffbebee;">
            <div style="font-weight: bold; font-size: 11px; text-transform: uppercase; color: #b45309;">Additional Instructions:</div>
            <div style="font-size: 13px; font-weight: bold; margin-top: 2px; color: #000;">&gt;&gt;&gt; ${escapeHtml(additionalInstructions)} &lt;&lt;&lt;</div>
          </div>
        `;
      }
    }

    if (isBill) {
      html += `
          <div class="header">
            <h2>TAX INVOICE / RECEIPT</h2>
            <h1>${escapeHtml(orderLabel)} ${escapeHtml(orderNumber)}</h1>
            ${data.invoice_number ? `<div>${escapeHtml(invoiceLabel)} ${escapeHtml(data.invoice_number)}</div>` : ''}
            <div>Table: ${escapeHtml(tableNo)}</div>
            <div>Time: ${escapeHtml(time)} | Server: ${escapeHtml(serverName)}</div>
          </div>
      `;

      const excludeComp = Boolean(
        data?.opsConfig?.exclude_comp_from_bills ||
        data?.operations_config?.exclude_comp_from_bills ||
        data?.business?.operations_config?.exclude_comp_from_bills ||
        (data as any)?.exclude_comp_from_bills
      );

      const items = (data.items || []).filter((item: any) => item && (item.name || '').trim().length > 0);
      const isAllCompOrder = items.length > 0 && items.every((it: any) => {
        const q = Number(it.quantity) || 1;
        const cq = Math.max(0, Math.min(q, Number(it.comp_qty) || (it.is_comp ? q : 0)));
        return Boolean(it.is_comp || cq >= q);
      });

      if (isAllCompOrder && excludeComp) {
        html += `
          <div style="text-align: center; padding: 8px; margin-bottom: 8px; border: 1px dashed #000; font-weight: bold;">
            <div>*** COURTESY SLIP ***</div>
            <div>COURTESY OF MANAGEMENT</div>
            <div>COMPLIMENTARY - TOTAL: RS. 0.00</div>
          </div>
        `;
      }

      items.forEach((item: any) => {
        const qty = Number(item.quantity) || 1;
        const compQty = Math.max(0, Math.min(qty, Number(item.comp_qty) || (item.is_comp ? qty : 0)));
        const isComp = Boolean(item.is_comp || compQty >= qty);
        const billedQty = isComp ? 0 : Math.max(0, qty - compQty);
        const lineTotal = isComp ? 0 : (billedQty * (Number(item.price) || 0));

        if (excludeComp) {
          if (isComp || billedQty === 0) return;
          html += `
            <div class="item">
              <div class="row">
                <span>${billedQty}x ${escapeHtml(item.name)}</span>
                <span>Rs ${lineTotal.toFixed(2)}</span>
              </div>
              ${(item.special_instructions || item.notes) ? `<div class="notes" style="font-weight: bold; color: #1e293b;">* Request: ${escapeHtml(item.special_instructions || item.notes)}</div>` : ''}
            </div>
          `;
        } else {
          html += `
            <div class="item">
              <div class="row">
                <span>${qty}x ${escapeHtml(item.name)}${isComp ? ' (🎁 Comp)' : compQty > 0 ? ` (${compQty}x Comp)` : ''}</span>
                <span>${isComp ? 'Rs 0.00' : `Rs ${lineTotal.toFixed(2)}`}</span>
              </div>
              ${(item.special_instructions || item.notes) ? `<div class="notes" style="font-weight: bold; color: #1e293b;">* Request: ${escapeHtml(item.special_instructions || item.notes)}</div>` : ''}
            </div>
          `;
        }
      });

      html += `<div class="divider"></div>`;

      const dataPkgComp =
        Boolean(data.is_packaging_comp) ||
        (Number(data.packaging_qty || 0) > 0 &&
          data.packaging_charge !== undefined &&
          data.packaging_charge !== null &&
          Number(data.packaging_charge) === 0);
      const billable = computeOrderBillableAmounts(items, {
        isPackagingComp: dataPkgComp,
        explicitPackagingCharge:
          data.packaging_charge !== undefined && data.packaging_charge !== null
            ? Number(data.packaging_charge)
            : undefined,
        explicitPackagingQty:
          data.packaging_qty !== undefined && data.packaging_qty !== null
            ? Number(data.packaging_qty)
            : undefined,
      });
      const calculatedSubtotal = billable.itemsMenuTotal + billable.packagingTotal;

      const subtotal = data.subtotal !== undefined && data.subtotal !== null ? Number(data.subtotal) : calculatedSubtotal;
      const tax = data.total_tax ?? data.tax_amount ?? data.tax ?? 0;
      const discount = data.discount_amount ?? data.promo_discount ?? 0;
      const total = data.total_amount !== undefined && data.total_amount !== null ? Number(data.total_amount) : Math.max(0, subtotal + Number(tax) - Number(discount));
      const billCurrency = data.currency || (data.tax_config?.currency_symbol || data.tax_config?.currency) || 'Rs.';
      const inWords = amountToWords(total, billCurrency);

      html += `
          ${billable.packagingQty > 0 ? `<div class="row"><span>Packaging (${billable.packagingQty} pkgs):</span> <span>${billable.packagingTotal === 0 ? 'Complimentary (Rs 0.00)' : `Rs ${billable.packagingTotal.toFixed(2)}`}</span></div>` : ''}
          <div class="row"><span>Subtotal:</span> <span>${escapeHtml(billCurrency)} ${Number(subtotal).toFixed(2)}</span></div>
          ${Number(discount) > 0 ? `<div class="row"><span>Discount:</span> <span>-${escapeHtml(billCurrency)} ${Number(discount).toFixed(2)}</span></div><div class="row"><span>Taxable Amt:</span> <span>${escapeHtml(billCurrency)} ${Math.max(0, Number(subtotal) - Number(discount)).toFixed(2)}</span></div>` : ''}
          <div class="row"><span>Tax / VAT:</span> <span>${escapeHtml(billCurrency)} ${Number(tax).toFixed(2)}</span></div>
          <div class="divider"></div>
          <div class="row total-row"><span>TOTAL:</span> <span>${escapeHtml(billCurrency)} ${Number(total).toFixed(2)}</span></div>
          <div style="font-size: 11px; margin-top: 6px; font-style: italic; color: #1e293b; text-align: left; line-height: 1.35;">In words: ${escapeHtml(inWords)}</div>
          
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
