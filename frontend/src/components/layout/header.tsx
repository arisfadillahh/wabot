'use client';

import { useState, useEffect } from 'react';
import { MobileSidebarTrigger } from './sidebar';
import { MobileNavigation } from './mobile-navigation';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useSessionStore } from '@/store/session';
import { useWhatsAppStore } from '@/store/whatsapp';
import { websocketService } from '@/lib/websocket';
import {
  Bell,
  Settings,
  LogOut,
  Moon,
  Sun,
  Smartphone,
  Wifi,
  WifiOff,
  Menu,
  Search,
  X
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { motion } from 'framer-motion';

export function Header() {
  const { theme, setTheme } = useTheme();
  const { session, logout } = useSessionStore();
  const { status, fetchStatus, chats } = useWhatsAppStore();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    fetchStatus();

    // Connect WebSocket for real-time updates
    if (!websocketService.isConnected()) {
      websocketService.connect();
    }

    // Set up WebSocket event listeners for notifications
    const unsubscribeMessage = websocketService.on('message:new', (data) => {
      setNotifications(prev => [
        ...prev,
        {
          id: Date.now(),
          type: 'message',
          title: 'New Message',
          description: `New message from ${data.from || 'Unknown'}`,
          timestamp: new Date(),
          read: false,
        }
      ]);
    });

    const unsubscribeSystem = websocketService.on('system:notification', (data) => {
      setNotifications(prev => [
        ...prev,
        {
          id: Date.now(),
          type: 'system',
          title: data.title || 'System Notification',
          description: data.message || 'System update',
          timestamp: new Date(),
          read: false,
        }
      ]);
    });

    return () => {
      unsubscribeMessage();
      unsubscribeSystem();
    };
  }, [fetchStatus]);

  const handleLogout = async () => {
    await logout();
  };

  const unreadNotifications = notifications.filter(n => !n.read).length;
  const unreadMessages = chats.reduce((sum, chat) => sum + chat.unreadCount, 0);

  return (
    <>
      <header className="sticky top-0 z-30 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center px-4">
          <div className="mr-4 hidden md:flex">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-whatsapp-600 rounded-lg flex items-center justify-center">
                <Smartphone className="w-5 h-5 text-white" />
              </div>
              <span className="font-semibold text-lg hidden sm:block">WhatsApp Dashboard</span>
            </div>
          </div>

          {/* Mobile Menu Toggle */}
          <div className="lg:hidden mr-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
              {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </Button>
          </div>

          <MobileSidebarTrigger />

          <div className="flex flex-1 items-center justify-between space-x-2 md:justify-end">
            {/* WhatsApp Status - Hidden on mobile */}
            <div className="hidden sm:flex items-center space-x-2">
              {status?.isReady ? (
                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                  <Wifi className="w-3 h-3 mr-1" />
                  Connected
                </Badge>
              ) : (
                <Badge variant="outline">
                  <WifiOff className="w-3 h-3 mr-1" />
                  Offline
                </Badge>
              )}
            </div>

            <nav className="flex items-center space-x-1 sm:space-x-2">
              {/* Search - Hidden on mobile */}
              <Button variant="ghost" size="icon" className="hidden sm:flex">
                <Search className="h-4 w-4" />
              </Button>

              {/* Theme Toggle */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
              >
                <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
                <span className="sr-only">Toggle theme</span>
              </Button>

              {/* Notifications */}
              <div className="relative">
                <Button variant="ghost" size="icon">
                  <Bell className="h-4 w-4" />
                  {unreadNotifications > 0 && (
                    <motion.span
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 text-xs text-white flex items-center justify-center"
                    >
                      {unreadNotifications > 99 ? '99+' : unreadNotifications}
                    </motion.span>
                  )}
                </Button>
              </div>

              {/* User Menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src="/avatar.jpg" alt="User" />
                      <AvatarFallback>
                        {session?.apiKey?.substring(0, 2).toUpperCase() || 'U'}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="end" forceMount>
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none">Connected User</p>
                      <p className="text-xs leading-none text-muted-foreground">
                        {session?.apiKey ? `${session.apiKey.substring(0, 8)}...` : 'Not authenticated'}
                      </p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem>
                    <Settings className="mr-2 h-4 w-4" />
                    <span>Settings</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout}>
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Log out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </nav>
          </div>
        </div>

        {/* Mobile Menu Overlay */}
        {isMobileMenuOpen && (
          <div className="lg:hidden border-t border-gray-200 dark:border-gray-800 bg-background/95 backdrop-blur">
            <div className="container px-4 py-3">
              <div className="flex items-center space-x-2 mb-3">
                {status?.isReady ? (
                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                    <Wifi className="w-3 h-3 mr-1" />
                    Connected
                  </Badge>
                ) : (
                  <Badge variant="outline">
                    <WifiOff className="w-3 h-3 mr-1" />
                    Offline
                  </Badge>
                )}
              </div>
              <div className="grid grid-cols-4 gap-2">
                <Button variant="ghost" size="sm" className="flex-col h-auto py-3">
                  <Search className="w-4 h-4 mb-1" />
                  <span className="text-xs">Search</span>
                </Button>
                <Button variant="ghost" size="sm" className="flex-col h-auto py-3">
                  <Bell className="w-4 h-4 mb-1" />
                  <span className="text-xs">Alerts</span>
                  {unreadNotifications > 0 && (
                    <Badge variant="destructive" className="absolute -top-1 -right-1 w-4 h-4 p-0 text-xs">
                      {unreadNotifications > 99 ? '99+' : unreadNotifications}
                    </Badge>
                  )}
                </Button>
                <Button variant="ghost" size="sm" className="flex-col h-auto py-3">
                  <Settings className="w-4 h-4 mb-1" />
                  <span className="text-xs">Settings</span>
                </Button>
                <Button variant="ghost" size="sm" className="flex-col h-auto py-3" onClick={handleLogout}>
                  <LogOut className="w-4 h-4 mb-1" />
                  <span className="text-xs">Logout</span>
                </Button>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* Mobile Navigation */}
      <MobileNavigation unreadCount={unreadMessages} />
    </>
  );
}