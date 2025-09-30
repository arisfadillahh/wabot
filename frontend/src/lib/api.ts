import { ApiResponse } from '@/types/api';
import Cookies from 'js-cookie';

class ApiClient {
  private baseUrl: string;
  private csrfToken: string | null = null;

  constructor(baseUrl: string = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000') {
    this.baseUrl = baseUrl;
    this.initializeCsrfToken();
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const authHeaders = this.getAuthHeaders();

    console.log(`Making request to: ${url}`);
    console.log('Auth headers:', authHeaders);

    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
        ...options.headers,
      },
      credentials: 'include',
      ...options,
    });

    console.log('Response status:', response.status);

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      console.error('API Error:', error);
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    const data: ApiResponse<T> = await response.json();

    if (data.error) {
      throw new Error(data.error);
    }

    return data as T;
  }

  private async initializeCsrfToken() {
    if (typeof window !== 'undefined') {
      try {
        const response = await fetch(`${this.baseUrl}/api/csrf-token`, {
          credentials: 'include'
        });
        const data = await response.json();
        this.csrfToken = data.csrfToken;
      } catch (error) {
        console.warn('Failed to initialize CSRF token:', error);
      }
    }
  }

  private getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};

    if (typeof window !== 'undefined') {
      // Try to get session from cookie first, then fallback to localStorage for migration
      const sessionToken = Cookies.get('_session') || localStorage.getItem('sessionToken');
      const apiKey = Cookies.get('apiKey');

      console.log('Auth debug - sessionToken:', sessionToken ? 'exists' : 'missing');
      console.log('Auth debug - apiKey:', apiKey ? 'exists' : 'missing');

      if (sessionToken) {
        // Migrate from localStorage to cookie if needed
        if (!Cookies.get('_session') && localStorage.getItem('sessionToken')) {
          Cookies.set('_session', sessionToken, {
            expires: 1, // 1 day
            secure: window.location.protocol === 'https:',
            sameSite: 'strict'
          });
          localStorage.removeItem('sessionToken');
        }

        // Cookies are automatically sent by browser, but we'll also include header for compatibility
        headers['X-Session-Token'] = sessionToken;
      }

      // Fallback to API key if no session
      if (!sessionToken && apiKey) {
        headers['X-API-Key'] = apiKey;
      }

      if (this.csrfToken) {
        headers['X-CSRF-Token'] = this.csrfToken;
      }
    }

    console.log('Auth headers:', Object.keys(headers));
    return headers;
  }

  // Session Management
  async login(apiKey: string) {
    return this.request('/api/v1/sessions/login', {
      method: 'POST',
      body: JSON.stringify({ apiKey }),
    });
  }

  async validateSession(sessionToken: string) {
    return this.request('/api/auth/validate', {
      method: 'POST',
      body: JSON.stringify({ sessionToken }),
    });
  }

  async refreshSession() {
    return this.request('/api/auth/refresh', {
      method: 'POST',
    });
  }

  async logout() {
    return this.request('/api/v1/sessions/logout', {
      method: 'POST',
    });
  }

  // WhatsApp Operations
  async getStatus() {
    return this.request('/api/v1/whatsapp/status');
  }

  async getClientInfo() {
    return this.request('/api/v1/whatsapp/client-info');
  }

  async sendMessage(to: string, message: string) {
    return this.request('/send', {
      method: 'POST',
      body: JSON.stringify({ to, message }),
    });
  }

  async getChats(page = 1, limit = 50) {
    return this.request(`/api/v1/whatsapp/chats?page=${page}&limit=${limit}`);
  }

  async getChat(chatId: string) {
    return this.request(`/api/v1/whatsapp/chats/${chatId}`);
  }

  async getMessages(chatId: string, limit = 50) {
    return this.request(`/api/messages/${chatId}?limit=${limit}`);
  }

  async searchMessages(query: string, chatId?: string, limit = 50) {
    const params = new URLSearchParams({ query, limit: limit.toString() });
    if (chatId) params.append('chatId', chatId);
    return this.request(`/api/v1/whatsapp/messages/search?${params}`);
  }

  // Analytics
  async getOverview(days = 30) {
    return this.request(`/api/v1/analytics/overview?days=${days}`);
  }

  async getDashboardData(days = 7) {
    return this.request(`/api/v1/analytics/dashboard?days=${days}`);
  }

  
  // Chat Settings
  async getChatSettings() {
    const sessionToken = Cookies.get('_session');
    if (sessionToken) {
      return this.request(`/api/chat-settings`);
    } else {
      // Fallback to API key if no session
      return this.request(`/api/chat-settings`, {
        headers: {
          'X-API-Key': Cookies.get('apiKey') || ''
        }
      });
    }
  }

  async updateChatSettings(chatId: string, settings: Partial<{
    aiMode: boolean;
    webhookEnabled: boolean;
    customSettings: Record<string, any>;
  }>) {
    const sessionToken = Cookies.get('_session');
    if (sessionToken) {
      return this.request(`/api/chat-settings/${chatId}/toggle`, {
        method: 'POST',
        body: JSON.stringify(settings),
      });
    } else {
      // Fallback to API key if no session
      return this.request(`/api/chat-settings/${chatId}/toggle`, {
        method: 'POST',
        body: JSON.stringify(settings),
        headers: {
          'X-API-Key': Cookies.get('apiKey') || ''
        }
      });
    }
  }

  // Webhooks
  async getWebhookStatus() {
    return this.request(`/api/webhook-status`);
  }

  async retryFailedWebhooks() {
    return this.request(`/api/retry-failed-webhooks`, {
      method: 'POST',
    });
  }

  async clearCache() {
    return this.request(`/api/clear-cache`, {
      method: 'POST',
    });
  }

  // Health
  async getHealth() {
    return this.request('/health');
  }

  async getAnalytics() {
    return this.request(`/api/analytics`);
  }
}

export const api = new ApiClient();