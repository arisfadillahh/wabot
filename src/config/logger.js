const winston = require('winston');
const path = require('path');
const fs = require('fs');
const config = require('./config');

class Logger {
  constructor() {
    this.logger = null;
    this.isInitialized = false;
  }

  /**
   * Initialize logger
   */
  initialize() {
    if (this.isInitialized) {
      return this.logger;
    }

    // Ensure log directory exists
    const logDir = path.dirname(config.get('LOG_FILE'));
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    // Define log levels
    const levels = {
      error: 0,
      warn: 1,
      info: 2,
      http: 3,
      debug: 4,
    };

    // Define colors for each level
    const colors = {
      error: 'red',
      warn: 'yellow',
      info: 'green',
      http: 'magenta',
      debug: 'white',
    };

    // Add colors to winston
    winston.addColors(colors);

    // Define which level to show based on environment
    const level = () => {
      const env = config.get('NODE_ENV');
      const logLevel = config.get('LOG_LEVEL');

      if (env === 'development') {
        return 'debug';
      }

      return logLevel;
    };

    // Define different formats for different transports
    const consoleFormat = winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
      winston.format.colorize({ all: true }),
      winston.format.printf(
        (info) => `${info.timestamp} ${info.level}: ${info.message}`,
      ),
    );

    const fileFormat = winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
      winston.format.errors({ stack: true }),
      winston.format.json(),
    );

    // Define transports
    const transports = [
      // Console transport
      new winston.transports.Console({
        format: consoleFormat,
        level: level(),
      }),

      // File transport for all logs
      new winston.transports.File({
        filename: config.get('LOG_FILE'),
        format: fileFormat,
        maxsize: this.parseSize(config.get('LOG_MAX_SIZE')),
        maxFiles: config.get('LOG_MAX_FILES'),
        tailable: true,
      }),

      // File transport for error logs only
      new winston.transports.File({
        filename: path.join(logDir, 'error.log'),
        level: 'error',
        format: fileFormat,
        maxsize: this.parseSize(config.get('LOG_MAX_SIZE')),
        maxFiles: config.get('LOG_MAX_FILES'),
        tailable: true,
      }),
    ];

    // Create logger instance
    this.logger = winston.createLogger({
      level: level(),
      levels,
      format: fileFormat,
      transports,
      exitOnError: false,
    });

    // Handle uncaught exceptions
    this.logger.exceptions.handle(
      new winston.transports.File({
        filename: path.join(logDir, 'exceptions.log'),
        maxsize: this.parseSize(config.get('LOG_MAX_SIZE')),
        maxFiles: config.get('LOG_MAX_FILES'),
        tailable: true,
      }),
    );

    // Handle unhandled promise rejections
    this.logger.rejections.handle(
      new winston.transports.File({
        filename: path.join(logDir, 'rejections.log'),
        maxsize: this.parseSize(config.get('LOG_MAX_SIZE')),
        maxFiles: config.get('LOG_MAX_FILES'),
        tailable: true,
      }),
    );

    this.isInitialized = true;
    return this.logger;
  }

  /**
   * Parse size string (e.g., '10m') to bytes
   */
  parseSize(size) {
    const units = { k: 1024, m: 1024 * 1024, g: 1024 * 1024 * 1024 };
    const match = size.toString().toLowerCase().match(/^(\d+)([kmg]?)$/);

    if (!match) {
      return 10 * 1024 * 1024; // Default to 10MB
    }

    const value = parseInt(match[1]);
    const unit = match[2] || '';

    return value * (units[unit] || 1);
  }

  /**
   * Create child logger with context
   */
  child(context) {
    if (!this.isInitialized) {
      this.initialize();
    }

    return this.logger.child(context);
  }

  /**
   * Log error with context
   */
  error(message, context = {}) {
    if (!this.isInitialized) {
      this.initialize();
    }

    this.logger.error(message, context);
  }

  /**
   * Log warning with context
   */
  warn(message, context = {}) {
    if (!this.isInitialized) {
      this.initialize();
    }

    this.logger.warn(message, context);
  }

  /**
   * Log info with context
   */
  info(message, context = {}) {
    if (!this.isInitialized) {
      this.initialize();
    }

    this.logger.info(message, context);
  }

  /**
   * Log debug with context
   */
  debug(message, context = {}) {
    if (!this.isInitialized) {
      this.initialize();
    }

    this.logger.debug(message, context);
  }

  /**
   * Log HTTP request
   */
  http(req, res, responseTime) {
    if (!this.isInitialized) {
      this.initialize();
    }

    const context = {
      method: req.method,
      url: req.url,
      status: res.statusCode,
      responseTime: `${responseTime}ms`,
      userAgent: req.get('User-Agent'),
      ip: req.ip,
      userId: req.user?.id,
    };

    this.logger.http(`${req.method} ${req.url}`, context);
  }

  /**
   * Log WebSocket event
   */
  websocket(event, socketId, context = {}) {
    if (!this.isInitialized) {
      this.initialize();
    }

    const fullContext = {
      event,
      socketId,
      ...context,
    };

    this.logger.info(`WebSocket ${event}`, fullContext);
  }

  /**
   * Log database operation
   */
  database(operation, table, context = {}) {
    if (!this.isInitialized) {
      this.initialize();
    }

    const fullContext = {
      operation,
      table,
      ...context,
    };

    this.logger.debug(`Database ${operation}`, fullContext);
  }

  /**
   * Log webhook operation
   */
  webhook(operation, messageId, context = {}) {
    if (!this.isInitialized) {
      this.initialize();
    }

    const fullContext = {
      operation,
      messageId,
      ...context,
    };

    this.logger.info(`Webhook ${operation}`, fullContext);
  }

  /**
   * Log WhatsApp operation
   */
  whatsapp(operation, context = {}) {
    if (!this.isInitialized) {
      this.initialize();
    }

    const fullContext = {
      operation,
      ...context,
    };

    this.logger.info(`WhatsApp ${operation}`, fullContext);
  }

  /**
   * Log security event
   */
  security(event, context = {}) {
    if (!this.isInitialized) {
      this.initialize();
    }

    const fullContext = {
      event,
      ...context,
    };

    this.logger.warn(`Security ${event}`, fullContext);
  }

  /**
   * Log performance metric
   */
  performance(metric, value, unit = 'ms', context = {}) {
    if (!this.isInitialized) {
      this.initialize();
    }

    const fullContext = {
      metric,
      value,
      unit,
      ...context,
    };

    this.logger.info(`Performance: ${metric}`, fullContext);
  }

  /**
   * Log analytics event
   */
  analytics(event, context = {}) {
    if (!this.isInitialized) {
      this.initialize();
    }

    const fullContext = {
      event,
      ...context,
    };

    this.logger.debug(`Analytics: ${event}`, fullContext);
  }
}

// Export singleton instance
module.exports = new Logger();