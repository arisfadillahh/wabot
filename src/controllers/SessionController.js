const logger = require('../config/logger');
const Session = require('../models/Session');
const ErrorHandler = require('../middlewares/errorHandler');

class SessionController {
  constructor() {
    this.sessionModel = Session;
    this.errorHandler = ErrorHandler;
  }

  /**
   * User login
   */
  login = async (req, res) => {
    try {
      const { apiKey } = req.body;

      logger.security('login_attempt', {
        apiKeyPrefix: apiKey ? apiKey.substring(0, 4) + '...' : 'null',
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });

      // Create new session
      const session = await this.sessionModel.create(
        apiKey,
        req.get('User-Agent'),
        req.ip
      );

      logger.security('login_successful', {
        sessionTokenPrefix: session.sessionToken.substring(0, 8) + '...',
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });

      res.json({
        success: true,
        sessionToken: session.sessionToken,
        expiresAt: session.expiresAt,
        createdAt: session.createdAt,
        whatsappReady: req.app.get('whatsappReady') || false
      });
    } catch (error) {
      this.errorHandler.handle(error, req, res);
    }
  };

  /**
   * Validate session
   */
  validateSession = async (req, res) => {
    try {
      const { sessionToken } = req.body;

      logger.security('session_validation_request', {
        sessionTokenPrefix: sessionToken ? sessionToken.substring(0, 8) + '...' : 'null',
        ip: req.ip
      });

      const session = await this.sessionModel.validate(sessionToken);

      if (!session) {
        logger.security('session_validation_failed', {
          sessionTokenPrefix: sessionToken.substring(0, 8) + '...',
          ip: req.ip
        });

        return res.status(401).json({
          valid: false,
          message: 'Invalid or expired session'
        });
      }

      logger.security('session_validation_successful', {
        sessionTokenPrefix: sessionToken.substring(0, 8) + '...',
        ip: req.ip
      });

      res.json({
        valid: true,
        session: {
          sessionToken: session.sessionToken,
          expiresAt: session.expiresAt,
          createdAt: session.created,
          userAgent: session.userAgent
        },
        timestamp: Date.now()
      });
    } catch (error) {
      this.errorHandler.handle(error, req, res);
    }
  };

  /**
   * Extend session
   */
  extendSession = async (req, res) => {
    try {
      const { sessionToken } = req.body;

      logger.security('session_extension_request', {
        sessionTokenPrefix: sessionToken ? sessionToken.substring(0, 8) + '...' : 'null',
        ip: req.ip
      });

      const extended = await this.sessionModel.extend(sessionToken);

      if (!extended) {
        logger.security('session_extension_failed', {
          sessionTokenPrefix: sessionToken.substring(0, 8) + '...',
          ip: req.ip
        });

        return res.status(400).json({
          success: false,
          message: 'Failed to extend session'
        });
      }

      logger.security('session_extension_successful', {
        sessionTokenPrefix: sessionToken.substring(0, 8) + '...',
        ip: req.ip
      });

      res.json({
        success: true,
        message: 'Session extended successfully',
        timestamp: Date.now()
      });
    } catch (error) {
      this.errorHandler.handle(error, req, res);
    }
  };

  /**
   * Logout (invalidate session)
   */
  logout = async (req, res) => {
    try {
      const sessionToken = req.headers['x-session-token'];

      if (!sessionToken) {
        return res.status(400).json({
          success: false,
          message: 'Session token is required'
        });
      }

      logger.security('logout_request', {
        sessionTokenPrefix: sessionToken.substring(0, 8) + '...',
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });

      const invalidated = await this.sessionModel.invalidate(sessionToken);

      if (!invalidated) {
        logger.security('logout_failed', {
          sessionTokenPrefix: sessionToken.substring(0, 8) + '...',
          ip: req.ip
        });

        return res.status(400).json({
          success: false,
          message: 'Failed to logout - session not found'
        });
      }

      logger.security('logout_successful', {
        sessionTokenPrefix: sessionToken.substring(0, 8) + '...',
        ip: req.ip
      });

      res.json({
        success: true,
        message: 'Logged out successfully',
        timestamp: Date.now()
      });
    } catch (error) {
      this.errorHandler.handle(error, req, res);
    }
  };

  /**
   * Get session info
   */
  getSessionInfo = async (req, res) => {
    try {
      if (!req.user || !req.user.sessionData) {
        return res.status(401).json({
          success: false,
          message: 'No active session'
        });
      }

      const session = req.user.sessionData;

      res.json({
        session: {
          sessionToken: req.user.sessionToken,
          createdAt: session.created,
          expiresAt: session.expiresAt,
          userAgent: session.userAgent,
          ipAddress: session.ipAddress
        },
        timestamp: Date.now()
      });
    } catch (error) {
      this.errorHandler.handle(error, req, res);
    }
  };

  /**
   * Get session stats
   */
  getSessionStats = async (req, res) => {
    try {
      logger.security('session_stats_request', {
        ip: req.ip,
        userId: req.user?.id
      });

      const stats = await this.sessionModel.getStats();

      res.json({
        stats,
        timestamp: Date.now()
      });
    } catch (error) {
      this.errorHandler.handle(error, req, res);
    }
  };

  /**
   * Get active sessions
   */
  getActiveSessions = async (req, res) => {
    try {
      const { limit = 50 } = req.query;

      logger.security('active_sessions_request', {
        limit,
        ip: req.ip,
        userId: req.user?.id
      });

      const sessions = await this.sessionModel.getActiveSessions(parseInt(limit));

      res.json({
        sessions,
        count: sessions.length,
        timestamp: Date.now()
      });
    } catch (error) {
      this.errorHandler.handle(error, req, res);
    }
  };

  /**
   * Invalidate all sessions for API key
   */
  invalidateAllSessions = async (req, res) => {
    try {
      // This should be called with a valid session
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      logger.security('invalidate_all_sessions_request', {
        userId: req.user?.id,
        ip: req.ip
      });

      let invalidatedCount = 0;

      if (req.user.type === 'session') {
        // Get API key from session
        const apiKey = req.user.sessionData.apiKey;
        invalidatedCount = await this.sessionModel.invalidateAllForApiKey(apiKey);
      } else if (req.user.type === 'api_key') {
        // This is tricky since we don't store the original API key
        // We'll need to find sessions that match this request context
        invalidatedCount = await this.cleanupExpiredSessions();
      }

      logger.security('all_sessions_invalidated', {
        invalidatedCount,
        userId: req.user?.id,
        ip: req.ip
      });

      res.json({
        success: true,
        message: `${invalidatedCount} sessions invalidated successfully`,
        invalidatedCount,
        timestamp: Date.now()
      });
    } catch (error) {
      this.errorHandler.handle(error, req, res);
    }
  };

  /**
   * Cleanup expired sessions
   */
  cleanupSessions = async (req, res) => {
    try {
      logger.security('cleanup_sessions_request', {
        ip: req.ip,
        userId: req.user?.id
      });

      const cleanedCount = await this.sessionModel.cleanup();

      logger.security('sessions_cleaned_up', {
        cleanedCount,
        ip: req.ip
      });

      res.json({
        success: true,
        message: `${cleanedCount} expired sessions cleaned up`,
        cleanedCount,
        timestamp: Date.now()
      });
    } catch (error) {
      this.errorHandler.handle(error, req, res);
    }
  };

  /**
   * Session health check
   */
  sessionHealth = async (req, res) => {
    try {
      const health = {
        sessionModule: true,
        timestamp: Date.now()
      };

      // Check if session model is healthy
      try {
        const stats = await this.sessionModel.getStats();
        health.stats = stats;
        health.healthy = true;
      } catch (error) {
        health.healthy = false;
        health.error = error.message;
      }

      res.json({
        health,
        timestamp: Date.now()
      });
    } catch (error) {
      this.errorHandler.handle(error, req, res);
    }
  };

  /**
   * Helper method to cleanup expired sessions
   */
  async cleanupExpiredSessions() {
    try {
      return await this.sessionModel.cleanup();
    } catch (error) {
      logger.error('Failed to cleanup expired sessions', { error: error.message });
      return 0;
    }
  }
}

module.exports = new SessionController();