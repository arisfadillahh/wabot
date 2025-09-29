const express = require('express');
const router = express.Router();
const ChatSettingsController = require('../controllers/ChatSettingsController');
const AuthenticationMiddleware = require('../middlewares/authentication');
const ValidationMiddleware = require('../middlewares/validation');
const SecurityMiddleware = require('../middlewares/security');

// Get rate limiter
const apiRateLimiter = SecurityMiddleware.getRateLimiter('api');

/**
 * Chat Settings API Routes
 * All routes require authentication
 */

// All routes require authentication
router.use(AuthenticationMiddleware.authenticate);

// Individual chat settings
router.get('/:chatId',
  apiRateLimiter,
  ValidationMiddleware.validateParams(ValidationMiddleware.commonSchemas.chatId),
  ChatSettingsController.getSettings
);

router.put('/:chatId',
  apiRateLimiter,
  ValidationMiddleware.validateParams(ValidationMiddleware.commonSchemas.chatId),
  ValidationMiddleware.validateBody('chatSettings'),
  ChatSettingsController.updateSettings
);

// Feature toggles
router.post('/:chatId/ai-mode',
  apiRateLimiter,
  ValidationMiddleware.validateParams(ValidationMiddleware.commonSchemas.chatId),
  ValidationMiddleware.validateBody('aiToggle'),
  ChatSettingsController.toggleAiMode
);

router.post('/:chatId/webhook',
  apiRateLimiter,
  ValidationMiddleware.validateParams(ValidationMiddleware.commonSchemas.chatId),
  ValidationMiddleware.validateBody('webhookToggle'),
  ChatSettingsController.toggleWebhook
);

// Custom settings
router.put('/:chatId/custom',
  apiRateLimiter,
  ValidationMiddleware.validateParams(ValidationMiddleware.commonSchemas.chatId),
  ValidationMiddleware.validateBody('customSettings'),
  ChatSettingsController.updateCustomSettings
);

// Bulk operations
router.post('/bulk-update',
  apiRateLimiter,
  ValidationMiddleware.validateBody('bulkUpdate'),
  ChatSettingsController.bulkUpdateSettings
);

// All settings management
router.get('/',
  apiRateLimiter,
  ValidationMiddleware.validateQuery('pagination'),
  ChatSettingsController.getAllSettings
);

// Filtered views
router.get('/ai-enabled',
  apiRateLimiter,
  ValidationMiddleware.validateQuery('pagination'),
  ChatSettingsController.getAiEnabledChats
);

router.get('/webhook-enabled',
  apiRateLimiter,
  ValidationMiddleware.validateQuery('pagination'),
  ChatSettingsController.getWebhookEnabledChats
);

// Settings management
router.delete('/:chatId',
  apiRateLimiter,
  ValidationMiddleware.validateParams(ValidationMiddleware.commonSchemas.chatId),
  ChatSettingsController.deleteSettings
);

router.post('/:chatId/clear-cache',
  apiRateLimiter,
  ValidationMiddleware.validateParams(ValidationMiddleware.commonSchemas.chatId),
  ChatSettingsController.clearCache
);

// Statistics and utilities
router.get('/stats',
  apiRateLimiter,
  ChatSettingsController.getStats
);

router.get('/recently-updated',
  apiRateLimiter,
  ValidationMiddleware.validateQuery('recentFilter'),
  ChatSettingsController.getRecentlyUpdated
);

// Validation
router.post('/validate',
  apiRateLimiter,
  ValidationMiddleware.validateBody('settingsValidation'),
  ChatSettingsController.validateSettings
);

// Reset to defaults
router.post('/:chatId/reset',
  apiRateLimiter,
  ValidationMiddleware.validateParams(ValidationMiddleware.commonSchemas.chatId),
  ChatSettingsController.resetToDefaults
);

module.exports = router;