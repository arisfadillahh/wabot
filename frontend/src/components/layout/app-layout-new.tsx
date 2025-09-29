'use client';

import { useState } from 'react';
import { Header } from './header-new';
import { Sidebar } from './sidebar-new';
import { AuthGuard } from '@/components/auth/auth-guard';

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  const handleMobileMenuToggle = () => {
    setIsMobileSidebarOpen(!isMobileSidebarOpen);
  };

  return (
    <AuthGuard requireAuth={true}>
      <div className="min-h-screen bg-background">
        {/* Header */}
        <Header onMobileMenuToggle={handleMobileMenuToggle} />

        <div className="flex">
          {/* Desktop Sidebar */}
          <div className="hidden lg:block w-64 flex-shrink-0">
            <Sidebar />
          </div>

          {/* Mobile Sidebar Overlay */}
          {isMobileSidebarOpen && (
            <>
              {/* Backdrop */}
              <div
                className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
                onClick={() => setIsMobileSidebarOpen(false)}
              />
              {/* Mobile Sidebar */}
              <div className="fixed inset-y-0 left-0 z-50 w-64 lg:hidden">
                <Sidebar />
              </div>
            </>
          )}

          {/* Main Content */}
          <main className="flex-1 p-6 lg:p-8">
            {children}
          </main>
        </div>
      </div>
    </AuthGuard>
  );
}