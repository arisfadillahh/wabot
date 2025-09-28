import { ApiResponse } from '@/types/api';

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v2') {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders(),
        ...options.headers,
      },
      ...options,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    const data: ApiResponse<T> = await response.json();

    if (data.error) {
      throw new Error(data.error);
    }

    return data as T;
  }

  private getAuthHeaders(): Record<string, string> {
    if (typeof window !== 'undefined') {
      const sessionToken = localStorage.getItem('sessionToken');
      if (sessionToken) {
        return { 'X-Session-Token': sessionToken };
      }
    }
    return {};
  }

  // Session Management
  async login(apiKey: string) {
    return this.request('/sessions/login', {
      method: 'POST',
      body: JSON.stringify({ apiKey }),
    });
  }

  async validateSession(sessionToken: string) {
    return this.request('/sessions/validate', {
      method: 'POST',
      body: JSON.stringify({ sessionToken }),
    });
  }

  async logout() {
    return this.request('/sessions/logout', {
      method: 'POST',
    });
  }

  // WhatsApp Operations
  async getStatus() {
    return this.request('/whatsapp/status');
  }

  async getClientInfo() {
    return this.request('/whatsapp/client-info');
  }

  async sendMessage(to: string, message: string) {
    return this.request('/whatsapp/send', {
      method: 'POST',
      body: JSON.stringify({ to, message }),
    });
  }

  async getChats(page = 1, limit = 50) {
    return this.request(`/whatsapp/chats?page=${page}&limit=${limit}`);
  }

  async getChat(chatId: string) {
    return this.request(`/whatsapp/chats/${chatId}`);
  }

  async getMessages(chatId: string, limit = 50) {
    return this.request(`/whatsapp/chats/${chatId}/messages?limit=${limit}`);
  }

  async searchMessages(query: string, chatId?: string, limit = 50) {
    const params = new URLSearchParams({ query, limit: limit.toString() });
    if (chatId) params.append('chatId', chatId);
    return this.request(`/whatsapp/messages/search?${params}`);
  }

  // Analytics
  async getOverview(days = 30) {
    return this.request(`/analytics/overview?days=${days}`);
  }

  async getDashboardData(days = 7) {
    return this.request(`/analytics/dashboard?days=${days}`);
  }

  async getMessageStats(days = 30, chatId?: string) {
    const params = new URLSearchParams({ days: days.toString() });
    if (chatId) params.append('chatId', chatId);
    return this.request(`/analytics/message-stats?${params}`);
  }

  async getDailyActivity(days = 7) {
    return this.request(`/analytics/daily-activity?days=${days}`);
  }

  // Chat Settings
  async getChatSettings(chatId: string) {
    return this.request(`/chat-settings/${chatId}`);
  }

  async updateChatSettings(chatId: string, settings: Partial<{
    aiMode: boolean;
    webhookEnabled: boolean;
    customSettings: Record<string, any>;
  }>) {
    return this.request(`/chat-settings/${chatId}`, {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  }

  // Webhooks
  async getWebhookQueue(page = 1, limit = 50, status?: string) {
    const params = new URLSearchParams({ page: page.toString(), limit: limit.toString() });
    if (status) params.append('status', status);
    return this.request(`/webhooks/queue?${params}`);
  }

  async retryWebhook(id: number) {
    return this.request(`/webhooks/queue/${id}/retry`, {
      method: 'POST',
    });
  }

  // Health
  async getHealth() {
    return this.request('/health/basic');
  }

  async getDetailedHealth() {
    return this.request('/health/detailed');
  }
}

export const api = new ApiClient();