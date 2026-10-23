import { PrinterRole, ReceiptData } from '../types/printer.types';

/**
 * ESC/POS Command Constants
 */
export const ESCPOS = {
  // Initialization
  INIT: [0x1b, 0x40], // ESC @

  // Text Alignment
  ALIGN_LEFT: [0x1b, 0x61, 0x00],
  ALIGN_CENTER: [0x1b, 0x61, 0x01],
  ALIGN_RIGHT: [0x1b, 0x61, 0x02],

  // Text Formatting
  BOLD_ON: [0x1b, 0x45, 0x01],
  BOLD_OFF: [0x1b, 0x45, 0x00],
  UNDERLINE_ON: [0x1b, 0x2d, 0x01],
  UNDERLINE_OFF: [0x1b, 0x2d, 0x00],
  INVERT_ON: [0x1d, 0x42, 0x01], // White on black
  INVERT_OFF: [0x1d, 0x42, 0x00],

  // Text Sizing (GS ! n)
  SIZE_NORMAL: [0x1d, 0x21, 0x00],
  SIZE_DOUBLE_HEIGHT: [0x1d, 0x21, 0x01],
  SIZE_DOUBLE_WIDTH: [0x1d, 0x21, 0x10],
  SIZE_DOUBLE_BOTH: [0x1d, 0x21, 0x11],
  SIZE_LARGE: [0x1d, 0x21, 0x22],

  // Paper Handling & Feeds
  LINE_FEED: [0x0a],
  PARTIAL_CUT: [0x1d, 0x56, 0x41, 0x03], // GS V A 3 (feed 3 lines & partial cut)
  FULL_CUT: [0x1d, 0x56, 0x00],

  // Hardware Peripherals
  DRAWER_KICK: [0x1b, 0x70, 0x00, 0x19, 0xfa], // Cash drawer pulse pin 2
} as const;

export type EscPosAlignment = 'left' | 'center' | 'right';
export type EscPosTextSize = 'normal' | 'double-height' | 'double-width' | 'double-both' | 'large';

export interface EscPosReceiptOptions {
  paperWidth?: '80mm' | '58mm';
  role?: PrinterRole;
  autoCut?: boolean;
  feedLines?: number;
  openCashDrawer?: boolean;
}

/**
 * Unified ESC/POS Command Encoder Helper
 * Fluent builder for compiling binary thermal printer instruction buffers
 */
export class EscPosEncoder {
  private buffer: number[] = [];
  private encoder: TextEncoder;

  constructor() {
    this.encoder = new TextEncoder();
    this.initialize();
  }

  public static create(): EscPosEncoder {
    return new EscPosEncoder();
  }

  /**
   * Resets printer hardware state to default settings
   */
  public initialize(): this {
    this.buffer.push(...ESCPOS.INIT);
    return this;
  }

  /**
   * Sets text alignment
   */
  public align(alignment: EscPosAlignment): this {
    if (alignment === 'center') {
      this.buffer.push(...ESCPOS.ALIGN_CENTER);
    } else if (alignment === 'right') {
      this.buffer.push(...ESCPOS.ALIGN_RIGHT);
    } else {
      this.buffer.push(...ESCPOS.ALIGN_LEFT);
    }
    return this;
  }

  /**
   * Toggles bold font weight
   */
  public bold(enable: boolean = true): this {
    this.buffer.push(...(enable ? ESCPOS.BOLD_ON : ESCPOS.BOLD_OFF));
    return this;
  }

  /**
   * Toggles single underline
   */
  public underline(enable: boolean = true): this {
    this.buffer.push(...(enable ? ESCPOS.UNDERLINE_ON : ESCPOS.UNDERLINE_OFF));
    return this;
  }

  /**
   * Toggles inverted white-on-black text
   */
  public invert(enable: boolean = true): this {
    this.buffer.push(...(enable ? ESCPOS.INVERT_ON : ESCPOS.INVERT_OFF));
    return this;
  }

  /**
   * Sets font size scaling
   */
  public size(size: EscPosTextSize): this {
    switch (size) {
      case 'double-height':
        this.buffer.push(...ESCPOS.SIZE_DOUBLE_HEIGHT);
        break;
      case 'double-width':
        this.buffer.push(...ESCPOS.SIZE_DOUBLE_WIDTH);
        break;
      case 'double-both':
        this.buffer.push(...ESCPOS.SIZE_DOUBLE_BOTH);
        break;
      case 'large':
        this.buffer.push(...ESCPOS.SIZE_LARGE);
        break;
      case 'normal':
      default:
        this.buffer.push(...ESCPOS.SIZE_NORMAL);
        break;
    }
    return this;
  }

  /**
   * Appends raw bytes directly to stream
   */
  public raw(bytes: number[] | Uint8Array): this {
    if (bytes instanceof Uint8Array) {
      for (let i = 0; i < bytes.length; i++) {
        this.buffer.push(bytes[i]);
      }
    } else {
      this.buffer.push(...bytes);
    }
    return this;
  }

  /**
   * Appends formatted text
   */
  public text(str: string): this {
    if (!str) return this;
    const encoded = this.encoder.encode(str);
    for (let i = 0; i < encoded.length; i++) {
      this.buffer.push(encoded[i]);
    }
    return this;
  }

  /**
   * Appends text followed by a newline (LF)
   */
  public line(str: string = ''): this {
    this.text(str);
    this.buffer.push(...ESCPOS.LINE_FEED);
    return this;
  }

  /**
   * Feeds n blank lines
   */
  public feed(lines: number = 1): this {
    for (let i = 0; i < Math.max(1, lines); i++) {
      this.buffer.push(...ESCPOS.LINE_FEED);
    }
    return this;
  }

  /**
   * Emits paper cut command
   */
  public cut(partial: boolean = true): this {
    this.buffer.push(...(partial ? ESCPOS.PARTIAL_CUT : ESCPOS.FULL_CUT));
    return this;
  }

  /**
   * Sends cash drawer kick pulse
   */
  public cashDrawer(): this {
    this.buffer.push(...ESCPOS.DRAWER_KICK);
    return this;
  }

  /**
   * Prints horizontal divider line
   */
  public divider(char: string = '-', width: number = 48): this {
    const lineStr = char.repeat(width).slice(0, width);
    this.align('left').line(lineStr);
    return this;
  }

  /**
   * Prints a two-column row with left and right alignment padded to paper width
   */
  public row(left: string, right: string, width: number = 48): this {
    const cleanRight = right.length > width ? right.slice(0, width) : right;
    const rightLen = cleanRight.length;
    const availableLeft = Math.max(0, width - rightLen - 1);
    let truncatedLeft = left;
    if (availableLeft <= 0) {
      truncatedLeft = '';
    } else if (left.length > availableLeft) {
      truncatedLeft = availableLeft > 1 ? left.slice(0, availableLeft - 1) + '…' : left.slice(0, 1);
    }
    const spaceCount = Math.max(1, width - truncatedLeft.length - rightLen);
    const fullLine = truncatedLeft + ' '.repeat(spaceCount) + cleanRight;
    this.align('left').line(fullLine);
    return this;
  }

  /**
   * Compiles the command stream into a final unified Uint8Array buffer
   */
  public encode(): Uint8Array {
    return new Uint8Array(this.buffer);
  }

  /**
   * Higher-level helper: builds a complete formatted receipt for POS sales or KOT
   */
  public static buildReceipt(data: ReceiptData | any, options: EscPosReceiptOptions = {}): Uint8Array {
    const paperWidth = options.paperWidth || '80mm';
    const cols = paperWidth === '58mm' ? 32 : 48;
    const role = options.role || (data.order_type === 'KOT' ? 'KOT' : 'BILL');
    const isKot = role === 'KOT';
    const isBar = role === 'BAR';

    const encoder = new EscPosEncoder();

    // Kick cash drawer if configured for cashier receipts
    if (options.openCashDrawer && !isKot && !isBar) {
      encoder.cashDrawer();
    }

    // Header
    encoder.align('center');
    if (!isKot) {
      const restName = data.restaurant_name || 'ServeFlow Restaurant';
      encoder.bold(true).size('double-both').line(restName).size('normal').bold(false);
      if (data.restaurant_address) encoder.line(data.restaurant_address);
      if (data.restaurant_phone) encoder.line(`Tel: ${data.restaurant_phone}`);
      if (data.restaurant_pan) encoder.line(`PAN/VAT: ${data.restaurant_pan}`);
      encoder.feed(1);
    }

    // Title banner
    encoder.bold(true).size('double-height');
    if (isKot) {
      encoder.line('*** KITCHEN ORDER TICKET ***');
    } else if (isBar) {
      encoder.line('*** BAR BEVERAGE TICKET ***');
    } else {
      encoder.line('TAX INVOICE / RECEIPT');
    }
    encoder.size('normal').bold(false);

    // Meta details
    encoder.align('left').divider('-', cols);
    const orderNo = data.order_number || (data.id ? String(data.id).slice(0, 8).toUpperCase() : 'ORD');
    const tableNo = data.table_number || 'Takeaway';
    const serverName = data.waiter_name || 'Staff';
    const dateStr = typeof data.created_at === 'string' 
      ? data.created_at 
      : new Date(data.created_at || Date.now()).toLocaleString();

    encoder.row(`Order #: ${orderNo}`, `Table: ${tableNo}`, cols);
    encoder.row(`Date: ${dateStr.slice(0, 20)}`, `Staff: ${serverName}`, cols);

    if (data.customer_name) {
      encoder.row(`Guest: ${data.customer_name}`, data.customer_phone || '', cols);
    }

    encoder.divider('=', cols);

    // Items list header
    encoder.bold(true);
    if (cols === 32) {
      encoder.row('ITEM (QTY)', isKot ? 'QTY' : 'AMT', cols);
    } else {
      encoder.row('ITEM DESCRIPTION', isKot ? 'QUANTITY' : 'PRICE     TOTAL', cols);
    }
    encoder.bold(false).divider('-', cols);

    const items = Array.isArray(data.items) ? data.items : [];
    items.forEach((item: any) => {
      const qty = item.quantity || 1;
      const name = item.name || 'Dish';
      const price = Number(item.price || 0);
      const lineTotal = Number(item.total || qty * price);

      encoder.bold(isKot);
      if (isKot) {
        encoder.row(`${qty}x ${name}`, `[ ${qty} ]`, cols);
      } else {
        if (cols === 32) {
          encoder.row(`${qty}x ${name}`, `Rs ${lineTotal.toFixed(2)}`, cols);
        } else {
          const pricePart = `${price.toFixed(2)}  ${lineTotal.toFixed(2)}`;
          encoder.row(`${qty}x ${name}`, `Rs ${pricePart}`, cols);
        }
      }
      encoder.bold(false);

      if (item.notes) {
        encoder.align('left').text(`  * Note: ${item.notes}`).feed(1);
      }
      if (Array.isArray(item.modifiers) && item.modifiers.length > 0) {
        encoder.align('left').text(`  + ${item.modifiers.join(', ')}`).feed(1);
      }
    });

    encoder.divider('-', cols);

    // Totals section (for Bill)
    if (!isKot) {
      const subtotal = Number(data.subtotal || 0);
      const tax = Number(data.tax_amount ?? data.total_tax ?? data.tax ?? 0);
      const discount = Number(data.discount_amount ?? data.promo_discount ?? 0);
      const total = Number(data.total_amount ?? subtotal + tax - discount);

      encoder.row('Subtotal:', `Rs ${subtotal.toFixed(2)}`, cols);
      if (tax > 0) encoder.row('Tax / VAT:', `Rs ${tax.toFixed(2)}`, cols);
      if (discount > 0) encoder.row('Discount:', `-Rs ${discount.toFixed(2)}`, cols);

      encoder.divider('=', cols);
      encoder.bold(true).size('double-height');
      encoder.row('GRAND TOTAL:', `Rs ${total.toFixed(2)}`, cols);
      encoder.size('normal').bold(false);

      if (data.payment_method) {
        encoder.divider('-', cols);
        encoder.row('Payment Mode:', String(data.payment_method).toUpperCase(), cols);
      }

      encoder.feed(1);
      encoder.align('center');
      encoder.line('Thank you for dining with us!');
      encoder.line('Please visit again');
    } else {
      if (data.notes) {
        encoder.align('left').bold(true).line(`KITCHEN INSTRUCTIONS: ${data.notes}`).bold(false);
      }
    }

    // Feed lines & cut
    const feed = options.feedLines ?? 3;
    encoder.feed(feed);

    if (options.autoCut !== false) {
      encoder.cut(true);
    }

    return encoder.encode();
  }

  /**
   * Higher-level helper: builds a diagnostic test receipt to verify connection & alignment
   */
  public static buildTestPrint(config: {
    name: string;
    connectionType: string;
    targetAddress?: string;
    paperWidth?: '80mm' | '58mm';
    feedLines?: number;
    autoCut?: boolean;
  }): Uint8Array {
    const paperWidth = config.paperWidth || '80mm';
    const cols = paperWidth === '58mm' ? 32 : 48;
    const encoder = new EscPosEncoder();

    encoder.align('center');
    encoder.bold(true).size('double-both').line('ServeFlow POS').size('normal').bold(false);
    encoder.line('Hardware & Thermal Printer Engine');
    encoder.feed(1);

    encoder.invert(true).bold(true).line('  *** HARDWARE TEST PRINT ***  ').bold(false).invert(false);
    encoder.divider('=', cols);

    encoder.align('left');
    encoder.row('Printer Profile:', config.name, cols);
    encoder.row('Connection Type:', config.connectionType, cols);
    if (config.targetAddress) {
      encoder.row('Address / Port:', config.targetAddress, cols);
    }
    encoder.row('Paper Width:', paperWidth, cols);
    encoder.row('Column Width:', `${cols} Characters`, cols);
    encoder.row('Timestamp:', new Date().toLocaleTimeString(), cols);

    encoder.divider('-', cols);
    encoder.bold(true).line('Font & Alignment Check:').bold(false);
    encoder.align('left').line('[LEFT ALIGNED TEXT]');
    encoder.align('center').line('[CENTER ALIGNED TEXT]');
    encoder.align('right').line('[RIGHT ALIGNED TEXT]');

    encoder.divider('-', cols);
    encoder.bold(true).size('double-height').line('Double Height Test').size('normal').bold(false);
    encoder.bold(true).size('double-width').line('Double Width Test').size('normal').bold(false);

    encoder.divider('=', cols);
    encoder.align('center');
    encoder.bold(true).line('STATUS: ALL SYSTEMS OPERATIONAL').bold(false);
    encoder.line('Ready for high-speed POS receipts & KOT');

    encoder.feed(config.feedLines ?? 3);
    if (config.autoCut !== false) {
      encoder.cut(true);
    }

    return encoder.encode();
  }
}
