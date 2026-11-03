'use strict';

const express = require('express');
const router = express.Router();
const { notificationDispatcher } = require('../../jobs/notificationDispatcher');
const { reviewRepository } = require('../../database/reviewRepository');
const { authenticate } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/rbacMiddleware');
const { ROLES } = require('../../config/constants');

router.get('/stream', authenticate, (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  res.write(': ping\n\n');

  notificationDispatcher.registerSseClient(res);

  const pingInterval = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch (e) {
      clearInterval(pingInterval);
    }
  }, 30000);

  req.on('close', () => {
    clearInterval(pingInterval);
  });
});

router.post('/subscribe', authenticate, async (req, res, next) => {
  try {
    const { subscription, deviceLabel = 'Desktop' } = req.body;
    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ success: false, message: 'Invalid subscription object' });
    }

    await reviewRepository.saveNotificationSubscription(req.user.id, subscription, deviceLabel);
    res.json({ success: true, message: 'Notification subscription registered' });
  } catch (err) {
    next(err);
  }
});

router.post('/test', authenticate, requireRole([ROLES.ADMIN, ROLES.MANAGER]), async (req, res) => {
  const { title = 'Desktop Notification Test', body = 'Real-time alert delivery is operational.', priority = 'Normal' } = req.body;
  notificationDispatcher.broadcastAlert({
    title,
    body,
    priority,
    url: '/dashboard',
  });
  res.json({ success: true, message: 'Test notification broadcasted' });
});

module.exports = router;
