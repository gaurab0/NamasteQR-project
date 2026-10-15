import axios from 'axios';

export interface BookDemoData {
  name: string;
  businessName: string;
  email: string;
  phone: string;
  location: string;
  queries?: string;
}

export interface SendEnquiryData {
  name: string;
  email: string;
  message: string;
  phone?: string;
}

const api = axios.create({
  baseURL: '/api/contact',
  headers: {
    'Content-Type': 'application/json',
  },
});

export const contactApi = {
  /**
   * Dispatches a Book Demo request to the backend, which routes details directly to info@namasteqr.com
   */
  async bookDemo(data: BookDemoData): Promise<{ success: boolean; message: string }> {
    try {
      const response = await api.post('/demo', data);
      return response.data;
    } catch (err: any) {
      const message = err.response?.data?.error?.message || err.message || 'Failed to submit demo request.';
      throw new Error(message);
    }
  },

  /**
   * Dispatches a general customer enquiry to the backend, which routes details directly to info@namasteqr.com
   */
  async sendEnquiry(data: SendEnquiryData): Promise<{ success: boolean; message: string }> {
    try {
      const response = await api.post('/enquiry', data);
      return response.data;
    } catch (err: any) {
      const message = err.response?.data?.error?.message || err.message || 'Failed to submit inquiry.';
      throw new Error(message);
    }
  },
};
