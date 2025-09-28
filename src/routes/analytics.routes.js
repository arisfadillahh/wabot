const express = require('express');
const router = express.Router();
const AnalyticsController = require('../controllers/AnalyticsController');
const AuthenticationMiddleware = require('../middlewares/authentication');
const ValidationMiddleware = require('../middlewares/validation');
const SecurityMiddleware = require('../middlewares/security');

// Get rate limiter
const apiRateLimiter = SecurityMiddleware.getRateLimiter('api');

/**
 * Analytics API Routes
 * All routes require authentication
 */

// All routes require authentication
router.use(AuthenticationMiddleware.authenticate);

// Overview and dashboard
router.get('/overview',
  apiRateLimiter,
  AnalyticsController.getOverview
);

router.get('/dashboard',
  apiRateLimiter,
  AnalyticsController.getDashboardData
);

// Message statistics
router.get('/message-stats',
  apiRateLimiter,
  AnalyticsController.getMessageStats
);

router.get('/daily-activity',
  apiRateLimiter,
  AnalyticsController.getDailyActivity
);

router.get('/performance-metrics',
  apiRateLimiter,
  AnalyticsController.getPerformanceMetrics
);

// Contact analytics
router.get('/top-contacts',
  apiRateLimiter,
  AnalyticsController.getTopContacts
);

// Message analysis
router.get('/message-types',
  apiRateLimiter,
  AnalyticsController.getMessageTypeDistribution
);

router.get('/hourly-patterns',
  apiRateLimiter,
  AnalyticsController.getHourlyPatterns
);

// Webhook analytics
router.get('/webhook-metrics',
  apiRateLimiter,
  AnalyticsController.getWebhookMetrics
);

// System health
router.get('/system-health',
  apiRateLimiter,
  AnalyticsController.getSystemHealth
);

// Custom reports
router.post('/custom-report',
  apiRateLimiter,
  ValidationMiddleware.validateBody('customReport'),
  AnalyticsController.getCustomReport
);

// Export functionality
router.get('/export',
  apiRateLimiter,
  ValidationMiddleware.validateQuery('exportFilters'),
  AnalyticsController.exportAnalytics
);

// Cache management
router.post('/clear-cache',
  apiRateLimiter,
  AnalyticsController.clearCache
);

module.exports = router;