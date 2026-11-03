'use strict';

const express = require('express');
const router = express.Router();
const { emailIngestionService } = require('../../modules/email-ingestion/emailIngestionService');
const { reviewRepository } = require('../../database/reviewRepository');
const { authenticate } = require('../middleware/authMiddleware');
const { requirePermission } = require('../middleware/rbacMiddleware');
const { auditRepository } = require('../../database/auditRepository');

router.get('/email/status', authenticate, requirePermission('reviews:read'), async (req, res) => {
  const stats = emailIngestionService.getStats();
  res.json({ success: true, stats });
});

router.get('/email/filtered', authenticate, requirePermission('reviews:read'), async (req, res, next) => {
  try {
    const { page = 1, limit = 20, supportFlag, search } = req.query;
    const result = await reviewRepository.findFilteredEmails({
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      supportFlag,
      search,
    });
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

router.get('/email/filtered/stats', authenticate, requirePermission('reviews:read'), async (req, res, next) => {
  try {
    const stats = await reviewRepository.getFilteredStats();
    res.json({ success: true, stats });
  } catch (err) {
    next(err);
  }
});

router.post('/email/trigger', authenticate, requirePermission('pipeline:trigger'), async (req, res, next) => {
  try {
    const result = await emailIngestionService.processAllPending();

    await auditRepository.log({
      userId: req.user.id,
      userEmail: req.user.email,
      action: 'EMAIL_INGESTION_MANUAL_TRIGGER',
      resource: 'email-ingestion',
      details: result,
      ipAddress: req.ip || '127.0.0.1',
    });

    res.json({ success: true, result });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
