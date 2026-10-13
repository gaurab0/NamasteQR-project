import { renderFormattedDate } from '../utils/dateFormatter';
import { PrinterConfig, PrinterRole } from '../types/printer.types';

class PrintService {
  /**
   * Dispatches a print task.
   */
  public async printTask(
    taskType: PrinterRole,
    orderData: any,
    printerConfig?: PrinterConfig
  ): Promise<boolean> {
    if (!printerConfig) {
      console.warn(`No printer configured for ${taskType}. Falling back to system print.`);
      return this.executeSystemPrint(this.generateHtml(taskType, orderData));
    }

    if (!printerConfig.enabled) {
      console.log(`Printer ${printerConfig.name} is disabled. Skipping print.`);
      return false;
    }

    const payload = this.generateHtml(taskType, orderData);

    try {
      // In a true production web POS, NETWORK/USB ESC/POS printers would receive raw byte arrays.
      // However, in this web browser environment, we must route everything through the browser's 
      // OS print spooler in order for physical printing (like Canon LBP2900 USB) to actually work.
      // NOTE: To bypass the print dialog popup, the browser MUST be launched with the --kiosk-printing flag!
      return await this.executeSystemPrint(payload);
    } catch (e) {
      console.error(`Failed to print ${taskType}:`, e);
      return false;
    }
  }

  /**
   * Helper to show a temporary visual indicator when a silent print occurs 
   * so the user isn't left wondering if the action worked.
   */
  private showSilentPrintToast(message: string) {
    const toast = document.createElement('div');
    toast.textContent = `🖨️ ${message}`;
    toast.style.position = 'fixed';
    toast.style.bottom = '24px';
    toast.style.right = '24px';
    toast.style.backgroundColor = '#18181b';
    toast.style.color = '#fff';
    toast.style.padding = '12px 20px';
    toast.style.borderRadius = '8px';
    toast.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.1)';
    toast.style.fontSize = '14px';
    toast.style.fontWeight = '500';
    toast.style.zIndex = '999999';
    toast.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    toast.style.transform = 'translateY(20px)';
    toast.style.opacity = '0';
    
    document.body.appendChild(toast);
    
    // Animate in
    requestAnimationFrame(() => {
      toast.style.transform = 'translateY(0)';
      toast.style.opacity = '1';
    });

    // Remove after 3 seconds
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => {
        if (document.body.contains(toast)) {
          document.body.removeChild(toast);
        }
      }, 300);
    }, 3000);
  }

  /**
   * Generates a printable HTML string based on the role and data.
   */
  private generateHtml(taskType: PrinterRole, data: any): string {
    const isKot = taskType === 'KOT';
    const isBill = taskType === 'BILL';
    
    // Fallbacks
    const orderNumber = data.order_number || (data.id ? data.id.slice(0, 8).toUpperCase() : 'ORD');
    const tableNo = data.table_number || 'Takeaway';
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
      <html>
        <head>
          <style>
            body {
              font-family: monospace;
              width: 300px; /* Approx 80mm */
              margin: 0;
              padding: 10px;
              color: #000;
              background: #fff;
            }
            .header { text-align: center; margin-bottom: 15px; border-bottom: 1px dashed #000; padding-bottom: 10px; }
            .row { display: flex; justify-content: space-between; margin-bottom: 5px; font-size: 14px; }
            .item { font-size: 14px; margin-bottom: 8px; }
            .item-qty { font-weight: bold; }
            .notes { font-size: 12px; font-style: italic; margin-left: 15px; }
            .divider { border-bottom: 1px dashed #000; margin: 10px 0; }
            .footer { text-align: center; font-size: 12px; margin-top: 15px; border-top: 1px dashed #000; padding-top: 10px; }
            .total-row { font-size: 16px; font-weight: bold; }
          </style>
        </head>
        <body>
    `;

    if (isKot) {
      // KOT Format (Kitchen Order Ticket)
      html += `
          <div class="header">
            <h2>KITCHEN ORDER</h2>
            <h1>Order #${orderNumber}</h1>
            <div>Table: ${tableNo}</div>
            <div>Time: ${time} | Server: ${serverName}</div>
          </div>
      `;
      
      const items = data.items || [];
      items.forEach((item: any) => {
        html += `
          <div class="item">
            <span class="item-qty">${item.quantity}x</span> ${item.name}
            ${item.notes ? `<div class="notes">- ${item.notes}</div>` : ''}
          </div>
        `;
      });
    }

    if (isBill) {
      // Cashier Bill Format
      html += `
          <div class="header">
            <h2>RECEIPT</h2>
            <div>Table: ${tableNo}</div>
            <div>Order #${orderNumber}</div>
            <div>Time: ${time} | Server: ${serverName}</div>
          </div>
      `;

      const items = data.items || [];
      items.forEach((item: any) => {
        html += `
          <div class="item">
            <div class="row">
              <span>${item.quantity}x ${item.name}</span>
              <span>Rs ${(item.quantity * (item.price || 0)).toFixed(2)}</span>
            </div>
            ${item.notes ? `<div class="notes">- ${item.notes}</div>` : ''}
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
          <div class="row"><span>Tax:</span> <span>Rs ${Number(tax).toFixed(2)}</span></div>
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

  /**
   * Executes a system print by rendering an invisible iframe.
   */
  private executeSystemPrint(htmlContent: string): Promise<boolean> {
    return new Promise((resolve) => {
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '-1000px';
      iframe.style.bottom = '-1000px';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = 'none';

      document.body.appendChild(iframe);

      const win = iframe.contentWindow;
      if (!win) {
        document.body.removeChild(iframe);
        resolve(false);
        return;
      }

      win.document.open();
      win.document.write(htmlContent);
      win.document.close();

      // Wait a tiny bit for resources to load just in case
      setTimeout(() => {
        win.focus();
        win.print();
        
        // Cleanup after print dialog closes
        setTimeout(() => {
          document.body.removeChild(iframe);
          resolve(true);
        }, 1000);
      }, 250);
    });
  }
}

export const printService = new PrintService();
