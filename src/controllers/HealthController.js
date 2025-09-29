const logger = require('../config/logger');
const HealthService = require('../services/HealthService');
const ErrorHandler = require('../middlewares/errorHandler');

class HealthController {
  constructor() {
    this.healthService = HealthService;
    this.errorHandler = ErrorHandler;
  }

  /**
   * Basic health check
   */
  basicHealth = async (req, res) => {
    try {
      const health = await this.healthService.getBasicHealth();

      res.status(health.healthy ? 200 : 503).json({
        status: health.healthy ? 'healthy' : 'unhealthy',
        timestamp: Date.now(),
        ...health
      });
    } catch (error) {
      this.errorHandler.handle(error, req, res);
    }
  };

  /**
   * Detailed health check
   */
  detailedHealth = async (req, res) => {
    try {
      const { timeout = 5000 } = req.query;
      const validatedTimeout = Math.min(Math.max(parseInt(timeout), 1000), 30000);

      logger.health('detailed_health_check', {
        timeout: validatedTimeout,
        ip: req.ip
      });

      const health = await this.healthService.getDetailedHealth(validatedTimeout);

      res.status(health.overall.healthy ? 200 : 503).json({
        status: health.overall.healthy ? 'healthy' : 'unhealthy',
        timestamp: Date.now(),
        ...health
      });
    } catch (error) {
      this.errorHandler.handle(error, req, res);
    }
  };

  /**
   * Component health check
   */
  componentHealth = async (req, res) => {
    try {
      const { component } = req.params;
      const { timeout = 3000 } = req.query;
      const validatedTimeout = Math.min(Math.max(parseInt(timeout), 1000), 10000);

      logger.health('component_health_check', {
        component,
        timeout: validatedTimeout,
        ip: req.ip
      });

      const health = await this.healthService.checkComponent(component, validatedTimeout);

      if (!health) {
        return res.status(404).json({
          error: 'Component not found',
          code: 'COMPONENT_NOT_FOUND',
          component
        });
      }

      res.status(health.healthy ? 200 : 503).json({
        component,
        status: health.healthy ? 'healthy' : 'unhealthy',
        timestamp: Date.now(),
        ...health
      });
    } catch (error) {
      this.errorHandler.handle(error, req, res);
    }
  };

  /**
   * Get health metrics
   */
  getMetrics = async (req, res) => {
    try {
      const { period = '1h' } = req.query;
      const validPeriods = ['1m', '5m', '15m', '30m', '1h', '6h', '12h', '24h', '7d'];

      if (!validPeriods.includes(period)) {
        throw this.errorHandler.createValidationError([{
          field: 'period',
          message: `period must be one of: ${validPeriods.join(', ')}`
        }]);
      }

      logger.health('get_metrics_request', {
        period,
        ip: req.ip
      });

      const metrics = await this.healthService.getMetrics(period);

      res.json({
        metrics,
        period,
        timestamp: Date.now()
      });
    } catch (error) {
      this.errorHandler.handle(error, req, res);
    }
  };

  /**
   * Get system information
   */
  getSystemInfo = async (req, res) => {
    try {
      logger.health('get_system_info_request', {
        ip: req.ip
      });

      const systemInfo = await this.healthService.getSystemInfo();

      res.json({
        system: systemInfo,
        timestamp: Date.now()
      });
    } catch (error) {
      this.errorHandler.handle(error, req, res);
    }
  };

  /**
   * Get health history
   */
  getHistory = async (req, res) => {
    try {
      const { period = '24h', limit = 100 } = req.query;
      const validatedLimit = Math.min(Math.max(parseInt(limit), 1), 1000);
      const validPeriods = ['1h', '6h', '12h', '24h', '7d', '30d'];

      if (!validPeriods.includes(period)) {
        throw this.errorHandler.createValidationError([{
          field: 'period',
          message: `period must be one of: ${validPeriods.join(', ')}`
        }]);
      }

      logger.health('get_health_history_request', {
        period,
        limit: validatedLimit,
        ip: req.ip
      });

      const history = await this.healthService.getHealthHistory(period, validatedLimit);

      res.json({
        history,
        period,
        count: history.length,
        timestamp: Date.now()
      });
    } catch (error) {
      this.errorHandler.handle(error, req, res);
    }
  };

  /**
   * Trigger health check
   */
  triggerCheck = async (req, res) => {
    try {
      const { components } = req.body;
      const { timeout = 5000 } = req.query;
      const validatedTimeout = Math.min(Math.max(parseInt(timeout), 1000), 30000);

      logger.health('trigger_health_check_request', {
        components,
        timeout: validatedTimeout,
        ip: req.ip
      });

      const results = await this.healthService.triggerHealthCheck(components, validatedTimeout);

      res.json({
        results,
        timestamp: Date.now()
      });
    } catch (error) {
      this.errorHandler.handle(error, req, res);
    }
  };

  /**
   * Clear health cache
   */
  clearCache = async (req, res) => {
    try {
      logger.health('clear_health_cache_request', {
        ip: req.ip
      });

      await this.healthService.clearCache();

      res.json({
        success: true,
        message: 'Health cache cleared successfully',
        timestamp: Date.now()
      });
    } catch (error) {
      this.errorHandler.handle(error, req, res);
    }
  };

  /**
   * Get health alerts
   */
  getAlerts = async (req, res) => {
    try {
      const { status, severity, limit = 50 } = req.query;
      const validatedLimit = Math.min(Math.max(parseInt(limit), 1), 200);

      logger.health('get_health_alerts_request', {
        status,
        severity,
        limit: validatedLimit,
        ip: req.ip
      });

      const alerts = await this.healthService.getAlerts({
        status,
        severity,
        limit: validatedLimit
      });

      res.json({
        alerts,
        count: alerts.length,
        filters: { status, severity },
        timestamp: Date.now()
      });
    } catch (error) {
      this.errorHandler.handle(error, req, res);
    }
  };

  /**
   * Acknowledge health alert
   */
  acknowledgeAlert = async (req, res) => {
    try {
      const { alertId } = req.params;
      const { acknowledgedBy, notes } = req.body;

      logger.health('acknowledge_alert_request', {
        alertId,
        acknowledgedBy,
        hasNotes: !!notes,
        ip: req.ip
      });

      const result = await this.healthService.acknowledgeAlert(alertId, {
        acknowledgedBy,
        notes
      });

      if (!result) {
        throw this.errorHandler.createNotFoundError('Health alert');
      }

      res.json({
        success: true,
        message: 'Health alert acknowledged successfully',
        alert: result,
        timestamp: Date.now()
      });
    } catch (error) {
      this.errorHandler.handle(error, req, res);
    }
  };

  /**
   * Get health dashboard data
   */
  getDashboard = async (req, res) => {
    try {
      logger.health('get_health_dashboard_request', {
        ip: req.ip
      });

      const dashboard = await this.healthService.getDashboardData();

      res.json({
        dashboard,
        timestamp: Date.now()
      });
    } catch (error) {
      this.errorHandler.handle(error, req, res);
    }
  };

  /**
   * Health check for load balancer
   */
  loadBalancerHealth = async (req, res) => {
    try {
      const health = await this.healthService.getLoadBalancerHealth();

      res.status(health.healthy ? 200 : 503).json({
        status: health.healthy ? 'healthy' : 'unhealthy',
        timestamp: Date.now(),
        ...health
      });
    } catch (error) {
      this.errorHandler.handle(error, req, res);
    }
  };

  /**
   * Get dependency health
   */
  getDependencyHealth = async (req, res) => {
    try {
      logger.health('get_dependency_health_request', {
        ip: req.ip
      });

      const dependencies = await this.healthService.getDependencyHealth();

      res.json({
        dependencies,
        timestamp: Date.now()
      });
    } catch (error) {
      this.errorHandler.handle(error, req, res);
    }
  };

  /**
   * Get performance metrics
   */
  getPerformanceMetrics = async (req, res) => {
    try {
      const { period = '1h' } = req.query;
      const validPeriods = ['1m', '5m', '15m', '30m', '1h', '6h', '12h', '24h'];

      if (!validPeriods.includes(period)) {
        throw this.errorHandler.createValidationError([{
          field: 'period',
          message: `period must be one of: ${validPeriods.join(', ')}`
        }]);
      }

      logger.health('get_performance_metrics_request', {
        period,
        ip: req.ip
      });

      const metrics = await this.healthService.getPerformanceMetrics(period);

      res.json({
        metrics,
        period,
        timestamp: Date.now()
      });
    } catch (error) {
      this.errorHandler.handle(error, req, res);
    }
  };

  /**
   * Run diagnostics
   */
  runDiagnostics = async (req, res) => {
    try {
      const { components } = req.body;

      logger.health('run_diagnostics_request', {
        components,
        ip: req.ip
      });

      const diagnostics = await this.healthService.runDiagnostics(components);

      res.json({
        diagnostics,
        timestamp: Date.now()
      });
    } catch (error) {
      this.errorHandler.handle(error, req, res);
    }
  };

  /**
   * Get health configuration
   */
  getConfig = async (req, res) => {
    try {
      logger.health('get_health_config_request', {
        ip: req.ip
      });

      const config = await this.healthService.getConfig();

      res.json({
        config,
        timestamp: Date.now()
      });
    } catch (error) {
      this.errorHandler.handle(error, req, res);
    }
  };

  /**
   * Update health configuration
   */
  updateConfig = async (req, res) => {
    try {
      const { config } = req.body;

      logger.health('update_health_config_request', {
        configKeys: Object.keys(config || {}),
        ip: req.ip
      });

      const updatedConfig = await this.healthService.updateConfig(config);

      res.json({
        success: true,
        message: 'Health configuration updated successfully',
        config: updatedConfig,
        timestamp: Date.now()
      });
    } catch (error) {
      this.errorHandler.handle(error, req, res);
    }
  };
}

module.exports = new HealthController();