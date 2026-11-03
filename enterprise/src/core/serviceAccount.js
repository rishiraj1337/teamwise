'use strict';

const env = require('../config/env');
const { ROLES } = require('../config/constants');

/** Synthetic user id for JWT when authenticating via env service credentials (no users table). */
const SERVICE_USER_ID = 0;

function getServiceAccountConfig() {
  return {
    id: SERVICE_USER_ID,
    email: String(env.ENTERPRISE_SERVICE_EMAIL || '').trim().toLowerCase(),
    password: String(env.ENTERPRISE_SERVICE_PASSWORD || ''),
    name: env.ENTERPRISE_SERVICE_NAME || 'Enterprise API Service',
    role: ROLES.ADMIN,
    status: 'ACTIVE',
  };
}

function isServiceAccountConfigured() {
  const cfg = getServiceAccountConfig();
  return Boolean(cfg.email && cfg.password);
}

function authenticateServiceAccount(email, password) {
  if (!isServiceAccountConfigured()) {
    return null;
  }
  const cfg = getServiceAccountConfig();
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (normalizedEmail !== cfg.email) {
    return null;
  }
  if (String(password || '') !== cfg.password) {
    return null;
  }
  return {
    id: cfg.id,
    email: cfg.email,
    name: cfg.name,
    role: cfg.role,
    status: cfg.status,
    serviceAccount: true,
  };
}

function resolveUserFromToken(decoded) {
  if (!decoded || typeof decoded !== 'object') {
    return null;
  }
  const cfg = getServiceAccountConfig();
  if (decoded.id === SERVICE_USER_ID || decoded.serviceAccount === true) {
    if (decoded.email && String(decoded.email).toLowerCase() !== cfg.email) {
      return null;
    }
    return {
      id: SERVICE_USER_ID,
      email: cfg.email,
      name: decoded.name || cfg.name,
      role: decoded.role || cfg.role,
      status: 'ACTIVE',
      serviceAccount: true,
    };
  }
  return null;
}

module.exports = {
  SERVICE_USER_ID,
  getServiceAccountConfig,
  isServiceAccountConfigured,
  authenticateServiceAccount,
  resolveUserFromToken,
};
