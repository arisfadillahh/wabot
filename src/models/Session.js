const crypto = require('crypto');
const db = require('../config/database');
const logger = require('../config/logger');
const config = require('../config/config');

class Session {
  constructor() {
    this.tableName = 'sessions';
    this.activeSessions = new Map(); // In-memory cache for active sessions
  }

  /**
   * Create new session
   */
  async create(apiKey, userAgent = null, ipAddress = null) {
    try {
      const sessionToken = crypto.randomBytes(32).toString('hex');
      const apiKeyHash = this.hashApiKey(apiKey);
      const now = Date.now();
      const expiresAt = now + config.get('SESSION_TTL');

      const result = await db.run(
        `INSERT INTO ${this.tableName} (session_token, api_key_hash, created_at, expires_at, user_agent, ip_address) VALUES (?, ?, ?, ?, ?, ?)`,
        [sessionToken, apiKeyHash, now, expiresAt, userAgent, ipAddress]
      );

      // Cache in memory
      this.activeSessions.set(sessionToken, {
        sessionToken,
        apiKeyHash,
        created: now,
        expiresAt,
        userAgent,
        ipAddress,
        isActive: true
      });

      logger.security('session_created', {
        sessionId: sessionToken.substring(0, 8) + '...',
        userAgent,
        ipAddress,
        expiresAt: new Date(expiresAt).toISOString()
      });

      return {
        sessionToken,
        expiresAt,
        createdAt: now
      };
    } catch (error) {
      logger.error('Failed to create session', { error: error.message });
      throw error;
    }
  }

  /**
   * Validate session
   */
  async validate(sessionToken) {
    try {
      // Check in-memory cache first
      if (this.activeSessions.has(sessionToken)) {
        const session = this.activeSessions.get(sessionToken);
        if (session.isActive && session.expiresAt > Date.now()) {
          return session;
        } else {
          // Remove expired session from cache
          this.activeSessions.delete(sessionToken);
          await this.invalidate(sessionToken);
          return null;
        }
      }

      // Check database
      const session = await db.get(
        `SELECT * FROM ${this.tableName} WHERE session_token = ? AND is_active = 1 AND expires_at > ?`,
        [sessionToken, Date.now()]
      );

      if (session) {
        // Cache in memory
        this.activeSessions.set(sessionToken, {
          sessionToken: session.session_token,
          apiKeyHash: session.api_key_hash,
          created: session.created_at,
          expiresAt: session.expires_at,
          userAgent: session.user_agent,
          ipAddress: session.ip_address,
          isActive: session.is_active === 1
        });

        return {
          sessionToken: session.session_token,
          apiKeyHash: session.api_key_hash,
          created: session.created_at,
          expiresAt: session.expires_at,
          userAgent: session.user_agent,
          ipAddress: session.ip_address,
          isActive: session.is_active === 1
        };
      }

      return null;
    } catch (error) {
      logger.error('Failed to validate session', { error: error.message });
      return null;
    }
  }

  /**
   * Invalidate session
   */
  async invalidate(sessionToken) {
    try {
      await db.run(
        `UPDATE ${this.tableName} SET is_active = 0 WHERE session_token = ?`,
        [sessionToken]
      );

      // Remove from cache
      this.activeSessions.delete(sessionToken);

      logger.security('session_invalidated', {
        sessionId: sessionToken.substring(0, 8) + '...'
      });

      return true;
    } catch (error) {
      logger.error('Failed to invalidate session', { error: error.message });
      return false;
    }
  }

  /**
   * Extend session
   */
  async extend(sessionToken) {
    try {
      const newExpiresAt = Date.now() + config.get('SESSION_TTL');

      await db.run(
        `UPDATE ${this.tableName} SET expires_at = ? WHERE session_token = ? AND is_active = 1`,
        [newExpiresAt, sessionToken]
      );

      // Update cache
      if (this.activeSessions.has(sessionToken)) {
        const session = this.activeSessions.get(sessionToken);
        session.expiresAt = newExpiresAt;
        this.activeSessions.set(sessionToken, session);
      }

      return true;
    } catch (error) {
      logger.error('Failed to extend session', { error: error.message });
      return false;
    }
  }

  /**
   * Cleanup expired sessions
   */
  async cleanup() {
    try {
      const result = await db.run(
        `UPDATE ${this.tableName} SET is_active = 0 WHERE expires_at <= ? OR is_active = 0`,
        [Date.now()]
      );

      // Clean up cache
      const now = Date.now();
      for (const [token, session] of this.activeSessions.entries()) {
        if (!session.isActive || session.expiresAt <= now) {
          this.activeSessions.delete(token);
        }
      }

      logger.info('Session cleanup completed', {
        invalidatedSessions: result.changes,
        activeCacheSize: this.activeSessions.size
      });

      return result.changes;
    } catch (error) {
      logger.error('Failed to cleanup sessions', { error: error.message });
      throw error;
    }
  }

  /**
   * Get session stats
   */
  async getStats() {
    try {
      const stats = await db.get(`
        SELECT
          COUNT(*) as totalSessions,
          COUNT(CASE WHEN is_active = 1 AND expires_at > ? THEN 1 END) as activeSessions,
          COUNT(CASE WHEN is_active = 0 OR expires_at <= ? THEN 1 END) as expiredSessions,
          COUNT(CASE WHEN created_at >= ? THEN 1 END) as sessionsToday,
          COUNT(CASE WHEN created_at >= ? THEN 1 END) as sessionsThisWeek
        FROM ${this.tableName}
      `, [
        Date.now(),
        Date.now(),
        new Date().setHours(0, 0, 0, 0),
        Date.now() - 7 * 24 * 60 * 60 * 1000
      ]);

      return {
        totalSessions: stats.totalSessions,
        activeSessions: stats.activeSessions,
        expiredSessions: stats.expiredSessions,
        sessionsToday: stats.sessionsToday,
        sessionsThisWeek: stats.sessionsThisWeek,
        cachedSessions: this.activeSessions.size
      };
    } catch (error) {
      logger.error('Failed to get session stats', { error: error.message });
      throw error;
    }
  }

  /**
   * Get active sessions
   */
  async getActiveSessions(limit = 50) {
    try {
      const sessions = await db.all(`
        SELECT
          session_token as sessionToken,
          created_at as createdAt,
          expires_at as expiresAt,
          user_agent as userAgent,
          ip_address as ipAddress
        FROM ${this.tableName}
        WHERE is_active = 1 AND expires_at > ?
        ORDER BY created_at DESC
        LIMIT ?
      `, [Date.now(), limit]);

      return sessions.map(session => ({
        ...session,
        sessionToken: session.sessionToken.substring(0, 8) + '...'
      }));
    } catch (error) {
      logger.error('Failed to get active sessions', { error: error.message });
      throw error;
    }
  }

  /**
   * Validate API key against session
   */
  async validateApiKey(apiKey, sessionToken) {
    try {
      const session = await this.validate(sessionToken);
      if (!session) {
        return false;
      }

      const apiKeyHash = this.hashApiKey(apiKey);
      return session.apiKeyHash === apiKeyHash;
    } catch (error) {
      logger.error('Failed to validate API key', { error: error.message });
      return false;
    }
  }

  /**
   * Hash API key for storage
   */
  hashApiKey(apiKey) {
    return crypto.createHash('sha256').update(apiKey).digest('hex');
  }

  /**
   * Invalidate all sessions for API key
   */
  async invalidateAllForApiKey(apiKey) {
    try {
      const apiKeyHash = this.hashApiKey(apiKey);

      const result = await db.run(
        `UPDATE ${this.tableName} SET is_active = 0 WHERE api_key_hash = ?`,
        [apiKeyHash]
      );

      // Clear cache for affected sessions
      for (const [token, session] of this.activeSessions.entries()) {
        if (session.apiKeyHash === apiKeyHash) {
          this.activeSessions.delete(token);
        }
      }

      logger.security('all_sessions_invalidated', {
        affectedSessions: result.changes
      });

      return result.changes;
    } catch (error) {
      logger.error('Failed to invalidate all sessions for API key', { error: error.message });
      throw error;
    }
  }

  /**
   * Get session by API key
   */
  async getSessionByApiKey(apiKey) {
    try {
      const apiKeyHash = this.hashApiKey(apiKey);

      const session = await db.get(
        `SELECT * FROM ${this.tableName} WHERE api_key_hash = ? AND is_active = 1 AND expires_at > ? ORDER BY created_at DESC LIMIT 1`,
        [apiKeyHash, Date.now()]
      );

      if (session) {
        return {
          sessionToken: session.session_token,
          apiKeyHash: session.api_key_hash,
          created: session.created_at,
          expiresAt: session.expires_at,
          userAgent: session.user_agent,
          ipAddress: session.ip_address,
          isActive: session.is_active === 1
        };
      }

      return null;
    } catch (error) {
      logger.error('Failed to get session by API key', { error: error.message });
      throw error;
    }
  }
}

module.exports = new Session();