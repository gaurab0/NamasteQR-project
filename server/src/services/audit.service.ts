import { Request } from 'express';
import { db } from './db.service';
import { AuditEventType } from '../types';

export class AuditService {
  async logActivity(data: {
    userId: string;
    accountName: string;
    businessName?: string | null;
    email?: string | null;
    status: 'ONLINE' | 'OFFLINE' | 'PENDING_VERIFICATION' | string;
    eventType: AuditEventType | string;
    req?: any;
    businessId?: string | null;
  }): Promise<void> {
    try {
      const rawIp = data.req?.headers['x-forwarded-for'] || data.req?.socket?.remoteAddress || '127.0.0.1';
      let ipStr = Array.isArray(rawIp) ? rawIp[0] : rawIp?.toString() || '127.0.0.1';
      if (ipStr.includes(',')) {
        ipStr = ipStr.split(',')[0].trim();
      }
      const ipAddress = ipStr.replace('::ffff:', '').trim().slice(0, 45);
      const rawUserAgent = data.req?.headers['user-agent'] || 'ServeFlow Web Client';
      const userAgent = (Array.isArray(rawUserAgent) ? rawUserAgent[0] : rawUserAgent.toString()).slice(0, 255);

      await db.upsertAccountAuditLog({
        userId: data.userId,
        accountName: data.accountName,
        businessName: data.businessName,
        email: data.email,
        status: data.status,
        eventType: data.eventType,
        ipAddress,
        userAgent,
        businessId: data.businessId,
      });
    } catch (err) {
      console.error('Audit log activity failure:', err);
    }
  }

  async log(data: {
    userId?: string | null;
    accountName?: string | null;
    businessId?: string | null;
    email?: string | null;
    status?: string | null;
    eventType: AuditEventType | string;
    req?: Request;
  }): Promise<void> {
    try {
      if (!data.userId) return;

      const user = await db.findUserById(data.userId);
      const business = user?.business_id ? await db.findBusinessById(user.business_id) : null;
      const accountName = data.accountName || business?.name || user?.email || 'ServeFlow Account';
      const email = data.email || user?.email || null;
      
      let status = data.status;
      if (!status) {
        if (data.eventType === 'LOGOUT' || data.eventType === 'PASSWORD_RESET_COMPLETED') {
          status = 'OFFLINE';
        } else if (data.eventType === 'LOGIN_SUCCESS' || data.eventType === 'OTP_VERIFIED') {
          status = 'ONLINE';
        } else {
          status = 'OFFLINE';
        }
      }

      await this.logActivity({
        userId: data.userId,
        accountName,
        businessName: business?.name || accountName,
        email,
        status,
        eventType: data.eventType,
        req: data.req as any,
        businessId: data.businessId || business?.id,
      });
    } catch (err) {
      console.error('Audit log failure:', err);
    }
  }
}

export const auditService = new AuditService();

