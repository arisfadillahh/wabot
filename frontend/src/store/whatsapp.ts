import { create } from 'zustand';
import { WhatsAppStatus, ClientInfo, Chat, Message } from '@/types/api';
import { api } from '@/lib/api';
import { websocketService } from '@/lib/websocket';

interface WhatsAppState {
  status: WhatsAppStatus | null;
  clientInfo: ClientInfo | null;
  chats: Chat[];
  selectedChat: Chat | null;
  messages: Message[];
  isLoading: boolean;
  isSendingMessage: boolean;
  error: string | null;

  // Actions
  fetchStatus: () => Promise<void>;
  fetchClientInfo: () => Promise<void>;
  fetchChats: () => Promise<void>;
  selectChat: (chat: Chat | null) => void;
  fetchMessages: (chatId: string) => Promise<void>;
  sendMessage: (to: string, message: string) => Promise<void>;
  searchMessages: (query: string, chatId?: string) => Promise<Message[]>;
  setStatus: (status: WhatsAppStatus) => void;
  addMessage: (message: Message) => void;
  updateMessageStatus: (messageId: string, status: Message['status']) => void;
  clearError: () => void;
}

export const useWhatsAppStore = create<WhatsAppState>((set, get) => {
  // Setup WebSocket event listeners
  const setupWebSocketListeners = () => {
    // New message event
    websocketService.on('message:new', (data) => {
      const state = get();

      // Add message to current chat if it matches
      if (state.selectedChat && data.chatId === state.selectedChat.id) {
        set({ messages: [...state.messages, data.message] });
      }

      // Update chat list with new message
      const updatedChats = state.chats.map(chat =>
        chat.id === data.chatId
          ? { ...chat, lastMessage: data.message, timestamp: data.message.timestamp, unreadCount: data.fromMe ? chat.unreadCount : chat.unreadCount + 1 }
          : chat
      );
      set({ chats: updatedChats });
    });

    // Message status update
    websocketService.on('message:status', (data) => {
      const state = get();
      const updatedMessages = state.messages.map(msg =>
        msg.id === data.messageId ? { ...msg, status: data.status } : msg
      );
      set({ messages: updatedMessages });
    });

    // Chat update event
    websocketService.on('chat:updated', (data) => {
      const state = get();
      const updatedChats = state.chats.map(chat =>
        chat.id === data.chat.id ? { ...chat, ...data.chat } : chat
      );
      set({ chats: updatedChats });

      // Update selected chat if it matches
      if (state.selectedChat && state.selectedChat.id === data.chat.id) {
        set({ selectedChat: { ...state.selectedChat, ...data.chat } });
      }
    });

    // WhatsApp status update
    websocketService.on('whatsapp:status', (data) => {
      set({ status: data.status });
    });
  };

  // Initialize WebSocket listeners
  setupWebSocketListeners();

  return {
    status: null,
    clientInfo: null,
    chats: [],
    selectedChat: null,
    messages: [],
    isLoading: false,
    isSendingMessage: false,
    error: null,

    fetchStatus: async () => {
      set({ isLoading: true, error: null });

      try {
        const status = await api.getStatus() as WhatsAppStatus;
        set({ status, isLoading: false });
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : 'Failed to fetch status',
          isLoading: false,
        });
      }
    },

    fetchClientInfo: async () => {
      try {
        const clientInfo = await api.getClientInfo();
        set({ clientInfo });
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : 'Failed to fetch client info',
        });
      }
    },

    fetchChats: async () => {
      set({ isLoading: true, error: null });

      try {
        const response = await api.getChats() as any;
        set({ chats: response.chats || [], isLoading: false });
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : 'Failed to fetch chats',
          isLoading: false,
        });
      }
    },

    selectChat: (chat: Chat | null) => {
      const currentSelectedChat = get().selectedChat;

      // Leave previous chat room
      if (currentSelectedChat) {
        websocketService.leaveChat(currentSelectedChat.id);
      }

      set({ selectedChat: chat, messages: [] });

      // Join new chat room and fetch messages
      if (chat) {
        websocketService.joinChat(chat.id);
        get().fetchMessages(chat.id);
      }
    },

    fetchMessages: async (chatId: string) => {
      set({ isLoading: true, error: null });

      try {
        const response = await api.getMessages(chatId) as any;
        set({ messages: response.messages || [], isLoading: false });
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : 'Failed to fetch messages',
          isLoading: false,
        });
      }
    },

    sendMessage: async (to: string, message: string) => {
      set({ isSendingMessage: true, error: null });

      try {
        await api.sendMessage(to, message);
        set({ isSendingMessage: false });
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : 'Failed to send message',
          isSendingMessage: false,
        });
        throw error;
      }
    },

    searchMessages: async (query: string, chatId?: string) => {
      set({ isLoading: true, error: null });

      try {
        const response = await api.searchMessages(query, chatId) as any;
        set({ isLoading: false });
        return response.messages || [];
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : 'Failed to search messages',
          isLoading: false,
        });
        return [];
      }
    },

    setStatus: (status: WhatsAppStatus) => {
      set({ status });
    },

    addMessage: (message: Message) => {
      const { selectedChat, messages } = get();

      if (selectedChat && message.chatId === selectedChat.id) {
        set({ messages: [...messages, message] });
      }
    },

    updateMessageStatus: (messageId: string, status: Message['status']) => {
      const { messages } = get();
      const updatedMessages = messages.map(msg =>
        msg.id === messageId ? { ...msg, status } : msg
      );
      set({ messages: updatedMessages });
    },

    clearError: () => set({ error: null }),
  };
});