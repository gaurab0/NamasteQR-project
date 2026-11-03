export type ERPProviderType = 'NONE' | 'LOCAL_POS' | 'CLOUD_WEBHOOK' | 'ESAFAL' | 'CUSTOM_WEBHOOK';

export interface ERPIntegrationConfig {
  provider: ERPProviderType;
  apiUrl?: string;            // Target API endpoint (cloud HTTPS or local LAN IP e.g. http://192.168.1.100:8080)
  apiKey?: string;            // Secret token / API key
  companyCode?: string;       // Tenant company / database identifier
  branchCode?: string;        // Branch / cost center code
  syncKot: boolean;           // Auto-dispatch KOT on customer / staff order placement
  syncSettlement: boolean;    // Auto-record invoice voucher on bill settlement
  customHeaders?: Record<string, string>;
  isActive: boolean;
}

export interface StandardOrderItemPayload {
  itemId?: string;
  erpItemCode?: string;       // Target software's item ID / SKU
  name: string;
  quantity: number;
  rate: number;               // Gross unit rate
  baseRate?: number;          // Exclusive base rate (pre-13% VAT)
  taxRate?: number;           // e.g. 13 for VAT
  total: number;
  station?: string;           // KITCHEN, BAR, BOTH
  notes?: string;
}

export interface StandardOrderPayload {
  businessId: string;
  orderId: string;
  orderNumber?: string;
  tableNumber: string;
  floor?: string;
  building?: string;
  customerName?: string;
  customerPhone?: string;
  customerPan?: string;
  totalAmount: number;
  subtotal: number;
  taxAmount?: number;
  paymentMethod?: string;
  createdAt: string;
  items: StandardOrderItemPayload[];
}

export interface StandardKOTResponse {
  success: boolean;
  externalKotId?: string;
  message?: string;
  rawResponse?: any;
}

export interface StandardInvoiceResponse {
  success: boolean;
  invoiceNumber?: string;     // Official IRD invoice number returned by 3rd-party ERP (e.g. INV-081/82-1002)
  fiscalYear?: string;
  irdQrCode?: string;         // Official CBMS verification code if generated
  message?: string;
  rawResponse?: any;
}

export interface TestConnectionResponse {
  success: boolean;
  message: string;
  details?: any;
}

export interface ERPProviderAdapter {
  readonly provider: ERPProviderType;
  testConnection(config: ERPIntegrationConfig): Promise<TestConnectionResponse>;
  dispatchKOT(payload: StandardOrderPayload, config: ERPIntegrationConfig): Promise<StandardKOTResponse>;
  syncInvoice(payload: StandardOrderPayload, config: ERPIntegrationConfig): Promise<StandardInvoiceResponse>;
}
