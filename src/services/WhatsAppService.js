const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const EventEmitter = require('events');
const logger = require('../config/logger');
const config = require('../config/config');
const MessageModel = require('../models/Message');
const Analytics = require('../models/Analytics');
const ChatSettings = require('../models/ChatSettings');
const FailedWebhook = require('../models/FailedWebhook');

class WhatsAppService extends EventEmitter {
  constructor() {
    super();
    this.client = null;
    this.isReady = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = config.get('WHATSAPP_RECONNECT_ATTEMPTS');
    this.reconnectDelay = config.get('WHATSAPP_RECONNECT_DELAY');
    this.messageQueue = [];
    this.isProcessingQueue = false;
    this.chatCache = new Map();
    this.lastCacheUpdate = 0;
    this.cacheTTL = config.get('CACHE_CHAT_TTL');
  }

  /**
   * Initialize WhatsApp client
   */
  async initialize() {
    try {
      logger.whatsapp('initializing_client');

      this.client = new Client({
        authStrategy: new LocalAuth({
          clientId: "whatsapp-bot",
          dataPath: './.wwebjs_auth/'
        }),
        puppeteer: {
          args: config.get('puppeteerArgsArray'),
          headless: true,
          timeout: 60000
        },
        restartOnAuthFail: true,
        qrMaxRetries: 3,
        authTimeoutMs: 60000,
        takeoverOnConflict: true,
        takeoverTimeoutMs: 0
      });

      this.setupEventHandlers();
      await this.client.initialize();

      logger.whatsapp('client_initialized');
    } catch (error) {
      logger.error('Failed to initialize WhatsApp client', { error: error.message });
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Setup WhatsApp client event handlers
   */
  setupEventHandlers() {
    // QR Code event
    this.client.on('qr', async (qr) => {
      logger.whatsapp('qr_generated');
      qrcode.generate(qr, { small: true });
      this.emit('qr', { qr });
      this.isReady = false;
    });

    // Authentication failure
    this.client.on('auth_failure', (message) => {
      logger.error('WhatsApp authentication failed', { message });
      this.isReady = false;
      this.emit('auth_failure', { message });
      this.clearCache();
    });

    // Ready event
    this.client.on('ready', () => {
      logger.whatsapp('client_ready', {
        wid: this.client.info.wid._serialized,
        platform: this.client.info.platform,
        connected: this.client.info.connected
      });

      this.isReady = true;
      this.reconnectAttempts = 0;
      this.clearCache();
      this.emit('ready', {
        wid: this.client.info.wid._serialized,
        platform: this.client.info.platform,
        connected: this.client.info.connected
      });

      // Process any queued messages
      if (this.messageQueue.length > 0) {
        logger.whatsapp('processing_queued_messages', { queueSize: this.messageQueue.length });
        this.processMessageQueue();
      }
    });

    // Disconnected event
    this.client.on('disconnected', (reason) => {
      logger.warn('WhatsApp client disconnected', { reason });
      this.isReady = false;
      this.clearCache();
      this.emit('disconnected', { reason });

      // Attempt to reconnect
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        logger.whatsapp('attempting_reconnect', {
          attempt: this.reconnectAttempts,
          maxAttempts: this.maxReconnectAttempts
        });

        setTimeout(() => {
          this.attemptReconnect();
        }, this.reconnectDelay * this.reconnectAttempts);
      } else {
        logger.error('Max reconnection attempts reached');
        this.emit('max_reconnect_reached');
      }
    });

    // Message handler
    this.client.on('message', async (message) => {
      try {
        await this.handleIncomingMessage(message);
      } catch (error) {
        logger.error('Failed to handle incoming message', { error: error.message });
      }
    });

    // Message create handler (sent messages)
    this.client.on('message_create', async (message) => {
      try {
        if (message.fromMe) {
          await this.handleSentMessage(message);
        }
      } catch (error) {
        logger.error('Failed to handle sent message', { error: error.message });
      }
    });

    // Message ack handler
    this.client.on('message_ack', async (message, ack) => {
      try {
        await this.handleMessageAck(message, ack);
      } catch (error) {
        logger.error('Failed to handle message ack', { error: error.message });
      }
    });

    // State change handler
    this.client.on('change_state', (state) => {
      logger.whatsapp('state_changed', { state });
      this.emit('state_changed', { state });
    });
  }

  /**
   * Handle incoming message
   */
  async handleIncomingMessage(message) {
    try {
      logger.whatsapp('incoming_message', {
        messageId: message.id._serialized,
        from: message.from,
        body: message.body?.substring(0, 50) + '...',
        type: message.type,
        hasMedia: message.hasMedia,
        fromMe: message.fromMe
      });

      // Get chat information
      const chat = await message.getChat();
      const chatId = chat.id._serialized;

      // Check AI mode setting
      const shouldSendWebhook = await this.shouldProcessWebhook(chatId);

      // Store message in database
      await MessageModel.store({
        messageId: message.id._serialized,
        chatId: chatId,
        senderId: message.from,
        body: message.body,
        type: message.type,
        direction: 'incoming',
        senderType: 'customer',
        timestamp: message.timestamp,
        fromMe: message.fromMe,
        hasMedia: message.hasMedia,
        ack: message.ack,
        isAiGenerated: false
      });

      // Handle media if present
      let mediaData = null;
      if (message.hasMedia) {
        mediaData = await this.handleMediaDownload(message);
      }

      // Prepare message payload
      const messagePayload = {
        id: message.id,
        body: message.body,
        type: message.type,
        timestamp: message.timestamp,
        from: message.from,
        to: message.to,
        author: message.author,
        fromMe: message.fromMe,
        hasMedia: message.hasMedia,
        ack: message.ack,
        vCards: message.vCards,
        location: message.location,
        links: message.links,
        mentionedIds: message.mentionedIds || [],
        _data: message._data,
        media: mediaData
      };

      // Send to webhook if AI mode is enabled
      if (shouldSendWebhook) {
        await this.queueWebhookMessage(messagePayload);
      }

      // Emit to dashboard
      this.emit('new_message', {
        chatId,
        messageId: message.id._serialized,
        body: message.body || '',
        fromMe: message.fromMe,
        timestamp: message.timestamp,
        type: message.type,
        hasMedia: message.hasMedia,
        sender: message.from,
        to: message.to,
        ack: message.ack,
        author: message.author || null,
        source: 'user'
      });

      // Update chat list
      this.emit('chat_updated', {
        chatId,
        lastMessage: message.body || (message.hasMedia ? '📎 Media' : 'Empty message'),
        lastTimestamp: message.timestamp,
        unreadCount: chat.unreadCount || 0
      });

      // Log analytics with proper message tracking
      await Analytics.logMessage(chatId, 'incoming', 'customer', {
        messageId: message.id._serialized,
        message: message.body,
        hasMedia: message.hasMedia,
        messageType: message.type,
        webhookSent: shouldSendWebhook
      });

      // Clear cache to trigger refresh
      this.clearCache();

    } catch (error) {
      logger.error('Error processing incoming message', { error: error.message });
      throw error;
    }
  }

  /**
   * Handle sent message (from other devices)
   */
  async handleSentMessage(message) {
    try {
      logger.whatsapp('sent_message', {
        messageId: message.id._serialized,
        to: message.to,
        body: message.body?.substring(0, 50) + '...',
        type: message.type
      });

      const chat = await message.getChat();
      const chatId = chat.id._serialized;

      // Store message in database
      await MessageModel.store({
        messageId: message.id._serialized,
        chatId: chatId,
        senderId: this.client.info.wid._serialized,
        body: message.body,
        type: message.type,
        direction: 'outgoing',
        senderType: 'human', // Sent from another device by human
        timestamp: message.timestamp,
        fromMe: true,
        hasMedia: message.hasMedia,
        ack: message.ack,
        isAiGenerated: false
      });

      // Emit to dashboard
      this.emit('new_message', {
        chatId,
        messageId: message.id._serialized,
        body: message.body || '',
        fromMe: true,
        timestamp: message.timestamp,
        type: message.type,
        hasMedia: message.hasMedia,
        sender: this.client.info.wid._serialized,
        to: message.to,
        ack: message.ack,
        author: message.author || null,
        source: 'whatsapp_mobile'
      });

      // Update chat list
      this.emit('chat_updated', {
        chatId,
        lastMessage: message.body || (message.hasMedia ? '📎 Media' : 'Empty message'),
        lastTimestamp: message.timestamp,
        unreadCount: 0
      });

      // Clear cache
      this.clearCache();

    } catch (error) {
      logger.error('Error processing sent message', { error: error.message });
      throw error;
    }
  }

  /**
   * Handle message acknowledgment
   */
  async handleMessageAck(message, ack) {
    try {
      await MessageModel.updateStatus(message.id._serialized, ack);

      this.emit('message_ack', {
        messageId: message.id._serialized,
        ack,
        timestamp: Date.now()
      });
    } catch (error) {
      logger.error('Error handling message ack', { error: error.message });
    }
  }

  /**
   * Handle media download
   */
  async handleMediaDownload(message) {
    try {
      const media = await message.downloadMedia();

      // Check media size (limit 25MB)
      const mediaSize = Buffer.byteLength(media.data, 'base64');
      if (mediaSize > 25 * 1024 * 1024) {
        logger.warn('Media too large, skipping download', {
          messageId: message.id._serialized,
          size: mediaSize,
          mimetype: media.mimetype
        });

        return {
          error: 'Media too large',
          size: mediaSize,
          mimetype: media.mimetype
        };
      }

      logger.whatsapp('media_downloaded', {
        messageId: message.id._serialized,
        size: mediaSize,
        mimetype: media.mimetype
      });

      return {
        mimetype: media.mimetype,
        filename: media.filename || null,
        data: media.data,
        size: mediaSize
      };
    } catch (error) {
      logger.error('Failed to download media', { error: error.message });
      return {
        error: error.message,
        hasMedia: true
      };
    }
  }

  /**
   * Check if webhook should be processed for this chat
   */
  async shouldProcessWebhook(chatId) {
    try {
      const settings = await ChatSettings.get(chatId);
      return settings.aiMode;
    } catch (error) {
      logger.error('Error checking AI mode', { error: error.message, chatId });
      return true; // Default to true for backward compatibility
    }
  }

  /**
   * Queue webhook message for processing
   */
  async queueWebhookMessage(payload) {
    try {
      this.messageQueue.push({
        messageId: payload.id._serialized,
        payload: payload,
        timestamp: Date.now(),
        attempt: 0
      });

      if (!this.isProcessingQueue) {
        this.processMessageQueue();
      }
    } catch (error) {
      logger.error('Failed to queue webhook message', { error: error.message });
    }
  }

  /**
   * Process message queue
   */
  async processMessageQueue() {
    if (this.isProcessingQueue || this.messageQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;
    logger.whatsapp('processing_webhook_queue', { queueSize: this.messageQueue.length });

    while (this.messageQueue.length > 0) {
      const item = this.messageQueue.shift();
      try {
        await this.emit('webhook_message', item.payload);
        logger.whatsapp('webhook_sent', { messageId: item.messageId });
      } catch (error) {
        logger.error('Failed to send webhook', { error: error.message });
        await FailedWebhook.log(item.messageId, item.payload, error, item.timestamp, item.attempt);
      }

      // Small delay between processing
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    this.isProcessingQueue = false;
    logger.whatsapp('webhook_queue_processed');
  }

  /**
   * Send message
   */
  async sendMessage(chatId, message) {
    if (!this.isReady) {
      throw new Error('WhatsApp client not ready');
    }

    try {
      logger.whatsapp('sending_message', { chatId, message: message.substring(0, 50) + '...' });

      const chat = await this.client.getChatById(chatId);
      await chat.clearState();
      const sentMessage = await this.client.sendMessage(chatId, message);

      // Store sent message
      await MessageModel.store({
        messageId: sentMessage.id._serialized,
        chatId: chatId,
        senderId: this.client.info.wid._serialized,
        body: message,
        type: 'chat',
        direction: 'outgoing',
        senderType: 'human', // Sent by human agent
        timestamp: sentMessage.timestamp,
        fromMe: true,
        hasMedia: false,
        ack: sentMessage.ack,
        isAiGenerated: false
      });

      // Log analytics with proper message tracking
      await Analytics.logMessage(chatId, 'outgoing', 'human', {
        messageId: sentMessage.id._serialized,
        message: message,
        source: 'dashboard',
        sentBy: 'human'
      });

      // Emit events
      this.emit('message_sent', {
        chatId,
        messageId: sentMessage.id._serialized,
        body: message,
        timestamp: sentMessage.timestamp,
        source: 'whatsapp_web'
      });

      this.emit('chat_updated', {
        chatId,
        lastMessage: message,
        lastTimestamp: sentMessage.timestamp,
        unreadCount: 0
      });

      this.clearCache();

      return {
        messageId: sentMessage.id._serialized,
        timestamp: sentMessage.timestamp,
        success: true
      };
    } catch (error) {
      logger.error('Failed to send message', { error: error.message, chatId });
      throw error;
    }
  }

  /**
   * Get chats
   */
  async getChats() {
    if (!this.isReady) {
      throw new Error('WhatsApp client not ready');
    }

    try {
      const now = Date.now();

      // Check cache first
      if (this.chatCache.has('all_chats') && (now - this.lastCacheUpdate) < this.cacheTTL) {
        return this.chatCache.get('all_chats');
      }

      logger.whatsapp('fetching_chats');

      const chats = await this.client.getChats();

      const formattedChats = chats
        .filter(chat => chat.lastMessage)
        .sort((a, b) => b.lastMessage.timestamp - a.lastMessage.timestamp)
        .map(chat => ({
          id: chat.id._serialized,
          name: chat.name || chat.id.user || 'Unknown Contact',
          isGroup: chat.isGroup,
          lastMessage: chat.lastMessage?.body || (chat.lastMessage?.hasMedia ? '📎 Media' : 'No message'),
          lastTimestamp: chat.lastMessage?.timestamp || 0,
          unreadCount: chat.unreadCount || 0,
          archived: chat.archived || false,
          pinned: chat.pinned || false,
          participants: chat.isGroup ? chat.participants : undefined,
          groupMetadata: chat.isGroup ? {
            createdAt: chat.createdAt,
            desc: chat.description,
            owner: chat.owner?._serialized,
            participants: chat.participants?.length
          } : undefined
        }));

      // Cache the result
      this.chatCache.set('all_chats', formattedChats);
      this.lastCacheUpdate = now;

      logger.whatsapp('chats_fetched', { count: formattedChats.length });

      return formattedChats;
    } catch (error) {
      logger.error('Failed to get chats', { error: error.message });
      throw error;
    }
  }

  /**
   * Get chat by ID
   */
  async getChat(chatId) {
    if (!this.isReady) {
      throw new Error('WhatsApp client not ready');
    }

    try {
      const chat = await this.client.getChatById(chatId);
      return {
        id: chat.id._serialized,
        name: chat.name || chat.id.user || 'Unknown Contact',
        isGroup: chat.isGroup,
        archived: chat.archived,
        pinned: chat.pinned,
        unreadCount: chat.unreadCount || 0,
        timestamp: chat.timestamp,
        lastMessage: chat.lastMessage ? {
          body: chat.lastMessage.body,
          timestamp: chat.lastMessage.timestamp,
          fromMe: chat.lastMessage.fromMe,
          hasMedia: chat.lastMessage.hasMedia
        } : null,
        participants: chat.isGroup ? chat.participants : undefined,
        groupMetadata: chat.isGroup ? {
          createdAt: chat.createdAt,
          desc: chat.description,
          owner: chat.owner?._serialized,
          participants: chat.participants?.length
        } : undefined
      };
    } catch (error) {
      logger.error('Failed to get chat', { error: error.message, chatId });
      throw error;
    }
  }

  /**
   * Get messages from chat
   */
  async getMessages(chatId, limit = 50) {
    if (!this.isReady) {
      throw new Error('WhatsApp client not ready');
    }

    try {
      const cacheKey = `messages_${chatId}_${limit}`;
      const now = Date.now();

      // Check cache first
      if (this.chatCache.has(cacheKey) && (now - this.chatCache.get(`${cacheKey}_timestamp`)) < 10000) {
        return this.chatCache.get(cacheKey);
      }

      logger.whatsapp('fetching_messages', { chatId, limit });

      const chat = await this.client.getChatById(chatId);
      const messages = await chat.fetchMessages({ limit });

      const formattedMessages = messages
        .sort((a, b) => a.timestamp - b.timestamp)
        .map(msg => ({
          id: msg.id._serialized,
          chatId: chatId,
          sender: msg.from,
          body: msg.body || '',
          timestamp: msg.timestamp,
          fromMe: msg.fromMe,
          type: msg.type,
          hasMedia: msg.hasMedia,
          ack: msg.ack,
          author: msg.author || null,
          vCards: msg.vCards || [],
          location: msg.location || null,
          links: msg.links || [],
          mentionedIds: msg.mentionedIds || [],
          source: msg.fromMe ? 'whatsapp_web' : 'user'
        }));

      // Cache the result
      this.chatCache.set(cacheKey, formattedMessages);
      this.chatCache.set(`${cacheKey}_timestamp`, now);

      logger.whatsapp('messages_fetched', { chatId, count: formattedMessages.length });

      return formattedMessages;
    } catch (error) {
      logger.error('Failed to get messages', { error: error.message, chatId });
      throw error;
    }
  }

  /**
   * Send typing state
   */
  async sendTypingState(chatId) {
    if (!this.isReady) {
      throw new Error('WhatsApp client not ready');
    }

    try {
      const chat = await this.client.getChatById(chatId);
      await chat.sendStateTyping();

      logger.whatsapp('typing_state_sent', { chatId });

      return true;
    } catch (error) {
      logger.error('Failed to send typing state', { error: error.message, chatId });
      throw error;
    }
  }

  /**
   * Clear chat state
   */
  async clearChatState(chatId) {
    if (!this.isReady) {
      throw new Error('WhatsApp client not ready');
    }

    try {
      const chat = await this.client.getChatById(chatId);
      await chat.clearState();

      logger.whatsapp('chat_state_cleared', { chatId });

      return true;
    } catch (error) {
      logger.error('Failed to clear chat state', { error: error.message, chatId });
      throw error;
    }
  }

  /**
   * Get client info
   */
  getClientInfo() {
    if (!this.client || !this.isReady) {
      return null;
    }

    return {
      wid: this.client.info.wid._serialized,
      platform: this.client.info.platform,
      connected: this.client.info.connected,
      phone: this.client.info.phone,
      name: this.client.info.name,
      battery: this.client.info.battery,
      plugged: this.client.info.plugged
    };
  }

  /**
   * Get status
   */
  getStatus() {
    return {
      isReady: this.isReady,
      reconnectAttempts: this.reconnectAttempts,
      maxReconnectAttempts: this.maxReconnectAttempts,
      messageQueueSize: this.messageQueue.length,
      isProcessingQueue: this.isProcessingQueue,
      cacheSize: this.chatCache.size,
      lastCacheUpdate: this.lastCacheUpdate
    };
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.chatCache.clear();
    this.lastCacheUpdate = 0;
    logger.whatsapp('cache_cleared');
  }

  /**
   * Attempt reconnection
   */
  async attemptReconnect() {
    try {
      logger.whatsapp('reconnecting_client');

      // Destroy existing client
      if (this.client) {
        await this.client.destroy();
      }

      // Create new client
      this.client = new Client({
        authStrategy: new LocalAuth({
          clientId: "whatsapp-bot",
          dataPath: './.wwebjs_auth/'
        }),
        puppeteer: {
          args: config.get('puppeteerArgsArray'),
          headless: true,
          timeout: 60000
        }
      });

      this.setupEventHandlers();
      await this.client.initialize();

    } catch (error) {
      logger.error('Failed to reconnect', { error: error.message });
      this.emit('reconnect_failed', { error: error.message });
    }
  }

  /**
   * Destroy client
   */
  async destroy() {
    try {
      if (this.client) {
        await this.client.destroy();
      }
      this.isReady = false;
      this.clearCache();
      this.messageQueue.length = 0;
      this.isProcessingQueue = false;

      logger.whatsapp('client_destroyed');
    } catch (error) {
      logger.error('Failed to destroy client', { error: error.message });
    }
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      const clientInfo = this.getClientInfo();
      const status = this.getStatus();

      return {
        healthy: this.isReady && !!clientInfo,
        clientInfo,
        status,
        timestamp: Date.now()
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message,
        timestamp: Date.now()
      };
    }
  }

  /**
   * Get detailed message statistics with human/AI breakdown
   */
  async getDetailedMessageStats(chatId = null, days = 30) {
    try {
      logger.whatsapp('getting_detailed_message_stats', { chatId, days });

      const stats = await Analytics.getDetailedMessageStats(chatId, days);

      logger.whatsapp('detailed_message_stats_retrieved', {
        chatId,
        days,
        totalMessages: stats.totalMessages,
        humanMessages: stats.humanMessages,
        aiMessages: stats.aiMessages
      });

      return stats;
    } catch (error) {
      logger.error('Failed to get detailed message stats', { error: error.message, chatId, days });
      throw error;
    }
  }
}

module.exports = new WhatsAppService();