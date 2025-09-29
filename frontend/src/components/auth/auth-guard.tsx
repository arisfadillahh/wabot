'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSessionStore } from '@/store/session';
import Cookies from 'js-cookie';

interface AuthGuardProps {
  children: React.ReactNode;
  requireAuth?: boolean;
}

export function AuthGuard({ children, requireAuth = true }: AuthGuardProps) {
  const { isAuthenticated, validateSession, refreshSession, session } = useSessionStore();
  const router = useRouter();
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isMounted) return;

    const checkSession = async () => {
      if (requireAuth && !isAuthenticated) {
        // Check if we have a session token and validate it
        const sessionToken = typeof window !== 'undefined' ? localStorage.getItem('sessionToken') : null;
        if (sessionToken) {
          await validateSession();
        } else {
          router.push('/login');
        }
      } else if (!requireAuth && isAuthenticated) {
        router.push('/dashboard');
      }
    };

    checkSession();
  }, [isAuthenticated, requireAuth, router, validateSession, isMounted]);

  // Session refresh mechanism
  useEffect(() => {
    if (!isMounted || !requireAuth || !isAuthenticated || !session) return;

    const refreshInterval = setInterval(async () => {
      try {
        // Refresh session every 15 minutes
        await refreshSession();
      } catch (error) {
        console.error('Session refresh failed:', error);
        // If refresh fails, redirect to login
        router.push('/login');
      }
    }, 15 * 60 * 1000); // 15 minutes

    return () => clearInterval(refreshInterval);
  }, [isMounted, requireAuth, isAuthenticated, session, refreshSession, router]);

  // Prevent hydration mismatch by not rendering anything until mounted
  if (!isMounted) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-whatsapp-600"></div>
      </div>
    );
  }

  if (requireAuth && !isAuthenticated) {
    // Show loading state while checking session
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-whatsapp-600"></div>
      </div>
    );
  }

  if (!requireAuth && isAuthenticated) {
    // Show loading state while redirecting
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-whatsapp-600"></div>
      </div>
    );
  }

  return <>{children}</>;
}