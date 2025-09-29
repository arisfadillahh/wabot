import { io, Socket } from 'socket.io-client';
import { useState, useEffect } from 'react';

interface WebSocketOptions {
  autoConnect?: boolean;
  reconnection?: boolean;
  reconnectionDelay?: number;
  reconnectionAttempts?: number;
}

class WebSocketService {
  private socket: Socket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private isConnecting = false;

  connect(options: WebSocketOptions = {}) {
    if (this.socket?.connected || this.isConnecting) return;

    // Get session token from secure cookie or localStorage
    const getCookie = (name: string) => {
      if (typeof window === 'undefined') return null;
      const value = `; ${document.cookie}`;
      const parts = value.split(`; ${name}=`);
      if (parts.length === 2) return parts.pop()?.split(';').shift();
      return null;
    };

    const sessionToken = getCookie('_session') || (typeof window !== 'undefined' ? localStorage.getItem('sessionToken') : null);

    // Check if we're in production
    const isProduction = process.env.NODE_ENV === 'production';

    // For production, require session token
    if (isProduction && !sessionToken) {
      console.error('Session token required for WebSocket connection in production');
      return;
    }

    // For development, allow connection without session token
    if (!sessionToken && !isProduction) {
      console.warn('No session token available for WebSocket connection, connecting without auth for development');
    }

    this.isConnecting = true;

    const {
      autoConnect = true,
      reconnection = true,
      reconnectionDelay = 1000,
      reconnectionAttempts = 5
    } = options;

    const auth = sessionToken ? { token: sessionToken } : {};

    // Use secure WebSocket in production
    const wsUrl = isProduction
      ? (process.env.NEXT_PUBLIC_WSS_URL || 'wss://your-domain.com')
      : (process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3000');

    this.socket = io(wsUrl, {
      autoConnect,
      reconnection,
      reconnectionDelay,
      reconnectionAttempts,
      transports: ['websocket', 'polling'],
      auth,
      secure: isProduction,
      upgrade: true,
      rememberUpgrade: true
    });

    this.setupEventListeners();
  }

  private setupEventListeners() {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('WebSocket connected');
      this.isConnecting = false;
      this.clearReconnectTimer();
    });

    this.socket.on('disconnect', (reason) => {
      console.log('WebSocket disconnected:', reason);
      this.isConnecting = false;

      if (reason === 'io server disconnect') {
        // Server initiated disconnect, don't auto-reconnect
        this.socket?.disconnect();
      } else {
        // Network error, try to reconnect
        this.scheduleReconnect();
      }
    });

    this.socket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
      this.isConnecting = false;
      this.scheduleReconnect();
    });

    // Message events
    this.socket.on('message:new', (data) => {
      console.log('New message received:', data);
      this.emit('message:new', data);
    });

    this.socket.on('message:status', (data) => {
      console.log('Message status update:', data);
      this.emit('message:status', data);
    });

    // Chat events
    this.socket.on('chat:updated', (data) => {
      console.log('Chat updated:', data);
      this.emit('chat:updated', data);
    });

    // WhatsApp status events
    this.socket.on('whatsapp:status', (data) => {
      console.log('WhatsApp status update:', data);
      this.emit('whatsapp:status', data);
    });

    // WhatsApp QR events
    this.socket.on('whatsapp:qr', (data) => {
      console.log('WhatsApp QR code received:', data);
      this.emit('whatsapp:qr', data);
    });

    // WhatsApp ready events
    this.socket.on('whatsapp:ready', (data) => {
      console.log('WhatsApp ready:', data);
      this.emit('whatsapp:ready', data);
    });

    // System events
    this.socket.on('system:notification', (data) => {
      console.log('System notification:', data);
      this.emit('system:notification', data);
    });

    // Health events
    this.socket.on('health:update', (data) => {
      console.log('Health status update:', data);
      this.emit('health:update', data);
    });
  }

  private scheduleReconnect() {
    this.clearReconnectTimer();

    this.reconnectTimer = setTimeout(() => {
      if (!this.socket?.connected && !this.isConnecting) {
        console.log('Attempting to reconnect WebSocket...');
        this.connect();
      }
    }, 5000);
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  disconnect() {
    this.clearReconnectTimer();

    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }

    this.isConnecting = false;
  }

  // Event subscription system
  private eventListeners: Map<string, Function[]> = new Map();

  on(event: string, callback: Function) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)?.push(callback);

    // Return unsubscribe function
    return () => {
      const listeners = this.eventListeners.get(event);
      if (listeners) {
        const index = listeners.indexOf(callback);
        if (index > -1) {
          listeners.splice(index, 1);
        }
      }
    };
  }

  private emit(event: string, data: any) {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach(callback => callback(data));
    }
  }

  // Public methods for sending messages
  sendMessage(event: string, data: any) {
    if (this.socket?.connected) {
      this.socket.emit(event, data);
    } else {
      console.warn('WebSocket not connected, cannot send message');
    }
  }

  // Convenience methods
  joinChat(chatId: string) {
    this.sendMessage('chat:join', { chatId });
  }

  leaveChat(chatId: string) {
    this.sendMessage('chat:leave', { chatId });
  }

  requestStatus() {
    this.sendMessage('status:request', {});
  }

  subscribeToHealthUpdates() {
    this.sendMessage('health:subscribe', {});
  }

  // Get connection status
  isConnected(): boolean {
    return this.socket?.connected || false;
  }

  getConnectionState(): string {
    if (!this.socket) return 'disconnected';
    return this.socket.connected ? 'connected' : 'disconnected';
  }
}

// Singleton instance
export const websocketService = new WebSocketService();

// React hook for WebSocket
export function useWebSocket() {
  const [isConnected, setIsConnected] = useState(false);
  const [connectionState, setConnectionState] = useState('disconnected');

  useEffect(() => {
    const handleConnect = () => {
      setIsConnected(true);
      setConnectionState('connected');
    };

    const handleDisconnect = () => {
      setIsConnected(false);
      setConnectionState('disconnected');
    };

    const handleStatusUpdate = (data: any) => {
      setConnectionState(data.status || 'disconnected');
    };

    // Subscribe to events
    const unsubscribeConnect = websocketService.on('connect', handleConnect);
    const unsubscribeDisconnect = websocketService.on('disconnect', handleDisconnect);
    const unsubscribeStatus = websocketService.on('whatsapp:status', handleStatusUpdate);

    // Connect if not already connected
    if (!websocketService.isConnected()) {
      websocketService.connect();
    }

    // Cleanup
    return () => {
      unsubscribeConnect();
      unsubscribeDisconnect();
      unsubscribeStatus();
    };
  }, []);

  return {
    isConnected,
    connectionState,
    socket: (websocketService as any).socket,
    connect: () => websocketService.connect(),
    disconnect: () => websocketService.disconnect(),
    sendMessage: (event: string, data: any) => websocketService.sendMessage(event, data),
    on: (event: string, callback: Function) => websocketService.on(event, callback),
    joinChat: (chatId: string) => websocketService.joinChat(chatId),
    leaveChat: (chatId: string) => websocketService.leaveChat(chatId),
    requestStatus: () => websocketService.requestStatus(),
    subscribeToHealthUpdates: () => websocketService.subscribeToHealthUpdates()
  };
}