'use strict';

const express = require('express');
const router = express.Router();
const { reviewCollector } = require('../../modules/playstore-reviews/reviewCollector');
const { authenticate } = require('../middleware/authMiddleware');
const { requirePermission } = require('../middleware/rbacMiddleware');
const { auditRepository } = require('../../database/auditRepository');

router.get('/playstore/status', authenticate, requirePermission('reviews:read'), async (req, res) => {
  const stats = reviewCollector.getStats();
  res.json({ success: true, stats });
});

router.post('/playstore/trigger', authenticate, requirePermission('pipeline:trigger'), async (req, res, next) => {
  try {
    const result = await reviewCollector.collect();

    await auditRepository.log({
      userId: req.user.id,
      userEmail: req.user.email,
      action: 'PLAYSTORE_MANUAL_TRIGGER',
      resource: 'playstore-reviews',
      details: result,
      ipAddress: req.ip || '127.0.0.1',
    });

    res.json({ success: true, result });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
