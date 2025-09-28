const logger = require('../config/logger');
const FailedWebhook = require('../models/FailedWebhook');
const ErrorHandler = require('../middlewares/errorHandler');

class WebhookController {
  constructor() {
    this.failedWebhookModel = FailedWebhook;
    this.errorHandler = ErrorHandler;
  }

  /**
   * Get failed webhook queue
   */
  getQueue = async (req, res) => {
    try {
      const { page = 1, limit = 50, status, priority } = req.query;
      const validatedLimit = Math.min(Math.max(parseInt(limit), 1), 200);
      const validatedPage = Math.max(parseInt(page), 1);

      logger.webhook('get_queue_request', {
        page: validatedPage,
        limit: validatedLimit,
        status,
        priority,
        ip: req.ip,
        userId: req.user?.id
      });

      const result = await this.failedWebhookModel.getQueue(validatedLimit, validatedPage, {
        status,
        priority: priority ? parseInt(priority) : undefined
      });

      res.json({
        queue: result.queue,
        pagination: {
          page: validatedPage,
          limit: validatedLimit,
          total: result.total,
          totalPages: Math.ceil(result.total / validatedLimit),
          hasMore: validatedPage * validatedLimit < result.total
        },
        filters: { status, priority },
        timestamp: Date.now()
      });
    } catch (error) {
      this.errorHandler.handle(error, req, res);
    }
  };

  /**
   * Get failed webhook by ID
   */
  getFailedWebhook = async (req, res) => {
    try {
      const { id } = req.params;

      logger.webhook('get_failed_webhook_request', {
        id,
        ip: req.ip,
        userId: req.user?.id
      });

      const failedWebhook = await this.failedWebhookModel.getById(id);

      if (!failedWebhook) {
        throw this.errorHandler.createNotFoundError('Failed webhook');
      }

      res.json({
        failedWebhook,
        timestamp: Date.now()
      });
    } catch (error) {
      this.errorHandler.handle(error, req, res);
    }
  };

  /**
   * Retry failed webhook
   */
  retryWebhook = async (req, res) => {
    try {
      const { id } = req.params;

      logger.webhook('retry_webhook_request', {
        id,
        ip: req.ip,
        userId: req.user?.id
      });

      const result = await this.failedWebhookModel.retryWebhook(id);

      if (!result) {
        throw this.errorHandler.createNotFoundError('Failed webhook');
      }

      res.json({
        success: true,
        message: 'Webhook retry initiated',
        result,
        timestamp: Date.now()
      });
    } catch (error) {
      this.errorHandler.handle(error, req, res);
    }
  };

  /**
   * Bulk retry failed webhooks
   */
  bulkRetryWebhooks = async (req, res) => {
    try {
      const { ids, priority } = req.body;

      if (!Array.isArray(ids) || ids.length === 0) {
        throw this.errorHandler.createValidationError([{
          field: 'ids',
          message: 'ids must be a non-empty array'
        }]);
      }

      logger.webhook('bulk_retry_webhooks_request', {
        count: ids.length,
        priority,
        ip: req.ip,
        userId: req.user?.id
      });

      const results = await this.failedWebhookModel.bulkRetryWebhooks(ids, priority);

      res.json({
        success: true,
        message: `Bulk retry initiated for ${results.length} webhooks`,
        results,
        count: results.length,
        timestamp: Date.now()
      });
    } catch (error) {
      this.errorHandler.handle(error, req, res);
    }
  };

  /**
   * Retry all failed webhooks
   */
  retryAllWebhooks = async (req, res) => {
    try {
      const { priority } = req.body;

      logger.webhook('retry_all_webhooks_request', {
        priority,
        ip: req.ip,
        userId: req.user?.id
      });

      const count = await this.failedWebhookModel.retryAllWebhooks(priority);

      res.json({
        success: true,
        message: `Retry initiated for ${count} webhooks`,
        count,
        timestamp: Date.now()
      });
    } catch (error) {
      this.errorHandler.handle(error, req, res);
    }
  };

  /**
   * Delete failed webhook
   */
  deleteFailedWebhook = async (req, res) => {
    try {
      const { id } = req.params;

      logger.webhook('delete_failed_webhook_request', {
        id,
        ip: req.ip,
        userId: req.user?.id
      });

      const deleted = await this.failedWebhookModel.delete(id);

      if (!deleted) {
        throw this.errorHandler.createNotFoundError('Failed webhook');
      }

      res.json({
        success: true,
        message: 'Failed webhook deleted successfully',
        timestamp: Date.now()
      });
    } catch (error) {
      this.errorHandler.handle(error, req, res);
    }
  };

  /**
   * Bulk delete failed webhooks
   */
  bulkDeleteWebhooks = async (req, res) => {
    try {
      const { ids } = req.body;

      if (!Array.isArray(ids) || ids.length === 0) {
        throw this.errorHandler.createValidationError([{
          field: 'ids',
          message: 'ids must be a non-empty array'
        }]);
      }

      logger.webhook('bulk_delete_webhooks_request', {
        count: ids.length,
        ip: req.ip,
        userId: req.user?.id
      });

      const deletedCount = await this.failedWebhookModel.bulkDelete(ids);

      res.json({
        success: true,
        message: `${deletedCount} failed webhooks deleted`,
        deletedCount,
        timestamp: Date.now()
      });
    } catch (error) {
      this.errorHandler.handle(error, req, res);
    }
  };

  /**
   * Clear failed webhook queue
   */
  clearQueue = async (req, res) => {
    try {
      logger.webhook('clear_queue_request', {
        ip: req.ip,
        userId: req.user?.id
      });

      const clearedCount = await this.failedWebhookModel.clearQueue();

      res.json({
        success: true,
        message: `Queue cleared. ${clearedCount} failed webhooks removed`,
        clearedCount,
        timestamp: Date.now()
      });
    } catch (error) {
      this.errorHandler.handle(error, req, res);
    }
  };

  /**
   * Get webhook statistics
   */
  getStats = async (req, res) => {
    try {
      const { days = 30 } = req.query;
      const validatedDays = Math.min(Math.max(parseInt(days), 1), 365);

      logger.webhook('get_stats_request', {
        days: validatedDays,
        ip: req.ip,
        userId: req.user?.id
      });

      const stats = await this.failedWebhookModel.getStats(validatedDays);

      res.json({
        stats,
        filters: { days: validatedDays },
        timestamp: Date.now()
      });
    } catch (error) {
      this.errorHandler.handle(error, req, res);
    }
  };

  /**
   * Get webhook queue status
   */
  getQueueStatus = async (req, res) => {
    try {
      logger.webhook('get_queue_status_request', {
        ip: req.ip,
        userId: req.user?.id
      });

      const status = await this.failedWebhookModel.getQueueStatus();

      res.json({
        status,
        timestamp: Date.now()
      });
    } catch (error) {
      this.errorHandler.handle(error, req, res);
    }
  };

  /**
   * Process webhook queue manually
   */
  processQueue = async (req, res) => {
    try {
      const { batchSize = 10, priority } = req.body;
      const validatedBatchSize = Math.min(Math.max(parseInt(batchSize), 1), 100);

      logger.webhook('process_queue_request', {
        batchSize: validatedBatchSize,
        priority,
        ip: req.ip,
        userId: req.user?.id
      });

      const results = await this.failedWebhookModel.processQueue(validatedBatchSize, priority);

      res.json({
        success: true,
        message: `Queue processed. ${results.processed} webhooks handled`,
        results,
        timestamp: Date.now()
      });
    } catch (error) {
      this.errorHandler.handle(error, req, res);
    }
  };

  /**
   * Update failed webhook priority
   */
  updatePriority = async (req, res) => {
    try {
      const { id } = req.params;
      const { priority } = req.body;

      if (priority === undefined || priority < 1 || priority > 10) {
        throw this.errorHandler.createValidationError([{
          field: 'priority',
          message: 'priority must be between 1 and 10'
        }]);
      }

      logger.webhook('update_priority_request', {
        id,
        priority,
        ip: req.ip,
        userId: req.user?.id
      });

      const updated = await this.failedWebhookModel.updatePriority(id, priority);

      if (!updated) {
        throw this.errorHandler.createNotFoundError('Failed webhook');
      }

      res.json({
        success: true,
        message: 'Priority updated successfully',
        timestamp: Date.now()
      });
    } catch (error) {
      this.errorHandler.handle(error, req, res);
    }
  };

  /**
   * Get webhook retry history
   */
  getRetryHistory = async (req, res) => {
    try {
      const { id } = req.params;

      logger.webhook('get_retry_history_request', {
        id,
        ip: req.ip,
        userId: req.user?.id
      });

      const history = await this.failedWebhookModel.getRetryHistory(id);

      if (!history) {
        throw this.errorHandler.createNotFoundError('Failed webhook');
      }

      res.json({
        history,
        timestamp: Date.now()
      });
    } catch (error) {
      this.errorHandler.handle(error, req, res);
    }
  };

  /**
   * Export failed webhook data
   */
  exportWebhooks = async (req, res) => {
    try {
      const {
        format = 'json',
        status,
        startDate,
        endDate,
        includeHistory = false
      } = req.query;

      logger.webhook('export_webhooks_request', {
        format,
        status,
        startDate,
        endDate,
        includeHistory,
        ip: req.ip,
        userId: req.user?.id
      });

      const exportData = await this.failedWebhookModel.exportWebhooks({
        format,
        status,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        includeHistory: includeHistory === 'true'
      });

      const filename = `failed_webhooks_${new Date().toISOString().split('T')[0]}.${format}`;
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
            filters: { status, startDate, endDate, includeHistory }
          }
        });
      }
    } catch (error) {
      this.errorHandler.handle(error, req, res);
    }
  };

  /**
   * Clean up old failed webhooks
   */
  cleanupOldWebhooks = async (req, res) => {
    try {
      const { days = 30 } = req.body;
      const validatedDays = Math.min(Math.max(parseInt(days), 1), 365);

      logger.webhook('cleanup_old_webhooks_request', {
        days: validatedDays,
        ip: req.ip,
        userId: req.user?.id
      });

      const cleanedCount = await this.failedWebhookModel.cleanupOldWebhooks(validatedDays);

      res.json({
        success: true,
        message: `${cleanedCount} old failed webhooks cleaned up`,
        cleanedCount,
        days: validatedDays,
        timestamp: Date.now()
      });
    } catch (error) {
      this.errorHandler.handle(error, req, res);
    }
  };

  /**
   * Test webhook endpoint
   */
  testWebhook = async (req, res) => {
    try {
      const { url, method = 'POST', headers, body, timeout = 5000 } = req.body;

      logger.webhook('test_webhook_request', {
        url,
        method,
        hasHeaders: !!headers,
        hasBody: !!body,
        timeout,
        ip: req.ip,
        userId: req.user?.id
      });

      const result = await this.failedWebhookModel.testWebhook({
        url,
        method,
        headers,
        body,
        timeout: parseInt(timeout)
      });

      res.json({
        success: true,
        message: 'Webhook test completed',
        result,
        timestamp: Date.now()
      });
    } catch (error) {
      this.errorHandler.handle(error, req, res);
    }
  };

  /**
   * Get webhook performance metrics
   */
  getPerformanceMetrics = async (req, res) => {
    try {
      const { days = 7 } = req.query;
      const validatedDays = Math.min(Math.max(parseInt(days), 1), 90);

      logger.webhook('get_performance_metrics_request', {
        days: validatedDays,
        ip: req.ip,
        userId: req.user?.id
      });

      const metrics = await this.failedWebhookModel.getPerformanceMetrics(validatedDays);

      res.json({
        metrics,
        filters: { days: validatedDays },
        timestamp: Date.now()
      });
    } catch (error) {
      this.errorHandler.handle(error, req, res);
    }
  };
}

module.exports = new WebhookController();