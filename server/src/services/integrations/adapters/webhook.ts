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
 * Generic Webhook Adapter
 * - For restaurants using any other custom accounting/ERP software
 * - Sends standard JSON payloads with optional custom headers / token
 */
export class WebhookAdapter implements ERPProviderAdapter {
  readonly provider = 'CUSTOM_WEBHOOK' as const;

  async testConnection(config: ERPIntegrationConfig): Promise<TestConnectionResponse> {
    if (!config.apiUrl) return { success: false, message: 'Webhook URL is required.' };
    try {
      const res = await axios.post(config.apiUrl, { event: 'ping', timestamp: new Date().toISOString() }, {
        headers: {
          'Content-Type': 'application/json',
          ...(config.apiKey ? { 'X-Api-Key': config.apiKey } : {}),
          ...(config.customHeaders || {}),
        },
        timeout: 5000,
      });
      return { success: true, message: `Webhook test passed with HTTP ${res.status}` };
    } catch (err: any) {
      return { success: false, message: `Webhook test failed: ${err.message}` };
    }
  }

  async dispatchKOT(payload: StandardOrderPayload, config: ERPIntegrationConfig): Promise<StandardKOTResponse> {
    if (!config.apiUrl) return { success: false, message: 'Webhook URL not set.' };
    try {
      const res = await axios.post(config.apiUrl, { event: 'order.kot', data: payload }, {
        headers: {
          'Content-Type': 'application/json',
          ...(config.apiKey ? { 'X-Api-Key': config.apiKey } : {}),
          ...(config.customHeaders || {}),
        },
        timeout: 8000,
      });
      return { success: true, rawResponse: res.data };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  }

  async syncInvoice(payload: StandardOrderPayload, config: ERPIntegrationConfig): Promise<StandardInvoiceResponse> {
    if (!config.apiUrl) return { success: false, message: 'Webhook URL not set.' };
    try {
      const res = await axios.post(config.apiUrl, { event: 'invoice.settled', data: payload }, {
        headers: {
          'Content-Type': 'application/json',
          ...(config.apiKey ? { 'X-Api-Key': config.apiKey } : {}),
          ...(config.customHeaders || {}),
        },
        timeout: 8000,
      });
      return {
        success: true,
        invoiceNumber: res.data?.invoice_number || res.data?.invoiceNumber,
        rawResponse: res.data,
      };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  }
}
