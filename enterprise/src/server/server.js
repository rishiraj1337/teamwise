'use strict';

const path = require('path');
const express = require('express');
const logger = require('../core/logger');
const { AppError } = require('../core/errors');
const { generalApiLimiter } = require('./middleware/rateLimitMiddleware');

const authRoutes = require('./routes/authRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const ingestionRoutes = require('./routes/ingestionRoutes');
const playstoreRoutes = require('./routes/playstoreRoutes');
const chatbotRoutes = require('./routes/chatbotRoutes');
const adminRoutes = require('./routes/adminRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const reviewConfigRoutes = require('./routes/reviewConfigRoutes');

function createServer() {
  const app = express();

  // Comprehensive security headers
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'");
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (process.env.NODE_ENV === 'production') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  });

  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ extended: true, limit: '5mb' }));

  // Static web assets for Minimal UI
  const publicDir = path.resolve(__dirname, 'public');
  app.use(express.static(publicDir));

  // Health check endpoint
  app.get(['/health', '/api/health'], (req, res) => {
    res.json({
      status: 'UP',
      service: 'enterprise-backend',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  // Apply general API rate limiting to all /api routes
  app.use('/api', generalApiLimiter);

  // REST API Routes
  app.use('/api/auth', authRoutes);
  app.use('/api/reviews', reviewRoutes);
  app.use('/api/ingestion', ingestionRoutes);
  app.use('/api/ingestion', playstoreRoutes);
  app.use('/api/chatbot', chatbotRoutes);
  app.use('/api/ingestion/chatbot', chatbotRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/admin/review-config', reviewConfigRoutes);
  app.use('/api/notifications', notificationRoutes);

  // Serve UI for all non-API GET requests
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) {
      return next();
    }
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  // Centralized Error Handling Middleware
  app.use((err, req, res, next) => {
    const statusCode = err.statusCode || (err instanceof AppError ? err.statusCode : 500);
    const code = err.code || 'INTERNAL_SERVER_ERROR';

    if (statusCode >= 500) {
      logger.error({ error: err.message, stack: err.stack, path: req.path }, 'Unhandled server error');
    } else {
      logger.warn({ error: err.message, code, path: req.path, status: statusCode }, 'Client request rejected');
    }

    res.status(statusCode).json({
      success: false,
      code,
      message: err.message || 'An internal error occurred',
      details: err.details || null,
    });
  });

  return app;
}

module.exports = {
  createServer,
};
