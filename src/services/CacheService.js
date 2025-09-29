const EventEmitter = require('events');
const logger = require('../config/logger');
const config = require('../config/config');

class CacheService extends EventEmitter {
  constructor() {
    super();
    this.cache = new Map();
    this.timestamps = new Map();
    this.maxSize = config.get('CACHE_MAX_SIZE');
    this.cleanupInterval = config.get('CACHE_CLEANUP_INTERVAL');
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      evictions: 0,
      startTime: Date.now()
    };

    // Start cleanup process
    this.startCleanup();
  }

  /**
   * Set cache value with TTL
   */
  set(key, value, ttl = null) {
    try {
      // Check if we need to evict items
      this.ensureCapacity();

      const now = Date.now();
      const ttlMs = ttl || this.getDefaultTTL(key);
      const expiresAt = now + ttlMs;

      this.cache.set(key, {
        value,
        expiresAt,
        createdAt: now,
        accessCount: 0,
        lastAccessed: now
      });

      this.timestamps.set(key, now);
      this.stats.sets++;

      logger.cache('cache_set', {
        key: this.sanitizeKey(key),
        ttl: ttlMs,
        cacheSize: this.cache.size
      });

      this.emit('set', { key, ttl: ttlMs, cacheSize: this.cache.size });

      return true;
    } catch (error) {
      logger.error('Failed to set cache value', { error: error.message, key: this.sanitizeKey(key) });
      return false;
    }
  }

  /**
   * Get cache value
   */
  get(key) {
    try {
      const now = Date.now();
      const item = this.cache.get(key);

      if (!item) {
        this.stats.misses++;
        return null;
      }

      // Check if expired
      if (now > item.expiresAt) {
        this.delete(key);
        this.stats.misses++;
        return null;
      }

      // Update access info
      item.accessCount++;
      item.lastAccessed = now;
      this.stats.hits++;

      logger.cache('cache_hit', {
        key: this.sanitizeKey(key),
        accessCount: item.accessCount,
        age: now - item.createdAt
      });

      return item.value;
    } catch (error) {
      logger.error('Failed to get cache value', { error: error.message, key: this.sanitizeKey(key) });
      return null;
    }
  }

  /**
   * Check if key exists
   */
  has(key) {
    try {
      const item = this.cache.get(key);
      if (!item) {
        return false;
      }

      // Check if expired
      if (Date.now() > item.expiresAt) {
        this.delete(key);
        return false;
      }

      return true;
    } catch (error) {
      logger.error('Failed to check cache key', { error: error.message, key: this.sanitizeKey(key) });
      return false;
    }
  }

  /**
   * Delete cache value
   */
  delete(key) {
    try {
      const deleted = this.cache.delete(key);
      this.timestamps.delete(key);
      this.stats.deletes++;

      if (deleted) {
        logger.cache('cache_deleted', { key: this.sanitizeKey(key) });
        this.emit('delete', { key });
      }

      return deleted;
    } catch (error) {
      logger.error('Failed to delete cache value', { error: error.message, key: this.sanitizeKey(key) });
      return false;
    }
  }

  /**
   * Clear all cache values
   */
  clear() {
    try {
      const size = this.cache.size;
      this.cache.clear();
      this.timestamps.clear();

      logger.cache('cache_cleared', { clearedItems: size });
      this.emit('clear', { clearedItems: size });

      return size;
    } catch (error) {
      logger.error('Failed to clear cache', { error: error.message });
      return 0;
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const now = Date.now();
    const uptime = now - this.stats.startTime;
    const hitRate = this.stats.hits + this.stats.misses > 0
      ? ((this.stats.hits / (this.stats.hits + this.stats.misses)) * 100).toFixed(2)
      : 0;

    const oldestItem = this.getOldestItem();
    const newestItem = this.getNewestItem();

    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hits: this.stats.hits,
      misses: this.stats.misses,
      sets: this.stats.sets,
      deletes: this.stats.deletes,
      evictions: this.stats.evictions,
      hitRate: `${hitRate}%`,
      uptime: `${Math.floor(uptime / 1000)}s`,
      oldestItem,
      newestItem,
      memoryUsage: process.memoryUsage().heapUsed
    };
  }

  /**
   * Get all keys in cache
   */
  keys() {
    return Array.from(this.cache.keys());
  }

  /**
   * Get all values in cache
   */
  values() {
    return Array.from(this.cache.values()).map(item => item.value);
  }

  /**
   * Get all entries in cache
   */
  entries() {
    const now = Date.now();
    const entries = [];

    for (const [key, item] of this.cache.entries()) {
      if (now <= item.expiresAt) {
        entries.push([key, item.value]);
      } else {
        this.delete(key);
      }
    }

    return entries;
  }

  /**
   * Ensure cache capacity
   */
  ensureCapacity() {
    if (this.cache.size < this.maxSize) {
      return;
    }

    // Evict expired items first
    this.evictExpired();

    // If still full, evict least recently used
    if (this.cache.size >= this.maxSize) {
      this.evictLRU();
    }
  }

  /**
   * Evict expired items
   */
  evictExpired() {
    const now = Date.now();
    const expiredKeys = [];

    for (const [key, item] of this.cache.entries()) {
      if (now > item.expiresAt) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      this.delete(key);
    }

    if (expiredKeys.length > 0) {
      logger.cache('evicted_expired_items', { count: expiredKeys.length });
    }
  }

  /**
   * Evict least recently used items
   */
  evictLRU() {
    if (this.cache.size === 0) return;

    // Find least recently used items
    let lruKey = null;
    let lruTime = Infinity;

    for (const [key, item] of this.cache.entries()) {
      if (item.lastAccessed < lruTime) {
        lruKey = key;
        lruTime = item.lastAccessed;
      }
    }

    if (lruKey) {
      this.delete(lruKey);
      this.stats.evictions++;
      logger.cache('evicted_lru_item', { key: this.sanitizeKey(lruKey) });
    }
  }

  /**
   * Get default TTL based on key pattern
   */
  getDefaultTTL(key) {
    if (key.includes('chats')) {
      return config.get('CACHE_CHAT_TTL');
    } else if (key.includes('user') || key.includes('session')) {
      return config.get('CACHE_USER_TTL');
    } else if (key.includes('analytics')) {
      return config.get('CACHE_ANALYTICS_TTL');
    } else {
      return 60000; // Default 1 minute
    }
  }

  /**
   * Get oldest item in cache
   */
  getOldestItem() {
    if (this.cache.size === 0) return null;

    let oldestKey = null;
    let oldestTime = Infinity;

    for (const [key, item] of this.cache.entries()) {
      if (item.createdAt < oldestTime) {
        oldestKey = key;
        oldestTime = item.createdAt;
      }
    }

    return oldestKey ? {
      key: this.sanitizeKey(oldestKey),
      age: Date.now() - oldestTime
    } : null;
  }

  /**
   * Get newest item in cache
   */
  getNewestItem() {
    if (this.cache.size === 0) return null;

    let newestKey = null;
    let newestTime = 0;

    for (const [key, item] of this.cache.entries()) {
      if (item.createdAt > newestTime) {
        newestKey = key;
        newestTime = item.createdAt;
      }
    }

    return newestKey ? {
      key: this.sanitizeKey(newestKey),
      age: Date.now() - newestTime
    } : null;
  }

  /**
   * Sanitize key for logging
   */
  sanitizeKey(key) {
    if (typeof key !== 'string') return String(key);

    // Remove sensitive information
    return key
      .replace(/token/i, '***')
      .replace(/key/i, '***')
      .replace(/secret/i, '***')
      .replace(/password/i, '***')
      .substring(0, 50);
  }

  /**
   * Start cleanup process
   */
  startCleanup() {
    setInterval(() => {
      this.evictExpired();
      this.ensureCapacity();
    }, this.cleanupInterval);

    logger.debug('cleanup_process_started', { interval: this.cleanupInterval });
  }

  /**
   * Get cache item metadata
   */
  getMetadata(key) {
    const item = this.cache.get(key);
    if (!item) return null;

    const now = Date.now();
    return {
      key,
      exists: true,
      expiresAt: item.expiresAt,
      timeToLive: Math.max(0, item.expiresAt - now),
      createdAt: item.createdAt,
      age: now - item.createdAt,
      accessCount: item.accessCount,
      lastAccessed: item.lastAccessed,
      timeSinceLastAccess: now - item.lastAccessed
    };
  }

  /**
   * Warm up cache with initial data
   */
  async warmUp(data) {
    try {
      let warmedCount = 0;

      for (const [key, value] of Object.entries(data)) {
        const ttl = this.getDefaultTTL(key);
        if (this.set(key, value, ttl)) {
          warmedCount++;
        }
      }

      logger.cache('cache_warmed_up', {
        totalItems: Object.keys(data).length,
        warmedItems: warmedCount
      });

      return warmedCount;
    } catch (error) {
      logger.error('Failed to warm up cache', { error: error.message });
      return 0;
    }
  }

  /**
   * Health check
   */
  healthCheck() {
    const stats = this.getStats();
    const healthy = stats.size < stats.maxSize && stats.hitRate > 50;

    return {
      healthy,
      stats,
      timestamp: Date.now()
    };
  }
}

module.exports = new CacheService();