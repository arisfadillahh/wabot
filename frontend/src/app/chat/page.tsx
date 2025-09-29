'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { AuthGuard } from '@/components/auth/auth-guard';
import { AIHumanToggleWithTooltip } from '@/components/chat/ai-human-toggle';
import {
  Send,
  Paperclip,
  Smile,
  MoreVertical,
  Phone,
  Video,
  Search,
  ArrowLeft,
  Check,
  CheckCheck,
  Clock,
  Home,
  Plus
} from 'lucide-react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { useWhatsAppStore } from '@/store/whatsapp';
import { formatRelativeTime } from '@/lib/utils';
import { Message } from '@/types/api';
import { toast } from 'react-hot-toast';

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
          {message.type === 'text' ? (
            <p className="text-sm">
              {typeof message.content === 'string'
                ? message.content
                : message.content?.text || message.content?.caption || message.content?.body || String(message.content || '')}
            </p>
          ) : (
            <div className="flex flex-col">
              {(message.content && typeof message.content === 'string') && (
                <p className="text-sm mb-2">{message.content}</p>
              )}
              {message.content?.caption && (
                <p className="text-sm mb-2">{message.content.caption}</p>
              )}
              {message.content?.text && (
                <p className="text-sm mb-2">{message.content.text}</p>
              )}
              {message.content?.body && (
                <p className="text-sm mb-2">{message.content.body}</p>
              )}
              <div className="p-2 bg-gray-100 rounded">
                <span className="text-xs">📎 {message.type.toUpperCase()}</span>
              </div>
            </div>
          )}
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

export default function ChatPage() {
  const searchParams = useSearchParams();
  const chatId = searchParams.get('id');

  const {
    selectedChat,
    messages,
    isLoading,
    isSendingMessage,
    error,
    selectChat,
    sendMessage,
    fetchMessages,
    clearError,
    updateChatMode
  } = useWhatsAppStore();

  const [messageInput, setMessageInput] = useState('');
  const [localAIMode, setLocalAIMode] = useState(true);
  const [isUpdatingMode, setIsUpdatingMode] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chatId) {
      // Find and select the chat
      selectChat({
        id: chatId,
        name: '',
        isGroup: false,
        isReadOnly: false,
        unreadCount: 0,
        timestamp: ''
      });
    }
  }, [chatId, selectChat]);

  // Sync AI mode when chat changes
  useEffect(() => {
    if (selectedChat) {
      setLocalAIMode(selectedChat.aiMode ?? true);
    }
  }, [selectedChat]);

  useEffect(() => {
    if (selectedChat) {
      fetchMessages(selectedChat.id);
    }
  }, [selectedChat, fetchMessages]);

  useEffect(() => {
    // Scroll to bottom when messages change
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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

  if (isLoading && !selectedChat) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!selectedChat) {
    return (
      <AuthGuard>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <h2 className="text-xl font-semibold mb-2">Chat not found</h2>
            <p className="text-gray-600">The chat you&apos;re looking for doesn&apos;t exist.</p>
            <Link href="/chats">
              <Button className="mt-4">Back to Chats</Button>
            </Link>
          </div>
        </div>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="h-screen flex bg-gray-50 dark:bg-gray-900"
      >
        {/* LEFT SIDEBAR (30% width) - Chat List */}
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
                className="pl-10 bg-gray-100 dark:bg-gray-700 border-0"
              />
            </div>
          </div>

          {/* Chat List */}
          <div className="flex-1 overflow-y-auto">
            <div className="p-2">
              <div className="text-center py-8 text-gray-500">
                <p>Chat list will appear here</p>
                <p className="text-sm mt-2">Navigate to /chats to see all conversations</p>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT MAIN AREA (70% width) - Chat Interface */}
        <div className="w-[70%] flex flex-col bg-white dark:bg-gray-800">
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
        </div>
      </motion.div>
    </AuthGuard>
  );
}