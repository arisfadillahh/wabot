import { renderHook, act } from '@testing-library/react'
import { useSessionStore } from '@/store/session'
import { api } from '@/lib/api'

// Mock the API module
jest.mock('@/lib/api')
const mockedApi = api as jest.Mocked<typeof api>

describe('Session Store', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear()
    jest.clearAllMocks()
  })

  describe('login', () => {
    it('should successfully login and set session', async () => {
      const mockResponse = {
        success: true,
        sessionToken: 'test-token',
        expiresAt: '2024-12-31T23:59:59Z',
        createdAt: '2024-01-01T00:00:00Z',
        whatsappReady: true,
      }

      mockedApi.login.mockResolvedValue(mockResponse)

      const { result } = renderHook(() => useSessionStore())

      expect(result.current.isAuthenticated).toBe(false)
      expect(result.current.isLoading).toBe(false)

      await act(async () => {
        await result.current.login('test-api-key')
      })

      expect(mockedApi.login).toHaveBeenCalledWith('test-api-key')
      expect(localStorage.setItem).toHaveBeenCalledWith('sessionToken', 'test-token')
      expect(result.current.isAuthenticated).toBe(true)
      expect(result.current.isLoading).toBe(false)
      expect(result.current.session).toEqual({
        sessionToken: 'test-token',
        expiresAt: '2024-12-31T23:59:59Z',
        createdAt: '2024-01-01T00:00:00Z',
        userAgent: expect.any(String),
        ipAddress: '',
        apiKey: 'test-api-key',
      })
    })

    it('should handle login failure', async () => {
      const error = new Error('Invalid API key')
      mockedApi.login.mockRejectedValue(error)

      const { result } = renderHook(() => useSessionStore())

      await act(async () => {
        await expect(result.current.login('invalid-key')).rejects.toThrow('Invalid API key')
      })

      expect(result.current.isAuthenticated).toBe(false)
      expect(result.current.isLoading).toBe(false)
      expect(result.current.error).toBe('Invalid API key')
    })
  })

  describe('logout', () => {
    it('should logout and clear session', async () => {
      // Set initial authenticated state
      localStorage.setItem('sessionToken', 'test-token')
      mockedApi.logout.mockResolvedValue({})

      const { result } = renderHook(() => useSessionStore())

      // Set initial state
      act(() => {
        result.current.session = {
          sessionToken: 'test-token',
          expiresAt: '2024-12-31T23:59:59Z',
          createdAt: '2024-01-01T00:00:00Z',
          userAgent: 'test-agent',
          ipAddress: '127.0.0.1',
          apiKey: 'test-key',
        }
        result.current.isAuthenticated = true
      })

      await act(async () => {
        await result.current.logout()
      })

      expect(mockedApi.logout).toHaveBeenCalled()
      expect(localStorage.removeItem).toHaveBeenCalledWith('sessionToken')
      expect(result.current.isAuthenticated).toBe(false)
      expect(result.current.session).toBe(null)
    })

    it('should handle logout API errors gracefully', async () => {
      mockedApi.logout.mockRejectedValue(new Error('Network error'))

      const { result } = renderHook(() => useSessionStore())

      // Set initial state
      act(() => {
        result.current.session = {
          sessionToken: 'test-token',
          expiresAt: '2024-12-31T23:59:59Z',
          createdAt: '2024-01-01T00:00:00Z',
          userAgent: 'test-agent',
          ipAddress: '127.0.0.1',
          apiKey: 'test-key',
        }
        result.current.isAuthenticated = true
      })

      await act(async () => {
        await result.current.logout()
      })

      // Should still clear local state even if API fails
      expect(result.current.isAuthenticated).toBe(false)
      expect(result.current.session).toBe(null)
    })
  })

  describe('validateSession', () => {
    it('should validate existing session token', async () => {
      localStorage.setItem('sessionToken', 'valid-token')
      mockedApi.validateSession.mockResolvedValue({})

      const { result } = renderHook(() => useSessionStore())

      // Set initial state
      act(() => {
        result.current.session = {
          sessionToken: 'valid-token',
          expiresAt: '2024-12-31T23:59:59Z',
          createdAt: '2024-01-01T00:00:00Z',
          userAgent: 'test-agent',
          ipAddress: '127.0.0.1',
          apiKey: 'test-key',
        }
      })

      await act(async () => {
        await result.current.validateSession()
      })

      expect(mockedApi.validateSession).toHaveBeenCalledWith('valid-token')
      expect(result.current.isAuthenticated).toBe(true)
    })

    it('should clear session on validation failure', async () => {
      localStorage.setItem('sessionToken', 'invalid-token')
      mockedApi.validateSession.mockRejectedValue(new Error('Invalid session'))

      const { result } = renderHook(() => useSessionStore())

      // Set initial state
      act(() => {
        result.current.session = {
          sessionToken: 'invalid-token',
          expiresAt: '2024-12-31T23:59:59Z',
          createdAt: '2024-01-01T00:00:00Z',
          userAgent: 'test-agent',
          ipAddress: '127.0.0.1',
          apiKey: 'test-key',
        }
      })

      await act(async () => {
        await result.current.validateSession()
      })

      expect(localStorage.removeItem).toHaveBeenCalledWith('sessionToken')
      expect(result.current.isAuthenticated).toBe(false)
      expect(result.current.session).toBe(null)
      expect(result.current.error).toBe('Invalid session')
    })
  })

  describe('clearError', () => {
    it('should clear error state', () => {
      const { result } = renderHook(() => useSessionStore())

      act(() => {
        result.current.error = 'Test error'
      })

      expect(result.current.error).toBe('Test error')

      act(() => {
        result.current.clearError()
      })

      expect(result.current.error).toBe(null)
    })
  })
})