const express = require('express');
const router = express.Router();
const WhatsAppController = require('../controllers/WhatsAppController');
const AuthenticationMiddleware = require('../middlewares/authentication');
const ValidationMiddleware = require('../middlewares/validation');
const SecurityMiddleware = require('../middlewares/security');

// Get rate limiters
const messageRateLimiter = SecurityMiddleware.getRateLimiter('message');
const apiRateLimiter = SecurityMiddleware.getRateLimiter('api');

/**
 * WhatsApp API Routes
 * Most routes require authentication and WhatsApp readiness
 */

// Public routes (limited access)
router.get('/status',
  apiRateLimiter,
  WhatsAppController.getStatus
);

router.get('/client-info',
  apiRateLimiter,
  WhatsAppController.getClientInfo
);

// Protected routes (require authentication)
router.use(AuthenticationMiddleware.authenticate);

// Message sending (require WhatsApp readiness)
router.post('/send',
  messageRateLimiter,
  ValidationMiddleware.validateBody('sendMessage'),
  ValidationMiddleware.requireWhatsAppReady,
  WhatsAppController.sendMessage
);

router.post('/send-dashboard',
  messageRateLimiter,
  ValidationMiddleware.validateBody('sendDashboardMessage'),
  ValidationMiddleware.requireWhatsAppReady,
  WhatsAppController.sendDashboardMessage
);

// Chat state management
router.post('/typing',
  ValidationMiddleware.validateBody('typing'),
  ValidationMiddleware.requireWhatsAppReady,
  WhatsAppController.sendTypingState
);

router.post('/clear-state',
  ValidationMiddleware.validateBody('chatId'),
  WhatsAppController.clearChatState
);

// Chat management
router.get('/chats',
  ValidationMiddleware.validateQuery('pagination'),
  WhatsAppController.getChats
);

router.get('/chats/:chatId',
  ValidationMiddleware.validateParams(ValidationMiddleware.commonSchemas.chatId),
  WhatsAppController.getChat
);

router.get('/chats/:chatId/messages',
  ValidationMiddleware.validateParams(ValidationMiddleware.commonSchemas.chatId),
  ValidationMiddleware.validateQuery('pagination'),
  WhatsAppController.getMessages
);

// Message search and management
router.get('/messages/search',
  ValidationMiddleware.validateQuery('pagination'),
  WhatsAppController.searchMessages
);

router.get('/messages/:messageId',
  ValidationMiddleware.validateParams(ValidationMiddleware.commonSchemas.messageId),
  WhatsAppController.getMessageById
);

router.put('/messages/:messageId/status',
  ValidationMiddleware.validateParams(ValidationMiddleware.commonSchemas.messageId),
  ValidationMiddleware.validateBody('messageStatus'),
  WhatsAppController.updateMessageStatus
);

router.delete('/messages/:messageId',
  ValidationMiddleware.validateParams(ValidationMiddleware.commonSchemas.messageId),
  WhatsAppController.deleteMessage
);

router.delete('/chats/:chatId/messages',
  ValidationMiddleware.validateParams(ValidationMiddleware.commonSchemas.chatId),
  WhatsAppController.deleteMessagesByChatId
);

// Analytics and statistics
router.get('/stats',
  WhatsAppController.getMessageStats
);

router.get('/stats/type-distribution',
  WhatsAppController.getMessageTypeDistribution
);

router.get('/stats/daily-count',
  WhatsAppController.getDailyMessageCount
);

router.get('/stats/top-contacts',
  WhatsAppController.getTopContacts
);

// Recent messages
router.get('/messages/recent',
  WhatsAppController.getRecentMessages
);

// Cache management
router.post('/clear-cache',
  WhatsAppController.clearCache
);

// Message cleanup
router.post('/cleanup',
  ValidationMiddleware.validateBody('cleanup'),
  WhatsAppController.cleanupMessages
);

module.exports = router;