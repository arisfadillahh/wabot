const logger = require('../config/logger');
const config = require('../config/config');

class ErrorHandlerMiddleware {
  constructor() {
    this.errorTypes = this.initializeErrorTypes();
  }

  /**
   * Initialize error types and handlers
   */
  initializeErrorTypes() {
    return {
      // Database errors
      'DatabaseError': {
        status: 503,
        code: 'DATABASE_ERROR',
        logLevel: 'error',
        userMessage: 'Database service unavailable'
      },

      'SQLiteError': {
        status: 503,
        code: 'DATABASE_ERROR',
        logLevel: 'error',
        userMessage: 'Database service unavailable'
      },

      // Authentication errors
      'AuthenticationError': {
        status: 401,
        code: 'AUTHENTICATION_ERROR',
        logLevel: 'warn',
        userMessage: 'Authentication required'
      },

      'AuthorizationError': {
        status: 403,
        code: 'AUTHORIZATION_ERROR',
        logLevel: 'warn',
        userMessage: 'Access denied'
      },

      // Validation errors
      'ValidationError': {
        status: 400,
        code: 'VALIDATION_ERROR',
        logLevel: 'warn',
        userMessage: 'Invalid request data'
      },

      'JoiValidationError': {
        status: 400,
        code: 'VALIDATION_ERROR',
        logLevel: 'warn',
        userMessage: 'Invalid request data'
      },

      // WhatsApp errors
      'WhatsAppError': {
        status: 503,
        code: 'WHATSAPP_ERROR',
        logLevel: 'error',
        userMessage: 'WhatsApp service unavailable'
      },

      'WhatsAppNotReadyError': {
        status: 503,
        code: 'WHATSAPP_NOT_READY',
        logLevel: 'warn',
        userMessage: 'WhatsApp client not ready'
      },

      // Network errors
      'NetworkError': {
        status: 503,
        code: 'NETWORK_ERROR',
        logLevel: 'error',
        userMessage: 'Network service unavailable'
      },

      // Rate limit errors
      'RateLimitError': {
        status: 429,
        code: 'RATE_LIMIT_EXCEEDED',
        logLevel: 'warn',
        userMessage: 'Too many requests'
      },

      // Resource errors
      'ResourceNotFoundError': {
        status: 404,
        code: 'NOT_FOUND',
        logLevel: 'info',
        userMessage: 'Resource not found'
      },

      'ResourceConflictError': {
        status: 409,
        code: 'CONFLICT',
        logLevel: 'warn',
        userMessage: 'Resource conflict'
      },

      // Business logic errors
      'BusinessLogicError': {
        status: 422,
        code: 'BUSINESS_LOGIC_ERROR',
        logLevel: 'warn',
        userMessage: 'Request cannot be processed'
      },

      // External service errors
      'ExternalServiceError': {
        status: 502,
        code: 'EXTERNAL_SERVICE_ERROR',
        logLevel: 'error',
        userMessage: 'External service unavailable'
      },

      // Configuration errors
      'ConfigurationError': {
        status: 500,
        code: 'CONFIGURATION_ERROR',
        logLevel: 'error',
        userMessage: 'Configuration error'
      }
    };
  }

  /**
   * Main error handler middleware
   */
  handle = (err, req, res, next) => {
    try {
      // Generate request ID for tracing
      const requestId = req.headers['x-request-id'] || this.generateRequestId();

      // Get error type
      const errorType = this.getErrorType(err);
      const errorConfig = this.errorTypes[errorType] || this.getDefaultErrorConfig();

      // Log the error with context
      this.logError(err, req, errorConfig, requestId);

      // Prepare error response
      const errorResponse = this.prepareErrorResponse(err, errorConfig, requestId);

      // Send response
      res.status(errorConfig.status).json(errorResponse);

    } catch (handlerError) {
      // If the error handler itself fails, send a basic error response
      logger.error('error_handler_failed', {
        error: handlerError.message,
        originalError: err.message,
        stack: handlerError.stack
      });

      res.status(500).json({
        error: 'Internal server error',
        code: 'ERROR_HANDLER_FAILED',
        requestId: 'unknown'
      });
    }
  };

  /**
   * Get error type based on error properties
   */
  getErrorType(err) {
    // Check error name first
    if (err.name && this.errorTypes[err.name]) {
      return err.name;
    }

    // Check error code
    if (err.code && this.errorTypes[err.code]) {
      return err.code;
    }

    // Check message patterns
    if (err.message) {
      if (err.message.includes('database') || err.message.includes('SQL')) {
        return 'DatabaseError';
      }
      if (err.message.includes('validation') || err.message.includes('invalid')) {
        return 'ValidationError';
      }
      if (err.message.includes('authentication') || err.message.includes('unauthorized')) {
        return 'AuthenticationError';
      }
      if (err.message.includes('whatsapp')) {
        return 'WhatsAppError';
      }
      if (err.message.includes('rate limit') || err.message.includes('too many')) {
        return 'RateLimitError';
      }
      if (err.message.includes('not found')) {
        return 'ResourceNotFoundError';
      }
      if (err.message.includes('network') || err.message.includes('ECONN')) {
        return 'NetworkError';
      }
    }

    // Check HTTP status code
    if (err.statusCode) {
      switch (err.statusCode) {
        case 400: return 'ValidationError';
        case 401: return 'AuthenticationError';
        case 403: return 'AuthorizationError';
        case 404: return 'ResourceNotFoundError';
        case 409: return 'ResourceConflictError';
        case 422: return 'BusinessLogicError';
        case 429: return 'RateLimitError';
        case 500: return 'InternalError';
        case 502: return 'ExternalServiceError';
        case 503: return 'ServiceUnavailableError';
        default: return 'UnknownError';
      }
    }

    // Default error type
    return 'UnknownError';
  }

  /**
   * Get default error configuration
   */
  getDefaultErrorConfig() {
    return {
      status: 500,
      code: 'INTERNAL_ERROR',
      logLevel: 'error',
      userMessage: 'Internal server error'
    };
  }

  /**
   * Log error with appropriate context
   */
  logError(err, req, errorConfig, requestId) {
    const context = {
      requestId,
      ip: req.ip,
      method: req.method,
      path: req.path,
      userAgent: req.get('User-Agent'),
      userId: req.user?.id || req.user?.sessionToken || 'anonymous',
      errorType: err.name || 'Unknown',
      errorCode: err.code || 'UNKNOWN',
      errorMessage: err.message,
      statusCode: errorConfig.status,
      timestamp: Date.now()
    };

    // Add stack trace in development
    if (!config.isProduction()) {
      context.stack = err.stack;
    }

    // Log with appropriate level
    switch (errorConfig.logLevel) {
      case 'error':
        logger.error('api_error', context);
        break;
      case 'warn':
        logger.warn('api_warning', context);
        break;
      case 'info':
        logger.info('api_info', context);
        break;
      default:
        logger.error('api_error', context);
    }

    // Send error monitoring event if configured
    this.emitErrorMonitoring(err, context);
  }

  /**
   * Emit error monitoring event
   */
  emitErrorMonitoring(err, context) {
    // In a real implementation, you'd send to error monitoring service
    // For now, we'll just log it
    if (process.env.SENTRY_DSN || process.env.ERROR_MONITORING_ENABLED) {
      logger.error('error_monitoring_event', {
        error: err.message,
        context,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Prepare error response
   */
  prepareErrorResponse(err, errorConfig, requestId) {
    const response = {
      error: errorConfig.userMessage,
      code: errorConfig.code,
      requestId
    };

    // Add validation details if available
    if (err.details && errorConfig.code === 'VALIDATION_ERROR') {
      response.details = err.details;
      response.fields = err.fields || [];
    }

    // Add error details in development
    if (!config.isProduction()) {
      response.debug = {
        errorType: err.name,
        errorMessage: err.message,
        stack: err.stack,
        timestamp: Date.now()
      };
    }

    // Add retry information for retryable errors
    if (this.isRetryableError(errorConfig.code)) {
      response.retry = {
        after: this.getRetryDelay(errorConfig.code),
        maxAttempts: this.getMaxRetryAttempts(errorConfig.code)
      };
    }

    return response;
  }

  /**
   * Check if error is retryable
   */
  isRetryableError(errorCode) {
    const retryableCodes = [
      'DATABASE_ERROR',
      'NETWORK_ERROR',
      'WHATSAPP_ERROR',
      'EXTERNAL_SERVICE_ERROR',
      'SERVICE_UNAVAILABLE_ERROR'
    ];

    return retryableCodes.includes(errorCode);
  }

  /**
   * Get retry delay for error type
   */
  getRetryDelay(errorCode) {
    const delays = {
      'DATABASE_ERROR': 5000,
      'NETWORK_ERROR': 1000,
      'WHATSAPP_ERROR': 2000,
      'EXTERNAL_SERVICE_ERROR': 3000,
      'SERVICE_UNAVAILABLE_ERROR': 5000
    };

    return delays[errorCode] || 1000;
  }

  /**
   * Get max retry attempts for error type
   */
  getMaxRetryAttempts(errorCode) {
    const attempts = {
      'DATABASE_ERROR': 3,
      'NETWORK_ERROR': 5,
      'WHATSAPP_ERROR': 3,
      'EXTERNAL_SERVICE_ERROR': 3,
      'SERVICE_UNAVAILABLE_ERROR': 2
    };

    return attempts[errorCode] || 1;
  }

  /**
   * Generate unique request ID
   */
  generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 404 Not Found handler
   */
  notFound = (req, res) => {
    const requestId = this.generateRequestId();

    logger.info('not_found', {
      requestId,
      ip: req.ip,
      method: req.method,
      path: req.path,
      userAgent: req.get('User-Agent')
    });

    res.status(404).json({
      error: 'Endpoint not found',
      code: 'NOT_FOUND',
      requestId,
      method: req.method,
      path: req.path
    });
  };

  /**
   * Async error wrapper for route handlers
   */
  asyncHandler = (fn) => {
    return (req, res, next) => {
      Promise.resolve(fn(req, res, next)).catch(next);
    };
  };

  /**
   * Create custom error
   */
  createError = (name, message, details = null) => {
    const error = new Error(message);
    error.name = name;
    error.code = name;
    if (details) {
      error.details = details;
    }
    return error;
  };

  /**
   * Create validation error
   */
  createValidationError = (details) => {
    const error = new Error('Validation failed');
    error.name = 'ValidationError';
    error.code = 'VALIDATION_ERROR';
    error.details = details;
    error.fields = details.map(d => d.field);
    return error;
  };

  /**
   * Create authentication error
   */
  createAuthenticationError = (message = 'Authentication required') => {
    const error = new Error(message);
    error.name = 'AuthenticationError';
    error.code = 'AUTHENTICATION_ERROR';
    error.statusCode = 401;
    return error;
  };

  /**
   * Create authorization error
   */
  createAuthorizationError = (message = 'Access denied') => {
    const error = new Error(message);
    error.name = 'AuthorizationError';
    error.code = 'AUTHORIZATION_ERROR';
    error.statusCode = 403;
    return error;
  };

  /**
   * Create not found error
   */
  createNotFoundError = (resource = 'Resource') => {
    const error = new Error(`${resource} not found`);
    error.name = 'ResourceNotFoundError';
    error.code = 'NOT_FOUND';
    error.statusCode = 404;
    return error;
  };

  /**
   * Create rate limit error
   */
  createRateLimitError = (message = 'Rate limit exceeded') => {
    const error = new Error(message);
    error.name = 'RateLimitError';
    error.code = 'RATE_LIMIT_EXCEEDED';
    error.statusCode = 429;
    return error;
  };

  /**
   * Global unhandled exception handler
   */
  setupGlobalHandlers() {
    // Unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('unhandled_promise_rejection', {
        reason: reason?.message || reason,
        stack: reason?.stack,
        promise
      });
    });

    // Uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('uncaught_exception', {
        error: error.message,
        stack: error.stack
      });

      // Give logger time to write before exiting
      setTimeout(() => {
        process.exit(1);
      }, 1000);
    });

    // Warning handlers
    process.on('warning', (warning) => {
      logger.warn('process_warning', {
        message: warning.message,
        stack: warning.stack,
        name: warning.name
      });
    });

    logger.info('global_error_handlers_setup');
  }
}

module.exports = new ErrorHandlerMiddleware();