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
  CheckCheck
} from 'lucide-react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { useWhatsAppStore } from '@/store/whatsapp';
import { formatRelativeTime } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { Message } from '@/types/api';
import { toast } from 'react-hot-toast';
import { useWebSocket } from '@/lib/websocket';

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
    // Debug: Log the entire message structure
    console.log('Message structure:', message);
    console.log('Message content:', message.content);

    // Get raw content first
    let rawContent = '';

    // Check for direct body first (most common for text messages)
    if (message.content?.body) {
      rawContent = message.content.body;
    }
    // Handle wwebjs message structure - try all possible fields
    else if (message.content && typeof message.content === 'object') {
      const content = message.content as any;

      // Try all possible wwebjs content fields
      if (content.body) rawContent = content.body;
      else if (content.text) rawContent = content.text;
      else if (content.caption) rawContent = content.caption;
      else if (content.description) rawContent = content.description;
      else if (content.content) rawContent = content.content; // Sometimes nested
      else if (content._serializedData) rawContent = content._serializedData;
      else if (content.id?.id) rawContent = content.id.id; // Sometimes message ID contains context
      else if (content.filename) rawContent = content.filename;
      else if (content.title) rawContent = content.title;
    }
    // Check if the message object itself has the content in different fields
    else if (message.body) rawContent = message.body;
    else if (message.text) rawContent = message.text;
    else if (message.caption) rawContent = message.caption;
    // If it's a revoked message, try to get the original content
    else if (message.type === 'revoked' || message.content?.type === 'revoked') {
      const content = message.content as any;
      if (content && content.originalBody) rawContent = content.originalBody;
      else if (content && content.originalText) rawContent = content.originalText;
      else rawContent = "Pesan ini telah dihapus";
    }
    // Check if content is already a string
    else if (typeof message.content === 'string') {
      if (message.content === '[REVOKED]' || message.content.includes('REVOKED')) {
        rawContent = "Pesan ini telah dihapus";
      } else {
        rawContent = message.content;
      }
    }
    // Last resort fallback
    else if (message.content) {
      rawContent = String(message.content);
    }
    // If no content at all, show based on message type
    else if (message.type === 'chat') rawContent = "💬 Pesan teks";
    else if (message.type === 'image') rawContent = "🖼️ Gambar";
    else if (message.type === 'video') rawContent = "🎥 Video";
    else if (message.type === 'audio') rawContent = "🎵 Audio";
    else if (message.type === 'document') rawContent = "📄 Dokumen";
    else if (message.type === 'sticker') rawContent = "🏷️ Sticker";
    else rawContent = `[${message.type?.toUpperCase() || 'MESSAGE'}]`;

    // Apply WhatsApp-style formatting
    return formatWhatsAppMessage(rawContent);
  };

  const formatWhatsAppMessage = (text: string) => {
    if (!text) return '';

    // First, handle line breaks by splitting into lines
    const lines = text.split('\n');

    return lines.map((line, lineIndex) => (
      <div key={`line-${lineIndex}`}>
        {formatWhatsAppLine(line)}
        {lineIndex < lines.length - 1 && <br />}
      </div>
    ));
  };

  const formatWhatsAppLine = (text: string) => {
    if (!text) return '';

    // Create a React fragment with formatted spans
    const parts: React.ReactNode[] = [];
    let currentIndex = 0;

    // WhatsApp formatting patterns
    const patterns = [
      { regex: /\*(.*?)\*/g, type: 'bold' }, // *bold*
      { regex: /_(.*?)_/g, type: 'italic' }, // _italic_
      { regex: /~(.*?)~/g, type: 'strikethrough' }, // ~strikethrough~
      { regex: /```(.*?)```/gs, type: 'code' }, // ```code```
      { regex: /`(.*?)`/g, type: 'inlineCode' }, // `inline code`
    ];

    const matches: Array<{start: number, end: number, type: string, content: string}> = [];

    // Find all formatting matches
    patterns.forEach(pattern => {
      let match;
      const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
      while ((match = regex.exec(text)) !== null) {
        matches.push({
          start: match.index,
          end: match.index + match[0].length,
          type: pattern.type,
          content: match[1]
        });
      }
    });

    // Sort matches by start position
    matches.sort((a, b) => a.start - b.start);

    // Build formatted content
    matches.forEach((match, index) => {
      // Add text before this match
      if (match.start > currentIndex) {
        parts.push(text.substring(currentIndex, match.start));
      }

      // Add formatted content
      switch (match.type) {
        case 'bold':
          parts.push(<strong key={`bold-${index}`}>{match.content}</strong>);
          break;
        case 'italic':
          parts.push(<em key={`italic-${index}`}>{match.content}</em>);
          break;
        case 'strikethrough':
          parts.push(<s key={`strike-${index}`}>{match.content}</s>);
          break;
        case 'code':
          parts.push(
            <div key={`code-${index}`} className="bg-gray-800 text-white p-2 rounded my-1 font-mono text-sm">
              {match.content}
            </div>
          );
          break;
        case 'inlineCode':
          parts.push(
            <code key={`inline-${index}`} className="bg-gray-200 text-gray-800 px-1 py-0.5 rounded font-mono text-sm">
              {match.content}
            </code>
          );
          break;
      }

      currentIndex = match.end;
    });

    // Add remaining text
    if (currentIndex < text.length) {
      parts.push(text.substring(currentIndex));
    }

    // If no formatting found, return text as is
    if (parts.length === 0) {
      return text;
    }

    return parts;
  };

  return (
    <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} mb-4`}>
      <div className={`inline-block max-w-md ${isOwn ? 'order-2' : 'order-1'}`}>
        <div
          className={`p-3 rounded-lg ${
            isOwn
              ? 'bg-[#128C7E] text-white' // WhatsApp dark green for sent messages
              : 'bg-gray-200 text-gray-900 border border-gray-300' // Darker gray for received messages
          }`}
        >
          <div className="text-sm whitespace-pre-wrap break-words overflow-hidden">
            {getMessageContent()}
          </div>
        </div>
        <div className={`flex items-center mt-1 space-x-1 ${isOwn ? 'justify-end' : 'justify-start'}`}>
          <span className="text-xs text-gray-500">
            {formatRelativeTime(message.timestamp)}
          </span>
          {getStatusIcon()}
        </div>
      </div>
    </div>
  );
}

function ChatListItem({ chat, isSelected, onClick }: ChatListItemProps) {
  const getUnreadCount = () => {
    // Only show badge if there are unread messages (count > 0)
    if (chat.unreadCount > 0) {
      return (
        <Badge variant="destructive" className="ml-auto bg-green-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center p-0">
          {chat.unreadCount}
        </Badge>
      );
    }
    // Return null for 0 unread messages - no circle, no number
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
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div
        className={`flex items-center space-x-3 p-3 cursor-pointer transition-colors hover:bg-gray-100 dark:hover:bg-gray-700 ${
          isSelected ? 'bg-green-100 dark:bg-green-900/20' : ''
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
              {/* AI/Human Mode Indicator */}
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
    </motion.div>
  );
}

export default function ChatsPage() {
  // Simplified approach - use polling instead of WebSocket for now
  const [isConnected, setIsConnected] = useState(false);
  const [connectionState, setConnectionState] = useState('disconnected');

  // Debug WebSocket connection
  console.log('App running - connection status:', isConnected, connectionState);

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

  // Debug store state
  console.log('Store state - chats:', chats.length, 'isLoading:', isLoading, 'error:', error);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'ai' | 'human'>('ai');
  const [messageInput, setMessageInput] = useState('');
  const [initialLoading, setInitialLoading] = useState(true);
  const [localAIMode, setLocalAIMode] = useState(true);
  const [isUpdatingMode, setIsUpdatingMode] = useState(false);
  const [isFirstChatLoad, setIsFirstChatLoad] = useState(true);
  const [messageSearchQuery, setMessageSearchQuery] = useState('');
  const [isSearchingMessages, setIsSearchingMessages] = useState(false);
  const [searchResults, setSearchResults] = useState<Message[]>([]);
  const [showMessageSearch, setShowMessageSearch] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    console.log('Chats page mounted, fetching chats...');

    // Auto-login if no session but API key exists
    const sessionToken = Cookies.get('_session');
    const apiKey = Cookies.get('apiKey');

    if (!sessionToken && apiKey) {
      console.log('No session found, auto-login with API key...');
      api.login(apiKey).then(() => {
        fetchChats();
      }).catch(error => {
        console.error('Auto-login failed:', error);
        fetchChats(); // Try anyway
      });
    } else {
      fetchChats();
    }
  }, [fetchChats]);

  // Sync AI mode when chat changes
  useEffect(() => {
    if (selectedChat) {
      setLocalAIMode(selectedChat.aiMode ?? true);
    }
  }, [selectedChat]);

  // Fetch messages when chat is selected
  useEffect(() => {
    if (selectedChat) {
      console.log('Selected chat changed, fetching messages for:', selectedChat.id);
      if (isFirstChatLoad) {
        setIsFirstChatLoad(false);
      }
      fetchMessages(selectedChat.id);
    }
  }, [selectedChat, fetchMessages, isFirstChatLoad]);

  // Mark messages as read when chat is selected and has unread messages (with debouncing)
  useEffect(() => {
    if (selectedChat && selectedChat.unreadCount > 0) {
      console.log('🎯 Triggering mark as read for chat:', selectedChat.id, 'Unread count:', selectedChat.unreadCount);
      markMessagesAsRead(selectedChat.id);
    } else if (selectedChat) {
      // Only log this occasionally to reduce spam
      if (Math.random() < 0.3) { // 30% chance to log
        console.log('ℹ️ Chat selected but no unread messages:', selectedChat.id, 'Unread count:', selectedChat.unreadCount);
      }
    }
  }, [selectedChat, markMessagesAsRead]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Optimized polling for new messages every 2 seconds (reduced frequency)
  useEffect(() => {
    console.log('⚙️ Setting up message polling (2s)...');
    let lastMessageCount = messages.length;
    let lastTimestamp = Date.now();

    const pollInterval = setInterval(() => {
      if (selectedChat) {
        const now = Date.now();
        // Only poll if it's been more than 1.5s since last poll (rate limiting)
        if (now - lastTimestamp > 1500) {
          // Only log occasionally to reduce spam
          if (Math.random() < 0.1) { // 10% chance to log
            console.log('🔄 Polling for new messages...');
          }
          fetchMessages(selectedChat.id);
          lastTimestamp = now;
        }
      }
    }, 2000); // Check every 2 seconds but only poll if 1.5s passed

    return () => clearInterval(pollInterval);
  }, [selectedChat, fetchMessages, messages.length]);

  // Reduced polling for chat list updates every 5 seconds
  useEffect(() => {
    console.log('⚙️ Setting up chat list polling (5s)...');
    const chatPollInterval = setInterval(() => {
      // Only log occasionally to reduce spam
      if (Math.random() < 0.2) { // 20% chance to log
        console.log('🔄 Polling for chat list updates...');
      }
      fetchChats();
    }, 5000); // Back to 5 seconds to reduce spam

    return () => clearInterval(chatPollInterval);
  }, [fetchChats]);

  // Set initialLoading to false when chats are loaded or when there's an error
  useEffect(() => {
    if ((chats.length > 0 && !isLoading && initialLoading) || (error && initialLoading)) {
      setInitialLoading(false);
    }
  }, [chats, isLoading, error, initialLoading]);

  const filteredChats = chats.filter(chat => {
    const matchesSearch = chat.name.toLowerCase().includes(searchQuery.toLowerCase());
    console.log('Filtering chat:', chat.name, 'aiMode:', chat.aiMode, 'activeTab:', activeTab);

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
      // Keep focus on message input after sending
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

      // Auto-switch to human tab when toggling to human mode
      if (!isAI && activeTab !== 'human') {
        setActiveTab('human');
      }

      // Show toast notification
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
      // Revert the toggle on error
      setLocalAIMode(!isAI);
    } finally {
      setIsUpdatingMode(false);
    }
  };

  const getChatInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .substring(0, 2)
      .toUpperCase();
  };

  // Search messages within current chat (local search only)
  const searchMessagesInChat = (query: string) => {
    if (!query.trim() || !selectedChat) {
      setSearchResults([]);
      setIsSearchingMessages(false);
      return;
    }

    setIsSearchingMessages(true);
    console.log('Searching for messages in chat:', selectedChat.id, 'query:', query);

    // Local search through loaded messages
    const searchQuery = query.toLowerCase();
    const localResults = messages.filter(message => {
      const content = getMessageContentString(message);
      return content.toLowerCase().includes(searchQuery);
    });

    console.log('Local search results:', localResults);
    console.log('Total messages searched:', messages.length);
    console.log('Sample message content:', messages[0]?.content);

    setSearchResults(localResults);
    setIsSearchingMessages(false);
  };

  // Helper function to get message content as string for searching
  const getMessageContentString = (message: Message): string => {
    console.log('Getting message content for:', message);

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

  // Handle message search input
  const handleMessageSearch = (query: string) => {
    setMessageSearchQuery(query);
  };

  // Debounced search effect
  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      if (messageSearchQuery.trim() && selectedChat) {
        searchMessagesInChat(messageSearchQuery);
      } else if (!messageSearchQuery.trim()) {
        setSearchResults([]);
        setIsSearchingMessages(false);
      }
    }, 300);

    return () => clearTimeout(debounceTimer);
  }, [messageSearchQuery, selectedChat, messages]); // Added messages dependency

  // Toggle message search interface
  const toggleMessageSearch = () => {
    setShowMessageSearch(!showMessageSearch);
    if (!showMessageSearch) {
      // Clear search when opening
      setMessageSearchQuery('');
      setSearchResults([]);
      setIsSearchingMessages(false);
    }
  };

  console.log('Rendering ChatsPage with', chats.length, 'chats', 'selectedChat:', selectedChat?.name, 'messages:', messages.length);
  return (
    <AuthGuard>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="h-screen flex bg-gray-50 dark:bg-gray-900"
      >
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
          <div className="px-4 py-3 bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 border-b border-gray-200 dark:border-gray-700">
            <div className="flex justify-center space-x-4">
              {/* Bot AI Pill */}
              <motion.div
                className="relative cursor-pointer"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setActiveTab('ai')}
              >
                {/* Active Background */}
                {activeTab === 'ai' && (
                  <motion.div
                    className="absolute inset-0 bg-gradient-to-r from-green-400 to-green-500 rounded-full shadow-lg"
                    layoutId="activePill"
                    initial={false}
                    transition={{
                      type: "spring",
                      stiffness: 300,
                      damping: 30
                    }}
                  />
                )}

                {/* Pill Content */}
                <div className={`relative z-10 flex items-center space-x-2 px-6 py-2 rounded-full min-w-fit ${
                  activeTab === 'ai' ? 'text-white' : 'text-gray-600 hover:text-gray-800'
                } transition-colors duration-300`}>
                  <motion.div
                    animate={{
                      rotate: activeTab === 'ai' ? 360 : 0,
                      scale: activeTab === 'ai' ? 1.2 : 1
                    }}
                    transition={{ duration: 0.6, type: "spring" }}
                  >
                    <Bot className="w-4 h-4 flex-shrink-0" />
                  </motion.div>
                  <motion.span
                    animate={{ fontWeight: activeTab === 'ai' ? 600 : 400 }}
                    className="font-medium whitespace-nowrap"
                  >
                    Bot AI
                  </motion.span>
                  {getChatsCount('ai') > 0 && (
                    <motion.div
                      animate={{ scale: activeTab === 'ai' ? 1.1 : 1 }}
                      className="flex-shrink-0"
                    >
                      <Badge className={`text-xs font-semibold min-w-[24px] h-5 flex items-center justify-center px-1.5 ${
                        activeTab === 'ai'
                          ? 'bg-white/30 text-white backdrop-blur-sm'
                          : 'bg-gray-200 text-gray-600'
                      }`}>
                        {getChatsCount('ai')}
                      </Badge>
                    </motion.div>
                  )}
                </div>
              </motion.div>

              {/* Human Agent Pill */}
              <motion.div
                className="relative cursor-pointer"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setActiveTab('human')}
              >
                {/* Active Background */}
                {activeTab === 'human' && (
                  <motion.div
                    className="absolute inset-0 bg-gradient-to-r from-blue-400 to-blue-500 rounded-full shadow-lg"
                    layoutId="activePill"
                    initial={false}
                    transition={{
                      type: "spring",
                      stiffness: 300,
                      damping: 30
                    }}
                  />
                )}

                {/* Pill Content */}
                <div className={`relative z-10 flex items-center space-x-2 px-6 py-2 rounded-full min-w-fit ${
                  activeTab === 'human' ? 'text-white' : 'text-gray-600 hover:text-gray-800'
                } transition-colors duration-300`}>
                  <motion.div
                    animate={{
                      rotate: activeTab === 'human' ? 360 : 0,
                      scale: activeTab === 'human' ? 1.2 : 1
                    }}
                    transition={{ duration: 0.6, type: "spring" }}
                  >
                    <User className="w-4 h-4 flex-shrink-0" />
                  </motion.div>
                  <motion.span
                    animate={{ fontWeight: activeTab === 'human' ? 600 : 400 }}
                    className="font-medium whitespace-nowrap"
                  >
                    Human Agent
                  </motion.span>
                  {getChatsCount('human') > 0 && (
                    <motion.div
                      animate={{ scale: activeTab === 'human' ? 1.1 : 1 }}
                      className="flex-shrink-0"
                    >
                      <Badge className={`text-xs font-semibold min-w-[24px] h-5 flex items-center justify-center px-1.5 ${
                        activeTab === 'human'
                          ? 'bg-white/30 text-white backdrop-blur-sm'
                          : 'bg-gray-200 text-gray-600'
                      }`}>
                        {getChatsCount('human')}
                      </Badge>
                    </motion.div>
                  )}
                </div>
              </motion.div>
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
              <div className="flex items-center justify-center py-8">
                <LoadingSpinner size="lg" />
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
                          getChatInitials(selectedChat.name)
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
                    {/* AI/Human Toggle */}
                    <AIHumanToggleWithTooltip
                      isAIMode={localAIMode}
                      onToggle={handleToggleAIMode}
                      disabled={isUpdatingMode}
                    />

                    <Button variant="ghost" size="sm" onClick={toggleMessageSearch}>
                      <Search className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="sm">
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>

              {/* Message Search Interface */}
              {showMessageSearch && (
                <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                  <div className="flex items-center space-x-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                      <Input
                        value={messageSearchQuery}
                        onChange={(e) => handleMessageSearch(e.target.value)}
                        placeholder="Search messages in this chat..."
                        className="pl-10 bg-gray-100 dark:bg-gray-700 border-0"
                        autoFocus
                      />
                    </div>
                    <Button variant="ghost" size="sm" onClick={toggleMessageSearch}>
                      ×
                    </Button>
                  </div>

                  {/* Search Results Info */}
                  {messageSearchQuery && (
                    <div className="mt-2 text-sm text-gray-500">
                      {isSearchingMessages ? (
                        <span>Searching...</span>
                      ) : searchResults.length > 0 ? (
                        <span>Found {searchResults.length} message{searchResults.length !== 1 ? 's' : ''}</span>
                      ) : (
                        <span>No messages found</span>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Messages Container */}
              <div className="flex-1 overflow-y-auto p-4 bg-gray-50 dark:bg-gray-900">
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

                {isLoading && messages.length === 0 && isFirstChatLoad ? (
                  <div className="flex items-center justify-center h-full">
                    <LoadingSpinner size="lg" />
                  </div>
                ) : (
                  <div className="space-y-1">
                    {(showMessageSearch && messageSearchQuery) ? (
                      isSearchingMessages ? (
                        <div className="flex items-center justify-center h-full py-8">
                          <LoadingSpinner size="md" />
                          <p className="text-gray-500 text-sm ml-2">Searching...</p>
                        </div>
                      ) : searchResults.length > 0 ? (
                        searchResults.map((message) => (
                          <MessageBubble
                            key={message.id}
                            message={message}
                            isOwn={message.fromMe}
                          />
                        ))
                      ) : (
                        <div className="flex items-center justify-center h-full py-8">
                          <p className="text-gray-500 text-sm">
                            {messageSearchQuery ? 'No messages found matching your search.' : 'Type to search messages in this chat.'}
                          </p>
                        </div>
                      )
                    ) : (
                      messages.map((message) => (
                        <MessageBubble
                          key={message.id}
                          message={message}
                          isOwn={message.fromMe}
                        />
                      ))
                    )}
                    <div ref={messagesEndRef} />
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
                    className="flex-1 bg-gray-100 dark:bg-gray-700 border-0"
                    disabled={isSendingMessage || localAIMode}
                  />
                  <Button
                    type="submit"
                    disabled={!messageInput.trim() || isSendingMessage || localAIMode}
                    className="bg-green-500 hover:bg-green-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
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
            /* Welcome screen when no chat selected */
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
      </motion.div>
    </AuthGuard>
  );
}