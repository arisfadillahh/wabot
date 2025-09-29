import { io, Socket } from 'socket.io-client';

class SocketClient {
  private socket: Socket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;

  connect(sessionToken: string): void {
    if (this.socket?.connected) {
      return;
    }

    this.socket = io(process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3000', {
      auth: {
        token: sessionToken,
      },
      transports: ['websocket', 'polling'],
    });

    this.setupEventHandlers();
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.reconnectAttempts = 0;
    }
  }

  private setupEventHandlers(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('WebSocket connected');
      this.reconnectAttempts = 0;
    });

    this.socket.on('disconnect', (reason) => {
      console.log('WebSocket disconnected:', reason);
      this.handleReconnect();
    });

    this.socket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
      this.handleReconnect();
    });

    // WhatsApp events
    this.socket.on('whatsapp:ready', (data) => {
      console.log('WhatsApp ready:', data);
    });

    this.socket.on('whatsapp:qr', (data) => {
      console.log('QR code received');
    });

    this.socket.on('whatsapp:message', (data) => {
      console.log('New message received:', data);
    });

    this.socket.on('whatsapp:status', (data) => {
      console.log('Status update:', data);
    });

    // Session events
    this.socket.on('session:expired', () => {
      console.log('Session expired');
      this.disconnect();
      // Trigger logout
      window.location.href = '/login';
    });

    // Error events
    this.socket.on('error', (error) => {
      console.error('Socket error:', error);
    });
  }

  private handleReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`Attempting to reconnect... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

      setTimeout(() => {
        const sessionToken = typeof window !== 'undefined' ? localStorage.getItem('sessionToken') : null;
        if (sessionToken) {
          this.connect(sessionToken);
        }
      }, this.reconnectDelay * this.reconnectAttempts);
    } else {
      console.error('Max reconnection attempts reached');
      this.disconnect();
    }
  }

  // Event subscription methods
  onMessage(callback: (data: any) => void): void {
    this.socket?.on('whatsapp:message', callback);
  }

  onStatusChange(callback: (data: any) => void): void {
    this.socket?.on('whatsapp:status', callback);
  }

  onQrReceived(callback: (data: any) => void): void {
    this.socket?.on('whatsapp:qr', callback);
  }

  onReady(callback: (data: any) => void): void {
    this.socket?.on('whatsapp:ready', callback);
  }

  // Remove event listeners
  offMessage(callback: (data: any) => void): void {
    this.socket?.off('whatsapp:message', callback);
  }

  offStatusChange(callback: (data: any) => void): void {
    this.socket?.off('whatsapp:status', callback);
  }

  offQrReceived(callback: (data: any) => void): void {
    this.socket?.off('whatsapp:qr', callback);
  }

  offReady(callback: (data: any) => void): void {
    this.socket?.off('whatsapp:ready', callback);
  }

  isConnected(): boolean {
    return this.socket?.connected || false;
  }
}

export const socketClient = new SocketClient();