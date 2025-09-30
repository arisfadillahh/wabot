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
  markMessagesAsRead: (chatId: string) => Promise<void>;
  setStatus: (status: WhatsAppStatus) => void;
  addMessage: (message: Message) => void;
  updateMessageStatus: (messageId: string, status: Message['status']) => void;
  clearError: () => void;
  // Chat mode actions
  updateChatMode: (chatId: string, isAI: boolean) => Promise<void>;
  getChatMode: (chatId: string) => Promise<boolean>;
}

// Helper function to extract message content
const getMessageContentString = (message: Message): string => {
  // WhatsApp Web.js messages have direct body property
  if (message.body) return message.body;

  // Check content object structure
  if (message.content?.body) return message.content.body;
  if (typeof message.content === 'string') return message.content;
  if (message.content?.text) return message.content.text;
  if (message.content?.caption) return message.content.caption;
  if (message.content?.description) return message.content.description;

  // Fallback to content or empty string
  return String(message.content || message.body || '');
};

export const useWhatsAppStore = create<WhatsAppState>((set, get) => {
  // Setup WebSocket event listeners
  const setupWebSocketListeners = () => {
    // New message event
    websocketService.on('message:new', (data) => {
      const state = get();
      console.log('New message received:', data);

      // Add message to current chat if it matches
      if (state.selectedChat && data.chatId === state.selectedChat.id) {
        set({ messages: [...state.messages, data.message] });
      }

      // Update chat list with new message
      const updatedChats = state.chats.map(chat =>
        chat.id === data.chatId
          ? {
              ...chat,
              lastMessage: {
                ...data.message,
                content: getMessageContentString(data.message)
              },
              timestamp: data.message.timestamp,
              unreadCount: data.message.fromMe ? chat.unreadCount : chat.unreadCount + 1
            }
          : chat
      );

      const updatedChat = updatedChats.find(c => c.id === data.chatId);
      console.log('Updated chats with new message:', updatedChat);
      console.log('Chat AI mode:', updatedChat?.aiMode);
      console.log('Should appear in Human Agent tab:', !updatedChat?.aiMode);

      // Update chats without triggering loading animation
      set({ chats: updatedChats, isLoading: false });
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

      // Update chats without triggering loading animation
      set({ chats: updatedChats, isLoading: false });

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

  // Log WebSocket connection status
  console.log('WebSocket connection status:', websocketService.getConnectionState());
  console.log('WebSocket connected:', websocketService.isConnected());

  // Try to connect WebSocket manually
  setTimeout(() => {
    console.log('WebSocket service connection status:', websocketService.isConnected());
    console.log('WebSocket connection state:', websocketService.getConnectionState());

    if (!websocketService.isConnected()) {
      console.log('Attempting to connect WebSocket manually...');
      websocketService.connect();

      // Test connection after 2 seconds
      setTimeout(() => {
        console.log('After manual connect - WebSocket connected:', websocketService.isConnected());
        console.log('After manual connect - WebSocket state:', websocketService.getConnectionState());

        // Try to test WebSocket by sending a ping
        if (websocketService.isConnected()) {
          console.log('Testing WebSocket connection...');
          websocketService.sendMessage('test', { message: 'ping' });
        }
      }, 2000);
    }
  }, 1000);

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
        console.log('Full API response:', response);

        // Check response structure
        let chats = [];
        if (response.data && response.data.chats) {
          chats = response.data.chats;
        } else if (response.chats) {
          chats = response.chats;
        } else if (Array.isArray(response)) {
          chats = response;
        } else if (response.success && response.data && Array.isArray(response.data)) {
          chats = response.data;
        }

        console.log('Extracted chats:', chats.length, 'chats');
        console.log('First chat sample:', chats[0]);

        // Get saved chat mode settings from localStorage
        let savedChatModes: Record<string, boolean> = {};
        try {
          const saved = localStorage.getItem('chatModeSettings');
          if (saved) {
            savedChatModes = JSON.parse(saved);
          }
        } catch (error) {
          console.warn('Failed to load chat mode settings from localStorage:', error);
        }

        // Update chats with saved AI mode settings, default to true if not saved
        const updatedChats = chats.map(chat => ({
          ...chat,
          aiMode: savedChatModes[chat.id] ?? true
        }));

        set({ chats: updatedChats, isLoading: false });
      } catch (error) {
        console.error('Error fetching chats:', error);

        // Try auto-login with API key if session expired
        if (error instanceof Error && (error.message.includes('Invalid session') || error.message.includes('HTTP 403'))) {
          try {
            console.log('Session expired, clearing and trying auto-login...');
            // Clear expired session
            Cookies.remove('_session');
            localStorage.removeItem('sessionToken');

            const apiKey = Cookies.get('apiKey');
            if (apiKey) {
              await api.login(apiKey);
              // Retry fetching chats after login
              const retryResponse = await api.getChats() as any;

              // Check response structure
              let chats = [];
              if (retryResponse.data && retryResponse.data.chats) {
                chats = retryResponse.data.chats;
              } else if (retryResponse.chats) {
                chats = retryResponse.chats;
              } else if (Array.isArray(retryResponse)) {
                chats = retryResponse;
              } else if (retryResponse.success && retryResponse.data && Array.isArray(retryResponse.data)) {
                chats = retryResponse.data;
              }

              // Get saved chat mode settings from localStorage
              let savedChatModes: Record<string, boolean> = {};
              try {
                const saved = localStorage.getItem('chatModeSettings');
                if (saved) {
                  savedChatModes = JSON.parse(saved);
                }
              } catch (error) {
                console.warn('Failed to load chat mode settings from localStorage:', error);
              }

              // Update chats with saved AI mode settings, default to true if not saved
              const updatedChats = chats.map(chat => ({
                ...chat,
                aiMode: savedChatModes[chat.id] ?? true
              }));

              set({ chats: updatedChats, isLoading: false });
              return;
            }
          } catch (loginError) {
            console.error('Auto-login failed:', loginError);
          }
        }

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
      console.log('Fetching messages for chat:', chatId);
      set({ isLoading: true, error: null });

      try {
        const response = await api.getMessages(chatId) as any;
        console.log('Messages response:', response);
        set({ messages: response.messages || [], isLoading: false });
      } catch (error) {
        console.error('Error fetching messages:', error);
        set({
          error: error instanceof Error ? error.message : 'Failed to fetch messages',
          isLoading: false,
        });
      }
    },

    sendMessage: async (to: string, message: string) => {
      set({ isSendingMessage: true, error: null });

      try {
        // Check if we're in AI mode first
        const state = get();
        if (state.selectedChat && state.selectedChat.aiMode) {
          throw new Error('Cannot send messages in AI mode. Switch to Human mode to send messages.');
        }

        await api.sendMessage(to, message);

        // Optimistic update - add message to UI immediately
        const tempMessage: Message = {
          id: `temp-${Date.now()}`,
          chatId: state.selectedChat?.id || to,
          content: message,
          type: 'text',
          fromMe: true,
          timestamp: new Date().toISOString(),
          status: 'sent'
        };

        set({ messages: [...state.messages, tempMessage] });

        // Optimistic update for chat list
        const updatedChats = state.chats.map(chat =>
          chat.id === tempMessage.chatId
            ? {
                ...chat,
                lastMessage: {
                  ...tempMessage,
                  content: getMessageContentString(tempMessage)
                },
                timestamp: tempMessage.timestamp,
                unreadCount: tempMessage.fromMe ? chat.unreadCount : chat.unreadCount + 1
              }
            : chat
        );

        console.log('Optimistic chat list update:', updatedChats.find(c => c.id === tempMessage.chatId));
        console.log('Temp message content:', getMessageContentString(tempMessage));

        set({ chats: updatedChats, isSendingMessage: false });
      } catch (error) {
        // Remove optimistic message if send failed
        const currentState = get();
        const updatedMessages = currentState.messages.filter(msg => !msg.id.startsWith('temp-'));

        // Also revert chat list optimistic update
        const revertedChats = currentState.chats.map(chat =>
          chat.lastMessage?.id?.startsWith('temp-')
            ? { ...chat, lastMessage: chat.lastMessage.id.startsWith('temp-') ? null : chat.lastMessage }
            : chat
        );

        set({ messages: updatedMessages, chats: revertedChats });
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

    // Chat mode methods
    updateChatMode: async (chatId: string, isAI: boolean) => {
      try {
        await api.updateChatSettings(chatId, { aiMode: isAI });

        // Save to localStorage for persistence
        try {
          const saved = localStorage.getItem('chatModeSettings');
          const savedChatModes: Record<string, boolean> = saved ? JSON.parse(saved) : {};
          savedChatModes[chatId] = isAI;
          localStorage.setItem('chatModeSettings', JSON.stringify(savedChatModes));
        } catch (error) {
          console.warn('Failed to save chat mode settings to localStorage:', error);
        }

        // Update the chat in the chats list
        const { chats, selectedChat } = get();
        const updatedChats = chats.map(chat =>
          chat.id === chatId ? { ...chat, aiMode: isAI } : chat
        );

        // Update selected chat if it matches
        const updatedSelectedChat = selectedChat?.id === chatId
          ? { ...selectedChat, aiMode: isAI }
          : selectedChat;

        set({ chats: updatedChats, selectedChat: updatedSelectedChat });
      } catch (error) {
        console.error('Failed to update chat mode:', error);
        throw error;
      }
    },

    getChatMode: async (chatId: string) => {
      try {
        const settings = await api.getChatSettings() as any;
        return settings[chatId]?.aiMode ?? true; // Default to AI mode
      } catch (error) {
        console.error('Failed to get chat mode:', error);
        return true; // Default to AI mode on error
      }
    },

    markMessagesAsRead: async (chatId: string) => {
      try {
        console.log('🔍 Attempting to mark messages as read for chat:', chatId);

        const { chats, selectedChat } = get();
        console.log('🔍 Current state - chats length:', chats.length, 'selectedChat:', selectedChat?.name);
        console.log('🔍 Chat before update:', chats.find(c => c.id === chatId));

        // Call API to mark as read
        const response = await api.markMessagesAsRead(chatId);
        console.log('🔍 API response:', response);

        // Update local state to reflect read messages
        const updatedChats = chats.map(chat =>
          chat.id === chatId
            ? { ...chat, unreadCount: 0 }
            : chat
        );

        // Update selected chat if it matches
        const updatedSelectedChat = selectedChat?.id === chatId
          ? { ...selectedChat, unreadCount: 0 }
          : selectedChat;

        set({ chats: updatedChats, selectedChat: updatedSelectedChat });

        console.log('✅ Messages marked as read for chat:', chatId);
        console.log('🔍 Chat after update:', updatedChats.find(c => c.id === chatId));
      } catch (error) {
        console.error('❌ Failed to mark messages as read:', error);
        console.log('🔍 Error details:', error.response?.data || error.message);
        // Don't throw error to avoid breaking UX, just log it
      }
    },
  };
});