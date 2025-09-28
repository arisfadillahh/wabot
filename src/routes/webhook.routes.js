const express = require('express');
const router = express.Router();
const WebhookController = require('../controllers/WebhookController');
const AuthenticationMiddleware = require('../middlewares/authentication');
const ValidationMiddleware = require('../middlewares/validation');
const SecurityMiddleware = require('../middlewares/security');

// Get rate limiters
const apiRateLimiter = SecurityMiddleware.getRateLimiter('api');
const webhookRateLimiter = SecurityMiddleware.getRateLimiter('webhook');

/**
 * Webhook Management API Routes
 * All routes require authentication
 */

// All routes require authentication
router.use(AuthenticationMiddleware.authenticate);

// Queue management
router.get('/queue',
  apiRateLimiter,
  ValidationMiddleware.validateQuery('pagination'),
  WebhookController.getQueue
);

router.get('/queue/:id',
  apiRateLimiter,
  ValidationMiddleware.validateParams(ValidationMiddleware.commonSchemas.id),
  WebhookController.getFailedWebhook
);

// Retry operations
router.post('/queue/:id/retry',
  webhookRateLimiter,
  ValidationMiddleware.validateParams(ValidationMiddleware.commonSchemas.id),
  WebhookController.retryWebhook
);

router.post('/bulk-retry',
  webhookRateLimiter,
  ValidationMiddleware.validateBody('bulkRetry'),
  WebhookController.bulkRetryWebhooks
);

router.post('/retry-all',
  webhookRateLimiter,
  WebhookController.retryAllWebhooks
);

// Queue processing
router.post('/process',
  webhookRateLimiter,
  ValidationMiddleware.validateBody('queueProcess'),
  WebhookController.processQueue
);

// Deletion operations
router.delete('/queue/:id',
  apiRateLimiter,
  ValidationMiddleware.validateParams(ValidationMiddleware.commonSchemas.id),
  WebhookController.deleteFailedWebhook
);

router.delete('/bulk-delete',
  apiRateLimiter,
  ValidationMiddleware.validateBody('bulkDelete'),
  WebhookController.bulkDeleteWebhooks
);

router.delete('/clear',
  apiRateLimiter,
  WebhookController.clearQueue
);

// Priority management
router.put('/queue/:id/priority',
  apiRateLimiter,
  ValidationMiddleware.validateParams(ValidationMiddleware.commonSchemas.id),
  ValidationMiddleware.validateBody('priorityUpdate'),
  WebhookController.updatePriority
);

// Statistics and monitoring
router.get('/stats',
  apiRateLimiter,
  WebhookController.getStats
);

router.get('/queue-status',
  apiRateLimiter,
  WebhookController.getQueueStatus
);

router.get('/retry-history/:id',
  apiRateLimiter,
  ValidationMiddleware.validateParams(ValidationMiddleware.commonSchemas.id),
  WebhookController.getRetryHistory
);

// Performance metrics
router.get('/performance-metrics',
  apiRateLimiter,
  WebhookController.getPerformanceMetrics
);

// Export functionality
router.get('/export',
  apiRateLimiter,
  ValidationMiddleware.validateQuery('exportFilters'),
  WebhookController.exportWebhooks
);

// Cleanup operations
router.post('/cleanup',
  apiRateLimiter,
  ValidationMiddleware.validateBody('cleanup'),
  WebhookController.cleanupOldWebhooks
);

// Testing
router.post('/test',
  apiRateLimiter,
  ValidationMiddleware.validateBody('webhookTest'),
  WebhookController.testWebhook
);

module.exports = router;