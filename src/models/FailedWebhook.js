const db = require('../config/database');
const logger = require('../config/logger');

class FailedWebhook {
  constructor() {
    this.tableName = 'failed_webhooks';
  }

  /**
   * Log failed webhook
   */
  async log(messageId, payload, error, timestamp = Date.now(), retryCount = 0) {
    try {
      const result = await db.run(
        `INSERT INTO ${this.tableName} (message_id, payload, error, timestamp, retry_count) VALUES (?, ?, ?, ?, ?)`,
        [messageId, JSON.stringify(payload), error.message, timestamp, retryCount]
      );

      logger.webhook('failed_webhook_logged', {
        messageId,
        error: error.message,
        retryCount,
        timestamp
      });

      return result;
    } catch (dbError) {
      logger.error('Failed to log failed webhook', { error: dbError.message, messageId });
      throw dbError;
    }
  }

  /**
   * Get failed webhooks
   */
  async getFailedWebhooks(maxRetryCount = 3, limit = 50) {
    try {
      const webhooks = await db.all(`
        SELECT
          id,
          message_id as messageId,
          payload,
          error,
          timestamp,
          retry_count as retryCount,
          created_at as createdAt
        FROM ${this.tableName}
        WHERE retry_count < ?
        ORDER BY timestamp DESC
        LIMIT ?
      `, [maxRetryCount, limit]);

      return webhooks.map(webhook => ({
        ...webhook,
        payload: JSON.parse(webhook.payload)
      }));
    } catch (error) {
      logger.error('Failed to get failed webhooks', { error: error.message, maxRetryCount, limit });
      throw error;
    }
  }

  /**
   * Get failed webhook by ID
   */
  async getById(id) {
    try {
      const webhook = await db.get(
        `SELECT
          id,
          message_id as messageId,
          payload,
          error,
          timestamp,
          retry_count as retryCount,
          created_at as createdAt
        FROM ${this.tableName}
        WHERE id = ?
      `, [id]);

      if (!webhook) {
        return null;
      }

      return {
        ...webhook,
        payload: JSON.parse(webhook.payload)
      };
    } catch (error) {
      logger.error('Failed to get failed webhook by ID', { error: error.message, id });
      throw error;
    }
  }

  /**
   * Update retry count
   */
  async updateRetryCount(id, retryCount) {
    try {
      const result = await db.run(
        `UPDATE ${this.tableName} SET retry_count = ? WHERE id = ?`,
        [retryCount, id]
      );

      return result.changes > 0;
    } catch (error) {
      logger.error('Failed to update retry count', { error: error.message, id, retryCount });
      throw error;
    }
  }

  /**
   * Delete failed webhook
   */
  async delete(id) {
    try {
      const result = await db.run(
        `DELETE FROM ${this.tableName} WHERE id = ?`,
        [id]
      );

      return result.changes > 0;
    } catch (error) {
      logger.error('Failed to delete failed webhook', { error: error.message, id });
      throw error;
    }
  }

  /**
   * Delete failed webhook by message ID
   */
  async deleteByMessageId(messageId) {
    try {
      const result = await db.run(
        `DELETE FROM ${this.tableName} WHERE message_id = ?`,
        [messageId]
      );

      return result.changes > 0;
    } catch (error) {
      logger.error('Failed to delete failed webhook by message ID', { error: error.message, messageId });
      throw error;
    }
  }

  /**
   * Get failed webhook stats
   */
  async getStats() {
    try {
      const stats = await db.get(`
        SELECT
          COUNT(*) as totalFailed,
          COUNT(CASE WHEN retry_count = 0 THEN 1 END) as neverRetried,
          COUNT(CASE WHEN retry_count >= 3 THEN 1 END) as maxRetriesReached,
          COUNT(CASE WHEN timestamp >= ? THEN 1 END) as failedToday,
          COUNT(CASE WHEN timestamp >= ? THEN 1 END) as failedThisWeek,
          AVG(retry_count) as avgRetryCount,
          MAX(retry_count) as maxRetryCount
        FROM ${this.tableName}
      `, [
        new Date().setHours(0, 0, 0, 0),
        Date.now() - 7 * 24 * 60 * 60 * 1000
      ]);

      return {
        totalFailed: stats.totalFailed || 0,
        neverRetried: stats.neverRetried || 0,
        maxRetriesReached: stats.maxRetriesReached || 0,
        failedToday: stats.failedToday || 0,
        failedThisWeek: stats.failedThisWeek || 0,
        avgRetryCount: stats.avgRetryCount || 0,
        maxRetryCount: stats.maxRetryCount || 0
      };
    } catch (error) {
      logger.error('Failed to get failed webhook stats', { error: error.message });
      throw error;
    }
  }

  /**
   * Get failed webhooks by time range
   */
  async getByTimeRange(startDate, endDate, limit = 100) {
    try {
      const webhooks = await db.all(`
        SELECT
          id,
          message_id as messageId,
          payload,
          error,
          timestamp,
          retry_count as retryCount,
          created_at as createdAt
        FROM ${this.tableName}
        WHERE timestamp BETWEEN ? AND ?
        ORDER BY timestamp DESC
        LIMIT ?
      `, [startDate.getTime(), endDate.getTime(), limit]);

      return webhooks.map(webhook => ({
        ...webhook,
        payload: JSON.parse(webhook.payload)
      }));
    } catch (error) {
      logger.error('Failed to get failed webhooks by time range', { error: error.message, startDate, endDate, limit });
      throw error;
    }
  }

  /**
   * Get failed webhooks by error type
   */
  async getByErrorType(limit = 50) {
    try {
      const errors = await db.all(`
        SELECT
          error,
          COUNT(*) as count,
          AVG(retry_count) as avgRetryCount,
          MAX(timestamp) as lastOccurrence
        FROM ${this.tableName}
        GROUP BY error
        ORDER BY count DESC
        LIMIT ?
      `, [limit]);

      return errors;
    } catch (error) {
      logger.error('Failed to get failed webhooks by error type', { error: error.message, limit });
      throw error;
    }
  }

  /**
   * Cleanup old failed webhooks
   */
  async cleanup(retentionDays = 30) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
      cutoffDate.setHours(23, 59, 59, 999);

      const result = await db.run(
        `DELETE FROM ${this.tableName} WHERE timestamp < ?`,
        [cutoffDate.getTime()]
      );

      logger.info('Failed webhooks cleanup completed', {
        deletedRows: result.changes,
        retentionDays,
        cutoffDate: cutoffDate.toISOString()
      });

      return result.changes;
    } catch (error) {
      logger.error('Failed to cleanup failed webhooks', { error: error.message, retentionDays });
      throw error;
    }
  }

  /**
   * Retry failed webhook
   */
  async retry(id) {
    try {
      const webhook = await this.getById(id);
      if (!webhook) {
        throw new Error('Failed webhook not found');
      }

      // Update retry count before attempting
      await this.updateRetryCount(id, webhook.retryCount + 1);

      logger.webhook('retrying_failed_webhook', {
        id,
        messageId: webhook.messageId,
        retryCount: webhook.retryCount + 1
      });

      // Return webhook data for retry
      return {
        id,
        messageId: webhook.messageId,
        payload: webhook.payload,
        retryCount: webhook.retryCount + 1
      };
    } catch (error) {
      logger.error('Failed to retry webhook', { error: error.message, id });
      throw error;
    }
  }

  /**
   * Bulk retry failed webhooks
   */
  async bulkRetry(limit = 50) {
    try {
      const webhooks = await this.getFailedWebhooks(3, limit);
      const retriedWebhooks = [];

      for (const webhook of webhooks) {
        try {
          const retryData = await this.retry(webhook.id);
          retriedWebhooks.push(retryData);
        } catch (error) {
          logger.error('Failed to retry webhook in bulk operation', { error: error.message, id: webhook.id });
        }
      }

      logger.info('Bulk retry completed', {
        totalWebhooks: webhooks.length,
        successfullyRetried: retriedWebhooks.length
      });

      return retriedWebhooks;
    } catch (error) {
      logger.error('Failed to bulk retry webhooks', { error: error.message, limit });
      throw error;
    }
  }

  /**
   * Export failed webhooks
   */
  async export(filters = {}) {
    try {
      let query = `
        SELECT
          id,
          message_id as messageId,
          payload,
          error,
          timestamp,
          retry_count as retryCount,
          created_at as createdAt
        FROM ${this.tableName}
        WHERE 1=1
      `;

      const params = [];

      if (filters.messageId) {
        query += ' AND message_id = ?';
        params.push(filters.messageId);
      }

      if (filters.startDate) {
        query += ' AND timestamp >= ?';
        params.push(new Date(filters.startDate).getTime());
      }

      if (filters.endDate) {
        query += ' AND timestamp <= ?';
        params.push(new Date(filters.endDate).getTime());
      }

      if (filters.minRetryCount !== undefined) {
        query += ' AND retry_count >= ?';
        params.push(filters.minRetryCount);
      }

      if (filters.maxRetryCount !== undefined) {
        query += ' AND retry_count <= ?';
        params.push(filters.maxRetryCount);
      }

      query += ' ORDER BY timestamp DESC';

      if (filters.limit) {
        query += ' LIMIT ?';
        params.push(filters.limit);
      }

      const data = await db.all(query, params);

      return data.map(row => ({
        ...row,
        payload: JSON.parse(row.payload)
      }));
    } catch (error) {
      logger.error('Failed to export failed webhooks', { error: error.message, filters });
      throw error;
    }
  }
}

module.exports = new FailedWebhook();