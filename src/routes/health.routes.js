const express = require('express');
const router = express.Router();
const HealthController = require('../controllers/HealthController');
const AuthenticationMiddleware = require('../middlewares/authentication');
const ValidationMiddleware = require('../middlewares/validation');
const SecurityMiddleware = require('../middlewares/security');

// Get rate limiter
const apiRateLimiter = SecurityMiddleware.getRateLimiter('api');

/**
 * Health Monitoring API Routes
 * Some routes are public (for monitoring), others require authentication
 */

// Public health checks (for monitoring systems)
router.get('/basic',
  HealthController.basicHealth
);

router.get('/load-balancer',
  HealthController.loadBalancerHealth
);

// Protected health routes (require authentication)
router.use(AuthenticationMiddleware.authenticate);

// Detailed health checks
router.get('/detailed',
  apiRateLimiter,
  HealthController.detailedHealth
);

router.get('/component/:component',
  apiRateLimiter,
  HealthController.componentHealth
);

// Metrics and monitoring
router.get('/metrics',
  apiRateLimiter,
  HealthController.getMetrics
);

router.get('/performance-metrics',
  apiRateLimiter,
  HealthController.getPerformanceMetrics
);

router.get('/system-info',
  apiRateLimiter,
  HealthController.getSystemInfo
);

// Health history
router.get('/history',
  apiRateLimiter,
  ValidationMiddleware.validateQuery('healthHistory'),
  HealthController.getHistory
);

// Manual health checks
router.post('/trigger',
  apiRateLimiter,
  ValidationMiddleware.validateBody('healthTrigger'),
  HealthController.triggerCheck
);

// Health alerts
router.get('/alerts',
  apiRateLimiter,
  ValidationMiddleware.validateQuery('alertFilter'),
  HealthController.getAlerts
);

router.post('/alerts/:alertId/acknowledge',
  apiRateLimiter,
  ValidationMiddleware.validateParams(ValidationMiddleware.commonSchemas.id),
  ValidationMiddleware.validateBody('alertAcknowledge'),
  HealthController.acknowledgeAlert
);

// Dashboard and overview
router.get('/dashboard',
  apiRateLimiter,
  HealthController.getDashboard
);

router.get('/dependencies',
  apiRateLimiter,
  HealthController.getDependencyHealth
);

// Diagnostics
router.post('/diagnostics',
  apiRateLimiter,
  ValidationMiddleware.validateBody('diagnostics'),
  HealthController.runDiagnostics
);

// Configuration
router.get('/config',
  apiRateLimiter,
  HealthController.getConfig
);

router.put('/config',
  apiRateLimiter,
  ValidationMiddleware.validateBody('healthConfig'),
  HealthController.updateConfig
);

// Cache management
router.post('/clear-cache',
  apiRateLimiter,
  HealthController.clearCache
);

module.exports = router;