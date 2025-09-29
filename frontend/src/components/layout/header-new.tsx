'use client';

import { Button } from '@/components/ui/button';
import { useWhatsAppStore } from '@/store/whatsapp';
import { useTheme } from 'next-themes';
import {
  Wifi,
  WifiOff,
  Moon,
  Sun,
  Menu,
  MessageSquare,
} from 'lucide-react';

interface HeaderProps {
  onMobileMenuToggle?: () => void;
}

export function Header({ onMobileMenuToggle }: HeaderProps) {
  const { theme, setTheme } = useTheme();
  const { status } = useWhatsAppStore();

  return (
    <header className="sticky top-0 z-30 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-16 items-center px-6">
        {/* Mobile Menu Toggle */}
        <div className="lg:hidden mr-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={onMobileMenuToggle}
          >
            <Menu className="w-5 h-5" />
          </Button>
        </div>

        {/* Left Side - Logo & Title */}
        <div className="flex items-center space-x-4 flex-1">
          <div className="w-10 h-10 bg-green-500 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm">
            <MessageSquare className="w-6 h-6 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">WhatsApp Dashboard</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Bot Management</p>
          </div>
        </div>

        {/* Right Side - Status & Actions */}
        <div className="flex items-center space-x-4">
          {/* WhatsApp Status */}
          <div className="hidden sm:flex items-center">
            {status?.isReady ? (
              <div className="flex items-center space-x-2 px-3 py-1.5 bg-green-50 dark:bg-green-900/20 rounded-full">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span className="text-sm font-medium text-green-700 dark:text-green-300">
                  Connected
                </span>
              </div>
            ) : (
              <div className="flex items-center space-x-2 px-3 py-1.5 bg-gray-50 dark:bg-gray-800 rounded-full">
                <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Offline
                </span>
              </div>
            )}
          </div>

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
        </div>
      </div>
    </header>
  );
}