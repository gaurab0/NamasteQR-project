import axios from 'axios';
import { config } from '../config/env';

export interface IWhatsAppService {
  sendVerificationOTP(phoneNumber: string, otp: string): Promise<{ success: boolean; messageId?: string }>;
  sendWelcomeMessage?(phoneNumber: string, businessName: string): Promise<{ success: boolean }>;
  sendOrderNotification?(phoneNumber: string, orderDetails: any): Promise<{ success: boolean }>;
  sendReservationNotification?(phoneNumber: string, reservationDetails: any): Promise<{ success: boolean }>;
}

export class MetaWhatsAppProvider implements IWhatsAppService {
  private accessToken: string;
  private phoneNumberId: string;

  constructor() {
    this.accessToken = config.whatsapp.accessToken;
    this.phoneNumberId = config.whatsapp.phoneNumberId;
  }

  async sendVerificationOTP(phoneNumber: string, otp: string): Promise<{ success: boolean; messageId?: string }> {
    if (!this.accessToken || !this.phoneNumberId) {
      if (config.devOtpMode) {
        console.log(`[WhatsApp:Meta DEV_MODE] To: ${phoneNumber} | Code: ${otp}`);
        return { success: true, messageId: `mock-meta-${Date.now()}` };
      }
      throw new Error('Meta WhatsApp Cloud API credentials not configured in environment variables');
    }

    try {
      // Standard WhatsApp Cloud API template or text payload
      const cleanedPhone = phoneNumber.replace(/[^0-9]/g, '');
      const response = await axios.post(
        `https://graph.facebook.com/v18.0/${this.phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: cleanedPhone,
          type: 'text',
          text: {
            preview_url: false,
            body: `Your NamasteQR verification code is: *${otp}*. Valid for 5 minutes. Please do not share this code with anyone.`,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return {
        success: true,
        messageId: response.data?.messages?.[0]?.id,
      };
    } catch (error: any) {
      console.error('Meta WhatsApp API Error:', error.response?.data || error.message);
      if (config.devOtpMode) {
        console.warn(`[WhatsApp Fallback in DEV] Code for ${phoneNumber} is ${otp}`);
        return { success: true, messageId: `dev-fallback-${Date.now()}` };
      }
      throw new Error('Failed to deliver WhatsApp verification code via Meta Cloud API');
    }
  }

  async sendWelcomeMessage(phoneNumber: string, businessName: string) {
    // Extensible for future Phase 2 onboarding
    console.log(`[WhatsApp Welcome] To: ${phoneNumber} | Business: ${businessName}`);
    return { success: true };
  }
}

export class TwilioWhatsAppProvider implements IWhatsAppService {
  private accountSid: string;
  private authToken: string;
  private fromNumber: string;
  private contentSid: string;

  constructor() {
    this.accountSid = config.whatsapp.twilioSid;
    this.authToken = config.whatsapp.twilioToken;
    this.fromNumber = config.whatsapp.twilioFrom || 'whatsapp:+14155238886';
    this.contentSid = config.whatsapp.twilioContentSid;
  }

  async sendVerificationOTP(phoneNumber: string, otp: string): Promise<{ success: boolean; messageId?: string }> {
    if (!this.accountSid || !this.authToken) {
      if (config.devOtpMode) {
        console.log(`[WhatsApp:Twilio DEV_MODE] To: ${phoneNumber} | Code: ${otp}`);
        return { success: true, messageId: `mock-twilio-${Date.now()}` };
      }
      throw new Error('Twilio WhatsApp credentials not configured in environment variables');
    }

    try {
      const formattedTo = phoneNumber.startsWith('whatsapp:') ? phoneNumber : `whatsapp:${phoneNumber}`;
      const url = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`;
      const authHeader = Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64');

      const params = new URLSearchParams();
      params.append('From', this.fromNumber);
      params.append('To', formattedTo);

      if (this.contentSid) {
        params.append('ContentSid', this.contentSid);
        params.append('ContentVariables', JSON.stringify({ '1': otp, '2': 'NamasteQR' }));
      } else {
        params.append('Body', `Your NamasteQR verification code is: ${otp}. Valid for 5 minutes.`);
      }

      const response = await axios.post(url, params.toString(), {
        headers: {
          Authorization: `Basic ${authHeader}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      return {
        success: true,
        messageId: response.data?.sid,
      };
    } catch (error: any) {
      const errData = error.response?.data;
      console.error('Twilio WhatsApp API Error:', errData || error.message);

      if (errData?.code === 21654) {
        console.warn(
          '💡 [Twilio Fix for 21654 ContentSid Required]:\n' +
          '   1. If using Twilio Sandbox: Your test phone number must first send the sandbox join message (e.g. "join <keyword>") to ' + this.fromNumber + ' on WhatsApp to open the 24-hour session window.\n' +
          '   2. If sending without a session: Set TWILIO_CONTENT_SID="HX..." in your .env with your approved Twilio Content Template SID.'
        );
      }

      if (config.devOtpMode) {
        return { success: true, messageId: `dev-fallback-${Date.now()}` };
      }
      throw new Error(errData?.message || 'Failed to deliver WhatsApp verification code via Twilio');
    }
  }
}

export class MockWhatsAppProvider implements IWhatsAppService {
  async sendVerificationOTP(phoneNumber: string, otp: string): Promise<{ success: boolean; messageId?: string }> {
    console.log(`[WhatsApp:MockProvider] Sending 6-digit OTP to ${phoneNumber}: [ ${otp} ]`);
    return { success: true, messageId: `mock-msg-${Date.now()}` };
  }
}

// Factory function to instantiate configured WhatsApp service provider
export function createWhatsAppService(): IWhatsAppService {
  switch (config.whatsapp.provider) {
    case 'twilio':
      return new TwilioWhatsAppProvider();
    case 'mock':
      return new MockWhatsAppProvider();
    case 'meta':
    default:
      return new MetaWhatsAppProvider();
  }
}

export const whatsAppService = createWhatsAppService();
