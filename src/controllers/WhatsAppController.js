const logger = require('../config/logger');
const WhatsAppService = require('../services/WhatsAppService');
const WebhookService = require('../services/WebhookService');
const ErrorHandler = require('../middlewares/errorHandler');

class WhatsAppController {
  constructor() {
    this.whatsappService = WhatsAppService;
    this.webhookService = WebhookService;
    this.errorHandler = ErrorHandler;
  }

  /**
   * Get WhatsApp client status
   */
  getStatus = async (req, res) => {
    try {
      const status = this.whatsappService.getStatus();
      const clientInfo = this.whatsappService.getClientInfo();

      res.json({
        status,
        clientInfo,
        timestamp: Date.now()
      });
    } catch (error) {
      this.errorHandler.handle(error, req, res);
    }
  };

  /**
   * Send message (original endpoint)
   */
  sendMessage = async (req, res) => {
    try {
      const { to, message } = req.body;

      logger.whatsapp('send_message_request', {
        to,
        message: message.substring(0, 50) + '...',
        ip: req.ip
      });

      const result = await this.whatsappService.sendMessage(to, message);

      res.json({
        success: true,
        message: `Message sent to ${to}`,
        messageId: result.messageId,
        timestamp: result.timestamp
      });
    } catch (error) {
      this.errorHandler.handle(error, req, res);
    }
  };

  /**
   * Send message from dashboard
   */
  sendDashboardMessage = async (req, res) => {
    try {
      const { chatId, message } = req.body;

      logger.whatsapp('dashboard_send_message_request', {
        chatId,
        message: message.substring(0, 50) + '...',
        ip: req.ip,
        userId: req.user?.id
      });

      const result = await this.whatsappService.sendMessage(chatId, message);

      res.json({
        success: true,
        messageId: result.messageId,
        message: 'Message sent successfully',
        timestamp: result.timestamp
      });
    } catch (error) {
      this.errorHandler.handle(error, req, res);
    }
  };

  /**
   * Send typing state
   */
  sendTypingState = async (req, res) => {
    try {
      const { to } = req.body;

      logger.whatsapp('typing_state_request', {
        to,
        ip: req.ip
      });

      await this.whatsappService.sendTypingState(to);

      res.json({
        success: true,
        message: `Typing state sent to ${to}`
      });
    } catch (error) {
      this.errorHandler.handle(error, req, res);
    }
  };

  /**
   * Clear chat state
   */
  clearChatState = async (req, res) => {
    try {
      const { chatId } = req.body;

      logger.whatsapp('clear_chat_state_request', {
        chatId,
        ip: req.ip
      });

      await this.whatsappService.clearChatState(chatId);

      res.json({
        success: true,
        message: `Chat state cleared for ${chatId}`
      });
    } catch (error) {
      this.errorHandler.handle(error, req, res);
    }
  };

  /**
   * Get chats
   */
  getChats = async (req, res) => {
    try {
      const { page = 1, limit = 50 } = req.query;
      const validatedLimit = Math.min(parseInt(limit), 100);
      const validatedPage = Math.max(parseInt(page), 1);

      logger.whatsapp('get_chats_request', {
        page: validatedPage,
        limit: validatedLimit,
        ip: req.ip
      });

      const chats = await this.whatsappService.getChats();

      // Apply pagination
      const offset = (validatedPage - 1) * validatedLimit;
      const paginatedChats = chats.slice(offset, offset + validatedLimit);

      res.json({
        chats: paginatedChats,
        pagination: {
          page: validatedPage,
          limit: validatedLimit,
          total: chats.length,
          totalPages: Math.ceil(chats.length / validatedLimit),
          hasMore: offset + validatedLimit < chats.length
        },
        timestamp: Date.now()
      });
    } catch (error) {
      this.errorHandler.handle(error, req, res);
    }
  };

  /**
   * Get chat by ID
   */
  getChat = async (req, res) => {
    try {
      const { chatId } = req.params;

      logger.whatsapp('get_chat_request', {
        chatId,
        ip: req.ip
      });

      const chat = await this.whatsappService.getChat(chatId);

      if (!chat) {
        throw this.errorHandler.createNotFoundError('Chat');
      }

      res.json({
        chat,
        timestamp: Date.now()
      });
    } catch (error) {
      this.errorHandler.handle(error, req, res);
    }
  };

  /**
   * Get messages from chat
   */
  getMessages = async (req, res) => {
    try {
      const { chatId } = req.params;
      const { limit = 50 } = req.query;
      const validatedLimit = Math.min(parseInt(limit), 200);

      logger.whatsapp('get_messages_request', {
        chatId,
        limit: validatedLimit,
        ip: req.ip
      });

      const messages = await this.whatsappService.getMessages(chatId, validatedLimit);

      res.json({
        messages,
        pagination: {
          limit: validatedLimit,
          count: messages.length,
          hasMore: messages.length === validatedLimit
        },
        timestamp: Date.now()
      });
    } catch (error) {
      this.errorHandler.handle(error, req, res);
    }
  };

  /**
   * Search messages
   */
  searchMessages = async (req, res) => {
    try {
      const { query, chatId, limit = 50 } = req.query;

      if (!query || query.trim().length === 0) {
        throw this.errorHandler.createValidationError([{
          field: 'query',
          message: 'Search query is required'
        }]);
      }

      logger.whatsapp('search_messages_request', {
        query: query.substring(0, 50) + '...',
        chatId,
        limit,
        ip: req.ip
      });

      const messages = await this.whatsappService.searchMessages(query, chatId, parseInt(limit));

      res.json({
        messages,
        search: {
          query,
          chatId,
          resultCount: messages.length
        },
        timestamp: Date.now()
      });
    } catch (error) {
      this.errorHandler.handle(error, req, res);
    }
  };

  /**
   * Get client info
   */
  getClientInfo = async (req, res) => {
    try {
      const clientInfo = this.whatsappService.getClientInfo();

      if (!clientInfo) {
        throw this.errorHandler.createError('WhatsAppNotReadyError', 'WhatsApp client not ready');
      }

      res.json({
        clientInfo,
        timestamp: Date.now()
      });
    } catch (error) {
      this.errorHandler.handle(error, req, res);
    }
  };

  /**
   * Clear WhatsApp cache
   */
  clearCache = async (req, res) => {
    try {
      logger.whatsapp('clear_cache_request', {
        ip: req.ip,
        userId: req.user?.id
      });

      this.whatsappService.clearCache();

      res.json({
        success: true,
        message: 'WhatsApp cache cleared successfully',
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
      const { chatId, days = 30 } = req.query;

      logger.whatsapp('get_message_stats_request', {
        chatId,
        days,
        ip: req.ip
      });

      const stats = await this.whatsappService.getMessageStats(chatId, parseInt(days));

      res.json({
        stats,
        filters: {
          chatId,
          days: parseInt(days)
        },
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
      const { chatId, days = 30 } = req.query;

      logger.whatsapp('get_message_type_distribution_request', {
        chatId,
        days,
        ip: req.ip
      });

      const distribution = await this.whatsappService.getMessageTypeDistribution(chatId, parseInt(days));

      res.json({
        distribution,
        filters: {
          chatId,
          days: parseInt(days)
        },
        timestamp: Date.now()
      });
    } catch (error) {
      this.errorHandler.handle(error, req, res);
    }
  };

  /**
   * Get daily message count
   */
  getDailyMessageCount = async (req, res) => {
    try {
      const { chatId, days = 30 } = req.query;

      logger.whatsapp('get_daily_message_count_request', {
        chatId,
        days,
        ip: req.ip
      });

      const dailyCount = await this.whatsappService.getDailyCount(chatId, parseInt(days));

      res.json({
        dailyCount,
        filters: {
          chatId,
          days: parseInt(days)
        },
        timestamp: Date.now()
      });
    } catch (error) {
      this.errorHandler.handle(error, req, res);
    }
  };

  /**
   * Get top contacts
   */
  getTopContacts = async (req, res) => {
    try {
      const { limit = 10, days = 30 } = req.query;

      logger.whatsapp('get_top_contacts_request', {
        limit,
        days,
        ip: req.ip
      });

      const contacts = await this.whatsappService.getTopContacts(parseInt(limit), parseInt(days));

      res.json({
        contacts,
        filters: {
          limit: parseInt(limit),
          days: parseInt(days)
        },
        timestamp: Date.now()
      });
    } catch (error) {
      this.errorHandler.handle(error, req, res);
    }
  };

  /**
   * Get recent messages
   */
  getRecentMessages = async (req, res) => {
    try {
      const { limit = 50 } = req.query;

      logger.whatsapp('get_recent_messages_request', {
        limit,
        ip: req.ip
      });

      const messages = await this.whatsappService.getRecentMessages(parseInt(limit));

      res.json({
        messages,
        count: messages.length,
        timestamp: Date.now()
      });
    } catch (error) {
      this.errorHandler.handle(error, req, res);
    }
  };

  /**
   * Get message by ID
   */
  getMessageById = async (req, res) => {
    try {
      const { messageId } = req.params;

      logger.whatsapp('get_message_by_id_request', {
        messageId,
        ip: req.ip
      });

      const message = await this.whatsappService.getMessageById(messageId);

      if (!message) {
        throw this.errorHandler.createNotFoundError('Message');
      }

      res.json({
        message,
        timestamp: Date.now()
      });
    } catch (error) {
      this.errorHandler.handle(error, req, res);
    }
  };

  /**
   * Update message status
   */
  updateMessageStatus = async (req, res) => {
    try {
      const { messageId } = req.params;
      const { ack } = req.body;

      logger.whatsapp('update_message_status_request', {
        messageId,
        ack,
        ip: req.ip
      });

      const updated = await this.whatsappService.updateMessageStatus(messageId, parseInt(ack));

      if (!updated) {
        throw this.errorHandler.createNotFoundError('Message');
      }

      res.json({
        success: true,
        message: 'Message status updated successfully',
        timestamp: Date.now()
      });
    } catch (error) {
      this.errorHandler.handle(error, req, res);
    }
  };

  /**
   * Delete message
   */
  deleteMessage = async (req, res) => {
    try {
      const { messageId } = req.params;

      logger.whatsapp('delete_message_request', {
        messageId,
        ip: req.ip,
        userId: req.user?.id
      });

      const deleted = await this.whatsappService.deleteMessage(messageId);

      if (!deleted) {
        throw this.errorHandler.createNotFoundError('Message');
      }

      res.json({
        success: true,
        message: 'Message deleted successfully',
        timestamp: Date.now()
      });
    } catch (error) {
      this.errorHandler.handle(error, req, res);
    }
  };

  /**
   * Delete messages by chat ID
   */
  deleteMessagesByChatId = async (req, res) => {
    try {
      const { chatId } = req.params;

      logger.whatsapp('delete_messages_by_chat_id_request', {
        chatId,
        ip: req.ip,
        userId: req.user?.id
      });

      const deletedCount = await this.whatsappService.deleteByChatId(chatId);

      res.json({
        success: true,
        message: `${deletedCount} messages deleted successfully`,
        deletedCount,
        timestamp: Date.now()
      });
    } catch (error) {
      this.errorHandler.handle(error, req, res);
    }
  };

  /**
   * Cleanup old messages
   */
  cleanupMessages = async (req, res) => {
    try {
      const { retentionDays = 90 } = req.body;

      logger.whatsapp('cleanup_messages_request', {
        retentionDays,
        ip: req.ip,
        userId: req.user?.id
      });

      const deletedCount = await this.whatsappService.cleanup(parseInt(retentionDays));

      res.json({
        success: true,
        message: `${deletedCount} old messages cleaned up successfully`,
        deletedCount,
        retentionDays,
        timestamp: Date.now()
      });
    } catch (error) {
      this.errorHandler.handle(error, req, res);
    }
  };

  /**
   * Get detailed message statistics with human/AI breakdown
   */
  getDetailedMessageStats = async (req, res) => {
    try {
      const { chatId, days = 30 } = req.query;

      logger.whatsapp('get_detailed_message_stats_request', {
        chatId,
        days,
        ip: req.ip
      });

      const stats = await this.whatsappService.getDetailedMessageStats(chatId, parseInt(days));

      res.json({
        stats,
        filters: {
          chatId,
          days: parseInt(days)
        },
        timestamp: Date.now()
      });
    } catch (error) {
      this.errorHandler.handle(error, req, res);
    }
  };
}

module.exports = new WhatsAppController();