const { EventEmitter } = require('events');
const axios = require('axios');
const crypto = require('crypto');
const logger = require('../config/logger');
const config = require('../config/config');
const FailedWebhook = require('../models/FailedWebhook');
const Analytics = require('../models/Analytics');
const MessageModel = require('../models/Message');

class WebhookService extends EventEmitter {
  constructor() {
    super();
    this.queue = [];
    this.isProcessing = false;
    this.retryAttempts = config.get('WEBHOOK_RETRY_ATTEMPTS');
    this.retryDelay = config.get('WEBHOOK_RETRY_DELAY');
    this.timeout = config.get('WEBHOOK_TIMEOUT');
    this.maxQueueSize = config.get('WEBHOOK_QUEUE_SIZE');
    this.stats = {
      totalSent: 0,
      totalFailed: 0,
      totalRetries: 0,
      startTime: Date.now()
    };
  }

  /**
   * Send webhook with retry mechanism
   */
  async send(url, payload, options = {}) {
    const requestId = crypto.randomBytes(16).toString('hex');
    const attempt = options.attempt || 1;

    try {
      logger.webhook('sending_webhook', {
        requestId,
        url,
        messageId: payload.id?._serialized || payload.id,
        attempt,
        maxAttempts: this.retryAttempts
      });

      const response = await axios.post(url, payload, {
        timeout: this.timeout,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'WhatsApp-Bot/2.0',
          'X-Request-ID': requestId,
          'X-Retry-Attempt': attempt.toString(),
          'X-Webhook-Source': 'whatsapp-dashboard-bot',
          'X-Timestamp': Date.now().toString()
        },
        validateStatus: (status) => status < 400,
        maxRedirects: 3,
        maxContentLength: 50 * 1024 * 1024 // 50MB
      });

      this.stats.totalSent++;

      logger.webhook('webhook_sent_successfully', {
        requestId,
        status: response.status,
        messageId: payload.id?._serialized || payload.id,
        responseTime: response.headers['x-response-time'] || 'N/A'
      });

      this.emit('webhook_sent', {
        requestId,
        payload,
        response: {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers
        }
      });

      return response;
    } catch (error) {
      this.stats.totalFailed++;

      logger.error('Webhook send failed', {
        requestId,
        error: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        messageId: payload.id?._serialized || payload.id,
        attempt
      });

      if (attempt >= this.retryAttempts) {
        // Log failed webhook for retry later
        await FailedWebhook.log(
          payload.id?._serialized || payload.id,
          payload,
          error,
          Date.now(),
          attempt
        );

        this.emit('webhook_failed', {
          requestId,
          payload,
          error: error.message,
          finalAttempt: true
        });

        throw new Error(`Webhook failed after ${this.retryAttempts} attempts: ${error.message}`);
      }

      // Exponential backoff
      const delay = this.retryDelay * Math.pow(2, attempt - 1);

      logger.webhook('retrying_webhook', {
        requestId,
        delay,
        attempt,
        maxAttempts: this.retryAttempts
      });

      this.stats.totalRetries++;

      await new Promise(resolve => setTimeout(resolve, delay));
      return this.send(url, payload, { ...options, attempt: attempt + 1 });
    }
  }

  /**
   * Queue webhook for processing
   */
  async queue(url, payload, priority = 'normal') {
    try {
      // Check queue size limit
      if (this.queue.length >= this.maxQueueSize) {
        logger.warn('Webhook queue full, dropping message', {
          queueSize: this.queue.length,
          maxSize: this.maxQueueSize,
          messageId: payload.id?._serialized || payload.id
        });

        // Log failed webhook
        await FailedWebhook.log(
          payload.id?._serialized || payload.id,
          payload,
          new Error('Queue full'),
          Date.now(),
          0
        );

        return false;
      }

      const webhookItem = {
        id: crypto.randomBytes(16).toString('hex'),
        url,
        payload,
        timestamp: Date.now(),
        attempt: 0,
        priority,
        maxRetries: this.retryAttempts
      };

      // Add to queue based on priority
      if (priority === 'high') {
        this.queue.unshift(webhookItem);
      } else {
        this.queue.push(webhookItem);
      }

      logger.webhook('webhook_queued', {
        webhookId: webhookItem.id,
        messageId: payload.id?._serialized || payload.id,
        queueSize: this.queue.length,
        priority
      });

      // Start processing if not already running
      if (!this.isProcessing) {
        this.processQueue();
      }

      return true;
    } catch (error) {
      logger.error('Failed to queue webhook', { error: error.message });
      return false;
    }
  }

  /**
   * Process webhook queue
   */
  async processQueue() {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;
    logger.webhook('processing_webhook_queue', { queueSize: this.queue.length });

    while (this.queue.length > 0) {
      const item = this.queue.shift();

      try {
        await this.send(item.url, item.payload, {
          attempt: item.attempt + 1,
          maxRetries: item.maxRetries
        });

        // Remove from failed webhooks if it was there
        await FailedWebhook.deleteByMessageId(item.payload.id?._serialized || item.payload.id);

        logger.webhook('webhook_processed_successfully', {
          webhookId: item.id,
          messageId: item.payload.id?._serialized || item.payload.id,
          queueSize: this.queue.length
        });

      } catch (error) {
        logger.error('Failed to process webhook from queue', {
          webhookId: item.id,
          error: error.message,
          messageId: item.payload.id?._serialized || item.payload.id
        });

        // Re-queue for later retry with lower priority
        if (item.attempt < item.maxRetries) {
          item.attempt++;
          item.priority = 'low';
          this.queue.push(item);
        }
      }

      // Small delay between processing
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    this.isProcessing = false;
    logger.webhook('webhook_queue_processing_completed');
  }

  /**
   * Process AI reply webhook (from N8N)
   */
  async processAIReply(replyData) {
    try {
      const { chatId, message, originalMessageId } = replyData;

      logger.webhook('processing_ai_reply', {
        chatId,
        originalMessageId,
        message: message.substring(0, 50) + '...'
      });

      // Validate required fields
      if (!chatId || !message) {
        throw new Error('chatId and message are required for AI reply');
      }

      // Log AI reply analytics
      await Analytics.log('ai_reply', chatId, true, {
        originalMessageId,
        message,
        timestamp: Date.now()
      });

      // Store AI message in database if it has an ID
      if (replyData.messageId) {
        await MessageModel.store({
          messageId: replyData.messageId,
          chatId,
          senderId: 'ai_system',
          body: message,
          type: 'chat',
          timestamp: Math.floor(Date.now() / 1000),
          fromMe: true,
          hasMedia: false,
          ack: 1,
          isAiGenerated: true
        });
      }

      this.emit('ai_reply_processed', {
        chatId,
        message,
        originalMessageId,
        messageId: replyData.messageId,
        timestamp: Date.now()
      });

      return {
        success: true,
        chatId,
        messageId: replyData.messageId,
        message: 'AI reply processed successfully'
      };
    } catch (error) {
      logger.error('Failed to process AI reply', { error: error.message, replyData });
      throw error;
    }
  }

  /**
   * Retry failed webhooks
   */
  async retryFailed(limit = 50) {
    try {
      const failedWebhooks = await FailedWebhook.getFailedWebhooks(3, limit);

      if (failedWebhooks.length === 0) {
        return { message: 'No failed webhooks to retry', count: 0 };
      }

      let retryCount = 0;

      for (const failed of failedWebhooks) {
        try {
          const success = await this.queue(
            config.get('N8N_WEBHOOK_URL'),
            failed.payload,
            'high'
          );

          if (success) {
            await FailedWebhook.updateRetryCount(failed.id, failed.retryCount + 1);
            retryCount++;
          }
        } catch (error) {
          logger.error('Failed to retry webhook', { error: error.message, id: failed.id });
        }
      }

      logger.webhook('failed_webhooks_retried', {
        totalFailed: failedWebhooks.length,
        successfullyRetried: retryCount
      });

      return {
        message: 'Failed webhooks retry initiated',
        total: failedWebhooks.length,
        retried: retryCount
      };
    } catch (error) {
      logger.error('Failed to retry failed webhooks', { error: error.message });
      throw error;
    }
  }

  /**
   * Get webhook statistics
   */
  getStats() {
    const uptime = Date.now() - this.stats.startTime;
    const successRate = this.stats.totalSent > 0
      ? ((this.stats.totalSent / (this.stats.totalSent + this.stats.totalFailed)) * 100).toFixed(2)
      : 0;

    return {
      totalSent: this.stats.totalSent,
      totalFailed: this.stats.totalFailed,
      totalRetries: this.stats.totalRetries,
      successRate: `${successRate}%`,
      queueSize: this.queue.length,
      isProcessing: this.isProcessing,
      uptime: `${Math.floor(uptime / 1000)}s`,
      maxQueueSize: this.maxQueueSize,
      retryAttempts: this.retryAttempts,
      timeout: this.timeout
    };
  }

  /**
   * Get queue status
   */
  getQueueStatus() {
    const highPriority = this.queue.filter(item => item.priority === 'high').length;
    const normalPriority = this.queue.filter(item => item.priority === 'normal').length;
    const lowPriority = this.queue.filter(item => item.priority === 'low').length;

    return {
      totalSize: this.queue.length,
      isProcessing: this.isProcessing,
      highPriority,
      normalPriority,
      lowPriority,
      oldestItem: this.queue.length > 0 ? this.queue[0].timestamp : null,
      newestItem: this.queue.length > 0 ? this.queue[this.queue.length - 1].timestamp : null
    };
  }

  /**
   * Clear queue
   */
  clearQueue() {
    const size = this.queue.length;
    this.queue.length = 0;
    this.isProcessing = false;

    logger.webhook('queue_cleared', { clearedItems: size });

    return { clearedItems: size };
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      const stats = this.getStats();
      const queueStatus = this.getQueueStatus();

      // Check if N8N webhook URL is configured
      const webhookUrl = config.get('N8N_WEBHOOK_URL');
      const webhookConfigured = !!webhookUrl;

      return {
        healthy: webhookConfigured && stats.totalFailed < stats.totalSent * 0.1, // Less than 10% failure rate
        webhookConfigured,
        webhookUrl: webhookUrl ? webhookUrl.substring(0, 50) + '...' : 'Not configured',
        stats,
        queueStatus,
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
   * Test webhook endpoint
   */
  async testEndpoint(url, timeout = 10000) {
    try {
      const testPayload = {
        test: true,
        timestamp: Date.now(),
        source: 'whatsapp-dashboard-bot',
        messageId: 'test_' + crypto.randomBytes(8).toString('hex')
      };

      const response = await axios.post(url, testPayload, {
        timeout,
        headers: {
          'Content-Type': 'application/json',
          'X-Test-Request': 'true'
        }
      });

      return {
        success: true,
        status: response.status,
        statusText: response.statusText,
        responseTime: response.headers['x-response-time'] || 'N/A'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText
      };
    }
  }

  /**
   * Export webhook data
   */
  async export(filters = {}) {
    try {
      const data = await FailedWebhook.export(filters);
      const stats = this.getStats();
      const queueStatus = this.getQueueStatus();

      return {
        failedWebhooks: data,
        stats,
        queueStatus,
        exportTime: Date.now()
      };
    } catch (error) {
      logger.error('Failed to export webhook data', { error: error.message });
      throw error;
    }
  }

  /**
   * Cleanup old failed webhooks
   */
  async cleanup(retentionDays = 30) {
    try {
      const deletedCount = await FailedWebhook.cleanup(retentionDays);

      logger.webhook('webhook_cleanup_completed', {
        deletedCount,
        retentionDays
      });

      return { deletedCount, retentionDays };
    } catch (error) {
      logger.error('Failed to cleanup failed webhooks', { error: error.message });
      throw error;
    }
  }
}

module.exports = new WebhookService();