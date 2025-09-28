export interface ApiResponse<T = any> {
  success?: boolean;
  data?: T;
  error?: string;
  message?: string;
  code?: string;
  timestamp: number;
}

export interface Session {
  sessionToken: string;
  expiresAt: string;
  createdAt: string;
  userAgent: string;
  ipAddress: string;
  apiKey: string;
}

export interface LoginResponse {
  success: true;
  sessionToken: string;
  expiresAt: string;
  createdAt: string;
  whatsappReady: boolean;
}

export interface WhatsAppStatus {
  isReady: boolean;
  isAuthenticated: boolean;
  isConnected: boolean;
  qrCode?: string;
  lastActivity?: string;
  error?: string;
}

export interface ClientInfo {
  wid?: string;
  pushname?: string;
  platform?: string;
  connected?: boolean;
}

export interface Chat {
  id: string;
  name: string;
  isGroup: boolean;
  isReadOnly: boolean;
  unreadCount: number;
  timestamp: string;
  lastMessage?: {
    content: string;
    fromMe: boolean;
    timestamp: string;
  };
}

export interface Message {
  id: string;
  chatId: string;
  from: string;
  to: string;
  content: string;
  type: 'text' | 'image' | 'video' | 'audio' | 'document' | 'sticker';
  timestamp: string;
  fromMe: boolean;
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  ack: number;
  mediaUrl?: string;
  thumbnailUrl?: string;
  fileName?: string;
  fileSize?: number;
  duration?: number;
}

export interface MessageStats {
  totalMessages: number;
  sentMessages: number;
  receivedMessages: number;
  failedMessages: number;
  successRate: number;
  avgResponseTime: number;
  activeContacts: number;
}

export interface DailyActivity {
  date: string;
  sent: number;
  received: number;
  failed: number;
}

export interface ChatSettings {
  chatId: string;
  aiMode: boolean;
  webhookEnabled: boolean;
  customSettings?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookQueueItem {
  id: number;
  chatId: string;
  messageId: string;
  webhookUrl: string;
  payload: any;
  attempts: number;
  maxAttempts: number;
  status: 'pending' | 'processing' | 'success' | 'failed';
  priority: number;
  lastAttempt?: string;
  nextAttempt?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface HealthStatus {
  overall: {
    healthy: boolean;
    score: number;
    issues: string[];
  };
  components: {
    database: { healthy: boolean; responseTime: number };
    whatsapp: { healthy: boolean; responseTime: number; status: string };
    webhooks: { healthy: boolean; responseTime: number; queueSize: number };
    cache: { healthy: boolean; responseTime: number; usage: number };
  };
}

export interface DashboardData {
  overview: MessageStats;
  dailyActivity: DailyActivity[];
  topContacts: Array<{
    chatId: string;
    name: string;
    messageCount: number;
    lastActivity: string;
  }>;
  messageTypes: Array<{
    type: string;
    count: number;
    percentage: number;
  }>;
  summary: {
    totalMessages: number;
    successRate: number;
    avgResponseTime: number;
    activeContacts: number;
  };
}