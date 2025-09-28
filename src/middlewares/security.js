const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const logger = require('../config/logger');
const config = require('../config/config');

class SecurityMiddleware {
  constructor() {
    this.rateLimiters = this.createRateLimiters();
  }

  /**
   * Create rate limiters
   */
  createRateLimiters() {
    return {
      // General API rate limiter
      api: rateLimit({
        windowMs: config.get('RATE_LIMIT_WINDOW'),
        max: config.get('RATE_LIMIT_MAX'),
        skipSuccessfulRequests: config.get('RATE_LIMIT_SKIP_SUCCESS'),
        skipFailedRequests: config.get('RATE_LIMIT_SKIP_FAILED'),
        message: {
          error: 'Too many requests',
          code: 'RATE_LIMIT_EXCEEDED',
          details: 'Too many requests from this IP, please try again later.'
        },
        standardHeaders: true,
        legacyHeaders: false,
        handler: (req, res) => {
          logger.security('rate_limit_exceeded', {
            ip: req.ip,
            path: req.path,
            userAgent: req.get('User-Agent')
          });
          res.status(429).json({
            error: 'Too many requests',
            code: 'RATE_LIMIT_EXCEEDED',
            details: 'Too many requests from this IP, please try again later.'
          });
        }
      }),

      // Strict rate limiter for auth endpoints
      auth: rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 5, // 5 attempts per 15 minutes
        skipSuccessfulRequests: false,
        skipFailedRequests: false,
        message: {
          error: 'Too many authentication attempts',
          code: 'AUTH_RATE_LIMIT_EXCEEDED',
          details: 'Too many authentication attempts. Please wait 15 minutes before trying again.'
        },
        standardHeaders: true,
        legacyHeaders: false,
        handler: (req, res) => {
          logger.security('auth_rate_limit_exceeded', {
            ip: req.ip,
            path: req.path,
            userAgent: req.get('User-Agent')
          });
          res.status(429).json({
            error: 'Too many authentication attempts',
            code: 'AUTH_RATE_LIMIT_EXCEEDED',
            details: 'Too many authentication attempts. Please wait 15 minutes before trying again.'
          });
        }
      }),

      // Rate limiter for webhook endpoints
      webhook: rateLimit({
        windowMs: 1 * 60 * 1000, // 1 minute
        max: 100, // 100 requests per minute
        skipSuccessfulRequests: false,
        skipFailedRequests: false,
        message: {
          error: 'Webhook rate limit exceeded',
          code: 'WEBHOOK_RATE_LIMIT_EXCEEDED',
          details: 'Too many webhook requests. Please reduce the request rate.'
        },
        standardHeaders: true,
        legacyHeaders: false,
        handler: (req, res) => {
          logger.security('webhook_rate_limit_exceeded', {
            ip: req.ip,
            path: req.path,
            userAgent: req.get('User-Agent')
          });
          res.status(429).json({
            error: 'Webhook rate limit exceeded',
            code: 'WEBHOOK_RATE_LIMIT_EXCEEDED',
            details: 'Too many webhook requests. Please reduce the request rate.'
          });
        }
      }),

      // Rate limiter for message sending
      message: rateLimit({
        windowMs: 1 * 60 * 1000, // 1 minute
        max: 30, // 30 messages per minute
        skipSuccessfulRequests: false,
        skipFailedRequests: false,
        message: {
          error: 'Message rate limit exceeded',
          code: 'MESSAGE_RATE_LIMIT_EXCEEDED',
          details: 'Too many messages sent. Please wait before sending more messages.'
        },
        standardHeaders: true,
        legacyHeaders: false,
        handler: (req, res) => {
          logger.security('message_rate_limit_exceeded', {
            ip: req.ip,
            path: req.path,
            userAgent: req.get('User-Agent')
          });
          res.status(429).json({
            error: 'Message rate limit exceeded',
            code: 'MESSAGE_RATE_LIMIT_EXCEEDED',
            details: 'Too many messages sent. Please wait before sending more messages.'
          });
        }
      })
    };
  }

  /**
   * Helmet security headers
   */
  helmetConfig = helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https:", "https://cdnjs.cloudflare.com"],
        scriptSrc: ["'self'", "'unsafe-inline'", "https:", "https://cdn.socket.io", "https://cdnjs.cloudflare.com"],
        scriptSrcAttr: ["'unsafe-inline'"],
        connectSrc: ["'self'", "ws:", "wss:", "https://cdn.socket.io"],
        imgSrc: ["'self'", "data:", "https:"],
        fontSrc: ["'self'", "https:", "data:"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'self'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'self'"],
        blockAllMixedContent: []
      }
    },
    crossOriginEmbedderPolicy: true,
    crossOriginOpenerPolicy: true,
    crossOriginResourcePolicy: { policy: "same-site" },
    dnsPrefetchControl: true,
    expectCt: true,
    frameguard: { action: 'deny' },
    hidePoweredBy: true,
    hsts: true,
    ieNoOpen: true,
    noSniff: true,
    permittedCrossDomainPolicies: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    xssFilter: true
  });

  /**
   * CORS configuration
   */
  corsConfig = cors({
    origin: (origin, callback) => {
      const allowedOrigins = config.get('corsOriginsArray') || [];

      // Allow requests with no origin (like mobile apps, Postman, etc.)
      if (!origin) {
        return callback(null, true);
      }

      // Check if the origin is allowed
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        logger.security('cors_blocked', { origin, ip: 'unknown' });
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-API-Key',
      'X-Session-Token',
      'X-Requested-With',
      'X-Debug-Key'
    ],
    credentials: true,
    optionsSuccessStatus: 204,
    maxAge: 86400 // 24 hours
  });

  /**
   * Request logging middleware
   */
  requestLogger = (req, res, next) => {
    const start = Date.now();
    const ip = req.ip || req.connection.remoteAddress;

    // Log request start
    logger.http('request_started', {
      method: req.method,
      url: req.url,
      ip,
      userAgent: req.get('User-Agent'),
      contentType: req.get('Content-Type'),
      contentLength: req.get('Content-Length')
    });

    // Override res.end to log response
    const originalEnd = res.end;
    res.end = function(chunk, encoding) {
      const responseTime = Date.now() - start;

      logger.http('request_completed', {
        method: req.method,
        url: req.url,
        ip,
        statusCode: res.statusCode,
        responseTime,
        contentLength: res.get('Content-Length')
      });

      originalEnd.call(this, chunk, encoding);
    };

    next();
  };

  /**
   * Add security headers
   */
  securityHeaders = (req, res, next) => {
    // Additional security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    // Remove sensitive headers
    res.removeHeader('X-Powered-By');

    next();
  };

  /**
   * Input sanitization middleware
   */
  inputSanitization = (req, res, next) => {
    try {
      // Sanitize request body
      if (req.body && typeof req.body === 'object') {
        this.sanitizeObject(req.body);
      }

      // Sanitize query parameters
      if (req.query && typeof req.query === 'object') {
        this.sanitizeObject(req.query);
      }

      // Sanitize URL parameters
      if (req.params && typeof req.params === 'object') {
        this.sanitizeObject(req.params);
      }

      next();
    } catch (error) {
      logger.error('Input sanitization error', { error: error.message });
      res.status(500).json({
        error: 'Input sanitization error',
        code: 'SANITIZATION_ERROR',
        details: 'An error occurred during input sanitization'
      });
    }
  };

  /**
   * Sanitize object recursively
   */
  sanitizeObject(obj) {
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        if (typeof obj[key] === 'string') {
          // Basic string sanitization
          obj[key] = obj[key]
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
            .replace(/javascript:/gi, '')
            .replace(/on\w+\s*=/gi, '')
            .trim();
        } else if (typeof obj[key] === 'object' && obj[key] !== null) {
          this.sanitizeObject(obj[key]);
        }
      }
    }
  }

  /**
   * Check for suspicious patterns
   */
  suspiciousPatternDetection = (req, res, next) => {
    const suspiciousPatterns = [
      /<script/i,
      /javascript:/i,
      /on\w+\s*=/i,
      /<iframe/i,
      /<object/i,
      /<embed/i,
      /eval\s*\(/i,
      /document\./i,
      /window\./i,
      /alert\s*\(/i,
      /prompt\s*\(/i,
      /confirm\s*\(/i
    ];

    const checkValue = (value) => {
      if (typeof value === 'string') {
        for (const pattern of suspiciousPatterns) {
          if (pattern.test(value)) {
            return true;
          }
        }
      } else if (typeof value === 'object' && value !== null) {
        for (const key in value) {
          if (checkValue(value[key])) {
            return true;
          }
        }
      }
      return false;
    };

    // Check request body
    if (checkValue(req.body)) {
      logger.security('suspicious_pattern_detected', {
        ip: req.ip,
        path: req.path,
        userAgent: req.get('User-Agent')
      });
    }

    next();
  };

  /**
   * Block suspicious user agents
   */
  blockSuspiciousUserAgents = (req, res, next) => {
    const userAgent = req.get('User-Agent') || '';
    const suspiciousAgents = [
      /bot/i,
      /crawler/i,
      /spider/i,
      /scanner/i,
      /test/i,
      /curl/i,
      /wget/i,
      /python/i,
      /php/i,
      /perl/i
    ];

    const isSuspicious = suspiciousAgents.some(agent => agent.test(userAgent));

    if (isSuspicious && !this.isAllowedBot(userAgent)) {
      logger.security('suspicious_user_agent_blocked', {
        userAgent,
        ip: req.ip,
        path: req.path
      });

      return res.status(403).json({
        error: 'Access denied',
        code: 'SUSPICIOUS_USER_AGENT',
        details: 'Access from this user agent is not allowed'
      });
    }

    next();
  };

  /**
   * Check if user agent is an allowed bot
   */
  isAllowedBot(userAgent) {
    const allowedBots = [
      'googlebot',
      'bingbot',
      'yandexbot',
      'facebookexternalhit',
      'twitterbot',
      'linkedinbot',
      'whatsapp',
      'slackbot'
    ];

    return allowedBots.some(bot => userAgent.toLowerCase().includes(bot));
  }

  /**
   * Error handling middleware
   */
  errorHandler = (err, req, res, next) => {
    // Log the error
    logger.error('middleware_error', {
      error: err.message,
      stack: err.stack,
      ip: req.ip,
      path: req.path,
      method: req.method
    });

    // Don't expose error details in production
    if (config.isProduction()) {
      res.status(500).json({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
        details: 'An internal server error occurred'
      });
    } else {
      res.status(500).json({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
        details: err.message,
        stack: err.stack
      });
    }
  };

  /**
   * 404 handler
   */
  notFoundHandler = (req, res) => {
    logger.security('not_found', {
      ip: req.ip,
      path: req.path,
      method: req.method,
      userAgent: req.get('User-Agent')
    });

    res.status(404).json({
      error: 'Not found',
      code: 'NOT_FOUND',
      details: `Endpoint ${req.method} ${req.path} not found`
    });
  };

  /**
   * Get rate limiter by name
   */
  getRateLimiter(name) {
    return this.rateLimiters[name] || this.rateLimiters.api;
  }

  /**
   * Health check middleware
   */
  healthCheck = (req, res, next) => {
    // Add health check headers
    res.setHeader('X-Health-Check', 'true');
    res.setHeader('X-Health-Timestamp', Date.now().toString());
    next();
  };
}

module.exports = new SecurityMiddleware();