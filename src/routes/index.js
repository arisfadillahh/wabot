const express = require('express');
const router = express.Router();

// Import route modules
const sessionRoutes = require('./session.routes');
const whatsappRoutes = require('./whatsapp.routes');
const analyticsRoutes = require('./analytics.routes');
const chatSettingsRoutes = require('./chat-settings.routes');
const webhookRoutes = require('./webhook.routes');
const healthRoutes = require('./health.routes');

/**
 * Main API Router
 * Combines all route modules with versioning
 */

// API version info
router.get('/', (req, res) => {
  res.json({
    api: 'WhatsApp Dashboard Bot API',
    version: '2.0.0',
    description: 'Refactored MVC-based WhatsApp Bot API',
    endpoints: {
      sessions: '/api/v2/sessions',
      whatsapp: '/api/v2/whatsapp',
      analytics: '/api/v2/analytics',
      'chat-settings': '/api/v2/chat-settings',
      webhooks: '/api/v2/webhooks',
      health: '/api/v2/health'
    },
    timestamp: Date.now()
  });
});

// Mount route modules
router.use('/sessions', sessionRoutes);
router.use('/whatsapp', whatsappRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/chat-settings', chatSettingsRoutes);
router.use('/webhooks', webhookRoutes);
router.use('/health', healthRoutes);

// 404 handler for unknown API routes
router.use('*', (req, res) => {
  res.status(404).json({
    error: 'API endpoint not found',
    code: 'API_ENDPOINT_NOT_FOUND',
    path: req.originalUrl,
    method: req.method,
    timestamp: Date.now()
  });
});

module.exports = router;