const Joi = require('joi');

// Configuration validation schema
const configSchema = Joi.object({
  // Environment
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().integer().min(1).max(65535).default(3000),
  HOST: Joi.string().hostname().default('localhost'),

  // Security
  API_KEY: Joi.string().min(1).required(),
  JWT_SECRET: Joi.string().min(32).required(),
  SESSION_SECRET: Joi.string().min(32).required(),
  CORS_ORIGINS: Joi.string().pattern(/^https?:\/\/([a-zA-Z0-9-]+\.)*[a-zA-Z0-9-]+(:\d+)?(,\s*https?:\/\/([a-zA-Z0-9-]+\.)*[a-zA-Z0-9-]+(:\d+)?)*$/).default('http://localhost:3000'),

  // Frontend
  FRONTEND_URL: Joi.string().uri().default('http://localhost:3000'),

  // Database
  DB_PATH: Joi.string().default('./anakisa.db'),
  DB_POOL_SIZE: Joi.number().integer().min(1).max(20).default(5),
  DB_ACQUIRE_TIMEOUT: Joi.number().integer().min(1000).default(10000),
  DB_IDLE_TIMEOUT: Joi.number().integer().min(1000).default(300000),
  DB_REAP_INTERVAL: Joi.number().integer().min(1000).default(60000),
  DB_MAX_RETRIES: Joi.number().integer().min(0).max(10).default(3),

  // Cache Configuration
  CACHE_CHAT_TTL: Joi.number().integer().min(1000).default(30000),
  CACHE_USER_TTL: Joi.number().integer().min(1000).default(86400000),
  CACHE_ANALYTICS_TTL: Joi.number().integer().min(1000).default(300000),
  CACHE_MAX_SIZE: Joi.number().integer().min(100).default(1000),
  CACHE_CLEANUP_INTERVAL: Joi.number().integer().min(1000).default(300000),

  // Session Configuration
  SESSION_TTL: Joi.number().integer().min(3600000).default(86400000),
  SESSION_MAX_SESSIONS: Joi.number().integer().min(100).default(1000),
  SESSION_CLEANUP_INTERVAL: Joi.number().integer().min(60000).default(3600000),
  SESSION_RENEWAL_WINDOW: Joi.number().integer().min(1800000).default(3600000),

  // WhatsApp Configuration
  WHATSAPP_SESSION_TIMEOUT: Joi.number().integer().min(60000).default(300000),
  WHATSAPP_RECONNECT_ATTEMPTS: Joi.number().integer().min(1).max(10).default(5),
  WHATSAPP_RECONNECT_DELAY: Joi.number().integer().min(1000).default(5000),
  WHATSAPP_MESSAGE_RETRY_ATTEMPTS: Joi.number().integer().min(1).max(10).default(3),

  // WebSocket Configuration
  WS_PING_INTERVAL: Joi.number().integer().min(5000).default(25000),
  WS_PING_TIMEOUT: Joi.number().integer().min(10000).default(60000),
  WS_MAX_CONNECTIONS: Joi.number().integer().min(100).default(1000),
  WS_MESSAGE_QUEUE_SIZE: Joi.number().integer().min(100).default(1000),
  WS_BROADCAST_RATE_LIMIT: Joi.number().integer().min(10).default(100),

  // Rate Limiting
  RATE_LIMIT_WINDOW: Joi.number().integer().min(60000).default(900000),
  RATE_LIMIT_MAX: Joi.number().integer().min(10).default(100),
  RATE_LIMIT_SKIP_SUCCESS: Joi.boolean().default(false),
  RATE_LIMIT_SKIP_FAILED: Joi.boolean().default(false),

  // Logging
  LOG_LEVEL: Joi.string().valid('error', 'warn', 'info', 'debug').default('info'),
  LOG_FORMAT: Joi.string().valid('combined', 'simple', 'json').default('combined'),
  LOG_FILE: Joi.string().default('server.log'),
  LOG_MAX_SIZE: Joi.string().pattern(/^\d+[kmg]$/i).default('10m'),
  LOG_MAX_FILES: Joi.number().integer().min(1).max(100).default(5),
  LOG_DATE_PATTERN: Joi.string().default('YYYY-MM-DD'),

  // Webhook Configuration
  N8N_WEBHOOK_URL: Joi.string().uri().allow('').default(''),
  WEBHOOK_TIMEOUT: Joi.number().integer().min(5000).default(30000),
  WEBHOOK_RETRY_ATTEMPTS: Joi.number().integer().min(1).max(10).default(5),
  WEBHOOK_RETRY_DELAY: Joi.number().integer().min(1000).default(5000),
  WEBHOOK_QUEUE_SIZE: Joi.number().integer().min(10).default(100),

  // AI Configuration
  AI_ENABLED: Joi.boolean().default(false),
  AI_DEFAULT_MODE: Joi.string().valid('hybrid', 'ai', 'human').default('hybrid'),
  AI_CONFIDENCE_THRESHOLD: Joi.number().min(0).max(1).default(0.7),
  AI_MAX_RESPONSE_TIME: Joi.number().integer().min(5000).default(30000),

  // Analytics Configuration
  ANALYTICS_ENABLED: Joi.boolean().default(true),
  ANALYTICS_RETENTION_DAYS: Joi.number().integer().min(1).max(365).default(30),
  ANALYTICS_BATCH_SIZE: Joi.number().integer().min(10).max(1000).default(100),

  // Health Monitoring
  HEALTH_CHECK_INTERVAL: Joi.number().integer().min(10000).default(30000),
  HEALTH_DB_TIMEOUT: Joi.number().integer().min(1000).default(5000),
  HEALTH_CACHE_TIMEOUT: Joi.number().integer().min(1000).default(2000),
  HEALTH_WHATSAPP_TIMEOUT: Joi.number().integer().min(5000).default(10000),

  // Puppeteer Configuration
  PUPPETEER_ARGS: Joi.string().pattern(/^\[.*\]$/).default('["--no-sandbox","--disable-setuid-sandbox","--disable-dev-shm-usage","--disable-accelerated-2d-canvas","--no-first-run","--no-zygote","--disable-gpu"]')
});

class ConfigManager {
  constructor() {
    this.config = null;
    this.isValidated = false;
  }

  /**
   * Load and validate configuration from environment variables
   */
  load() {
    const envConfig = {
      NODE_ENV: process.env.NODE_ENV,
      PORT: parseInt(process.env.PORT) || undefined,
      HOST: process.env.HOST,
      API_KEY: process.env.API_KEY,
      JWT_SECRET: process.env.JWT_SECRET,
      SESSION_SECRET: process.env.SESSION_SECRET,
      CORS_ORIGINS: process.env.CORS_ORIGINS,
      FRONTEND_URL: process.env.FRONTEND_URL,
      DB_PATH: process.env.DB_PATH,
      DB_POOL_SIZE: parseInt(process.env.DB_POOL_SIZE) || undefined,
      DB_ACQUIRE_TIMEOUT: parseInt(process.env.DB_ACQUIRE_TIMEOUT) || undefined,
      DB_IDLE_TIMEOUT: parseInt(process.env.DB_IDLE_TIMEOUT) || undefined,
      DB_REAP_INTERVAL: parseInt(process.env.DB_REAP_INTERVAL) || undefined,
      DB_MAX_RETRIES: parseInt(process.env.DB_MAX_RETRIES) || undefined,
      CACHE_CHAT_TTL: parseInt(process.env.CACHE_CHAT_TTL) || undefined,
      CACHE_USER_TTL: parseInt(process.env.CACHE_USER_TTL) || undefined,
      CACHE_ANALYTICS_TTL: parseInt(process.env.CACHE_ANALYTICS_TTL) || undefined,
      CACHE_MAX_SIZE: parseInt(process.env.CACHE_MAX_SIZE) || undefined,
      CACHE_CLEANUP_INTERVAL: parseInt(process.env.CACHE_CLEANUP_INTERVAL) || undefined,
      SESSION_TTL: parseInt(process.env.SESSION_TTL) || undefined,
      SESSION_MAX_SESSIONS: parseInt(process.env.SESSION_MAX_SESSIONS) || undefined,
      SESSION_CLEANUP_INTERVAL: parseInt(process.env.SESSION_CLEANUP_INTERVAL) || undefined,
      SESSION_RENEWAL_WINDOW: parseInt(process.env.SESSION_RENEWAL_WINDOW) || undefined,
      WHATSAPP_SESSION_TIMEOUT: parseInt(process.env.WHATSAPP_SESSION_TIMEOUT) || undefined,
      WHATSAPP_RECONNECT_ATTEMPTS: parseInt(process.env.WHATSAPP_RECONNECT_ATTEMPTS) || undefined,
      WHATSAPP_RECONNECT_DELAY: parseInt(process.env.WHATSAPP_RECONNECT_DELAY) || undefined,
      WHATSAPP_MESSAGE_RETRY_ATTEMPTS: parseInt(process.env.WHATSAPP_MESSAGE_RETRY_ATTEMPTS) || undefined,
      WS_PING_INTERVAL: parseInt(process.env.WS_PING_INTERVAL) || undefined,
      WS_PING_TIMEOUT: parseInt(process.env.WS_PING_TIMEOUT) || undefined,
      WS_MAX_CONNECTIONS: parseInt(process.env.WS_MAX_CONNECTIONS) || undefined,
      WS_MESSAGE_QUEUE_SIZE: parseInt(process.env.WS_MESSAGE_QUEUE_SIZE) || undefined,
      WS_BROADCAST_RATE_LIMIT: parseInt(process.env.WS_BROADCAST_RATE_LIMIT) || undefined,
      RATE_LIMIT_WINDOW: parseInt(process.env.RATE_LIMIT_WINDOW) || undefined,
      RATE_LIMIT_MAX: parseInt(process.env.RATE_LIMIT_MAX) || undefined,
      RATE_LIMIT_SKIP_SUCCESS: process.env.RATE_LIMIT_SKIP_SUCCESS === 'true',
      RATE_LIMIT_SKIP_FAILED: process.env.RATE_LIMIT_SKIP_FAILED === 'true',
      LOG_LEVEL: process.env.LOG_LEVEL,
      LOG_FORMAT: process.env.LOG_FORMAT,
      LOG_FILE: process.env.LOG_FILE,
      LOG_MAX_SIZE: process.env.LOG_MAX_SIZE,
      LOG_MAX_FILES: parseInt(process.env.LOG_MAX_FILES) || undefined,
      LOG_DATE_PATTERN: process.env.LOG_DATE_PATTERN,
      N8N_WEBHOOK_URL: process.env.N8N_WEBHOOK_URL,
      WEBHOOK_TIMEOUT: parseInt(process.env.WEBHOOK_TIMEOUT) || undefined,
      WEBHOOK_RETRY_ATTEMPTS: parseInt(process.env.WEBHOOK_RETRY_ATTEMPTS) || undefined,
      WEBHOOK_RETRY_DELAY: parseInt(process.env.WEBHOOK_RETRY_DELAY) || undefined,
      WEBHOOK_QUEUE_SIZE: parseInt(process.env.WEBHOOK_QUEUE_SIZE) || undefined,
      AI_ENABLED: process.env.AI_ENABLED === 'true',
      AI_DEFAULT_MODE: process.env.AI_DEFAULT_MODE,
      AI_CONFIDENCE_THRESHOLD: parseFloat(process.env.AI_CONFIDENCE_THRESHOLD) || undefined,
      AI_MAX_RESPONSE_TIME: parseInt(process.env.AI_MAX_RESPONSE_TIME) || undefined,
      ANALYTICS_ENABLED: process.env.ANALYTICS_ENABLED === 'true',
      ANALYTICS_RETENTION_DAYS: parseInt(process.env.ANALYTICS_RETENTION_DAYS) || undefined,
      ANALYTICS_BATCH_SIZE: parseInt(process.env.ANALYTICS_BATCH_SIZE) || undefined,
      HEALTH_CHECK_INTERVAL: parseInt(process.env.HEALTH_CHECK_INTERVAL) || undefined,
      HEALTH_DB_TIMEOUT: parseInt(process.env.HEALTH_DB_TIMEOUT) || undefined,
      HEALTH_CACHE_TIMEOUT: parseInt(process.env.HEALTH_CACHE_TIMEOUT) || undefined,
      HEALTH_WHATSAPP_TIMEOUT: parseInt(process.env.HEALTH_WHATSAPP_TIMEOUT) || undefined,
      PUPPETEER_ARGS: process.env.PUPPETEER_ARGS
    };

    // Remove undefined values
    Object.keys(envConfig).forEach(key => {
      if (envConfig[key] === undefined) {
        delete envConfig[key];
      }
    });

    // Validate configuration
    const { error, value } = configSchema.validate(envConfig, {
      stripUnknown: true,
      convert: true
    });

    if (error) {
      throw new Error(`Configuration validation error: ${error.details[0].message}`);
    }

    // Parse CORS origins
    if (value.CORS_ORIGINS) {
      value.corsOriginsArray = value.CORS_ORIGINS.split(',').map(origin => origin.trim());
    }

    // Parse puppeteer args
    if (value.PUPPETEER_ARGS) {
      try {
        value.puppeteerArgsArray = JSON.parse(value.PUPPETEER_ARGS);
      } catch (e) {
        throw new Error('Invalid PUPPETEER_ARGS format. Must be valid JSON array.');
      }
    }

    this.config = value;
    this.isValidated = true;

    return this.config;
  }

  /**
   * Get configuration value
   */
  get(key) {
    if (!this.isValidated) {
      throw new Error('Configuration not loaded. Call load() first.');
    }
    return this.config[key];
  }

  /**
   * Get all configuration
   */
  getAll() {
    if (!this.isValidated) {
      throw new Error('Configuration not loaded. Call load() first.');
    }
    return { ...this.config };
  }

  /**
   * Check if environment is production
   */
  isProduction() {
    return this.get('NODE_ENV') === 'production';
  }

  /**
   * Check if environment is development
   */
  isDevelopment() {
    return this.get('NODE_ENV') === 'development';
  }

  /**
   * Check if environment is test
   */
  isTest() {
    return this.get('NODE_ENV') === 'test';
  }
}

// Export singleton instance
module.exports = new ConfigManager();