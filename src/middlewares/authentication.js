const logger = require('../config/logger');
const config = require('../config/config');
const Session = require('../models/Session');

class AuthenticationMiddleware {
  constructor() {
    this.apiKey = config.get('API_KEY');
  }

  /**
   * Authenticate API key
   */
  authenticateApiKey = async (req, res, next) => {
    try {
      const apiKey = req.headers['x-api-key'];

      if (!apiKey) {
        logger.security('missing_api_key', {
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          path: req.path
        });

        return res.status(401).json({
          error: 'API key required',
          code: 'MISSING_API_KEY',
          details: 'This endpoint requires an API key for authentication'
        });
      }

      if (apiKey !== this.apiKey) {
        logger.security('invalid_api_key', {
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          path: req.path,
          apiKeyPrefix: apiKey.substring(0, 4) + '...'
        });

        return res.status(403).json({
          error: 'Invalid API key',
          code: 'INVALID_API_KEY',
          details: 'The provided API key is not valid'
        });
      }

      // Add user info to request
      req.user = {
        type: 'api_key',
        authenticated: true,
        timestamp: Date.now()
      };

      logger.security('api_key_authenticated', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path
      });

      next();
    } catch (error) {
      logger.error('Authentication middleware error', { error: error.message });
      res.status(500).json({
        error: 'Authentication error',
        code: 'AUTH_ERROR',
        details: 'An error occurred during authentication'
      });
    }
  };

  /**
   * Authenticate session token
   */
  authenticateSession = async (req, res, next) => {
    try {
      const sessionToken = req.headers['x-session-token'];

      if (!sessionToken) {
        logger.security('missing_session_token', {
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          path: req.path
        });

        return res.status(401).json({
          error: 'Session token required',
          code: 'MISSING_SESSION_TOKEN',
          details: 'This endpoint requires a session token for authentication'
        });
      }

      const session = await Session.validate(sessionToken);

      if (!session) {
        logger.security('invalid_session_token', {
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          path: req.path,
          sessionTokenPrefix: sessionToken.substring(0, 8) + '...'
        });

        return res.status(403).json({
          error: 'Invalid or expired session token',
          code: 'INVALID_SESSION_TOKEN',
          details: 'Your session token is invalid or has expired. Please login again.'
        });
      }

      // Add user info to request
      req.user = {
        type: 'session',
        sessionToken,
        sessionData: session,
        authenticated: true,
        timestamp: Date.now()
      };

      logger.security('session_authenticated', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path,
        sessionTokenPrefix: sessionToken.substring(0, 8) + '...'
      });

      next();
    } catch (error) {
      logger.error('Session authentication error', { error: error.message });
      res.status(500).json({
        error: 'Authentication error',
        code: 'AUTH_ERROR',
        details: 'An error occurred during session authentication'
      });
    }
  };

  /**
   * Authenticate either API key or session token
   */
  authenticate = async (req, res, next) => {
    try {
      const sessionToken = req.headers['x-session-token'];
      const apiKey = req.headers['x-api-key'];

      if (sessionToken) {
        // Try session authentication
        const session = await Session.validate(sessionToken);
        if (session) {
          req.user = {
            type: 'session',
            sessionToken,
            sessionData: session,
            authenticated: true,
            timestamp: Date.now()
          };

          logger.security('session_authenticated', {
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            path: req.path
          });

          return next();
        }
      }

      if (apiKey) {
        // Try API key authentication
        if (apiKey === this.apiKey) {
          req.user = {
            type: 'api_key',
            authenticated: true,
            timestamp: Date.now()
          };

          logger.security('api_key_authenticated', {
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            path: req.path
          });

          return next();
        } else {
          logger.security('invalid_api_key', {
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            path: req.path,
            apiKeyPrefix: apiKey.substring(0, 4) + '...'
          });

          return res.status(403).json({
            error: 'Invalid API key',
            code: 'INVALID_API_KEY',
            details: 'The provided API key is not valid'
          });
        }
      }

      // No authentication provided
      logger.security('no_authentication', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path
      });

      return res.status(401).json({
        error: 'Authentication required',
        code: 'AUTHENTICATION_REQUIRED',
        details: 'Please provide either a session token or API key'
      });
    } catch (error) {
      logger.error('Authentication middleware error', { error: error.message });
      res.status(500).json({
        error: 'Authentication error',
        code: 'AUTH_ERROR',
        details: 'An error occurred during authentication'
      });
    }
  };

  /**
   * Optional authentication - doesn't fail if not provided
   */
  optionalAuth = async (req, res, next) => {
    try {
      const sessionToken = req.headers['x-session-token'];
      const apiKey = req.headers['x-api-key'];

      if (sessionToken) {
        const session = await Session.validate(sessionToken);
        if (session) {
          req.user = {
            type: 'session',
            sessionToken,
            sessionData: session,
            authenticated: true,
            timestamp: Date.now()
          };
        }
      } else if (apiKey && apiKey === this.apiKey) {
        req.user = {
          type: 'api_key',
          authenticated: true,
          timestamp: Date.now()
        };
      } else {
        // No authentication provided
        req.user = {
          type: 'none',
          authenticated: false,
          timestamp: Date.now()
        };
      }

      next();
    } catch (error) {
      logger.error('Optional authentication error', { error: error.message });
      // Don't fail the request for optional auth
      req.user = {
        type: 'none',
        authenticated: false,
        timestamp: Date.now()
      };
      next();
    }
  };

  /**
   * Require specific authentication type
   */
  requireAuthType = (type) => {
    return (req, res, next) => {
      if (!req.user || !req.user.authenticated) {
        return res.status(401).json({
          error: 'Authentication required',
          code: 'AUTHENTICATION_REQUIRED',
          details: 'You must be authenticated to access this endpoint'
        });
      }

      if (req.user.type !== type) {
        return res.status(403).json({
          error: 'Insufficient privileges',
          code: 'INSUFFICIENT_PRIVILEGES',
          details: `${type} authentication is required for this endpoint`
        });
      }

      next();
    };
  };

  /**
   * Refresh session
   */
  refreshSession = async (req, res, next) => {
    try {
      if (req.user && req.user.type === 'session') {
        const extended = await Session.extend(req.user.sessionToken);
        if (extended) {
          logger.security('session_refreshed', {
            sessionTokenPrefix: req.user.sessionToken.substring(0, 8) + '...',
            ip: req.ip
          });
        }
      }
      next();
    } catch (error) {
      logger.error('Session refresh error', { error: error.message });
      // Don't fail the request for refresh errors
      next();
    }
  };

  /**
   * Debug authentication endpoint
   */
  debugAuth = async (req, res) => {
    try {
      const debugKey = req.headers['x-debug-key'];
      if (debugKey !== 'debug123') {
        return res.status(403).json({ error: 'Unauthorized debug access' });
      }

      const sessionStats = await Session.getStats();

      res.json({
        authentication: {
          configured: !!this.apiKey,
          apiKeyLength: this.apiKey ? this.apiKey.length : 0,
          apiKeyFirst4: this.apiKey ? this.apiKey.substring(0, 4) + '...' : 'null'
        },
        sessions: sessionStats,
        request: {
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          path: req.path,
          method: req.method,
          headers: {
            'x-api-key': req.headers['x-api-key'] ? req.headers['x-api-key'].substring(0, 4) + '...' : null,
            'x-session-token': req.headers['x-session-token'] ? req.headers['x-session-token'].substring(0, 8) + '...' : null
          }
        },
        user: req.user || null
      });
    } catch (error) {
      logger.error('Debug authentication error', { error: error.message });
      res.status(500).json({ error: 'Debug authentication failed' });
    }
  };
}

module.exports = new AuthenticationMiddleware();