'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { useWhatsAppStore } from '@/store/whatsapp';
import { Search, MessageCircle, Users, Clock } from 'lucide-react';
import { motion } from 'framer-motion';
import { formatRelativeTime } from '@/lib/utils';

export function RecentChats() {
  const { chats, selectedChat, selectChat, isLoading } = useWhatsAppStore();
  const [searchQuery, setSearchQuery] = useState('');

  const filteredChats = chats.filter(chat =>
    chat.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getChatInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .substring(0, 2)
      .toUpperCase();
  };

  const getUnreadCount = (chat: any) => {
    return chat.unreadCount > 0 ? (
      <Badge variant="destructive" className="ml-auto">
        {chat.unreadCount}
      </Badge>
    ) : null;
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <MessageCircle className="w-5 h-5" />
            <span>Recent Chats</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <LoadingSpinner size="lg" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
    >
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <MessageCircle className="w-5 h-5" />
              <span>Recent Chats</span>
              <Badge variant="outline">{filteredChats.length}</Badge>
            </div>
            <Button size="sm" variant="outline">
              <Users className="w-4 h-4 mr-1" />
              View All
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              placeholder="Search chats..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Chat List */}
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {filteredChats.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <MessageCircle className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No chats found</p>
              </div>
            ) : (
              filteredChats.slice(0, 10).map((chat, index) => (
                <motion.div
                  key={chat.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <div
                    className={`flex items-center space-x-3 p-3 rounded-lg cursor-pointer transition-colors hover:bg-gray-100 dark:hover:bg-gray-800 ${
                      selectedChat?.id === chat.id ? 'bg-whatsapp-50 dark:bg-whatsapp-900/20' : ''
                    }`}
                    onClick={() => selectChat(chat)}
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
                        {getUnreadCount(chat)}
                      </div>
                      <div className="flex items-center space-x-2 mt-1">
                        {chat.lastMessage && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                            {chat.lastMessage.fromMe ? 'You: ' : ''}
                            {chat.lastMessage.content}
                          </p>
                        )}
                        {chat.timestamp && (
                          <div className="flex items-center space-x-1 text-xs text-gray-400">
                            <Clock className="w-3 h-3" />
                            <span>{formatRelativeTime(chat.timestamp)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))
            )}
          </div>

          {filteredChats.length > 10 && (
            <Button variant="outline" className="w-full" size="sm">
              View All Chats ({filteredChats.length})
            </Button>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}