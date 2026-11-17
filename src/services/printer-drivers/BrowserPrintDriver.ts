import { ThermalPrinterDriver, DriverType, PrinterConfig } from '../../types/printer.types';

export class BrowserPrintDriver implements ThermalPrinterDriver {
  public readonly type: DriverType = 'browser';
  private targetPrinterName: string = 'System Default';

  public get isConnected(): boolean {
    return true; // Always connected as browser print spooler is universally available
  }

  public getName(): string {
    return `Universal Browser Spooler (${this.targetPrinterName})`;
  }

  public async connect(config?: Partial<PrinterConfig>): Promise<void> {
    if (config?.targetAddress) {
      this.targetPrinterName = config.targetAddress;
    }
  }

  public async disconnect(): Promise<void> {
    // No-op for browser spooler
  }

  /**
   * Cleans raw ESC/POS binary text stream by stripping hardware control codes
   * while strictly preserving newlines and space column padding for monospace display.
   */
  public static cleanEscPosText(rawString: string): string {
    return rawString
      // Strip ESC/POS multi-byte commands:
      // ESC @ (init), ESC a n (align), ESC E n (bold), ESC - n (underline), ESC p ... (drawer kick)
      .replace(/\x1B\x40/g, '')
      .replace(/\x1B\x61[\x00-\x03]/g, '')
      .replace(/\x1B\x45[\x00-\x01]/g, '')
      .replace(/\x1B\x2D[\x00-\x02]/g, '')
      .replace(/\x1B\x70[\x00-\xFF]{3}/g, '')
      // GS B n (invert), GS ! n (size), GS V n (cut)
      .replace(/\x1D\x42[\x00-\x01]/g, '')
      .replace(/\x1D\x21[\x00-\xFF]/g, '')
      .replace(/\x1D\x56[\x00-\xFF]{1,2}/g, '')
      // Strip any other non-printable control characters except newline (\n=0x0A) and carriage return (\r=0x0D)
      .replace(/[\x00-\x09\x0B-\x0C\x0E-\x1F\x7F]/g, '')
      // Normalize line breaks
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .trim();
  }

  /**
   * Universal print execution: parses binary text stream or outputs to browser print spooler
   */
  public async sendRaw(data: Uint8Array): Promise<void> {
    // Convert ESC/POS text or raw bytes into a clean printable formatted HTML receipt
    const textDecoder = new TextDecoder('utf-8', { fatal: false });
    const rawString = textDecoder.decode(data);
    const cleanedText = BrowserPrintDriver.cleanEscPosText(rawString);

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <style>
            @media print {
              @page { margin: 0; size: auto; }
              body { margin: 5mm; }
            }
            body {
              font-family: 'Courier New', Courier, monospace;
              font-size: 13px;
              line-height: 1.35;
              color: #000;
              background: #fff;
              width: 290px;
              margin: 0 auto;
              padding: 10px;
            }
            pre {
              font-family: inherit;
              font-size: inherit;
              white-space: pre-wrap;
              word-break: break-word;
              margin: 0;
            }
          </style>
        </head>
        <body>
          <pre>${this.escapeHtml(cleanedText)}</pre>
        </body>
      </html>
    `;

    await this.printHtml(html);
  }

  /**
   * Renders HTML content into an invisible iframe and triggers print spooler
   */
  public printHtml(htmlContent: string): Promise<boolean> {
    return new Promise((resolve) => {
      let printed = false;
      const iframe = document.createElement('iframe');
      // Non-zero dimensions placed off-screen so Chromium layout engine does not skip paint
      iframe.style.position = 'absolute';
      iframe.style.left = '-9999px';
      iframe.style.top = '-9999px';
      iframe.style.width = '320px';
      iframe.style.height = '600px';
      iframe.style.border = 'none';

      const triggerPrint = () => {
        if (printed) return;
        printed = true;

        setTimeout(() => {
          try {
            const win = iframe.contentWindow;
            if (win) {
              win.focus();
              win.print();
            }
          } catch (e) {
            console.warn('[BrowserPrintDriver] Print invocation exception:', e);
          }

          setTimeout(() => {
            if (document.body.contains(iframe)) {
              document.body.removeChild(iframe);
            }
            resolve(true);
          }, 1500);
        }, 250);
      };

      iframe.onload = triggerPrint;

      document.body.appendChild(iframe);

      if ('srcdoc' in iframe) {
        iframe.srcdoc = htmlContent;
      } else {
        const win = iframe.contentWindow;
        if (win) {
          win.document.open();
          win.document.write(htmlContent);
          win.document.close();
        }
      }

      // Safety fallback in case onload does not fire within 600ms
      setTimeout(() => {
        if (!printed) triggerPrint();
      }, 600);
    });
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}
