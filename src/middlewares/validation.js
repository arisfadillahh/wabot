const Joi = require('joi');
const logger = require('../config/logger');

class ValidationMiddleware {
  constructor() {
    this.schemas = this.initializeSchemas();
  }

  /**
   * Initialize all validation schemas
   */
  initializeSchemas() {
    return {
      // Message schemas
      sendMessage: Joi.object({
        to: Joi.string().min(5).required()
          .pattern(/^[0-9]+@c\.us$|^[0-9]+@g\.us$/)
          .messages({
            'string.pattern.base': 'Invalid WhatsApp chat ID format',
            'string.empty': 'Chat ID is required',
            'any.required': 'Chat ID is required'
          }),
        message: Joi.string().min(1).max(4096).required()
          .messages({
            'string.empty': 'Message cannot be empty',
            'string.max': 'Message must be less than 4096 characters',
            'any.required': 'Message is required'
          })
      }),

      sendDashboardMessage: Joi.object({
        chatId: Joi.string().min(5).required()
          .pattern(/^[0-9]+@c\.us$|^[0-9]+@g\.us$/)
          .messages({
            'string.pattern.base': 'Invalid WhatsApp chat ID format',
            'string.empty': 'Chat ID is required',
            'any.required': 'Chat ID is required'
          }),
        message: Joi.string().min(1).max(4096).required()
          .messages({
            'string.empty': 'Message cannot be empty',
            'string.max': 'Message must be less than 4096 characters',
            'any.required': 'Message is required'
          })
      }),

      // Login schema
      login: Joi.object({
        apiKey: Joi.string().min(1).required()
          .messages({
            'string.empty': 'API key cannot be empty',
            'any.required': 'API key is required'
          })
      }),

      // Typing schema
      typing: Joi.object({
        to: Joi.string().min(5).required()
          .pattern(/^[0-9]+@c\.us$|^[0-9]+@g\.us$/)
          .messages({
            'string.pattern.base': 'Invalid WhatsApp chat ID format',
            'string.empty': 'Chat ID is required',
            'any.required': 'Chat ID is required'
          })
      }),

      // Chat settings schema
      chatSettings: Joi.object({
        aiMode: Joi.boolean().required()
          .messages({
            'boolean.base': 'AI mode must be a boolean',
            'any.required': 'AI mode is required'
          })
      }),

      // AI reply schema
      aiReply: Joi.object({
        chatId: Joi.string().min(5).required()
          .pattern(/^[0-9]+@c\.us$|^[0-9]+@g\.us$/)
          .messages({
            'string.pattern.base': 'Invalid WhatsApp chat ID format',
            'string.empty': 'Chat ID is required',
            'any.required': 'Chat ID is required'
          }),
        message: Joi.string().min(1).max(4096).required()
          .messages({
            'string.empty': 'Message cannot be empty',
            'string.max': 'Message must be less than 4096 characters',
            'any.required': 'Message is required'
          }),
        originalMessageId: Joi.string().optional()
      }),

      // Query parameters
      pagination: Joi.object({
        page: Joi.number().integer().min(1).default(1)
          .messages({
            'number.base': 'Page must be a number',
            'number.min': 'Page must be at least 1'
          }),
        limit: Joi.number().integer().min(1).max(200).default(50)
          .messages({
            'number.base': 'Limit must be a number',
            'number.min': 'Limit must be at least 1',
            'number.max': 'Limit must be at most 200'
          })
      }),

      // Date range
      dateRange: Joi.object({
        startDate: Joi.date().iso().optional()
          .messages({
            'date.format': 'Start date must be a valid ISO date'
          }),
        endDate: Joi.date().iso().min(Joi.ref('startDate')).optional()
          .messages({
            'date.format': 'End date must be a valid ISO date',
            'date.min': 'End date must be after start date'
          })
      }),

      // Webhook test
      webhookTest: Joi.object({
        url: Joi.string().uri().required()
          .messages({
            'string.uri': 'URL must be a valid URI',
            'string.empty': 'URL is required',
            'any.required': 'URL is required'
          }),
        timeout: Joi.number().integer().min(1000).max(60000).optional()
          .messages({
            'number.base': 'Timeout must be a number',
            'number.min': 'Timeout must be at least 1000ms',
            'number.max': 'Timeout must be at most 60000ms'
          })
      }),

      // Export filters
      exportFilters: Joi.object({
        chatId: Joi.string().optional(),
        messageId: Joi.string().optional(),
        type: Joi.string().optional(),
        startDate: Joi.date().iso().optional(),
        endDate: Joi.date().iso().optional(),
        limit: Joi.number().integer().min(1).max(10000).optional(),
        format: Joi.string().valid('json', 'csv').default('json')
          .messages({
            'any.only': 'Format must be either json or csv'
          })
      }),

      // Health check
      healthCheck: Joi.object({
        timeout: Joi.number().integer().min(1000).max(30000).optional()
          .messages({
            'number.base': 'Timeout must be a number',
            'number.min': 'Timeout must be at least 1000ms',
            'number.max': 'Timeout must be at most 30000ms'
          })
      })
    };
  }

  /**
   * Validate request body against schema
   */
  validateBody = (schemaName) => {
    return (req, res, next) => {
      try {
        const schema = this.schemas[schemaName];
        if (!schema) {
          logger.error('Validation schema not found', { schemaName });
          return res.status(500).json({
            error: 'Validation error',
            code: 'SCHEMA_NOT_FOUND',
            details: 'Validation schema not found'
          });
        }

        const { error, value } = schema.validate(req.body, {
          abortEarly: false,
          stripUnknown: true,
          convert: true
        });

        if (error) {
          const validationError = this.formatValidationError(error);

          logger.warn('Validation failed', {
            schemaName,
            errors: validationError.details,
            ip: req.ip,
            path: req.path
          });

          return res.status(400).json(validationError);
        }

        // Replace request body with validated and cleaned data
        req.body = value;
        req.validatedBody = value;

        logger.debug('Validation passed', {
          schemaName,
          ip: req.ip,
          path: req.path
        });

        next();
      } catch (err) {
        logger.error('Validation middleware error', { error: err.message });
        res.status(500).json({
          error: 'Validation error',
          code: 'VALIDATION_ERROR',
          details: 'An error occurred during validation'
        });
      }
    };
  };

  /**
   * Validate request query parameters
   */
  validateQuery = (schemaName) => {
    return (req, res, next) => {
      try {
        const schema = this.schemas[schemaName];
        if (!schema) {
          logger.error('Validation schema not found', { schemaName });
          return res.status(500).json({
            error: 'Validation error',
            code: 'SCHEMA_NOT_FOUND',
            details: 'Validation schema not found'
          });
        }

        const { error, value } = schema.validate(req.query, {
          abortEarly: false,
          stripUnknown: true,
          convert: true
        });

        if (error) {
          const validationError = this.formatValidationError(error);

          logger.warn('Query validation failed', {
            schemaName,
            errors: validationError.details,
            ip: req.ip,
            path: req.path
          });

          return res.status(400).json(validationError);
        }

        // Replace request query with validated and cleaned data
        req.query = value;
        req.validatedQuery = value;

        logger.debug('Query validation passed', {
          schemaName,
          ip: req.ip,
          path: req.path
        });

        next();
      } catch (err) {
        logger.error('Query validation middleware error', { error: err.message });
        res.status(500).json({
          error: 'Validation error',
          code: 'VALIDATION_ERROR',
          details: 'An error occurred during query validation'
        });
      }
    };
  };

  /**
   * Validate request parameters
   */
  validateParams = (schema) => {
    return (req, res, next) => {
      try {
        const { error, value } = schema.validate(req.params, {
          abortEarly: false,
          stripUnknown: true,
          convert: true
        });

        if (error) {
          const validationError = this.formatValidationError(error);

          logger.warn('Params validation failed', {
            errors: validationError.details,
            ip: req.ip,
            path: req.path
          });

          return res.status(400).json(validationError);
        }

        // Replace request params with validated and cleaned data
        req.params = value;
        req.validatedParams = value;

        logger.debug('Params validation passed', {
          ip: req.ip,
          path: req.path
        });

        next();
      } catch (err) {
        logger.error('Params validation middleware error', { error: err.message });
        res.status(500).json({
          error: 'Validation error',
          code: 'VALIDATION_ERROR',
          details: 'An error occurred during parameter validation'
        });
      }
    };
  };

  /**
   * Format validation error for response
   */
  formatValidationError(error) {
    const details = error.details.map(detail => ({
      field: detail.path.join('.'),
      message: detail.message,
      type: detail.type,
      value: detail.value
    }));

    return {
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details,
      fields: details.map(d => d.field)
    };
  }

  /**
   * Common parameter schemas
   */
  get commonSchemas() {
    return {
      chatId: Joi.object({
        chatId: Joi.string().min(5).required()
          .pattern(/^[0-9]+@c\.us$|^[0-9]+@g\.us$/)
          .messages({
            'string.pattern.base': 'Invalid WhatsApp chat ID format',
            'string.empty': 'Chat ID is required',
            'any.required': 'Chat ID is required'
          })
      }),

      messageId: Joi.object({
        messageId: Joi.string().min(1).required()
          .messages({
            'string.empty': 'Message ID is required',
            'any.required': 'Message ID is required'
          })
      }),

      id: Joi.object({
        id: Joi.number().integer().min(1).required()
          .messages({
            'number.base': 'ID must be a number',
            'number.min': 'ID must be at least 1',
            'any.required': 'ID is required'
          })
      })
    };
  }

  /**
   * Custom validation middleware for complex scenarios
   */
  custom = (validator) => {
    return async (req, res, next) => {
      try {
        const result = await validator(req);
        if (result.error) {
          logger.warn('Custom validation failed', {
            error: result.error,
            ip: req.ip,
            path: req.path
          });

          return res.status(400).json({
            error: 'Validation failed',
            code: 'VALIDATION_ERROR',
            details: result.error
          });
        }

        // Add validation result to request
        if (result.data) {
          req.customValidation = result.data;
        }

        next();
      } catch (err) {
        logger.error('Custom validation middleware error', { error: err.message });
        res.status(500).json({
          error: 'Validation error',
          code: 'VALIDATION_ERROR',
          details: 'An error occurred during custom validation'
        });
      }
    };
  };

  /**
   * Validate WhatsApp readiness
   */
  requireWhatsAppReady = (req, res, next) => {
    try {
      const { isReady } = require('../services/WhatsAppService').getStatus();

      if (!isReady) {
        logger.warn('WhatsApp not ready for request', {
          ip: req.ip,
          path: req.path,
          method: req.method
        });

        return res.status(503).json({
          error: 'WhatsApp client not ready',
          code: 'WHATSAPP_NOT_READY',
          details: 'WhatsApp client is not connected. Please scan QR code to connect.'
        });
      }

      next();
    } catch (error) {
      logger.error('WhatsApp readiness check error', { error: error.message });
      res.status(503).json({
        error: 'WhatsApp client error',
        code: 'WHATSAPP_ERROR',
        details: 'An error occurred while checking WhatsApp client status'
      });
    }
  };

  /**
   * Sanitize input text
   */
  sanitizeText = (text) => {
    if (typeof text !== 'string') return text;

    return text
      .replace(/[<>]/g, '') // Remove potential HTML tags
      .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
      .trim();
  };

  /**
   * Validate and sanitize HTML content
   */
  sanitizeHTML = (html) => {
    if (typeof html !== 'string') return html;

    // Basic HTML sanitization
    return html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, '');
  };
}

module.exports = new ValidationMiddleware();