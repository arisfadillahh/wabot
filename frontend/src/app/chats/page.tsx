'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import {
  MessageCircle,
  Users,
  Search,
  Plus,
  MoreVertical,
  Clock,
  Pin,
  Archive
} from 'lucide-react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { useWhatsAppStore } from '@/store/whatsapp';
import { formatRelativeTime } from '@/lib/utils';

interface ChatListItemProps {
  chat: any;
  isSelected?: boolean;
  onClick: () => void;
}

function ChatListItem({ chat, isSelected, onClick }: ChatListItemProps) {
  const getUnreadCount = () => {
    return chat.unreadCount > 0 ? (
      <Badge variant="destructive" className="ml-auto">
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

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div
        className={`flex items-center space-x-3 p-3 rounded-lg cursor-pointer transition-colors hover:bg-gray-100 dark:hover:bg-gray-800 ${
          isSelected ? 'bg-whatsapp-50 dark:bg-whatsapp-900/20' : ''
        }`}
        onClick={onClick}
      >
        <Avatar>
          <AvatarFallback className={chat.isGroup ? 'bg-blue-100 text-blue-600' : 'bg-whatsapp-100 text-whatsapp-600'}>
            {chat.isGroup ? (
              <Users className="w-4 h-4" />
            ) : (
              getChatInitials(chat.name)
            )}
          </AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
              {chat.name}
            </p>
            <div className="flex items-center space-x-1">
              {chat.timestamp && (
                <span className="text-xs text-gray-400">
                  {formatRelativeTime(chat.timestamp)}
                </span>
              )}
              {getUnreadCount()}
            </div>
          </div>
          {chat.lastMessage && (
            <div className="flex items-center space-x-2 mt-1">
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
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
    isLoading,
    error,
    fetchChats,
    selectChat,
    clearError
  } = useWhatsAppStore();
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchChats();
  }, [fetchChats]);

  const filteredChats = chats.filter(chat =>
    chat.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-4xl mx-auto space-y-6"
    >
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center space-x-2">
                <MessageCircle className="w-5 h-5" />
                <span>Chats</span>
                <Badge variant="outline">{filteredChats.length}</Badge>
              </CardTitle>
              <p className="text-sm text-gray-600 mt-1">Your conversations</p>
            </div>
            <div className="flex items-center space-x-2">
              <Button variant="outline" size="sm">
                <Plus className="w-4 h-4 mr-2" />
                New Chat
              </Button>
              <Button variant="ghost" size="sm">
                <MoreVertical className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Search */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              placeholder="Search chats..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Quick Actions */}
          <div className="flex space-x-2 mb-4">
            <Button variant="outline" size="sm" className="flex items-center space-x-1">
              <Pin className="w-3 h-3" />
              <span>Pinned</span>
            </Button>
            <Button variant="outline" size="sm" className="flex items-center space-x-1">
              <Archive className="w-3 h-3" />
              <span>Archived</span>
            </Button>
            <Button variant="outline" size="sm" className="flex items-center space-x-1">
              <Users className="w-3 h-3" />
              <span>Groups</span>
            </Button>
          </div>

          {/* Chat List */}
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
            <div className="space-y-1 max-h-96 overflow-y-auto">
              {filteredChats.map((chat, index) => (
                <Link key={chat.id} href={`/chat/${chat.id}`}>
                  <ChatListItem
                    chat={chat}
                    isSelected={selectedChat?.id === chat.id}
                    onClick={() => selectChat(chat)}
                  />
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Chats</p>
                <p className="text-2xl font-bold">{chats.length}</p>
              </div>
              <MessageCircle className="w-8 h-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Unread Messages</p>
                <p className="text-2xl font-bold">
                  {chats.reduce((sum, chat) => sum + chat.unreadCount, 0)}
                </p>
              </div>
              <Badge variant="destructive" className="text-lg">
                {chats.reduce((sum, chat) => sum + chat.unreadCount, 0)}
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Groups</p>
                <p className="text-2xl font-bold">
                  {chats.filter(chat => chat.isGroup).length}
                </p>
              </div>
              <Users className="w-8 h-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
      </div>
    </motion.div>
  );
}