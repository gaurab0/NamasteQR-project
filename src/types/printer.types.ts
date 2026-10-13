export type PrinterRole = 'KOT' | 'BILL' | 'BAR';
export type ConnectionType = 'SYSTEM' | 'NETWORK' | 'USB' | 'BLUETOOTH';
export type KdsPrintMode = 'DISPLAY_ONLY' | 'PRINT_ONLY' | 'BOTH';

export interface PrinterConfig {
  id: string;
  name: string;
  role: PrinterRole;
  connectionType: ConnectionType;
  targetAddress: string; // IP, MAC, USB Port, or System Name
  paperWidth: '80mm' | '58mm';
  enabled: boolean;
  autoPrintKds: boolean;
}

export interface PrintTask {
  taskType: PrinterRole;
  orderData: any; // We can use 'any' or strict types based on the POS structure
  metadata?: any;
}
