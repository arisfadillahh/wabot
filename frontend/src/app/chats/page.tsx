'use client';

import { useEffect, useState, useRef } from 'react';
import Cookies from 'js-cookie';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { AuthGuard } from '@/components/auth/auth-guard';
import { AIHumanToggleWithTooltip } from '@/components/chat/ai-human-toggle';
import {
  MessageCircle,
  Users,
  Search,
  Plus,
  MoreVertical,
  Clock,
  Pin,
  Archive,
  Bot,
  User,
  Home,
  Send,
  Paperclip,
  Smile,
  Phone,
  Video,
  Check,
  CheckCheck,
  ChevronDown
} from 'lucide-react';
import Link from 'next/link';
import { useWhatsAppStore } from '@/store/whatsapp';
import { formatRelativeTime } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { Message } from '@/types/api';
import { toast } from 'react-hot-toast';

interface ChatListItemProps {
  chat: any;
  isSelected?: boolean;
  onClick: () => void;
}

interface MessageBubbleProps {
  message: Message;
  isOwn: boolean;
}

function MessageBubble({ message, isOwn }: MessageBubbleProps) {
  const getStatusIcon = () => {
    if (!isOwn) return null;

    switch (message.status) {
      case 'sent':
        return <Check className="w-3 h-3 text-gray-400" />;
      case 'delivered':
        return <CheckCheck className="w-3 h-3 text-gray-400" />;
      case 'read':
        return <CheckCheck className="w-3 h-3 text-blue-500" />;
      case 'failed':
        return <Clock className="w-3 h-3 text-red-500" />;
      default:
        return null;
    }
  };

  const getMessageContent = () => {
    // Handle different content structures from WhatsApp Web.js
    if (typeof message.content === 'string') {
      return message.content;
    }

    // Check if content is an object with various properties
    if (message.content && typeof message.content === 'object') {
      return message.content.text ||
             message.content.body ||
             message.content.caption ||
             message.content.description ||
             String(message.content || '');
    }

    // Fallback to message body (common in WhatsApp Web.js)
    if (message.body) {
      return message.body;
    }

    // Last resort - convert whatever is left to string
    return String(message.content || '');
  };

  const messageContent = getMessageContent();

  return (
    <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} mb-4 animate-fade-in`}>
      <div className={`max-w-[70%] ${isOwn ? 'order-2 text-right' : 'order-1 text-left'}`}>
        <div
          className={`inline-block p-3 rounded-lg text-left transition-all duration-150 ${
            isOwn
              ? 'bg-[#128C7E] text-white'
              : 'bg-gray-200 text-gray-900 border border-gray-300'
          }`}
        >
          <div className="text-sm whitespace-pre-wrap break-words overflow-hidden">
            {messageContent}
          </div>
        </div>
        <div className={`flex items-center mt-1 space-x-1 ${isOwn ? 'justify-end' : 'justify-start'} min-h-[16px] opacity-0 animate-fade-in`}
             style={{ animationDelay: '0.1s' }}>
          <span className="text-xs text-gray-500 flex-shrink-0">
            {formatRelativeTime(message.timestamp)}
          </span>
          <div className="w-4 h-3 flex items-center justify-center flex-shrink-0">
            {getStatusIcon()}
          </div>
        </div>
      </div>
    </div>
  );
}

function ChatListItem({ chat, isSelected, onClick }: ChatListItemProps) {
  const getUnreadCount = () => {
    if (chat.unreadCount > 0) {
      return (
        <Badge variant="destructive" className="ml-auto bg-green-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center p-0">
          {chat.unreadCount}
        </Badge>
      );
    }
    return null;
  };

  const getChatInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .substring(0, 2)
      .toUpperCase();
  };

  const isAIMode = chat.aiMode ?? true;

  return (
    <div
      className={`flex items-center space-x-3 p-3 cursor-pointer transition-colors duration-150 ${
        isSelected ? 'bg-green-100 dark:bg-green-900/20' : 'hover:bg-gray-100 dark:hover:bg-gray-700'
      }`}
      onClick={onClick}
    >
      <Avatar>
        <AvatarFallback className={chat.isGroup ? 'bg-blue-500 text-white' : 'bg-gray-300 text-gray-700'}>
          {chat.isGroup ? (
            <Users className="w-4 h-4" />
          ) : (
            getChatInitials(chat.name)
          )}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
              {chat.name}
            </p>
            <div className={cn(
              'flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium',
              isAIMode
                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
            )}>
              {isAIMode ? (
                <Bot className="w-3 h-3" />
              ) : (
                <User className="w-3 h-3" />
              )}
            </div>
          </div>
          <div className="flex items-center space-x-1">
            {chat.timestamp && (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {formatRelativeTime(chat.timestamp)}
              </span>
            )}
            {getUnreadCount()}
          </div>
        </div>
        {chat.lastMessage && (
          <div className="flex items-center mt-1">
            <p className="text-xs text-gray-600 dark:text-gray-400 truncate">
              {chat.lastMessage.fromMe ? 'You: ' : ''}
              {chat.lastMessage.content}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ChatsPage() {
  const {
    chats,
    selectedChat,
    messages,
    isLoading,
    isSendingMessage,
    error,
    fetchChats,
    selectChat,
    sendMessage,
    fetchMessages,
    markMessagesAsRead,
    clearError,
    updateChatMode
  } = useWhatsAppStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'ai' | 'human'>('ai');
  const [messageInput, setMessageInput] = useState('');
  const [initialLoading, setInitialLoading] = useState(true);
  const [localAIMode, setLocalAIMode] = useState(true);
  const [isUpdatingMode, setIsUpdatingMode] = useState(false);
  const [showScrollIndicator, setShowScrollIndicator] = useState(false);
  const [shouldScrollToBottom, setShouldScrollToBottom] = useState(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const sessionToken = Cookies.get('_session');
    const apiKey = Cookies.get('apiKey');

    console.log('🔐 Auth check - sessionToken:', sessionToken ? 'exists' : 'missing');
    console.log('🔐 Auth check - apiKey:', apiKey ? 'exists' : 'missing');

    if (!sessionToken && apiKey) {
      console.log('🔐 Attempting auto-login with API key');
      api.login(apiKey).then((response) => {
        console.log('✅ Auto-login successful:', response);
        fetchChats();
      }).catch(error => {
        console.error('❌ Auto-login failed:', error);
        fetchChats();
      });
    } else if (sessionToken) {
      console.log('✅ Using existing session');
      fetchChats();
    } else {
      console.log('⚠️ No session or API key found, using API key fallback');
      // Fallback: try to use API key directly for development
      Cookies.set('apiKey', '123');
      api.login('123').then((response) => {
        console.log('✅ Fallback login successful:', response);
        fetchChats();
      }).catch(error => {
        console.error('❌ Fallback login failed:', error);
        fetchChats();
      });
    }
  }, [fetchChats]);

  useEffect(() => {
    if (selectedChat) {
      setLocalAIMode(selectedChat.aiMode ?? true);
      // Reset scroll indicator when switching chats
      setShowScrollIndicator(false);
      // Always scroll to bottom when switching chats
      setShouldScrollToBottom(true);
      fetchMessages(selectedChat.id);
    }
  }, [selectedChat, fetchMessages]);

  useEffect(() => {
    if (selectedChat && selectedChat.unreadCount > 0) {
      markMessagesAsRead(selectedChat.id);
    }
  }, [selectedChat, markMessagesAsRead]);

  useEffect(() => {
    // Instant jump to bottom when requested
    if (shouldScrollToBottom && messages.length > 0) {
      // Use setTimeout to ensure DOM has updated with new messages
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'auto' }); // Instant jump
        setShouldScrollToBottom(false);
      }, 0); // Execute immediately after current render cycle
    }
  }, [messages, shouldScrollToBottom]);

  useEffect(() => {
    const pollInterval = setInterval(() => {
      if (selectedChat) {
        fetchMessages(selectedChat.id);
      }
    }, 3000);

    return () => clearInterval(pollInterval);
  }, [selectedChat, fetchMessages]);

  // Handle new messages - don't auto scroll
  useEffect(() => {
    if (messages.length > 0 && !shouldScrollToBottom) {
      // New messages loaded, but don't auto scroll
      // Let user see scroll indicator if they're not at bottom
      const container = messagesContainerRef.current;
      if (container) {
        const { scrollTop, scrollHeight, clientHeight } = container;
        const isScrolledUp = scrollTop + clientHeight < scrollHeight - 100;
        setShowScrollIndicator(isScrolledUp);
      }
    }
  }, [messages.length, shouldScrollToBottom]);

  useEffect(() => {
    const chatPollInterval = setInterval(() => {
      fetchChats();
    }, 10000);

    return () => clearInterval(chatPollInterval);
  }, [fetchChats]);

  useEffect(() => {
    if ((chats.length > 0 && !isLoading && initialLoading) || (error && initialLoading)) {
      setInitialLoading(false);
    }
  }, [chats, isLoading, error, initialLoading]);

  // Check if user scrolled up to show scroll indicator
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const isScrolledUp = scrollTop + clientHeight < scrollHeight - 100;
      setShowScrollIndicator(isScrolledUp);
    };

    // Show scroll indicator only after messages are loaded and user has scrolled
    setTimeout(() => {
      container.addEventListener('scroll', handleScroll);
      // Initial check - don't show indicator immediately after loading
      const { scrollTop, scrollHeight, clientHeight } = container;
      const isScrolledUp = scrollTop + clientHeight < scrollHeight - 100;
      setShowScrollIndicator(false); // Start with hidden
    }, 1000);

    return () => container.removeEventListener('scroll', handleScroll);
  }, [messages]);

  const filteredChats = chats.filter(chat => {
    const matchesSearch = chat.name.toLowerCase().includes(searchQuery.toLowerCase());
    if (activeTab === 'ai') return matchesSearch && (chat.aiMode ?? true);
    if (activeTab === 'human') return matchesSearch && !(chat.aiMode ?? true);
    return matchesSearch;
  });

  const getChatsCount = (tab: 'ai' | 'human') => {
    if (tab === 'ai') {
      const aiChats = chats.filter(chat => chat.aiMode ?? true);
      return aiChats.reduce((total, chat) => total + (chat.unreadCount || 0), 0);
    }
    if (tab === 'human') {
      const humanChats = chats.filter(chat => !(chat.aiMode ?? true));
      return humanChats.reduce((total, chat) => total + (chat.unreadCount || 0), 0);
    }
    return 0;
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageInput.trim() || !selectedChat || isSendingMessage || localAIMode) return;

    try {
      await sendMessage(selectedChat.id, messageInput.trim());
      setMessageInput('');
      setTimeout(() => {
        messageInputRef.current?.focus();
      }, 0);
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  };

  const handleToggleAIMode = async (isAI: boolean) => {
    if (!selectedChat || isUpdatingMode) return;

    setIsUpdatingMode(true);
    try {
      await updateChatMode(selectedChat.id, isAI);
      setLocalAIMode(isAI);

      if (!isAI && activeTab !== 'human') {
        setActiveTab('human');
      }

      toast.success(`Switched to ${isAI ? 'AI' : 'Human'} mode`, {
        position: 'top-center',
        duration: 2000,
        style: {
          background: isAI ? '#22c55e' : '#3b82f6',
          color: 'white',
        },
      });
    } catch (error) {
      console.error('Failed to toggle AI mode:', error);
      toast.error('Failed to update chat mode', {
        position: 'top-center',
        duration: 3000,
      });
      setLocalAIMode(!isAI);
    } finally {
      setIsUpdatingMode(false);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'auto' }); // Instant jump
    setShowScrollIndicator(false);
  };

  return (
    <AuthGuard>
      <div className="h-screen flex bg-gray-50 dark:bg-gray-900">
        {/* LEFT SIDEBAR (30% width) */}
        <div className="w-[30%] border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex flex-col">
          {/* Header */}
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                <Link href="/dashboard">
                  <Button variant="ghost" size="sm" className="p-2">
                    <Home className="w-4 h-4" />
                  </Button>
                </Link>
                <h1 className="text-xl font-bold text-gray-900 dark:text-white">Chats</h1>
              </div>
              <div className="flex items-center space-x-2">
                <Button variant="ghost" size="sm">
                  <Plus className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="sm">
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                placeholder="Search chats..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-gray-100 dark:bg-gray-700 border-0"
              />
            </div>
          </div>

          {/* Category Pills */}
          <div className="px-4 py-3 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
            <div className="flex justify-center space-x-4">
              {/* Bot AI Pill */}
              <div
                className={`relative cursor-pointer transition-all duration-200 px-6 py-2 rounded-full min-w-fit flex items-center space-x-2 ${
                  activeTab === 'ai'
                    ? 'bg-green-500 text-white'
                    : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'
                }`}
                onClick={() => setActiveTab('ai')}
              >
                <Bot className="w-4 h-4 flex-shrink-0" />
                <span className="font-medium whitespace-nowrap">
                  Bot AI
                </span>
                {getChatsCount('ai') > 0 && (
                  <div className="flex-shrink-0">
                    <Badge className={`text-xs font-semibold min-w-[24px] h-5 flex items-center justify-center px-1.5 ${
                      activeTab === 'ai'
                        ? 'bg-white/30 text-white'
                        : 'bg-gray-200 text-gray-600'
                    }`}>
                      {getChatsCount('ai')}
                    </Badge>
                  </div>
                )}
              </div>

              {/* Human Agent Pill */}
              <div
                className={`relative cursor-pointer transition-all duration-200 px-6 py-2 rounded-full min-w-fit flex items-center space-x-2 ${
                  activeTab === 'human'
                    ? 'bg-blue-500 text-white'
                    : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'
                }`}
                onClick={() => setActiveTab('human')}
              >
                <User className="w-4 h-4 flex-shrink-0" />
                <span className="font-medium whitespace-nowrap">
                  Human Agent
                </span>
                {getChatsCount('human') > 0 && (
                  <div className="flex-shrink-0">
                    <Badge className={`text-xs font-semibold min-w-[24px] h-5 flex items-center justify-center px-1.5 ${
                      activeTab === 'human'
                        ? 'bg-white/30 text-white'
                        : 'bg-gray-200 text-gray-600'
                    }`}>
                      {getChatsCount('human')}
                    </Badge>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Chat List */}
          <div className="flex-1 overflow-y-auto">
            {error && (
              <div className="m-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
                {error}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearError}
                  className="ml-2"
                >
                  ×
                </Button>
              </div>
            )}

            {initialLoading ? (
              <div className="flex items-center justify-center py-8 opacity-60">
                <LoadingSpinner size="sm" />
              </div>
            ) : filteredChats.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <MessageCircle className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>{searchQuery ? 'No chats found' : 'No chats available'}</p>
              </div>
            ) : (
              <div className="space-y-1">
                {filteredChats.map((chat, index) => (
                  <ChatListItem
                    key={chat.id}
                    chat={chat}
                    isSelected={selectedChat?.id === chat.id}
                    onClick={() => selectChat(chat)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT MAIN AREA (70% width) */}
        <div className="w-[70%] flex flex-col bg-white dark:bg-gray-800">
          {selectedChat ? (
            <>
              {/* Chat Header */}
              <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <Avatar>
                      <AvatarFallback className={selectedChat.isGroup ? 'bg-blue-500 text-white' : 'bg-gray-300 text-gray-700'}>
                        {selectedChat.isGroup ? (
                          <span className="text-lg">👥</span>
                        ) : (
                          selectedChat.name.substring(0, 2).toUpperCase()
                        )}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{selectedChat.name}</h2>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {selectedChat.isGroup ? 'Group' : 'Personal chat'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <AIHumanToggleWithTooltip
                      isAIMode={localAIMode}
                      onToggle={handleToggleAIMode}
                      disabled={isUpdatingMode}
                    />
                    <Button variant="ghost" size="sm">
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>

              {/* Messages Container */}
              <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4 bg-gray-50 dark:bg-gray-900 relative">
                {error && (
                  <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
                    {error}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearError}
                      className="ml-2"
                    >
                      ×
                    </Button>
                  </div>
                )}

                {isLoading && messages.length === 0 ? (
                  <div className="flex items-center justify-center h-full opacity-60">
                    <LoadingSpinner size="md" />
                  </div>
                ) : selectedChat ? (
                  <div className="space-y-1">
                    {messages.map((message, index) => (
                      <MessageBubble
                        key={message.id}
                        message={message}
                        isOwn={message.fromMe}
                        style={{
                          animationDelay: `${index * 50}ms`
                        }}
                      />
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                ) : null}

                {/* Scroll to Bottom Button */}
                {showScrollIndicator && (
                  <div className="absolute bottom-4 right-4 z-10">
                    <Button
                      onClick={scrollToBottom}
                      size="sm"
                      className="bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105"
                    >
                      <ChevronDown className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </div>

              {/* Message Input */}
              <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                <form onSubmit={handleSendMessage} className="flex items-center space-x-2">
                  <Button type="button" variant="ghost" size="sm">
                    <Paperclip className="w-4 h-4" />
                  </Button>
                  <Button type="button" variant="ghost" size="sm">
                    <Smile className="w-4 h-4" />
                  </Button>
                  <Input
                    ref={messageInputRef}
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    placeholder={localAIMode ? "AI mode - Cannot send messages" : "Type a message..."}
                    className="flex-1 bg-gray-100 dark:bg-gray-700 border-0 transition-all duration-200 focus:ring-2 focus:ring-green-500/20"
                    disabled={isSendingMessage || localAIMode}
                  />
                  <Button
                    type="submit"
                    disabled={!messageInput.trim() || isSendingMessage || localAIMode}
                    className="bg-green-500 hover:bg-green-600 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 hover:scale-105 active:scale-95"
                  >
                    {isSendingMessage ? (
                      <LoadingSpinner size="sm" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </Button>
                </form>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center bg-gray-100 dark:bg-gray-900">
              <div className="text-center">
                <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
                  <MessageCircle className="w-8 h-8 text-white" />
                </div>
                <h2 className="text-2xl font-bold text-gray-700 dark:text-gray-300 mb-2">
                  Select a chat to start messaging
                </h2>
                <p className="text-gray-500 dark:text-gray-400">
                  Choose a conversation from the list to view messages
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </AuthGuard>
  );
}