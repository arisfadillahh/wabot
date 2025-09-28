const EventEmitter = require('events');
const logger = require('../config/logger');
const config = require('../config/config');
const DatabaseManager = require('../config/database');
const WhatsAppService = require('./WhatsAppService');
const WebhookService = require('./WebhookService');
const CacheService = require('./CacheService');

class HealthService extends EventEmitter {
  constructor() {
    super();
    this.checkInterval = config.get('HEALTH_CHECK_INTERVAL');
    this.dbTimeout = config.get('HEALTH_DB_TIMEOUT');
    this.cacheTimeout = config.get('HEALTH_CACHE_TIMEOUT');
    this.whatsappTimeout = config.get('HEALTH_WHATSAPP_TIMEOUT');
    this.healthStatus = {
      overall: 'unknown',
      database: 'unknown',
      whatsapp: 'unknown',
      webhook: 'unknown',
      cache: 'unknown',
      lastCheck: null,
      uptime: 0,
      startTime: Date.now()
    };
    this.isMonitoring = false;

    // Start health monitoring
    this.startMonitoring();
  }

  /**
   * Start health monitoring
   */
  startMonitoring() {
    if (this.isMonitoring) {
      return;
    }

    this.isMonitoring = true;
    this.monitorHealth();

    logger.health('health_monitoring_started', {
      interval: this.checkInterval
    });

    // Run periodic health checks
    setInterval(() => {
      this.monitorHealth();
    }, this.checkInterval);
  }

  /**
   * Stop health monitoring
   */
  stopMonitoring() {
    this.isMonitoring = false;
    logger.health('health_monitoring_stopped');
  }

  /**
   * Monitor all health components
   */
  async monitorHealth() {
    try {
      const startTime = Date.now();

      const checks = await Promise.allSettled([
        this.checkDatabaseHealth(),
        this.checkWhatsAppHealth(),
        this.checkWebhookHealth(),
        this.checkCacheHealth(),
        this.checkSystemHealth()
      ]);

      const results = {
        database: checks[0].status === 'fulfilled' ? checks[0].value : { healthy: false, error: checks[0].reason?.message },
        whatsapp: checks[1].status === 'fulfilled' ? checks[1].value : { healthy: false, error: checks[1].reason?.message },
        webhook: checks[2].status === 'fulfilled' ? checks[2].value : { healthy: false, error: checks[2].reason?.message },
        cache: checks[3].status === 'fulfilled' ? checks[3].value : { healthy: false, error: checks[3].reason?.message },
        system: checks[4].status === 'fulfilled' ? checks[4].value : { healthy: false, error: checks[4].reason?.message }
      };

      // Determine overall health
      const overallHealthy = Object.values(results).every(check => check.healthy);

      this.healthStatus = {
        overall: overallHealthy ? 'healthy' : 'unhealthy',
        ...results,
        lastCheck: Date.now(),
        uptime: Date.now() - this.healthStatus.startTime,
        checkDuration: Date.now() - startTime
      };

      // Log health status changes
      if (this.healthStatus.overall !== this.previousOverallStatus) {
        if (overallHealthy) {
          logger.health('system_healthy', { duration: Date.now() - startTime });
        } else {
          logger.error('system_unhealthy', { results, duration: Date.now() - startTime });
        }
      }

      this.previousOverallStatus = this.healthStatus.overall;

      // Emit health status
      this.emit('health_check', this.healthStatus);

    } catch (error) {
      logger.error('Health monitoring failed', { error: error.message });

      this.healthStatus = {
        overall: 'unhealthy',
        database: { healthy: false, error: 'Health check failed' },
        whatsapp: { healthy: false, error: 'Health check failed' },
        webhook: { healthy: false, error: 'Health check failed' },
        cache: { healthy: false, error: 'Health check failed' },
        system: { healthy: false, error: error.message },
        lastCheck: Date.now(),
        uptime: Date.now() - this.healthStatus.startTime,
        checkDuration: Date.now() - startTime
      };

      this.emit('health_check', this.healthStatus);
    }
  }

  /**
   * Check database health
   */
  async checkDatabaseHealth() {
    try {
      const startTime = Date.now();
      const health = await Promise.race([
        DatabaseManager.healthCheck(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Database health check timeout')), this.dbTimeout)
        )
      ]);

      const duration = Date.now() - startTime;

      logger.health('database_health_check', {
        healthy: health.status === 'healthy',
        duration,
        timestamp: health.timestamp
      });

      return {
        healthy: health.status === 'healthy',
        status: health.status,
        duration,
        timestamp: health.timestamp,
        details: health
      };
    } catch (error) {
      logger.error('Database health check failed', { error: error.message });
      return {
        healthy: false,
        error: error.message,
        timestamp: Date.now()
      };
    }
  }

  /**
   * Check WhatsApp health
   */
  async checkWhatsAppHealth() {
    try {
      const startTime = Date.now();
      const health = await Promise.race([
        WhatsAppService.healthCheck(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('WhatsApp health check timeout')), this.whatsappTimeout)
        )
      ]);

      const duration = Date.now() - startTime;

      logger.health('whatsapp_health_check', {
        healthy: health.healthy,
        duration,
        clientReady: health.status?.isReady,
        reconnectAttempts: health.status?.reconnectAttempts
      });

      return {
        healthy: health.healthy,
        duration,
        clientReady: health.status?.isReady,
        reconnectAttempts: health.status?.reconnectAttempts,
        clientInfo: health.clientInfo,
        status: health.status,
        timestamp: health.timestamp
      };
    } catch (error) {
      logger.error('WhatsApp health check failed', { error: error.message });
      return {
        healthy: false,
        error: error.message,
        timestamp: Date.now()
      };
    }
  }

  /**
   * Check webhook health
   */
  async checkWebhookHealth() {
    try {
      const startTime = Date.now();
      const health = await Promise.race([
        WebhookService.healthCheck(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Webhook health check timeout')), this.dbTimeout)
        )
      ]);

      const duration = Date.now() - startTime;

      logger.health('webhook_health_check', {
        healthy: health.healthy,
        duration,
        webhookConfigured: health.webhookConfigured,
        queueSize: health.queueStatus?.totalSize
      });

      return {
        healthy: health.healthy,
        duration,
        webhookConfigured: health.webhookConfigured,
        webhookUrl: health.webhookUrl,
        stats: health.stats,
        queueStatus: health.queueStatus,
        timestamp: health.timestamp
      };
    } catch (error) {
      logger.error('Webhook health check failed', { error: error.message });
      return {
        healthy: false,
        error: error.message,
        timestamp: Date.now()
      };
    }
  }

  /**
   * Check cache health
   */
  async checkCacheHealth() {
    try {
      const startTime = Date.now();
      const health = await Promise.race([
        CacheService.healthCheck(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Cache health check timeout')), this.cacheTimeout)
        )
      ]);

      const duration = Date.now() - startTime;

      logger.health('cache_health_check', {
        healthy: health.healthy,
        duration,
        cacheSize: health.stats?.size,
        hitRate: health.stats?.hitRate
      });

      return {
        healthy: health.healthy,
        duration,
        stats: health.stats,
        timestamp: health.timestamp
      };
    } catch (error) {
      logger.error('Cache health check failed', { error: error.message });
      return {
        healthy: false,
        error: error.message,
        timestamp: Date.now()
      };
    }
  }

  /**
   * Check system health
   */
  async checkSystemHealth() {
    try {
      const startTime = Date.now();
      const memUsage = process.memoryUsage();
      const uptime = process.uptime();
      const cpuUsage = process.cpuUsage();

      // Check memory usage
      const totalMemory = require('os').totalmem();
      const memoryUsagePercent = (memUsage.heapUsed / totalMemory) * 100;
      const memoryHealthy = memoryUsagePercent < 90; // Less than 90% memory usage

      // Check uptime
      const uptimeHealthy = uptime > 60; // At least 60 seconds uptime

      // Check event loop lag
      const eventLoopLag = await this.measureEventLoopLag();
      const eventLoopHealthy = eventLoopLag < 100; // Less than 100ms lag

      const healthy = memoryHealthy && uptimeHealthy && eventLoopHealthy;

      const duration = Date.now() - startTime;

      logger.health('system_health_check', {
        healthy,
        duration,
        memoryUsagePercent: memoryUsagePercent.toFixed(2),
        uptime,
        eventLoopLag
      });

      return {
        healthy,
        duration,
        memory: {
          usage: memUsage,
          total: totalMemory,
          usagePercent: memoryUsagePercent,
          healthy: memoryHealthy
        },
        uptime: {
          seconds: uptime,
          healthy: uptimeHealthy
        },
        eventLoop: {
          lag: eventLoopLag,
          healthy: eventLoopHealthy
        },
        cpu: {
          user: cpuUsage.user,
          system: cpuUsage.system
        },
        timestamp: Date.now()
      };
    } catch (error) {
      logger.error('System health check failed', { error: error.message });
      return {
        healthy: false,
        error: error.message,
        timestamp: Date.now()
      };
    }
  }

  /**
   * Measure event loop lag
   */
  async measureEventLoopLag() {
    const start = process.hrtime.bigint();

    // Set immediate to test event loop responsiveness
    await new Promise(resolve => setImmediate(resolve));

    const end = process.hrtime.bigint();
    const lag = Number(end - start) / 1000000; // Convert to milliseconds

    return lag;
  }

  /**
   * Get current health status
   */
  getStatus() {
    return {
      ...this.healthStatus,
      uptime: Date.now() - this.healthStatus.startTime,
      monitoring: this.isMonitoring
    };
  }

  /**
   * Get detailed health report
   */
  async getDetailedReport() {
    await this.monitorHealth(); // Refresh health status

    return {
      ...this.healthStatus,
      environment: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        pid: process.pid,
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage()
      },
      config: {
        checkInterval: this.checkInterval,
        dbTimeout: this.dbTimeout,
        cacheTimeout: this.cacheTimeout,
        whatsappTimeout: this.whatsappTimeout
      },
      timestamp: Date.now()
    };
  }

  /**
   * Run specific health check
   */
  async runCheck(checkName) {
    switch (checkName) {
      case 'database':
        return await this.checkDatabaseHealth();
      case 'whatsapp':
        return await this.checkWhatsAppHealth();
      case 'webhook':
        return await this.checkWebhookHealth();
      case 'cache':
        return await this.checkCacheHealth();
      case 'system':
        return await this.checkSystemHealth();
      default:
        throw new Error(`Unknown health check: ${checkName}`);
    }
  }

  /**
   * Get health metrics over time (basic implementation)
   */
  getMetrics(timeRange = 3600000) { // Default 1 hour
    const now = Date.now();
    const startTime = now - timeRange;

    return {
      timeRange,
      startTime,
      endTime: now,
      uptime: now - this.healthStatus.startTime,
      currentStatus: this.healthStatus,
      // In a real implementation, you'd store historical health data
      // For now, we'll return basic metrics
    };
  }

  /**
   * Reset health monitoring
   */
  reset() {
    this.healthStatus = {
      overall: 'unknown',
      database: 'unknown',
      whatsapp: 'unknown',
      webhook: 'unknown',
      cache: 'unknown',
      lastCheck: null,
      uptime: 0,
      startTime: Date.now()
    };

    logger.health('health_monitoring_reset');

    this.emit('reset');
  }
}

module.exports = new HealthService();