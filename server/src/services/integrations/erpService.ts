import { prisma } from '../../lib/prisma';
import {
  ERPProviderAdapter,
  ERPIntegrationConfig,
  StandardOrderPayload,
  TestConnectionResponse,
  StandardKOTResponse,
  StandardInvoiceResponse,
} from './types';
import { ESafalAdapter } from './adapters/esafal';
import { WebhookAdapter } from './adapters/webhook';

class ERPService {
  private adapters: Map<string, ERPProviderAdapter> = new Map();

  constructor() {
    this.registerAdapter(new ESafalAdapter());
    this.adapters.set('LOCAL_POS', new ESafalAdapter());
    this.adapters.set('CLOUD_WEBHOOK', new WebhookAdapter());
    this.registerAdapter(new WebhookAdapter());
  }

  private registerAdapter(adapter: ERPProviderAdapter) {
    this.adapters.set(adapter.provider, adapter);
  }

  /**
   * Fetch a business's active ERP integration settings
   */
  async getIntegrationConfig(businessId: string): Promise<ERPIntegrationConfig | null> {
    try {
      const biz = await prisma.business.findUnique({
        where: { id: businessId },
        select: { erp_integration: true },
      });
      if (!biz || !biz.erp_integration) return null;
      return biz.erp_integration as unknown as ERPIntegrationConfig;
    } catch (err) {
      console.error(`[ERPService] Failed to load integration config for ${businessId}:`, err);
      return null;
    }
  }

  /**
   * Save / update a business's ERP integration settings
   */
  async saveIntegrationConfig(businessId: string, config: Partial<ERPIntegrationConfig>): Promise<ERPIntegrationConfig> {
    const existing = (await this.getIntegrationConfig(businessId)) || {
      provider: 'NONE',
      syncKot: true,
      syncSettlement: true,
      isActive: false,
    };

    const updated: ERPIntegrationConfig = {
      ...existing,
      ...config,
      provider: config.provider || existing.provider || 'NONE',
      isActive: config.isActive !== undefined ? config.isActive : (config.provider && config.provider !== 'NONE' ? true : false),
    };

    await prisma.business.update({
      where: { id: businessId },
      data: { erp_integration: updated as any },
    });

    return updated;
  }

  /**
   * Live Test Connection with the target accounting server
   */
  async testConnection(config: ERPIntegrationConfig): Promise<TestConnectionResponse> {
    if (!config.provider || config.provider === 'NONE') {
      return { success: false, message: 'Please select a valid accounting provider first.' };
    }

    const adapter = this.adapters.get(config.provider);
    if (!adapter) {
      return { success: false, message: `No adapter implemented for provider: ${config.provider}` };
    }

    return await adapter.testConnection(config);
  }

  /**
   * Dispatch KOT Order to the external accounting system asynchronously.
   * Fire-and-forget: NEVER blocks or delays kitchen display or local thermal printing.
   */
  dispatchKOTAsync(payload: StandardOrderPayload): void {
    setImmediate(async () => {
      try {
        const config = await this.getIntegrationConfig(payload.businessId);
        if (!config || !config.isActive || config.provider === 'NONE' || !config.syncKot) {
          return;
        }

        const adapter = this.adapters.get(config.provider);
        if (!adapter) return;

        console.log(`[ERPService] Dispatching KOT for order ${payload.orderNumber || payload.orderId} to ${config.provider}...`);
        const res: StandardKOTResponse = await adapter.dispatchKOT(payload, config);
        if (res.success) {
          console.log(`[ERPService] KOT dispatched successfully to ${config.provider} (ID: ${res.externalKotId})`);
        } else {
          console.warn(`[ERPService] KOT dispatch warning from ${config.provider}: ${res.message}`);
        }
      } catch (err: any) {
        console.error('[ERPService] KOT dispatch error:', err.message);
      }
    });
  }

  /**
   * Sync Settled Bill / Tax Invoice to the external accounting system.
   * Can be awaited to capture official IRD invoice numbers.
   */
  async syncInvoice(payload: StandardOrderPayload): Promise<StandardInvoiceResponse | null> {
    try {
      const config = await this.getIntegrationConfig(payload.businessId);
      if (!config || !config.isActive || config.provider === 'NONE' || !config.syncSettlement) {
        return null;
      }

      const adapter = this.adapters.get(config.provider);
      if (!adapter) return null;

      console.log(`[ERPService] Syncing invoice for order ${payload.orderNumber || payload.orderId} to ${config.provider}...`);
      const res: StandardInvoiceResponse = await adapter.syncInvoice(payload, config);
      return res;
    } catch (err: any) {
      console.error('[ERPService] Invoice sync error:', err.message);
      return { success: false, message: err.message };
    }
  }
}

export const erpService = new ERPService();
