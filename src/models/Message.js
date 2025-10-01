const db = require('../config/database');
const logger = require('../config/logger');

class Message {
  constructor() {
    this.tableName = 'messages';
  }

  /**
   * Store message in database
   */
  async store(messageData) {
    try {
      const {
        messageId,
        chatId,
        senderId,
        body,
        type = 'chat',
        direction = null,
        senderType = null,
        timestamp,
        fromMe = false,
        hasMedia = false,
        mediaType = null,
        mediaSize = null,
        ack = 0,
        isAiGenerated = false
      } = messageData;

      // Determine direction and sender_type from existing fields if not provided
      const messageDirection = direction !== null ? direction : (fromMe ? 'outgoing' : 'incoming');
      const messageSenderType = senderType !== null ? senderType :
        (fromMe ? (isAiGenerated ? 'ai' : 'human') : 'customer');

      const result = await db.run(
        `INSERT OR IGNORE INTO ${this.tableName} (
          message_id, chat_id, sender_id, body, type, direction, sender_type,
          timestamp, from_me, has_media, media_type, media_size, ack, is_ai_generated
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          messageId, chatId, senderId, body, type, messageDirection, messageSenderType,
          timestamp, fromMe, hasMedia, mediaType, mediaSize, ack, isAiGenerated
        ]
      );

      if (result.changes > 0) {
        logger.database('message_stored', {
          messageId: messageId.substring(0, 15) + '...',
          chatId: chatId.substring(0, 15) + '...',
          type,
          fromMe,
          hasMedia
        });
      }

      return result.changes > 0;
    } catch (error) {
      logger.error('Failed to store message', { error: error.message, messageId: messageData.messageId });
      throw error;
    }
  }

  /**
   * Get message by ID
   */
  async getById(messageId) {
    try {
      const message = await db.get(
        `SELECT
          message_id as messageId,
          chat_id as chatId,
          sender_id as senderId,
          body,
          type,
          direction,
          sender_type as senderType,
          timestamp,
          from_me as fromMe,
          has_media as hasMedia,
          media_type as mediaType,
          media_size as mediaSize,
          ack,
          is_ai_generated as isAiGenerated,
          created_at as createdAt
        FROM ${this.tableName}
        WHERE message_id = ?
      `, [messageId]);

      if (!message) {
        return null;
      }

      return {
        ...message,
        fromMe: message.fromMe === 1,
        hasMedia: message.hasMedia === 1,
        isAiGenerated: message.isAiGenerated === 1
      };
    } catch (error) {
      logger.error('Failed to get message by ID', { error: error.message, messageId });
      throw error;
    }
  }

  /**
   * Get messages by chat ID
   */
  async getByChatId(chatId, limit = 50, offset = 0) {
    try {
      const messages = await db.all(`
        SELECT
          message_id as messageId,
          chat_id as chatId,
          sender_id as senderId,
          body,
          type,
          direction,
          sender_type as senderType,
          timestamp,
          from_me as fromMe,
          has_media as hasMedia,
          media_type as mediaType,
          media_size as mediaSize,
          ack,
          is_ai_generated as isAiGenerated,
          created_at as createdAt
        FROM ${this.tableName}
        WHERE chat_id = ?
        ORDER BY timestamp DESC
        LIMIT ? OFFSET ?
      `, [chatId, limit, offset]);

      return messages.map(message => ({
        ...message,
        fromMe: message.fromMe === 1,
        hasMedia: message.hasMedia === 1,
        isAiGenerated: message.isAiGenerated === 1
      }));
    } catch (error) {
      logger.error('Failed to get messages by chat ID', { error: error.message, chatId, limit, offset });
      throw error;
    }
  }

  /**
   * Get recent messages
   */
  async getRecent(limit = 100) {
    try {
      const messages = await db.all(`
        SELECT
          message_id as messageId,
          chat_id as chatId,
          sender_id as senderId,
          body,
          type,
          timestamp,
          from_me as fromMe,
          has_media as hasMedia,
          media_type as mediaType,
          media_size as mediaSize,
          ack,
          is_ai_generated as isAiGenerated,
          created_at as createdAt
        FROM ${this.tableName}
        ORDER BY timestamp DESC
        LIMIT ?
      `, [limit]);

      return messages.map(message => ({
        ...message,
        fromMe: message.fromMe === 1,
        hasMedia: message.hasMedia === 1,
        isAiGenerated: message.isAiGenerated === 1
      }));
    } catch (error) {
      logger.error('Failed to get recent messages', { error: error.message, limit });
      throw error;
    }
  }

  /**
   * Update message status
   */
  async updateStatus(messageId, ack) {
    try {
      const result = await db.run(
        `UPDATE ${this.tableName} SET ack = ? WHERE message_id = ?`,
        [ack, messageId]
      );

      return result.changes > 0;
    } catch (error) {
      logger.error('Failed to update message status', { error: error.message, messageId, ack });
      throw error;
    }
  }

  /**
   * Get message statistics with human/AI breakdown
   */
  async getStats(chatId = null, days = 30) {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      startDate.setHours(0, 0, 0, 0);

      let query = `
        SELECT
          COUNT(*) as totalMessages,
          COUNT(CASE WHEN from_me = 1 THEN 1 END) as sentMessages,
          COUNT(CASE WHEN from_me = 0 THEN 1 END) as receivedMessages,
          COUNT(CASE WHEN has_media = 1 THEN 1 END) as mediaMessages,
          COUNT(CASE WHEN is_ai_generated = 1 THEN 1 END) as aiMessages,
          COUNT(CASE WHEN is_ai_generated = 0 AND from_me = 1 THEN 1 END) as humanSentMessages,
          COUNT(CASE WHEN is_ai_generated = 0 AND from_me = 1 THEN 1 END) as humanReplies,
          MIN(timestamp) as earliestMessage,
          MAX(timestamp) as latestMessage,
          AVG(timestamp - LAG(timestamp) OVER (ORDER BY timestamp)) as avgResponseTime
        FROM ${this.tableName}
        WHERE timestamp >= ?
      `;

      const params = [startDate.getTime()];

      if (chatId) {
        query += ' AND chat_id = ?';
        params.push(chatId);
      }

      const stats = await db.get(query, params);

      return {
        totalMessages: stats.totalMessages || 0,
        sentMessages: stats.sentMessages || 0,
        receivedMessages: stats.receivedMessages || 0,
        mediaMessages: stats.mediaMessages || 0,
        aiMessages: stats.aiMessages || 0,
        humanSentMessages: stats.humanSentMessages || 0,
        humanReplies: stats.humanReplies || 0,
        earliestMessage: stats.earliestMessage || null,
        latestMessage: stats.latestMessage || null,
        avgResponseTime: stats.avgResponseTime || 0
      };
    } catch (error) {
      logger.error('Failed to get message statistics', { error: error.message, chatId, days });
      throw error;
    }
  }

  /**
   * Get message statistics with detailed breakdown
   */
  async getDetailedStats(chatId = null, days = 30) {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      startDate.setHours(0, 0, 0, 0);

      let query = `
        SELECT
          COUNT(*) as totalMessages,
          COUNT(CASE WHEN from_me = 0 THEN 1 END) as incomingMessages,
          COUNT(CASE WHEN from_me = 1 AND is_ai_generated = 1 THEN 1 END) as aiReplies,
          COUNT(CASE WHEN from_me = 1 AND is_ai_generated = 0 THEN 1 END) as humanReplies,
          COUNT(CASE WHEN from_me = 1 AND is_ai_generated = 0 THEN 1 END) as dashboardReplies,
          COUNT(CASE WHEN from_me = 1 AND is_ai_generated = 1 THEN 1 END) as n8nReplies,
          MIN(timestamp) as earliestMessage,
          MAX(timestamp) as latestMessage
        FROM ${this.tableName}
        WHERE timestamp >= ?
      `;

      const params = [startDate.getTime()];

      if (chatId) {
        query += ' AND chat_id = ?';
        params.push(chatId);
      }

      const stats = await db.get(query, params);

      return {
        totalMessages: stats.totalMessages || 0,
        incomingMessages: stats.incomingMessages || 0,
        aiReplies: stats.aiReplies || 0,
        humanReplies: stats.humanReplies || 0,
        dashboardReplies: stats.dashboardReplies || 0,
        n8nReplies: stats.n8nReplies || 0,
        earliestMessage: stats.earliestMessage || null,
        latestMessage: stats.latestMessage || null
      };
    } catch (error) {
      logger.error('Failed to get detailed message statistics', { error: error.message, chatId, days });
      throw error;
    }
  }

  /**
   * Get message type distribution
   */
  async getTypeDistribution(chatId = null, days = 30) {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      startDate.setHours(0, 0, 0, 0);

      let query = `
        SELECT
          type,
          COUNT(*) as count,
          COUNT(CASE WHEN from_me = 1 THEN 1 END) as sent,
          COUNT(CASE WHEN from_me = 0 THEN 1 END) as received
        FROM ${this.tableName}
        WHERE timestamp >= ?
      `;

      const params = [startDate.getTime()];

      if (chatId) {
        query += ' AND chat_id = ?';
        params.push(chatId);
      }

      query += ' GROUP BY type ORDER BY count DESC';

      const distribution = await db.all(query, params);

      return distribution;
    } catch (error) {
      logger.error('Failed to get message type distribution', { error: error.message, chatId, days });
      throw error;
    }
  }

  /**
   * Search messages
   */
  async search(query, chatId = null, limit = 50) {
    try {
      let sql = `
        SELECT
          message_id as messageId,
          chat_id as chatId,
          sender_id as senderId,
          body,
          type,
          timestamp,
          from_me as fromMe,
          has_media as hasMedia,
          media_type as mediaType,
          media_size as mediaSize,
          ack,
          is_ai_generated as isAiGenerated,
          created_at as createdAt
        FROM ${this.tableName}
        WHERE body LIKE ?
      `;

      const params = [`%${query}%`];

      if (chatId) {
        sql += ' AND chat_id = ?';
        params.push(chatId);
      }

      sql += ' ORDER BY timestamp DESC LIMIT ?';
      params.push(limit);

      const messages = await db.all(sql, params);

      return messages.map(message => ({
        ...message,
        fromMe: message.fromMe === 1,
        hasMedia: message.hasMedia === 1,
        isAiGenerated: message.isAiGenerated === 1
      }));
    } catch (error) {
      logger.error('Failed to search messages', { error: error.message, query, chatId, limit });
      throw error;
    }
  }

  /**
   * Get daily message count
   */
  async getDailyCount(chatId = null, days = 30) {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      startDate.setHours(0, 0, 0, 0);

      let query = `
        SELECT
          DATE(timestamp/1000, 'unixepoch') as date,
          COUNT(*) as count,
          COUNT(CASE WHEN from_me = 1 THEN 1 END) as sent,
          COUNT(CASE WHEN from_me = 0 THEN 1 END) as received
        FROM ${this.tableName}
        WHERE timestamp >= ?
      `;

      const params = [startDate.getTime()];

      if (chatId) {
        query += ' AND chat_id = ?';
        params.push(chatId);
      }

      query += ' GROUP BY DATE(timestamp/1000, "unixepoch") ORDER BY date';

      const dailyCount = await db.all(query, params);

      return dailyCount;
    } catch (error) {
      logger.error('Failed to get daily message count', { error: error.message, chatId, days });
      throw error;
    }
  }

  /**
   * Get top contacts by message count
   */
  async getTopContacts(limit = 10, days = 30) {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      startDate.setHours(0, 0, 0, 0);

      const contacts = await db.all(`
        SELECT
          chat_id as chatId,
          COUNT(*) as messageCount,
          COUNT(CASE WHEN from_me = 1 THEN 1 END) as sentCount,
          COUNT(CASE WHEN from_me = 0 THEN 1 END) as receivedCount,
          MAX(timestamp) as lastMessageTime
        FROM ${this.tableName}
        WHERE timestamp >= ?
        GROUP BY chat_id
        ORDER BY messageCount DESC
        LIMIT ?
      `, [startDate.getTime(), limit]);

      return contacts;
    } catch (error) {
      logger.error('Failed to get top contacts', { error: error.message, limit, days });
      throw error;
    }
  }

  /**
   * Delete message
   */
  async delete(messageId) {
    try {
      const result = await db.run(
        `DELETE FROM ${this.tableName} WHERE message_id = ?`,
        [messageId]
      );

      logger.database('message_deleted', {
        messageId: messageId.substring(0, 15) + '...',
        deleted: result.changes > 0
      });

      return result.changes > 0;
    } catch (error) {
      logger.error('Failed to delete message', { error: error.message, messageId });
      throw error;
    }
  }

  /**
   * Delete messages by chat ID
   */
  async deleteByChatId(chatId) {
    try {
      const result = await db.run(
        `DELETE FROM ${this.tableName} WHERE chat_id = ?`,
        [chatId]
      );

      logger.database('messages_deleted_by_chat', {
        chatId: chatId.substring(0, 15) + '...',
        deletedCount: result.changes
      });

      return result.changes;
    } catch (error) {
      logger.error('Failed to delete messages by chat ID', { error: error.message, chatId });
      throw error;
    }
  }

  /**
   * Cleanup old messages
   */
  async cleanup(retentionDays = 90) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
      cutoffDate.setHours(23, 59, 59, 999);

      const result = await db.run(
        `DELETE FROM ${this.tableName} WHERE timestamp < ?`,
        [cutoffDate.getTime()]
      );

      logger.info('Messages cleanup completed', {
        deletedRows: result.changes,
        retentionDays,
        cutoffDate: cutoffDate.toISOString()
      });

      return result.changes;
    } catch (error) {
      logger.error('Failed to cleanup messages', { error: error.message, retentionDays });
      throw error;
    }
  }
}

module.exports = new Message();