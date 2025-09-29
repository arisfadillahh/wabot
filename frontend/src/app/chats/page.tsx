'use client';

import { useEffect, useState, useRef } from 'react';
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
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex ${isOwn ? 'justify-end' : 'justify-start'} mb-4`}
    >
      <div className={`max-w-xs lg:max-w-md ${isOwn ? 'order-2' : 'order-1'}`}>
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
    </motion.div>
  );
}

function ChatListItem({ chat, isSelected, onClick }: ChatListItemProps) {
  const getUnreadCount = () => {
    return chat.unreadCount > 0 ? (
      <Badge variant="destructive" className="ml-auto bg-green-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center p-0">
        {chat.unreadCount}
      </Badge>
    ) : null;
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
    clearError,
    updateChatMode
  } = useWhatsAppStore();

  // Debug store state
  console.log('Store state - chats:', chats.length, 'isLoading:', isLoading, 'error:', error);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'ai' | 'human'>('ai');
  const [messageInput, setMessageInput] = useState('');
  const [localAIMode, setLocalAIMode] = useState(true);
  const [isUpdatingMode, setIsUpdatingMode] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    console.log('Chats page mounted, fetching chats...');
    fetchChats();
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
      fetchMessages(selectedChat.id);
    }
  }, [selectedChat, fetchMessages]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const filteredChats = chats.filter(chat => {
    const matchesSearch = chat.name.toLowerCase().includes(searchQuery.toLowerCase());
    console.log('Filtering chat:', chat.name, 'aiMode:', chat.aiMode, 'activeTab:', activeTab);

    if (activeTab === 'ai') return matchesSearch && (chat.aiMode ?? true);
    if (activeTab === 'human') return matchesSearch && !(chat.aiMode ?? true);

    return matchesSearch;
  });

  const getChatsCount = (tab: 'ai' | 'human') => {
    if (tab === 'ai') return chats.filter(chat => chat.aiMode ?? true).length;
    if (tab === 'human') return chats.filter(chat => !(chat.aiMode ?? true)).length;
    return 0;
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageInput.trim() || !selectedChat || isSendingMessage) return;

    try {
      await sendMessage(selectedChat.id, messageInput.trim());
      setMessageInput('');
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

          {/* Category Tabs */}
          <div className="flex space-x-1 p-2 bg-gray-50 dark:bg-gray-900">
            <Button
              variant={activeTab === 'ai' ? 'default' : 'ghost'}
              size="sm"
              className="flex items-center space-x-2 flex-1 justify-center text-green-600 hover:text-green-700"
              onClick={() => setActiveTab('ai')}
            >
              <Bot className="w-4 h-4" />
              <span>Bot AI</span>
              <Badge variant="secondary" className="text-xs bg-white">
                {getChatsCount('ai')}
              </Badge>
            </Button>
            <Button
              variant={activeTab === 'human' ? 'default' : 'ghost'}
              size="sm"
              className="flex items-center space-x-2 flex-1 justify-center text-blue-600 hover:text-blue-700"
              onClick={() => setActiveTab('human')}
            >
              <User className="w-4 h-4" />
              <span>Human Mode</span>
              <Badge variant="secondary" className="text-xs bg-white">
                {getChatsCount('human')}
              </Badge>
            </Button>
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

            {isLoading ? (
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

                    <Button variant="ghost" size="sm">
                      <Phone className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="sm">
                      <Video className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="sm">
                      <Search className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="sm">
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>

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

                {isLoading && messages.length === 0 ? (
                  <div className="flex items-center justify-center h-full">
                    <LoadingSpinner size="lg" />
                  </div>
                ) : (
                  <div className="space-y-1">
                    {messages.map((message) => (
                      <MessageBubble
                        key={message.id}
                        message={message}
                        isOwn={message.fromMe}
                      />
                    ))}
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
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    placeholder="Type a message..."
                    className="flex-1 bg-gray-100 dark:bg-gray-700 border-0"
                    disabled={isSendingMessage}
                  />
                  <Button
                    type="submit"
                    disabled={!messageInput.trim() || isSendingMessage}
                    className="bg-green-500 hover:bg-green-600 text-white"
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