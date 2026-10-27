import axios from 'axios';
import { SignupFormData, LoginFormData, VerifyOtpFormData } from '../types/auth';

const api = axios.create({
  baseURL: '/api/auth',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('serveflow_auth_token') || sessionStorage.getItem('serveflow_auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
    config.headers['x-auth-token'] = token;
  }
  return config;
});

// Helper to format API errors cleanly
function extractError(error: any): { code: string; message: string; retryAfterSeconds?: number; devOtp?: string } {
  if (error.response?.data?.error) {
    return error.response.data.error;
  }
  return {
    code: 'NETWORK_ERROR',
    message: error.message || 'Unable to connect to the server. Please check your network connection.',
  };
}

export const authApi = {
  async signup(data: SignupFormData) {
    try {
      const response = await api.post('/signup', data);
      return response.data;
    } catch (err: any) {
      throw extractError(err);
    }
  },

  async verifyEmail(data: VerifyOtpFormData) {
    try {
      const response = await api.post('/verify-email', data);
      return response.data;
    } catch (err: any) {
      throw extractError(err);
    }
  },

  async resendOtp(data: { email?: string; phone_e164?: string }) {
    try {
      const response = await api.post('/resend-otp', data);
      return response.data;
    } catch (err: any) {
      throw extractError(err);
    }
  },

  async login(data: LoginFormData) {
    try {
      const response = await api.post('/login', data);
      return response.data;
    } catch (err: any) {
      throw extractError(err);
    }
  },

  async getMe() {
    try {
      const response = await api.get('/me');
      return response.data;
    } catch (err: any) {
      if (err.response?.status === 401) {
        return { success: true, data: { user: null } };
      }
      throw extractError(err);
    }
  },

  async updateProfile(data: { name: string }) {
    try {
      const response = await api.put('/profile', data);
      return response.data;
    } catch (err: any) {
      throw extractError(err);
    }
  },

  async logout(data?: { userId?: string; businessId?: string; email?: string; accountName?: string }) {
    try {
      const response = await api.post('/logout', data || {});
      return response.data;
    } catch (err: any) {
      if (err.response?.status === 401) {
        return { success: true };
      }
      throw extractError(err);
    }
  },

  async forgotPassword(email: string) {
    try {
      const response = await api.post('/forgot-password', { email });
      return response.data;
    } catch (err: any) {
      throw extractError(err);
    }
  },

  async resetPassword(data: { token: string; email: string; password: string; confirmPassword: string }) {
    try {
      const response = await api.post('/reset-password', data);
      return response.data;
    } catch (err: any) {
      throw extractError(err);
    }
  },

  async getDevInfo(params?: { phone?: string; email?: string }) {
    try {
      const response = await api.get('/dev-info', { params });
      return response.data;
    } catch {
      return null;
    }
  },


  async deleteAuditLogs(data: { userId?: string; email?: string; filterType: 'ALL' | 'DAY' | 'CUSTOM'; date?: string }) {
    return api.post('/audit-logs/delete', data);
  },

  async getAuditLogs(params?: { userId?: string; email?: string }) {
    try {
      const response = await api.get('/audit-logs', { params });
      return response.data;
    } catch (err: any) {
      throw extractError(err);
    }
  },
};
