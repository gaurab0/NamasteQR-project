export type PrinterRole = 'KOT' | 'BILL' | 'BAR' | 'BOTH';
export type ConnectionType = 'SYSTEM' | 'NETWORK' | 'USB' | 'BLUETOOTH';
export type KdsPrintMode = 'DISPLAY_ONLY' | 'PRINT_ONLY' | 'BOTH';
export type DriverType = 'usb' | 'bluetooth' | 'lan' | 'browser';

export interface PrinterConfig {
  id: string;
  name: string;
  role: PrinterRole;
  connectionType: ConnectionType;
  targetAddress: string; // IP, MAC, USB Name, or System Name
  paperWidth: '80mm' | '58mm';
  enabled: boolean;
  autoPrintKds: boolean;
  // Extended thermal printer settings
  port?: number; // Default 9100 for LAN
  feedLines?: number; // Lines to feed before cut (default 3)
  autoCut?: boolean; // Cut paper after printing (default true)
  openCashDrawer?: boolean; // Kick drawer for cashier receipts
  usbVendorId?: number;
  usbProductId?: number;
  bluetoothDeviceId?: string;
  lastConnected?: string;
  status?: 'connected' | 'disconnected' | 'testing' | 'error';
}

export interface PrintTask {
  taskType: PrinterRole;
  orderData: any;
  metadata?: any;
}

/**
 * Standard unified interface for thermal printer hardware drivers
 */
export interface ThermalPrinterDriver {
  readonly type: DriverType;
  readonly isConnected: boolean;
  connect(config?: Partial<PrinterConfig>): Promise<void>;
  disconnect(): Promise<void>;
  sendRaw(data: Uint8Array): Promise<void>;
  getName?(): string;
}

export interface ReceiptItem {
  name: string;
  quantity: number;
  price?: number;
  total?: number;
  notes?: string;
  modifiers?: string[];
}

export interface ReceiptData {
  id?: string;
  order_number?: string | number;
  table_number?: string;
  waiter_name?: string;
  created_at?: string | Date;
  date_format_billing?: string;
  items: ReceiptItem[];
  subtotal?: number;
  tax_amount?: number;
  total_tax?: number;
  tax?: number;
  discount_amount?: number;
  promo_discount?: number;
  total_amount?: number;
  payment_method?: string;
  customer_name?: string;
  customer_phone?: string;
  restaurant_name?: string;
  restaurant_address?: string;
  restaurant_phone?: string;
  restaurant_pan?: string;
  notes?: string;
}
