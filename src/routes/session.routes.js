const express = require('express');
const router = express.Router();
const SessionController = require('../controllers/SessionController');
const AuthenticationMiddleware = require('../middlewares/authentication');
const ValidationMiddleware = require('../middlewares/validation');
const SecurityMiddleware = require('../middlewares/security');

// Get rate limiter
const rateLimiter = SecurityMiddleware.getRateLimiter('auth');

/**
 * Session Management Routes
 * All routes require authentication
 */

// Public routes (no auth required)
router.post('/login',
  rateLimiter,
  ValidationMiddleware.validateBody('login'),
  SessionController.login
);

router.post('/validate',
  ValidationMiddleware.validateBody('session'),
  SessionController.validateSession
);

// Protected routes (require authentication)
router.use(AuthenticationMiddleware.authenticate);

// Session management
router.post('/extend',
  ValidationMiddleware.validateBody('session'),
  SessionController.extendSession
);

router.post('/logout',
  SessionController.logout
);

router.get('/info',
  SessionController.getSessionInfo
);

// Session administration
router.get('/stats',
  SessionController.getSessionStats
);

router.get('/active',
  ValidationMiddleware.validateQuery('pagination'),
  SessionController.getActiveSessions
);

router.post('/invalidate-all',
  SessionController.invalidateAllSessions
);

router.post('/cleanup',
  SessionController.cleanupSessions
);

// Health check
router.get('/health',
  SessionController.sessionHealth
);

module.exports = router;