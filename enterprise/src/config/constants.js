'use strict';

const {
  DEFAULT_CATEGORIES,
  DEFAULT_SUBCATEGORIES,
  DEFAULT_PRIORITIES,
  DEFAULT_STATUSES,
} = require('../database/taxonomyRepository');

const ROLES = Object.freeze({
  ADMIN: 'ADMIN',
  MANAGER: 'MANAGER',
  ANALYST: 'ANALYST',
  VIEWER: 'VIEWER',
});

const ROLE_PERMISSIONS = Object.freeze({
  ADMIN: [
    'reviews:read',
    'reviews:write',
    'reviews:export',
    'settings:read',
    'settings:write',
    'users:read',
    'users:invite',
    'users:manage_rbac',
    'audit:read',
    'pipeline:trigger',
  ],
  MANAGER: [
    'reviews:read',
    'reviews:write',
    'reviews:export',
    'settings:read',
    'users:read',
    'audit:read',
    'pipeline:trigger',
  ],
  ANALYST: [
    'reviews:read',
    'reviews:export',
    'settings:read',
  ],
  VIEWER: [
    'reviews:read',
  ],
});

const PRIORITY_LEVELS = Object.freeze([...DEFAULT_PRIORITIES]);
const STATUS_OPTIONS = Object.freeze([...DEFAULT_STATUSES]);

module.exports = {
  ROLES,
  ROLE_PERMISSIONS,
  DEFAULT_CATEGORIES,
  DEFAULT_SUBCATEGORIES,
  PRIORITY_LEVELS,
  STATUS_OPTIONS,
};
