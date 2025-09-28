import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Session } from '@/types/api';
import { api } from '@/lib/api';

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
            localStorage.setItem('sessionToken', sessionToken);

            set({
              session: {
                sessionToken,
                expiresAt: response.expiresAt,
                createdAt: response.createdAt,
                userAgent: navigator.userAgent,
                ipAddress: '', // Will be set by server
                apiKey,
              },
              isAuthenticated: true,
              isLoading: false,
            });
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
          localStorage.removeItem('sessionToken');
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
          localStorage.removeItem('sessionToken');
          set({
            session: null,
            isAuthenticated: false,
            isLoading: false,
            error: error instanceof Error ? error.message : 'Session expired',
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