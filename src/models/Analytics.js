const db = require('../config/database');
const logger = require('../config/logger');

class Analytics {
  constructor() {
    this.tableName = 'analytics';
  }

  /**
   * Log analytics event
   */
  async log(type, chatId, isAi = false, data = null) {
    try {
      const result = await db.run(
        `INSERT INTO ${this.tableName} (type, chat_id, is_ai, timestamp, data) VALUES (?, ?, ?, ?, ?)`,
        [type, chatId, isAi ? 1 : 0, Date.now(), data ? JSON.stringify(data) : null]
      );

      logger.analytics('analytics_logged', {
        type,
        chatId,
        isAi,
        timestamp: Date.now(),
        data: data ? JSON.stringify(data).substring(0, 100) + '...' : null
      });

      return result;
    } catch (error) {
      logger.error('Failed to log analytics', { error: error.message, type, chatId });
      throw error;
    }
  }

  /**
   * Get analytics summary
   */
  async getSummary() {
    try {
      const summary = await db.get(`
        SELECT
          COUNT(DISTINCT chat_id) as totalChats,
          COUNT(*) as totalEvents,
          COUNT(CASE WHEN type = 'message' THEN 1 END) as totalMessages,
          COUNT(CASE WHEN type = 'message' AND is_ai = 1 THEN 1 END) as aiProcessed,
          COUNT(CASE WHEN type = 'message' AND is_ai = 0 THEN 1 END) as humanProcessed,
          MIN(timestamp) as earliestEvent,
          MAX(timestamp) as latestEvent
        FROM ${this.tableName}
      `);

      return {
        totalChats: summary.totalChats || 0,
        totalMessages: summary.totalMessages || 0,
        aiProcessed: summary.aiProcessed || 0,
        humanProcessed: summary.humanProcessed || 0,
        earliestEvent: summary.earliestEvent || null,
        latestEvent: summary.latestEvent || null
      };
    } catch (error) {
      logger.error('Failed to get analytics summary', { error: error.message });
      throw error;
    }
  }

  /**
   * Get daily activity for date range
   */
  async getDailyActivity(days = 7) {
    try {
      const activities = [];

      for (let i = days - 1; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const startDate = new Date(date);
        startDate.setHours(0, 0, 0, 0);
        const endDate = new Date(date);
        endDate.setHours(23, 59, 59, 999);

        const activity = await db.get(`
          SELECT
            COUNT(*) as totalCount,
            COUNT(CASE WHEN type = 'message' THEN 1 END) as messageCount,
            COUNT(CASE WHEN type = 'message' AND is_ai = 1 THEN 1 END) as aiCount,
            COUNT(CASE WHEN type = 'message' AND is_ai = 0 THEN 1 END) as humanCount
          FROM ${this.tableName}
          WHERE timestamp BETWEEN ? AND ?
        `, [startDate.getTime(), endDate.getTime()]);

        activities.push({
          date: date.toISOString().split('T')[0],
          total: activity.totalCount || 0,
          messages: activity.messageCount || 0,
          ai: activity.aiCount || 0,
          human: activity.humanCount || 0
        });
      }

      return activities;
    } catch (error) {
      logger.error('Failed to get daily activity', { error: error.message, days });
      throw error;
    }
  }

  /**
   * Get chat analytics
   */
  async getChatAnalytics(chatId, days = 30) {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      startDate.setHours(0, 0, 0, 0);

      const analytics = await db.get(`
        SELECT
          COUNT(*) as totalEvents,
          COUNT(CASE WHEN type = 'message' THEN 1 END) as totalMessages,
          COUNT(CASE WHEN type = 'message' AND is_ai = 1 THEN 1 END) as aiMessages,
          COUNT(CASE WHEN type = 'message' AND is_ai = 0 THEN 1 END) as humanMessages,
          MIN(timestamp) as firstEvent,
          MAX(timestamp) as lastEvent,
          AVG(CASE WHEN type = 'message' THEN timestamp - LAG(timestamp) OVER (ORDER BY timestamp) END) as avgResponseTime
        FROM ${this.tableName}
        WHERE chat_id = ? AND timestamp >= ?
      `, [chatId, startDate.getTime()]);

      // Get hourly distribution
      const hourlyDistribution = await db.all(`
        SELECT
          CAST(strftime('%H', datetime(timestamp/1000, 'unixepoch')) AS INTEGER) as hour,
          COUNT(*) as count
        FROM ${this.tableName}
        WHERE chat_id = ? AND timestamp >= ?
        GROUP BY CAST(strftime('%H', datetime(timestamp/1000, 'unixepoch')) AS INTEGER)
        ORDER BY hour
      `, [chatId, startDate.getTime()]);

      return {
        chatId,
        totalEvents: analytics.totalEvents || 0,
        totalMessages: analytics.totalMessages || 0,
        aiMessages: analytics.aiMessages || 0,
        humanMessages: analytics.humanMessages || 0,
        firstEvent: analytics.firstEvent || null,
        lastEvent: analytics.lastEvent || null,
        avgResponseTime: analytics.avgResponseTime || 0,
        hourlyDistribution: hourlyDistribution || []
      };
    } catch (error) {
      logger.error('Failed to get chat analytics', { error: error.message, chatId, days });
      throw error;
    }
  }

  /**
   * Get top chats by activity
   */
  async getTopChats(limit = 10, days = 30) {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      startDate.setHours(0, 0, 0, 0);

      const topChats = await db.all(`
        SELECT
          chat_id,
          COUNT(*) as totalEvents,
          COUNT(CASE WHEN type = 'message' THEN 1 END) as totalMessages,
          COUNT(CASE WHEN type = 'message' AND is_ai = 1 THEN 1 END) as aiMessages,
          COUNT(CASE WHEN type = 'message' AND is_ai = 0 THEN 1 END) as humanMessages,
          MAX(timestamp) as lastActivity
        FROM ${this.tableName}
        WHERE timestamp >= ?
        GROUP BY chat_id
        ORDER BY totalEvents DESC
        LIMIT ?
      `, [startDate.getTime(), limit]);

      return topChats.map(chat => ({
        chatId: chat.chat_id,
        totalEvents: chat.totalEvents,
        totalMessages: chat.totalMessages,
        aiMessages: chat.aiMessages,
        humanMessages: chat.humanMessages,
        lastActivity: chat.lastActivity
      }));
    } catch (error) {
      logger.error('Failed to get top chats', { error: error.message, limit, days });
      throw error;
    }
  }

  /**
   * Get recent activity
   */
  async getRecentActivity(limit = 50) {
    try {
      const activities = await db.all(`
        SELECT
          id,
          type,
          chat_id as chatId,
          is_ai as isAi,
          timestamp,
          data,
          created_at as createdAt
        FROM ${this.tableName}
        ORDER BY timestamp DESC
        LIMIT ?
      `, [limit]);

      return activities.map(activity => ({
        ...activity,
        isAi: activity.isAi === 1,
        data: activity.data ? JSON.parse(activity.data) : null
      }));
    } catch (error) {
      logger.error('Failed to get recent activity', { error: error.message, limit });
      throw error;
    }
  }

  /**
   * Get message type distribution
   */
  async getMessageTypeDistribution(days = 30) {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      startDate.setHours(0, 0, 0, 0);

      const distribution = await db.all(`
        SELECT
          type,
          COUNT(*) as count,
          COUNT(CASE WHEN is_ai = 1 THEN 1 END) as aiCount,
          COUNT(CASE WHEN is_ai = 0 THEN 1 END) as humanCount
        FROM ${this.tableName}
        WHERE timestamp >= ?
        GROUP BY type
        ORDER BY count DESC
      `, [startDate.getTime()]);

      return distribution;
    } catch (error) {
      logger.error('Failed to get message type distribution', { error: error.message, days });
      throw error;
    }
  }

  /**
   * Cleanup old analytics data
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

      logger.info('Analytics cleanup completed', {
        deletedRows: result.changes,
        retentionDays,
        cutoffDate: cutoffDate.toISOString()
      });

      return result.changes;
    } catch (error) {
      logger.error('Failed to cleanup analytics', { error: error.message, retentionDays });
      throw error;
    }
  }

  /**
   * Export analytics data
   */
  async export(filters = {}) {
    try {
      let query = `
        SELECT
          id,
          type,
          chat_id as chatId,
          is_ai as isAi,
          timestamp,
          data,
          created_at as createdAt
        FROM ${this.tableName}
        WHERE 1=1
      `;

      const params = [];

      if (filters.chatId) {
        query += ' AND chat_id = ?';
        params.push(filters.chatId);
      }

      if (filters.startDate) {
        query += ' AND timestamp >= ?';
        params.push(new Date(filters.startDate).getTime());
      }

      if (filters.endDate) {
        query += ' AND timestamp <= ?';
        params.push(new Date(filters.endDate).getTime());
      }

      if (filters.type) {
        query += ' AND type = ?';
        params.push(filters.type);
      }

      query += ' ORDER BY timestamp DESC';

      if (filters.limit) {
        query += ' LIMIT ?';
        params.push(filters.limit);
      }

      const data = await db.all(query, params);

      return data.map(row => ({
        ...row,
        isAi: row.isAi === 1,
        data: row.data ? JSON.parse(row.data) : null
      }));
    } catch (error) {
      logger.error('Failed to export analytics', { error: error.message, filters });
      throw error;
    }
  }
}

module.exports = new Analytics();