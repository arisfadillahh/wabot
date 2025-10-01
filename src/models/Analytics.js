const db = require('../config/database');
const logger = require('../config/logger');

class Analytics {
  constructor() {
    this.tableName = 'analytics';
  }

  /**
   * Log message event with proper direction and type
   */
  async logMessage(chatId, direction, senderType, data = null) {
    try {
      const result = await db.run(
        `INSERT INTO ${this.tableName} (type, chat_id, is_ai, timestamp, data) VALUES (?, ?, ?, ?, ?)`,
        ['message', chatId, senderType === 'ai' ? 1 : 0, Date.now(), data ? JSON.stringify(data) : null]
      );

      logger.analytics('message_logged', {
        type: 'message',
        chatId,
        direction,
        senderType,
        timestamp: Date.now(),
        data: data ? JSON.stringify(data).substring(0, 100) + '...' : null
      });

      return result;
    } catch (error) {
      logger.error('Failed to log message analytics', { error: error.message, chatId, direction, senderType });
      throw error;
    }
  }

  /**
   * Log analytics event (legacy method for compatibility)
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
   * Get analytics summary from actual messages
   */
  async getSummary() {
    try {
      // Get message statistics from the messages table
      const messageStats = await db.get(`
        SELECT
          COUNT(DISTINCT chat_id) as totalChats,
          COUNT(*) as totalMessages,
          COUNT(CASE WHEN direction = 'incoming' THEN 1 END) as incomingMessages,
          COUNT(CASE WHEN direction = 'outgoing' THEN 1 END) as outgoingMessages,
          COUNT(CASE WHEN direction = 'outgoing' AND sender_type = 'ai' THEN 1 END) as aiResponses,
          COUNT(CASE WHEN direction = 'outgoing' AND sender_type = 'human' THEN 1 END) as humanResponses,
          MIN(timestamp) as earliestMessage,
          MAX(timestamp) as latestMessage
        FROM messages
      `);

      return {
        totalChats: messageStats.totalChats || 0,
        totalMessages: messageStats.totalMessages || 0,
        incomingMessages: messageStats.incomingMessages || 0,
        outgoingMessages: messageStats.outgoingMessages || 0,
        aiResponses: messageStats.aiResponses || 0,
        humanResponses: messageStats.humanResponses || 0,
        aiProcessed: messageStats.aiResponses || 0, // For backward compatibility
        humanProcessed: messageStats.humanResponses || 0, // For backward compatibility
        earliestEvent: messageStats.earliestMessage || null,
        latestEvent: messageStats.latestMessage || null
      };
    } catch (error) {
      logger.error('Failed to get analytics summary', { error: error.message });
      throw error;
    }
  }

  /**
   * Get daily activity from actual messages
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
            COUNT(CASE WHEN direction = 'incoming' THEN 1 END) as incomingCount,
            COUNT(CASE WHEN direction = 'outgoing' THEN 1 END) as outgoingCount,
            COUNT(CASE WHEN direction = 'outgoing' AND sender_type = 'ai' THEN 1 END) as aiCount,
            COUNT(CASE WHEN direction = 'outgoing' AND sender_type = 'human' THEN 1 END) as humanCount
          FROM messages
          WHERE timestamp BETWEEN ? AND ?
        `, [startDate.getTime(), endDate.getTime()]);

        activities.push({
          date: date.toISOString().split('T')[0],
          total: activity.totalCount || 0,
          incoming: activity.incomingCount || 0,
          outgoing: activity.outgoingCount || 0,
          ai: activity.aiCount || 0,
          human: activity.humanCount || 0,
          sent: activity.outgoingCount || 0, // For backward compatibility
          received: activity.incomingCount || 0, // For backward compatibility
          messages: activity.totalCount || 0 // For backward compatibility
        });
      }

      return activities;
    } catch (error) {
      logger.error('Failed to get daily activity', { error: error.message, days });
      throw error;
    }
  }

  /**
   * Get peak hours analysis from actual messages
   */
  async getPeakHours(days = 7) {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      startDate.setHours(0, 0, 0, 0);

      const hourlyData = await db.all(`
        SELECT
          CAST(strftime('%H', datetime(timestamp/1000, 'unixepoch')) AS INTEGER) as hour,
          COUNT(*) as totalCount,
          COUNT(CASE WHEN direction = 'incoming' THEN 1 END) as incomingCount,
          COUNT(CASE WHEN direction = 'outgoing' THEN 1 END) as outgoingCount,
          COUNT(CASE WHEN direction = 'outgoing' AND sender_type = 'ai' THEN 1 END) as aiCount,
          COUNT(CASE WHEN direction = 'outgoing' AND sender_type = 'human' THEN 1 END) as humanCount
        FROM messages
        WHERE timestamp >= ?
        GROUP BY CAST(strftime('%H', datetime(timestamp/1000, 'unixepoch')) AS INTEGER)
        ORDER BY hour
      `, [startDate.getTime()]);

      // Fill missing hours with 0 and calculate intensity for mountain chart
      const result = Array.from({ length: 24 }, (_, i) => {
        const hourData = hourlyData.find(h => h.hour === i);
        const total = hourData?.totalCount || 0;

        return {
          hour: i,
          hourLabel: `${i.toString().padStart(2, '0')}:00`,
          total: total,
          incoming: hourData?.incomingCount || 0,
          outgoing: hourData?.outgoingCount || 0,
          ai: hourData?.aiCount || 0,
          human: hourData?.humanCount || 0,
          messages: total,
          intensity: total // For mountain chart visualization
        };
      });

      // Find peak hours
      const maxMessages = Math.max(...result.map(h => h.total));
      const peakHours = result.filter(h => h.total > 0);
      const busiestHour = result.reduce((max, hour) =>
        hour.total > max.total ? hour : max, result[0]);

      return {
        hourlyData: result,
        peakHours: peakHours,
        busiestHour: busiestHour,
        maxMessages: maxMessages,
        totalDays: days
      };
    } catch (error) {
      logger.error('Failed to get peak hours analysis', { error: error.message, days });
      throw error;
    }
  }

  /**
   * Get hourly activity from actual messages (for backward compatibility)
   */
  async getHourlyActivity(days = 7) {
    try {
      const peakHoursData = await this.getPeakHours(days);
      return peakHoursData.hourlyData;
    } catch (error) {
      logger.error('Failed to get hourly activity', { error: error.message, days });
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
   * Get overview analytics from actual messages
   */
  async getOverview(days = 7) {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      startDate.setHours(0, 0, 0, 0);
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const overview = await db.get(`
        SELECT
          COUNT(DISTINCT chat_id) as totalChats,
          COUNT(*) as totalMessages,
          COUNT(CASE WHEN direction = 'incoming' THEN 1 END) as incomingMessages,
          COUNT(CASE WHEN direction = 'outgoing' THEN 1 END) as outgoingMessages,
          COUNT(CASE WHEN direction = 'outgoing' AND sender_type = 'ai' THEN 1 END) as aiResponses,
          COUNT(CASE WHEN direction = 'outgoing' AND sender_type = 'human' THEN 1 END) as humanResponses,
          COUNT(CASE WHEN timestamp >= ? THEN 1 END) as todayMessages,
          MIN(timestamp) as earliestMessage,
          MAX(timestamp) as latestMessage
        FROM messages
        WHERE timestamp >= ?
      `, [Math.floor(todayStart.getTime() / 1000), Math.floor(startDate.getTime() / 1000)]);

      return {
        totalChats: overview.totalChats || 0,
        totalMessages: overview.totalMessages || 0,
        incomingMessages: overview.incomingMessages || 0,
        outgoingMessages: overview.outgoingMessages || 0,
        aiProcessed: overview.aiResponses || 0,
        humanProcessed: overview.humanResponses || 0,
        messagesToday: overview.todayMessages || 0,
        earliestEvent: overview.earliestMessage || null,
        latestEvent: overview.latestMessage || null
      };
    } catch (error) {
      logger.error('Failed to get overview', { error: error.message, days });
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
   * Get detailed message statistics with human/AI breakdown
   */
  async getDetailedMessageStats(chatId = null, days = 30) {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      startDate.setHours(0, 0, 0, 0);

      let whereClause = 'WHERE timestamp >= ?';
      const params = [startDate.getTime()];

      if (chatId) {
        whereClause += ' AND chat_id = ?';
        params.push(chatId);
      }

      const stats = await db.get(`
        SELECT
          COUNT(*) as totalMessages,
          COUNT(CASE WHEN direction = 'incoming' THEN 1 END) as incomingMessages,
          COUNT(CASE WHEN direction = 'outgoing' THEN 1 END) as outgoingMessages,
          COUNT(CASE WHEN direction = 'outgoing' AND sender_type = 'ai' THEN 1 END) as aiMessages,
          COUNT(CASE WHEN direction = 'outgoing' AND sender_type = 'human' THEN 1 END) as humanMessages,
          COUNT(CASE WHEN direction = 'incoming' THEN 1 END) as customerMessages,
          COUNT(CASE WHEN has_media = 1 THEN 1 END) as mediaMessages,
          COUNT(DISTINCT chat_id) as totalChats,
          MIN(timestamp) as earliestMessage,
          MAX(timestamp) as latestMessage
        FROM messages
        ${whereClause}
      `, params);

      // Get daily breakdown
      const dailyBreakdown = await db.all(`
        SELECT
          DATE(datetime(timestamp/1000, 'unixepoch')) as date,
          COUNT(*) as totalMessages,
          COUNT(CASE WHEN direction = 'incoming' THEN 1 END) as incomingMessages,
          COUNT(CASE WHEN direction = 'outgoing' THEN 1 END) as outgoingMessages,
          COUNT(CASE WHEN direction = 'outgoing' AND sender_type = 'ai' THEN 1 END) as aiMessages,
          COUNT(CASE WHEN direction = 'outgoing' AND sender_type = 'human' THEN 1 END) as humanMessages,
          COUNT(CASE WHEN has_media = 1 THEN 1 END) as mediaMessages
        FROM messages
        ${whereClause}
        GROUP BY DATE(datetime(timestamp/1000, 'unixepoch'))
        ORDER BY date DESC
        LIMIT ?
      `, [...params, days]);

      // Get hourly breakdown (peak hours analysis)
      const hourlyBreakdown = await db.all(`
        SELECT
          CAST(strftime('%H', datetime(timestamp/1000, 'unixepoch')) AS INTEGER) as hour,
          COUNT(*) as totalMessages,
          COUNT(CASE WHEN direction = 'incoming' THEN 1 END) as incomingMessages,
          COUNT(CASE WHEN direction = 'outgoing' THEN 1 END) as outgoingMessages,
          COUNT(CASE WHEN direction = 'outgoing' AND sender_type = 'ai' THEN 1 END) as aiMessages,
          COUNT(CASE WHEN direction = 'outgoing' AND sender_type = 'human' THEN 1 END) as humanMessages
        FROM messages
        ${whereClause}
        GROUP BY CAST(strftime('%H', datetime(timestamp/1000, 'unixepoch')) AS INTEGER)
        ORDER BY hour
      `, params);

      // Fill missing hours with 0
      const completeHourlyBreakdown = Array.from({ length: 24 }, (_, i) => {
        const hourData = hourlyBreakdown.find(h => h.hour === i);
        return {
          hour: i,
          hourLabel: `${i.toString().padStart(2, '0')}:00`,
          totalMessages: hourData?.totalMessages || 0,
          incomingMessages: hourData?.incomingMessages || 0,
          outgoingMessages: hourData?.outgoingMessages || 0,
          aiMessages: hourData?.aiMessages || 0,
          humanMessages: hourData?.humanMessages || 0
        };
      });

      return {
        summary: {
          totalMessages: stats.totalMessages || 0,
          incomingMessages: stats.incomingMessages || 0,
          outgoingMessages: stats.outgoingMessages || 0,
          aiMessages: stats.aiMessages || 0,
          humanMessages: stats.humanMessages || 0,
          customerMessages: stats.customerMessages || 0,
          mediaMessages: stats.mediaMessages || 0,
          totalChats: stats.totalChats || 0,
          earliestMessage: stats.earliestMessage,
          latestMessage: stats.latestMessage,
          avgMessagesPerDay: stats.totalMessages ? Math.round(stats.totalMessages / days) : 0,
          aiResponseRate: stats.outgoingMessages ? Math.round((stats.aiMessages / stats.outgoingMessages) * 100) : 0,
          humanResponseRate: stats.outgoingMessages ? Math.round((stats.humanMessages / stats.outgoingMessages) * 100) : 0
        },
        dailyBreakdown: dailyBreakdown.map(day => ({
          date: day.date,
          totalMessages: day.totalMessages,
          incomingMessages: day.incomingMessages,
          outgoingMessages: day.outgoingMessages,
          aiMessages: day.aiMessages,
          humanMessages: day.humanMessages,
          mediaMessages: day.mediaMessages,
          aiResponseRate: day.outgoingMessages ? Math.round((day.aiMessages / day.outgoingMessages) * 100) : 0,
          humanResponseRate: day.outgoingMessages ? Math.round((day.humanMessages / day.outgoingMessages) * 100) : 0
        })),
        hourlyBreakdown: completeHourlyBreakdown,
        filters: {
          chatId: chatId || 'all',
          days: days,
          startDate: startDate.toISOString(),
          endDate: new Date().toISOString()
        }
      };
    } catch (error) {
      logger.error('Failed to get detailed message stats', { error: error.message, chatId, days });
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