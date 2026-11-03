'use strict';

const express = require('express');
const router = express.Router();
const { generateToken } = require('../../core/security');
const { ValidationError, AuthenticationError } = require('../../core/errors');
const { authenticate } = require('../middleware/authMiddleware');
const { authLimiter } = require('../middleware/rateLimitMiddleware');
const { writeAuditLog } = require('../../core/auditLog');
const { ROLE_PERMISSIONS } = require('../../config/constants');
const {
  authenticateServiceAccount,
  isServiceAccountConfigured,
  SERVICE_USER_ID,
} = require('../../core/serviceAccount');

router.post('/login', authLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      throw new ValidationError('Email and password are required');
    }

    if (!isServiceAccountConfigured()) {
      throw new AuthenticationError(
        'Enterprise API service credentials are not configured. Set ENTERPRISE_SERVICE_EMAIL and ENTERPRISE_SERVICE_PASSWORD.',
      );
    }

    const serviceUser = authenticateServiceAccount(email, password);
    if (!serviceUser) {
      throw new AuthenticationError('Invalid email or password');
    }

    const token = generateToken({
      id: SERVICE_USER_ID,
      email: serviceUser.email,
      role: serviceUser.role,
      name: serviceUser.name,
      serviceAccount: true,
    });

    await writeAuditLog(req, {
      action: 'SERVICE_LOGIN',
      resource: 'auth',
      details: { via: 'enterprise_service_account' },
    });

    res.json({
      success: true,
      token,
      user: {
        id: serviceUser.id,
        email: serviceUser.email,
        name: serviceUser.name,
        role: serviceUser.role,
        permissions: ROLE_PERMISSIONS[serviceUser.role] || [],
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/invite/accept', authLimiter, async (req, res) => {
  res.status(410).json({
    success: false,
    message:
      'Enterprise user invitations are disabled. Register and manage accounts in Teamwise (teamwisedb) only.',
  });
});

router.get('/me', authenticate, async (req, res, next) => {
  try {
    res.json({
      success: true,
      user: {
        id: req.user.id,
        email: req.user.email,
        name: req.user.name,
        role: req.user.role,
        status: req.user.status || 'ACTIVE',
        permissions: ROLE_PERMISSIONS[req.user.role] || [],
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
