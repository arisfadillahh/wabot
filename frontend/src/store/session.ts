import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Session } from '@/types/api';
import { api } from '@/lib/api';
import Cookies from 'js-cookie';

interface SessionState {
  session: Session | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (apiKey: string) => Promise<void>;
  logout: () => Promise<void>;
  validateSession: () => Promise<void>;
  clearError: () => void;
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set, get) => ({
      session: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      login: async (apiKey: string) => {
        set({ isLoading: true, error: null });

        try {
          const response = await api.login(apiKey) as any;

          if (response.success) {
            const sessionToken = response.sessionToken;
            if (typeof window !== 'undefined') {
              // Store session in secure cookie (already set by backend, but also store for Zustand)
              Cookies.set('_session', sessionToken, {
                expires: 1, // 1 day
                secure: window.location.protocol === 'https:',
                sameSite: 'strict'
              });
            }

            set({
              session: {
                sessionToken,
                expiresAt: response.expiresAt,
                createdAt: new Date().toISOString(),
                userAgent: typeof window !== 'undefined' ? navigator.userAgent : '',
                ipAddress: '', // Will be set by server
                apiKey,
              },
              isAuthenticated: true,
              isLoading: false,
            });

            // Store API key in cookie for fallback authentication
            if (typeof window !== 'undefined') {
              Cookies.set('apiKey', apiKey, {
                expires: 1, // 1 day
                secure: window.location.protocol === 'https:',
                sameSite: 'strict'
              });
            }
          } else {
            throw new Error(response.message || 'Login failed');
          }
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Login failed',
            isLoading: false,
          });
          throw error;
        }
      },

      logout: async () => {
        try {
          await api.logout();
        } catch (error) {
          // Ignore logout errors
        } finally {
          if (typeof window !== 'undefined') {
            // Clear session from cookie and localStorage
            Cookies.remove('_session');
            localStorage.removeItem('sessionToken');
          }
          set({
            session: null,
            isAuthenticated: false,
            isLoading: false,
            error: null,
          });
        }
      },

      validateSession: async () => {
        const { session } = get();

        if (!session) {
          set({ isAuthenticated: false });
          return;
        }

        set({ isLoading: true, error: null });

        try {
          await api.validateSession(session.sessionToken);
          set({ isAuthenticated: true, isLoading: false });
        } catch (error) {
          if (typeof window !== 'undefined') {
            // Clear session from cookie and localStorage
            Cookies.remove('_session');
            localStorage.removeItem('sessionToken');
          }
          set({
            session: null,
            isAuthenticated: false,
            isLoading: false,
            error: error instanceof Error ? error.message : 'Session expired',
          });
        }
      },

      refreshSession: async () => {
        const { session } = get();

        if (!session) {
          set({ isAuthenticated: false });
          return;
        }

        set({ isLoading: true, error: null });

        try {
          const response = await api.refreshSession() as any;
          if (response.success) {
            set({
              session: {
                ...session,
                expiresAt: response.session.expiresAt,
              },
              isAuthenticated: true,
              isLoading: false,
            });
          }
        } catch (error) {
          if (typeof window !== 'undefined') {
            // Clear session from cookie and localStorage
            Cookies.remove('_session');
            localStorage.removeItem('sessionToken');
          }
          set({
            session: null,
            isAuthenticated: false,
            isLoading: false,
            error: error instanceof Error ? error.message : 'Session refresh failed',
          });
        }
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: 'session-storage',
      partialize: (state) => ({
        session: state.session,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);