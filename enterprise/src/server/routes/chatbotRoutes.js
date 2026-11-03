'use strict';

const express = require('express');
const router = express.Router();
const { chatbotPollingService } = require('../../modules/chatbot-polling/chatbotPollingService');
const { chatbotRepository } = require('../../database/chatbotRepository');
const { authenticate } = require('../middleware/authMiddleware');
const { requirePermission } = require('../middleware/rbacMiddleware');
const { auditRepository } = require('../../database/auditRepository');

router.use(authenticate);

// Get paginated chatbot complaints/tickets
router.get('/tickets', requirePermission('reviews:read'), async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 20,
      txnType,
      status,
      categoryName,
      search,
      fromDate,
      toDate,
    } = req.query;

    const safePage = Math.max(1, parseInt(page, 10) || 1);
    const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

    const data = await chatbotRepository.findSessions({
      page: safePage,
      limit: safeLimit,
      txnType,
      status: status !== undefined && status !== '' ? parseInt(status, 10) : null,
      categoryName,
      search,
      fromDate,
      toDate,
    });

    res.json({ success: true, ...data });
  } catch (err) {
    next(err);
  }
});

// Get single ticket details with full chat transcript and txn details
router.get('/tickets/:id', requirePermission('reviews:read'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const ticket = await chatbotRepository.getSessionById(id);
    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Chatbot ticket session not found' });
    }
    res.json({ success: true, ticket });
  } catch (err) {
    next(err);
  }
});

// Get active categories list
router.get('/categories', requirePermission('reviews:read'), async (req, res, next) => {
  try {
    let categories = await chatbotRepository.getCategories();
    if (categories.length === 0) {
      categories = await chatbotPollingService.pollCategories();
    }
    res.json({ success: true, categories });
  } catch (err) {
    next(err);
  }
});

// Chatbot summary stats
router.get('/stats', requirePermission('reviews:read'), async (req, res, next) => {
  try {
    const stats = await chatbotRepository.getSummaryStats();
    res.json({ success: true, stats });
  } catch (err) {
    next(err);
  }
});

// Polling status
router.get('/status', requirePermission('reviews:read'), async (req, res) => {
  const stats = chatbotPollingService.getStats();
  res.json({ success: true, stats });
});

// Manual poll trigger
router.post('/poll', requirePermission('pipeline:trigger'), async (req, res, next) => {
  try {
    const result = await chatbotPollingService.pollFeedback(req.body || {});

    await auditRepository.log({
      userId: req.user.id,
      userEmail: req.user.email,
      action: 'CHATBOT_POLL_MANUAL_TRIGGER',
      resource: 'chatbot-polling',
      details: result,
      ipAddress: req.ip || '127.0.0.1',
    });

    res.json({ success: true, result });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
