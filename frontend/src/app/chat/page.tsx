'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
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
  Clock
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useWhatsAppStore } from '@/store/whatsapp';
import { formatRelativeTime } from '@/lib/utils';
import { Message } from '@/types/api';

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
              ? 'bg-whatsapp-600 text-white'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white'
          }`}
        >
          <p className="text-sm">{message.content}</p>
          {message.type !== 'text' && (
            <div className="mt-2 p-2 bg-black bg-opacity-20 rounded">
              <span className="text-xs">📎 {message.type.toUpperCase()}</span>
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
  const params = useParams();
  const chatId = params.id as string;
  const {
    selectedChat,
    messages,
    isLoading,
    isSendingMessage,
    error,
    selectChat,
    sendMessage,
    fetchMessages,
    clearError
  } = useWhatsAppStore();

  const [messageInput, setMessageInput] = useState('');
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
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">Chat not found</h2>
          <p className="text-gray-600">The chat you&apos;re looking for doesn&apos;t exist.</p>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-4xl mx-auto h-[calc(100vh-8rem)] flex flex-col"
    >
      {/* Chat Header */}
      <Card className="mb-4">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Avatar>
                <AvatarFallback className={selectedChat.isGroup ? 'bg-blue-100 text-blue-600' : 'bg-whatsapp-100 text-whatsapp-600'}>
                  {selectedChat.isGroup ? (
                    <span className="text-lg">👥</span>
                  ) : (
                    getChatInitials(selectedChat.name)
                  )}
                </AvatarFallback>
              </Avatar>
              <div>
                <CardTitle className="text-lg">{selectedChat.name}</CardTitle>
                <p className="text-sm text-gray-500">
                  {selectedChat.isGroup ? 'Group' : 'Personal chat'}
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
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
        </CardHeader>
      </Card>

      {/* Messages Container */}
      <Card className="flex-1 flex flex-col">
        <CardContent className="flex-1 p-4 overflow-y-auto">
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
        </CardContent>

        {/* Message Input */}
        <div className="p-4 border-t">
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
              className="flex-1"
              disabled={isSendingMessage}
            />
            <Button
              type="submit"
              disabled={!messageInput.trim() || isSendingMessage}
              className="bg-whatsapp-600 hover:bg-whatsapp-700"
            >
              {isSendingMessage ? (
                <LoadingSpinner size="sm" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </form>
        </div>
      </Card>
    </motion.div>
  );
}