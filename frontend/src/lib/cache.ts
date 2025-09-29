interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number; // Time to live in milliseconds
}

interface CacheConfig {
  ttl?: number; // Default TTL in milliseconds
  maxSize?: number; // Maximum number of entries
  storage?: 'memory' | 'localStorage'; // Storage type
}

export class CacheService {
  private memoryCache: Map<string, CacheEntry<any>> = new Map();
  private config: Required<CacheConfig>;

  constructor(config: CacheConfig = {}) {
    this.config = {
      ttl: config.ttl || 5 * 60 * 1000, // 5 minutes default
      maxSize: config.maxSize || 100,
      storage: config.storage || 'memory',
    };
  }

  private getStorageKey(key: string): string {
    return `cache_${key}`;
  }

  private isExpired(entry: CacheEntry<any>): boolean {
    return Date.now() - entry.timestamp > entry.ttl;
  }

  private cleanupMemoryCache(): void {
    const now = Date.now();
    const entries = Array.from(this.memoryCache.entries());
    for (const [key, entry] of entries) {
      if (this.isExpired(entry)) {
        this.memoryCache.delete(key);
      }
    }

    // If still over max size, remove oldest entries
    if (this.memoryCache.size > this.config.maxSize) {
      const entries = Array.from(this.memoryCache.entries())
        .sort(([, a], [, b]) => a.timestamp - b.timestamp);

      const toRemove = entries.slice(0, entries.length - this.config.maxSize);
      toRemove.forEach(([key]) => this.memoryCache.delete(key));
    }
  }

  private cleanupLocalStorage(): void {
    if (typeof window === 'undefined') return;

    const now = Date.now();
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('cache_')) {
        try {
          const entry = JSON.parse(localStorage.getItem(key) || '');
          if (this.isExpired(entry)) {
            localStorage.removeItem(key);
          }
        } catch {
          // Remove invalid entries
          localStorage.removeItem(key);
        }
      }
    }
  }

  set<T>(key: string, data: T, ttl?: number): void {
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl: ttl || this.config.ttl,
    };

    if (this.config.storage === 'localStorage' && typeof window !== 'undefined') {
      try {
        localStorage.setItem(this.getStorageKey(key), JSON.stringify(entry));
      } catch (error) {
        console.warn('Failed to cache data in localStorage:', error);
        // Fallback to memory cache
        this.memoryCache.set(key, entry);
      }
    } else {
      this.memoryCache.set(key, entry);
      this.cleanupMemoryCache();
    }
  }

  get<T>(key: string): T | null {
    let entry: CacheEntry<T> | null = null;

    if (this.config.storage === 'localStorage' && typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(this.getStorageKey(key));
        if (stored) {
          entry = JSON.parse(stored);
        }
      } catch (error) {
        console.warn('Failed to retrieve cached data from localStorage:', error);
      }
    }

    if (!entry) {
      entry = this.memoryCache.get(key) || null;
    }

    if (!entry) {
      return null;
    }

    if (this.isExpired(entry)) {
      this.delete(key);
      return null;
    }

    return entry.data;
  }

  delete(key: string): void {
    this.memoryCache.delete(key);

    if (this.config.storage === 'localStorage' && typeof window !== 'undefined') {
      try {
        localStorage.removeItem(this.getStorageKey(key));
      } catch (error) {
        console.warn('Failed to remove cached data from localStorage:', error);
      }
    }
  }

  clear(): void {
    this.memoryCache.clear();

    if (this.config.storage === 'localStorage' && typeof window !== 'undefined') {
      try {
        // Remove all cache entries
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key?.startsWith('cache_')) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach(key => localStorage.removeItem(key));
      } catch (error) {
        console.warn('Failed to clear cached data from localStorage:', error);
      }
    }
  }

  has(key: string): boolean {
    return this.get(key) !== null;
  }

  size(): number {
    if (this.config.storage === 'localStorage' && typeof window !== 'undefined') {
      let count = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith('cache_')) {
          count++;
        }
      }
      return count;
    }
    return this.memoryCache.size;
  }

  // Utility methods for common caching patterns
  async getOrSet<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const data = await fetchFn();
    this.set(key, data, ttl);
    return data;
  }

  // Cache with automatic refresh
  async getOrRefresh<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttl?: number,
    refreshThreshold?: number
  ): Promise<T> {
    const cached = this.get<T>(key);

    if (cached !== null) {
      const entry = this.memoryCache.get(key) ||
        (this.config.storage === 'localStorage' && typeof window !== 'undefined'
          ? JSON.parse(localStorage.getItem(this.getStorageKey(key)) || '{}')
          : null);

      if (entry && !this.isExpired(entry)) {
        const timeUntilExpiry = entry.ttl - (Date.now() - entry.timestamp);
        const threshold = refreshThreshold || entry.ttl * 0.3; // Refresh at 30% of TTL by default

        if (timeUntilExpiry > threshold) {
          return cached;
        }

        // Background refresh
        fetchFn().then(data => this.set(key, data, ttl)).catch(console.warn);
      }

      return cached;
    }

    const data = await fetchFn();
    this.set(key, data, ttl);
    return data;
  }
}

// Pre-configured cache instances
export const apiCache = new CacheService({
  ttl: 5 * 60 * 1000, // 5 minutes
  maxSize: 50,
  storage: 'memory',
});

export const uiCache = new CacheService({
  ttl: 30 * 60 * 1000, // 30 minutes
  maxSize: 100,
  storage: 'localStorage',
});

export const analyticsCache = new CacheService({
  ttl: 15 * 60 * 1000, // 15 minutes
  maxSize: 20,
  storage: 'memory',
});

import { useState, useEffect } from 'react';

// React hook for caching
export function useCache<T>(
  key: string,
  fetchFn: () => Promise<T>,
  config: CacheConfig & { refreshInterval?: number } = {}
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const cache = new CacheService(config);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        const cachedData = cache.get<T>(key);
        if (cachedData) {
          setData(cachedData);
          setLoading(false);
          return;
        }

        const freshData = await fetchFn();
        cache.set(key, freshData);
        setData(freshData);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Unknown error'));
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    // Set up refresh interval if specified
    if (config.refreshInterval) {
      const interval = setInterval(fetchData, config.refreshInterval);
      return () => clearInterval(interval);
    }
  }, [key, fetchFn, config.refreshInterval, cache]);

  return { data, loading, error, refetch: () => cache.delete(key) };
}