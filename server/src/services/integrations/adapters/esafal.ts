import axios from 'axios';
import {
  ERPProviderAdapter,
  ERPIntegrationConfig,
  StandardOrderPayload,
  StandardKOTResponse,
  StandardInvoiceResponse,
  TestConnectionResponse,
} from '../types';

/**
 * eSafal POS / Accounting Software Adapter (Nepal)
 * - Automatically derives taxable base rate (exclusive of 13% VAT) as eSafal stores pre-tax rate.
 * - Dispatches KOT orders to eSafal running tables.
 * - Posts sales settlement to generate official IRD invoice vouchers.
 */
export class ESafalAdapter implements ERPProviderAdapter {
  readonly provider = 'ESAFAL' as const;

  private getClient(config: ERPIntegrationConfig) {
    const baseURL = (config.apiUrl || '').trim().replace(/\/+$/, '');
    return axios.create({
      baseURL,
      timeout: 8000,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...(config.apiKey ? { 'Authorization': `Bearer ${config.apiKey.trim()}` } : {}),
        ...(config.companyCode ? { 'X-Company-Code': config.companyCode.trim() } : {}),
      },
    });
  }

  async testConnection(config: ERPIntegrationConfig): Promise<TestConnectionResponse> {
    if (!config.apiUrl) {
      return { success: false, message: 'eSafal API URL is required.' };
    }
    try {
      const client = this.getClient(config);
      // Ping health check or company status
      const res = await client.get('/api/health').catch(async () => {
        // Fallback to pinging company endpoint
        return await client.get('/api/status');
      });
      return {
        success: true,
        message: `Successfully connected to eSafal Server (${res.status})`,
        details: res.data,
      };
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || 'Failed to connect to eSafal API';
      return {
        success: false,
        message: `eSafal connection error: ${msg}`,
      };
    }
  }

  async dispatchKOT(payload: StandardOrderPayload, config: ERPIntegrationConfig): Promise<StandardKOTResponse> {
    if (!config.apiUrl) {
      return { success: false, message: 'No eSafal API URL configured.' };
    }

    try {
      const client = this.getClient(config);
      
      // Transform items to eSafal KOT line items
      const esafalItems = payload.items.map((item) => {
        // Pre-tax rate derivation: Rate / 1.13 if gross rate includes 13% VAT
        const baseRate = item.baseRate || Number((item.rate / 1.13).toFixed(2));
        return {
          item_id: item.erpItemCode || item.itemId || 0,
          item_name: item.name,
          quantity: item.quantity,
          rate: baseRate,
          station: item.station || 'KITCHEN',
          remarks: item.notes || '',
        };
      });

      const body = {
        table_no: payload.tableNumber,
        floor: payload.floor || '',
        kot_no: payload.orderNumber || payload.orderId,
        order_time: payload.createdAt,
        guest_name: payload.customerName || 'Guest',
        items: esafalItems,
      };

      const res = await client.post('/api/kot/create', body);
      return {
        success: true,
        externalKotId: res.data?.kot_id || res.data?.id || payload.orderNumber,
        message: 'KOT dispatched to eSafal successfully',
        rawResponse: res.data,
      };
    } catch (err: any) {
      console.error('[eSafal Adapter] dispatchKOT error:', err.response?.data || err.message);
      return {
        success: false,
        message: err.response?.data?.message || err.message || 'eSafal KOT dispatch failed',
      };
    }
  }

  async syncInvoice(payload: StandardOrderPayload, config: ERPIntegrationConfig): Promise<StandardInvoiceResponse> {
    if (!config.apiUrl) {
      return { success: false, message: 'No eSafal API URL configured.' };
    }

    try {
      const client = this.getClient(config);

      const items = payload.items.map((item) => {
        const baseRate = item.baseRate || Number((item.rate / 1.13).toFixed(2));
        const taxableAmount = Number((baseRate * item.quantity).toFixed(2));
        const vatAmount = Number((taxableAmount * 0.13).toFixed(2));
        return {
          item_id: item.erpItemCode || item.itemId || 0,
          item_name: item.name,
          quantity: item.quantity,
          base_rate: baseRate,
          taxable_amount: taxableAmount,
          vat_amount: vatAmount,
          gross_amount: Number((taxableAmount + vatAmount).toFixed(2)),
        };
      });

      const body = {
        table_no: payload.tableNumber,
        order_ref: payload.orderNumber || payload.orderId,
        customer_name: payload.customerName || 'Walk-in Guest',
        customer_phone: payload.customerPhone || '',
        customer_pan: payload.customerPan || '',
        payment_mode: payload.paymentMethod || 'CASH',
        items,
        total_amount: payload.totalAmount,
      };

      const res = await client.post('/api/bill/settle', body);
      return {
        success: true,
        invoiceNumber: res.data?.invoice_number || res.data?.bill_no,
        fiscalYear: res.data?.fiscal_year,
        irdQrCode: res.data?.ird_qr || res.data?.cbms_code,
        message: 'Official invoice synced with eSafal successfully',
        rawResponse: res.data,
      };
    } catch (err: any) {
      console.error('[eSafal Adapter] syncInvoice error:', err.response?.data || err.message);
      return {
        success: false,
        message: err.response?.data?.message || err.message || 'eSafal invoice settlement failed',
      };
    }
  }
}
