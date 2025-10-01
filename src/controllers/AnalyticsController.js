const logger = require('../config/logger');
const Analytics = require('../models/Analytics');
const Message = require('../models/Message');
const ErrorHandler = require('../middlewares/errorHandler');

class AnalyticsController {
  constructor() {
    this.analyticsModel = Analytics;
    this.messageModel = Message;
    this.errorHandler = ErrorHandler;
  }

  /**
   * Get comprehensive analytics overview
   */
  getOverview = async (req, res) => {
    try {
      const { days = 30 } = req.query;
      const validatedDays = Math.min(Math.max(parseInt(days), 1), 365);

      logger.analytics('overview_request', {
        days: validatedDays,
        ip: req.ip,
        userId: req.user?.id
      });

      const overview = await this.analyticsModel.getOverview(validatedDays);

      res.json({
        overview,
        filters: { days: validatedDays },
        timestamp: Date.now()
      });
    } catch (error) {
      this.errorHandler.handle(error, req, res);
    }
  };

  /**
   * Get message statistics
   */
  getMessageStats = async (req, res) => {
    try {
      const { days = 30, chatId } = req.query;
      const validatedDays = Math.min(Math.max(parseInt(days), 1), 365);

      logger.analytics('message_stats_request', {
        days: validatedDays,
        chatId,
        ip: req.ip,
        userId: req.user?.id
      });

      const stats = await this.analyticsModel.getMessageStats(validatedDays, chatId);

      res.json({
        stats,
        filters: { days: validatedDays, chatId },
        timestamp: Date.now()
      });
    } catch (error) {
      this.errorHandler.handle(error, req, res);
    }
  };

  /**
   * Get daily activity data
   */
  getDailyActivity = async (req, res) => {
    try {
      const { days = 7 } = req.query;
      const validatedDays = Math.min(Math.max(parseInt(days), 1), 90);

      logger.analytics('daily_activity_request', {
        days: validatedDays,
        ip: req.ip,
        userId: req.user?.id
      });

      const activity = await this.analyticsModel.getDailyActivity(validatedDays);

      res.json({
        activity,
        filters: { days: validatedDays },
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
      const { days = 30 } = req.query;
      const validatedDays = Math.min(Math.max(parseInt(days), 1), 365);

      logger.analytics('performance_metrics_request', {
        days: validatedDays,
        ip: req.ip,
        userId: req.user?.id
      });

      const metrics = await this.analyticsModel.getPerformanceMetrics(validatedDays);

      res.json({
        metrics,
        filters: { days: validatedDays },
        timestamp: Date.now()
      });
    } catch (error) {
      this.errorHandler.handle(error, req, res);
    }
  };

  /**
   * Get top contacts by message count
   */
  getTopContacts = async (req, res) => {
    try {
      const { limit = 10, days = 30 } = req.query;
      const validatedLimit = Math.min(Math.max(parseInt(limit), 1), 100);
      const validatedDays = Math.min(Math.max(parseInt(days), 1), 365);

      logger.analytics('top_contacts_request', {
        limit: validatedLimit,
        days: validatedDays,
        ip: req.ip,
        userId: req.user?.id
      });

      const contacts = await this.analyticsModel.getTopContacts(validatedLimit, validatedDays);

      res.json({
        contacts,
        filters: { limit: validatedLimit, days: validatedDays },
        timestamp: Date.now()
      });
    } catch (error) {
      this.errorHandler.handle(error, req, res);
    }
  };

  /**
   * Get message type distribution
   */
  getMessageTypeDistribution = async (req, res) => {
    try {
      const { days = 30, chatId } = req.query;
      const validatedDays = Math.min(Math.max(parseInt(days), 1), 365);

      logger.analytics('message_type_distribution_request', {
        days: validatedDays,
        chatId,
        ip: req.ip,
        userId: req.user?.id
      });

      const distribution = await this.analyticsModel.getMessageTypeDistribution(validatedDays, chatId);

      res.json({
        distribution,
        filters: { days: validatedDays, chatId },
        timestamp: Date.now()
      });
    } catch (error) {
      this.errorHandler.handle(error, req, res);
    }
  };

  /**
   * Get hourly message patterns
   */
  getHourlyPatterns = async (req, res) => {
    try {
      const { days = 7, chatId } = req.query;
      const validatedDays = Math.min(Math.max(parseInt(days), 1), 90);

      logger.analytics('hourly_patterns_request', {
        days: validatedDays,
        chatId,
        ip: req.ip,
        userId: req.user?.id
      });

      const patterns = await this.analyticsModel.getHourlyPatterns(validatedDays, chatId);

      res.json({
        patterns,
        filters: { days: validatedDays, chatId },
        timestamp: Date.now()
      });
    } catch (error) {
      this.errorHandler.handle(error, req, res);
    }
  };

  /**
   * Get peak hours analysis
   */
  getPeakHours = async (req, res) => {
    try {
      const { days = 7 } = req.query;
      const validatedDays = Math.min(Math.max(parseInt(days), 1), 90);

      logger.analytics('peak_hours_request', {
        days: validatedDays,
        ip: req.ip,
        userId: req.user?.id
      });

      const peakHours = await this.analyticsModel.getPeakHours(validatedDays);

      res.json({
        peakHours,
        filters: { days: validatedDays },
        timestamp: Date.now()
      });
    } catch (error) {
      this.errorHandler.handle(error, req, res);
    }
  };

  /**
   * Get webhook performance metrics
   */
  getWebhookMetrics = async (req, res) => {
    try {
      const { days = 30 } = req.query;
      const validatedDays = Math.min(Math.max(parseInt(days), 1), 365);

      logger.analytics('webhook_metrics_request', {
        days: validatedDays,
        ip: req.ip,
        userId: req.user?.id
      });

      const metrics = await this.analyticsModel.getWebhookMetrics(validatedDays);

      res.json({
        metrics,
        filters: { days: validatedDays },
        timestamp: Date.now()
      });
    } catch (error) {
      this.errorHandler.handle(error, req, res);
    }
  };

  /**
   * Get system health metrics
   */
  getSystemHealth = async (req, res) => {
    try {
      logger.analytics('system_health_request', {
        ip: req.ip,
        userId: req.user?.id
      });

      const health = await this.analyticsModel.getSystemHealth();

      res.json({
        health,
        timestamp: Date.now()
      });
    } catch (error) {
      this.errorHandler.handle(error, req, res);
    }
  };

  /**
   * Get custom analytics report
   */
  getCustomReport = async (req, res) => {
    try {
      const {
        startDate,
        endDate,
        chatId,
        messageType,
        groupBy = 'day',
        metrics = ['count', 'sent', 'received', 'failed']
      } = req.body;

      logger.analytics('custom_report_request', {
        startDate,
        endDate,
        chatId,
        messageType,
        groupBy,
        metrics,
        ip: req.ip,
        userId: req.user?.id
      });

      const report = await this.analyticsModel.getCustomReport({
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        chatId,
        messageType,
        groupBy,
        metrics
      });

      res.json({
        report,
        filters: {
          startDate,
          endDate,
          chatId,
          messageType,
          groupBy,
          metrics
        },
        timestamp: Date.now()
      });
    } catch (error) {
      this.errorHandler.handle(error, req, res);
    }
  };

  /**
   * Export analytics data
   */
  exportAnalytics = async (req, res) => {
    try {
      const {
        format = 'json',
        startDate,
        endDate,
        chatId,
        includeCharts = false,
        metrics = ['all']
      } = req.query;

      logger.analytics('export_analytics_request', {
        format,
        startDate,
        endDate,
        chatId,
        includeCharts,
        metrics,
        ip: req.ip,
        userId: req.user?.id
      });

      const exportData = await this.analyticsModel.exportAnalytics({
        format,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        chatId,
        includeCharts: includeCharts === 'true',
        metrics
      });

      // Set appropriate headers for download
      const filename = `analytics_${new Date().toISOString().split('T')[0]}.${format}`;
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      if (format === 'csv') {
        res.setHeader('Content-Type', 'text/csv');
        res.send(exportData);
      } else {
        res.json({
          data: exportData,
          metadata: {
            filename,
            format,
            generatedAt: Date.now(),
            filters: { startDate, endDate, chatId, includeCharts, metrics }
          }
        });
      }
    } catch (error) {
      this.errorHandler.handle(error, req, res);
    }
  };

  /**
   * Get analytics dashboard data (combined view)
   */
  getDashboardData = async (req, res) => {
    try {
      const { days = 7 } = req.query;
      const validatedDays = Math.min(Math.max(parseInt(days), 1), 30);

      logger.analytics('dashboard_data_request', {
        days: validatedDays,
        ip: req.ip,
        userId: req.user?.id
      });

      // Get multiple analytics data in parallel
      const [overview, dailyActivity, topContacts, messageTypes] = await Promise.all([
        this.analyticsModel.getOverview(validatedDays),
        this.analyticsModel.getDailyActivity(validatedDays),
        this.analyticsModel.getTopContacts(5, validatedDays),
        this.analyticsModel.getMessageTypeDistribution(validatedDays)
      ]);

      const dashboardData = {
        overview,
        dailyActivity,
        topContacts,
        messageTypes,
        summary: {
          totalMessages: overview.totalMessages || 0,
          successRate: overview.successRate || 0,
          avgResponseTime: overview.avgResponseTime || 0,
          activeContacts: overview.activeContacts || 0
        }
      };

      res.json({
        dashboard: dashboardData,
        filters: { days: validatedDays },
        timestamp: Date.now()
      });
    } catch (error) {
      this.errorHandler.handle(error, req, res);
    }
  };

  /**
   * Clear analytics cache
   */
  clearCache = async (req, res) => {
    try {
      logger.analytics('clear_cache_request', {
        ip: req.ip,
        userId: req.user?.id
      });

      await this.analyticsModel.clearCache();

      res.json({
        success: true,
        message: 'Analytics cache cleared successfully',
        timestamp: Date.now()
      });
    } catch (error) {
      this.errorHandler.handle(error, req, res);
    }
  };
}

module.exports = new AnalyticsController();