const db = require('../config/database');
const logger = require('../config/logger');

class ChatSettings {
  constructor() {
    this.tableName = 'chat_settings';
    this.cache = new Map(); // In-memory cache for chat settings
  }

  /**
   * Get chat settings
   */
  async get(chatId) {
    try {
      // Check cache first
      if (this.cache.has(chatId)) {
        return this.cache.get(chatId);
      }

      const settings = await db.get(
        `SELECT chat_id as chatId, ai_mode as aiMode, last_updated as lastUpdated, created_at as createdAt, updated_at as updatedAt FROM ${this.tableName} WHERE chat_id = ?`,
        [chatId]
      );

      if (settings) {
        const result = {
          chatId: settings.chatId,
          aiMode: settings.aiMode === 1,
          lastUpdated: settings.lastUpdated,
          createdAt: settings.createdAt,
          updatedAt: settings.updatedAt
        };

        // Cache the result
        this.cache.set(chatId, result);

        return result;
      }

      // Return default settings if not found
      const defaultSettings = {
        chatId,
        aiMode: true,
        lastUpdated: Date.now(),
        createdAt: null,
        updatedAt: null
      };

      this.cache.set(chatId, defaultSettings);
      return defaultSettings;
    } catch (error) {
      logger.error('Failed to get chat settings', { error: error.message, chatId });
      throw error;
    }
  }

  /**
   * Set chat settings
   */
  async set(chatId, aiMode) {
    try {
      const now = Date.now();

      const result = await db.run(
        `INSERT OR REPLACE INTO ${this.tableName} (chat_id, ai_mode, last_updated, updated_at) VALUES (?, ?, ?, datetime('now'))`,
        [chatId, aiMode ? 1 : 0, now]
      );

      // Update cache
      const settings = {
        chatId,
        aiMode,
        lastUpdated: now,
        createdAt: now,
        updatedAt: new Date().toISOString()
      };

      this.cache.set(chatId, settings);

      logger.info('Chat settings updated', {
        chatId: chatId.substring(0, 15) + '...',
        aiMode,
        lastUpdated: now
      });

      return settings;
    } catch (error) {
      logger.error('Failed to set chat settings', { error: error.message, chatId, aiMode });
      throw error;
    }
  }

  /**
   * Toggle AI mode for chat
   */
  async toggle(chatId) {
    try {
      const currentSettings = await this.get(chatId);
      const newAiMode = !currentSettings.aiMode;

      return await this.set(chatId, newAiMode);
    } catch (error) {
      logger.error('Failed to toggle chat settings', { error: error.message, chatId });
      throw error;
    }
  }

  /**
   * Get all chat settings
   */
  async getAll(limit = 1000) {
    try {
      const settingsList = await db.all(`
        SELECT
          chat_id as chatId,
          ai_mode as aiMode,
          last_updated as lastUpdated,
          created_at as createdAt,
          updated_at as updatedAt
        FROM ${this.tableName}
        ORDER BY updated_at DESC
        LIMIT ?
      `, [limit]);

      // Update cache
      settingsList.forEach(settings => {
        const result = {
          chatId: settings.chatId,
          aiMode: settings.aiMode === 1,
          lastUpdated: settings.lastUpdated,
          createdAt: settings.createdAt,
          updatedAt: settings.updatedAt
        };

        this.cache.set(settings.chatId, result);
      });

      return settingsList.map(settings => ({
        chatId: settings.chatId,
        aiMode: settings.aiMode === 1,
        lastUpdated: settings.lastUpdated,
        createdAt: settings.createdAt,
        updatedAt: settings.updatedAt
      }));
    } catch (error) {
      logger.error('Failed to get all chat settings', { error: error.message, limit });
      throw error;
    }
  }

  /**
   * Get settings summary
   */
  async getSummary() {
    try {
      const summary = await db.get(`
        SELECT
          COUNT(*) as totalChats,
          COUNT(CASE WHEN ai_mode = 1 THEN 1 END) as aiEnabled,
          COUNT(CASE WHEN ai_mode = 0 THEN 1 END) as aiDisabled,
          COUNT(CASE WHEN last_updated >= ? THEN 1 END) as updatedToday,
          COUNT(CASE WHEN last_updated >= ? THEN 1 END) as updatedThisWeek
        FROM ${this.tableName}
      `, [
        new Date().setHours(0, 0, 0, 0),
        Date.now() - 7 * 24 * 60 * 60 * 1000
      ]);

      return {
        totalChats: summary.totalChats,
        aiEnabled: summary.aiEnabled,
        aiDisabled: summary.aiDisabled,
        updatedToday: summary.updatedToday,
        updatedThisWeek: summary.updatedThisWeek,
        cachedSettings: this.cache.size
      };
    } catch (error) {
      logger.error('Failed to get chat settings summary', { error: error.message });
      throw error;
    }
  }

  /**
   * Enable AI mode for multiple chats
   */
  async enableAI(chatIds) {
    try {
      const now = Date.now();
      let enabledCount = 0;

      for (const chatId of chatIds) {
        await db.run(
          `INSERT OR REPLACE INTO ${this.tableName} (chat_id, ai_mode, last_updated, updated_at) VALUES (?, ?, ?, datetime('now'))`,
          [chatId, 1, now]
        );

        // Update cache
        this.cache.set(chatId, {
          chatId,
          aiMode: true,
          lastUpdated: now,
          createdAt: now,
          updatedAt: new Date().toISOString()
        });

        enabledCount++;
      }

      logger.info('AI mode enabled for multiple chats', {
        chatCount: chatIds.length,
        enabledCount
      });

      return enabledCount;
    } catch (error) {
      logger.error('Failed to enable AI for multiple chats', { error: error.message, chatCount: chatIds.length });
      throw error;
    }
  }

  /**
   * Disable AI mode for multiple chats
   */
  async disableAI(chatIds) {
    try {
      const now = Date.now();
      let disabledCount = 0;

      for (const chatId of chatIds) {
        await db.run(
          `INSERT OR REPLACE INTO ${this.tableName} (chat_id, ai_mode, last_updated, updated_at) VALUES (?, ?, ?, datetime('now'))`,
          [chatId, 0, now]
        );

        // Update cache
        this.cache.set(chatId, {
          chatId,
          aiMode: false,
          lastUpdated: now,
          createdAt: now,
          updatedAt: new Date().toISOString()
        });

        disabledCount++;
      }

      logger.info('AI mode disabled for multiple chats', {
        chatCount: chatIds.length,
        disabledCount
      });

      return disabledCount;
    } catch (error) {
      logger.error('Failed to disable AI for multiple chats', { error: error.message, chatCount: chatIds.length });
      throw error;
    }
  }

  /**
   * Get chats with AI enabled
   */
  async getAIEnabledChats(limit = 100) {
    try {
      const chats = await db.all(`
        SELECT
          chat_id as chatId,
          ai_mode as aiMode,
          last_updated as lastUpdated,
          created_at as createdAt,
          updated_at as updatedAt
        FROM ${this.tableName}
        WHERE ai_mode = 1
        ORDER BY updated_at DESC
        LIMIT ?
      `, [limit]);

      return chats.map(chat => ({
        chatId: chat.chatId,
        aiMode: chat.aiMode === 1,
        lastUpdated: chat.lastUpdated,
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt
      }));
    } catch (error) {
      logger.error('Failed to get AI enabled chats', { error: error.message, limit });
      throw error;
    }
  }

  /**
   * Get chats with AI disabled
   */
  async getAIDisabledChats(limit = 100) {
    try {
      const chats = await db.all(`
        SELECT
          chat_id as chatId,
          ai_mode as aiMode,
          last_updated as lastUpdated,
          created_at as createdAt,
          updated_at as updatedAt
        FROM ${this.tableName}
        WHERE ai_mode = 0
        ORDER BY updated_at DESC
        LIMIT ?
      `, [limit]);

      return chats.map(chat => ({
        chatId: chat.chatId,
        aiMode: chat.aiMode === 1,
        lastUpdated: chat.lastUpdated,
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt
      }));
    } catch (error) {
      logger.error('Failed to get AI disabled chats', { error: error.message, limit });
      throw error;
    }
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
    logger.info('Chat settings cache cleared');
  }

  /**
   * Warm up cache with frequently accessed chats
   */
  async warmCache(chatIds) {
    try {
      for (const chatId of chatIds) {
        await this.get(chatId);
      }

      logger.info('Chat settings cache warmed up', { chatCount: chatIds.length });
    } catch (error) {
      logger.error('Failed to warm up cache', { error: error.message });
    }
  }

  /**
   * Delete chat settings
   */
  async delete(chatId) {
    try {
      const result = await db.run(
        `DELETE FROM ${this.tableName} WHERE chat_id = ?`,
        [chatId]
      );

      // Remove from cache
      this.cache.delete(chatId);

      logger.info('Chat settings deleted', { chatId: chatId.substring(0, 15) + '...' });

      return result.changes > 0;
    } catch (error) {
      logger.error('Failed to delete chat settings', { error: error.message, chatId });
      throw error;
    }
  }

  /**
   * Bulk update chat settings
   */
  async bulkUpdate(updates) {
    try {
      const queries = updates.map(update => ({
        sql: `INSERT OR REPLACE INTO ${this.tableName} (chat_id, ai_mode, last_updated, updated_at) VALUES (?, ?, ?, datetime('now'))`,
        params: [update.chatId, update.aiMode ? 1 : 0, Date.now()]
      }));

      await db.executeTransaction(queries);

      // Update cache
      updates.forEach(update => {
        this.cache.set(update.chatId, {
          chatId: update.chatId,
          aiMode: update.aiMode,
          lastUpdated: Date.now(),
          createdAt: Date.now(),
          updatedAt: new Date().toISOString()
        });
      });

      logger.info('Bulk chat settings update completed', { updateCount: updates.length });

      return updates.length;
    } catch (error) {
      logger.error('Failed to bulk update chat settings', { error: error.message, updateCount: updates.length });
      throw error;
    }
  }
}

module.exports = new ChatSettings();