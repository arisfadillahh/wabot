const logger = require('../config/logger');
const ChatSettings = require('../models/ChatSettings');
const ErrorHandler = require('../middlewares/errorHandler');

class ChatSettingsController {
  constructor() {
    this.chatSettingsModel = ChatSettings;
    this.errorHandler = ErrorHandler;
  }

  /**
   * Get chat settings
   */
  getSettings = async (req, res) => {
    try {
      const { chatId } = req.params;

      logger.chatSettings('get_settings_request', {
        chatId,
        ip: req.ip,
        userId: req.user?.id
      });

      const settings = await this.chatSettingsModel.getSettings(chatId);

      if (!settings) {
        throw this.errorHandler.createNotFoundError('Chat settings');
      }

      res.json({
        settings,
        timestamp: Date.now()
      });
    } catch (error) {
      this.errorHandler.handle(error, req, res);
    }
  };

  /**
   * Create or update chat settings
   */
  updateSettings = async (req, res) => {
    try {
      const { chatId } = req.params;
      const { aiMode, webhookEnabled, customSettings } = req.body;

      logger.chatSettings('update_settings_request', {
        chatId,
        aiMode,
        webhookEnabled,
        hasCustomSettings: !!customSettings,
        ip: req.ip,
        userId: req.user?.id
      });

      const settings = await this.chatSettingsModel.updateSettings(chatId, {
        aiMode,
        webhookEnabled,
        customSettings
      });

      res.json({
        success: true,
        message: 'Chat settings updated successfully',
        settings,
        timestamp: Date.now()
      });
    } catch (error) {
      this.errorHandler.handle(error, req, res);
    }
  };

  /**
   * Toggle AI mode for chat
   */
  toggleAiMode = async (req, res) => {
    try {
      const { chatId } = req.params;
      const { enabled } = req.body;

      logger.chatSettings('toggle_ai_mode_request', {
        chatId,
        enabled,
        ip: req.ip,
        userId: req.user?.id
      });

      const settings = await this.chatSettingsModel.toggleAiMode(chatId, enabled);

      res.json({
        success: true,
        message: `AI mode ${enabled ? 'enabled' : 'disabled'} successfully`,
        settings,
        timestamp: Date.now()
      });
    } catch (error) {
      this.errorHandler.handle(error, req, res);
    }
  };

  /**
   * Toggle webhook for chat
   */
  toggleWebhook = async (req, res) => {
    try {
      const { chatId } = req.params;
      const { enabled } = req.body;

      logger.chatSettings('toggle_webhook_request', {
        chatId,
        enabled,
        ip: req.ip,
        userId: req.user?.id
      });

      const settings = await this.chatSettingsModel.toggleWebhook(chatId, enabled);

      res.json({
        success: true,
        message: `Webhook ${enabled ? 'enabled' : 'disabled'} successfully`,
        settings,
        timestamp: Date.now()
      });
    } catch (error) {
      this.errorHandler.handle(error, req, res);
    }
  };

  /**
   * Update custom settings
   */
  updateCustomSettings = async (req, res) => {
    try {
      const { chatId } = req.params;
      const { customSettings } = req.body;

      logger.chatSettings('update_custom_settings_request', {
        chatId,
        settingsKeys: customSettings ? Object.keys(customSettings) : [],
        ip: req.ip,
        userId: req.user?.id
      });

      const settings = await this.chatSettingsModel.updateCustomSettings(chatId, customSettings);

      res.json({
        success: true,
        message: 'Custom settings updated successfully',
        settings,
        timestamp: Date.now()
      });
    } catch (error) {
      this.errorHandler.handle(error, req, res);
    }
  };

  /**
   * Get all chat settings with pagination
   */
  getAllSettings = async (req, res) => {
    try {
      const { page = 1, limit = 50, aiMode, webhookEnabled } = req.query;
      const validatedLimit = Math.min(Math.max(parseInt(limit), 1), 200);
      const validatedPage = Math.max(parseInt(page), 1);

      logger.chatSettings('get_all_settings_request', {
        page: validatedPage,
        limit: validatedLimit,
        aiMode,
        webhookEnabled,
        ip: req.ip,
        userId: req.user?.id
      });

      const result = await this.chatSettingsModel.getAllSettings(validatedLimit, validatedPage, {
        aiMode: aiMode !== undefined ? aiMode === 'true' : undefined,
        webhookEnabled: webhookEnabled !== undefined ? webhookEnabled === 'true' : undefined
      });

      res.json({
        settings: result.settings,
        pagination: {
          page: validatedPage,
          limit: validatedLimit,
          total: result.total,
          totalPages: Math.ceil(result.total / validatedLimit),
          hasMore: validatedPage * validatedLimit < result.total
        },
        filters: { aiMode, webhookEnabled },
        timestamp: Date.now()
      });
    } catch (error) {
      this.errorHandler.handle(error, req, res);
    }
  };

  /**
   * Get AI-enabled chats
   */
  getAiEnabledChats = async (req, res) => {
    try {
      const { page = 1, limit = 50 } = req.query;
      const validatedLimit = Math.min(Math.max(parseInt(limit), 1), 200);
      const validatedPage = Math.max(parseInt(page), 1);

      logger.chatSettings('get_ai_enabled_chats_request', {
        page: validatedPage,
        limit: validatedLimit,
        ip: req.ip,
        userId: req.user?.id
      });

      const result = await this.chatSettingsModel.getAiEnabledChats(validatedLimit, validatedPage);

      res.json({
        chats: result.chats,
        pagination: {
          page: validatedPage,
          limit: validatedLimit,
          total: result.total,
          totalPages: Math.ceil(result.total / validatedLimit),
          hasMore: validatedPage * validatedLimit < result.total
        },
        timestamp: Date.now()
      });
    } catch (error) {
      this.errorHandler.handle(error, req, res);
    }
  };

  /**
   * Get webhook-enabled chats
   */
  getWebhookEnabledChats = async (req, res) => {
    try {
      const { page = 1, limit = 50 } = req.query;
      const validatedLimit = Math.min(Math.max(parseInt(limit), 1), 200);
      const validatedPage = Math.max(parseInt(page), 1);

      logger.chatSettings('get_webhook_enabled_chats_request', {
        page: validatedPage,
        limit: validatedLimit,
        ip: req.ip,
        userId: req.user?.id
      });

      const result = await this.chatSettingsModel.getWebhookEnabledChats(validatedLimit, validatedPage);

      res.json({
        chats: result.chats,
        pagination: {
          page: validatedPage,
          limit: validatedLimit,
          total: result.total,
          totalPages: Math.ceil(result.total / validatedLimit),
          hasMore: validatedPage * validatedLimit < result.total
        },
        timestamp: Date.now()
      });
    } catch (error) {
      this.errorHandler.handle(error, req, res);
    }
  };

  /**
   * Bulk update chat settings
   */
  bulkUpdateSettings = async (req, res) => {
    try {
      const { chatIds, settings } = req.body;

      if (!Array.isArray(chatIds) || chatIds.length === 0) {
        throw this.errorHandler.createValidationError([{
          field: 'chatIds',
          message: 'chatIds must be a non-empty array'
        }]);
      }

      if (!settings || typeof settings !== 'object') {
        throw this.errorHandler.createValidationError([{
          field: 'settings',
          message: 'settings must be provided'
        }]);
      }

      logger.chatSettings('bulk_update_settings_request', {
        chatCount: chatIds.length,
        settingsKeys: Object.keys(settings),
        ip: req.ip,
        userId: req.user?.id
      });

      const updatedCount = await this.chatSettingsModel.bulkUpdateSettings(chatIds, settings);

      res.json({
        success: true,
        message: `Settings updated for ${updatedCount} chats`,
        updatedCount,
        timestamp: Date.now()
      });
    } catch (error) {
      this.errorHandler.handle(error, req, res);
    }
  };

  /**
   * Delete chat settings
   */
  deleteSettings = async (req, res) => {
    try {
      const { chatId } = req.params;

      logger.chatSettings('delete_settings_request', {
        chatId,
        ip: req.ip,
        userId: req.user?.id
      });

      const deleted = await this.chatSettingsModel.deleteSettings(chatId);

      if (!deleted) {
        throw this.errorHandler.createNotFoundError('Chat settings');
      }

      res.json({
        success: true,
        message: 'Chat settings deleted successfully',
        timestamp: Date.now()
      });
    } catch (error) {
      this.errorHandler.handle(error, req, res);
    }
  };

  /**
   * Clear chat settings cache
   */
  clearCache = async (req, res) => {
    try {
      const { chatId } = req.params;

      logger.chatSettings('clear_cache_request', {
        chatId,
        ip: req.ip,
        userId: req.user?.id
      });

      await this.chatSettingsModel.clearCache(chatId);

      res.json({
        success: true,
        message: 'Chat settings cache cleared successfully',
        timestamp: Date.now()
      });
    } catch (error) {
      this.errorHandler.handle(error, req, res);
    }
  };

  /**
   * Get chat settings statistics
   */
  getStats = async (req, res) => {
    try {
      logger.chatSettings('get_stats_request', {
        ip: req.ip,
        userId: req.user?.id
      });

      const stats = await this.chatSettingsModel.getStats();

      res.json({
        stats,
        timestamp: Date.now()
      });
    } catch (error) {
      this.errorHandler.handle(error, req, res);
    }
  };

  /**
   * Get recently updated settings
   */
  getRecentlyUpdated = async (req, res) => {
    try {
      const { hours = 24, limit = 20 } = req.query;
      const validatedHours = Math.min(Math.max(parseInt(hours), 1), 168); // Max 1 week
      const validatedLimit = Math.min(Math.max(parseInt(limit), 1), 100);

      logger.chatSettings('get_recently_updated_request', {
        hours: validatedHours,
        limit: validatedLimit,
        ip: req.ip,
        userId: req.user?.id
      });

      const settings = await this.chatSettingsModel.getRecentlyUpdated(validatedHours, validatedLimit);

      res.json({
        settings,
        filters: { hours: validatedHours, limit: validatedLimit },
        count: settings.length,
        timestamp: Date.now()
      });
    } catch (error) {
      this.errorHandler.handle(error, req, res);
    }
  };

  /**
   * Validate chat settings
   */
  validateSettings = async (req, res) => {
    try {
      const { settings } = req.body;

      logger.chatSettings('validate_settings_request', {
        settingsKeys: Object.keys(settings || {}),
        ip: req.ip,
        userId: req.user?.id
      });

      const validation = await this.chatSettingsModel.validateSettings(settings);

      res.json({
        valid: validation.valid,
        errors: validation.errors,
        warnings: validation.warnings,
        timestamp: Date.now()
      });
    } catch (error) {
      this.errorHandler.handle(error, req, res);
    }
  };

  /**
   * Reset chat settings to defaults
   */
  resetToDefaults = async (req, res) => {
    try {
      const { chatId } = req.params;

      logger.chatSettings('reset_to_defaults_request', {
        chatId,
        ip: req.ip,
        userId: req.user?.id
      });

      const settings = await this.chatSettingsModel.resetToDefaults(chatId);

      res.json({
        success: true,
        message: 'Chat settings reset to defaults',
        settings,
        timestamp: Date.now()
      });
    } catch (error) {
      this.errorHandler.handle(error, req, res);
    }
  };
}

module.exports = new ChatSettingsController();